import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions, ANIMAL_CATALOG } from './animals/animal-catalog'
import { containsGardenPoint, createFairground, createSkyDome, GARDEN_BOUNDS, GARDEN_MAX_BOUNDS } from './scene/fairground'
import { createAnimalProgress, startingCarnivalSpecies, type FarmSnapshot } from './game/animal-progress'
import { measureFarmState, type FarmState, type LawnSample, type TerrainSample, type WaterSample } from './game/farm-state'
import { stageDefinition, stageTitle } from './game/animal-conditions'
import { createCaptureShowcaseStage, GARDEN_LAWN_Y, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { createGardenWaterField } from './game/garden-water'
import { createGardenWaterMesh } from './scene/garden-water-mesh'
import { createGardenPlants, type GardenPlants } from './scene/garden-plants'
import { createGardenProps, type GardenProps } from './scene/garden-props'
import { PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, type PlantId, type PlantSubstrate } from './game/plants'
import { PROP_CATALOG, purchaseProp, type PropId } from './game/farm-props'
import { animalSaleValue, createWallet, generateAnimalNames, plantSaleValue } from './game/sales'
import { GARDEN_TOOLS, type GardenToolId } from './scene/garden-tool-art'
import { createUILayer, routePointer, type UIPanel } from './ui/ui-layer'
import { createJournalPanel } from './ui/journal-panel'
import { createMenuPanel, type MenuChoice } from './ui/menu-panel'
import { createToolsHud } from './ui/tools-hud'
import { createSeedboxPanel } from './ui/seedbox-panel'
import { createSalePanel } from './ui/sale-panel'
import { createShopPanel } from './ui/shop-panel'
import { createPropboxPanel } from './ui/propbox-panel'
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

/**
 * Substituted at build time by scripts/build.mjs and scripts/dev.mjs. It has to
 * appear directly in each gate below, not behind a shared const: esbuild only
 * removes the harness, frame timing and FPS overlay when it can constant-fold
 * the literal at the `if` itself. With `GARDEN_DEBUG=0` (the default for a
 * production build) none of that code reaches the bundle at all.
 */
declare const __GARDEN_DEBUG__: boolean

const pageParams = new URLSearchParams(window.location.search)
const gardenDebugMode = __GARDEN_DEBUG__ && pageParams.has('gardenDebug')
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
// Expanding the farm opens new ground. The tools and the terrain both need to
// know how big the plot is *now*, not how big it was when the scene was built,
// so they read it through a callback rather than a captured constant.
let currentGardenBounds: typeof GARDEN_BOUNDS = GARDEN_BOUNDS
const activeGardenBounds = (): typeof GARDEN_BOUNDS => currentGardenBounds
const gardenTerrain = fairground.gardenSurface && fairground.gardenSoil
  ? createGardenTerrain([
      { mesh: fairground.gardenSoil, offset: -0.012, soilRings: true },
      { mesh: fairground.gardenSurface },
    ], activeGardenBounds)
  : null
gardenTerrain?.applyToMeshes()
// Water shares the terrain grid so it sees the flat parcel edge and every sculpt.
const gardenWater = gardenTerrain
  ? createGardenWaterField({
      cellSize: gardenTerrain.cellSize,
      gridCols: gardenTerrain.gridCols,
      gridRows: gardenTerrain.gridRows,
      cellHeight: (gx, gz) => gardenTerrain.cellHeightAt(gx, gz),
    })
  : null
const gardenWaterMesh = gardenTerrain && gardenWater ? createGardenWaterMesh(gardenTerrain, gardenWater) : null
if (gardenWaterMesh) {
  scene.add(gardenWaterMesh.mesh)
  gardenWaterMesh.update(0)
}
const gardenTools: GardenTools | null = fairground.gardenSurface && fairground.gardenSoil && gardenTerrain
  ? createGardenTools(
      gameCanvas,
      camera,
      fairground.gardenSurface,
      gardenTerrain,
      activeGardenBounds,
      gardenWater ?? undefined,
      () => gardenWaterMesh?.markDirty(),
    )
  : null
if (gardenTools) scene.add(gardenTools.root)
const worldRaycaster = new THREE.Raycaster()
const worldPointer = new THREE.Vector2()
function pickAnimal(clientX: number, clientY: number): BalloonAnimal | null {
  const rect = gameCanvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  worldPointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  worldRaycaster.setFromCamera(worldPointer, camera)
  const candidates = animals.filter((animal) => !animal.isSold && animal.root.visible).flatMap((animal) => {
    const meshes: THREE.Mesh[] = []
    animal.root.traverse((object) => { if (object instanceof THREE.Mesh && object.visible) meshes.push(object) })
    return meshes
  })
  const hit = worldRaycaster.intersectObjects(candidates, false)[0]
  if (!hit) return null
  return animals.find((animal) => animal.root === hit.object || animal.root.getObjectById(hit.object.id) !== undefined) ?? null
}


let gardenPlants: GardenPlants | null = null
if (fairground.gardenSurface && gardenTerrain && gardenWater) {
  const positions = fairground.gardenSurface.geometry.getAttribute('position') as THREE.BufferAttribute
  const colors = fairground.gardenSurface.geometry.getAttribute('color') as THREE.BufferAttribute
  const coverageCellSize = 0.58
  const coverageCells = new Map<string, number[]>()
  for (let index = 0; index < positions.count; index += 1) {
    const cellX = Math.floor(positions.getX(index) / coverageCellSize)
    const cellZ = Math.floor(-positions.getY(index) / coverageCellSize)
    const key = `${cellX},${cellZ}`
    const cell = coverageCells.get(key) ?? []
    cell.push(index)
    coverageCells.set(key, cell)
  }
  const coverageAt = (x: number, z: number): number => {
    const cellX = Math.floor(x / coverageCellSize)
    const cellZ = Math.floor(z / coverageCellSize)
    let nearest = -1
    let best = Infinity
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        for (const index of coverageCells.get(`${cellX + offsetX},${cellZ + offsetZ}`) ?? []) {
          const dx = positions.getX(index) - x
          const dz = -positions.getY(index) - z
          const distance = dx * dx + dz * dz
          if (distance < best) {
            nearest = index
            best = distance
          }
        }
      }
    }
    return nearest >= 0 ? colors.getW(nearest) : 0
  }
  gardenPlants = createGardenPlants(
    gameCanvas,
    camera,
    fairground.gardenSurface,
    gardenTerrain,
    gardenWater,
    activeGardenBounds,
    (x, z) => {
      const waterDepth = gardenWater.depthAt(x, z)
      let substrate: PlantSubstrate = 'soil'
      if (waterDepth >= PLANT_WATER_MIN_DEPTH) substrate = 'water'
      else if (coverageAt(x, z) > 0.18) substrate = 'grass'
      return {
        substrate,
        waterDepth,
        inBounds: containsGardenPoint(x, z, currentGardenBounds),
      }
    },
  )
  scene.add(gardenPlants.root)
}

/**
 * The shop stands on the apron beyond the plot, outside even the fully expanded
 * bounds, so no amount of farm growth can swallow it. It faces +Z, which is the
 * side the farm camera watches from.
 */
let gardenProps: GardenProps | null = null
if (fairground.gardenSurface && gardenTerrain && gardenWater) {
  gardenProps = createGardenProps({
    canvas: gameCanvas,
    camera,
    lawn: fairground.gardenSurface,
    terrain: gardenTerrain,
    water: gardenWater,
    getBounds: activeGardenBounds,
    shop: { x: 2.5, z: 18, rotationY: 0.08, url: 'assets/buildings/farm-shop.glb', size: 6.4 },
    onChange: () => refreshShopUi(),
  })
  scene.add(gardenProps.root)
}

let lastExpansionLevel = fairground.farmExpansion?.state.level ?? 0

// Animals arrive in wild balloon red. Capturing changes their materials in place, then restores
// each animal's palette through a shared 6.8-second paint-bucket reveal. Scene options come from
// the single ANIMAL_CATALOG source; groundSampler lets them follow the garden terrain height.
//
// The condition ladder is what now drives that transition. `progress` is the
// pure state machine; this file is only responsible for reading the farm,
// feeding it in, and acting on the events it returns.
const speciesIds = getAnimalSceneOptions(false, gameCanvas, camera).map((options) => options.id)
const progress = createAnimalProgress(speciesIds)
/** Stages 0 and 1 live at the carnival; 2 and up are inside the fence. */
const isLoose = (species: string): boolean => progress.progressOf(species).stage < 2

const generatedAnimalNames = generateAnimalNames(ANIMAL_CATALOG.length)
const animalNames = new Map(ANIMAL_CATALOG.map((animal, index) => [animal.id, generatedAnimalNames[index]]))
const animals: BalloonAnimal[] = await Promise.all(getAnimalSceneOptions(
  false,
  gameCanvas,
  camera,
  gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined,
).map((options) =>
  createBalloonAnimal(fairground.root, {
    ...options,
    name: animalNames.get(options.id) ?? options.name,
    // Start every species at the carnival, loose, and let progression decide
    // who comes in. `carnivalSpawn` points out by the tents.
    stage: 0,
    spawn: (ANIMAL_CATALOG.find((animal) => animal.id === options.id)?.carnivalSpawn
      ?? options.spawn) as readonly [number, number],
    isLoose: () => isLoose(options.id),
    getGardenBounds: activeGardenBounds,
  }),
))
const animalById = new Map(animals.map((animal) => [animal.id, animal]))
const wallet = createWallet()

// Four species are already at the carnival when the game opens; the rest have
// to be drawn over by the farm itself.
for (const species of startingCarnivalSpecies(speciesIds)) progress.discover(species)
// Sync the scene to the model's opening state. Without this an animal sits at
// visual stage 0 while the model already has it at the carnival, and nothing
// ever corrects it -- progression only pushes stages on *change*.
for (const animal of animals) {
  const entry = progress.progressOf(animal.id)
  if (entry.stage > 0) animal.stage = entry.stage
}

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

// ------------------------------------------------------- farm measurement --

/**
 * The lawn's own vertex grids, read straight out of the tool that maintains
 * them. This is the seam between the renderer and the simulation: the pure
 * condition code never sees a Three.js object, it only ever sees these arrays.
 */
function currentLawnSample(): LawnSample | null {
  const lawn = fairground.gardenSurface
  if (!lawn) return null
  const positions = lawn.geometry.getAttribute('position') as THREE.BufferAttribute
  const colors = lawn.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  if (!colors) return null
  const count = positions.count
  const xs = new Float32Array(count)
  const zs = new Float32Array(count)
  const coverage = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    xs[index] = positions.getX(index)
    // The lawn geometry is authored in the XZ plane with +Y mapping to -Z.
    zs[index] = -positions.getY(index)
    coverage[index] = colors.getW(index)
  }
  return { count, xs, zs, coverage }
}

function currentTerrainSample(): TerrainSample | null {
  if (!gardenTerrain) return null
  // The height field's own grid; `cellSize`/`cols`/`rows` describe it exactly.
  const cols = gardenTerrain.gridCols
  const rows = gardenTerrain.gridRows
  const cellSize = gardenTerrain.cellSize
  const originX = -(GARDEN_MAX_BOUNDS.halfWidth + 0.08)
  const originZ = -(GARDEN_MAX_BOUNDS.halfDepth + 0.08)
  const heights = new Float32Array(cols * rows)
  for (let gz = 0; gz < rows; gz += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      heights[gz * cols + gx] = gardenTerrain.heightAt(
        originX + gx * cellSize,
        originZ + gz * cellSize,
      )
    }
  }
  return { heights, cols, rows, cellSize, originX, originZ }
}

/** The last measured farm, kept so the journal and harness can read it. */
let lastFarmState: FarmState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0 }

function currentWaterSample(): WaterSample | null {
  if (!gardenWater) return null
  const summary = gardenWater.summary()
  return { visibleWetCells: summary.visibleWetCells, cellSize: gardenWater.cellSize }
}

function measureFarm(): FarmState {
  const lawn = currentLawnSample()
  const terrain = currentTerrainSample()
  if (!lawn || !terrain) return lastFarmState
  lastFarmState = measureFarmState(lawn, terrain, currentWaterSample())
  return lastFarmState
}

/**
 * Advance every animal one step and play whatever transition it earned.
 *
 * This is the only place the scene learns that a condition was met, and it
 * does so by setting `animal.stage` -- the animal then runs its own reveal.
 * Keeping the event handling here means `balloon-animal.ts` never has to know
 * that a condition system exists.
 */
function currentFarmSnapshot(): FarmSnapshot {
  const residentSpecies = new Set(progress.all()
    .filter((entry) => entry.stage >= 3 && !animalById.get(entry.species as BalloonAnimal['id'])?.isSold)
    .map((entry) => entry.species))
  return { state: measureFarm(), residentSpecies }
}

function updateAnimalProgress(deltaSeconds: number): void {
  if (mode === 'viewer' || menu.isOpen || salePanel.isOpen) return
  const events = progress.tick(currentFarmSnapshot(), deltaSeconds)
  for (const event of events) {
    const animal = animalById.get(event.species as (typeof animals)[number]['id'])
    if (!animal || animal.isSold) continue
    animal.stage = event.stage
    if (event.kind === 'settle' || event.kind === 'fallInLove') {
      console.info(`[Animal Balloon Farm] ${event.species} -> ${stageTitle(event.species, event.stage)}`)
    }
  }
}

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
let dragMode: 'orbit' | 'pan' | null = null
let spaceHeld = false
const pressedKeys = new Set<string>()
let pointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
let pointerWasSeen = false
const CAMERA_EDGE_MARGIN = 34
const CAMERA_BASE_SPEED = 12
const CAMERA_MAX_SPEED = 27
const CAMERA_MIN_ZOOM = 1.25
const CAMERA_MAX_ZOOM = 34

const cameraShakeOffset = new THREE.Vector3()
const CAMERA_SHAKE_DURATION = 0.82
const CAMERA_SHAKE_AMPLITUDE = 0.38
let expansionFeedbackSeconds = 0
let expansionFeedbackStrength = 0

// ------------------------------------------------------------------- UI layer --

const ui = createUILayer()
const performanceOverlay = __GARDEN_DEBUG__ && gardenDebugMode ? createPerformanceOverlay() : null
ui.resize(window.innerWidth, window.innerHeight)

const journal = createJournalPanel(window.innerWidth, window.innerHeight, () => {
  syncFarmChrome()
})
const toolsHud = createToolsHud(
  gardenTools?.selectedTool ?? 'hand',
  (id: GardenToolId) => selectGardenTool(id),
  window.innerWidth,
  window.innerHeight,
)
const menu = createMenuPanel(handleMenuChoice, window.innerWidth, window.innerHeight, () => {
  syncFarmChrome()
})
const viewer = createViewerPanel({
  getAnimals: () => animals.filter((animal) => !animal.isSold),
  getAnimalName: (id) => animalNames.get(id) ?? id,
  playAll: () => {
    for (const animal of animals.filter((entry) => !entry.isSold)) {
      if (animal.isCaptured) animal.setAppearance('wild')
      animal.beginCapture()
    }
  },
  resetAll: () => animals.filter((animal) => !animal.isSold).forEach((animal) => animal.setAppearance('wild')),
  exit: () => setMode('farm'),
  replay: (id) => {
    const animal = animalById.get(id)
    if (!animal || animal.isSold) return
    if (animal.isCaptured) animal.setAppearance('wild')
    animal.beginCapture()
  },
}, window.innerWidth, window.innerHeight)

const salePanel = createSalePanel((target) => {
  if (target.kind === 'animal') {
    const animal = animalById.get(target.id as BalloonAnimal['id'])
    if (!animal || !animal.canSell || !animal.sell()) return null
    const balance = wallet.credit(target.price)
    salePanel.setWallet(balance)
    return balance
  }
  const plantId = Number(target.id)
  const plant = gardenPlants?.simulation.plants.find((entry) => entry.instanceId === plantId)
  if (!plant || !gardenPlants?.removePlant(plantId)) return null
  seedbox.refresh()
  const balance = wallet.credit(plantSaleValue(plant.species, plant.growth))
  salePanel.setWallet(balance)
  return balance
}, window.innerWidth, window.innerHeight, (isOpen) => {
  if (typeof toolsHud !== 'undefined') {
    if (isOpen) {
      gardenPlants?.cancelPlacement()
      gardenTools?.setPlantingMode(false)
      seedbox.setPlacementActive(false)
    } else {
      gardenPlants?.clearSelection()
    }
    toolsHud.setVisible(mode === 'farm' && !menu.isOpen && !journal.isOpen && !seedbox.isOpen && !isOpen)
    refreshCursor()
  }
})
salePanel.setWallet(wallet.balance)

const seedbox = createSeedboxPanel(
  (species: PlantId) => {
    if (!gardenPlants) return
    gardenTools?.setPlantingMode(true)
    gardenPlants.selectSpecies(species)
    seedbox.setPlacementActive(true)
    syncFarmChrome()
    seedbox.refresh()
    refreshCursor()
  },
  window.innerWidth,
  window.innerHeight,
  (isOpen) => {
    toolsHud.setVisible(mode === 'farm' && !menu.isOpen && !journal.isOpen && !isOpen && !salePanel.isOpen)
    journal.setLauncherVisible(mode === 'farm' && !menu.isOpen && !journal.isOpen && !isOpen)
    if (isOpen) {
      gardenPlants?.cancelPlacement()
      gardenTools?.setPlantingMode(false)
    }
    refreshCursor()
  },
)
seedbox.setSeedsSource((species) => gardenPlants?.simulation.seedsFor(species) ?? 0)

/** Keep the shop and the Propbox showing the same counts the world does. */
function refreshShopUi(): void {
  shopPanel?.refresh()
  propboxPanel?.refresh()
}

const propboxPanel = createPropboxPanel(
  (id: PropId) => {
    if (!gardenProps) return
    gardenProps.beginPlacement(id)
    gardenPlants?.cancelPlacement()
    gardenTools?.setPlantingMode(false)
    seedbox.setPlacementActive(false)
    propboxPanel.setPlacementActive(true)
    syncFarmChrome()
    refreshCursor()
  },
  window.innerWidth,
  window.innerHeight,
  (isOpen) => {
    if (isOpen && gardenProps?.placingId) gardenProps.cancelPlacement()
    if (isOpen) {
      gardenPlants?.cancelPlacement()
      gardenTools?.setPlantingMode(false)
    }
    syncFarmChrome()
    refreshCursor()
  },
)
propboxPanel.setCountsSource((id) => gardenProps?.inventory.count(id) ?? 0)

const shopPanel = createShopPanel(
  (id: PropId) => {
    if (!gardenProps) return { ok: false, reason: 'The shopkeeper is still unpacking.', balance: wallet.balance }
    const result = purchaseProp(wallet, gardenProps.inventory, id)
    if (result.ok) {
      salePanel.setWallet(wallet.balance)
      seedbox.refresh()
      propboxPanel.refresh()
    }
    return {
      ok: result.ok,
      reason: result.ok
        ? null
        : `Not enough coins for the ${PROP_CATALOG[id].name} — it costs ${PROP_CATALOG[id].price}.`,
      balance: wallet.balance,
    }
  },
  window.innerWidth,
  window.innerHeight,
  (isOpen) => {
    if (isOpen) {
      gardenProps?.cancelPlacement()
      gardenPlants?.cancelPlacement()
      gardenTools?.setPlantingMode(false)
      seedbox.setPlacementActive(false)
      propboxPanel.setPlacementActive(false)
    }
    syncFarmChrome()
    refreshCursor()
  },
)
shopPanel.setCountsSource((id) => gardenProps?.inventory.count(id) ?? 0)
shopPanel.setWallet(wallet.balance)

const panels: UIPanel[] = [toolsHud, seedbox, propboxPanel, menu, viewer, journal, salePanel, shopPanel]

/**
 * Hand the journal a live view of the condition ladder.
 *
 * The translation lives here rather than in the journal so the UI keeps no
 * knowledge of the progression model -- it draws rows, and the model decides
 * what a row says and whether it is sealed yet.
 */
journal.setConditionsSource({
  get: (species) => {
    if (animalById.get(species as BalloonAnimal['id'])?.isSold) return null
    const conditions = progress.statusOf(species)
    if (!conditions.length) return null
    return {
      stage: progress.progressOf(species).stage,
      rows: conditions.map((row) => {
        const definition = stageDefinition(species, row.stage as 0 | 1 | 2 | 3 | 4)
        // A social condition has no area to meter, so name the friend instead.
        const wantsSpecies = row.requirement?.kind === 'residentSpecies' ? row.requirement.species : undefined
        return {
          stage: row.stage,
          title: row.title,
          revealed: row.revealed,
          current: row.current,
          target: row.target,
          met: row.met,
          result: row.result,
          hint: definition?.hint ?? '',
          ...(row.metricLabel ? { metricLabel: row.metricLabel } : {}),
          ...(wantsSpecies ? {
            waitingOn: {
              species: wantsSpecies,
              name: ANIMAL_CATALOG.find((animal) => animal.id === wantsSpecies)?.name ?? wantsSpecies,
              resident: progress.all().some((entry) => entry.species === wantsSpecies && entry.stage >= 3 && !animalById.get(wantsSpecies as BalloonAnimal['id'])?.isSold),
            },
          } : {}),
        }
      }),
    }
  },
})

/** Where the pointer was last seen, so the cursor can be re-resolved on a
 * mode or visibility change without waiting for the mouse to move again. */
const lastPointerClient = { x: -1, y: -1 }
for (const panel of panels) ui.add(panel)

function selectGardenTool(id: GardenToolId): void {
  gardenPlants?.cancelPlacement()
  gardenProps?.cancelPlacement()
  seedbox.setPlacementActive(false)
  propboxPanel.setPlacementActive(false)
  gardenTools?.setPlantingMode(false)
  if (gardenTools) {
    // Tapping the active tool's hotkey again cycles its brush size rather than
    // re-selecting what is already selected. Hand has no brush size to cycle.
    if (gardenTools.selectedTool === id && id !== 'hand') gardenTools.cycleBrushSize()
    else if (gardenTools.selectedTool !== id) gardenTools.selectTool(id)
  }
  toolsHud.setSelectedTool(id)
  seedbox.setInteractEnabled(id === 'hand')
  syncFarmChrome()
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
  if (next !== 'farm') {
    salePanel.close()
    seedbox.close()
    propboxPanel.setPlacementActive(false)
    shopPanel.close()
    gardenPlants?.cancelPlacement()
    gardenProps?.cancelPlacement()
    seedbox.setPlacementActive(false)
    gardenTools?.setPlantingMode(false)
  }
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
  // The main menu owns the screen outright, so the storefront must not out-rank it.
  if (menu.isOpen && shopPanel.isOpen) shopPanel.close()
  const shopOpen = shopPanel.isOpen
  toolsHud.setVisible(farmOnly && !journal.isOpen && !seedbox.isOpen && !salePanel.isOpen && !shopOpen && !gardenProps?.placingId)
  seedbox.setVisible(farmOnly && !journal.isOpen && !shopOpen && !gardenPlants?.selectedSpecies)
  seedbox.setInteractEnabled(toolsHud.selectedTool === 'hand')
  propboxPanel.setVisible(farmOnly && !journal.isOpen && !shopOpen)
  propboxPanel.setInteractEnabled(toolsHud.selectedTool === 'hand')
  journal.setLauncherVisible(farmOnly && !seedbox.isOpen && !propboxPanel.isOpen && !shopOpen)
  if (gardenPlants) gardenPlants.root.visible = mode === 'farm'
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
  if (!point) {
    setCursor('hand', gameCanvas)
    return
  }
  if (gardenPlants?.selectedSpecies && mode === 'farm' && !menu.isOpen && !journal.isOpen && !seedbox.isOpen) {
    setCursor('plant', gameCanvas)
    return
  }
  for (const panel of [...panels].sort((a, b) => b.order - a.order)) {
    const kind = panel.cursor?.(point as DesignPoint)
    if (kind) {
      setCursor(kind, gameCanvas)
      return
    }
  }
  if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !seedbox.isOpen) {
    const markerKind = gardenPlants?.markerKindAt(lastPointerClient.x, lastPointerClient.y)
    if (markerKind) {
      setCursor(toolsHud.selectedTool === 'hand'
        ? markerKind === 'water' ? 'water' : markerKind === 'prune' ? 'prune' : 'point'
        : 'hand', gameCanvas)
      return
    }

    if (gardenPlants?.selectedSpecies && gardenPlants.previewVisible) {
      setCursor('plant', gameCanvas)
      return
    }
  }
  if (toolsHud.selectedTool !== 'hand' && !gardenPlants?.selectedSpecies && gardenTools?.cursorVisible && mode === 'farm' && !menu.isOpen && !journal.isOpen && !isOverGameHUD(lastPointerClient.x, lastPointerClient.y)) {
    setCursor('hidden', gameCanvas)
    return
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

/**
 * Whether the pointer is over the interface rather than over the farm.
 *
 * Edge-panning and the garden brush both have to get out of the way here, or
 * dragging the camera fights the tool bar. Full-screen panels (the menu, the
 * journal, the viewer) always count as the interface; the tool bar asks its own
 * slots, and the expansion card still lives in its own 1280x720 scene so its
 * rectangle is measured in device pixels.
 */
function isOverGameHUD(clientX: number, clientY: number): boolean {
  if (menu.isOpen || journal.isOpen || mode === 'viewer' || shopPanel.isOpen) return true
  const point = ui.viewport.toDesign(clientX, clientY, gameCanvas.getBoundingClientRect())
  return Boolean(point && (
    (toolsHud.isVisible && toolsHud.hitTest?.(point))
    || seedbox.contains(point)
    || propboxPanel.contains(point)
    || salePanel.hitTest?.(point)
  ))
}

function updateCameraPan(deltaSeconds: number): void {
  if (mode !== 'farm' || menu.isOpen || deltaSeconds <= 0 || spaceHeld) return
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
  if (uiPointerDown(event)) return
  if (menu.isOpen || mode === 'viewer') return
  const selectedTool = gardenTools?.selectedTool ?? 'hand'
  if (event.button === 0 && selectedTool === 'hand' && !isOverGameHUD(event.clientX, event.clientY)) {
    // Placement owns the click outright while a prop is on the ghost.
    if (gardenProps?.placingId) {
      event.preventDefault()
      gardenProps.pointerMove(event)
      gardenProps.pointerDown(event)
      gardenProps.update(0)
      propboxPanel.refresh()
      syncFarmChrome()
      return
    }
    if (!journal.isOpen && !seedbox.isOpen && !propboxPanel.isOpen) {
      // Hand-tool pick-up first, then the shop door. Both are the same grab the
      // sale panel already trained the player to make.
      if (gardenProps?.pickUpAt(event.clientX, event.clientY)) {
        propboxPanel.refresh()
        syncFarmChrome()
        return
      }
      if (gardenProps?.pickShop(event.clientX, event.clientY)) {
        salePanel.close()
        shopPanel.setWallet(wallet.balance)
        shopPanel.refresh()
        shopPanel.open()
        syncFarmChrome()
        return
      }
    }
    const markerKind = gardenPlants?.markerKindAt(event.clientX, event.clientY)
    if (markerKind) {
      gardenPlants?.pointerDown(event)
      syncFarmChrome()
      return
    }
    const animal = pickAnimal(event.clientX, event.clientY)
    if (animal) {
      gardenPlants?.clearSelection()
      const species = ANIMAL_CATALOG.find((entry) => entry.id === animal.id)
      salePanel.open({
        id: animal.id,
        kind: 'animal',
        name: animalNames.get(animal.id) ?? species?.name ?? animal.id,
        detail: animal.canSell
          ? `${stageTitle(animal.id, animal.stage)} · ${species?.subtitle ?? 'A farm friend'}`
          : 'Needs to settle at the farm before selling',
        price: animal.canSell ? animalSaleValue(animal.id, animal.stage) : 0,
        sellable: animal.canSell,
      })
      syncFarmChrome()
      return
    }
    const plant = gardenPlants?.selectAt(event.clientX, event.clientY)
    if (plant) {
      const species = PLANT_CATALOG.find((entry) => entry.id === plant.species)
      salePanel.open({
        id: String(plant.instanceId),
        kind: 'plant',
        name: `${species?.name ?? 'Plant'} ${gardenPlants?.selectedPlantNumber ?? 1}`,
        detail: plant.mature ? 'Fully grown' : `${Math.round(plant.growth * 100)}% grown`,
        price: plantSaleValue(plant.species, plant.growth),
      })
      syncFarmChrome()
      return
    }
  }
  if (salePanel.isOpen) salePanel.close()
  if (event.button === 0 && selectedTool === 'hand' && !journal.isOpen && !seedbox.isOpen && mode === 'farm' && gardenPlants?.pointerDown(event)) {
    event.preventDefault()
    if (!gardenPlants.selectedSpecies) {
      seedbox.setPlacementActive(false)
      gardenTools?.setPlantingMode(false)
    }
    syncFarmChrome()
    seedbox.refresh()
    return
  }
  if (event.button === 0 && event.detail >= 2) return
  // Middle click levels with the shovel; Space+left-drag explicitly orbits.
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
  if (event.button === 2 && selectedTool !== 'hand' && !isOverGameHUD(event.clientX, event.clientY) && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  // Tool selections are handled by the shared HUD above. Right-click belongs
  // to the active garden tool inside the plot; outside the plot it remains a pan.
  const cameraGesture = event.button === 0 && spaceHeld
  if (!spaceHeld && isOverGameHUD(event.clientX, event.clientY)) {
    event.preventDefault()
    return
  }
  if (!cameraGesture && event.button === 0 && selectedTool !== 'hand' && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  if (event.button === 1 && selectedTool !== 'hand' && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  if (gardenDebugMode || selectedTool === 'hand') return
  dragPointer = event.pointerId
  dragMode = event.button === 2 ? 'pan' : 'orbit'
  previousPointer = { x: event.clientX, y: event.clientY }
  gameCanvas.setPointerCapture(event.pointerId)
}

function orbitPointerMove(event: PointerEvent): void {
  if (uiPointerMove(event)) return
  if (gardenProps?.placingId) gardenProps.pointerMove(event)
  if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !seedbox.isOpen && toolsHud.selectedTool === 'hand') gardenPlants?.pointerMove(event)
  gardenTools?.pointerMove(event)
  updateCursor(pointerDesign(event))
  if (toolPointer === event.pointerId || dragPointer !== event.pointerId) return
  const dx = event.clientX - previousPointer.x
  const dy = event.clientY - previousPointer.y
  previousPointer = { x: event.clientX, y: event.clientY }
  if (dragMode === 'pan') {
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
  if (gardenProps?.placingId) {
    gardenProps.pointerUp()
    propboxPanel.refresh()
    syncFarmChrome()
  }
  if (toolPointer === event.pointerId) {
    gardenTools?.pointerUp()
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
  viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(event.deltaY * 0.001), CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
  updateCameraProjection()
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
}

const PAN_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']

function handleKeyDown(event: KeyboardEvent): void {
  if (gardenPlants?.selectedSpecies && mode === 'farm' && !menu.isOpen && !journal.isOpen && !seedbox.isOpen && !event.altKey && !event.ctrlKey && !event.metaKey && !isTextInputTarget(event.target)) {
    const tool = GARDEN_TOOLS.find((entry) => entry.hotkey === event.key.toLowerCase())
    if (tool) {
      event.preventDefault()
      selectGardenTool(tool.id)
      return
    }
  }
  // Topmost panel first, so a key never reaches the farm while a screen owns it.
  for (let index = panels.length - 1; index >= 0; index -= 1) {
    if (panels[index].keyDown?.(event)) return
  }
  // A prop on the ghost answers R (rotate) and Escape (cancel) before anything else.
  if (gardenProps?.placingId && !menu.isOpen && !journal.isOpen) {
    if (event.key.toLowerCase() === 'r' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      gardenProps.rotate()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      gardenProps.cancelPlacement()
      propboxPanel.setPlacementActive(false)
      refreshShopUi()
      syncFarmChrome()
      return
    }
  }
  if (event.altKey || event.ctrlKey || event.metaKey || isTextInputTarget(event.target)) return
  if (event.code === 'Space') {
    spaceHeld = true
    event.preventDefault()
    return
  }
  const key = event.key.toLowerCase()
  if (key === '1') {
    event.preventDefault()
    selectGardenTool('hand')
    return
  }
  if (PAN_KEYS.includes(key)) {
    pressedKeys.add(key)
    event.preventDefault()
    return
  }
  if (key === 'e' && mode === 'farm' && !menu.isOpen && fairground.farmExpansion) {
    event.preventDefault()
    if (!event.repeat) fairground.farmExpansion.expand()
    return
  }
  if (event.key === 'Escape' && salePanel.isOpen) {
    salePanel.close()
    syncFarmChrome()
    event.preventDefault()
    return
  }
  if (event.key === 'Escape' && !menu.isOpen && mode === 'farm' && !journal.isOpen) {
    if (gardenPlants?.selectedSpecies) {
      gardenPlants.cancelPlacement()
      seedbox.setPlacementActive(false)
      gardenTools?.setPlantingMode(false)
      if (lastPointerClient.x >= 0) gardenTools?.pointerMove({ clientX: lastPointerClient.x, clientY: lastPointerClient.y })
      syncFarmChrome()
      event.preventDefault()
      return
    }
    menu.open()
    event.preventDefault()
  }
}

function handleKeyUp(event: KeyboardEvent): void {
  pressedKeys.delete(event.key.toLowerCase())
  if (event.code === 'Space') spaceHeld = false
  if (menu.isOpen || journal.isOpen) return
  if (!isTextInputTarget(event.target) && ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(event.key.toLowerCase())) {
    event.preventDefault()
  }
}

/**
 * The garden brush follows the pointer from a window-level listener, not from
 * the canvas's, so a drag that runs off the edge of the window keeps painting
 * instead of stopping dead at the border.
 */
function handleWindowPointerMove(event: PointerEvent): void {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
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

function handleWindowPointerUp(event: PointerEvent): void {
  // Canvas pointer capture normally delivers the release to orbitPointerUp.
  // Keep a window fallback for releases outside the canvas, but only let the
  // pointer that started a tool stroke terminate it.
  if (toolPointer !== event.pointerId) return
  gardenTools?.pointerUp()
  toolPointer = null
}

function handleCanvasLeave(): void {
  // Keep painting when the pointer merely slips off the canvas edge mid-hold.
  if (!toolPointer) gardenTools?.pointerLeave()
  gardenPlants?.pointerLeave()
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
  gardenPlants?.pointerLeave()
})
gameCanvas.addEventListener('contextmenu', preventCanvasMenu)
gameCanvas.addEventListener('wheel', handleZoom, { passive: false })
window.addEventListener('keydown', handleKeyDown)
window.addEventListener('pointermove', handleWindowPointerMove)
window.addEventListener('pointerup', handleWindowPointerUp)
window.addEventListener('keyup', handleKeyUp)
window.addEventListener('blur', handleWindowBlur)
window.addEventListener('mouseleave', handleWindowBlur)
gameCanvas.addEventListener('pointerleave', handleCanvasLeave)
seedbox.resize(window.innerWidth, window.innerHeight)
salePanel.resize(window.innerWidth, window.innerHeight)
window.addEventListener('resize', () => {
  updateCameraProjection()
  ui.resize(window.innerWidth, window.innerHeight)
  salePanel.resize(window.innerWidth, window.innerHeight)
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
  /** Direct water/terrain controls for repeatable visual checks, compiled out in production. */
  digAt(x: number, z: number, radius: number, amount: number): number
  pourAt(x: number, z: number, radius: number, amount: number): unknown
  clearGarden(): void
  waterSummary(): unknown
  /** Live scene graph, for poking at a panel that is not drawing. */
  readonly scene: THREE.Scene
  readonly uiScene: THREE.Scene
  layout(): Record<string, unknown>
  /** Animal conditions: every rung, whether it is revealed, and live numbers. */
  conditions(): AnimalConditionReport
  /** What the farm currently measures, in square meters. */
  farmState(): FarmState
  /**
   * Force a species onto a rung of the ladder and play whatever transition it
   * earns. This is how a specific condition gets exercised on demand.
   */
  setStage(species: string, stage: number): AnimalConditionReport
  /** Sow a disc of grass, in the same units the cow's 15 m2 is measured in. */
  sowGrass(x: number, z: number, radius: number): FarmState
  /** Dig a pond of the given radius, which is what the water conditions want. */
  digPond(x: number, z: number, radius: number): FarmState
  /** Run the progression tick `steps` times, optionally with a time jump. */
  advance(steps?: number, secondsPerStep?: number): AnimalConditionReport
  /** Forget everything: no grass, no pond, every animal back to the carnival. */
  resetConditions(): void
  /** Where each animal is, and what it looks like right now. */
  animalReport(): Record<string, unknown>[]
  /** Frame a species closely, for inspecting eyes and other small details. */
  focusSpecies(species: string, height?: number): void
  /** Put coins in the wallet without farming for them, so the shop can be driven. */
  grantCoins(amount: number): number
  /** Open the storefront screen without walking up to the building. */
  shop(): void
  /** Buy one prop from the shared wallet, exactly as the Buy button does. */
  buy(id: string): unknown
  propCounts(): Record<string, number>
  placeProp(id: string, cellX: number, cellZ: number, rotation?: number): unknown
  placeFence(fromX: number, fromZ: number, toX: number, toZ: number): unknown
  propReport(): unknown
  /** Hand-tool pick-up at a client point; returns the prop returned to the box. */
  pickUpProp(clientX: number, clientY: number): string | null
}

interface AnimalConditionReport {
  readonly farm: FarmState
  readonly species: Record<string, {
    readonly stage: number
    readonly appearance: string
    readonly heartEyes: boolean
    readonly isCaptured: boolean
    readonly invited: boolean
    readonly position: { x: number; z: number }
    readonly conditions: ReturnType<typeof progress.statusOf>
  }>
}

/** Everything the condition harness and the journal both need to draw. */
function reportConditions(): AnimalConditionReport {
  // Measuring here (rather than reusing the last frame's) means a harness
  // caller sees the farm as it is at the moment it asked.
  const farm = measureFarm()
  const species: AnimalConditionReport['species'] = {}
  for (const animal of animals) {
    species[animal.id] = {
      stage: progress.progressOf(animal.id).stage,
      appearance: progress.progressOf(animal.id).appearance,
      heartEyes: animal.heartEyeCount > 0,
      isCaptured: animal.isCaptured,
      invited: progress.progressOf(animal.id).invited,
      position: { x: +animal.root.position.x.toFixed(2), z: +animal.root.position.z.toFixed(2) },
      conditions: progress.statusOf(animal.id),
    }
  }
  return { farm, species }
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
  readonly cadenceMs: number
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

interface PerformanceOverlay {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  update(now: number, summarize: () => GardenPerformanceSummary | null): void
  resize(width: number, height: number): void
  dispose(): void
}

const frameTimingSamples: GardenFrameTiming[] = []
const FRAME_TIMING_SAMPLE_LIMIT = 180
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
        `frame p95 ${summary?.intervalMs.p95.toFixed(1) ?? '--'}ms · drops ${summary?.droppedFrames ?? '--'} @ ${summary?.cadenceMs.toFixed(1) ?? '--'}ms`,
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
  // Adapt to the browser/display's actual rAF cadence (e.g. 30 Hz remote browser
  // previews) so ordinary 33 ms frames are not mislabeled as missed 60 Hz frames.
  const cadenceMs = percentile(intervals, 0.1)
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2())
  const summarize = (values: readonly number[]) => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: max(values) })
  const summarizeTail = (values: readonly number[]) => ({ p95: percentile(values, 0.95), max: max(values) })
  return {
    samples: intervals.length,
    fps: +(1000 / averageInterval).toFixed(1),
    cadenceMs,
    droppedFrames: intervals.filter((value) => value > cadenceMs * 1.5).length,
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

if (__GARDEN_DEBUG__ && gardenDebugMode) {
  const debugHarness: GardenDebugHarness = {
    enabled: true,
    state: () => ({
      mode,
      menuOpen: menu.isOpen,
      journalOpen: journal.isOpen,
      viewerOpen: viewer.isOpen,
      shopOpen: shopPanel.isOpen,
      propboxOpen: propboxPanel.isOpen,
      placing: gardenProps?.placingId ?? null,
      performance: summarizeFrameTimings(),
    }),
    focusGarden: focusCamera,
    openMenu: () => menu.open(),
    closeMenu: () => menu.close(),
    openJournal: () => journal.open(),
    openViewer: () => setMode('viewer'),
    digAt: (x, z, radius, amount) => {
      if (!gardenTerrain || !gardenWater) return 0
      const changed = gardenTerrain.splat(x, z, radius, amount)
      gardenTerrain.applyToMeshes()
      gardenWater.markTerrainChanged()
      for (let pass = 0; pass < 40 && gardenWater.dirty; pass += 1) gardenWater.settle()
      gardenWaterMesh?.markDirty()
      gardenWaterMesh?.update(performance.now() * 0.001)
      return changed
    },
    pourAt: (x, z, radius, amount) => {
      if (!gardenWater) return null
      gardenWater.pour(x, z, radius, amount)
      for (let pass = 0; pass < 40 && gardenWater.dirty; pass += 1) gardenWater.settle()
      gardenWaterMesh?.markDirty()
      gardenWaterMesh?.update(performance.now() * 0.001)
      return gardenWater.summary()
    },
    clearGarden: () => {
      gardenTerrain?.clear()
      gardenTerrain?.applyToMeshes()
      gardenWater?.clear()
      gardenWater?.settle()
      gardenWaterMesh?.markDirty()
      gardenWaterMesh?.update(performance.now() * 0.001)
    },
    waterSummary: () => gardenWater?.summary() ?? null,
    farmState: () => measureFarm(),
    conditions: () => reportConditions(),
    setStage: (species, stage) => {
      const target = Math.max(0, Math.min(4, Math.floor(stage))) as 0 | 1 | 2 | 3 | 4
      // Demote first so a re-run replays the reveal from the top, then walk up
      // one rung at a time so the transition animation actually plays.
      for (let rung = 0; rung < target; rung += 1) {
        progress.setStage(species, rung as 0 | 1 | 2 | 3 | 4)
        const animal = animalById.get(species as (typeof animals)[number]['id'])
        if (animal && !animal.isSold) animal.stage = rung as 0 | 1 | 2 | 3 | 4
      }
      progress.setStage(species, target)
      const animal = animalById.get(species as (typeof animals)[number]['id'])
      if (animal && !animal.isSold) animal.stage = target
      // One more tick so a settled animal is reflected in the resident set the
      // next species is judged against.
      progress.tick(currentFarmSnapshot(), 0)
      return reportConditions()
    },
    sowGrass: (x, z, radius) => {
      gardenTools?.sowGrassDisc(x, z, radius)
      return measureFarm()
    },
    digPond: (x, z, radius) => {
      gardenTools?.digBasin(x, z, radius, -1.1)
      return measureFarm()
    },
    advance: (steps = 1, secondsPerStep = 1 / 30) => {
      for (let step = 0; step < steps; step += 1) {
        const events = progress.tick(currentFarmSnapshot(), secondsPerStep)
        for (const event of events) {
          const animal = animalById.get(event.species as (typeof animals)[number]['id'])
          if (animal && !animal.isSold) animal.stage = event.stage
        }
      }
      return reportConditions()
    },
    resetConditions: () => {
      gardenTools?.clearGrass()
      progress.reset()
      for (const animal of animals.filter((entry) => !entry.isSold)) {
        // Demote through the transitions so the heart eyes and the paint mask
        // are actually torn down, rather than left behind on the model.
        animal.stage = 0
        animal.setAppearance('wild')
      }
      for (const species of startingCarnivalSpecies(speciesIds)) progress.discover(species)
      measureFarm()
      reportConditions()
    },
    animalReport: () => animals.filter((animal) => !animal.isSold).map((animal) => ({
      id: animal.id,
      name: animalNames.get(animal.id),
      stage: animal.stage,
      appearance: animal.isCaptured ? 'standard' : 'wild',
      heartEyes: animal.heartEyeCount > 0,
      heartCount: animal.heartEyeCount,
      x: +animal.root.position.x.toFixed(2),
      z: +animal.root.position.z.toFixed(2),
      loose: isLoose(animal.id),
    })),
    focusSpecies: (species, height = 4.5) => {
      const animal = animalById.get(species as (typeof animals)[number]['id'])
      if (!animal) return
      cameraTarget.copy(animal.root.position).setY(GARDEN_LAWN_Y + 1.1)
      viewHalfHeight = height / 2
      camera.position.copy(cameraTarget).add(initialOffset)
      viewDirection.copy(initialOffset).normalize()
      cameraDistance = initialOffset.length()
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld()
      updateCameraProjection()
    },
    grantCoins: (amount) => {
      const balance = wallet.credit(amount)
      salePanel.setWallet(balance)
      shopPanel.setWallet(balance)
      return balance
    },
    shop: () => {
      shopPanel.setWallet(wallet.balance)
      shopPanel.refresh()
      shopPanel.open()
      syncFarmChrome()
      return shopPanel.describe?.() ?? null
    },
    buy: (id) => {
      if (!gardenProps) return null
      const result = purchaseProp(wallet, gardenProps.inventory, id as PropId)
      salePanel.setWallet(wallet.balance)
      shopPanel.setWallet(wallet.balance)
      shopPanel.refresh()
      propboxPanel.refresh()
      return result
    },
    propCounts: () => (gardenProps ? { ...gardenProps.inventory.counts } : {}),
    placeProp: (id, cellX, cellZ, rotation = 0) => gardenProps?.placeProp(id as PropId, cellX, cellZ, rotation) ?? null,
    placeFence: (fromX, fromZ, toX, toZ) => gardenProps?.placeFence(fromX, fromZ, toX, toZ) ?? null,
    propReport: () => gardenProps?.report() ?? null,
    pickUpProp: (clientX, clientY) => gardenProps?.pickUpAt(clientX, clientY) ?? null,
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
let lastPerformanceLogAt = previousTime
let previousFrameTimestamp: number | null = null
window.addEventListener('resize', () => {
  performanceOverlay?.resize(window.innerWidth, window.innerHeight)
})
performanceOverlay?.resize(window.innerWidth, window.innerHeight)

function frame(now: number): void {
  const intervalMs = previousFrameTimestamp === null ? 0 : now - previousFrameTimestamp
  previousFrameTimestamp = now
  const timingEnabled = __GARDEN_DEBUG__ && gardenDebugMode
  const workStartedAt = timingEnabled ? performance.now() : 0
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  let stageStartedAt = workStartedAt
  removePreviousCameraShake()
  fairground.update(delta)
  // The plot grows when the farm expands, so the bounds every frame has to be
  // re-read: the terrain, the animals and the brush all clamp against it.
  currentGardenBounds = fairground.farmExpansion?.state.bounds ?? GARDEN_BOUNDS
  const fairgroundMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  viewerStage?.update(delta)
  updateMenuDrift(delta, now / 1000)
  animals.forEach((animal) => animal.update(delta))
  // The condition ladder runs after the animals have moved, so a settle
  // triggered this frame is applied against the farm as it is right now.
  updateAnimalProgress(delta)
  // The animals keep walking and following garden terrain on their own, so in
  // the viewer we pin them back onto their plinths after the update.
  if (mode === 'viewer') {
    for (const animal of animals) animal.root.position.copy(viewerStands.get(animal.id)!)
  }
  const animalsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  // A farm expansion moves the editable parcel edge; re-solve ponds only when
  // bounds actually change, never on every frame.
  if (gardenTerrain?.syncBounds()) {
    gardenWater?.markTerrainChanged()
    gardenWaterMesh?.markDirty()
  }
  gardenTools?.update(delta)
  if (gardenWaterMesh && (gardenWater?.dirty || gardenWaterMesh.dirty)) {
    gardenWaterMesh.update(now * 0.001)
  }
  const expansionState = fairground.farmExpansion?.state
  if (expansionState) {
    if (expansionState.level > lastExpansionLevel) {
      lastExpansionLevel = expansionState.level
      expansionFeedbackSeconds = CAMERA_SHAKE_DURATION
      expansionFeedbackStrength = 1
    }
  }
  gardenPlants?.update(delta, mode === 'farm' && !menu.isOpen && !journal.isOpen && !viewer.isOpen && !salePanel.isOpen)
  gardenProps?.update(delta)
  if (!gardenPlants?.selectedSpecies && !seedbox.isOpen) gardenTools?.setPlantingMode(false)
  if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !shopPanel.isOpen) refreshShopUi()
  seedbox.refresh()
  const toolsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  updateCameraPan(delta)
  applyExpansionCameraShake(delta, now / 1000)
  if (pointerWasSeen && !isOverGameHUD(pointerPosition.x, pointerPosition.y)) {
    if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !seedbox.isOpen && toolsHud.selectedTool === 'hand') gardenPlants?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y, button: 0 })
    gardenProps?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
    gardenTools?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
  } else {
    gardenPlants?.pointerLeave()
    gardenProps?.pointerLeave()
    gardenTools?.pointerLeave()
  }
  const otherUpdateMs = timingEnabled ? performance.now() - stageStartedAt : 0
  renderer.info.reset()
  stageStartedAt = timingEnabled ? performance.now() : 0
  renderer.render(scene, camera)
  const sceneRenderMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  ui.update(delta)
  ui.render(renderer)
  let overlayRenderMs = 0
  if (__GARDEN_DEBUG__ && performanceOverlay) {
    performanceOverlay.update(now, summarizeFrameTimings)
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(performanceOverlay.scene, performanceOverlay.camera)
    renderer.autoClear = true
  }
  if (__GARDEN_DEBUG__ && timingEnabled) {
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
