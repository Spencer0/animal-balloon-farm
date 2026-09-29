import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { createFairground, createSkyDome, GARDEN_BOUNDS, GARDEN_LAWN_Y } from './scene/fairground'
import { createCaptureShowcaseStage, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createCaptureShowcaseUI, createShowcaseLaunchButton } from './ui/capture-showcase-ui'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { GARDEN_TOOLS } from './scene/garden-tool-art'
import { createGardenToolsUI } from './ui/garden-tools-ui'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('Missing game canvas')
const gameCanvas = canvas

const renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true, powerPreference: 'high-performance' })
// Cap the drawing buffer below the display pixel ratio: at devicePixelRatio the
// canvas raster gets enormous (and so do any screenshots of it). 1.25 keeps
// edges acceptably smooth while keeping captures far under attachment limits.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.info.autoReset = true

const scene = new THREE.Scene()
scene.background = new THREE.Color('#a7d5d3')
scene.add(createSkyDome())

const pageParams = new URLSearchParams(window.location.search)
const showcaseMode = pageParams.has('showcase')
const gardenDebugMode = pageParams.has('gardenDebug') && !showcaseMode
const normalViewHeight = 39.5
const showcaseViewHeight = 22

const cameraTarget = new THREE.Vector3(0, 1.25, 0)
const aspect = window.innerWidth / Math.max(1, window.innerHeight)
const viewHeight = showcaseMode ? showcaseViewHeight : normalViewHeight
const camera = new THREE.OrthographicCamera(
  -(viewHeight * aspect) / 2,
  (viewHeight * aspect) / 2,
  viewHeight / 2,
  -viewHeight / 2,
  0.1,
  720,
)
const initialOffset = showcaseMode ? new THREE.Vector3(20, 24, 28) : new THREE.Vector3(35, 34, 47)
camera.position.copy(cameraTarget).add(initialOffset)
camera.lookAt(cameraTarget)

const ambient = new THREE.HemisphereLight('#fff0ce', '#70975c', 1.85)
scene.add(ambient)

const sunlight = new THREE.DirectionalLight('#fff0d6', 3.0)
sunlight.position.set(-22, 42, 17)
sunlight.castShadow = true
sunlight.shadow.mapSize.set(2048, 2048)
sunlight.shadow.camera.left = -52
sunlight.shadow.camera.right = 52
sunlight.shadow.camera.top = 52
sunlight.shadow.camera.bottom = -52
sunlight.shadow.camera.near = 0.5
sunlight.shadow.camera.far = 145
sunlight.shadow.bias = -0.00028
sunlight.shadow.normalBias = 0.025
sunlight.shadow.radius = 5
sunlight.target.position.set(0, 0, 0)
scene.add(sunlight, sunlight.target)

const fill = new THREE.DirectionalLight('#c1edec', 0.82)
fill.position.set(27, 22, 28)
scene.add(fill)

const rim = new THREE.DirectionalLight('#ffbf9a', 1.15)
rim.position.set(1, 24, -32)
scene.add(rim)

const fairground = showcaseMode ? createCaptureShowcaseStage() : createFairground()
scene.add(fairground.root)
const gardenTools: GardenTools | null = !showcaseMode && fairground.gardenSurface
  ? createGardenTools(gameCanvas, camera, fairground.gardenSurface)
  : null
if (gardenTools) scene.add(gardenTools.root)
const gardenToolsUI = gardenTools ? createGardenToolsUI() : null

// Animals arrive in wild balloon red. Capturing changes their materials in place, then restores
// each animal's palette through a shared 6.8-second paint-bucket reveal.
const animalSceneOptions = { canvas: gameCanvas, camera } as const
const animalDefinitions = [
  {
    id: 'pig', assetUrl: 'assets/animals/balloon-pig.glb', name: 'pig', spawn: showcaseMode ? SHOWCASE_ANIMALS.pig.spawn : [-7, -3.8] as const,
    groundY: GARDEN_LAWN_Y, seed: 5104, size: 2.05, speed: 1.25, bounds: { x: 11.2, z: 6.5 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'sheep', assetUrl: 'assets/animals/balloon-sheep.glb', name: 'sheep', spawn: showcaseMode ? SHOWCASE_ANIMALS.sheep.spawn : [-3.2, 2.1] as const,
    groundY: GARDEN_LAWN_Y, seed: 861, size: 2.1, speed: 0.88, bounds: { x: 10.9, z: 6.2 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'cow', assetUrl: 'assets/animals/balloon-cow.glb', name: 'cow', spawn: showcaseMode ? SHOWCASE_ANIMALS.cow.spawn : [4.4, 2.8] as const,
    groundY: GARDEN_LAWN_Y, seed: 1402, size: 2.7, speed: 0.72, bounds: { x: 10.7, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'chicken', assetUrl: 'assets/animals/balloon-chicken.glb', name: 'chicken', spawn: showcaseMode ? SHOWCASE_ANIMALS.chicken.spawn : [7.4, -1.1] as const,
    groundY: GARDEN_LAWN_Y, seed: 2406, size: 1.85, speed: 1.02, bounds: { x: 10.5, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'duck', assetUrl: 'assets/animals/balloon-duck.glb', name: 'duck', spawn: showcaseMode ? SHOWCASE_ANIMALS.duck.spawn : [-8.0, 3.5] as const,
    groundY: GARDEN_LAWN_Y, seed: 3128, size: 2.0, speed: 0.92, bounds: { x: 10.5, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'goose', assetUrl: 'assets/animals/balloon-goose.glb', name: 'goose', spawn: showcaseMode ? SHOWCASE_ANIMALS.goose.spawn : [0.4, -5.0] as const,
    groundY: GARDEN_LAWN_Y, seed: 4801, size: 2.35, speed: 0.8, bounds: { x: 10.5, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
] as const
const animals: BalloonAnimal[] = await Promise.all(animalDefinitions.map((definition) =>
  createBalloonAnimal(fairground.root, { ...animalSceneOptions, ...definition }),
))

const animalById = new Map(animals.map((animal) => [animal.id, animal]))
if (!showcaseMode) {
  createShowcaseLaunchButton(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('showcase', '1')
    window.location.assign(url)
  })
}
const showcaseUI = showcaseMode
  ? createCaptureShowcaseUI({
      onPlayAll: () => {
        for (const animal of animals) {
          if (animal.isCaptured) animal.setAppearance('wild')
          animal.beginCapture()
        }
      },
      onResetAll: () => animals.forEach((animal) => animal.setAppearance('wild')),
      onExit: () => {
        const url = new URL(window.location.href)
        url.searchParams.delete('showcase')
        window.location.assign(url)
      },
      onReplay: (animalId) => {
        const animal = animalById.get(animalId)
        if (!animal) return
        if (animal.isCaptured) animal.setAppearance('wild')
        animal.beginCapture()
      },
    })
  : null
if (showcaseMode) document.title = 'Capture Showcase · Animal Balloon Farm'

const targetOffset = new THREE.Vector3()
const viewDirection = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize()

function gardenScreenPosition(x: number, z: number): { readonly x: number; readonly y: number } {
  const world = new THREE.Vector3(x, GARDEN_LAWN_Y + 0.008, z).project(camera)
  return { x: (world.x + 1) * window.innerWidth / 2, y: (1 - world.y) * window.innerHeight / 2 }
}

let cameraDistance = initialOffset.length()
let viewHalfHeight = viewHeight / 2
let dragPointer: number | null = null
let toolPointer: number | null = null
let previousPointer = { x: 0, y: 0 }
let pointerButton = 0

function selectGardenToolByHotkey(key: string): boolean {
  const tool = GARDEN_TOOLS.find((item) => item.hotkey === key)
  if (!tool || !gardenTools) return false
  gardenTools.selectTool(tool.id)
  return true
}

function updateCameraProjection(): void {
  const width = window.innerWidth
  const height = window.innerHeight
  const currentAspect = width / Math.max(1, height)
  camera.left = -(viewHalfHeight * currentAspect)
  camera.right = viewHalfHeight * currentAspect
  camera.top = viewHalfHeight
  camera.bottom = -viewHalfHeight
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function orbitPointerDown(event: PointerEvent): void {
  if (showcaseMode) {
    if (event.button === 0 && gardenToolsUI?.pointerDown(event, gameCanvas)) return
    return
  }
  if (event.button === 0 && event.detail >= 2) return
  if (event.button !== 0 && event.button !== 2) return
  if (gardenToolsUI?.pointerDown(event, gameCanvas)) return
  if (gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  if (gardenDebugMode) return
  dragPointer = event.pointerId
  pointerButton = event.button
  previousPointer = { x: event.clientX, y: event.clientY }
  gameCanvas.setPointerCapture(event.pointerId)
}

function orbitPointerMove(event: PointerEvent): void {
  gardenTools?.pointerMove(event)
  if (toolPointer === event.pointerId || dragPointer !== event.pointerId) return
  const dx = event.clientX - previousPointer.x
  const dy = event.clientY - previousPointer.y
  previousPointer = { x: event.clientX, y: event.clientY }
  if (pointerButton === 2) {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const panScale = viewHalfHeight / Math.max(1, window.innerHeight)
    targetOffset.addScaledVector(cameraRight, -dx * panScale)
    targetOffset.addScaledVector(cameraUp, dy * panScale)
    cameraTarget.add(targetOffset)
    camera.position.copy(cameraTarget).addScaledVector(viewDirection, cameraDistance)
    camera.lookAt(cameraTarget)
    camera.updateMatrixWorld()
    return
  }

  const offset = new THREE.Vector3().subVectors(camera.position, cameraTarget)
  const spherical = new THREE.Spherical().setFromVector3(offset)
  spherical.theta -= dx * 0.0048
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * 0.0032, 0.36, 1.17)
  offset.setFromSpherical(spherical)
  viewDirection.copy(offset).normalize()
  camera.position.copy(cameraTarget).add(offset)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

function orbitPointerUp(event: PointerEvent): void {
  gardenTools?.pointerUp()
  if (toolPointer === event.pointerId) {
    toolPointer = null
    if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
    return
  }
  if (dragPointer !== event.pointerId) return
  dragPointer = null
  if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
}

function preventCanvasMenu(event: MouseEvent): void {
  if (gardenTools && gardenTools.handleContextMenu(event)) return
  event.preventDefault()
}

function handleToolKeyboard(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return
  const key = event.key.toLowerCase()
  if (selectGardenToolByHotkey(key)) {
    event.preventDefault()
    return
  }
}

function handleWindowPointerUp(): void {
  gardenTools?.pointerUp()
}

function handleCanvasLeave(): void {
  // Keep painting when the pointer merely slips off the canvas edge mid-hold
  // (it can return without a new press); only the true garden bounds hide the
  // cursor, which garden-tools handles itself.
  if (!toolPointer) gardenTools?.pointerLeave()
}

function handleZoom(event: WheelEvent): void {
  event.preventDefault()
  viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(event.deltaY * 0.001), 1.25, 34)
  updateCameraProjection()
}

gameCanvas.addEventListener('pointerdown', orbitPointerDown)
gameCanvas.addEventListener('pointermove', orbitPointerMove)
gameCanvas.addEventListener('pointerup', orbitPointerUp)
gameCanvas.addEventListener('pointercancel', orbitPointerUp)
gameCanvas.addEventListener('pointerleave', handleCanvasLeave)
gameCanvas.addEventListener('contextmenu', preventCanvasMenu)
gameCanvas.addEventListener('wheel', handleZoom, { passive: false })
window.addEventListener('pointerup', handleWindowPointerUp)
window.addEventListener('keydown', handleToolKeyboard)

declare global {
  interface Window {
    __gardenDebug?: GardenDebugHarness
  }
}

interface GardenSampleStatus {
  readonly id: number
  readonly running: boolean
  readonly startedAt: number | null
  readonly finishedAt: number | null
  readonly error: string | null
}

interface GardenDebugHarness {
  readonly enabled: true
  state(): (ReturnType<GardenTools['debugState']> & { readonly screen: { readonly x: number; readonly y: number } | null; readonly sample: GardenSampleStatus }) | null
  move(x: number, y: number): void
  down(x: number, y: number, button?: number): void
  trim(x: number, y: number): void
  pickReport(x: number, y: number): unknown
  drag(points: readonly { readonly x: number; readonly y: number }[], holdMs?: number): Promise<ReturnType<GardenDebugHarness['state']> | null>
  sampleGarden(columns?: number, rows?: number, holdMs?: number): GardenSampleStatus
  up(): void
  clearGrass(): void
  focusGarden(): void
}

if (gardenDebugMode) {
  let sampleRunId = 0
  let sampleStatus: GardenSampleStatus = { id: 0, running: false, startedAt: null, finishedAt: null, error: null }
  const debugHarness: GardenDebugHarness = {
    enabled: true,
    state: () => {
      const state = gardenTools?.debugState()
      if (!state) return null
      return {
        ...state,
        screen: state.cursor ? gardenScreenPosition(state.cursor.x, state.cursor.z) : null,
        sample: sampleStatus,
      }
    },
    move(x, y): void {
      gameCanvas.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerId: 9001,
        pointerType: 'mouse',
        buttons: 1,
      }))
    },
    down(x, y, button = 0): void {
      gameCanvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 9001,
        pointerType: 'mouse',
        button,
        buttons: button === 2 ? 2 : 1,
      }))
    },
    trim(x, y): void {
      debugHarness.up()
      debugHarness.down(x, y, 2)
      debugHarness.up()
    },
    pickReport(x, y): unknown {
      return gardenTools?.pickReport(x, y) ?? null
    },
    async drag(points, holdMs = 1200): Promise<ReturnType<GardenDebugHarness['state']> | null> {
      if (!gardenTools || points.length === 0) return null
      debugHarness.up()
      debugHarness.move(points[0].x, points[0].y)
      debugHarness.down(points[0].x, points[0].y)
      const duration = Math.max(0, holdMs)
      const movementSteps = points.slice(1).reduce((total, point, index) => {
        const previous = points[index]
        return total + Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 12))
      }, 0)
      const stepCount = Math.max(1, movementSteps)
      const interval = duration / stepCount
      let traversedSteps = 0
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]
        const point = points[index]
        const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 12))
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps
          debugHarness.move(previous.x + (point.x - previous.x) * progress, previous.y + (point.y - previous.y) * progress)
          traversedSteps += 1
          await new Promise<void>((resolve) => window.setTimeout(resolve, interval))
        }
      }
      const remaining = duration - traversedSteps * interval
      if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining))
      debugHarness.up()
      return debugHarness.state()
    },
    sampleGarden(columns = 5, rows = 4, holdMs = 25000): GardenSampleStatus {
      if (!gardenTools) return sampleStatus
      debugHarness.clearGrass()
      debugHarness.focusGarden()
      const corners = [
        gardenScreenPosition(-GARDEN_BOUNDS.halfWidth + 0.3, -GARDEN_BOUNDS.halfDepth + 0.3),
        gardenScreenPosition(GARDEN_BOUNDS.halfWidth - 0.3, -GARDEN_BOUNDS.halfDepth + 0.3),
        gardenScreenPosition(GARDEN_BOUNDS.halfWidth - 0.3, GARDEN_BOUNDS.halfDepth - 0.3),
        gardenScreenPosition(-GARDEN_BOUNDS.halfWidth + 0.3, GARDEN_BOUNDS.halfDepth - 0.3),
      ]
      const top = corners.reduce((best, point) => point.y < best.y ? point : best)
      const bottom = corners.reduce((best, point) => point.y > best.y ? point : best)
      const points: { x: number; y: number }[] = []
      const sampleLines: { y: number; left: number; right: number }[] = []
      const safeColumns = Math.max(2, Math.floor(columns))
      const safeRows = Math.max(2, Math.floor(rows))
      for (let row = 0; row < safeRows; row += 1) {
        const y = top.y + (bottom.y - top.y) * (0.08 + (row / (safeRows - 1)) * 0.84)
        const intersections: number[] = []
        for (let index = 0; index < corners.length; index += 1) {
          const a = corners[index]
          const b = corners[(index + 1) % corners.length]
          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
            intersections.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x))
          }
        }
        intersections.sort((a, b) => a - b)
        if (intersections.length >= 2) {
          const left = intersections[0]
          const right = intersections[intersections.length - 1]
          sampleLines.push({ y, left: left + (right - left) * 0.06, right: right - (right - left) * 0.06 })
        }
      }
      for (let row = 0; row < sampleLines.length; row += 1) {
        const line = sampleLines[row]
        const leftToRight = row % 2 === 0
        for (let column = 0; column < safeColumns; column += 1) {
          const progress = column / (safeColumns - 1)
          const xProgress = leftToRight ? progress : 1 - progress
          points.push({ x: line.left + (line.right - line.left) * xProgress, y: line.y })
        }
      }
      const id = ++sampleRunId
      sampleStatus = { id, running: true, startedAt: Date.now(), finishedAt: null, error: null }
      window.setTimeout(() => {
        void debugHarness.drag(points, holdMs).then(() => {
          if (sampleStatus.id !== id) return
          sampleStatus = { ...sampleStatus, running: false, finishedAt: Date.now() }
        }).catch((error: unknown) => {
          if (sampleStatus.id !== id) return
          sampleStatus = { ...sampleStatus, running: false, finishedAt: Date.now(), error: String(error) }
        })
      }, 0)
      return sampleStatus
    },
    up(): void {
      const cursor = gardenTools?.debugState().cursor
      const screen = cursor ? gardenScreenPosition(cursor.x, cursor.z) : null
      const clientX = screen?.x ?? 0
      const clientY = screen?.y ?? 0
      gameCanvas.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        clientX,
        clientY,
        pointerId: 9001,
        pointerType: 'mouse',
        button: 0,
        buttons: 0,
      }))
    },
    clearGrass(): void {
      debugHarness.up()
      gardenTools?.clearGrass()
    },
    focusGarden(): void {
      targetOffset.set(0, 0, 0)
      cameraTarget.set(0, 1.25, 0)
      viewHalfHeight = normalViewHeight / 2
      camera.position.copy(cameraTarget).add(initialOffset)
      viewDirection.copy(initialOffset).normalize()
      cameraDistance = initialOffset.length()
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld()
      updateCameraProjection()
    },
  }
  Object.defineProperty(window, '__gardenDebug', { value: debugHarness, configurable: true })
  window.dispatchEvent(new CustomEvent('garden-debug-ready'))
  console.info('[Garden Debug] Ready at window.__gardenDebug (move/down/trim/drag/sampleGarden/up/state/clearGrass/focusGarden)')
}

window.addEventListener('resize', () => {
  updateCameraProjection()
  gardenToolsUI?.resize(window.innerWidth, window.innerHeight)
})

updateCameraProjection()
gardenToolsUI?.resize(window.innerWidth, window.innerHeight)

let previousTime = performance.now()
function frame(now: number): void {
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  fairground.update(delta)
  animals.forEach((animal) => animal.update(delta))
  gardenTools?.update(delta)
  showcaseUI?.update(animals)
  renderer.render(scene, camera)
  if (gardenToolsUI) {
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(gardenToolsUI.scene, gardenToolsUI.camera)
    renderer.autoClear = true
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
