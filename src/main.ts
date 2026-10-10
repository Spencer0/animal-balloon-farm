import './style.css'
import * as THREE from 'three'
import type { BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions, ANIMAL_CATALOG, VIEWER_CAST } from './animals/animal-catalog'
import { isHouse } from './game/animal-housing'
import { createHousing } from './scene/housing'
import type { Bed } from './game/sleep'
import { containsGardenPoint, createFairground, createSkyDome, GARDEN_BOUNDS } from './scene/fairground'
import { ANIMAL_LIFE_CONFIG, createAnimalLife } from './game/animal-life'
import { createProgressLedger } from './game/farm-progression'
import { buildAccomplishmentCatalog, createAccomplishmentTracker } from './game/accomplishments'
import {
  createUpgradeLedger,
  purchasePropAtLevel,
  upgradeQuote,
  type UpgradeId,
} from './game/tool-unlocks'
import { createFarmMeasure } from './scene/farm-measure'
import { createFarmSave } from './game/farm-save'
import { createHerd } from './scene/herd'
import { createFarmLifecycle } from './scene/farm-lifecycle'
import { createFarmModes } from './ui/farm-modes'
import { tourSubjectsOf } from './scene/tour-subjects'
import { animalDisplayName, plantDisplayName } from './game/display-names'
import { createFarmActions } from './ui/farm-actions'
import { PROP_CATALOG, type PropId } from './game/farm-props'
import { GARDEN_LAWN_Y, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { createGardenWaterField } from './game/garden-water'
import { createGardenWaterMesh } from './scene/garden-water-mesh'
import { createGardenPlants, type GardenPlants } from './scene/garden-plants'
import { createGardenProps, type GardenProps, type PropSelection } from './scene/garden-props'
import { PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, SEED_PRICES, plantSpecies, type PlantId, type PlantSubstrate } from './game/plants'
import { STARTING_COINS, createWallet, generateAnimalNames, plantSaleValue } from './game/sales'
import type { GardenToolId } from './scene/garden-tool-art'
import { createFarmCamera } from './scene/farm-camera'
import { createUILayer, type UIPanel } from './ui/ui-layer'
import { advanceClock, calendarOf, createDayNightClock, phaseOf } from './game/day-night'
import { createDayNightRig } from './scene/day-night-rig'
import { weekdayName } from './game/carnival-schedule'
import { shopSite } from './game/shop-site'
import { createClockCalendarHud } from './ui/clock-calendar-hud'
import { createPlantCard } from './ui/plant-card'
import { createJournalPanel } from './ui/journal-panel'
import { createJournalConditions } from './ui/journal-conditions'
import { createJournalDomPanel, type JournalDomPanel } from './ui/journal-dom'
import { createMenuPanel } from './ui/menu-panel'
import { createOptionsDomPanel, type OptionsDomPanel } from './ui/options-dom'
import { createFpsCounter } from './ui/fps-counter'
import { createSettingsStore } from './game/settings'
import { createToolsHud } from './ui/tools-hud'
import { createBalloonPanel } from './ui/balloon-panel'
import { createPlayerDomPanel } from './ui/player-dom'
import { createSalePanel } from './ui/sale-panel'
import { createAnimalCard } from './ui/animal-card'
import { createPropCard } from './ui/prop-card'
import { createSellBurst, type SellBurst } from './ui/sell-burst'
import { createPredation } from './scene/predation'
import { createShedPanel } from './ui/shed-panel'
import { createShedDomPanel, type ShedDomPanel } from './ui/shed-dom'
import { createShopDomPanel, type ShopDomPanel } from './ui/shop-dom'
import { setCursor } from './ui/ui-cursor'
import { createHoverGlow } from './scene/hover-glow'
import { createFarmInput } from './input'
import { installGardenHarness } from './debug/garden-harness'
import { createViewerPanel } from './ui/viewer-panel'
import {
  browserSaveStorage,
  createSaveStore,
  resolveStartup,
} from './game/save-game'
import { createNotificationPanel } from './ui/notification-panel'
import { createNotificationDomPanel } from './ui/notification-dom'
import { createFrameTimer, createPerformanceOverlay } from './debug/frame-timing'

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
scene.background = new THREE.Color('#c2d8cf')
scene.fog = new THREE.Fog('#c2d8cf', 185, 345)
const skyDome = createSkyDome()
scene.add(skyDome)

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
// The farm camera owns the orthographic view and every way it moves (see
// scene/farm-camera.ts). The aliases below keep the call sites reading as before.
const farmCamera = createFarmCamera({
  renderer,
  inViewer: () => mode === 'viewer',
  menuDrifting: () => menu.isOpen && mode === 'farm',
  tourBlocked: () => mode !== 'farm' || menu.isOpen || journal.isOpen || salePanel.isOpen || shed.isOpen || shop.isOpen,
  viewerFocusStand: () => viewerFocusStand,
  tourSubjects: () => tourSubjectsOf(animals),
  onReframed: () => refreshAnimalVisibility(performance.now() / 1000, true),
  onTourStart: () => input.cancelDrag(),
})
const camera = farmCamera.camera
const cameraTarget = farmCamera.target
const focusCamera = farmCamera.focus
const updateCameraProjection = farmCamera.updateProjection
const frameAt = farmCamera.frameAt
const beginCameraTour = (seed?: number): boolean => farmCamera.beginTour(seed)
const endCameraTour = (restore: boolean): void => farmCamera.endTour(restore)
const resetCameraToStart = farmCamera.resetToStart
const updateCameraTour = farmCamera.updateTour

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

// Saves are off under the debug harness: its scenarios build exact farms, and a
// stray autosave (or an auto-loaded farm) would corrupt a stress measurement.
const saveEnabled = !gardenDebugMode || pageParams.has('saves')
const saveStore = createSaveStore(saveEnabled ? browserSaveStorage() : null)
const startup = saveEnabled ? resolveStartup(saveStore, saveStore.takeBoot()) : { slot: null, envelope: null, notice: null }
const loadedSave = startup.envelope?.data ?? null
const dayNightClock = createDayNightClock()
if (loadedSave) {
  dayNightClock.timeOfDay = Math.min(0.9999, Math.max(0, loadedSave.clock.timeOfDay))
  dayNightClock.elapsedDays = Math.max(0, Math.floor(loadedSave.clock.elapsedDays))
}
/** Debug only: a held clock stays put, so a scenario's night does not slip into morning. */
let clockHeld = false
const dayNightRig = createDayNightRig(scene, renderer, { sun: sunlight, ambient, fill, rim }, skyDome)
const clockCalendarHud = createClockCalendarHud(window.innerWidth, window.innerHeight)

const fairground = createFairground(dayNightClock.elapsedDays)
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
gardenTerrain?.applyToMeshes(true)
// Water shares the terrain grid so it sees the flat parcel edge and every sculpt.
const gardenWater = gardenTerrain
  ? createGardenWaterField({
      cellSize: gardenTerrain.cellSize,
      gridCols: gardenTerrain.gridCols,
      gridRows: gardenTerrain.gridRows,
      cellHeight: (gx, gz) => gardenTerrain.cellHeightAt(gx, gz),
    })
  : null
const gardenWaterMesh = gardenTerrain && gardenWater  ? createGardenWaterMesh(gardenTerrain, gardenWater, activeGardenBounds)
  : null
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


let gardenPlants: GardenPlants | null = null
let coverageLookup: ((x: number, z: number) => number) | null = null

/**
 * What the ground is like at a world position, for the plant rules.
 *
 * Shared with the debug harness on purpose: a test then plants a seed through
 * exactly the rules the seedbox uses, instead of a second implementation that
 * can quietly disagree about what counts as a pond.
 */
function plantSurfaceAt(x: number, z: number) {
  const waterDepth = gardenWater?.depthAt(x, z) ?? 0
  let substrate: PlantSubstrate = 'soil'
  const coverage = coverageLookup?.(x, z) ?? 0
  if (waterDepth >= PLANT_WATER_MIN_DEPTH) substrate = 'water'
  else if (coverage > 0.18) substrate = 'grass'
  return {
    substrate,
    waterDepth,
    coverage,
    // Ground cover (clover, dandelions) wants short, peaceable lawn; the tall
    // meadow pack grows past the cap and crowds it out.
    tallGrass: gardenTools?.grassKindAt(x, z, GROUND_COVER_GRASS_RADIUS) === 'tall',
    inBounds: containsGardenPoint(x, z, currentGardenBounds),
  }
}
/** How far around a patch the lawn is checked for tall grass, in metres. */
const GROUND_COVER_GRASS_RADIUS = 0.9
if (fairground.gardenSurface && gardenTerrain && gardenWater) {
  const coverageCellSize = 0.58
  const coverageCells = new Map<string, number[]>()
  let positions = fairground.gardenSurface.geometry.getAttribute('position') as THREE.BufferAttribute
  let colors = fairground.gardenSurface.geometry.getAttribute('color') as THREE.BufferAttribute
  const rebuildCoverageLookup = (): void => {
    positions = fairground.gardenSurface!.geometry.getAttribute('position') as THREE.BufferAttribute
    colors = fairground.gardenSurface!.geometry.getAttribute('color') as THREE.BufferAttribute
    coverageCells.clear()
    for (let index = 0; index < positions.count; index += 1) {
      const cellX = Math.floor(positions.getX(index) / coverageCellSize)
      const cellZ = Math.floor(-positions.getY(index) / coverageCellSize)
      const key = `${cellX},${cellZ}`
      const cell = coverageCells.get(key) ?? []
      cell.push(index)
      coverageCells.set(key, cell)
    }
    coverageLookup = (x, z) => {
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
            if (distance < best) { nearest = index; best = distance }
          }
        }
      }
      return nearest >= 0 ? colors.getW(nearest) : 0
    }
  }
  rebuildCoverageLookup()
  gardenPlants = createGardenPlants(
    gameCanvas,
    camera,
    fairground.gardenSurface,
    gardenTerrain,
    gardenWater,
    activeGardenBounds,
    plantSurfaceAt,
  )
  scene.add(gardenPlants.root)
}

/**
 * The arcade store stands at the treeline, past the fully expanded farm, so no
 * amount of growth can reach it. It unlocks at farmer level 2 and is built
 * on site. The site and facing come from shop-site.ts, which the grove reads too.
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
    shop: { ...shopSite(), url: 'assets/buildings/farm-shop.glb', size: 6.4 },
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
const progress = createAnimalLife(speciesIds)
const progression = createProgressLedger()
const accomplishments = createAccomplishmentTracker(buildAccomplishmentCatalog(
  ANIMAL_CATALOG.map((entry) => ({ id: entry.id, name: entry.name })),
  PLANT_CATALOG.map((entry) => ({ id: entry.id, name: entry.name })),
))
/** Stages 0 and 1 live at the carnival; 2 and up are inside the fence. */
const isLoose = (animalId: string): boolean => progress.animal(animalId)?.stage === 1


const generatedAnimalNames = generateAnimalNames(48)
const animalNames = new Map<string, string>()
const animalById = new Map<string, BalloonAnimal>()
const animals: BalloonAnimal[] = []
const animalPopulationLimit = ANIMAL_LIFE_CONFIG.maximumPopulation
let focusedAnimalId: string | null = null
/**
 * Real animal models stood on the lawn for sustained load ramps. Empty in
 * normal play; the debug harness fills it via setCrowd and every reset path
 * drains it, so a fixture can never leak into a shipped session.
 */
const crowdFixtures: BalloonAnimal[] = []
const farmHomes = new Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>()
const viewerStands = new Map<string, THREE.Vector3>()
const animalCreations = new Map<string, Promise<BalloonAnimal>>()

// A loaded farm brings its animals back as they were: same ids, names, stages,
// growth and places. Their models are built below exactly as a fresh farm's are.
const savedPlaces = new Map<string, { x: number; z: number }>()
/**
 * Animals that were indoors when the farm was saved, and the door they went in
 * by. They get no model at load; once this session's houses exist they go
 * straight back into the nearest one of their kind (see `updateHousing`).
 */
const savedIndoors = new Map<string, { x: number; z: number }>()
if (loadedSave) {
  progress.importState(loadedSave.life)
  for (const [id, place] of Object.entries(loadedSave.animalPlaces)) {
    if (!progress.animal(id)) continue
    if (place.name) animalNames.set(id, place.name)
    if (Number.isFinite(place.x) && Number.isFinite(place.z)) savedPlaces.set(id, { x: place.x, z: place.z })
  }
  for (const saved of loadedSave.life.animals) {
    if (saved.inside && progress.animal(saved.id)) savedIndoors.set(saved.id, savedPlaces.get(saved.id) ?? { x: 0, z: 0 })
  }
}
const { pickAnimal, refreshAnimalVisibility, carnivalSpawnFor, clearCrowdFixtures, setCrowdFixtures, createAnimalInstance, shownCount, resetVisibilityClock } = createHerd({
  camera,
  gameCanvas,
  fairgroundRoot: fairground.root,
  gardenTerrain,
  activeGardenBounds,
  progress,
  isLoose,
  animals,
  animalById,
  animalNames,
  generatedAnimalNames,
  animalPopulationLimit,
  animalCreations,
  farmHomes,
  viewerStands,
  crowdFixtures,
  mode: () => mode,
  getViewerCastAnimals: () => getViewerCastAnimals(),
})
await Promise.all(progress.all()
  .filter((record) => !savedIndoors.has(record.id))
  .map((record) => createAnimalInstance(record, savedPlaces.get(record.id))))
  const wallet = createWallet(STARTING_COINS)
/** Tools and land the shop has sold. Farmer level decides what it will sell next. */
const upgrades = createUpgradeLedger()

// Individual residents and visitors are spawned from the pure animal-life records below.

// Farm homes and viewer plinths are assigned as each independently tracked animal is created.
/**
 * The viewer is the review booth for new models: VIEWER_CAST decides which
 * species it stages, so a model being tuned stands there alone instead of
 * sharing the stage with the whole catalog. The rest of the farm carries on
 * without them and is untouched when the booth closes.
 */
const getViewerCastAnimals = (): BalloonAnimal[] => animals.filter((animal) => VIEWER_CAST.includes(animal.id))
const viewerFocusStand = VIEWER_CAST.length === 1
  ? new THREE.Vector3(SHOWCASE_ANIMALS[VIEWER_CAST[0]].spawn[0], GARDEN_LAWN_Y + 0.1, SHOWCASE_ANIMALS[VIEWER_CAST[0]].spawn[1])
  : null







/** Adult residents per species, which is what a `residentCount` condition reads. */
function residentCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of progress.all()) {
    if (entry.stage < 3 || entry.baby || animalById.get(entry.id)?.isSold) continue
    counts[entry.species] = (counts[entry.species] ?? 0) + 1
  }
  return counts
}




















/** Where each sleeping night animal lay down, so it keeps its bed all day instead of chasing the nearest can. */
const sleepBeds = new Map<string, Bed>()




// -------------------------------------------------------------------- houses --
//
// Each species keeps a few animals out on the farm and the rest indoors (see
// game/animal-housing.ts). Nobody owns a bed: an animal sent in walks to the
// nearest house of its kind with room and takes a space, and its model is
// disposed; one coming out is rebuilt at that house's door. That is what keeps
// the drawn herd small however big it grows.

/** Animals walking to a door to go in: which house, and when they set off. */
const goingIn = new Map<string, { readonly houseId: string; readonly since: number }>()
/** A newborn stays in view this long after its birth, so the player sees it come out. */
const newbornUntil = new Map<string, number>()
const NEWBORN_SHOW_SECONDS = 25
/** Every door seen this session, so an animal put out of a stored house appears where it stood. */
const knownDoors = new Map<string, { readonly x: number; readonly z: number }>()
/** The house each indoor animal went into. */
const lastHouseOf = new Map<string, string>()














// ---------------------------------------------------------------- collisions --

const bodySizeBySpecies = new Map(ANIMAL_CATALOG.map((entry) => [entry.id as string, entry.size]))


// ---------------------------------------------------------------- game modes --
// The farm and the animal viewer are the same scene with different staging, so
// switching modes swaps the fairground rather than reloading the page. That is
// what lets the main menu hand off to either one without a navigation.

type GameMode = 'farm' | 'viewer'
let mode: GameMode = 'farm'



// ------------------------------------------------------------------- UI layer --

const ui = createUILayer()
const performanceOverlay = __GARDEN_DEBUG__ && gardenDebugMode && !pageParams.has('nohud') ? createPerformanceOverlay() : null
const frameTimer = __GARDEN_DEBUG__ && gardenDebugMode ? createFrameTimer(renderer, () => farmCamera.zoom) : null
ui.resize(window.innerWidth, window.innerHeight)

const journal = createJournalPanel(window.innerWidth, window.innerHeight, (isJournalOpen) => {
  syncFarmChrome()
  journalDom.setOpen(isJournalOpen)
})
const journalDom: JournalDomPanel = createJournalDomPanel({
  onClose: () => journal.close(),
})
journal.setSpreadSuppressed(true)

const settingsStore = createSettingsStore((() => {
  try {
    return window.localStorage
  } catch {
    return null
  }
})())
const fpsCounter = createFpsCounter()
fpsCounter.setVisible(settingsStore.settings.showFps)
settingsStore.subscribe((settings) => fpsCounter.setVisible(settings.showFps))
const optionsDom: OptionsDomPanel = createOptionsDomPanel({
  onClose: () => {
    optionsDom.setOpen(false)
    refreshCursor()
  },
  settings: () => settingsStore.settings,
  onChange: (key, value) => settingsStore.set(key, value),
})

const notificationPanel = createNotificationPanel(window.innerWidth, window.innerHeight)
notificationPanel.setMailboxVisible(false)
const notificationDom = createNotificationDomPanel({
  onClose: () => {
    notificationDom.setOpen(false)
    syncFarmChrome()
    refreshCursor()
  },
})
const knownMaturePlants = new Set<number>()

const toolsHud = createToolsHud(
  gardenTools?.selectedTool ?? null,
  (id: GardenToolId | null) => selectGardenTool(id),
  window.innerWidth,
  window.innerHeight,
)

/** Put the seeder's pack in the tool bar, and show the E chip once there is a second one. */
function syncGrassPack(): void {
  toolsHud.setGrassPack(gardenTools?.grassPack ?? 'short', upgrades.owns('tall-grass'))
}

/** E with the seed bag out swaps the blue lawn pack and the green meadow pack. */
function swapGrassPack(): boolean {
  if (!gardenTools || gardenTools.selectedTool !== 'grass' || !upgrades.owns('tall-grass')) return false
  gardenTools.setGrassPack(gardenTools.grassPack === 'short' ? 'tall' : 'short')
  syncGrassPack()
  return true
}

// The meadow pack leaves ground cover alone. Plant positions change rarely and
// the seeder asks per blade, so the patch list is cached for a moment.
let coverPatches: { x: number; z: number }[] = []
let coverPatchesAt = -Infinity
gardenTools?.setTallGrassBlocker((x, z) => {
  const now = performance.now()
  if (now - coverPatchesAt > 250) {
    coverPatchesAt = now
    coverPatches = (gardenPlants?.simulation.plants ?? [])
      .filter((plant) => plantSpecies(plant.species).groundCover)
      .map((plant) => ({ x: plant.x, z: plant.z }))
  }
  return coverPatches.some((patch) => (patch.x - x) ** 2 + (patch.z - z) ** 2 < GROUND_COVER_GRASS_RADIUS ** 2)
})

syncGrassPack()

const menu = createMenuPanel((choice) => handleMenuChoice(choice), window.innerWidth, window.innerHeight, () => {
  syncFarmChrome()
})
const viewer = createViewerPanel({
  getAnimals: () => animals.filter((animal) => !animal.isSold && VIEWER_CAST.includes(animal.id)),
  getAnimalName: (id) => animalNames.get(animals.find((animal) => animal.id === id)?.instanceId ?? id) ?? id,
  playAll: () => {
    for (const animal of getViewerCastAnimals()) {
      if (animal.isCaptured) animal.setAppearance('wild')
      animal.beginCapture()
    }
  },
  resetAll: () => getViewerCastAnimals().forEach((animal) => animal.setAppearance('wild')),
  exit: () => setMode('farm'),
  replay: (id) => {
    const animal = animals.find((entry) => entry.id === id)
    if (!animal || animal.isSold) return
    if (animal.isCaptured) animal.setAppearance('wild')
    animal.beginCapture()
  },
}, window.innerWidth, window.innerHeight, VIEWER_CAST)


const salePanel = createSalePanel((target) => {
  if (target.kind === 'animal') {
    return completeAnimalSale(target.id)?.balance ?? null
  }
  const plantId = Number(target.id)
  const plant = gardenPlants?.simulation.plants.find((entry) => entry.instanceId === plantId)
  if (!plant || !gardenPlants?.removePlant(plantId)) return null
  shedDom.refresh()
  const balance = wallet.credit(plantSaleValue(plant.species, plant.growth))
  salePanel.setWallet(balance)
  return balance
}, window.innerWidth, window.innerHeight, (isOpen) => {
  if (typeof toolsHud !== 'undefined') {
    if (isOpen) {
      gardenPlants?.cancelPlacement()
      gardenTools?.setPlantingMode(false)
      shed.setPlacementActive(false)
    } else {
      gardenPlants?.clearSelection()
    }
    toolsHud.setVisible(mode === 'farm' && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !isOpen)
    refreshCursor()
  }
})
salePanel.setWallet(wallet.balance)
salePanel.setWalletVisible(false)

const sellBursts: SellBurst[] = []


const animalCard = createAnimalCard({
  onSell: (target) => {
    const result = completeAnimalSale(target.instanceId)
    if (!result) return null
    animalCard.close()
    syncFarmChrome()
    refreshCursor()
    return { balance: result.balance, price: result.price }
  },
  onJournal: (speciesId) => {
    animalCard.close()
    journal.openToSpecies(speciesId)
    journalDom.selectSpecies(speciesId)
    syncFarmChrome()
    refreshCursor()
  },
  onRename: (instanceId, name) => {
    animalNames.set(instanceId, name)
  },
  // The card is a pinned note, not a modal: opening it never hides the tool
  // bar, never cancels placement, and never pauses the farm underneath.
  onToggle: () => {
    refreshCursor()
  },
}, window.innerWidth, window.innerHeight)

/**
 * The prop info card. `selectedProp` outlives the card closing on purpose: a
 * button press closes the card first and then runs its action.
 */
let selectedProp: PropSelection | null = null
const propCard = createPropCard({
  onMove: () => {
    if (!selectedProp || !gardenProps?.beginMove(selectedProp)) return
    gardenPlants?.cancelPlacement()
    gardenTools?.setPlantingMode(false)
    shed.setPlacementActive(true)
    syncFarmChrome()
  },
  onStore: () => {
    if (!selectedProp || !gardenProps?.store(selectedProp)) return
    shedDom.refresh()
    syncFarmChrome()
  },
  onSell: () => {
    const sold = selectedProp
    const coins = sold && gardenProps ? gardenProps.sell(sold) : null
    if (!sold || coins === null) return false
    // A house goes with everyone who lives in it; the card warned about this.
    if (isHouse(sold.id)) sellAnimalsInside(sold.siteId)
    salePanel.setWallet(wallet.credit(coins))
    const burst = createSellBurst(new THREE.Vector3(sold.anchor.x, sold.anchor.y, sold.anchor.z), coins)
    scene.add(burst.root)
    sellBursts.push(burst)
    shedDom.refresh()
    syncFarmChrome()
    return true
  },
  onToggle: (isOpen) => {
    if (!isOpen) gardenProps?.select(null)
    refreshCursor()
  },
}, window.innerWidth, window.innerHeight)


const shed = createShedPanel(window.innerWidth, window.innerHeight, (isShedOpen) => {
  shedDom.setOpen(isShedOpen)
  syncFarmChrome()
  refreshCursor()
})
const shedDom: ShedDomPanel = createShedDomPanel({
  onClose: () => shed.close(),
  onPlant: (species: PlantId) => {
    if (!gardenPlants) return
    shed.close()
    // Planting, watering and pruning need no tool. Put any tool down before
    // arming the seed, or the click lands on a farm tool and is lost.
    if (toolsHud.selectedTool !== null) selectGardenTool(null)
    gardenTools?.setPlantingMode(true)
    gardenPlants.selectSpecies(species)
    shed.setPlacementActive(true)
    syncFarmChrome()
    shedDom.refresh()
    refreshCursor()
  },
  onPlace: (id: PropId) => {
    if (!gardenProps) return
    shed.close()
    if (toolsHud.selectedTool !== null) selectGardenTool(null)
    gardenProps.beginPlacement(id)
    gardenPlants?.cancelPlacement()
    gardenTools?.setPlantingMode(false)
    shed.setPlacementActive(true)
    syncFarmChrome()
    refreshCursor()
  },
  seedsFor: (species) => gardenPlants?.simulation.seedsFor(species) ?? 0,
  countsFor: (id) => gardenProps?.inventory.count(id) ?? 0,
  balance: () => wallet.balance,
})

/* Keep the shed and the shop showing the same counts the world does. */


const shop: ShopDomPanel = createShopDomPanel({
  onClose: () => {
    shop.setOpen(false)
    syncFarmChrome()
    refreshCursor()
  },
  onBuy: (id: PropId) => {
    if (!gardenProps) return { ok: false, text: 'The shopkeeper is still unpacking.' }
    const result = purchasePropAtLevel(wallet, gardenProps.inventory, id, progression.level)
    if (result.ok) {
      salePanel.setWallet(wallet.balance)
      saveSoon()
      shedDom.refresh()
      shop.refresh()
    }
    return {
      ok: result.ok,
      text: result.ok
        ? 'Shed stock updated -- Pip slides it across the counter.'
        : result.locked
          ? `Pip does not stock the ${PROP_CATALOG[id].name} for you yet -- reach farmer level ${result.requiredLevel + 1}.`
          : `Not enough coins for the ${PROP_CATALOG[id].name} -- it costs ${PROP_CATALOG[id].price}.`,
    }
  },
  onBuySeed: (species: PlantId) => {
    const name = PLANT_CATALOG.find((entry) => entry.id === species)?.name ?? 'Seed'
    const price = SEED_PRICES[species]
    if (!gardenPlants || wallet.debit(price) === null) {
      return { ok: false, text: `Not enough coins for ${name} seed -- it costs ${price}.` }
    }
    gardenPlants.simulation.addSeeds(species, 1)
    salePanel.setWallet(wallet.balance)
    saveSoon()
    shedDom.refresh()
    shop.refresh()
    return { ok: true, text: `One ${name} seed tucked into the shed.` }
  },
  farmerLevel: () => progression.level,
  quoteUpgrade: (id: UpgradeId) => upgradeQuote(id, upgrades, progression.level),
  onBuyUpgrade: (id: UpgradeId) => buyUpgrade(id),
  countsFor: (id) => gardenProps?.inventory.count(id) ?? 0,
  seedsFor: (species) => gardenPlants?.simulation.seedsFor(species) ?? 0,
  balance: () => wallet.balance,
})


const playerDom = createPlayerDomPanel({
  onClose: () => {
    playerDom.setOpen(false)
    syncFarmChrome()
    refreshCursor()
  },
})

const balloon = createBalloonPanel(window.innerWidth, window.innerHeight, (quadrant) => {
  if (quadrant === 'journal') {
    shed.close()
    shop.setOpen(false)
    playerDom.setOpen(false)
    journal.open()
  } else if (quadrant === 'shed') {
    journal.close()
    shop.setOpen(false)
    playerDom.setOpen(false)
    shed.open()
  } else if (quadrant === 'player') {
    journal.close()
    shed.close()
    shop.setOpen(false)
    playerDom.refresh(playerDomStats())
    playerDom.setOpen(true)
  } else {
    journal.close()
    shed.close()
    shop.setOpen(false)
    playerDom.setOpen(false)
    if (notificationDom.isOpen) {
      notificationDom.setOpen(false)
    } else {
      notificationPanel.markAllRead()
      notificationDom.refresh(notificationPanel.getLetters(), notificationPanel.nowSeconds())
      notificationDom.setOpen(true, balloonInboxAnchor())
      balloon.setPostBadge('')
    }
  }
  syncFarmChrome()
  refreshCursor()
})


/**
 * The plant info card: the animal card's twin. Clicking a plant pins it beside
 * the plant with its growth, what it needs, and Sell / Journal buttons.
 */
const plantCard = createPlantCard({
  onSell: (target) => {
    const plant = gardenPlants?.simulation.plants.find((entry) => entry.instanceId === target.instanceId)
    if (!plant || !gardenPlants?.removePlant(target.instanceId)) return null
    const price = plantSaleValue(plant.species, plant.growth)
    const balance = wallet.credit(price)
    salePanel.setWallet(balance)
    shedDom.refresh()
    plantCard.close()
    syncFarmChrome()
    refreshCursor()
    return { balance, price }
  },
  onJournal: (speciesId) => {
    plantCard.close()
    journal.openToSpecies('')
    journalDom.selectPlant(speciesId)
    syncFarmChrome()
    refreshCursor()
  },
  // Pinned note, not a modal: it never hides the tool bar or pauses the farm.
  // Closing it drops the plant's selection ring.
  onToggle: (isOpen) => {
    if (!isOpen) gardenPlants?.clearSelection()
    refreshCursor()
  },
}, window.innerWidth, window.innerHeight)



// ------------------------------------------------------------ save and load --
// Everything a farm is, as plain data, and the way back from it. Loading and
// starting over both reload the page (see game/save-game.ts), so the world below
// is only ever built one way: fresh, and then `applySavedWorld` lays a save over it.










// Closing the tab, reloading for Load or New, or switching away keeps the last
// minute of play. `pagehide` is the reliable one on mobile and in the bfcache.



const panels: UIPanel[] = [balloon, notificationPanel, toolsHud, shed, menu, viewer, journal, salePanel, animalCard, plantCard, propCard, clockCalendarHud]

/**
 * The furthest rung each species has reached this session. The journal is a
 * record of what the player has met, so selling the last cow must not turn her
 * page back into "???" -- the page is read from here, not from a live animal.
 */
const journalBestStage = new Map<string, number>()

function noteJournalStages(): void {
  for (const record of progress.all()) {
    if (record.stage > (journalBestStage.get(record.species) ?? 0)) journalBestStage.set(record.species, record.stage)
  }
}

const { journalConditionsSource } = createJournalConditions({
  progress,
  measureFarm: () => measureFarm(),
  noteJournalStages: () => noteJournalStages(),
  journalBestStage,
})
journal.setConditionsSource(journalConditionsSource)
journalDom.setConditionsSource(journalConditionsSource)

for (const panel of panels) ui.add(panel)







const { predationLedger, owlHunt, snakeHunt, popsInFlight, bolting, hidingUntil, panicking, updateOwlHunt, updateSnakeHunt } = createPredation({
  fairgroundRoot: fairground.root,
  lawnY: GARDEN_LAWN_Y,
  scene,
  progress,
  animals,
  animalById,
  animalNames,
  farmHomes,
  viewerStands,
  goingIn,
  getFocusedAnimal: () => focusedAnimalId,
  setFocusedAnimal: (id) => { focusedAnimalId = id },
  mode: () => mode,
  houses: () => houses(),
  gardenProps: () => gardenProps,
  animalCard,
  syncFarmChrome: () => syncFarmChrome(),
  notificationPanel,
  refreshAnimalVisibility,
  carnivalSpawnFor,
  activeGardenBounds,
  residentCounts,
  bodySizeBySpecies,
  speciesPluralName: (species) => speciesPluralName(species),
  dayNightClock,
})
const { measureFarm, remeasureMeadow, maturePlantCounts } = createFarmMeasure({
  gardenSurface: () => fairground.gardenSurface,
  gardenTerrain,
  gardenWater,
  gardenTools,
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  residentCounts,
  preyEaten: () => predationLedger.totals,
})
const { houses, setHouses, resetRoster, updateHousing, speciesPluralName, sellAnimalsInside, residentsOf, collideAnimals, updateSleepers } = createHousing({
  progress,
  animals,
  animalById,
  farmHomes,
  viewerStands,
  goingIn,
  newbornUntil,
  knownDoors,
  lastHouseOf,
  savedIndoors,
  sleepBeds,
  bolting,
  hidingUntil,
  getFocusedAnimal: () => focusedAnimalId,
  isHunted: (id) => owlHunt.huntedIds().has(id) || snakeHunt.huntedIds().has(id),
  createAnimalInstance,
  animalCreations,
  refreshAnimalVisibility,
  mode: () => mode,
  dayNightClock,
  getSelectedProp: () => selectedProp,
  propCard,
  creditCoins: (amount) => { salePanel.setWallet(wallet.credit(amount)) },
  animalDisplayName,
  bodySizeBySpecies,
  crowdFixtures,
  gardenProps: () => gardenProps,
})
const { autosave, saveSoon, tickAutosave, markEntered, applySavedWorld, farmsPanel } = createFarmSave({
  loadedSave,
  startupSlot: startup.slot,
  saveStore,
  saveEnabled,
  dayNightClock,
  wallet,
  progression,
  upgrades,
  accomplishments,
  progress,
  predationLedger,
  fairground,
  gardenTools,
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  gardenTerrain,
  gardenWater,
  gardenWaterMesh,
  animalNames,
  animalById,
  knownDoors,
  knownMaturePlants,
  journalBestStage,
  setGardenBounds: (bounds) => { currentGardenBounds = bounds },
  setLastExpansionLevel: (level) => { lastExpansionLevel = level },
  remeasureMeadow,
  syncGrassPack,
  refreshShopUi: () => refreshShopUi(),
  noteJournalStages,
  salePanel,
  notificationPanel,
  menuOpen: () => menu.isOpen,
  mode: () => mode,
  syncFarmChrome: () => syncFarmChrome(),
})
window.addEventListener('pagehide', autosave)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave() })
const { progressionHudState, handleAnimalLifeEvents, animalLifeSnapshot, updateAnimalProgress, ownedSeedSpecies, unlockAccomplishment } = createFarmLifecycle({
  progress,
  progression,
  accomplishments,
  notificationPanel,
  animals,
  animalById,
  farmHomes,
  viewerStands,
  newbornUntil,
  NEWBORN_SHOW_SECONDS,
  fairgroundRoot: fairground.root,
  refreshAnimalVisibility,
  getFocusedAnimal: () => focusedAnimalId,
  mode: () => mode,
  menuOpen: () => menu.isOpen,
  salePanelOpen: () => salePanel.isOpen,
  gardenProps: () => gardenProps,
  gardenPlants: () => gardenPlants,
  expansionLevel: () => fairground.farmExpansion?.state.level ?? 0,
  houses,
  setHouses,
  updateHousing,
  measureFarm,
  dayNightClock,
  createAnimalInstance,
  carnivalSpawnFor,
  animalDisplayName,
  noteJournalStages,
})
const { openAnimalCardFor, completeAnimalSale, openPropCardFor, refreshShopUi, buyUpgrade, playerDomStats, balloonInboxAnchor, openPlantCardFor, syncPlantCard } = createFarmActions({
  camera,
  ui,
  scene,
  animalCard,
  propCard,
  plantCard,
  salePanel,
  shed,
  shedDom,
  shop,
  balloon,
  wallet,
  upgrades,
  progression,
  progress,
  accomplishments,
  fairground,
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  gardenTools,
  animals,
  animalById,
  animalNames,
  farmHomes,
  viewerStands,
  sellBursts,
  getFocusedAnimal: () => focusedAnimalId,
  setFocusedAnimal: (id) => { focusedAnimalId = id },
  setSelectedProp: (selection) => { selectedProp = selection },
  refreshAnimalVisibility,
  residentsOf,
  saveSoon,
  syncGrassPack,
  syncFarmChrome: () => syncFarmChrome(),
  progressionHudState,
  ownedSeedSpecies,
})
const { selectGardenTool, handleMenuChoice, setMode, syncFarmChrome, updateViewerStage } = createFarmModes({
  scene,
  fairground,
  getMode: () => mode,
  setGameMode: (next) => { mode = next },
  menu,
  viewer,
  salePanel,
  animalCard,
  propCard,
  plantCard,
  shed,
  shop,
  journal,
  toolsHud,
  balloon,
  clockCalendarHud,
  notificationDom,
  playerDom,
  optionsDom,
  farmsPanel,
  markEntered,
  gardenTools,
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  viewerStands,
  farmHomes,
  getViewerCastAnimals: () => getViewerCastAnimals(),
  refreshAnimalVisibility,
  focusCamera,
  updateCameraProjection,
  endCameraTour,
  refreshCursor: () => refreshCursor(),
})
const hoverGlow = createHoverGlow()
scene.add(hoverGlow.root)
const input = createFarmInput({
  canvas: gameCanvas,
  gardenDebugMode,
  ui,
  panels,
  mode: () => mode,
  setFocusedAnimal: (id) => { focusedAnimalId = id },
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  gardenTools,
  menu,
  journal,
  viewer,
  shed,
  shedDom,
  shop,
  salePanel,
  animalCard,
  propCard,
  plantCard,
  toolsHud,
  farmCamera,
  pickAnimal,
  openAnimalCardFor: (animal) => openAnimalCardFor(animal),
  openPropCardFor,
  openPlantCardFor,
  selectGardenTool,
  swapGrassPack,
  syncFarmChrome: () => syncFarmChrome(),
  refreshShopUi,
  terrainHeightAt: (x, z) => gardenTerrain?.heightAt(x, z) ?? 0,
  endCameraTour,
  hoverGlow,
})
// Used by the UI and the harness; the input module owns the actual cursor logic.
const refreshCursor = (): void => input.refreshCursor()
input.attach()

menu.open()
syncFarmChrome()
if (loadedSave) applySavedWorld(loadedSave)
else if (startup.notice) farmsPanel.open(startup.notice)
// No pointer has entered the window yet, so nothing to place. Once it does,
// the first move resolves the cursor.
setCursor('idle', gameCanvas)

shed.resize(window.innerWidth, window.innerHeight)
salePanel.resize(window.innerWidth, window.innerHeight)
animalCard.resize(window.innerWidth, window.innerHeight)
propCard.resize(window.innerWidth, window.innerHeight)
plantCard.resize(window.innerWidth, window.innerHeight)
window.addEventListener('resize', () => {
  updateCameraProjection()
  ui.resize(window.innerWidth, window.innerHeight)
  shed.resize(window.innerWidth, window.innerHeight)
  salePanel.resize(window.innerWidth, window.innerHeight)
  animalCard.resize(window.innerWidth, window.innerHeight)
  propCard.resize(window.innerWidth, window.innerHeight)
  plantCard.resize(window.innerWidth, window.innerHeight)
  balloon.resize(window.innerWidth, window.innerHeight)
})

if (__GARDEN_DEBUG__ && gardenDebugMode) {
  installGardenHarness({
    canvas: gameCanvas,
    wallet,
    pageParams,
    renderer,
    scene,
    camera,
    cameraTarget,
    farmCamera,
    focusCamera,
    frameAt,
    beginCameraTour,
    endCameraTour,
    resetCameraToStart,
    updateCameraTour,
    dayNightClock,
    fairground,
    gardenTerrain,
    gardenWater,
    gardenWaterMesh,
    gardenTools,
    gardenPlants: () => gardenPlants,
    gardenProps: () => gardenProps,
    mode: () => mode,
    shownAnimalCount: () => shownCount(),
    houseSpots: () => houses(),
    gardenBounds: () => currentGardenBounds,
    setGardenBounds: (bounds) => { currentGardenBounds = bounds },
    setClockHeld: (held) => { clockHeld = held },
    setFocusedAnimal: (id) => { focusedAnimalId = id },
    resetRoster: () => {
      resetRoster()
    },
    resetVisibilityClock,
    refreshAnimalVisibility,
    plantSurfaceAt,
    progress,
    progression,
    accomplishments,
    upgrades,
    isLoose,
    animalNames,
    animalById,
    animals,
    predationLedger,
    owlHunt,
    snakeHunt,
    popsInFlight,
    crowdFixtures,
    clearCrowdFixtures,
    setCrowdFixtures,
    farmHomes,
    viewerStands,
    createAnimalInstance,
    maturePlantCounts,
    remeasureMeadow,
    measureFarm,
    handleAnimalLifeEvents,
    updateOwlHunt,
    updateSnakeHunt,
    bolting,
    hidingUntil,
    panicking,
    sleepBeds,
    animalLifeSnapshot,
    goingIn,
    newbornUntil,
    lastHouseOf,
    updateHousing,
    residentsOf,
    collideAnimals,
    ui,
    frameTimer,
    journal,
    notificationPanel,
    notificationDom,
    knownMaturePlants,
    syncGrassPack,
    swapGrassPack,
    menu,
    viewer,
    openAnimalCardFor,
    salePanel,
    sellBursts,
    animalCard,
    shed,
    shedDom,
    refreshShopUi,
    buyUpgrade,
    shop,
    playerDomStats,
    playerDom,
    balloon,
    balloonInboxAnchor,
    plantCard,
    openPlantCardFor,
    panels,
    selectGardenTool,
    setMode,
    syncFarmChrome: () => syncFarmChrome(),
  })
}

/**
 * A slow drift around the farm while the main menu is up.
 *
 * A still camera makes the menu read as a screenshot of the game with buttons
 * on it. Easing the orbit in and out makes the diorama feel like a place you
 * are standing in front of, which is the whole point of drawing the menu over
 * the live farm rather than replacing it.
 */

// --------------------------------------------------------------- render loop --

updateCameraProjection()

let previousTime = performance.now()
let previousFrameTimestamp: number | null = null
window.addEventListener('resize', () => {
  performanceOverlay?.resize(window.innerWidth, window.innerHeight)
})
performanceOverlay?.resize(window.innerWidth, window.innerHeight)

function frame(now: number): void {
  fpsCounter.frame(now)
  const intervalMs = previousFrameTimestamp === null ? 0 : now - previousFrameTimestamp
  previousFrameTimestamp = now
  const timingEnabled = __GARDEN_DEBUG__ && gardenDebugMode
  const workStartedAt = timingEnabled ? performance.now() : 0
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  let stageStartedAt = workStartedAt
  farmCamera.removeShake()
  if (!clockHeld) advanceClock(dayNightClock, delta)
  tickAutosave(delta)
  dayNightRig.update(dayNightClock.timeOfDay)
  clockCalendarHud.setState({ timeOfDay: dayNightClock.timeOfDay, phase: phaseOf(dayNightClock.timeOfDay), date: calendarOf(dayNightClock.elapsedDays), weekday: weekdayName(dayNightClock.elapsedDays) })
  fairground.update(delta, dayNightClock.elapsedDays)
  const fairgroundMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  // Avoid the much heavier state snapshot on the animation hot path; retain
  // the exact final bounds as the animation settles.
  let expansionLevel = 0
  let expansionIsAnimating = false
  if (fairground.farmExpansion) {
    expansionLevel = fairground.farmExpansion.level
    expansionIsAnimating = fairground.farmExpansion.isAnimating
    currentGardenBounds = fairground.farmExpansion.bounds
  } else {
    currentGardenBounds = GARDEN_BOUNDS
  }
  const expansionBoundsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  updateViewerStage(delta)
  farmCamera.updateMenuDrift(delta, now / 1000)
  updateCameraTour(delta)
  animals.forEach((animal) => animal.update(delta))
  crowdFixtures.forEach((fixture) => fixture.update(delta))
  collideAnimals(now / 1000)
  if (!menu.isOpen && !salePanel.isOpen) {
    updateOwlHunt(delta)
    updateSnakeHunt(delta)
  }
  updateSleepers()
  // Farewell bursts are fire-and-forget: tick them with the herd and prune
  // the finished ones so a selling spree cannot leak scene nodes.
  for (let burstIndex = sellBursts.length - 1; burstIndex >= 0; burstIndex -= 1) {
    const burst = sellBursts[burstIndex]
    if (burst.update(delta)) continue
    scene.remove(burst.root)
    burst.dispose()
    sellBursts.splice(burstIndex, 1)
  }
  // The condition ladder runs after the animals have moved, so a settle
  // triggered this frame is applied against the farm as it is right now.
  updateAnimalProgress(delta)
  // The animals keep walking and following garden terrain on their own, so in
  // the viewer we pin them back onto their plinths after the update.
  if (mode === 'viewer') {
    for (const animal of getViewerCastAnimals()) {
      const stand = viewerStands.get(animal.instanceId)
      if (stand) animal.root.position.copy(stand)
    }
  }
  refreshAnimalVisibility(now / 1000)
  input.refreshHover(now / 1000, delta)
  const animalsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  // A farm expansion moves the editable parcel edge; re-solve ponds only when
  // bounds actually change, never on every frame.
  if (gardenTerrain?.syncBounds()) {
    // Smooth bounds animation reveals already-flat rows; the parcel's full
    // mesh transition is handled once when its integer level first advances.
    if (gardenTerrain.dirty) gardenTerrain.applyToMeshes()
    if (!expansionIsAnimating) {
      gardenWater?.resize(gardenTerrain.gridCols, gardenTerrain.gridRows)
      gardenWater?.markTerrainChanged()
      gardenWaterMesh?.markDirty()
    }
  }
  gardenTools?.update(delta)
  if (gardenWaterMesh && (gardenWater?.dirty || gardenWaterMesh.dirty)) {
    gardenWaterMesh.update(now * 0.001)
  }
  if (fairground.farmExpansion) {
    if (expansionLevel > lastExpansionLevel) {
      lastExpansionLevel = expansionLevel
      farmCamera.shakeForExpansion()
    }
  }
  gardenPlants?.update(delta, mode === 'farm' && !menu.isOpen && !journal.isOpen && !viewer.isOpen && !salePanel.isOpen)
  syncPlantCard(delta)
  gardenProps?.update(delta, progression.level)
  const matureIds = new Set<number>()
  for (const plant of gardenPlants?.simulation.plants ?? []) {
    if (!plant.mature) continue
    matureIds.add(plant.instanceId)
    if (!knownMaturePlants.has(plant.instanceId)) {
      knownMaturePlants.add(plant.instanceId)
      const earned = accomplishments.discoverPlantGrown(plant.species)
      if (earned) unlockAccomplishment(earned)
      else notificationPanel.notifyPlantGrown(plantDisplayName(plant.species))
    }
  }
  for (const knownId of [...knownMaturePlants]) if (!matureIds.has(knownId)) knownMaturePlants.delete(knownId)
  if (playerDom.isOpen) playerDom.refresh(playerDomStats())
  if (notificationDom.isOpen) notificationDom.refresh(notificationPanel.getLetters(), notificationPanel.nowSeconds())
  {
    const unread = notificationPanel.getUnreadCount()
    balloon.setPostBadge(unread > 9 ? '9+' : unread > 0 ? String(unread) : '')
  }
  notificationPanel.setVisible(mode === 'farm' && !menu.isOpen && !journal.isOpen && !salePanel.isOpen && !shop.isOpen && !shed.isOpen && !playerDom.isOpen)
  if (!gardenPlants?.selectedSpecies && !shed.isOpen) gardenTools?.setPlantingMode(false)
  if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !shop.isOpen && !shed.isOpen) refreshShopUi()
  shedDom.refresh()
  const toolsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  input.updateCameraPan(delta)
  farmCamera.applyShake(delta, now / 1000)
  input.followPointer()
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
    performanceOverlay.update(now, () => frameTimer?.summarize() ?? null)
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(performanceOverlay.scene, performanceOverlay.camera)
    renderer.autoClear = true
  }
  if (__GARDEN_DEBUG__ && timingEnabled) {
    const finishedAt = performance.now()
    overlayRenderMs = finishedAt - stageStartedAt
    frameTimer?.record(now, {
      intervalMs,
      workMs: finishedAt - workStartedAt,
      fairgroundMs,
      expansionBoundsMs,
      animalsMs,
      toolsMs,
      otherUpdateMs,
      sceneRenderMs,
      overlayRenderMs,
    })
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
