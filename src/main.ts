import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions, ANIMAL_CATALOG, VIEWER_CAST } from './animals/animal-catalog'
import { isHouse } from './game/animal-housing'
import { createHousing } from './scene/housing'
import type { Bed } from './game/sleep'
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
  type UpgradeId,
} from './game/tool-unlocks'
import { type FarmSnapshot } from './game/animal-progress'
import { farmMetric } from './game/farm-state'
import { createFarmMeasure } from './scene/farm-measure'
import { createFarmSave } from './game/farm-save'
import { PROP_CATALOG, type PropId } from './game/farm-props'
import { conditionMetricLabel, conditionMetricUnit, getSpeciesConditions, isCountKind } from './game/animal-conditions'
import { createCaptureShowcaseStage, GARDEN_LAWN_Y, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { createGardenWaterField } from './game/garden-water'
import { createGardenWaterMesh } from './scene/garden-water-mesh'
import { createGardenPlants, type GardenPlants } from './scene/garden-plants'
import { createGardenProps, type GardenProps, type PropSelection } from './scene/garden-props'
import { PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, SEED_PRICES, plantSpecies, type GardenPlant, type PlantId, type PlantSubstrate } from './game/plants'
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
import { createPropCard } from './ui/prop-card'
import { createSellBurst, type SellBurst } from './ui/sell-burst'
import { isNightTime } from './game/predator'
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










/** Where each sleeping night animal lay down, so it keeps its bed all day instead of chasing the nearest can. */
const sleepBeds = new Map<string, Bed>()


/**
 * Everything the animal sim reads from the scene, in one place. Every tick goes
 * through here: a tick that left out the houses would evict every resident.
 */
function animalLifeSnapshot(): AnimalLifeSnapshot {
  setHouses(gardenProps?.houses() ?? [])
  return {
    farm: currentFarmSnapshot(),
    expansionLevel: fairground.farmExpansion?.state.level ?? 0,
    positions: Object.fromEntries(animals.map((animal) => [animal.instanceId, { x: animal.root.position.x, z: animal.root.position.z }])),
    houses: houses().map((house) => ({ id: house.id, prop: house.prop, x: house.x, z: house.z })),
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
  if (choice === 'enter') markEntered()
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
  syncFarmChrome,
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
  refreshShopUi,
  noteJournalStages,
  salePanel,
  notificationPanel,
  menuOpen: () => menu.isOpen,
  mode: () => mode,
  syncFarmChrome,
})
window.addEventListener('pagehide', autosave)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave() })
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
    houseSpots: () => houses(),
    gardenBounds: () => currentGardenBounds,
    setGardenBounds: (bounds) => { currentGardenBounds = bounds },
    setClockHeld: (held) => { clockHeld = held },
    setFocusedAnimal: (id) => { focusedAnimalId = id },
    resetRoster: () => {
      resetRoster()
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
