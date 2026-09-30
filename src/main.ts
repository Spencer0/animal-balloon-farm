import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions } from './animals/animal-catalog'
import { createFarmExpansionUI } from './game/farm-expansion-ui'
import type { FarmExpansionState } from './game/farm-expansion'
import { createFairground, createSkyDome, GARDEN_BOUNDS, GARDEN_LAWN_Y } from './scene/fairground'
import { createCaptureShowcaseStage } from './scene/capture-showcase'
import { createCaptureShowcaseUI, createShowcaseLaunchButton } from './ui/capture-showcase-ui'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { GARDEN_TOOLS } from './scene/garden-tool-art'
import { createGardenToolsUI } from './ui/garden-tools-ui'
import { createJournalUI } from './ui/journal-ui'

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
renderer.info.autoReset = false // reset manually each frame so stats survive the HUD pass

const scene = new THREE.Scene()
scene.background = new THREE.Color('#a7d5d3')
scene.add(createSkyDome())

const pageParams = new URLSearchParams(window.location.search)
const showcaseMode = pageParams.has('showcase')
const gardenDebugMode = pageParams.has('gardenDebug') && !showcaseMode
const normalViewHeight = 39.5
const showcaseViewHeight = 22

const cameraTarget = new THREE.Vector3(0, 1.25, 0)
let expansionFeedbackSeconds = 0
let expansionFeedbackStrength = 0
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
// The height field is the terrain source of truth; the soil sits 12 mm below
// the lawn paint layer so the two displaced planes never z-fight. Cache active
// bounds once per frame so tool/terrain hot loops don't allocate state objects.
let currentGardenBounds: typeof GARDEN_BOUNDS = GARDEN_BOUNDS
const activeGardenBounds = (): typeof GARDEN_BOUNDS => currentGardenBounds
const gardenTerrain = !showcaseMode && fairground.gardenSurface && fairground.gardenSoil
  ? createGardenTerrain([
      { mesh: fairground.gardenSoil, offset: -0.012, soilRings: true },
      { mesh: fairground.gardenSurface },
    ], activeGardenBounds)
  : null
gardenTerrain?.applyToMeshes()
const gardenTools: GardenTools | null = !showcaseMode && fairground.gardenSurface && fairground.gardenSoil && gardenTerrain
  ? createGardenTools(gameCanvas, camera, fairground.gardenSurface, gardenTerrain, activeGardenBounds)
  : null
if (gardenTools) scene.add(gardenTools.root)
const gardenToolsUI = gardenTools ? createGardenToolsUI(gardenTools.selectedTool) : null
const pressedKeys = new Set<string>()
let pointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
let pointerWasSeen = false
const CAMERA_EDGE_MARGIN = 34
const CAMERA_BASE_SPEED = 12
const CAMERA_MAX_SPEED = 27
const CAMERA_MIN_ZOOM = 1.25
const CAMERA_MAX_ZOOM = 34

function isOverGameHUD(clientX: number, clientY: number): boolean {
  if (showcaseMode) return false
  const toolScale = Math.min(1, Math.max(0.62, (window.innerWidth - 24) / (2 * 360 + 10 + 24)))
  const toolWidth = (2 * 360 + 10) * toolScale
  const toolHeight = 84 * toolScale
  const toolLeft = (window.innerWidth - toolWidth) / 2
  const toolTop = window.innerHeight - 20 - toolHeight
  if (clientY >= toolTop && clientY <= window.innerHeight - 20
    && clientX >= toolLeft && clientX <= toolLeft + toolWidth) return true

  const expansionScale = THREE.MathUtils.clamp((window.innerWidth - 36) / 404, 0.5, 1)
  const expansionWidth = 404 * expansionScale
  const expansionHeight = 112 * expansionScale
  if (clientX >= 18 && clientX <= 18 + expansionWidth
    && clientY >= 18 && clientY <= 18 + expansionHeight) return true

  const launchButton = document.querySelector<HTMLElement>('.showcase-launch-button')
  if (launchButton) {
    const bounds = launchButton.getBoundingClientRect()
    if (clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) return true
  }
  return false
}

const farmExpansionUI = fairground.farmExpansion
  ? createFarmExpansionUI(window.innerWidth, window.innerHeight, fairground.farmExpansion.state)
  : null
const journalUI = !showcaseMode ? createJournalUI(gameCanvas) : null
const performanceOverlay = gardenDebugMode ? createPerformanceOverlay() : null
let lastExpansionLevel = fairground.farmExpansion?.state.level ?? 0

// Catalog entries stay the single source of truth; attach live garden bounds
// and HUD hit testing so animals roam into newly opened land safely.
const animals: BalloonAnimal[] = await Promise.all(getAnimalSceneOptions(
  showcaseMode,
  gameCanvas,
  camera,
  gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined,
).map((options) => createBalloonAnimal(fairground.root, {
  ...options,
  getGardenBounds: activeGardenBounds,
  isPointerBlocked: isOverGameHUD,
})))
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

const viewDirection = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize()
const cameraShakeOffset = new THREE.Vector3()
const CAMERA_SHAKE_DURATION = 0.82
const CAMERA_SHAKE_AMPLITUDE = 0.38

function gardenScreenPosition(x: number, z: number): { readonly x: number; readonly y: number } {
  const world = new THREE.Vector3(x, GARDEN_LAWN_Y + 0.008, z).project(camera)
  return { x: (world.x + 1) * window.innerWidth / 2, y: (1 - world.y) * window.innerHeight / 2 }
}

let viewHalfHeight = viewHeight / 2
let dragPointer: number | null = null
let dragMode: 'orbit' | 'pan' | null = null
let toolPointer: number | null = null
let previousPointer = { x: 0, y: 0 }
let spaceHeld = false

function selectGardenToolByHotkey(key: string): boolean {
  const tool = GARDEN_TOOLS.find((item) => item.hotkey === key)
  if (!tool || !gardenTools) return false
  // Tapping the active tool's hotkey cycles its brush size instead of re-selecting.
  if (gardenTools.selectedTool === tool.id) gardenTools.cycleBrushSize()
  else {
    gardenTools.selectTool(tool.id)
    gardenToolsUI?.selectTool(tool.id)
  }
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

function updateCameraPan(deltaSeconds: number): void {
  if (showcaseMode || deltaSeconds <= 0 || spaceHeld) return
  let horizontal = Number(pressedKeys.has('d') || pressedKeys.has('arrowright'))
    - Number(pressedKeys.has('a') || pressedKeys.has('arrowleft'))
  let vertical = Number(pressedKeys.has('w') || pressedKeys.has('arrowup'))
    - Number(pressedKeys.has('s') || pressedKeys.has('arrowdown'))
  let edgeStrength = 0

  if (pointerWasSeen && dragPointer === null && toolPointer === null
    && !isOverGameHUD(pointerPosition.x, pointerPosition.y)) {
    if (pointerPosition.x < CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((CAMERA_EDGE_MARGIN - pointerPosition.x) / CAMERA_EDGE_MARGIN, 0, 1)
      horizontal -= strength
      edgeStrength = Math.max(edgeStrength, strength)
    } else if (pointerPosition.x > window.innerWidth - CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((pointerPosition.x - (window.innerWidth - CAMERA_EDGE_MARGIN)) / CAMERA_EDGE_MARGIN, 0, 1)
      horizontal += strength
      edgeStrength = Math.max(edgeStrength, strength)
    }
    if (pointerPosition.y < CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((CAMERA_EDGE_MARGIN - pointerPosition.y) / CAMERA_EDGE_MARGIN, 0, 1)
      vertical += strength
      edgeStrength = Math.max(edgeStrength, strength)
    } else if (pointerPosition.y > window.innerHeight - CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((pointerPosition.y - (window.innerHeight - CAMERA_EDGE_MARGIN)) / CAMERA_EDGE_MARGIN, 0, 1)
      vertical -= strength
      edgeStrength = Math.max(edgeStrength, strength)
    }
  }

  const inputLength = Math.hypot(horizontal, vertical)
  if (inputLength < 0.001) return
  if (inputLength > 1) {
    horizontal /= inputLength
    vertical /= inputLength
  }

  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  cameraRight.y = 0
  cameraRight.normalize()
  const cameraForward = new THREE.Vector3().subVectors(cameraTarget, camera.position)
  cameraForward.y = 0
  cameraForward.normalize()
  const direction = cameraRight.multiplyScalar(horizontal).addScaledVector(cameraForward, vertical)
  if (direction.lengthSq() < 0.0001) return
  direction.normalize()
  const zoomScale = viewHalfHeight / (normalViewHeight / 2)
  const speed = THREE.MathUtils.lerp(CAMERA_BASE_SPEED, CAMERA_MAX_SPEED, edgeStrength) * zoomScale
  const movement = direction.multiplyScalar(speed * deltaSeconds)
  cameraTarget.add(movement)
  camera.position.add(movement)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

function removePreviousCameraShake(): void {
  if (cameraShakeOffset.lengthSq() === 0) return
  camera.position.sub(cameraShakeOffset)
  cameraTarget.sub(cameraShakeOffset)
  cameraShakeOffset.set(0, 0, 0)
}

function applyExpansionCameraShake(deltaSeconds: number, elapsedSeconds: number): void {
  if (expansionFeedbackSeconds <= 0) {
    expansionFeedbackSeconds = 0
    expansionFeedbackStrength = 0
    return
  }
  expansionFeedbackSeconds = Math.max(0, expansionFeedbackSeconds - deltaSeconds)
  const envelope = expansionFeedbackSeconds / CAMERA_SHAKE_DURATION
  const amplitude = CAMERA_SHAKE_AMPLITUDE * expansionFeedbackStrength * envelope * envelope
  cameraShakeOffset.set(
    (Math.sin(elapsedSeconds * 51) + Math.sin(elapsedSeconds * 31 + 1.7) * 0.45) * amplitude,
    Math.sin(elapsedSeconds * 43 + 0.6) * amplitude * 0.16,
    (Math.cos(elapsedSeconds * 47 + 0.3) + Math.sin(elapsedSeconds * 29) * 0.35) * amplitude,
  )
  camera.position.add(cameraShakeOffset)
  cameraTarget.add(cameraShakeOffset)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

function orbitPointerDown(event: PointerEvent): void {
  if (journalUI?.pointerDown(event, gameCanvas)) return
  if (showcaseMode) {
    if (event.button === 0 && gardenToolsUI?.pointerDown(event, gameCanvas)) return
    return
  }
  if (event.button === 0 && event.detail >= 2) return
  // Middle click levels with the shovel; Space+left-drag explicitly orbits the camera.
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
  const cameraGesture = event.button === 2 || (event.button === 0 && spaceHeld)
  if (!cameraGesture && event.button === 0 && gardenToolsUI?.pointerDown(event, gameCanvas)) {
    // A HUD card click may have switched tools; keep the 3D tool in sync.
    if (gardenTools && gardenTools.selectedTool !== gardenToolsUI.selectedTool) {
      gardenTools.selectTool(gardenToolsUI.selectedTool)
    }
    return
  }
  // The HUD is rendered in front of the garden; clicks on its other panels
  // should not leak through as planting, shoveling, smoothing, or camera drags.
  if (!spaceHeld && isOverGameHUD(event.clientX, event.clientY)) {
    event.preventDefault()
    return
  }
  if (!cameraGesture && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  if (event.button === 1) return
  if (gardenDebugMode && !event.isTrusted) return
  dragPointer = event.pointerId
  dragMode = event.button === 2 ? 'pan' : 'orbit'
  previousPointer = { x: event.clientX, y: event.clientY }
  if (event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
}

function orbitPointerMove(event: PointerEvent): void {
  if (journalUI?.pointerMove(event, gameCanvas)) return
  if (isOverGameHUD(event.clientX, event.clientY)) gardenTools?.pointerLeave()
  else gardenTools?.pointerMove(event)
  if (toolPointer === event.pointerId || dragPointer !== event.pointerId) return
  const dx = event.clientX - previousPointer.x
  const dy = event.clientY - previousPointer.y
  previousPointer = { x: event.clientX, y: event.clientY }
  if (dragMode === 'pan') {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const panScale = viewHalfHeight / Math.max(1, window.innerHeight)
    const movement = cameraRight.multiplyScalar(-dx * panScale).addScaledVector(cameraUp, dy * panScale)
    cameraTarget.add(movement)
    camera.position.add(movement)
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
  dragMode = null
  if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
}

function preventCanvasMenu(event: MouseEvent): void {
  if (gardenTools && gardenTools.handleContextMenu(event)) return
  event.preventDefault()
}

function heightsSummary(): Record<string, unknown> | null {
  if (!gardenTerrain || !gardenTools) return null
  const stats = gardenTerrain.stats()
  const tool = gardenTools.debugState()
  return {
    ...stats,
    tool: tool.selectedTool,
    action: tool.activeAction,
  }
}

/**
 * Hold a shovel button over a GARDEN-SPACE point for holdMs, re-projecting the
 * point to screen every tick. Stays on target even when the camera drifted or
 * the terrain moves under the cursor, so harness holds land where intended.
 */
async function holdWorldButton(wx: number, wz: number, button: number, holdMs: number): Promise<void> {
  const buttons = button === 0 ? 1 : button === 1 ? 4 : 2
  const project = (): { x: number; y: number } => {
    const y = GARDEN_LAWN_Y + (gardenTerrain ? gardenTerrain.heightAt(wx, wz) : 0) + 0.008
    const world = new THREE.Vector3(wx, y, wz).project(camera)
    return { x: (world.x + 1) * window.innerWidth / 2, y: (1 - world.y) * window.innerHeight / 2 }
  }
  const moveOnce = (): void => {
    const point = project()
    gameCanvas.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
      pointerId: 9001,
      pointerType: 'mouse',
      buttons,
    }))
  }
  // The first synthetic move can absorb a one-time camera sync in the orbit
  // handler; project the press point only after that has settled.
  moveOnce()
  const start = performance.now()
  const downPoint = project()
  gameCanvas.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX: downPoint.x,
    clientY: downPoint.y,
    pointerId: 9001,
    pointerType: 'mouse',
    button,
    buttons,
  }))
  while (performance.now() - start < Math.max(200, holdMs)) {
    await new Promise((resolve) => window.setTimeout(resolve, 80))
    moveOnce()
  }
  const upPoint = project()
  gameCanvas.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true,
    clientX: upPoint.x,
    clientY: upPoint.y,
    pointerId: 9001,
    pointerType: 'mouse',
    button,
    buttons: 0,
  }))
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
}

function handleToolKeyboard(event: KeyboardEvent): void {
  if (journalUI?.isOpen) {
    journalUI.handleKeyDown(event)
    return
  }
  if (journalUI?.handleKeyDown(event)) return
  if (event.altKey || event.ctrlKey || event.metaKey || isTextInputTarget(event.target)) return
  if (event.code === 'Space') {
    spaceHeld = true
    event.preventDefault()
    return
  }
  const key = event.key.toLowerCase()
  const panKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)
  if (panKey) {
    pressedKeys.add(key)
    event.preventDefault()
    return
  }
  if (key === 'e' && !showcaseMode && fairground.farmExpansion) {
    event.preventDefault()
    if (!event.repeat) fairground.farmExpansion.expand()
    return
  }
  if (event.repeat) return
  if (selectGardenToolByHotkey(key)) event.preventDefault()
}

function handleKeyUp(event: KeyboardEvent): void {
  pressedKeys.delete(event.key.toLowerCase())
  if (event.code === 'Space') spaceHeld = false
  if (journalUI?.isOpen) return
  if (!isTextInputTarget(event.target) && ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(event.key.toLowerCase())) {
    event.preventDefault()
  }
}

function handleWindowPointerMove(event: PointerEvent): void {
  pointerPosition = { x: event.clientX, y: event.clientY }
  pointerWasSeen = event.clientX >= 0 && event.clientY >= 0
    && event.clientX <= window.innerWidth && event.clientY <= window.innerHeight
    && !isOverGameHUD(event.clientX, event.clientY)
}

function handleWindowBlur(): void {
  pressedKeys.clear()
  spaceHeld = false
  pointerWasSeen = false
}

function handleWindowLeave(): void {
  pointerWasSeen = false
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
  viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(event.deltaY * 0.001), CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
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
window.addEventListener('pointermove', handleWindowPointerMove)
window.addEventListener('keydown', handleToolKeyboard)
window.addEventListener('keyup', handleKeyUp)
window.addEventListener('blur', handleWindowBlur)
window.addEventListener('mouseleave', handleWindowLeave)

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

interface GardenRenderInfo {
  readonly calls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
}

interface GardenFrameTiming {
  readonly intervalMs: number
  readonly workMs: number
  readonly fairgroundMs: number
  readonly animalsMs: number
  readonly toolsMs: number
  readonly otherUpdateMs: number
  readonly sceneRenderMs: number
  readonly overlayRenderMs: number
}

interface GardenPerformanceSummary {
  readonly samples: number
  readonly fps: number
  readonly droppedFrames: number
  readonly zoom: number
  readonly bufferWidth: number
  readonly bufferHeight: number
  readonly renderCalls: number
  readonly triangles: number
  readonly intervalMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly workMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly updateMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly fairgroundMs: { readonly p95: number; readonly max: number }
  readonly animalsMs: { readonly p95: number; readonly max: number }
  readonly toolsMs: { readonly p95: number; readonly max: number }
  readonly otherUpdateMs: { readonly p95: number; readonly max: number }
  readonly sceneRenderMs: { readonly p95: number; readonly max: number }
  readonly overlayRenderMs: { readonly p95: number; readonly max: number }
}

interface GardenDebugHarness {
  readonly enabled: true
  state(): (ReturnType<GardenTools['debugState']> & { readonly screen: { readonly x: number; readonly y: number } | null; readonly sample: GardenSampleStatus; readonly render: GardenRenderInfo; readonly performance: GardenPerformanceSummary | null; readonly farmExpansion: FarmExpansionState | null }) | null;
  move(x: number, y: number): void
  down(x: number, y: number, button?: number): void
  trim(x: number, y: number): void
  pickReport(x: number, y: number): unknown
  dig(x: number, y: number, holdMs?: number): Promise<Record<string, unknown> | null>
  fill(x: number, y: number, holdMs?: number): Promise<Record<string, unknown> | null>
  level(x: number, y: number, holdMs?: number): Promise<Record<string, unknown> | null>
  digAt(wx: number, wz: number, holdMs?: number): Promise<Record<string, unknown> | null>
  fillAt(wx: number, wz: number, holdMs?: number): Promise<Record<string, unknown> | null>
  levelAt(wx: number, wz: number, holdMs?: number): Promise<Record<string, unknown> | null>
  heightAt(wx: number, wz: number): number
  splatDirect(wx: number, wz: number, radius: number, amount: number): number
  levelDirect(wx: number, wz: number, radius: number, strength: number): number
  heightsSummary(): Record<string, unknown> | null
  animalsSummary(): { id: string; y: number }[]
  drag(points: readonly { readonly x: number; readonly y: number }[], holdMs?: number): Promise<ReturnType<GardenDebugHarness['state']> | null>
  sampleGarden(columns?: number, rows?: number, holdMs?: number): GardenSampleStatus
  up(): void
  clearGrass(): void
  focusGarden(): void
}

interface PerformanceOverlay {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  update(now: number, summarize: () => GardenPerformanceSummary | null): void
  resize(width: number, height: number): void
  dispose(): void
}

const frameTimingSamples: GardenFrameTiming[] = []
const FRAME_TIMING_SAMPLE_LIMIT = 180
const FRAME_DROP_THRESHOLD_MS = 20
const PERF_OVERLAY_REFRESH_MS = 400
const PERF_LOG_INTERVAL_MS = 2000

function createPerformanceOverlay(): PerformanceOverlay {
  const scene = new THREE.Scene()
  scene.name = 'Debug performance HUD'
  const camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 100)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = 760
  canvas.height = 240
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for performance HUD')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(380, 120), material)
  panel.position.z = 2
  scene.add(panel)
  let viewportWidth = 1280
  let viewportHeight = 720
  let lastDrawAt = -PERF_OVERLAY_REFRESH_MS

  function resize(width: number, height: number): void {
    viewportWidth = width
    viewportHeight = height
    camera.left = -width / 2
    camera.right = width / 2
    camera.top = height / 2
    camera.bottom = -height / 2
    camera.updateProjectionMatrix()
    panel.position.set(-width / 2 + 205, height / 2 - 80, 2)
  }

  resize(viewportWidth, viewportHeight)
  return {
    scene,
    camera,
    resize,
    update(now, summarize): void {
      if (now - lastDrawAt < PERF_OVERLAY_REFRESH_MS) return
      lastDrawAt = now
      const summary = summarize()
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'rgba(18, 35, 33, 0.88)'
      context.strokeStyle = 'rgba(248, 225, 174, 0.78)'
      context.lineWidth = 3
      context.beginPath()
      context.roundRect(3, 3, canvas.width - 6, canvas.height - 6, 24)
      context.fill()
      context.stroke()
      context.textBaseline = 'middle'
      context.textAlign = 'left'
      context.font = 'bold 48px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillStyle = !summary || summary.fps >= 50 ? '#c9f29b' : summary.fps >= 30 ? '#ffd27a' : '#ff9988'
      context.fillText(`${summary?.fps.toFixed(0) ?? '--'} FPS`, 26, 48)
      context.font = '26px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillStyle = '#fff3d7'
      context.fillText(
        `frame p95 ${summary?.intervalMs.p95.toFixed(1) ?? '--'}ms · drops ${summary?.droppedFrames ?? '--'}`,
        26,
        104,
      )
      context.fillText(
        `CPU p95 ${summary?.workMs.p95.toFixed(1) ?? '--'}ms · render ${summary?.sceneRenderMs.p95.toFixed(1) ?? '--'}ms`,
        26,
        154,
      )
      context.font = '23px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillText(
        `zoom ${summary?.zoom.toFixed(1) ?? '--'}x · buffer ${summary?.bufferWidth ?? '--'}×${summary?.bufferHeight ?? '--'} · ${summary?.renderCalls ?? '--'} calls`,
        26,
        207,
      )
      texture.needsUpdate = true
    },
    dispose(): void {
      panel.geometry.dispose()
      texture.dispose()
      material.dispose()
      scene.clear()
    },
  }
}

function summarizeFrameTimings(): GardenPerformanceSummary | null {
  if (!frameTimingSamples.length) return null
  const percentile = (values: readonly number[], fraction: number): number => {
    const sorted = [...values].sort((a, b) => a - b)
    return +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(2)
  }
  const max = (values: readonly number[]): number => +Math.max(...values).toFixed(2)
  const get = (key: keyof GardenFrameTiming): number[] => frameTimingSamples.map((sample) => sample[key])
  const update = frameTimingSamples.map((sample) => sample.fairgroundMs + sample.animalsMs + sample.toolsMs + sample.otherUpdateMs)
  const intervals = get('intervalMs').filter((value) => value > 0)
  if (intervals.length === 0) return null
  const averageInterval = intervals.reduce((total, value) => total + value, 0) / intervals.length
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2())
  const summarize = (values: readonly number[]) => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: max(values) })
  const summarizeTail = (values: readonly number[]) => ({ p95: percentile(values, 0.95), max: max(values) })
  return {
    samples: intervals.length,
    fps: +(1000 / averageInterval).toFixed(1),
    droppedFrames: intervals.filter((value) => value > FRAME_DROP_THRESHOLD_MS).length,
    zoom: +(normalViewHeight / (viewHalfHeight * 2)).toFixed(2),
    bufferWidth: drawingBuffer.x,
    bufferHeight: drawingBuffer.y,
    renderCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    intervalMs: summarize(intervals),
    workMs: summarize(get('workMs')),
    updateMs: summarize(update),
    fairgroundMs: summarizeTail(get('fairgroundMs')),
    animalsMs: summarizeTail(get('animalsMs')),
    toolsMs: summarizeTail(get('toolsMs')),
    otherUpdateMs: summarizeTail(get('otherUpdateMs')),
    sceneRenderMs: summarizeTail(get('sceneRenderMs')),
    overlayRenderMs: summarizeTail(get('overlayRenderMs')),
  }
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
        render: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
        performance: summarizeFrameTimings(),
        farmExpansion: fairground.farmExpansion?.state ?? null,
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
        buttons: button === 0 ? 1 : button === 1 ? 4 : 2,
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
    async dig(x, y, holdMs = 700): Promise<Record<string, unknown> | null> {
      if (!gardenTools || !gardenTerrain) return null
      debugHarness.up()
      debugHarness.move(x, y)
      debugHarness.down(x, y)
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(200, holdMs)))
      debugHarness.up()
      return heightsSummary()
    },
    async fill(x, y, holdMs = 900): Promise<Record<string, unknown> | null> {
      if (!gardenTools || !gardenTerrain) return null
      debugHarness.up()
      debugHarness.move(x, y)
      debugHarness.down(x, y, 2)
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(200, holdMs)))
      debugHarness.up()
      return heightsSummary()
    },
    async level(x, y, holdMs = 1200): Promise<Record<string, unknown> | null> {
      if (!gardenTools || !gardenTerrain) return null
      debugHarness.up()
      debugHarness.move(x, y)
      debugHarness.down(x, y, 1)
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(200, holdMs)))
      debugHarness.up()
      return heightsSummary()
    },
    // World-space hold commands: they re-project the garden point to screen
    // every tick, so they stay on target no matter how the camera drifted —
    // unlike the screen-space variants, which trust a single projection.
    async digAt(wx, wz, holdMs = 700): Promise<Record<string, unknown> | null> {
      if (!gardenTools || !gardenTerrain) return null
      debugHarness.up()
      await holdWorldButton(wx, wz, 0, holdMs)
      return heightsSummary()
    },
    async fillAt(wx, wz, holdMs = 900): Promise<Record<string, unknown> | null> {
      if (!gardenTools || !gardenTerrain) return null
      debugHarness.up()
      await holdWorldButton(wx, wz, 2, holdMs)
      return heightsSummary()
    },
    async levelAt(wx, wz, holdMs = 1200): Promise<Record<string, unknown> | null> {
      if (!gardenTools || !gardenTerrain) return null
      debugHarness.up()
      await holdWorldButton(wx, wz, 1, holdMs)
      return heightsSummary()
    },
    heightAt(wx, wz): number {
      return gardenTerrain ? gardenTerrain.heightAt(wx, wz) : 0
    },
    // Direct terrain-math calls (no pointer path, no render loop): let checks
    // exercise splat/level deterministically even when the tab is throttled.
    splatDirect(wx, wz, radius, amount): number {
      return gardenTerrain ? gardenTerrain.splat(wx, wz, radius, amount) : 0
    },
    levelDirect(wx, wz, radius, strength): number {
      return gardenTerrain ? gardenTerrain.level(wx, wz, radius, strength) : 0
    },
    heightsSummary(): Record<string, unknown> | null {
      return heightsSummary()
    },
    animalsSummary(): { id: string; x: number; z: number; y: number }[] {
      return animals.map((animal) => ({
        id: animal.id,
        x: +animal.root.position.x.toFixed(2),
        z: +animal.root.position.z.toFixed(2),
        y: +animal.root.position.y.toFixed(3),
      }))
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
        gardenScreenPosition(-activeGardenBounds().halfWidth + 0.3, -activeGardenBounds().halfDepth + 0.3),
        gardenScreenPosition(activeGardenBounds().halfWidth - 0.3, -activeGardenBounds().halfDepth + 0.3),
        gardenScreenPosition(activeGardenBounds().halfWidth - 0.3, activeGardenBounds().halfDepth - 0.3),
        gardenScreenPosition(-activeGardenBounds().halfWidth + 0.3, activeGardenBounds().halfDepth - 0.3),
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
      cameraTarget.set(0, 1.25, 0)
      viewHalfHeight = normalViewHeight / 2
      camera.position.copy(cameraTarget).add(initialOffset)
      viewDirection.copy(initialOffset).normalize()
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld()
      updateCameraProjection()
    },
  }
  Object.defineProperty(window, '__gardenDebug', { value: debugHarness, configurable: true })
  window.dispatchEvent(new CustomEvent('garden-debug-ready'))

  console.info('[Garden Debug] Ready at window.__gardenDebug (move/down/dig/fill/trim/drag/sampleGarden/up/state/clearGrass/focusGarden/heightsSummary)')
}


window.addEventListener('resize', () => {
  updateCameraProjection()
  gardenToolsUI?.resize(window.innerWidth, window.innerHeight)
  farmExpansionUI?.resize(window.innerWidth, window.innerHeight)
  journalUI?.resize(window.innerWidth, window.innerHeight)
  performanceOverlay?.resize(window.innerWidth, window.innerHeight)
})

updateCameraProjection()
gardenToolsUI?.resize(window.innerWidth, window.innerHeight)
farmExpansionUI?.resize(window.innerWidth, window.innerHeight)
journalUI?.resize(window.innerWidth, window.innerHeight)
performanceOverlay?.resize(window.innerWidth, window.innerHeight)

let previousTime = performance.now()
let lastPerformanceLogAt = previousTime
let previousFrameTimestamp: number | null = null
function frame(now: number): void {
  const intervalMs = previousFrameTimestamp === null ? 0 : now - previousFrameTimestamp
  previousFrameTimestamp = now
  const timingEnabled = gardenDebugMode
  const workStartedAt = timingEnabled ? performance.now() : 0
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  let stageStartedAt = workStartedAt
  removePreviousCameraShake()
  fairground.update(delta)
  const fairgroundMs = timingEnabled ? performance.now() - stageStartedAt : 0
  currentGardenBounds = fairground.farmExpansion?.state.bounds ?? GARDEN_BOUNDS
  stageStartedAt = timingEnabled ? performance.now() : 0
  animals.forEach((animal) => animal.update(delta))
  const animalsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  gardenTools?.update(delta)
  const toolsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  showcaseUI?.update(animals)
  const expansionState = fairground.farmExpansion?.state
  if (expansionState) {
    if (expansionState.level > lastExpansionLevel) {
      lastExpansionLevel = expansionState.level
      expansionFeedbackSeconds = CAMERA_SHAKE_DURATION
      expansionFeedbackStrength = 1
    }
    farmExpansionUI?.update(expansionState, delta)
  }
  updateCameraPan(delta)
  applyExpansionCameraShake(delta, now / 1000)
  if (pointerWasSeen) {
    if (isOverGameHUD(pointerPosition.x, pointerPosition.y)) gardenTools?.pointerLeave()
    else gardenTools?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
  }
  const otherUpdateMs = timingEnabled ? performance.now() - stageStartedAt : 0
  renderer.info.reset()
  stageStartedAt = timingEnabled ? performance.now() : 0
  renderer.render(scene, camera)
  const sceneRenderMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  if (gardenToolsUI || farmExpansionUI) {
    renderer.autoClear = false
    renderer.clearDepth()
    if (gardenToolsUI) renderer.render(gardenToolsUI.scene, gardenToolsUI.camera)
    if (farmExpansionUI) {
      renderer.clearDepth()
      renderer.render(farmExpansionUI.scene, farmExpansionUI.camera)
    }
    renderer.autoClear = true
  }
  if (journalUI) {
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(journalUI.scene, journalUI.camera)
    renderer.autoClear = true
  }
  let overlayRenderMs = 0
  if (performanceOverlay) {
    performanceOverlay.update(now, summarizeFrameTimings)
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(performanceOverlay.scene, performanceOverlay.camera)
    renderer.autoClear = true
  }
  if (timingEnabled) {
    const finishedAt = performance.now()
    overlayRenderMs = finishedAt - stageStartedAt
    frameTimingSamples.push({
      intervalMs,
      workMs: finishedAt - workStartedAt,
      fairgroundMs,
      animalsMs,
      toolsMs,
      otherUpdateMs,
      sceneRenderMs,
      overlayRenderMs,
    })
    if (frameTimingSamples.length > FRAME_TIMING_SAMPLE_LIMIT) frameTimingSamples.shift()
    if (now - lastPerformanceLogAt >= PERF_LOG_INTERVAL_MS) {
      lastPerformanceLogAt = now
      const summary = summarizeFrameTimings()
      if (summary) {
        console.info(`[Frame Performance] ${JSON.stringify(summary)}`)
      }
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
