import * as THREE from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { GroundVariationBounds, GroundVariationKindSpec } from '../scene/ground-variation'

/**
 * Which renderer draws the farm, and the seam between the two.
 *
 * WebGPU is the default (three's WebGPURenderer: async init, node materials)
 * and the page falls back to WebGL by itself when the browser has no WebGPU or
 * the adapter/device fails to start. `?renderer=webgl` forces WebGL and
 * `?renderer=webgpu` asks for WebGPU explicitly (it still falls back, loudly,
 * rather than leave a black page). Everything that draws through the renderer
 * accepts a {@link FarmRenderer}; the few places whose shaders differ per
 * backend ask for {@link webgpuKit} and get `null` under WebGL.
 *
 * The WebGPU half (`three/webgpu`, `three/tsl`, about 700 KB minified) is a
 * separate lazy chunk. A WebGL session never downloads or parses it.
 */

export type RenderBackend = 'webgl' | 'webgpu'
export type FarmRenderer = THREE.WebGLRenderer | WebGPURenderer

/** Linear colours of the farm sky, shared by the GLSL and TSL materials so the day-night rig drives either. */
export interface SkyColors {
  readonly horizon: THREE.Color
  readonly middle: THREE.Color
  readonly zenith: THREE.Color
}

export interface FilmPostOptions {
  readonly width: number
  readonly height: number
  readonly bloomStrength: number
  readonly bloomRadius: number
  /** Changes per shot (a night room glows, a day garden barely does). */
  readonly bloomThreshold: number
  /** For the shader name only; shows up in GPU captures. */
  readonly name: string
  /**
   * The HUD scene to draw over the graded picture. WebGPU cannot draw a second
   * scene onto the canvas after the pipeline (the renderer's output pass would
   * overwrite it), so there the pipeline composites it. WebGL ignores this and
   * the caller draws the HUD after `render()`.
   */
  readonly overlay?: { readonly scene: THREE.Scene; readonly camera: THREE.Camera }
}

/** Cutscene post: depth of field, bloom, tone map, then the storybook grade. */
export interface FilmPost {
  /** True when `render()` already drew the overlay passed in the options. */
  readonly includesOverlay: boolean
  render(): void
  setSize(cssWidth: number, cssHeight: number): void
  /** Camera distance in focus, and how strongly everything else blurs. */
  setFocus(distance: number, aperture: number): void
  setBloomThreshold(threshold: number): void
  setGrade(grade: { time: number; letterbox: number; fadeBlack: number; fadeWhite: number }): void
  dispose(): void
}

/** The TSL twins of the shaders that only exist as GLSL under WebGL. */
export interface WebGPUKit {
  createSkyMaterial(colors: SkyColors): THREE.Material
  createIntroSkyMaterial(sunDirection: THREE.Vector3): THREE.Material
  /** TV picture from a render target, with scanlines and static. */
  createCrtMaterial(texture: THREE.Texture): { material: THREE.Material; setFrame(time: number, staticAmount: number): void }
  /** Patches a classic ground material in place with the node version of the GLSL hook. */
  applyGroundVariation(
    material: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial,
    kind: GroundVariationKindSpec,
    options: { bounds: GroundVariationBounds; localSpace: boolean },
  ): void
  /** Node version of the heart-eye collapse in animals/animal-eyes.ts (`partAttribute` flags heart vertices). */
  applyHeartEyes(material: THREE.Material, hearts: boolean, partAttribute: string): void
  /** Node version of the capture paint reveal in animals/balloon-animal.ts. */
  applyPaintReveal(
    material: THREE.MeshStandardMaterial,
    state: { progress: { value: number }; bottom: { value: number }; top: { value: number } },
    wildColor: THREE.Color,
  ): void
  createFilmPost(renderer: FarmRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: FilmPostOptions): FilmPost
  /** A prefiltered room environment for PBR materials. */
  createRoomEnvironment(renderer: FarmRenderer): { texture: THREE.Texture; dispose(): void }
}

let kit: WebGPUKit | null = null
let activeBackend: RenderBackend = 'webgl'

/** The node implementations, or `null` under WebGL. */
export function webgpuKit(): WebGPUKit | null {
  return kit
}

export function backendInUse(): RenderBackend {
  return activeBackend
}

export function isWebGPURenderer(renderer: FarmRenderer): renderer is WebGPURenderer {
  return (renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer === true
}

/** What the page asks for: WebGPU unless `?renderer=webgl`. */
export function requestedBackend(search: string = window.location.search): RenderBackend {
  return new URLSearchParams(search).get('renderer') === 'webgl' ? 'webgl' : 'webgpu'
}

export interface CreatedRenderer {
  readonly renderer: FarmRenderer
  readonly backend: RenderBackend
  /** Set when WebGPU was requested but WebGL was used instead, and why. */
  readonly fallbackReason: string | null
}

async function webgpuAdapterAvailable(): Promise<string | null> {
  if (!('gpu' in navigator) || !navigator.gpu) return 'navigator.gpu is not available in this browser'
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    return adapter ? null : 'no WebGPU adapter was returned'
  } catch (error) {
    return `requestAdapter failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Builds the renderer the page asked for. Falls back to WebGL, saying why, when
 * WebGPU is requested but cannot start, so a bad flag never leaves a black page.
 */
export async function createFarmRenderer(canvas: HTMLCanvasElement): Promise<CreatedRenderer> {
  let fallbackReason: string | null = null
  let drawingCanvas = canvas
  if (requestedBackend() === 'webgpu') {
    fallbackReason = await webgpuAdapterAvailable()
    if (!fallbackReason) {
      try {
        const [{ WebGPURenderer }, { createWebGPUKit }] = await Promise.all([import('three/webgpu'), import('./webgpu/kit')])
        const renderer = new WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
        await renderer.init()
        kit = createWebGPUKit()
        activeBackend = 'webgpu'
        return { renderer, backend: 'webgpu', fallbackReason: null }
      } catch (error) {
        fallbackReason = `WebGPU init failed: ${error instanceof Error ? error.message : String(error)}`
        // A canvas that already handed out a WebGPU context cannot give out a WebGL one.
        const fresh = canvas.cloneNode(false) as HTMLCanvasElement
        canvas.replaceWith(fresh)
        drawingCanvas = fresh
      }
    }
    const asked = new URLSearchParams(window.location.search).has('renderer')
    ;(asked ? console.warn : console.info)(`[renderer] ${fallbackReason}; using WebGL`)
  }
  const renderer = new THREE.WebGLRenderer({ canvas: drawingCanvas, antialias: true, powerPreference: 'high-performance' })
  return { renderer, backend: 'webgl', fallbackReason }
}

/** Draw calls and triangles of the frame since the last `info.reset()`. */
export function frameRenderStats(renderer: FarmRenderer): { renderCalls: number; triangles: number } {
  if (isWebGPURenderer(renderer)) {
    // `render.calls` is a lifetime counter under WebGPU; `drawCalls` is the per-frame one.
    return { renderCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles }
  }
  return { renderCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
}

/**
 * The shader programs WebGL holds right now, and the id of the newest one, or
 * null on WebGPU (its pipelines are not counted the same way). Ids only grow,
 * so a newer id means a program was built, even if an old one was released in
 * between. One built while a scene plays is a mid-play compile, the classic hitch.
 */
export function shaderProgramStats(renderer: FarmRenderer): { readonly live: number; readonly newestId: number } | null {
  if (isWebGPURenderer(renderer)) return null
  const programs = renderer.info.programs ?? []
  return { live: programs.length, newestId: programs.reduce((newest, program) => Math.max(newest, program.id), 0) }
}

/**
 * Compile every program a scene needs before its first frame. WebGPU compiles
 * pipelines asynchronously (and stalls the first frame if not asked to).
 *
 * Both renderers skip hidden objects, and WebGPU skips ones outside the view
 * too. With `includeHidden` those are compiled as well: the care minigames keep
 * their hit effects hidden until a hit (a dewdrop's glint, a splash ring), and
 * left out they compiled on the very frame of the hit. Both renderers gather
 * the scene synchronously at the call, so it is restored before any frame
 * draws it.
 */
export async function precompile(renderer: FarmRenderer, scene: THREE.Scene, camera: THREE.Camera, includeHidden = false): Promise<void> {
  const restore = includeHidden ? revealForCompile(scene) : () => {}
  try {
    // Both start every compile at the call, then resolve once the programs are
    // ready: WebGPU's pipelines, and WebGL's by polling, without blocking, where
    // the browser has KHR_parallel_shader_compile.
    const compiling = renderer.compileAsync(scene, camera)
    restore()
    await compiling
  } finally {
    restore()
  }
}

/**
 * WebGL only: draw a scene once, hidden objects included, into a single pixel.
 * `compile` starts every program, but three.js checks a program the first time
 * it draws with it, and that check waits for the driver to finish compiling.
 * Drawing once here, while something covers the stage, moves that wait off the
 * frame where a hidden effect first shows. A 1x1 scissor keeps the draw out of
 * sight and keeps the screen's own program variants (a render target would
 * build different ones). WebGPU awaits its pipelines in `precompile`, so this
 * is a no-op there.
 */
export function warmDraw(renderer: FarmRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
  if (isWebGPURenderer(renderer)) return
  const restore = revealForCompile(scene)
  const viewport = renderer.getViewport(new THREE.Vector4())
  const scissor = renderer.getScissor(new THREE.Vector4())
  const scissorTest = renderer.getScissorTest()
  try {
    renderer.setViewport(0, 0, 1, 1)
    renderer.setScissor(0, 0, 1, 1)
    renderer.setScissorTest(true)
    renderer.render(scene, camera)
  } finally {
    renderer.setViewport(viewport)
    renderer.setScissor(scissor)
    renderer.setScissorTest(scissorTest)
    restore()
  }
}

function revealForCompile(scene: THREE.Scene): () => void {
  const hidden: THREE.Object3D[] = []
  const culled: THREE.Object3D[] = []
  scene.traverse((object) => {
    if (!object.visible) {
      hidden.push(object)
      object.visible = true
    }
    if (object.frustumCulled) {
      culled.push(object)
      object.frustumCulled = false
    }
  })
  let restored = false
  return () => {
    if (restored) return
    restored = true
    for (const object of hidden) object.visible = false
    for (const object of culled) object.frustumCulled = true
  }
}
