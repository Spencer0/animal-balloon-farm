import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import {
  TOOL_UNLOCK_DURATION,
  TOOL_UNLOCK_SOUND_CUES,
  toolUnlockFrameAt,
  type ToolUnlockFilm,
  type ToolUnlockFrame,
} from '../game/tool-unlock-script'
import { createUILayer, type UILayer } from '../ui/ui-layer'
import { createIntroCaptions, type IntroCaptions } from '../ui/intro-captions'
import { createIntroAudio } from './intro-audio'
import { createGardenToolModel, tintSeedPack } from './garden-tool-art'
import { createGradeShader, disposeTree, makeActor, poseActor, prepareShadows, type Actor, type CutscenePlayer } from './cutscene-kit'

/**
 * The tool-unlock cutscene: Pip hands the boy the tool the player just bought.
 *
 * One film for every tool. The cast and the shop come from
 * `art/blender/tool_unlock_cutscene.py`; the tool is the game's own model from
 * `createGardenToolModel`, carried between the two `HAND_GRIP_R` empties.
 * What happens when is decided by `game/tool-unlock-script.ts`, and every frame
 * is rebuilt from `toolUnlockFrameAt(film, t)`.
 */

export interface ToolUnlockCutscene extends CutscenePlayer {
  readonly time: number
  readonly duration: number
  readonly film: ToolUnlockFilm
  seek(seconds: number): void
  /** Hold the film on its current frame (debug harness screenshots). */
  setPaused(paused: boolean): void
  describe(): { film: string; time: number; shot: string; caption: string | null }
  readonly scene: THREE.Scene
}

const ASSETS = {
  boy: 'assets/cutscenes/tool-boy.glb',
  pip: 'assets/cutscenes/tool-pip.glb',
  shop: 'assets/cutscenes/tool-shop.glb',
} as const

/** The window on the shop's left wall, where the daylight comes from. */
const SUN_DIRECTION = new THREE.Vector3(-0.7, 0.62, 0.35).normalize()

export function createToolUnlockCutscene(
  renderer: THREE.WebGLRenderer,
  film: ToolUnlockFilm,
  cssWidth: number,
  cssHeight: number,
): ToolUnlockCutscene {
  let time = 0
  let paused = false
  let loaded = false
  let disposed = false
  let lastFrame: ToolUnlockFrame = toolUnlockFrameAt(film, 0)

  const scene = new THREE.Scene()
  scene.name = `Tool unlock cutscene: ${film.id}`
  scene.background = new THREE.Color('#f3dca0')
  const camera = new THREE.PerspectiveCamera(40, cssWidth / Math.max(1, cssHeight), 0.05, 60)
  camera.name = 'Tool unlock camera'

  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  const environment = pmrem.fromScene(roomEnvironment, 0.04).texture
  roomEnvironment.dispose()
  scene.environment = environment
  scene.environmentIntensity = 0.45

  // ----- a sunny shop: daylight through the window, warm fill, a lamp over the counter.
  const sun = new THREE.DirectionalLight('#fff0d2', 2.2)
  sun.name = 'Tool shop window light'
  sun.position.copy(SUN_DIRECTION).multiplyScalar(8)
  sun.target.position.set(0, 0.6, -0.4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -4
  sun.shadow.camera.right = 4
  sun.shadow.camera.top = 4
  sun.shadow.camera.bottom = -4
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 20
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 3
  const fill = new THREE.HemisphereLight('#fff6e4', '#b98a5c', 0.9)
  fill.name = 'Tool shop fill'
  const lamp = new THREE.PointLight('#ffd49a', 3.2, 6, 1.5)
  lamp.name = 'Tool shop counter lamp'
  lamp.position.set(0.4, 2.3, -0.2)
  scene.add(sun, sun.target, fill, lamp)

  // ----- the tool, carried between Pip's fist and the boy's.
  const toolCarrier = new THREE.Group()
  toolCarrier.name = 'Tool unlock carrier'
  const toolGrip = new THREE.Group()
  toolGrip.name = 'Tool unlock grip'
  toolGrip.position.set(...film.grip.offset)
  toolGrip.rotation.set(...film.grip.rotation)
  toolGrip.scale.setScalar(film.grip.scale)
  const toolSpinner = new THREE.Group()
  toolSpinner.name = 'Tool unlock spinner'
  const toolModel = createGardenToolModel(film.tool, film.pack)
  if (film.pack) tintSeedPack(toolModel, film.pack)
  // Centre it on the fist, so a grip only has to say which way it points.
  const centre = new THREE.Box3().setFromObject(toolModel).getCenter(new THREE.Vector3())
  toolModel.position.sub(centre)
  prepareShadows(toolModel)
  toolSpinner.add(toolModel)
  toolGrip.add(toolSpinner)
  toolCarrier.add(toolGrip)
  toolCarrier.visible = false
  scene.add(toolCarrier)

  // ----- post: depth of field, bloom, tone map, then the film grade.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }))
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))
  const bokeh = new BokehPass(scene, camera, { focus: 2, aperture: 0.0016, maxblur: 0.007 })
  composer.addPass(bokeh)
  const bokehUniforms = bokeh.uniforms as Record<'focus' | 'aperture' | 'maxblur', THREE.IUniform<number>>
  const bloom = new UnrealBloomPass(new THREE.Vector2(cssWidth, cssHeight), 0.22, 0.5, 1.4)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const grade = new ShaderPass(createGradeShader('ToolUnlockGradeShader'))
  composer.addPass(grade)

  const ui: UILayer = createUILayer()
  const captions: IntroCaptions = createIntroCaptions(ui.viewport)
  ui.add(captions)

  const audio = createIntroAudio(TOOL_UNLOCK_SOUND_CUES)
  let boy: Actor | null = null
  let pip: Actor | null = null
  let boyGrip: THREE.Object3D | null = null
  let pipGrip: THREE.Object3D | null = null

  function resize(width: number, height: number): void {
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(width, height)
    grade.uniforms['aspect'].value = camera.aspect
    ui.resize(width, height)
  }
  resize(cssWidth, cssHeight)

  const focusPoint = new THREE.Vector3()
  const fromPosition = new THREE.Vector3()
  const toPosition = new THREE.Vector3()
  const fromQuaternion = new THREE.Quaternion()
  const toQuaternion = new THREE.Quaternion()
  const unusedScale = new THREE.Vector3()

  function carryTool(frame: ToolUnlockFrame): void {
    toolCarrier.visible = frame.tool.visible && boyGrip !== null && pipGrip !== null
    if (!toolCarrier.visible || !boyGrip || !pipGrip) return
    pipGrip.matrixWorld.decompose(fromPosition, fromQuaternion, unusedScale)
    boyGrip.matrixWorld.decompose(toPosition, toQuaternion, unusedScale)
    // Passed across the counter in a little arc rather than a straight line.
    toolCarrier.position.lerpVectors(fromPosition, toPosition, frame.tool.handoff)
    toolCarrier.position.y += Math.sin(frame.tool.handoff * Math.PI) * 0.08
    toolCarrier.quaternion.slerpQuaternions(fromQuaternion, toQuaternion, frame.tool.handoff)
    toolCarrier.scale.setScalar(Math.max(0.001, frame.tool.scale))
    toolSpinner.rotation.y = frame.tool.spin
  }

  function apply(frame: ToolUnlockFrame): void {
    lastFrame = frame
    camera.position.set(...frame.camera.position)
    camera.lookAt(...frame.camera.target)
    if (camera.fov !== frame.camera.fov) {
      camera.fov = frame.camera.fov
      camera.updateProjectionMatrix()
    }
    const focus = camera.position.distanceTo(focusPoint.set(...frame.camera.target))
    bokehUniforms.focus.value = focus
    bokehUniforms.aperture.value = THREE.MathUtils.clamp(0.0035 / Math.max(0.4, focus), 0.0004, 0.004)
    grade.uniforms['time'].value = frame.t
    grade.uniforms['letterbox'].value = frame.letterbox
    grade.uniforms['fadeBlack'].value = frame.fadeBlack
    grade.uniforms['fadeWhite'].value = frame.fadeWhite
    if (boy) {
      boy.root.position.set(...frame.boyPosition)
      boy.root.rotation.y = frame.boyYaw
      poseActor(boy, frame.boy)
    }
    if (pip) {
      pip.root.position.set(...frame.pipPosition)
      pip.root.rotation.y = frame.pipYaw
      poseActor(pip, frame.pip)
    }
    scene.updateMatrixWorld()
    carryTool(frame)
    captions.setState({ caption: frame.caption, opacity: frame.captionOpacity, letterbox: frame.letterbox })
  }

  async function load(): Promise<void> {
    const loader = new GLTFLoader()
    const [boyGltf, pipGltf, shopGltf] = await Promise.all([
      loader.loadAsync(ASSETS.boy),
      loader.loadAsync(ASSETS.pip),
      loader.loadAsync(ASSETS.shop),
    ])
    if (disposed) return
    prepareShadows(shopGltf.scene)
    scene.add(shopGltf.scene)
    shopGltf.scene.traverse((object) => {
      // The window should read as bright daylight, not as a lamp.
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.material.name.includes('day glass')) {
        object.material.emissiveIntensity = 0.6
      }
    })
    prepareShadows(boyGltf.scene)
    scene.add(boyGltf.scene)
    boy = makeActor(boyGltf)
    boyGrip = boyGltf.scene.getObjectByName('HAND_GRIP_R') ?? null
    prepareShadows(pipGltf.scene)
    scene.add(pipGltf.scene)
    pip = makeActor(pipGltf)
    pipGrip = pipGltf.scene.getObjectByName('HAND_GRIP_R') ?? null
    if (!boyGrip || !pipGrip) console.warn('[tool unlock] a hand grip is missing; the tool will not show')
    // Compile up front so the first cut never hitches on a shader.
    toolCarrier.visible = true
    renderer.compile(scene, camera)
    loaded = true
    apply(toolUnlockFrameAt(film, time))
  }

  return {
    get time() {
      return time
    },
    duration: TOOL_UNLOCK_DURATION,
    film,
    get loaded() {
      return loaded
    },
    get done() {
      return time >= TOOL_UNLOCK_DURATION
    },
    load,
    update(delta: number): void {
      ui.update(delta)
      if (!loaded) return
      if (!paused) time = Math.min(TOOL_UNLOCK_DURATION, time + delta)
      apply(toolUnlockFrameAt(film, time))
      if (!paused) audio?.update(time)
    },
    render(): void {
      if (!loaded) {
        renderer.setClearColor('#000000', 1)
        renderer.clear()
        return
      }
      composer.render()
      ui.render(renderer)
    },
    seek(seconds: number): void {
      time = THREE.MathUtils.clamp(seconds, 0, TOOL_UNLOCK_DURATION)
      audio?.jump(time)
      if (loaded) apply(toolUnlockFrameAt(film, time))
    },
    setPaused(next: boolean): void {
      paused = next
    },
    skip(): void {
      time = TOOL_UNLOCK_DURATION
      audio?.jump(time)
    },
    flashSkipHint(): void {
      captions.flashSkipHint()
    },
    resumeAudio(): void {
      audio?.resume()
    },
    resize,
    scene,
    describe() {
      return { film: film.id, time, shot: lastFrame.shot.id, caption: lastFrame.caption?.text ?? null }
    },
    dispose(): void {
      disposed = true
      audio?.dispose()
      disposeTree(scene)
      boy?.mixer.stopAllAction()
      pip?.mixer.stopAllAction()
      environment.dispose()
      pmrem.dispose()
      bokeh.dispose()
      bloom.dispose()
      grade.dispose()
      composer.dispose()
      ui.dispose()
      scene.clear()
    },
  }
}
