import * as THREE from 'three'
import { MeshBasicNodeMaterial, PMREMGenerator, RenderPipeline, type WebGPURenderer } from 'three/webgpu'
import {
  Fn,
  If,
  atan,
  attribute,
  cameraPosition,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  length,
  materialColor,
  max,
  min,
  mix,
  normalize,
  pass,
  positionLocal,
  positionWorld,
  pow,
  renderOutput,
  rtt,
  select,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { FilmPost, FilmPostOptions, SkyColors, WebGPUKit } from '../backend'
import {
  GROUND_DRY,
  GROUND_DUST,
  GROUND_FIELD_EXTENT,
  GROUND_LUSH,
  getGroundVariationField,
  type GroundVariationBounds,
  type GroundVariationKindSpec,
} from '../../scene/ground-variation'

/**
 * Node (TSL) twins of the farm's GLSL shaders, used when the page runs on
 * WebGPURenderer. Each one is a line-for-line port of its GLSL source, named
 * in the doc comment, so a change to one is easy to mirror in the other.
 *
 * TSL is compiled to WGSL on WebGPU (and to GLSL on the WebGL2 backend), so the
 * long-term plan is that these become the only copy; the GLSL stays while
 * WebGLRenderer is the default.
 *
 * TSL's TypeScript types are too narrow for shader authoring (a `Fn` argument
 * has to be a `VarNode`, a texture pass is a plain `Node`), so values flowing
 * through node graphs are typed `Tsl`, a deliberate `any`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tsl = any

// ------------------------------------------------------------------- sky --

/** Port of `createSkyDome` in scene/fairground.ts. */
function createSkyMaterial(colors: SkyColors): THREE.Material {
  const horizon = uniform(colors.horizon)
  const middle = uniform(colors.middle)
  const zenith = uniform(colors.zenith)
  const material = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
  material.name = 'Farm sky (node)'
  const direction = normalize(positionWorld.sub(cameraPosition))
  const height = clamp(direction.y, -0.12, 1)
  const lower = smoothstep(-0.12, 0.18, height)
  const upper = smoothstep(0.12, 0.92, height)
  material.colorNode = mix(mix(horizon, middle, lower), zenith, upper)
  return material
}

/** Port of `SKY_FRAGMENT` in scene/intro-cutscene.ts. */
function createIntroSkyMaterial(sunDirection: THREE.Vector3): THREE.Material {
  const material = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
  material.name = 'Intro morning sky (node)'
  const horizon = uniform(new THREE.Color('#f6dcb4'))
  const zenith = uniform(new THREE.Color('#6fa8e0'))
  const sunColour = uniform(new THREE.Color('#fff2d0'))
  const sun = uniform(sunDirection)
  const direction = normalize(positionLocal)
  const height = clamp(direction.y, 0, 1)
  const base = mix(horizon, zenith, pow(height, 0.55))
  const alignment = max(dot(direction, sun), 0)
  const glow = pow(alignment, 380).mul(6).add(pow(alignment, 12).mul(0.35))
  material.colorNode = base.add(sunColour.mul(glow))
  // The GLSL sky bypasses the renderer's tone map; the post chain applies it.
  material.toneMapped = false
  return material
}

// ------------------------------------------------------------------- CRT --

const hash21 = Fn(([p]: [Tsl]) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)))

/** Port of `CRT_FRAGMENT` in scene/intro-cutscene.ts. */
function createCrtMaterial(picture: THREE.Texture): { material: THREE.Material; setFrame(time: number, staticAmount: number): void } {
  const time = uniform(0)
  const staticAmount = uniform(1)
  const material = new MeshBasicNodeMaterial({ fog: false })
  material.name = 'Intro CRT screen (node)'
  material.toneMapped = false
  // The GLSL flips v here (glTF UVs run top-down, GL render targets bottom-up).
  // WebGPU render targets are already sampled top-down, so no flip.
  const centred = uv().sub(0.5)
  const coord = centred.mul(float(1).add(dot(centred, centred).mul(0.09))).add(0.5)
  const shift = float(0.0016).add(sin(time.mul(3)).mul(0.0008))
  const red = texture(picture, coord.add(vec2(shift, 0))).r
  const green = texture(picture, coord).g
  const blue = texture(picture, coord.sub(vec2(shift, 0))).b
  const scan = float(0.8).add(sin(coord.y.mul(900)).mul(0.2))
  const rolling = float(0.94).add(sin(coord.y.mul(6).sub(time.mul(2.4))).mul(0.06))
  const mask = float(0.9).add(sin(coord.x.mul(1500)).mul(0.1))
  const shaded = vec3(red, green, blue).mul(scan).mul(rolling).mul(mask)
  const noise = hash21(floor(coord.mul(vec2(320, 240))).add(floor(time.mul(30))))
  const noisy = mix(shaded, vec3(noise.mul(0.9)), staticAmount).add(noise.mul(0.025))
  const edge = smoothstep(0.62, 0.34, length(centred.mul(vec2(1, 1.15))))
  const outside = coord.x.lessThan(0).or(coord.x.greaterThan(1)).or(coord.y.lessThan(0)).or(coord.y.greaterThan(1))
  material.colorNode = select(outside, vec3(0), noisy.mul(edge))
  return {
    material,
    setFrame(frameTime, amount) {
      time.value = frameTime
      staticAmount.value = amount
    },
  }
}

// ------------------------------------------------------ ground variation --

const gvHash = Fn(([input]: [Tsl]) => {
  const p = vec2(input).toVar()
  p.assign(fract(p.mul(vec2(123.34, 456.21))))
  p.addAssign(dot(p, p.add(45.32)))
  return fract(p.x.mul(p.y))
})

const gvNoise = Fn(([input]: [Tsl]) => {
  const cell: Tsl = floor(input)
  const local: Tsl = fract(input)
  const eased = local.mul(local).mul(float(3).sub(local.mul(2)))
  const a = gvHash(cell)
  const b = gvHash(cell.add(vec2(1, 0)))
  const c = gvHash(cell.add(vec2(0, 1)))
  const d = gvHash(cell.add(vec2(1, 1)))
  return mix(mix(a, b, eased.x), mix(c, d, eased.x), eased.y)
})

/**
 * Port of `GLSL_HEAD` and `GLSL_BODY` in scene/ground-variation.ts. The GLSL
 * edits `diffuseColor` after the map and vertex colours; here the colour node
 * folds the vertex colour in itself (and the material stops applying it).
 */
function applyGroundVariation(
  material: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial,
  kind: GroundVariationKindSpec,
  options: { bounds: GroundVariationBounds; localSpace: boolean },
): void {
  const hasVertexColors = material.vertexColors
  const half = uniform(options.bounds.half)
  const organic = uniform(options.bounds.organic.value)
  organic.onRenderUpdate(() => {
    organic.value = options.bounds.organic.value
  })
  const params = uniform(new THREE.Vector4(kind.tone, kind.patches, kind.dust, 0))
  const dry = uniform(new THREE.Vector3(...GROUND_DRY))
  const lush = uniform(new THREE.Vector3(...GROUND_LUSH))
  const dust = uniform(new THREE.Color(GROUND_DUST))
  const field = kind.field ? getGroundVariationField() : null

  // Port of gvFarmDistance (itself a port of farmEdgeDistance): negative is farmland.
  const farmDistance = Fn(([point]: [Tsl]) => {
    const n = point.div(half)
    const angle = atan(n.y, n.x)
    const wobble = float(0.93)
      .add(sin(angle.mul(3).add(0.4)).mul(0.035))
      .add(sin(angle.mul(5).sub(0.8)).mul(0.025))
      .add(cos(angle.mul(7)).mul(0.01))
    const edge = select(organic.greaterThan(0.5), wobble, float(1))
    const radius = length(vec2(cos(angle).mul(half.x), sin(angle).mul(half.y)))
    return length(n).sub(edge).mul(radius)
  })

  const shade = Fn(() => {
    const gp = positionWorld.xz
    const base = vec4(materialColor as Tsl).toVar()
    if (hasVertexColors) base.mulAssign(vertexColor())
    const c = base.rgb.toVar()
    const alpha = base.a.toVar()

    if (field) {
      // Baked light/dark swaths and dry/lush areas: one fetch, no per-pixel noise.
      const sample = texture(field, gp.div(GROUND_FIELD_EXTENT).add(0.5)).rgb
      c.mulAssign(float(1).add(sample.r.sub(0.5).mul(2).mul(params.x)))
      c.assign(mix(c, c.mul(dry), sample.g.mul(params.y)))
      c.assign(mix(c, c.mul(lush), sample.b.mul(params.y)))
    }

    const distance = float(100).toVar()
    const rim = float(0.5).toVar()
    if (kind.distance) {
      // Gravel is authored in the starter plot's local space and scaled with the
      // farm; its distance must come from local coordinates to stay a fixed width.
      const fp = options.localSpace ? vec2(positionLocal.x, positionLocal.y.negate()) : gp
      // Cheap lower bound first: most of the meadow skips the trig and noise below.
      const lowerBound = length(fp.div(half)).sub(1).mul(min(half.x, half.y))
      If(lowerBound.lessThan(5.4), () => {
        distance.assign(farmDistance(fp))
        rim.assign(gvNoise(gp.mul(1.9)).mul(0.6).add(gvNoise(gp.mul(5.3).add(9)).mul(0.4)))
        // Worn ground fades out from the farm edge, broken up so it never reads as a ring.
        const worn = float(1).sub(smoothstep(0.8, rim.mul(2.6).add(2.6), distance))
        const grit = float(0.86).add(gvNoise(gp.mul(1.7)).mul(0.3))
        c.assign(mix(c, dust.mul(grit), worn.mul(params.z)))
      })
    }

    if (kind.pebbles) {
      const cell = floor(gp.mul(18))
      const pebble = step(0.8, gvHash(cell))
      c.mulAssign(float(1).add(pebble.mul(gvHash(cell.add(7.1)).sub(0.55)).mul(0.5)))
    }

    if (kind.paint) {
      // Painted lawn alpha is stored per vertex and interpolated across
      // triangles; wobble the contour with noise so the rim is round.
      If(alpha.greaterThan(0.002).and(alpha.lessThan(0.998)), () => {
        const wobble = gvNoise(gp.mul(2.3)).mul(0.6).add(gvNoise(gp.mul(6.1).add(5)).mul(0.4)).sub(0.5)
        const bent = clamp(alpha.add(wobble.mul(1.3).mul(alpha.mul(float(1).sub(alpha)).mul(4))), 0, 1)
        alpha.assign(smoothstep(0.06, 0.94, bent))
      })
    }

    if (kind.feather) {
      // Feathered outer rim so the gravel dissolves into the dust, not a cut line.
      alpha.mulAssign(float(1).sub(smoothstep(0.5, 1.14, distance.add(rim.sub(0.5).mul(0.7)))))
    }

    return vec4(c, alpha)
  })

  material.colorNode = shade()
  // The colour node already includes the vertex colour.
  material.vertexColors = false
  material.needsUpdate = true
}

// --------------------------------------------------------------- animals --

const heartEyePositions = new Map<boolean, Tsl>()

/**
 * Port of `installHeartEyeShader` in animals/animal-eyes.ts. A collapsed vertex
 * scales to the origin, so its triangles have no area. The node is shared per
 * mode so every eye material of a mode reuses one pipeline.
 */
function applyHeartEyes(material: THREE.Material, hearts: boolean, partAttribute: string): void {
  let node = heartEyePositions.get(hearts)
  if (!node) {
    const amount = float(hearts ? 1 : 0)
    node = positionLocal.mul(select(attribute(partAttribute, 'float').greaterThan(0.5), amount, float(1).sub(amount)))
    heartEyePositions.set(hearts, node)
  }
  ;(material as THREE.MeshStandardMaterial & { positionNode: Tsl }).positionNode = node
  material.needsUpdate = true
}

/**
 * Port of the `onBeforeCompile` hook in `createCaptureMaterial`
 * (animals/balloon-animal.ts): the paint sweeps up the animal from the wild
 * colour. The colour node folds the map and vertex colours in itself, as the
 * GLSL edits `diffuseColor` after `color_fragment`.
 */
function applyPaintReveal(
  material: THREE.MeshStandardMaterial,
  state: { progress: { value: number }; bottom: { value: number }; top: { value: number } },
  wildColor: THREE.Color,
): void {
  const live = (source: { value: number }): Tsl => {
    const node = uniform(source.value)
    node.onRenderUpdate(() => {
      node.value = source.value
    })
    return node
  }
  const progress = live(state.progress)
  const bottom = live(state.bottom)
  const top = live(state.top)
  const wild = uniform(wildColor)
  const hasVertexColors = material.vertexColors

  const shade = Fn(() => {
    const base = vec4(materialColor as Tsl).toVar()
    if (hasVertexColors) base.mulAssign(vertexColor())
    const world = positionWorld
    const height = clamp(world.y.sub(bottom).div(max(top.sub(bottom), 0.001)), 0, 1)
    const edge = float(1.03).sub(progress.mul(1.06))
    const noise = sin(world.x.mul(9).add(world.z.mul(6))).add(sin(world.z.mul(13).sub(world.y.mul(5)))).mul(0.012)
    const shifted = height.add(noise)
    const reveal = smoothstep(edge.sub(0.035), edge.add(0.035), shifted)
    const shimmer = float(1).sub(smoothstep(0.012, 0.055, shifted.sub(edge).abs()))
    const rgb = mix(wild, base.rgb, reveal).add(vec3(0.055, 0.04, 0.025).mul(shimmer).mul(float(1).sub(progress)))
    return vec4(rgb, base.a)
  })

  ;(material as THREE.MeshStandardMaterial & { colorNode: Tsl }).colorNode = shade()
  material.vertexColors = false // the colour node already includes it
  material.needsUpdate = true
}

// ------------------------------------------------------------- film post --

/** Port of `createGradeShader` in scene/cutscene-kit.ts. */
function createFilmPost(
  renderer: Parameters<WebGPUKit['createFilmPost']>[0],
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  options: FilmPostOptions,
): FilmPost {
  const gpu = renderer as WebGPURenderer
  const focus = uniform(2)
  const aperture = uniform(0.0016)
  const maxBlur = uniform(0.007)
  const aspect = uniform(camera.aspect)
  const time = uniform(0)
  const letterbox = uniform(0)
  const fadeBlack = uniform(1)
  const fadeWhite = uniform(0)

  const scenePass = pass(scene, camera)
  const colour: Tsl = scenePass.getTextureNode('output')
  const viewZ = scenePass.getViewZNode()

  // Port of BokehShader (three/addons/shaders/BokehShader.js): 41 taps in
  // four rings, widest first in the source order.
  const rings: ReadonlyArray<readonly [number, ReadonlyArray<readonly [number, number]>]> = [
    [1, [[0, 0.4], [0.15, 0.37], [0.29, 0.29], [-0.37, 0.15], [0.4, 0], [0.37, -0.15], [0.29, -0.29], [-0.15, -0.37],
      [0, -0.4], [-0.15, 0.37], [-0.29, 0.29], [0.37, 0.15], [-0.4, 0], [-0.37, -0.15], [-0.29, -0.29], [0.15, -0.37]]],
    [0.9, [[0.15, 0.37], [-0.37, 0.15], [0.37, -0.15], [-0.15, -0.37], [-0.15, 0.37], [0.37, 0.15], [-0.37, -0.15], [0.15, -0.37]]],
    [0.7, [[0.29, 0.29], [0.4, 0], [0.29, -0.29], [0, -0.4], [-0.29, 0.29], [-0.4, 0], [-0.29, -0.29], [0, 0.4]]],
    [0.4, [[0.29, 0.29], [0.4, 0], [0.29, -0.29], [0, -0.4], [-0.29, 0.29], [-0.4, 0], [-0.29, -0.29], [0, 0.4]]],
  ]
  const blurred = Fn(() => {
    const factor = focus.add(viewZ)
    const blur = clamp(factor.mul(aperture), maxBlur.negate(), maxBlur)
    const correct = vec2(1, aspect)
    let sum = colour.sample(uv())
    for (const [scale, taps] of rings) {
      for (const [x, y] of taps) {
        sum = sum.add(colour.sample(uv().add(vec2(x, y).mul(correct).mul(blur.mul(scale)))))
      }
    }
    return vec4(sum.rgb.div(41), 1)
  })()

  const bloomed = bloom(blurred, options.bloomStrength, options.bloomRadius, options.bloomThreshold)
  const toneMapped = renderOutput(blurred.add(bloomed), renderer.toneMapping, renderer.outputColorSpace)
  // The grade samples neighbouring pixels, so the tone-mapped picture goes to a texture first.
  const picture: Tsl = rtt(toneMapped)

  const graded = Fn(() => {
    const screen = uv()
    const centred = screen.sub(0.5)
    const offset = centred.mul(0.0028)
    const rgb = vec3(picture.sample(screen.add(offset)).r, picture.sample(screen).g, picture.sample(screen.sub(offset)).b).toVar()
    // A warm storybook lift in the shadows and a soft lens vignette.
    rgb.assign(mix(rgb, rgb.mul(vec3(1.03, 1, 0.95)).add(vec3(0.012, 0.006, 0)), 0.8))
    const vignette = smoothstep(1, 0.28, length(centred.mul(vec2(aspect.mul(0.72), 1))))
    rgb.mulAssign(mix(0.7, 1, vignette))
    const grain = hash21(screen.mul(vec2(1280, 720)).add(fract(time.mul(7.3))))
    rgb.addAssign(grain.sub(0.5).mul(0.03))
    rgb.assign(mix(rgb, vec3(0), fadeBlack))
    rgb.assign(select(screen.y.lessThan(letterbox).or(screen.y.greaterThan(float(1).sub(letterbox))), vec3(0), rgb))
    rgb.assign(mix(rgb, vec3(1, 0.985, 0.95), fadeWhite))
    return vec4(rgb, 1)
  })()

  // The HUD is drawn to its own target (render targets skip the renderer's
  // output pass), then laid over the grade, encoded the way the canvas would.
  const overlay = options.overlay
  const overlayTarget = overlay ? new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }) : null
  let composited: Tsl = graded
  if (overlayTarget) {
    const hud: Tsl = texture(overlayTarget.texture)
    const straight = vec4(hud.rgb.div(max(hud.a, 0.0001)), 1)
    const encoded = renderOutput(straight, renderer.toneMapping, renderer.outputColorSpace).rgb
    composited = vec4(encoded.mul(hud.a).add(graded.rgb.mul(float(1).sub(hud.a))), 1)
  }

  const pipeline = new RenderPipeline(gpu)
  // Tone mapping and the sRGB encode happen above, ahead of the grade.
  pipeline.outputColorTransform = false
  pipeline.outputNode = composited

  const drawn = new THREE.Vector2()
  const clear = new THREE.Color()
  return {
    includesOverlay: overlayTarget !== null,
    render(): void {
      if (overlay && overlayTarget) {
        gpu.getDrawingBufferSize(drawn)
        if (overlayTarget.width !== drawn.x || overlayTarget.height !== drawn.y) overlayTarget.setSize(drawn.x, drawn.y)
        const clearAlpha = gpu.getClearAlpha()
        gpu.getClearColor(clear)
        gpu.setClearColor(0x000000, 0)
        gpu.setRenderTarget(overlayTarget)
        gpu.clear()
        gpu.render(overlay.scene, overlay.camera)
        gpu.setRenderTarget(null)
        gpu.setClearColor(clear, clearAlpha)
      }
      pipeline.render()
    },
    setSize(cssWidth, cssHeight): void {
      aspect.value = cssWidth / Math.max(1, cssHeight)
    },
    setFocus(distance, blurAmount): void {
      focus.value = distance
      aperture.value = blurAmount
    },
    setBloomThreshold(threshold): void {
      bloomed.threshold.value = threshold
    },
    setGrade(grade): void {
      time.value = grade.time
      letterbox.value = grade.letterbox
      fadeBlack.value = grade.fadeBlack
      fadeWhite.value = grade.fadeWhite
    },
    dispose(): void {
      pipeline.dispose()
      bloomed.dispose()
      overlayTarget?.dispose()
    },
  }
}

// ----------------------------------------------------------- environment --

function createRoomEnvironment(renderer: Parameters<WebGPUKit['createFilmPost']>[0]): { texture: THREE.Texture; dispose(): void } {
  const generator = new PMREMGenerator(renderer as ConstructorParameters<typeof PMREMGenerator>[0])
  const room = new RoomEnvironment()
  const target = generator.fromScene(room, 0.04)
  room.dispose()
  return {
    texture: target.texture,
    dispose(): void {
      target.dispose()
      generator.dispose()
    },
  }
}

export function createWebGPUKit(): WebGPUKit {
  return { createSkyMaterial, createIntroSkyMaterial, createCrtMaterial, applyGroundVariation, applyHeartEyes, applyPaintReveal, createFilmPost, createRoomEnvironment }
}
