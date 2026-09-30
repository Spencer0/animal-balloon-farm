import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions } from './animals/animal-catalog'
import { createFairground, createSkyDome } from './scene/fairground'
import { createCaptureShowcaseStage, GARDEN_LAWN_Y, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { type GardenToolId } from './scene/garden-tool-art'
import { createUILayer, routePointer, type UIPanel } from './ui/ui-layer'
import { createJournalPanel } from './ui/journal-panel'
import { createMenuPanel, type MenuChoice } from './ui/menu-panel'
import { createToolsHud } from './ui/tools-hud'
import { setCursor } from './ui/ui-cursor'
import type { DesignPoint } from './ui/ui-viewport'
import { createViewerPanel } from './ui/viewer-panel'

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
const gardenDebugMode = pageParams.has('gardenDebug')
const normalViewHeight = 39.5
/**
 * The viewer looks at a small stage, so it zooms right in. The farm keeps its
 * own wide framing because the whole fairground has to fit on screen.
 */
const viewerViewHeight = 26
/**
 * How far below the stage the viewer's look-at point sits, in world units.
 * Lowering it lifts the stage up the screen so the animal tray along the
 * bottom does not cover the animals' feet.
 */
const viewerTargetY = -4.7

const cameraTarget = new THREE.Vector3(0, 1.25, 0)
const aspect = window.innerWidth / Math.max(1, window.innerHeight)
const viewHeight = normalViewHeight
const camera = new THREE.OrthographicCamera(
  -(viewHeight * aspect) / 2,
  (viewHeight * aspect) / 2,
  viewHeight / 2,
  -viewHeight / 2,
  0.1,
  720,
)
const initialOffset = new THREE.Vector3(35, 34, 47)
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

const fairground = createFairground()
scene.add(fairground.root)
// The height field is the terrain source of truth; the soil sits 12 mm below
// the lawn paint layer so the two displaced planes never z-fight.
const gardenTerrain = fairground.gardenSurface && fairground.gardenSoil
  ? createGardenTerrain([
      { mesh: fairground.gardenSoil, offset: -0.012, soilRings: true },
      { mesh: fairground.gardenSurface },
    ])
  : null
gardenTerrain?.applyToMeshes()
const gardenTools: GardenTools | null = fairground.gardenSurface && fairground.gardenSoil && gardenTerrain
  ? createGardenTools(gameCanvas, camera, fairground.gardenSurface, gardenTerrain)
  : null
if (gardenTools) scene.add(gardenTools.root)

// Animals arrive in wild balloon red. Capturing changes their materials in place, then restores
// each animal's palette through a shared 6.8-second paint-bucket reveal. Scene options come from
// the single ANIMAL_CATALOG source; groundSampler lets them follow the garden terrain height.
const animals: BalloonAnimal[] = await Promise.all(getAnimalSceneOptions(
  false,
  gameCanvas,
  camera,
  gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined,
).map((options) =>
  createBalloonAnimal(fairground.root, options),
))
const animalById = new Map(animals.map((animal) => [animal.id, animal]))

// The animals are created once and live in the fairground. The viewer borrows
// them onto its own plinths, so remember the farm transform to put it back.
const farmHomes = new Map(animals.map((animal) => [animal.id, {
  parent: animal.root.parent ?? fairground.root,
  position: animal.root.position.clone(),
}]))
/** Where each animal stands in the viewer: the plinth top under its showcase spawn. */
const viewerStands = new Map(animals.map((animal) => {
  const [x, z] = SHOWCASE_ANIMALS[animal.id].spawn
  return [animal.id, new THREE.Vector3(x, GARDEN_LAWN_Y + 0.1, z)]
}))

// ---------------------------------------------------------------- game modes --
// The farm and the animal viewer are the same scene with different staging, so
// switching modes swaps the fairground rather than reloading the page. That is
// what lets the main menu hand off to either one without a navigation.

type GameMode = 'farm' | 'viewer'
let mode: GameMode = 'farm'
let viewerStage: ReturnType<typeof createCaptureShowcaseStage> | null = null

const targetOffset = new THREE.Vector3()
const viewDirection = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize()
let cameraDistance = initialOffset.length()
let viewHalfHeight = viewHeight / 2
let dragPointer: number | null = null
let toolPointer: number | null = null
let previousPointer = { x: 0, y: 0 }
let pointerButton = 0

// ------------------------------------------------------------------- UI layer --

const ui = createUILayer()
ui.resize(window.innerWidth, window.innerHeight)

const journal = createJournalPanel(window.innerWidth, window.innerHeight, () => {
  syncFarmChrome()
})
const toolsHud = createToolsHud(
  gardenTools?.selectedTool ?? 'grass',
  (id: GardenToolId) => selectGardenTool(id),
  window.innerWidth,
  window.innerHeight,
)
const menu = createMenuPanel(handleMenuChoice, window.innerWidth, window.innerHeight, () => {
  syncFarmChrome()
})
const viewer = createViewerPanel({
  getAnimals: () => animals,
  playAll: () => {
    for (const animal of animals) {
      if (animal.isCaptured) animal.setAppearance('wild')
      animal.beginCapture()
    }
  },
  resetAll: () => animals.forEach((animal) => animal.setAppearance('wild')),
  exit: () => setMode('farm'),
  replay: (id) => {
    const animal = animalById.get(id)
    if (!animal) return
    if (animal.isCaptured) animal.setAppearance('wild')
    animal.beginCapture()
  },
}, window.innerWidth, window.innerHeight)

const panels: UIPanel[] = [toolsHud, menu, viewer, journal]

/** Where the pointer was last seen, so the cursor can be re-resolved on a
 * mode or visibility change without waiting for the mouse to move again. */
const lastPointerClient = { x: -1, y: -1 }
for (const panel of panels) ui.add(panel)

function selectGardenTool(id: GardenToolId): void {
  gardenTools?.selectTool(id)
}

function handleMenuChoice(choice: MenuChoice): void {
  if (choice === 'options') {
    // Options is a placeholder destination for now; it must not look like a
    // dead end, so bounce back to the menu and leave the farm running.
    console.info('[menu] Options is not built yet.')
    return
  }
  setMode(choice === 'viewer' ? 'viewer' : 'farm')
}

function setMode(next: GameMode): void {
  if (next === mode) {
    menu.close()
    return
  }
  mode = next
  if (next === 'viewer') {
    menu.close()
    viewer.open()
    journal.close()
    // Swap in the showcase staging so the animals stand together on a stage.
    if (!viewerStage) {
      viewerStage = createCaptureShowcaseStage()
      scene.add(viewerStage.root)
    }
    // The fairground holds the animals, so they have to travel with the mode or
    // the viewer opens onto an empty stage.
    for (const animal of animals) {
      viewerStage.root.add(animal.root)
      animal.root.position.copy(viewerStands.get(animal.id)!)
    }
    scene.remove(fairground.root)
    focusCamera()
  } else {
    viewer.close()
    scene.remove(viewerStage?.root ?? fairground.root)
    for (const animal of animals) {
      const home = farmHomes.get(animal.id)!
      home.parent.add(animal.root)
      animal.root.position.copy(home.position)
    }
    scene.add(fairground.root)
    focusCamera()
  }
  syncFarmChrome()
  updateCameraProjection()
}

function focusCamera(): void {
  targetOffset.set(0, 0, 0)
  // The viewer's UI is a tray along the bottom, so the stage is framed a little
  // high: look at a point under it and the animals ride above the tray.
  cameraTarget.set(0, mode === 'viewer' ? viewerTargetY : 1.25, 0)
  viewHalfHeight = (mode === 'viewer' ? viewerViewHeight : normalViewHeight) / 2
  camera.position.copy(cameraTarget).add(initialOffset)
  viewDirection.copy(initialOffset).normalize()
  cameraDistance = initialOffset.length()
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
  updateCameraProjection()
}

/**
 * The tool bar and the journal launcher belong to the farm. While the main menu
 * is up they used to stay on screen underneath it, so the menu's button row was
 * drawn straight through the tool bar and both sets of lettering overlapped.
 */
function syncFarmChrome(): void {
  const farmOnly = mode === 'farm' && !menu.isOpen
  toolsHud.object.visible = farmOnly && !journal.isOpen
  journal.setLauncherVisible(farmOnly)
  refreshCursor()
}

menu.open()
syncFarmChrome()
if (lastPointerClient.x < 0) {
  // No pointer has entered the window yet, so nothing to place. Once it does,
  // the first move resolves the cursor.
  setCursor('hand', gameCanvas)
}

// -------------------------------------------------------------------- input --

function pointerDesign(event: PointerEvent) {
  return ui.viewport.toDesign(event.clientX, event.clientY, gameCanvas.getBoundingClientRect())
}

/**
 * Decide what the pointer looks like.
 *
 * The farm's brush ring is drawn in the world and hides the OS pointer, so it
 * wins outright. Otherwise the topmost panel under the pointer gets to choose,
 * and anything that has not asked for something specific -- including the
 * Blender-authored props, which have no cursor to give -- gets the hand.
 */
function updateCursor(point: DesignPoint | null): void {
  if (gardenTools?.cursorVisible) {
    setCursor('hidden', gameCanvas)
    return
  }
  if (!point) {
    setCursor('default', gameCanvas)
    return
  }
  for (const panel of [...panels].sort((a, b) => b.order - a.order)) {
    const kind = panel.cursor?.(point)
    if (kind) {
      setCursor(kind, gameCanvas)
      return
    }
  }
  setCursor('hand', gameCanvas)
}

function uiPointerDown(event: PointerEvent): boolean {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
  const point = pointerDesign(event)
  updateCursor(point)
  if (!point) return false
  const claimed = routePointer(panels, point, event, 'down')
  updateCursor(point)
  return claimed
}

function uiPointerMove(event: PointerEvent): boolean {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
  const point = pointerDesign(event)
  updateCursor(point)
  if (!point) return false
  return routePointer(panels, point, event, 'move')
}

function uiPointerUp(event: PointerEvent): boolean {
  const point = pointerDesign(event)
  if (!point) return false
  return routePointer(panels, point, event, 'up')
}

/** The brush ring only exists in the farm, so the pointer has to be re-checked
 * whenever the mode or a panel's visibility changes, not just on pointer move. */
function refreshCursor(): void {
  if (lastPointerClient.x < 0) return
  const rect = gameCanvas.getBoundingClientRect()
  const point = ui.viewport.toDesign(lastPointerClient.x, lastPointerClient.y, rect)
  updateCursor(point)
}

function orbitPointerDown(event: PointerEvent): void {
  if (uiPointerDown(event)) return
  if (menu.isOpen || mode === 'viewer') return
  if (event.button === 0 && event.detail >= 2) return
  if (event.button !== 0 && event.button !== 2) return
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
  if (uiPointerMove(event)) return
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
  uiPointerUp(event)
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

function handleZoom(event: WheelEvent): void {
  const point = pointerDesign(event as unknown as PointerEvent)
  if (point) {
    for (let index = panels.length - 1; index >= 0; index -= 1) {
      if (panels[index].wheel?.(point, event)) {
        event.preventDefault()
        return
      }
    }
  }
  event.preventDefault()
  viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(event.deltaY * 0.001), 1.25, 34)
  updateCameraProjection()
}

function handleKeyDown(event: KeyboardEvent): void {
  // Topmost panel first, so a key never reaches the farm while a screen owns it.
  for (let index = panels.length - 1; index >= 0; index -= 1) {
    if (panels[index].keyDown?.(event)) return
  }
  if (event.key === 'Escape' && !menu.isOpen && mode === 'farm' && !journal.isOpen) {
    menu.open()
    event.preventDefault()
  }
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

gameCanvas.addEventListener('pointerdown', orbitPointerDown)
gameCanvas.addEventListener('pointermove', orbitPointerMove)
gameCanvas.addEventListener('pointerup', orbitPointerUp)
gameCanvas.addEventListener('pointercancel', orbitPointerUp)
gameCanvas.addEventListener('pointerleave', () => {
  // Keep painting when the pointer merely slips off the canvas edge mid-hold
  // (it can return without a new press); only the true garden bounds hide the
  // cursor, which garden-tools handles itself.
  if (!toolPointer) gardenTools?.pointerLeave()
})
gameCanvas.addEventListener('contextmenu', preventCanvasMenu)
gameCanvas.addEventListener('wheel', handleZoom, { passive: false })
window.addEventListener('pointerup', () => gardenTools?.pointerUp())
window.addEventListener('keydown', handleKeyDown)
window.addEventListener('resize', () => {
  updateCameraProjection()
  ui.resize(window.innerWidth, window.innerHeight)
})

// ------------------------------------------------------------- garden debug --

declare global {
  interface Window {
    __gardenDebug?: GardenDebugHarness
  }
}

interface GardenDebugHarness {
  readonly enabled: true
  state(): unknown
  focusGarden(): void
  openMenu(): void
  openJournal(): void
  closeMenu(): void
  openViewer(): void
  /** Live scene graph, for poking at a panel that is not drawing. */
  readonly scene: THREE.Scene
  readonly uiScene: THREE.Scene
  layout(): Record<string, unknown>
}

if (gardenDebugMode) {
  const debugHarness: GardenDebugHarness = {
    enabled: true,
    state: () => ({ mode, menuOpen: menu.isOpen, journalOpen: journal.isOpen, viewerOpen: viewer.isOpen }),
    focusGarden: focusCamera,
    openMenu: () => menu.open(),
    closeMenu: () => menu.close(),
    openJournal: () => journal.open(),
    openViewer: () => setMode('viewer'),
    scene,
    uiScene: ui.scene,
    // Reports where every surface actually landed, so layout can be checked at
    // any window size without eyeballing a screenshot.
    layout: () => {
      const described: Record<string, unknown> = {}
      for (const panel of panels) described[panel.name] = panel.describe?.() ?? null
      return {
        window: { width: window.innerWidth, height: window.innerHeight },
        design: { width: ui.viewport.width, height: ui.viewport.height },
        panels: described,
      }
    },
  }
  Object.defineProperty(window, '__gardenDebug', { value: debugHarness, configurable: true })
  window.dispatchEvent(new CustomEvent('garden-debug-ready'))
}

/**
 * A slow drift around the farm while the main menu is up.
 *
 * A still camera makes the menu read as a screenshot of the game with buttons
 * on it. Easing the orbit in and out makes the diorama feel like a place you
 * are standing in front of, which is the whole point of drawing the menu over
 * the live farm rather than replacing it.
 */
let menuDrift = 0
const menuDriftBase = new THREE.Vector3()
const menuDriftOffset = new THREE.Vector3()
const worldUp = new THREE.Vector3(0, 1, 0)

function updateMenuDrift(delta: number, elapsed: number): void {
  const target = menu.isOpen && mode === 'farm' ? 1 : 0
  const previous = menuDrift
  menuDrift += (target - menuDrift) * (1 - Math.exp(-delta * 1.1))
  if (Math.abs(target - menuDrift) < 0.001) menuDrift = target
  if (menuDrift === 0 && previous === 0) return
  if (previous === 0) menuDriftBase.copy(camera.position).sub(cameraTarget)
  if (menuDrift === 0) return
  const angle = Math.sin(elapsed * 0.085) * 0.075 * menuDrift
  menuDriftOffset.copy(menuDriftBase).applyAxisAngle(worldUp, angle)
  camera.position.copy(cameraTarget).add(menuDriftOffset)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

// --------------------------------------------------------------- render loop --

updateCameraProjection()

let previousTime = performance.now()
function frame(now: number): void {
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  fairground.update(delta)
  viewerStage?.update(delta)
  updateMenuDrift(delta, now / 1000)
  animals.forEach((animal) => animal.update(delta))
  // The animals keep walking and following garden terrain on their own, so in
  // the viewer we pin them back onto their plinths after the update.
  if (mode === 'viewer') {
    for (const animal of animals) animal.root.position.copy(viewerStands.get(animal.id)!)
  }
  gardenTools?.update(delta)
  renderer.info.reset()
  renderer.render(scene, camera)
  ui.update(delta)
  ui.render(renderer)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
