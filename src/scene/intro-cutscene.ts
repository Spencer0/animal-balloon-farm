import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import {
  BROADCAST_BANNER,
  INTRO_DURATION,
  TV_SCREEN_CENTER,
  introFrameAt,
  type ClipState,
  type IntroFrame,
  type IntroSet,
} from '../game/intro-script'
import { createUILayer, type UILayer } from '../ui/ui-layer'
import { createIntroCaptions, type IntroCaptions } from '../ui/intro-captions'
import { createIntroAudio } from './intro-audio'

/**
 * The new-farm intro cutscene: a perspective, post-processed little film
 * played in its own scene before the farm takes over.
 *
 * What happens when is decided by `game/intro-script.ts`; this file only stages
 * it. Every frame is rebuilt from `introFrameAt(t)`, so seeking, skipping and
 * dropped frames are all the same operation.
 *
 * Two pictures are rendered per frame in the living room: the president's
 * studio into a render target, which the TV shows through a CRT shader, and the
 * room itself through a depth-of-field, bloom and film-grade chain. The farm's
 * own scene, camera and HUD are untouched and simply not drawn while this runs.
 */

export interface IntroCutscene {
  /** Seconds into the film. */
  readonly time: number
  readonly duration: number
  readonly loaded: boolean
  readonly done: boolean
  /** Resolves once every model is in and the shaders are compiled. */
  load(): Promise<void>
  update(delta: number): void
  render(): void
  seek(seconds: number): void
  /** Hold the film on its current frame (debug harness screenshots). */
  setPaused(paused: boolean): void
  /** Jump to the last frame; the caller then hands over to the farm. */
  skip(): void
  /** Show the "press again to skip" hint. */
  flashSkipHint(): void
  /** Let the soundtrack start; browsers hold audio until a key or click. */
  resumeAudio(): void
  resize(cssWidth: number, cssHeight: number): void
  /** For the debug harness. */
  describe(): { time: number; shot: string; set: IntroSet; caption: string | null }
  /** The live scenes, for poking at from the debug harness console. */
  readonly scenes: { readonly film: THREE.Scene; readonly studio: THREE.Scene }
  dispose(): void
}

const ASSETS = {
  boy: 'assets/cutscenes/intro-boy.glb',
  president: 'assets/cutscenes/intro-president.glb',
  studio: 'assets/cutscenes/intro-studio.glb',
  room: 'assets/cutscenes/intro-room.glb',
  exterior: 'assets/cutscenes/intro-exterior.glb',
  kit: 'assets/cutscenes/intro-kit.glb',
} as const

interface Actor {
  readonly root: THREE.Object3D
  readonly mixer: THREE.AnimationMixer
  readonly actions: Map<string, THREE.AnimationAction>
}

function makeActor(gltf: GLTF): Actor {
  const mixer = new THREE.AnimationMixer(gltf.scene)
  const actions = new Map<string, THREE.AnimationAction>()
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip)
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.play()
    action.setEffectiveWeight(0)
    actions.set(clip.name, action)
  }
  return { root: gltf.scene, mixer, actions }
}

/**
 * Pose an actor from clip states. Times are set directly rather than advanced,
 * which is what makes the cutscene seekable.
 */
function poseActor(actor: Actor, states: readonly ClipState[]): void {
  for (const action of actor.actions.values()) action.setEffectiveWeight(0)
  for (const state of states) {
    const action = actor.actions.get(state.clip)
    if (!action) continue
    const duration = action.getClip().duration
    action.time = state.loop ? state.time % duration : Math.min(state.time, Math.max(0, duration - 1e-4))
    action.setEffectiveWeight(state.weight)
  }
  actor.mixer.update(0)
}

function prepareShadows(root: THREE.Object3D, cast = true): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = cast
      object.receiveShadow = true
    }
  })
}

// ------------------------------------------------------------------ shaders --

const CRT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const CRT_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float time;
  uniform float staticAmount;
  uniform float brightness;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    // glTF UVs run top-down; the render target runs bottom-up.
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 centred = uv - 0.5;
    uv = 0.5 + centred * (1.0 + 0.09 * dot(centred, centred));
    float shift = 0.0016 + 0.0008 * sin(time * 3.0);
    vec3 colour = vec3(
      texture2D(map, uv + vec2(shift, 0.0)).r,
      texture2D(map, uv).g,
      texture2D(map, uv - vec2(shift, 0.0)).b
    );
    float scan = 0.8 + 0.2 * sin(uv.y * 900.0);
    float rolling = 0.94 + 0.06 * sin(uv.y * 6.0 - time * 2.4);
    float mask = 0.9 + 0.1 * sin(uv.x * 1500.0);
    colour *= scan * rolling * mask;
    float noise = hash(floor(uv * vec2(320.0, 240.0)) + floor(time * 30.0));
    colour = mix(colour, vec3(noise * 0.9), staticAmount);
    colour += noise * 0.025;
    float edge = smoothstep(0.62, 0.34, length(centred * vec2(1.0, 1.15)));
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) colour = vec3(0.0);
    gl_FragColor = vec4(colour * edge * brightness, 1.0);
  }
`

const GRADE_SHADER = {
  name: 'IntroGradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    aspect: { value: 16 / 9 },
    letterbox: { value: 0 },
    fadeBlack: { value: 1 },
    fadeWhite: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float aspect;
    uniform float letterbox;
    uniform float fadeBlack;
    uniform float fadeWhite;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 centred = vUv - 0.5;
      vec2 offset = centred * 0.0028;
      vec3 colour = vec3(
        texture2D(tDiffuse, vUv + offset).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - offset).b
      );
      // A warm storybook lift in the shadows and a soft lens vignette.
      colour = mix(colour, colour * vec3(1.03, 1.0, 0.95) + vec3(0.012, 0.006, 0.0), 0.8);
      float vignette = smoothstep(1.0, 0.28, length(centred * vec2(aspect * 0.72, 1.0)));
      colour *= mix(0.7, 1.0, vignette);
      colour += (hash(vUv * vec2(1280.0, 720.0) + fract(time * 7.3)) - 0.5) * 0.03;
      colour = mix(colour, vec3(0.0), fadeBlack);
      if (vUv.y < letterbox || vUv.y > 1.0 - letterbox) colour = vec3(0.0);
      colour = mix(colour, vec3(1.0, 0.985, 0.95), fadeWhite);
      gl_FragColor = vec4(colour, 1.0);
    }
  `,
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 horizon;
  uniform vec3 zenith;
  uniform vec3 sunColour;
  uniform vec3 sunDirection;
  varying vec3 vDirection;
  void main() {
    float height = clamp(vDirection.y, 0.0, 1.0);
    vec3 colour = mix(horizon, zenith, pow(height, 0.55));
    float sun = max(dot(normalize(vDirection), sunDirection), 0.0);
    colour += sunColour * (pow(sun, 380.0) * 6.0 + pow(sun, 12.0) * 0.35);
    gl_FragColor = vec4(colour, 1.0);
  }
`

// -------------------------------------------------------------- broadcast --

function drawBanner(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 160
  const context = canvas.getContext('2d')!
  const badgeWidth = 220
  context.fillStyle = 'rgba(16, 28, 78, 0.92)'
  context.fillRect(badgeWidth, 30, 1024 - badgeWidth, 84)
  context.fillStyle = '#e8394a'
  context.fillRect(0, 30, badgeWidth, 84)
  context.fillStyle = '#f4d58a'
  context.fillRect(badgeWidth, 110, 1024 - badgeWidth, 6)
  context.fillStyle = '#ffffff'
  context.textBaseline = 'middle'
  context.textAlign = 'center'
  context.font = 'bold 32px Arial, Helvetica, sans-serif'
  context.fillText(BROADCAST_BANNER.badge, badgeWidth / 2, 73, badgeWidth - 24)
  context.textAlign = 'left'
  context.font = 'bold 42px Georgia, "Times New Roman", serif'
  context.fillText(BROADCAST_BANNER.title, badgeWidth + 26, 74, 1024 - badgeWidth - 40)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function drawTicker(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.fillStyle = '#f4d58a'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#16204e'
  context.font = 'bold 34px Arial, Helvetica, sans-serif'
  context.textBaseline = 'middle'
  const text = BROADCAST_BANNER.ticker
  const width = context.measureText(text).width
  for (let x = 0; x < canvas.width; x += width) context.fillText(text, x, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.set(0.42, 1)
  return texture
}

// ------------------------------------------------------------------- create --

export function createIntroCutscene(renderer: THREE.WebGLRenderer, cssWidth: number, cssHeight: number): IntroCutscene {
  let time = 0
  let paused = false
  let loaded = false
  let disposed = false
  let lastFrame: IntroFrame = introFrameAt(0)

  const scene = new THREE.Scene()
  scene.name = 'Intro cutscene'
  const camera = new THREE.PerspectiveCamera(40, cssWidth / Math.max(1, cssHeight), 0.05, 220)
  camera.name = 'Intro cinematic camera'

  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  const environment = pmrem.fromScene(roomEnvironment, 0.04).texture
  roomEnvironment.dispose()
  scene.environment = environment

  // ----- the living room, at night.
  const roomSet = new THREE.Group()
  roomSet.name = 'Intro living room'
  const roomFill = new THREE.HemisphereLight('#7684c0', '#3b2a22', 0.55)
  const lampLight = new THREE.PointLight('#ffbf73', 5.5, 7, 1.6)
  lampLight.position.set(1.85, 1.45, -1.65)
  lampLight.castShadow = true
  lampLight.shadow.mapSize.set(1024, 1024)
  lampLight.shadow.bias = -0.002
  lampLight.shadow.radius = 4
  const tvLight = new THREE.PointLight('#9cc2ff', 3, 5, 1.4)
  tvLight.position.set(TV_SCREEN_CENTER[0], TV_SCREEN_CENTER[1], TV_SCREEN_CENTER[2] + 0.45)
  const moonLight = new THREE.DirectionalLight('#8aa2e8', 0.7)
  moonLight.position.set(6, 4, -0.5)
  roomSet.add(roomFill, lampLight, tvLight, moonLight)
  scene.add(roomSet)

  // ----- the cottage garden, in the morning.
  const exteriorSet = new THREE.Group()
  exteriorSet.name = 'Intro cottage garden'
  const sunDirection = new THREE.Vector3(-0.45, 0.62, 0.64).normalize()
  const sun = new THREE.DirectionalLight('#fff0d2', 2.1)
  sun.position.copy(sunDirection).multiplyScalar(14)
  sun.target.position.set(0.4, 0, 0.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -7
  sun.shadow.camera.right = 7
  sun.shadow.camera.top = 7
  sun.shadow.camera.bottom = -7
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 40
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 3
  const skyFill = new THREE.HemisphereLight('#d7ebff', '#6e9a4c', 0.55)
  const skyMaterial = new THREE.ShaderMaterial({
    name: 'Intro morning sky',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizon: { value: new THREE.Color('#f6dcb4') },
      zenith: { value: new THREE.Color('#6fa8e0') },
      sunColour: { value: new THREE.Color('#fff2d0') },
      sunDirection: { value: sunDirection },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), skyMaterial)
  sky.name = 'Intro sky dome'
  exteriorSet.add(sun, sun.target, skyFill, sky)
  scene.add(exteriorSet)

  // ----- the TV studio, rendered into the television.
  const studioScene = new THREE.Scene()
  studioScene.name = 'Intro broadcast studio'
  studioScene.background = new THREE.Color('#0d1430')
  studioScene.environment = environment
  studioScene.environmentIntensity = 0.5
  const studioKey = new THREE.SpotLight('#fff1d8', 9, 12, Math.PI / 7, 0.55, 1.2)
  studioKey.position.set(1.4, 3.6, 3.4)
  studioKey.target.position.set(0, 1.3, 0)
  const studioFill = new THREE.DirectionalLight('#c9d9ff', 1.2)
  studioFill.position.set(-3, 2, 3)
  const studioRim = new THREE.DirectionalLight('#7f9bff', 2.2)
  studioRim.position.set(0, 3, -3)
  const studioAmbient = new THREE.HemisphereLight('#6d7fd0', '#1b1d33', 0.7)
  studioScene.add(studioKey, studioKey.target, studioFill, studioRim, studioAmbient)
  const broadcastCamera = new THREE.PerspectiveCamera(30, 4 / 3, 0.05, 40)
  broadcastCamera.name = 'Intro broadcast camera'
  studioScene.add(broadcastCamera)
  const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(15))
  const viewWidth = viewHeight * (4 / 3)
  const bannerTexture = drawBanner()
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(viewWidth * 0.78, viewWidth * 0.78 * (160 / 1024)),
    new THREE.MeshBasicMaterial({ map: bannerTexture, transparent: true, depthTest: false, depthWrite: false }),
  )
  banner.position.set(-viewWidth * 0.08, -viewHeight * 0.2, -1)
  banner.renderOrder = 10
  const tickerTexture = drawTicker()
  const ticker = new THREE.Mesh(
    new THREE.PlaneGeometry(viewWidth, viewHeight * 0.075),
    new THREE.MeshBasicMaterial({ map: tickerTexture, depthTest: false, depthWrite: false }),
  )
  ticker.position.set(0, -viewHeight * 0.3, -1)
  ticker.renderOrder = 10
  broadcastCamera.add(banner, ticker)
  const studioTarget = new THREE.WebGLRenderTarget(960, 720, { samples: 4, type: THREE.HalfFloatType })
  studioTarget.texture.name = 'Intro broadcast picture'
  const crtMaterial = new THREE.ShaderMaterial({
    name: 'Intro CRT screen',
    uniforms: {
      map: { value: studioTarget.texture },
      time: { value: 0 },
      staticAmount: { value: 1 },
      brightness: { value: 1.0 },
    },
    vertexShader: CRT_VERTEX,
    fragmentShader: CRT_FRAGMENT,
  })

  // ----- post: depth of field, bloom, tone map, then the film grade.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }))
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))
  const bokeh = new BokehPass(scene, camera, { focus: 2, aperture: 0.0016, maxblur: 0.007 })
  composer.addPass(bokeh)
  const bokehUniforms = bokeh.uniforms as Record<'focus' | 'aperture' | 'maxblur', THREE.IUniform<number>>
  const bloom = new UnrealBloomPass(new THREE.Vector2(cssWidth, cssHeight), 0.26, 0.5, 0.95)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const grade = new ShaderPass(GRADE_SHADER)
  composer.addPass(grade)

  const ui: UILayer = createUILayer()
  const captions: IntroCaptions = createIntroCaptions(ui.viewport)
  ui.add(captions)

  const audio = createIntroAudio()
  let boy: Actor | null = null
  let president: Actor | null = null
  let props: Actor | null = null
  let kit: Actor | null = null
  const kitBalloons: THREE.Object3D[] = []

  function resize(width: number, height: number): void {
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(width, height)
    grade.uniforms['aspect'].value = camera.aspect
    ui.resize(width, height)
  }
  resize(cssWidth, cssHeight)

  const roomBackground = new THREE.Color('#121424')
  const morningFog = new THREE.Fog('#efe2c8', 22, 95)
  function showSet(set: IntroSet): void {
    roomSet.visible = set === 'room'
    exteriorSet.visible = set === 'exterior'
    scene.background = set === 'room' ? roomBackground : null
    scene.fog = set === 'room' ? null : morningFog
    scene.environmentIntensity = set === 'room' ? 0.32 : 0.42
    // Only the lamp and the TV should glow at night; by day only true highlights.
    bloom.threshold = set === 'room' ? 0.9 : 1.5
  }

  const focusPoint = new THREE.Vector3()
  function apply(frame: IntroFrame): void {
    lastFrame = frame
    showSet(frame.set)
    camera.position.set(...frame.camera.position)
    camera.lookAt(...frame.camera.target)
    if (camera.fov !== frame.camera.fov) {
      camera.fov = frame.camera.fov
      camera.updateProjectionMatrix()
    }
    const focus = camera.position.distanceTo(focusPoint.set(...frame.camera.target))
    bokehUniforms.focus.value = focus
    // Close-ups get a shallower depth of field than the wide shots.
    bokehUniforms.aperture.value = THREE.MathUtils.clamp(0.0035 / Math.max(0.4, focus), 0.0004, 0.004)
    broadcastCamera.position.set(...frame.broadcast.position)
    broadcastCamera.lookAt(...frame.broadcast.target)
    tickerTexture.offset.x = frame.t * 0.045
    crtMaterial.uniforms['time'].value = frame.t
    crtMaterial.uniforms['staticAmount'].value = frame.broadcastStatic
    // The set flickers on the boy and the walls as the picture changes.
    tvLight.intensity = 2.6 + 0.5 * Math.sin(frame.t * 13.1) + 0.35 * Math.sin(frame.t * 31.7) + 1.4 * frame.broadcastStatic
    grade.uniforms['time'].value = frame.t
    grade.uniforms['letterbox'].value = frame.letterbox
    grade.uniforms['fadeBlack'].value = frame.fadeBlack
    grade.uniforms['fadeWhite'].value = frame.fadeWhite
    if (president) poseActor(president, frame.president)
    if (boy) {
      boy.root.visible = frame.boyVisible
      boy.root.position.set(...frame.boyPosition)
      boy.root.rotation.y = frame.boyYaw
      poseActor(boy, frame.boy)
    }
    if (props) poseActor(props, frame.props)
    if (kit) {
      kit.root.visible = frame.kit.visible
      kit.root.position.set(...frame.kit.position)
      kit.root.scale.setScalar(frame.kit.scale)
      kit.root.rotation.y = frame.kit.sway - 0.5
      poseActor(kit, [{ clip: 'FLOAT', time: frame.t, loop: true, weight: 1 }])
      for (const holder of kitBalloons) holder.scale.setScalar(Math.max(0.001, frame.kit.balloonInflation))
    }
    captions.setState({ caption: frame.caption, opacity: frame.captionOpacity, letterbox: frame.letterbox })
  }

  async function load(): Promise<void> {
    const loader = new GLTFLoader()
    const [boyGltf, presidentGltf, studioGltf, roomGltf, exteriorGltf, kitGltf] = await Promise.all([
      loader.loadAsync(ASSETS.boy),
      loader.loadAsync(ASSETS.president),
      loader.loadAsync(ASSETS.studio),
      loader.loadAsync(ASSETS.room),
      loader.loadAsync(ASSETS.exterior),
      loader.loadAsync(ASSETS.kit),
    ])
    if (disposed) return
    prepareShadows(roomGltf.scene)
    roomSet.add(roomGltf.scene)
    const screen = roomGltf.scene.getObjectByName('TV_SCREEN')
    if (screen instanceof THREE.Mesh) {
      ;(screen.material as THREE.Material).dispose()
      screen.material = crtMaterial
      screen.castShadow = false
    }
    prepareShadows(exteriorGltf.scene)
    exteriorGltf.scene.traverse((object) => {
      // The cottage's windows share the living room's night glass; by day they
      // should read as panes, not lamps.
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.material.name.includes('night glass')) {
        object.material.emissiveIntensity = 0.12
      }
    })
    exteriorSet.add(exteriorGltf.scene)
    props = makeActor(exteriorGltf)
    prepareShadows(kitGltf.scene)
    exteriorSet.add(kitGltf.scene)
    kit = makeActor(kitGltf)
    for (let index = 0; index < 3; index += 1) {
      const holder = kitGltf.scene.getObjectByName(`KIT_BALLOON_${index}`)
      if (holder) kitBalloons.push(holder)
    }
    prepareShadows(boyGltf.scene)
    scene.add(boyGltf.scene)
    boy = makeActor(boyGltf)
    prepareShadows(studioGltf.scene)
    studioScene.add(studioGltf.scene)
    prepareShadows(presidentGltf.scene)
    presidentGltf.scene.position.set(0, 0, -0.08)
    studioScene.add(presidentGltf.scene)
    president = makeActor(presidentGltf)
    // Compile every set up front so the first cut never hitches on a shader.
    for (const set of ['room', 'exterior'] as const) {
      showSet(set)
      renderer.compile(scene, camera)
    }
    renderer.compile(studioScene, broadcastCamera)
    loaded = true
    apply(introFrameAt(time))
  }

  return {
    get time() {
      return time
    },
    duration: INTRO_DURATION,
    get loaded() {
      return loaded
    },
    get done() {
      return time >= INTRO_DURATION
    },
    load,
    update(delta: number): void {
      ui.update(delta)
      if (!loaded) return
      if (!paused) time = Math.min(INTRO_DURATION, time + delta)
      apply(introFrameAt(time))
      if (!paused) audio?.update(time)
    },
    render(): void {
      if (!loaded) {
        renderer.setClearColor('#000000', 1)
        renderer.clear()
        return
      }
      if (lastFrame.set === 'room') {
        renderer.setRenderTarget(studioTarget)
        renderer.render(studioScene, broadcastCamera)
        renderer.setRenderTarget(null)
      }
      composer.render()
      ui.render(renderer)
    },
    seek(seconds: number): void {
      time = THREE.MathUtils.clamp(seconds, 0, INTRO_DURATION)
      audio?.jump(time)
      if (loaded) apply(introFrameAt(time))
    },
    setPaused(next: boolean): void {
      paused = next
    },
    skip(): void {
      time = INTRO_DURATION
      audio?.jump(time)
    },
    flashSkipHint(): void {
      captions.flashSkipHint()
    },
    resumeAudio(): void {
      audio?.resume()
    },
    resize,
    scenes: { film: scene, studio: studioScene },
    describe() {
      return { time, shot: lastFrame.shot.id, set: lastFrame.set, caption: lastFrame.caption?.text ?? null }
    },
    dispose(): void {
      disposed = true
      audio?.dispose()
      const disposeTree = (root: THREE.Object3D): void => {
        root.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            for (const material of materials) {
              for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
              material.dispose()
            }
          }
        })
      }
      disposeTree(scene)
      disposeTree(studioScene)
      boy?.mixer.stopAllAction()
      president?.mixer.stopAllAction()
      props?.mixer.stopAllAction()
      kit?.mixer.stopAllAction()
      bannerTexture.dispose()
      tickerTexture.dispose()
      studioTarget.dispose()
      environment.dispose()
      pmrem.dispose()
      bokeh.dispose()
      bloom.dispose()
      grade.dispose()
      composer.dispose()
      ui.dispose()
      scene.clear()
      studioScene.clear()
    },
  }
}
