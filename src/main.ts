import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions, ANIMAL_CATALOG, VIEWER_CAST, type BalloonAnimalId } from './animals/animal-catalog'
import { chooseOutdoorRoster, HOUSE_CAPACITY, houseAccepts, houseOccupancy, houseWithRoom, isHouse, occupantsByHouse, type RosterAnimal } from './game/animal-housing'
import { containsGardenPoint, createFairground, createSkyDome, GARDEN_BOUNDS } from './scene/fairground'
import { ANIMAL_LIFE_CONFIG, createAnimalLife, type AnimalRecord, type AnimalLifeEvent, type AnimalLifeSnapshot } from './game/animal-life'
import { clearOfFarmBounds } from './game/animal-travel'
import { createProgressLedger } from './game/farm-progression'
import { buildAccomplishmentCatalog, createAccomplishmentTracker, type AccomplishmentDef, type AccomplishmentStage } from './game/accomplishments'
import {
  createUpgradeLedger,
  purchasePropAtLevel,
  purchaseUpgrade,
  upgradeQuote,
  UPGRADE_CATALOG,
  UPGRADE_ORDER,
  type UpgradeId,
} from './game/tool-unlocks'
import { type FarmSnapshot } from './game/animal-progress'
import { farmMetric, measureFarmState, type FarmState, type LawnSample, type TerrainSample, type WaterSample } from './game/farm-state'
import { conditionMetricLabel, conditionMetricUnit, getSpeciesConditions, isCountKind } from './game/animal-conditions'
import { createCaptureShowcaseStage, GARDEN_LAWN_Y, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { createGardenWaterField } from './game/garden-water'
import { createGardenWaterMesh } from './scene/garden-water-mesh'
import { createGardenPlants, type GardenPlants } from './scene/garden-plants'
import { createGardenProps, type GardenProps, type HouseSpot, type PropSelection } from './scene/garden-props'
import { PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, SEED_PRICES, plantSpecies, type GardenPlant, type PlantId, type PlantSubstrate } from './game/plants'
import { footprintWorldRect, PROP_CATALOG, PROP_ORDER, propDefinition, type PropId } from './game/farm-props'
import { resolveCollisions, type CollisionBody, type CollisionBox } from './game/animal-collision'
import { shopUnlocked } from './game/shop-construction'
import { STARTING_COINS, animalSaleValue, createWallet, generateAnimalNames, plantSaleValue } from './game/sales'
import type { GardenToolId } from './scene/garden-tool-art'
import type { CameraTourSubject } from './game/camera-tour'
import { createFarmCamera } from './scene/farm-camera'
import { createUILayer, type UIPanel } from './ui/ui-layer'
import { advanceClock, calendarOf, createDayNightClock, phaseOf } from './game/day-night'
import { createDayNightRig } from './scene/day-night-rig'
import { weekdayName } from './game/carnival-schedule'
import { shopSite } from './game/shop-site'
import { createClockCalendarHud } from './ui/clock-calendar-hud'
import { createPlantCard } from './ui/plant-card'
import { createJournalPanel, type JournalConditionSource } from './ui/journal-panel'
import { createJournalDomPanel, type JournalDomPanel } from './ui/journal-dom'
import { createMenuPanel, type MenuChoice } from './ui/menu-panel'
import { createOptionsDomPanel, type OptionsDomPanel } from './ui/options-dom'
import { createFpsCounter } from './ui/fps-counter'
import { createSettingsStore } from './game/settings'
import { createToolsHud } from './ui/tools-hud'
import { createBalloonPanel } from './ui/balloon-panel'
import { createPlayerDomPanel, playerLevelCards } from './ui/player-dom'
import { createSalePanel } from './ui/sale-panel'
import { createAnimalCard } from './ui/animal-card'
import { createPropCard, type PropResidents } from './ui/prop-card'
import { createSellBurst, type SellBurst } from './ui/sell-burst'
import { createPopBurst, type PopBurst } from './scene/pop-burst'
import { createOwlHunt, type HuntOwl } from './scene/owl-hunt'
import { createSnakeHunt } from './scene/snake-hunt'
import { PREY_OF } from './game/predator'
import { createPredationLedger, isNightTime } from './game/predator'
import { SLEEP_PROPS, bedBeside, pickAnchor, shouldSleep, type Bed } from './game/sleep'
import { createShedPanel } from './ui/shed-panel'
import { createShedDomPanel, type ShedDomPanel } from './ui/shed-dom'
import { createShopDomPanel, type ShopDomPanel } from './ui/shop-dom'
import { setCursor } from './ui/ui-cursor'
import { createHoverGlow } from './scene/hover-glow'
import { createFarmInput } from './input'
import { installGardenHarness } from './debug/garden-harness'
import { createViewerPanel } from './ui/viewer-panel'
import { createFarmsPanel } from './ui/farms-panel'
import {
  browserSaveStorage,
  createSaveStore,
  makeEnvelope,
  packInt16,
  resolveStartup,
  unpackInt16,
  type PackedField,
  type SaveGameData,
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
  tourSubjects: () => tourSubjects(),
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
const worldRaycaster = new THREE.Raycaster()
const worldPointer = new THREE.Vector2()
function pickAnimal(clientX: number, clientY: number): BalloonAnimal | null {
  const rect = gameCanvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  worldPointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  worldRaycaster.setFromCamera(worldPointer, camera)
  const detailedMeshes = animals.filter((animal) => !animal.isSold && animal.root.visible).flatMap((animal) => {
    const meshes: THREE.Mesh[] = []
    animal.root.traverse((object) => { if (object instanceof THREE.Mesh && object.visible) meshes.push(object) })
    return meshes
  })
  const detailedHit = worldRaycaster.intersectObjects(detailedMeshes, false)[0]
  if (!detailedHit) return null
  return animals.find((animal) => animal.root === detailedHit.object || animal.root.getObjectById(detailedHit.object.id) !== undefined) ?? null
}

/**
 * Show every animal that is out on the farm and in view, and hide the rest.
 *
 * Animals indoors have no model in the scene at all (see `updateHousing`), so
 * at most `OUTDOOR_LIMITS.total` are ever drawn and each one gets its full
 * model. Off-screen animals are hidden too, which also stops their mixers.
 */
function refreshAnimalVisibility(nowSeconds: number, force = false): void {
  if (!force && nowSeconds - lastVisibilityRefreshAt < 1 / 15) return
  lastVisibilityRefreshAt = nowSeconds
  camera.updateMatrixWorld()
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  const activeInViewer = new Set(getViewerCastAnimals().map((animal) => animal.instanceId))
  let shown = 0
  for (const animal of animals) {
    const record = progress.animal(animal.instanceId)
    if (!record || record.stage <= 0 || animal.isSold) {
      animal.setDetailedVisible(false)
      continue
    }
    // A flier is away by day.
    if (animal.isFlier && !animal.flightVisible) {
      animal.setDetailedVisible(false)
      continue
    }
    if (mode === 'viewer') {
      const cast = activeInViewer.has(animal.instanceId)
      animal.setDetailedVisible(cast)
      if (cast) shown += 1
      continue
    }
    const size = ANIMAL_CATALOG.find((entry) => entry.id === animal.id)?.size ?? 2
    const renderPosition = animal.currentPosition.clone()
    renderPosition.y += 0.4 * size * animal.currentScale
    const sphere = new THREE.Sphere(renderPosition, Math.max(1.2, size * animal.currentScale * 0.9))
    const inView = frustum.intersectsSphere(sphere)
    animal.setDetailedVisible(inView)
    if (inView) shown += 1
  }
  shownAnimalCount = shown
}

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

/**
 * Where a species first turns up.
 *
 * Carnival spawns were authored around the starter tents. Those tents slide
 * outward as the farm grows, so the spawn has to come with them: otherwise a
 * species would turn up inside the walls of a garden that has already swallowed
 * the spot it was authored at.
 */
function carnivalSpawnFor(species: string): readonly [number, number] {
  const bounds = activeGardenBounds()
  const authored = ANIMAL_CATALOG.find((entry) => entry.id === species)?.carnivalSpawn
  const base = authored ?? [bounds.halfWidth + 8, 0]
  const cleared = clearOfFarmBounds({ x: base[0], z: base[1] }, bounds)
  return [cleared.x, cleared.z]
}

const generatedAnimalNames = generateAnimalNames(48)
const animalNames = new Map<string, string>()
const animalById = new Map<string, BalloonAnimal>()
const animals: BalloonAnimal[] = []
const animalPopulationLimit = ANIMAL_LIFE_CONFIG.maximumPopulation
let focusedAnimalId: string | null = null
/** How many animal models were drawn at the last visibility refresh. */
let shownAnimalCount = 0
/**
 * Predator and prey. The owl's flight is stepped by `owlHunt` (which wraps the
 * pure sim in game/predator.ts); every chicken it takes is tallied in the ledger,
 * and a `preyEaten` condition reads that tally. A caught chicken pops, and its
 * effect holds the animal until the clean-up has finished.
 */
const predationLedger = createPredationLedger()
const owlHunt = createOwlHunt(fairground.root, GARDEN_LAWN_Y)
/** Snakes hunt mice and rats on the ground (pure sim in game/ground-hunt.ts); catches go in the same ledger. */
const snakeHunt = createSnakeHunt()
interface PopInFlight { readonly burst: PopBurst; readonly animal: BalloonAnimal }
const popsInFlight: PopInFlight[] = []
/**
 * Real animal models stood on the lawn for sustained load ramps. Empty in
 * normal play; the debug harness fills it via setCrowd and every reset path
 * drains it, so a fixture can never leak into a shipped session.
 */
const crowdFixtures: BalloonAnimal[] = []
const CROWD_FIXTURE_LIMIT = 60
function clearCrowdFixtures(): void {
  for (const fixture of crowdFixtures) fixture.dispose()
  crowdFixtures.length = 0
}
async function setCrowdFixtures(requestedCount: number): Promise<number> {
  const count = Math.max(0, Math.min(CROWD_FIXTURE_LIMIT, Math.floor(requestedCount)))
  if (crowdFixtures.length === count) return count
  clearCrowdFixtures()
  const walkers = getAnimalSceneOptions(false, gameCanvas, camera, gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined)
    .filter((entry) => !entry.flier)
  const created = await Promise.all(Array.from({ length: count }, (_, index) => {
    const options = walkers[index % walkers.length]
    const column = index % 10
    const row = Math.floor(index / 10)
    return createBalloonAnimal(fairground.root, {
      ...options,
      name: `Crowd ${index}`,
      instanceId: `crowd-stress-${index}`,
      stage: 3,
      appearance: index % 3 === 0 ? 'wild' : 'standard',
      captureOnClick: false,
      spawn: [(column - 4.5) * 1.6, (row - 2.5) * 1.6],
      getGardenBounds: activeGardenBounds,
    })
  }))
  for (const fixture of created) {
    fixture.setDetailedVisible(true)
    crowdFixtures.push(fixture)
  }
  return count
}
let lastVisibilityRefreshAt = 0
const farmHomes = new Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>()
const viewerStands = new Map<string, THREE.Vector3>()
const animalCreations = new Map<string, Promise<BalloonAnimal>>()
/**
 * Build the model for a tracked animal. `emerging` is for an animal stepping out
 * of its house: it is already a resident, so it appears in its own colours at
 * the door instead of replaying the capture reveal.
 */
function createAnimalInstance(record: AnimalRecord, position?: { x: number; z: number }, emerging = false): Promise<BalloonAnimal> {
  const existing = animalById.get(record.id)
  if (existing) return Promise.resolve(existing)
  const pending = animalCreations.get(record.id)
  if (pending) return pending
  const creation = loadAnimalInstance(record, position, emerging)
  animalCreations.set(record.id, creation)
  void creation.then(
    () => { if (animalCreations.get(record.id) === creation) animalCreations.delete(record.id) },
    () => { if (animalCreations.get(record.id) === creation) animalCreations.delete(record.id) },
  )
  return creation
}

async function loadAnimalInstance(record: AnimalRecord, position?: { x: number; z: number }, emerging = false): Promise<BalloonAnimal> {
  if (animals.length + animalCreations.size >= animalPopulationLimit && !animalById.has(record.id)) return Promise.reject(new Error(`The farm is at its ${animalPopulationLimit}-animal limit`))
  const options = getAnimalSceneOptions(false, gameCanvas, camera, gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined)
    .find((entry) => entry.id === record.species)
  if (!options) throw new Error(`Missing scene options for animal ${record.species}`)
  const takenNames = new Set(animalNames.values())
  const name = animalNames.get(record.id) ?? generatedAnimalNames.find((candidate) => !takenNames.has(candidate)) ?? `${options.name} ${animalNames.size + 1}`
  animalNames.set(record.id, name)
  const animal = await createBalloonAnimal(fairground.root, {
    ...options,
    name,
    onDetailedModelReady: () => refreshAnimalVisibility(performance.now() / 1000, true),
    instanceId: record.id,
    growthScale: record.growth,
    stage: emerging ? record.stage : 0,
    ...(emerging && record.stage >= 3 ? { appearance: 'standard' as const } : {}),
    captureOnClick: false,
    spawn: position ? [position.x, position.z] : carnivalSpawnFor(record.species),
    isLoose: () => isLoose(record.id),
    getGardenBounds: activeGardenBounds,
  })
  animal.stage = record.stage
  animal.setGrowth(record.growth * record.adultScale)
  animal.setDetailedVisible(false)
  animalById.set(record.id, animal)
  animals.push(animal)
  farmHomes.set(record.id, { parent: animal.root.parent ?? fairground.root, position: animal.root.position.clone() })
  if (VIEWER_CAST.includes(animal.id)) {
    const [x, z] = SHOWCASE_ANIMALS[animal.id].spawn
    viewerStands.set(record.id, new THREE.Vector3(x, GARDEN_LAWN_Y + 0.1, z))
  }
  const latest = progress.animal(record.id)
  if (!latest) {
    animal.dispose()
    return animal
  }
  if (latest) {
    animal.stage = latest.stage
    animal.setGrowth(latest.growth * latest.adultScale)
    animal.setDetailedVisible(false)
  }
  return animal
}
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
  const originX = gardenTerrain.originX
  const originZ = gardenTerrain.originZ
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
let lastFarmState: FarmState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, residentCounts: {}, preyEaten: {}, propCounts: {} }

function currentWaterSample(): WaterSample | null {
  if (!gardenWater) return null
  const summary = gardenWater.summary()
  return { visibleWetCells: summary.visibleWetCells, cellSize: gardenWater.cellSize }
}

/**
 * Grown-up plants per species, which is what a `plantCount` condition reads.
 *
 * Only mature ones count, so an animal cannot be satisfied by seeds that have
 * been dropped in the water and forgotten. The plant simulation owns the truth
 * about growth; this only tallies it.
 */
function maturePlantCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const plant of gardenPlants?.simulation.plants ?? []) {
    if (!plant.mature) continue
    counts[plant.species] = (counts[plant.species] ?? 0) + 1
  }
  return counts
}

/** Adult residents per species, which is what a `residentCount` condition reads. */
function residentCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of progress.all()) {
    if (entry.stage < 3 || entry.baby || animalById.get(entry.id)?.isSold) continue
    counts[entry.species] = (counts[entry.species] ?? 0) + 1
  }
  return counts
}

/**
 * Tall meadow is measured from every grass blade, which is too much work to
 * redo each frame. Measure it at most once a second; anything that replaces
 * the grass outright (a load, a harness sow or clear) asks for a fresh one.
 */
const MEADOW_REMEASURE_MS = 1000
let meadowMeasuredAt = Number.NEGATIVE_INFINITY
let meadowAreaCache = 0

function currentMeadowArea(): number {
  const now = performance.now()
  if (now - meadowMeasuredAt >= MEADOW_REMEASURE_MS) {
    meadowAreaCache = gardenTools?.meadowArea() ?? 0
    meadowMeasuredAt = now
  }
  return meadowAreaCache
}

function remeasureMeadow(): void {
  meadowMeasuredAt = Number.NEGATIVE_INFINITY
}

function measureFarm(): FarmState {
  const lawn = currentLawnSample()
  const terrain = currentTerrainSample()
  if (!lawn || !terrain) return lastFarmState
  lastFarmState = {
    ...measureFarmState(lawn, terrain, currentWaterSample(), maturePlantCounts()),
    meadowArea: currentMeadowArea(),
    residentCounts: residentCounts(),
    preyEaten: predationLedger.totals,
    propCounts: gardenProps?.propCounts() ?? {},
  }
  return lastFarmState
}

/**
 * Advance every animal one step and play whatever transition it earned.
 *
 * This is the only place the scene learns that a condition was met, and it
 * does so by setting `animal.stage` -- the animal then runs its own reveal.
 * Keeping the event handling here means `balloon-animal.ts` never has to know
 * that a condition system exists. */
function progressionHudState() {
  const housing = progress.housing()
  return {
    points: progression.points,
    level: progression.level,
    pointsToNextLevel: progression.pointsToNextLevel,
    population: progress.all().filter((animal) => animal.stage > 0).length,
    outside: animals.filter((animal) => !animal.isSold && (progress.animal(animal.instanceId)?.stage ?? 0) > 0).length,
    houseRoom: housing.capacity,
    houseUsed: housing.used,
  }
}

function currentFarmSnapshot(): FarmSnapshot {
  const residentSpecies = new Set(progress.all()
    .filter((entry) => entry.stage >= 3 && !entry.baby && !animalById.get(entry.id)?.isSold)
    .map((entry) => entry.species))
  return { state: measureFarm(), residentSpecies, night: isNightTime(dayNightClock.timeOfDay) }
}

function accomplishmentStageForKind(kind: AnimalLifeEvent['kind']): AccomplishmentStage | null {
  if (kind === 'arriveCarnival') return 'appear'
  if (kind === 'enterFarm') return 'visit'
  if (kind === 'settle') return 'live'
  if (kind === 'fallInLove') return 'breed'
  return null
}

function unlockAccomplishment(def: AccomplishmentDef): void {
  progression.awardPoints(def.id, def.points)
  notificationPanel.notifyAccomplishment(def.title + ' · +' + def.points + ' pts', def.detail)
}

function ownedSeedSpecies(): ReadonlySet<string> {
  const owned = new Set<string>()
  for (const entry of PLANT_CATALOG) {
    if ((gardenPlants?.simulation.seedsFor(entry.id) ?? 0) > 0) owned.add(entry.id)
  }
  for (const plant of gardenPlants?.simulation.plants ?? []) owned.add(plant.species)
  return owned
}

function handleAnimalLifeEvents(events: readonly AnimalLifeEvent[]): void {
  for (const event of events) {
    const animal = event.animalId ? animalById.get(event.animalId) : undefined
    const stage = accomplishmentStageForKind(event.kind)
    if (stage) {
      const earned = accomplishments.discoverAnimalStage(event.species, stage)
      if (earned) unlockAccomplishment(earned)
    }
    if (event.stage !== undefined && animal) {
      animal.stage = event.stage
      animal.setDetailedVisible(animal.instanceId === focusedAnimalId || animal.isCapturing)
      if (event.kind === 'arriveCarnival') {
        const spawn = carnivalSpawnFor(event.species)
        animal.root.position.set(spawn[0], GARDEN_LAWN_Y, spawn[1])
      }
      if (event.kind === 'settle' || event.kind === 'fallInLove') {
        // Logged here rather than beside the tick so the debug setStage reports
        // the same thing a live promotion does.
        console.info(`[Animal Balloon Farm] ${event.species} -> stage ${event.stage}`)
      }
    }
    if (event.kind === 'arriveCarnival' && event.animalId && !animal) {
      const record = progress.animal(event.animalId)
      if (record) void createAnimalInstance(record).then((created) => {
        farmHomes.set(created.instanceId, { parent: created.root.parent ?? fairground.root, position: created.root.position.clone() })
        if (VIEWER_CAST.includes(created.id)) {
          const [x, z] = SHOWCASE_ANIMALS[created.id].spawn
          viewerStands.set(created.instanceId, new THREE.Vector3(x, GARDEN_LAWN_Y + 0.1, z))
        }
      })
    }
    if (event.kind === 'birth' && event.animalId) {
      // The baby is born indoors; keeping it in view for a while brings it out of the door.
      newbornUntil.set(event.animalId, performance.now() / 1000 + NEWBORN_SHOW_SECONDS)
      notificationPanel.notifyMilestone('birth', animalDisplayName(event.species))
      console.info(`[Animal Balloon Farm] a ${event.species} was born in ${event.houseId}`)
    }
    if (event.kind === 'growUp' && animal) animal.setGrowth(1)
  }
}


/** Ground-plane name for a species in a notice, e.g. "chicken". */
function preyLabel(species: string): string {
  return ANIMAL_CATALOG.find((entry) => entry.id === species)?.label ?? species
}

/**
 * An owl has caught a chicken: it leaves the farm the way a sale does (the
 * sim forgets it at once), but instead of a coin burst it swells, pops, and the
 * effect holds the model until the clean-up is done.
 */
function handlePredatorCatch(hunter: string, prey: BalloonAnimal, roll?: number): void {
  const total = predationLedger.record(prey.id)
  const name = animalNames.get(prey.instanceId) ?? preyLabel(prey.id)
  popAnimal(prey)
  const eaten = total === 1 ? preyLabel(prey.id) : speciesPluralName(prey.id).toLowerCase()
  const rolled = roll ? ` (rolled ${roll})` : ''
  notificationPanel.notifyAccomplishment(`The ${preyLabel(hunter)} caught ${name}${rolled}`, `${total} ${eaten} eaten on your farm`)
  console.info(`[Animal Balloon Farm] ${hunter} caught ${prey.id} (${total} eaten)`)
}

/** Take an animal out of the farm and play its pop; the effect disposes the model when done. */
function popAnimal(prey: BalloonAnimal): void {
  const catalog = ANIMAL_CATALOG.find((entry) => entry.id === prey.id)
  const at = prey.root.getWorldPosition(new THREE.Vector3())
  progress.remove(prey.instanceId)
  animalById.delete(prey.instanceId)
  const index = animals.indexOf(prey)
  if (index >= 0) animals.splice(index, 1)
  if (focusedAnimalId === prey.instanceId) {
    focusedAnimalId = null
    animalCard.close()
    syncFarmChrome()
  }
  farmHomes.delete(prey.instanceId)
  viewerStands.delete(prey.instanceId)
  prey.setAlarmed(false)
  const burst = createPopBurst({
    position: new THREE.Vector3(at.x, at.y, at.z),
    color: catalog?.color ?? '#f6c94d',
    accent: prey.id === 'chicken' ? '#e65b69' : '#fff0d0',
    burstHeight: (catalog?.size ?? 1.8) * 0.42,
    animal: prey.hasDetailedModel ? prey.root : null,
  })
  scene.add(burst.root)
  popsInFlight.push({ burst, animal: prey })
  refreshAnimalVisibility(performance.now() / 1000, true)
}

function updateOwlHunt(deltaSeconds: number): void {
  for (let index = popsInFlight.length - 1; index >= 0; index -= 1) {
    const { burst, animal } = popsInFlight[index]
    if (burst.update(deltaSeconds)) continue
    burst.dispose()
    animal.dispose()
    popsInFlight.splice(index, 1)
  }
  if (mode === 'viewer') return
  const owlAnimals = animals.filter((animal) => animal.isFlier && !animal.isSold)
  if (owlAnimals.length === 0) return
  const roosts = gardenProps?.roosts() ?? []
  // Stranded means no oak on the farm at all; an oak whose model is still loading is not a loss.
  const oakCount = gardenProps?.propCounts().oak ?? 0
  let nextRoost = 0
  const owls: HuntOwl[] = owlAnimals.map((animal) => {
    const record = progress.animal(animal.instanceId)
    const stage = record?.stage ?? 0
    const carnival = carnivalSpawnFor(animal.id)
    // A resident takes the next oak; owls beyond the oak count share one, a step apart.
    // A visitor has no perch and leaves at dawn. A resident with no oak at all is stranded.
    let roost: HuntOwl['roost'] = null
    if (stage >= 3 && roosts.length > 0) {
      const base = roosts[nextRoost % roosts.length]
      const sharers = Math.floor(nextRoost / roosts.length)
      roost = { ...base, x: base.x + sharers * 0.9 }
      nextRoost += 1
    }
    return { animal, carnivalSpawn: carnival, stage, roost, stranded: stage >= 3 && oakCount === 0 }
  })
  const flock = animals
    .filter((animal) => animal.id === 'chicken' && !animal.isSold && animal.isAtFarm)
    .filter((animal) => {
      const record = progress.animal(animal.instanceId)
      return Boolean(record && record.stage >= 3 && !record.baby)
    })
    .map((animal) => ({ animal, targetable: !animal.isCapturing && !animal.isRomancing && !animal.isResidencyPending }))
  const bounds = activeGardenBounds()
  const result = owlHunt.update(deltaSeconds, {
    night: isNightTime(dayNightClock.timeOfDay),
    owls,
    prey: flock,
    farm: { halfWidth: bounds.halfWidth, halfDepth: bounds.halfDepth },
  })
  for (const caught of result.catches) handlePredatorCatch('owl', caught.prey)
  for (const owl of result.deflated) {
    const name = animalNames.get(owl.instanceId) ?? preyLabel(owl.id)
    popAnimal(owl)
    notificationPanel.notifyAccomplishment(`${name} ran out of helium`, 'Without an oak to roost on, an owl slowly deflates.')
    console.info(`[Animal Balloon Farm] ${owl.id} popped: out of helium`)
  }
}

/**
 * Snakes stalk mice and rats through the grass. A snake on the farm (a visitor
 * or a resident) hunts; prey is any adult mouse or rat out on the farm, and a
 * species down to its breeding pair is left alone.
 */
const SNAKE_MOUTH_SHARE = 0.42

function updateSnakeHunt(deltaSeconds: number): void {
  if (mode === 'viewer') return
  const prey = PREY_OF.snake ?? []
  const snakes = animals
    .filter((animal) => animal.id === 'snake' && !animal.isSold)
    .map((animal) => {
      const record = progress.animal(animal.instanceId)
      const busy = animal.isCapturing || animal.isRomancing || animal.isResidencyPending || animal.isGoingHome
      // `size` is the model's length, so the mouth sits a little under half of it ahead of the centre.
      const reach = (bodySizeBySpecies.get('snake') ?? 2.8) * SNAKE_MOUTH_SHARE * animal.currentScale
      return { animal, huntAllowed: Boolean(record && record.stage >= 2 && animal.isAtFarm && !busy), reach }
    })
  if (snakes.length === 0) return
  const quarry = animals
    .filter((animal) => prey.includes(animal.id) && !animal.isSold && animal.isAtFarm)
    .filter((animal) => {
      const record = progress.animal(animal.instanceId)
      return Boolean(record && record.stage >= 3 && !record.baby)
    })
    .map((animal) => ({ animal, targetable: !animal.isCapturing && !animal.isRomancing && !animal.isResidencyPending && !animal.isGoingHome }))
  const counts = residentCounts()
  const result = snakeHunt.update(deltaSeconds, { snakes, prey: quarry, preyCounts: counts })
  for (const caught of result.catches) handlePredatorCatch('snake', caught.prey, caught.roll)
  for (const escaped of result.escapes) boltHome(escaped.prey, escaped.roll)
  const now = performance.now() / 1000
  for (const [id, until] of panicking) {
    if (until > now) continue
    animalById.get(id)?.setAlarmed(false)
    panicking.delete(id)
  }
}

/** How much faster than its walk a mouse runs for home when the strike die lets it off. */
const ESCAPE_SPRINT = 3
/** How long an escaped mouse hides indoors before it dares come out. */
const ESCAPE_HIDING_SECONDS = 30
/** How long one with no house to run to panics in the open. */
const ESCAPE_PANIC_SECONDS = 4
/** Prey sprinting home from a snake: its trip is not cancelled by the outdoor roster. */
const bolting = new Set<string>()
/** Prey that escaped indoors stays in until then (seconds, `performance.now` clock). */
const hidingUntil = new Map<string, number>()
/** Prey with nowhere to hide, scattering in the open until then. */
const panicking = new Map<string, number>()

/**
 * The strike die let the prey off: it sprints for the nearest house of its kind
 * with room and hides there a while. With no house, it scatters in a panic.
 */
function boltHome(prey: BalloonAnimal, roll: number): void {
  const now = performance.now() / 1000
  const name = animalNames.get(prey.instanceId) ?? preyLabel(prey.id)
  const reserved = new Map<string, number>()
  for (const trip of goingIn.values()) reserved.set(trip.houseId, (reserved.get(trip.houseId) ?? 0) + 1)
  const used = new Map(occupantsByHouse(progress.all(), reserved))
  const from = { x: prey.currentPosition.x, z: prey.currentPosition.z }
  const house = houseWithRoom(prey.id, houseSpots, used, HOUSE_CAPACITY, from)
  if (house) {
    prey.setHomeTrip({ x: house.doorX, z: house.doorZ }, ESCAPE_SPRINT)
    goingIn.set(prey.instanceId, { houseId: house.id, since: now })
    bolting.add(prey.instanceId)
    hidingUntil.set(prey.instanceId, now + ESCAPE_HIDING_SECONDS)
    const place = propDefinition(house.prop).name.toLowerCase()
    notificationPanel.notifyAccomplishment(`${name} got away (snake rolled ${roll})`, `It dashed into the ${place} to hide.`)
  } else {
    prey.setAlarmed(true)
    panicking.set(prey.instanceId, now + ESCAPE_PANIC_SECONDS)
    notificationPanel.notifyAccomplishment(`${name} got away (snake rolled ${roll})`, 'With no house to hide in, it scatters through the grass.')
  }
  console.info(`[Animal Balloon Farm] snake rolled ${roll}: ${prey.id} escaped${house ? ` into ${house.id}` : ''}`)
}

/** Where each sleeping night animal lay down, so it keeps its bed all day instead of chasing the nearest can. */
const sleepBeds = new Map<string, Bed>()

/**
 * Night animals sleep by day: a resident curls up beside a garbage can, anything else
 * where it stands. Everyone wakes at dusk. Beds are chosen once per sleep so the
 * animal is not shuffled about as other animals settle.
 */
function updateSleepers(): void {
  if (mode === 'viewer') return
  const night = isNightTime(dayNightClock.timeOfDay)
  // Each night species sleeps by the first prop on its SLEEP_PROPS list that is placed (a house
  // before a can); with none, or no entry, it sleeps where it stands.
  type Home = { x: number; z: number; radius: number; key: string }
  const homesFor = (species: string): Home[] => {
    for (const { prop, radius } of SLEEP_PROPS[species] ?? []) {
      const spots = gardenProps?.placements(prop as PropId) ?? []
      if (spots.length > 0) return spots.map((spot, index) => ({ ...spot, radius, key: `${prop}:${index}` }))
    }
    return []
  }
  const occupancy = new Map<string, number>()
  const nearHome = (bed: Bed, home: Home): boolean => Math.hypot(bed.x - home.x, bed.z - home.z) < home.radius + 0.5
  for (const animal of animals) {
    const bed = sleepBeds.get(animal.instanceId)
    if (!bed || !shouldSleep(animal.id, night)) continue
    const home = homesFor(animal.id).find((candidate) => nearHome(bed, candidate))
    if (home) occupancy.set(home.key, (occupancy.get(home.key) ?? 0) + 1)
  }
  for (const animal of animals) {
    if (animal.isFlier) continue
    if (animal.isSold) {
      sleepBeds.delete(animal.instanceId)
      continue
    }
    const record = progress.animal(animal.instanceId)
    const wantsSleep = shouldSleep(animal.id, night) && animal.isAtFarm && !animal.isCapturing && !animal.isRomancing
      && Boolean(record && record.stage >= 2 && !record.baby)
    if (!wantsSleep) {
      if (sleepBeds.delete(animal.instanceId)) animal.setSleepSpot(null)
      continue
    }
    let bed = sleepBeds.get(animal.instanceId)
    // A resident prefers a home; if one is placed after it lay down, it moves over.
    const resident = (record?.stage ?? 0) >= 3
    const homes = resident ? homesFor(animal.id) : []
    if (!bed || (homes.length > 0 && !homes.some((home) => nearHome(bed!, home)))) {
      const from = { x: animal.currentPosition.x, z: animal.currentPosition.z }
      const index = pickAnchor(homes, homes.map((home) => occupancy.get(home.key) ?? 0), from)
      if (index >= 0) {
        const home = homes[index]
        const slot = occupancy.get(home.key) ?? 0
        occupancy.set(home.key, slot + 1)
        bed = bedBeside(home, slot, home.radius)
      } else {
        bed = { x: from.x, z: from.z, heading: animal.currentHeading }
      }
      sleepBeds.set(animal.instanceId, bed)
    }
    animal.setSleepSpot(bed)
  }
}

/**
 * Everything the animal sim reads from the scene, in one place. Every tick goes
 * through here: a tick that left out the houses would evict every resident.
 */
function animalLifeSnapshot(): AnimalLifeSnapshot {
  houseSpots = gardenProps?.houses() ?? []
  return {
    farm: currentFarmSnapshot(),
    expansionLevel: fairground.farmExpansion?.state.level ?? 0,
    positions: Object.fromEntries(animals.map((animal) => [animal.instanceId, { x: animal.root.position.x, z: animal.root.position.z }])),
    houses: houseSpots.map((house) => ({ id: house.id, prop: house.prop, x: house.x, z: house.z })),
  }
}

function updateAnimalProgress(deltaSeconds: number): void {
  if (mode === 'viewer' || menu.isOpen || salePanel.isOpen) return
  const events = progress.tick(animalLifeSnapshot(), deltaSeconds)
  handleAnimalLifeEvents(events)
  noteJournalStages()
  for (const record of progress.all()) {
    const animal = animalById.get(record.id)
    if (!animal || animal.isSold) continue
    animal.setGrowth(record.growth * record.adultScale)
  }
  updateHousing(performance.now() / 1000)
  // No appearance is applied from the event list here: `animal.stage = event.stage`
  // already routes the promotion through the model's residency gate, which keeps
  // a settle that arrives out at the tents waiting until the walk-in is done.
  refreshAnimalVisibility(performance.now() / 1000)
  // Land is no longer handed out for points: farmer level only opens the next
  // Land Deed at the shop (see game/tool-unlocks.ts), and buying it expands.
}

// -------------------------------------------------------------------- houses --
//
// Each species keeps a few animals out on the farm and the rest indoors (see
// game/animal-housing.ts). Nobody owns a bed: an animal sent in walks to the
// nearest house of its kind with room and takes a space, and its model is
// disposed; one coming out is rebuilt at that house's door. That is what keeps
// the drawn herd small however big it grows.

/** Houses on the farm, refreshed every tick from the placed props. */
let houseSpots: readonly HouseSpot[] = []
/** Who the roster last put outside. */
let outdoorRoster: ReadonlySet<string> = new Set()
let lastRosterAt = -Infinity
const ROSTER_REFRESH_SECONDS = 0.5
/** Animals walking to a door to go in: which house, and when they set off. */
const goingIn = new Map<string, { readonly houseId: string; readonly since: number }>()
/** Give up on a walk in that never arrives (stuck on a prop) after this long. */
const GOING_IN_TIMEOUT_SECONDS = 20
/** A newborn stays in view this long after its birth, so the player sees it come out. */
const newbornUntil = new Map<string, number>()
const NEWBORN_SHOW_SECONDS = 25
/** Every door seen this session, so an animal put out of a stored house appears where it stood. */
const knownDoors = new Map<string, { readonly x: number; readonly z: number }>()
/** The house each indoor animal went into. */
const lastHouseOf = new Map<string, string>()

function houseSpot(id: string | null | undefined): HouseSpot | undefined {
  return id ? houseSpots.find((house) => house.id === id) : undefined
}

function hasHouseFor(species: string): boolean {
  return houseSpots.some((house) => houseAccepts(house.prop, species))
}

/** Must stay in view: busy, selected, hunted, or not yet settled at the farm. */
function pinnedOutside(id: string, nowSeconds: number): boolean {
  if (id === focusedAnimalId || (newbornUntil.get(id) ?? 0) > nowSeconds) return true
  const animal = animalById.get(id)
  if (!animal) return false
  return animal.isCapturing || animal.isResidencyPending || animal.isAlarmed || !animal.isAtFarm
    || owlHunt.huntedIds().has(id) || snakeHunt.huntedIds().has(id)
}

/** Take an animal's model off the farm. The record stays in the sim. */
function retireModel(animal: BalloonAnimal): void {
  animal.setHomeTrip(null)
  goingIn.delete(animal.instanceId)
  bolting.delete(animal.instanceId)
  animalById.delete(animal.instanceId)
  const index = animals.indexOf(animal)
  if (index >= 0) animals.splice(index, 1)
  farmHomes.delete(animal.instanceId)
  viewerStands.delete(animal.instanceId)
  sleepBeds.delete(animal.instanceId)
  animal.dispose()
}

/** Rebuild an animal's model at a door: it is stepping out onto the farm. */
function stepOut(record: AnimalRecord, door: { readonly x: number; readonly z: number }): void {
  if (animalById.has(record.id) || animalCreations.has(record.id)) return
  void createAnimalInstance(record, door, true).then((created) => {
    created.placeAt(door.x, door.z)
    refreshAnimalVisibility(performance.now() / 1000, true)
  })
}

function cancelTrip(id: string): void {
  animalById.get(id)?.setHomeTrip(null)
  goingIn.delete(id)
  bolting.delete(id)
}

/** Give up waiting for a loaded farm's houses after this long and bring indoor animals out instead. */
const SAVED_INDOORS_WAIT_SECONDS = 5
let savedIndoorsSince: number | null = null

/**
 * Put animals that were indoors in a save back into this session's houses:
 * the nearest house of their kind with room to the door they went in by. One
 * with nowhere to go steps out there instead.
 */
function restoreSavedIndoors(nowSeconds: number): void {
  if (savedIndoors.size === 0) return
  savedIndoorsSince ??= nowSeconds
  const waited = nowSeconds - savedIndoorsSince >= SAVED_INDOORS_WAIT_SECONDS
  if (houseSpots.length === 0 && !waited) return
  for (const [id, door] of savedIndoors) {
    savedIndoors.delete(id)
    const record = progress.animal(id)
    if (!record) continue
    const used = occupantsByHouse(progress.all())
    const house = houseWithRoom(record.species, houseSpots, used, HOUSE_CAPACITY, door)
    if (house && progress.enterHouse(id, house.id)) {
      lastHouseOf.set(id, house.id)
      continue
    }
    stepOut(record, door)
  }
}

function updateHousing(nowSeconds: number): void {
  if (mode !== 'farm') return
  for (const house of houseSpots) knownDoors.set(house.id, { x: house.doorX, z: house.doorZ })
  for (const [id, until] of newbornUntil) if (until <= nowSeconds || !progress.animal(id)) newbornUntil.delete(id)
  restoreSavedIndoors(nowSeconds)
  const records = progress.all().filter((record) => record.stage > 0)
  if (nowSeconds - lastRosterAt >= ROSTER_REFRESH_SECONDS) {
    lastRosterAt = nowSeconds
    const roster: RosterAnimal[] = records.map((record) => ({
      id: record.id,
      species: record.species,
      canGoIndoors: record.stage >= 3 && (record.insideId !== null || hasHouseFor(record.species)),
      pinned: pinnedOutside(record.id, nowSeconds),
    }))
    outdoorRoster = chooseOutdoorRoster({ animals: roster, night: isNightTime(dayNightClock.timeOfDay), timeSeconds: nowSeconds })
  }
  // Space already promised to animals on their way in counts as taken.
  const reserved = new Map<string, number>()
  for (const trip of goingIn.values()) reserved.set(trip.houseId, (reserved.get(trip.houseId) ?? 0) + 1)
  const used = new Map(occupantsByHouse(records, reserved))
  for (const record of records) {
    const animal = animalById.get(record.id)
    if (record.insideId) {
      lastHouseOf.set(record.id, record.insideId)
      if (!outdoorRoster.has(record.id)) continue
      // It just escaped a snake in here: it is not coming out yet.
      if ((hidingUntil.get(record.id) ?? 0) > nowSeconds) continue
      hidingUntil.delete(record.id)
      const house = houseSpot(record.insideId)
      progress.leaveHouse(record.id)
      if (house) stepOut(record, { x: house.doorX, z: house.doorZ })
      continue
    }
    if (!animal) {
      // Out in the sim but with no model: its house was stored or sold from under it.
      if (record.stage >= 3 && !savedIndoors.has(record.id)) stepOut(record, knownDoors.get(lastHouseOf.get(record.id) ?? '') ?? { x: 0, z: 0 })
      continue
    }
    const trip = goingIn.get(record.id)
    // Fleeing a snake beats the roster: it is running for the door, not strolling.
    const fleeing = Boolean(trip) && bolting.has(record.id)
    if (!fleeing && (outdoorRoster.has(record.id) || record.stage < 3)) {
      if (trip) cancelTrip(record.id)
      continue
    }
    if (!trip) {
      const house = houseWithRoom(record.species, houseSpots, used, HOUSE_CAPACITY, { x: animal.currentPosition.x, z: animal.currentPosition.z })
      // Every house of its kind is full: it stays out, over the outdoor limit.
      if (!house) continue
      used.set(house.id, (used.get(house.id) ?? 0) + 1)
      if (animal.isFlier) {
        if (progress.enterHouse(record.id, house.id)) retireModel(animal)
        continue
      }
      animal.setHomeTrip({ x: house.doorX, z: house.doorZ })
      goingIn.set(record.id, { houseId: house.id, since: nowSeconds })
      continue
    }
    if (!houseSpot(trip.houseId)) {
      cancelTrip(record.id)
      continue
    }
    if (animal.isAtDoor || nowSeconds - trip.since > GOING_IN_TIMEOUT_SECONDS) {
      // The house may have filled while it walked over; then it tries again next time.
      if (progress.enterHouse(record.id, trip.houseId)) retireModel(animal)
      else cancelTrip(record.id)
    }
  }
  if (propCard.isOpen && selectedProp && isHouse(selectedProp.id)) propCard.setResidents(residentsOf(selectedProp))
}

/** Plural display name for a species row on a house card, e.g. "Geese". */
function speciesPluralName(species: string): string {
  const name = animalDisplayName(species)
  if (species === 'sheep') return name
  if (species === 'goose') return 'Geese'
  if (species === 'mouse') return 'Mice'
  return `${name}s`
}

/** The animals inside a house right now. Animals out on the farm belong to no house. */
function animalsInside(siteId: string): AnimalRecord[] {
  return progress.all().filter((record) => record.insideId === siteId)
}

/**
 * Selling a house sells the animals inside it, at their usual prices. They have
 * no model while indoors, so each is simply credited and forgotten; anyone out
 * on the farm is untouched.
 */
function sellAnimalsInside(siteId: string): number {
  let total = 0
  for (const record of animalsInside(siteId)) {
    const price = animalSaleValue(record.species as BalloonAnimalId, record.stage)
    const model = animalById.get(record.id)
    if (model) retireModel(model)
    progress.remove(record.id)
    newbornUntil.delete(record.id)
    lastHouseOf.delete(record.id)
    total += price
  }
  if (total > 0) salePanel.setWallet(wallet.credit(total))
  return total
}

/** What a house's card shows: space in use and who is inside, by species. */
function residentsOf(selection: { readonly id: PropId; readonly siteId: string }): PropResidents | null {
  if (!isHouse(selection.id)) return null
  const inside = animalsInside(selection.siteId)
  const occupancy = houseOccupancy(selection.siteId, selection.id, progress.all(), HOUSE_CAPACITY)
  return {
    capacity: occupancy.capacity,
    used: occupancy.used,
    saleCount: inside.length,
    saleValue: inside.reduce((sum, record) => sum + animalSaleValue(record.species as BalloonAnimalId, record.stage), 0),
    rows: occupancy.species.map((row) => ({ name: speciesPluralName(row.species), inside: row.inside })),
  }
}

// ---------------------------------------------------------------- collisions --

/** Solid prop footprints, rebuilt a few times a second: props move rarely, animals every frame. */
let collisionBoxes: readonly CollisionBox[] = []
let collisionBoxesAt = -Infinity
const COLLISION_BOX_REFRESH_SECONDS = 0.25
/** An animal's footprint radius as a share of its catalog size (its longest side). */
const BODY_RADIUS_SHARE = 0.24
const bodySizeBySpecies = new Map(ANIMAL_CATALOG.map((entry) => [entry.id as string, entry.size]))

/**
 * Keep walking animals out of houses and other solid props, and out of each
 * other. Only the animals out on the farm have models, so this never sees more
 * than the outdoor limit (plus perf-ramp fixtures).
 */
function collideAnimals(nowSeconds: number): void {
  if (mode !== 'farm') return
  if (nowSeconds - collisionBoxesAt >= COLLISION_BOX_REFRESH_SECONDS) {
    collisionBoxesAt = nowSeconds
    collisionBoxes = (gardenProps?.occupancy.placed ?? [])
      .filter((prop) => prop.id !== 'fence' && propDefinition(prop.id).blocking)
      .map((prop) => footprintWorldRect(prop.id, prop.cell, prop.rotation))
  }
  const walkers: BalloonAnimal[] = []
  const bodies: CollisionBody[] = []
  for (const animal of [...animals, ...crowdFixtures]) {
    if (animal.isFlier || animal.isSold) continue
    const position = animal.currentPosition
    walkers.push(animal)
    bodies.push({
      x: position.x,
      z: position.z,
      radius: (bodySizeBySpecies.get(animal.id) ?? 2) * BODY_RADIUS_SHARE * animal.currentScale,
      fixed: animal.isSleeping || animal.isCapturing || animal.isRomancing,
      // On its way in through a door, walking the gate route from the carnival, or
      // asleep in a bed laid out beside a prop (moving it would wake it to walk back).
      ghost: animal.isGoingHome || !animal.isAtFarm || animal.isSleeping,
    })
  }
  resolveCollisions(bodies, collisionBoxes)
  bodies.forEach((body, index) => {
    const animal = walkers[index]
    const dx = body.x - animal.currentPosition.x
    const dz = body.z - animal.currentPosition.z
    if (dx !== 0 || dz !== 0) animal.nudge(dx, dz)
  })
}

// ---------------------------------------------------------------- game modes --
// The farm and the animal viewer are the same scene with different staging, so
// switching modes swaps the fairground rather than reloading the page. That is
// what lets the main menu hand off to either one without a navigation.

type GameMode = 'farm' | 'viewer'
let mode: GameMode = 'farm'
let viewerStage: ReturnType<typeof createCaptureShowcaseStage> | null = null



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

function animalDisplayName(species: string): string {
  return ANIMAL_CATALOG.find((entry) => entry.id === species)?.name ?? species
}

function plantDisplayName(species: string): string {
  return PLANT_CATALOG.find((entry) => entry.id === species)?.name ?? species
}
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

const menu = createMenuPanel(handleMenuChoice, window.innerWidth, window.innerHeight, () => {
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

/**
 * Opens the animal info card for a live animal. Shared by the farm click
 * and the garden-debug harness so the card stays verifiable headlessly.
 * The card pins to the right of the balloon (flipping left at the edge).
 */
function openAnimalCardFor(animal: BalloonAnimal, preview?: { stage?: number; sellable?: boolean }): void {
  propCard.close()
  focusedAnimalId = animal.instanceId
  refreshAnimalVisibility(performance.now() / 1000, true)
  plantCard.close()
  gardenPlants?.clearSelection()
  const species = ANIMAL_CATALOG.find((entry) => entry.id === animal.id)
  // A preview renders states the live ladder cannot hold on demand (a
  // resident with no meadow behind it). Selling still validates the live
  // animal, so this never mints coins; it only draws.
  const stage = preview?.stage ?? animal.stage
  const sellable = preview?.sellable ?? animal.canSell
  const anchorWorld = animal.root.getWorldPosition(new THREE.Vector3())
  anchorWorld.y += 2.6
  const anchorNdc = anchorWorld.project(camera)
  const anchor = {
    x: anchorNdc.x * ui.viewport.width / 2,
    y: anchorNdc.y * ui.viewport.height / 2,
  }
  animalCard.open({
    instanceId: animal.instanceId,
    speciesId: animal.id,
    name: animalNames.get(animal.instanceId) ?? species?.name ?? animal.id,
    speciesLabel: `Balloon ${species?.name ?? animal.id}`,
    stage,
    price: animalSaleValue(animal.id, stage),
    sellable,
  }, anchor)
  syncFarmChrome()
}

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

/**
 * The shared goodbye behind the sale card and the animal info card: the
 * animal leaves the world, the wallet grows, and a quick gold burst pops
 * where it stood. Sales never touch the accomplishment banner -- that is for
 * milestones, not routine farm business.
 */
function completeAnimalSale(instanceId: string): { balance: number; price: number; name: string } | null {
  const animal = animalById.get(instanceId)
  if (!animal || !animal.canSell || !animal.sell()) return null
  const name = animalNames.get(instanceId) ?? animal.id
  const price = animalSaleValue(animal.id, animal.stage)
  const farewellAt = animal.root.getWorldPosition(new THREE.Vector3())
  progress.remove(animal.instanceId)
  animalById.delete(animal.instanceId)
  const animalIndex = animals.indexOf(animal)
  if (animalIndex >= 0) animals.splice(animalIndex, 1)
  if (focusedAnimalId === animal.instanceId) focusedAnimalId = null
  animal.dispose()
  refreshAnimalVisibility(performance.now() / 1000, true)
  farmHomes.delete(animal.instanceId)
  viewerStands.delete(animal.instanceId)
  const balance = wallet.credit(price)
  salePanel.setWallet(balance)
  saveSoon()
  const burst = createSellBurst(farewellAt, price)
  scene.add(burst.root)
  sellBursts.push(burst)
  return { balance, price, name }
}

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

/** Pin the prop card beside a placed prop and highlight it on the lawn. */
function openPropCardFor(selection: PropSelection): void {
  animalCard.close()
  plantCard.close()
  salePanel.close()
  gardenPlants?.clearSelection()
  selectedProp = selection
  gardenProps?.select(selection)
  const ndc = new THREE.Vector3(selection.anchor.x, selection.anchor.y, selection.anchor.z).project(camera)
  propCard.open({
    id: selection.id,
    name: selection.name,
    blurb: selection.blurb,
    sections: selection.sections,
    salePrice: selection.salePrice,
    movable: selection.movable,
    rotatable: selection.rotatable,
    residents: residentsOf(selection),
  }, { x: ndc.x * ui.viewport.width / 2, y: ndc.y * ui.viewport.height / 2 })
  syncFarmChrome()
}

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
function refreshShopUi(): void {
  shedDom.refresh()
  shop.refresh()
}

function buyUpgrade(id: UpgradeId): { ok: boolean; text: string } {
  const definition = UPGRADE_CATALOG[id]
  const expansion = fairground.farmExpansion
  if (id === 'land-deed' && (!expansion || expansion.state.isAnimating)) {
    return { ok: false, text: 'The surveyors are still marking out the last parcel. Give them a moment.' }
  }
  const quote = upgradeQuote(id, upgrades, progression.level)
  const result = purchaseUpgrade(wallet, upgrades, id, progression.level)
  if (!result.ok) {
    if (result.failure === 'maxed') return { ok: false, text: `You already own every ${definition.name}.` }
    if (result.failure === 'locked') return { ok: false, text: `Pip will sell you this at farmer level ${quote.requiredLevel + 1}.` }
    return { ok: false, text: `Not enough coins for the ${definition.name} -- it costs ${quote.price}.` }
  }
  salePanel.setWallet(wallet.balance)
  saveSoon()
  if (id === 'land-deed') {
    expansion?.expand()
    refreshShopUi()
    return { ok: true, text: 'Deed signed -- a new strip of land opens up.' }
  }
  syncGrassPack()
  refreshShopUi()
  return { ok: true, text: 'The green pack is yours. Press E with the seed bag out to swap packs.' }
}

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

function playerDomStats() {
  const base = progressionHudState()
  const parcel = (fairground.farmExpansion?.state.level ?? 0) + 1
  return {
    points: base.points,
    level: base.level,
    pointsToNext: base.pointsToNextLevel,
    parcel,
    population: base.population,
    outside: base.outside,
    houseRoom: base.houseRoom,
    houseUsed: base.houseUsed,
    accomplishments: accomplishments.list(ownedSeedSpecies()),
    recentAccomplishments: accomplishments.recent(),
    levels: playerLevelCards(base.points, base.level),
  }
}

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

function balloonInboxAnchor(): { x: number; y: number } {
  const vw = ui.viewport.width
  const vh = ui.viewport.height
  const described = balloon.describe?.() as { center?: { x: number; y: number }; radius?: number } | undefined
  const cx = described?.center?.x ?? vw / 2 - 150
  const cy = described?.center?.y ?? 195 - vh / 2
  const top = cy + (described?.radius ?? 108) + 10
  return {
    x: ((cx + vw / 2) / vw) * window.innerWidth,
    y: ((vh / 2 - top) / vh) * window.innerHeight,
  }
}

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

function openPlantCardFor(plant: GardenPlant): void {
  propCard.close()
  const species = PLANT_CATALOG.find((entry) => entry.id === plant.species)
  const anchorWorld = new THREE.Vector3(plant.x, GARDEN_LAWN_Y + 1.4, plant.z)
  const anchorNdc = anchorWorld.project(camera)
  gardenPlants?.cancelPlacement()
  gardenTools?.setPlantingMode(false)
  shed.setPlacementActive(false)
  plantCard.open({
    instanceId: plant.instanceId,
    speciesId: plant.species,
    name: `${species?.name ?? 'Plant'} ${gardenPlants?.selectedPlantNumber ?? 1}`,
    speciesLabel: species?.subtitle ?? 'Plant',
    growth: plant.growth,
    care: plant.careNeeded,
    price: plantSaleValue(plant.species, plant.growth),
  }, { x: anchorNdc.x * ui.viewport.width / 2, y: anchorNdc.y * ui.viewport.height / 2 })
  syncFarmChrome()
}

let plantCardSyncTimer = 0
function syncPlantCard(deltaSeconds: number): void {
  if (!plantCard.isOpen) return
  plantCardSyncTimer += deltaSeconds
  if (plantCardSyncTimer < 0.25) return
  plantCardSyncTimer = 0
  const plant = gardenPlants?.simulation.plants.find((entry) => entry.instanceId === plantCard.instanceId)
  if (!plant) {
    plantCard.close()
    return
  }
  plantCard.sync({ growth: plant.growth, care: plant.careNeeded, price: plantSaleValue(plant.species, plant.growth) })
}

// ------------------------------------------------------------ save and load --
// Everything a farm is, as plain data, and the way back from it. Loading and
// starting over both reload the page (see game/save-game.ts), so the world below
// is only ever built one way: fresh, and then `applySavedWorld` lays a save over it.

/** Seconds of play in this farm, across every session that has carried it. */
let playSeconds = loadedSave?.playSeconds ?? 0
/** Autosave waits until the player has walked in, so merely opening the page never overwrites a farm. */
let hasEntered = false
/** The slot the running farm saves into; null until the player picks one. */
let activeSaveSlot: number | null = startup.slot
saveStore.setActiveSlot(activeSaveSlot)
const AUTOSAVE_SECONDS = 60
/** After a sale or a purchase, save soon rather than waiting out the minute. */
const SAVE_SOON_SECONDS = 2
let secondsSinceSave = 0
let saveSoonIn = Infinity
let saveFailureReported = false

function packField(values: Float32Array | null, cols: number, rows: number): PackedField {
  if (!values) return { cols: 0, rows: 0, data: '', scale: 1000 }
  return { cols, rows, data: packInt16(values, 1000), scale: 1000 }
}

function captureSave(): SaveGameData {
  const animalPlaces: Record<string, { x: number; z: number; name: string }> = {}
  for (const record of progress.all()) {
    const animal = animalById.get(record.id)
    // An animal indoors has no model; its place is the door it went in by.
    const door = record.insideId ? knownDoors.get(record.insideId) : undefined
    animalPlaces[record.id] = {
      x: animal?.root.position.x ?? door?.x ?? 0,
      z: animal?.root.position.z ?? door?.z ?? 0,
      name: animalNames.get(record.id) ?? '',
    }
  }
  const grass = gardenTools?.exportGrass() ?? { xs: '', zs: '', heights: '', count: 0, paintKeys: '', paintCoverage: '', paintCount: 0 }
  const placed = gardenProps?.exportPlaced() ?? { props: [], fenceRuns: [] }
  return {
    playSeconds,
    clock: { timeOfDay: dayNightClock.timeOfDay, elapsedDays: dayNightClock.elapsedDays },
    coins: wallet.balance,
    progression: progression.exportState(),
    upgrades: Object.fromEntries(UPGRADE_ORDER.map((id) => [id, upgrades.count(id)])),
    accomplishments: accomplishments.exportState(),
    expansionLevel: fairground.farmExpansion?.level ?? 0,
    life: progress.exportState(),
    animalPlaces,
    preyEaten: predationLedger.totals,
    plants: gardenPlants?.simulation.exportState() ?? { seeds: {}, plants: [], nextInstanceId: 1 },
    props: {
      inventory: gardenProps?.inventory.counts ?? {},
      placed: placed.props.map((prop) => ({ ...prop })),
      fenceRuns: placed.fenceRuns,
    },
    terrain: packField(gardenTerrain?.exportHeights() ?? null, gardenTerrain?.gridCols ?? 0, gardenTerrain?.gridRows ?? 0),
    water: packField(gardenWater?.exportDepths() ?? null, gardenWater?.gridCols ?? 0, gardenWater?.gridRows ?? 0),
    grass,
    tools: { grassPack: gardenTools?.grassPack ?? 'short' },
    journalBestStage: Object.fromEntries(journalBestStage),
  }
}

function saveSummary(data: SaveGameData) {
  return {
    farmerLevel: progression.level + 1,
    coins: data.coins,
    day: Math.floor(data.clock.elapsedDays) + 1,
    residents: progress.all().filter((record) => record.stage >= 3 && !record.baby).length,
    playSeconds: Math.floor(data.playSeconds),
  }
}

function saveFailureText(reason: 'unavailable' | 'full' | 'invalid-slot'): string {
  if (reason === 'full') return 'The browser has no room left for saves. Free some space and try again.'
  if (reason === 'invalid-slot') return 'That is not a farm slot.'
  return 'This browser is not letting the game keep saves.'
}

/** Write the running farm into a slot. Returns what the Farms screen should say. */
function saveFarmTo(slot: number): { ok: boolean; message: string } {
  let data: SaveGameData
  try {
    data = captureSave()
  } catch (error) {
    console.error('[save] capturing the farm failed', error)
    return { ok: false, message: 'Something went wrong gathering the farm, so nothing was saved.' }
  }
  const result = saveStore.write(slot, makeEnvelope(data, saveSummary(data), Date.now()))
  if (!result.ok) return { ok: false, message: saveFailureText(result.reason) }
  activeSaveSlot = slot
  saveStore.setActiveSlot(slot)
  secondsSinceSave = 0
  saveSoonIn = Infinity
  saveFailureReported = false
  return { ok: true, message: `Saved to Farm ${slot}.` }
}

/** Save without being asked. Quiet on success, one polite warning on failure. */
function autosave(): void {
  if (!saveEnabled || !hasEntered || activeSaveSlot === null) return
  const result = saveFarmTo(activeSaveSlot)
  if (result.ok || saveFailureReported) return
  saveFailureReported = true
  notificationPanel.notifyAccomplishment('Your farm could not be saved', result.message)
}

/** A sale or a purchase just changed the farm in a way worth keeping. */
function saveSoon(): void {
  if (saveSoonIn === Infinity) saveSoonIn = SAVE_SOON_SECONDS
}

function tickAutosave(deltaSeconds: number): void {
  if (!hasEntered || menu.isOpen || mode !== 'farm') return
  playSeconds += deltaSeconds
  secondsSinceSave += deltaSeconds
  saveSoonIn -= deltaSeconds
  if (secondsSinceSave >= AUTOSAVE_SECONDS || saveSoonIn <= 0) {
    secondsSinceSave = 0
    saveSoonIn = Infinity
    autosave()
  }
}

// Closing the tab, reloading for Load or New, or switching away keeps the last
// minute of play. `pagehide` is the reliable one on mobile and in the bfcache.
window.addEventListener('pagehide', autosave)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave() })

function reloadWith(request: { kind: 'load' | 'new'; slot: number }): void {
  // Keep the farm that is running safe first (the pagehide autosave would too,
  // but a failed queue below must not leave the player with a half-done switch).
  autosave()
  if (!saveStore.queueBoot(request)) {
    farmsPanel.open('This browser is not letting the game keep saves, so it cannot switch farms.')
    return
  }
  window.location.reload()
}

const farmsPanel = createFarmsPanel({
  slots: () => saveStore.slots(),
  activeSlot: () => activeSaveSlot,
  storageAvailable: () => saveStore.available,
  hasUnsavedWork: () => hasEntered && activeSaveSlot === null,
  save: (slot) => saveFarmTo(slot),
  load: (slot) => reloadWith({ kind: 'load', slot }),
  startNew: (slot) => {
    // The old farm in that slot is replaced the moment the new one first saves.
    // Without this, the old page's pagehide autosave would write the farm being
    // thrown away straight back over the slot the player just cleared.
    if (activeSaveSlot === slot) activeSaveSlot = null
    reloadWith({ kind: 'new', slot })
  },
}, () => syncFarmChrome())

/**
 * Lay a loaded save over the freshly built world. Each section is applied on its
 * own, so one that cannot be read costs the farm that piece, not the whole save.
 */
function applySavedWorld(data: SaveGameData): void {
  const problems: string[] = []
  const section = (name: string, apply: () => void): void => {
    try {
      apply()
    } catch (error) {
      problems.push(name)
      console.error(`[save] could not restore ${name}`, error)
    }
  }
  const expansion = fairground.farmExpansion
  section('land', () => {
    expansion?.restoreLevel(data.expansionLevel)
    lastExpansionLevel = expansion?.level ?? 0
    currentGardenBounds = expansion?.bounds ?? GARDEN_BOUNDS
    gardenTerrain?.syncBounds()
  })
  section('ground', () => {
    if (!gardenTerrain || data.terrain.cols === 0) return
    const { cols, rows } = data.terrain
    if (cols !== gardenTerrain.gridCols || rows !== gardenTerrain.gridRows) throw new RangeError('terrain grid size changed')
    gardenTerrain.restoreHeights(unpackInt16(data.terrain.data, data.terrain.scale, cols * rows))
    gardenTerrain.applyToMeshes(true)
  })
  section('water', () => {
    if (!gardenWater || !gardenTerrain) return
    gardenWater.resize(gardenTerrain.gridCols, gardenTerrain.gridRows)
    gardenWater.markTerrainChanged()
    if (data.water.cols === gardenWater.gridCols && data.water.rows === gardenWater.gridRows) {
      gardenWater.restoreDepths(unpackInt16(data.water.data, data.water.scale, data.water.cols * data.water.rows))
    }
    gardenWaterMesh?.markDirty()
  })
  section('grass', () => {
    gardenTools?.importGrass(data.grass)
    remeasureMeadow()
  })
  section('purse and progress', () => {
    wallet.restore(data.coins)
    progression.importState(data.progression)
    for (const id of UPGRADE_ORDER) upgrades.set(id, data.upgrades[id] ?? 0)
    accomplishments.importState(data.accomplishments)
    predationLedger.restore(data.preyEaten)
  })
  section('garden', () => {
    gardenPlants?.simulation.importState(data.plants)
    for (const plant of gardenPlants?.simulation.plants ?? []) if (plant.mature) knownMaturePlants.add(plant.instanceId)
    for (const id of PROP_ORDER) gardenProps?.inventory.set(id, data.props.inventory[id] ?? 0)
    gardenProps?.importPlaced({ props: data.props.placed, fenceRuns: data.props.fenceRuns })
    if (shopUnlocked(progression.level)) gardenProps?.finishShopBuild()
  })
  section('journal', () => {
    journalBestStage.clear()
    for (const [species, stage] of Object.entries(data.journalBestStage)) {
      if (Number.isFinite(stage) && stage > 0) journalBestStage.set(species, Math.min(4, Math.floor(stage)))
    }
    noteJournalStages()
  })
  section('tools', () => {
    if (data.tools.grassPack === 'tall' && upgrades.owns('tall-grass')) gardenTools?.setGrassPack('tall')
    syncGrassPack()
    salePanel.setWallet(wallet.balance)
    refreshShopUi()
  })
  if (problems.length > 0) {
    farmsPanel.open(`Part of this farm could not be restored (${problems.join(', ')}). The rest is back.`)
  }
}
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

/**
 * Hand the journal a live view of the condition ladder.
 *
 * The translation lives here rather than in the journal so the UI keeps no
 * knowledge of the progression model -- it draws rows, and the model decides
 * what a row says and whether it is sealed yet.
 */
const journalConditionsSource: JournalConditionSource = {
  get: (species) => {
    noteJournalStages()
    const stage = journalBestStage.get(species) ?? 0
    if (stage < 1) return null
    const farm = measureFarm()
    const definitions = getSpeciesConditions(species)
    if (!definitions.length) return null
    return {
      stage,
      rows: definitions.map((definition) => {
        const requirement = definition.requirement
        const isNumeric = requirement !== null && requirement.kind !== 'residentSpecies'
        // A social condition has no area to meter, so name the friend instead.
        const wantsSpecies = requirement?.kind === 'residentSpecies' ? requirement.species : undefined
        const revealed = definition.stage <= stage + 1
        const labelled = isCountKind(requirement?.kind)
        return {
          stage: definition.stage,
          title: definition.title,
          revealed,
          current: isNumeric ? farmMetric(farm, requirement.kind, requirement.species) : null,
          target: requirement?.amount ?? null,
          met: definition.stage <= stage,
          result: definition.result,
          hint: definition.hint,
          ...(requirement ? { requirementKind: requirement.kind, ...(requirement.species ? { requirementSpecies: requirement.species } : {}) } : {}),
          // Area rows keep their old unlabeled look; plant and predator rows name what they count.
          ...(isNumeric && labelled ? { metricLabel: conditionMetricLabel(requirement) ?? undefined } : {}),
          ...(isNumeric && labelled ? { metricUnit: conditionMetricUnit(requirement) } : {}),
          ...(revealed && requirement?.and?.length ? {
            alsoNeeds: requirement.and.map((also) => ({
              label: conditionMetricLabel(also) ?? 'Also needed',
              current: farmMetric(farm, also.kind, also.species),
              target: also.amount ?? 1,
              kind: also.kind,
              ...(also.species ? { species: also.species } : {}),
            })),
          } : {}),
          ...(wantsSpecies ? {
            waitingOn: {
              species: wantsSpecies,
              name: ANIMAL_CATALOG.find((animal) => animal.id === wantsSpecies)?.name ?? wantsSpecies,
              resident: progress.all().some((entry) => entry.species === wantsSpecies && entry.stage >= 3),
            },
          } : {}),
        }
      }),
    }
  },
}
journal.setConditionsSource(journalConditionsSource)
journalDom.setConditionsSource(journalConditionsSource)

for (const panel of panels) ui.add(panel)

function selectGardenTool(id: GardenToolId | null): void {
  endCameraTour(true)
  gardenPlants?.cancelPlacement()
  gardenProps?.cancelPlacement()
  shed.setPlacementActive(false)
  gardenTools?.setPlantingMode(false)
  if (gardenTools) {
    // Tapping the active tool's key again cycles its brush size rather than
    // re-selecting what is already selected.
    if (gardenTools.selectedTool === id && id !== null) gardenTools.cycleBrushSize()
    else if (gardenTools.selectedTool !== id) gardenTools.selectTool(id)
  }
  toolsHud.setSelectedTool(id)
  shed.setInteractEnabled(id === null)
  syncFarmChrome()
  // Re-resolve the pointer now: a tool switch changes what it should look like,
  // and the next pointer move may be a while away.
  refreshCursor()
}

function handleMenuChoice(choice: MenuChoice): void {
  if (choice === 'farms') {
    farmsPanel.open()
    return
  }
  if (choice === 'enter') hasEntered = true
  if (choice === 'options') {
    // The screen opens over the menu; closing it lands back on the menu.
    optionsDom.setOpen(true)
    return
  }
  setMode(choice === 'viewer' ? 'viewer' : 'farm')
}

function setMode(next: GameMode): void {
  // Neither destination wants a tour running: the viewer stages its own camera
  // and the farm restores its opening framing below.
  endCameraTour(false)
  if (next !== 'farm') {
    salePanel.close()
    animalCard.close()
    propCard.close()
    plantCard.close()
    shed.close()
    shed.setPlacementActive(false)
    shop.setOpen(false)
    gardenPlants?.cancelPlacement()
    gardenProps?.cancelPlacement()
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
      viewerStage = createCaptureShowcaseStage(VIEWER_CAST)
      scene.add(viewerStage.root)
    }
    // Only the cast travels to the stage; the rest of the farm stays in the
    // fairground, which is simply removed from the scene while the booth is up.
    for (const animal of getViewerCastAnimals()) {
      viewerStage.root.add(animal.root)
      animal.root.position.copy(viewerStands.get(animal.instanceId)!)
      animal.setDetailedVisible(animal.stage > 0)
    }
    refreshAnimalVisibility(performance.now() / 1000, true)
    scene.remove(fairground.root)
    focusCamera()
  } else {
    viewer.close()
    scene.remove(viewerStage?.root ?? fairground.root)
    // Return only the cast; everyone else never left the fairground and keeps
    // whatever wander they were in the middle of.
    for (const animal of getViewerCastAnimals()) {
      const home = farmHomes.get(animal.instanceId)
      if (!home) continue
      home.parent.add(animal.root)
      animal.root.position.copy(home.position)
    }
    scene.add(fairground.root)
    refreshAnimalVisibility(performance.now() / 1000, true)
    focusCamera()
  }
  syncFarmChrome()
  updateCameraProjection()
}

/**
 * The tool bar and the journal launcher belong to the farm. While the main menu
 * is up they used to stay on screen underneath it, so the menu's button row was
 * drawn straight through the tool bar and both sets of lettering overlapped.
 */
function syncFarmChrome(): void {
  const farmOnly = mode === 'farm' && !menu.isOpen
  if (menu.isOpen && shop.isOpen) shop.setOpen(false)
  const shopOpen = shop.isOpen
  const shedOpen = shed.isOpen
  const playerOpen = playerDom.isOpen
  toolsHud.setVisible(farmOnly && !journal.isOpen && !shedOpen && !salePanel.isOpen && !shopOpen && !gardenProps?.placingId && !playerOpen)
  shed.setVisible(false)
  shed.setInteractEnabled(toolsHud.selectedTool === null)
  journal.setLauncherVisible(false)
  balloon.setVisible(farmOnly)
  clockCalendarHud.setVisible(farmOnly)
  balloon.setInteractEnabled(true)
  if (!farmOnly && notificationDom.isOpen) notificationDom.setOpen(false)
  if (gardenPlants) gardenPlants.root.visible = mode === 'farm'
  refreshCursor()
}



/** Who the tour could pin to: every animal still living at the farm. */
function tourSubjects(): CameraTourSubject[] {
  return animals
    .filter((animal) => !animal.isSold && animal.root.visible)
    .map((animal) => ({
      id: animal.id,
      x: +animal.root.position.x.toFixed(3),
      y: +animal.root.position.y.toFixed(3),
      z: +animal.root.position.z.toFixed(3),
    }))
}

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
  syncFarmChrome,
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
    shownAnimalCount: () => shownAnimalCount,
    houseSpots: () => houseSpots,
    gardenBounds: () => currentGardenBounds,
    setGardenBounds: (bounds) => { currentGardenBounds = bounds },
    setClockHeld: (held) => { clockHeld = held },
    setFocusedAnimal: (id) => { focusedAnimalId = id },
    resetRoster: () => {
      outdoorRoster = new Set()
      lastRosterAt = -Infinity
    },
    resetVisibilityClock: () => { lastVisibilityRefreshAt = 0 },
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
    syncFarmChrome,
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
  viewerStage?.update(delta)
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
