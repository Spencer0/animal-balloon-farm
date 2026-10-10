import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions, ANIMAL_CATALOG, type BalloonAnimalId } from './animals/animal-catalog'
import { chooseOutdoorRoster, HOUSE_CAPACITY, houseAccepts, houseOccupancy, houseWithRoom, isHouse, occupantsByHouse, OUTDOOR_LIMITS, type RosterAnimal } from './game/animal-housing'
import { containsGardenPoint, createFairground, createSkyDome, GARDEN_BOUNDS, GARDEN_LAWN_Y } from './scene/fairground'
import { ANIMAL_LIFE_CONFIG, createAnimalLife, type AnimalRecord, type AnimalLifeEvent, type AnimalLifeSnapshot } from './game/animal-life'
import { FARM_EXPANSION_CONFIG } from './game/farm-expansion'
import { clearOfFarmBounds } from './game/animal-travel'
import { createProgressLedger } from './game/farm-progression'
import { buildAccomplishmentCatalog, createAccomplishmentTracker, type AccomplishmentDef, type AccomplishmentStage } from './game/accomplishments'
import {
  createUpgradeLedger,
  purchasePropAtLevel,
  purchaseUpgrade,
  upgradeQuote,
  propUnlockLevel,
  UPGRADE_CATALOG,
  UPGRADE_ORDER,
  type UpgradeId,
} from './game/tool-unlocks'
import { type FarmSnapshot } from './game/animal-progress'
import { farmMetric, measureFarmState, type FarmState, type LawnSample, type TerrainSample, type WaterSample } from './game/farm-state'
import { conditionMetricLabel, conditionMetricUnit, getSpeciesConditions, isCountKind, type AnimalStage } from './game/animal-conditions'
import { createGardenTools, ICE_SNOW_THRESHOLD, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { createGardenWaterField, WATER_MIN_RENDER_DEPTH } from './game/garden-water'
import { createGardenWaterMesh } from './scene/garden-water-mesh'
import { createGardenPlants, type GardenPlants } from './scene/garden-plants'
import { createGardenProps, type GardenProps, type HouseSpot, type PropSelection } from './scene/garden-props'
import { PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, SEED_PRICES, plantSpecies, type GardenPlant, type PlantId, type PlantSubstrate } from './game/plants'
import { footprintWorldRect, PROP_CATALOG, PROP_ORDER, propDefinition, purchaseProp, type PropId } from './game/farm-props'
import { resolveCollisions, type CollisionBody, type CollisionBox } from './game/animal-collision'
import { shopUnlocked } from './game/shop-construction'
import { STARTING_COINS, animalSaleValue, createWallet, generateAnimalNames, plantSaleValue } from './game/sales'
import { GARDEN_TOOLS, type GardenToolId } from './scene/garden-tool-art'
import { createCameraTour, type CameraTour, type CameraTourSubject } from './game/camera-tour'
import { cameraPanStep } from './game/camera-rig'
import { createUILayer, routePointer, type UIPanel } from './ui/ui-layer'
import { advanceClock, calendarOf, createDayNightClock, formatCalendarDate, phaseOf, setTimeOfDay, skipToNext } from './game/day-night'
import { createDayNightRig } from './scene/day-night-rig'
import { weekdayName } from './game/carnival-schedule'
import { shopSite } from './game/shop-site'
import type { ShopBuildReport } from './scene/shop-build'
import { createClockCalendarHud } from './ui/clock-calendar-hud'
import { createPlantCard } from './ui/plant-card'
import { createJournalPanel, type JournalConditionSource } from './ui/journal-panel'
import { createJournalDomPanel, type JournalDomPanel } from './ui/journal-dom'
import { createMenuDomPanel, type MenuChoice } from './ui/menu-dom'
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
import { createHoverGlow, type HoverGlowTarget } from './scene/hover-glow'
import type { DesignPoint } from './ui/ui-viewport'
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
import { createIntroCutscene, type IntroCutscene } from './scene/intro-cutscene'

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
const normalViewHeight = 43

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
// Orthographic distance does not change framing. Keep the eye far enough back
// that the bottom rays stay above ground at maximum zoom and shallow tilt.
const initialOffset = new THREE.Vector3(35, 34, 47).multiplyScalar(2)
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

// Saves are off under the debug harness: its scenarios build exact farms, and a
// stray autosave (or an auto-loaded farm) would corrupt a stress measurement.
const saveEnabled = !gardenDebugMode || pageParams.has('saves')
const saveStore = createSaveStore(saveEnabled ? browserSaveStorage() : null)
const bootRequest = saveEnabled ? saveStore.takeBoot() : null
const startup = saveEnabled ? resolveStartup(saveStore, bootRequest) : { slot: null, envelope: null, notice: null }
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
let lastSnowRevision = -1
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
// Snow over water is ice; the pond surface asks the lawn how much snow lies on it.
gardenWaterMesh?.setIce(iceAt)
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
const speciesIds = getAnimalSceneOptions(gameCanvas, camera).map((options) => options.id)
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
  const walkers = getAnimalSceneOptions(gameCanvas, camera, gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined)
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
  const options = getAnimalSceneOptions(gameCanvas, camera, gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined)
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

// Farm homes are assigned as each independently tracked animal is created.

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

/** 0 open water .. 1 solid ice: water under snow is frozen over. */
function iceAt(x: number, z: number): number {
  const snow = gardenTools?.snowAt(x, z) ?? 0
  return Math.min(1, Math.max(0, (snow - 0.25) / (ICE_SNOW_THRESHOLD - 0.25)))
}

/** Visible pond cells that are frozen solid; ice is not a place to drink or paddle. */
function frozenWaterCells(): number {
  if (!gardenWater || !gardenTools || gardenTools.snowArea() <= 0) return 0
  const { cellSize, originX, originZ, gridCols } = gardenWater
  let frozen = 0
  for (const cell of gardenWater.wetCells()) {
    const gx = cell % gridCols
    const gz = (cell - gx) / gridCols
    const x = originX + (gx + 0.5) * cellSize
    const z = originZ + (gz + 0.5) * cellSize
    if (gardenWater.depthAt(x, z) >= WATER_MIN_RENDER_DEPTH && gardenTools.snowAt(x, z) >= ICE_SNOW_THRESHOLD) frozen += 1
  }
  return frozen
}

function currentWaterSample(): WaterSample | null {
  if (!gardenWater) return null
  const summary = gardenWater.summary()
  return { visibleWetCells: Math.max(0, summary.visibleWetCells - frozenWaterCells()), cellSize: gardenWater.cellSize }
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

let harnessSpawnCount = 0

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
  if (menu.isOpen || salePanel.isOpen) return
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

const targetOffset = new THREE.Vector3()
const viewDirection = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize()
let cameraDistance = initialOffset.length()
let viewHalfHeight = viewHeight / 2
let dragPointer: number | null = null
let toolPointer: number | null = null
let previousPointer = { x: 0, y: 0 }
let dragMode: 'orbit' | 'pan' | null = null
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
const performanceOverlay = __GARDEN_DEBUG__ && gardenDebugMode && !pageParams.has('nohud') ? createPerformanceOverlay() : null
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
  syncOwnedTools()
}

/** The Snower is bought at Pip's shop: it takes its tool slot and number key once owned, and not before. */
function syncOwnedTools(): void {
  toolsHud.setOwnedTools(upgrades.owns('snower') ? ['snower'] : [])
  // Starting over or loading a farm without it must not leave it in hand.
  if (!upgrades.owns('snower') && toolsHud.selectedTool === 'snower') selectGardenTool(null)
}

function toolIsOwned(id: GardenToolId): boolean {
  return id !== 'snower' || upgrades.owns('snower')
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

const menu = createMenuDomPanel({
  onChoose: handleMenuChoice,
  keysEnabled: () => !optionsDom.isOpen && !farmsPanel.isOpen,
  onToggle: () => syncFarmChrome(),
})

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
    toolsHud.setVisible(!menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !isOpen)
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
  if (id === 'snower') return { ok: true, text: 'The Snower is yours. Press 4 to take it out: hold left-click to blow snow, right-click to melt it.' }
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
  if (!hasEntered || menu.isOpen) return
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
const panels: UIPanel[] = [balloon, notificationPanel, toolsHud, shed, journal, salePanel, animalCard, plantCard, propCard, clockCalendarHud]

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

/** Where the pointer was last seen, so the cursor can be re-resolved on a
 * mode or visibility change without waiting for the mouse to move again. */
const lastPointerClient = { x: -1, y: -1 }
for (const panel of panels) ui.add(panel)

function selectGardenTool(id: GardenToolId | null): void {
  if (id !== null && !toolIsOwned(id)) return
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
  // A brand-new farm opens with the intro film; the farm itself waits for it.
  if (choice === 'enter' && !hasEntered && introWanted()) {
    startIntro()
    return
  }
  if (choice === 'enter') hasEntered = true
  if (choice === 'options') {
    // The screen opens over the menu; closing it lands back on the menu.
    optionsDom.setOpen(true)
    return
  }
  endCameraTour(false)
  menu.close()
}

function focusCamera(): void {
  targetOffset.set(0, 0, 0)
  cameraTarget.set(0, 1.25, 0)
  viewHalfHeight = normalViewHeight / 2
  camera.position.copy(cameraTarget).add(initialOffset)
  viewDirection.copy(initialOffset).normalize()
  cameraDistance = initialOffset.length()
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
  updateCameraProjection()
  refreshAnimalVisibility(performance.now() / 1000, true)
}

/**
 * The tool bar and the journal launcher belong to the farm. While the main menu
 * is up they used to stay on screen underneath it, so the menu's button row was
 * drawn straight through the tool bar and both sets of lettering overlapped.
 */
function syncFarmChrome(): void {
  const farmOnly = !menu.isOpen
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
  refreshCursor()
}

menu.open()
syncFarmChrome()
if (loadedSave) applySavedWorld(loadedSave)
else if (startup.notice) farmsPanel.open(startup.notice)
if (lastPointerClient.x < 0) {
  // No pointer has entered the window yet, so nothing to place. Once it does,
  // the first move resolves the cursor.
  setCursor('idle', gameCanvas)
}

// ------------------------------------------------------------- camera tool --
// The farm's own moves (edge pan, WASD, wheel zoom) are always available. The
// camera tool adds an explicit framing mode on top:
//   left-drag    orbits the view around whatever it is looking at,
//   right-click  runs a cinematic tour over the farm,
//   middle-click returns to the opening shot.
// The tour saves the view it replaced, so leaving it puts the player back
// exactly where they were rather than somewhere along the tour route.

interface SavedCameraView {
  readonly target: THREE.Vector3
  readonly position: THREE.Vector3
  readonly direction: THREE.Vector3
  readonly halfHeight: number
  readonly distance: number
}

let cameraTour: CameraTour | null = null
let cameraTourSeed = 0
let savedCameraView: SavedCameraView | null = null
/** The tour's live orbit, eased onto the sequencer's angle so a tour glides. */
let tourAngle = 0
let tourPhi = 1
const tourLookAt = new THREE.Vector3()
const tourDesiredLookAt = new THREE.Vector3()
const tourOffset = new THREE.Vector3()

/** Shift holds the pointer: while it is down nothing is armed, so presses and hovers act on the farm. */
let shiftHeld = false

function setShiftHeld(held: boolean): void {
  if (shiftHeld === held) return
  shiftHeld = held
  refreshCursor()
  // Releasing Shift brings the brush ring back straight away, not on the next move.
  if (isWorldToolActive() && lastPointerClient.x >= 0) gardenTools?.pointerMove({ clientX: lastPointerClient.x, clientY: lastPointerClient.y })
}

/** No tool is armed, so the pointer is in charge. */
function noToolArmed(): boolean {
  return toolsHud.selectedTool === null
}

/** Whether the pointer is over the lawn, where an armed tool or seed acts. */
function pointerOverLawn(): boolean {
  return gardenTools?.overLawn({ clientX: lastPointerClient.x, clientY: lastPointerClient.y }) ?? false
}

/**
 * The pointer is in charge: Shift is down, or nothing is armed, or the pointer
 * is off the lawn. A tool or seed only claims the pointer over the lawn, so
 * everything else on the farm stays clickable without holding Shift.
 */
function pointerActive(): boolean {
  if (shiftHeld) return true
  const armed = !noToolArmed() || !!gardenPlants?.selectedSpecies
  return !armed || !pointerOverLawn()
}

/** A seed is on the cursor, over the lawn, and Shift is not holding it back. */
function plantingArmed(): boolean {
  return !shiftHeld && noToolArmed() && !!gardenPlants?.selectedSpecies && pointerOverLawn()
}

/** A farm tool is armed, over the lawn, and Shift is not holding it back. */
function isWorldToolActive(): boolean {
  return !shiftHeld && toolsHud.selectedTool !== null && pointerOverLawn()
}

function beginCameraTour(seed = Math.floor(Math.random() * 0xffffffff)): boolean {
  if (menu.isOpen || journal.isOpen || salePanel.isOpen || shed.isOpen || shop.isOpen) return false
  savedCameraView = {
    target: cameraTarget.clone(),
    position: camera.position.clone(),
    direction: viewDirection.clone(),
    halfHeight: viewHalfHeight,
    distance: cameraDistance,
  }
  cameraTourSeed = seed >>> 0
  cameraTour = createCameraTour(cameraTourSeed)
  tourLookAt.copy(cameraTarget)
  // Start the orbit where the player is already looking, so the tour swings
  // into place instead of cutting to a fresh angle.
  const openingOffset = new THREE.Vector3().subVectors(camera.position, cameraTarget)
  const openingRadius = Math.max(1e-6, openingOffset.length())
  tourAngle = Math.atan2(openingOffset.x, openingOffset.z)
  tourPhi = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(openingOffset.y / openingRadius, -1, 1)), 0.36, 1.17)
  // A tour owns the camera outright, so a half-finished drag must not fight it.
  dragPointer = null
  dragMode = null
  return true
}

/** Leave the tour. `restore` puts back the framing the tour interrupted. */
function endCameraTour(restore: boolean): void {
  if (!cameraTour) return
  cameraTour = null
  if (restore && savedCameraView) {
    cameraTarget.copy(savedCameraView.target)
    camera.position.copy(savedCameraView.position)
    viewDirection.copy(savedCameraView.direction)
    viewHalfHeight = savedCameraView.halfHeight
    cameraDistance = savedCameraView.distance
    camera.lookAt(cameraTarget)
    camera.updateMatrixWorld()
    updateCameraProjection()
  }
  savedCameraView = null
}

/** Snap back to the opening shot: the framing the farm starts the game with. */
function resetCameraToStart(): void {
  endCameraTour(false)
  focusCamera()
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

function updateCameraTour(deltaSeconds: number): void {
  if (!cameraTour) return
  if (menu.isOpen || journal.isOpen || salePanel.isOpen || shed.isOpen || shop.isOpen) {
    endCameraTour(true)
    return
  }
  const shot = cameraTour.tick(deltaSeconds, tourSubjects())
  if (shot.subject) tourDesiredLookAt.set(shot.subject.x, shot.lookAtHeight, shot.subject.z)
  else tourDesiredLookAt.set(0, shot.lookAtHeight, 0)
  // Exponential easing: fast enough to keep up with a walking animal, slow
  // enough that a shot change reads as a glide instead of a cut.
  const blend = 1 - Math.exp(-deltaSeconds * 2.1)
  tourLookAt.lerp(tourDesiredLookAt, blend)
  viewHalfHeight += (shot.viewHeight / 2 - viewHalfHeight) * blend
  // Ease along the short way round the circle, so a tour opening from the
  // player's angle and a shot swap both read as a swing, not a cut.
  const angleDelta = Math.atan2(Math.sin(shot.orbitAngle - tourAngle), Math.cos(shot.orbitAngle - tourAngle))
  tourAngle += angleDelta * blend
  // A breath of vertical drift, so the orbit reads as hand-held rather than
  // turntable-exact.
  const targetPhi = THREE.MathUtils.clamp(0.92 + Math.sin(performance.now() * 0.00021) * 0.045, 0.36, 1.17)
  tourPhi += (targetPhi - tourPhi) * blend
  tourOffset.setFromSphericalCoords(cameraDistance, tourPhi, tourAngle)
  // Keep the shared look-at in sync: the expansion shake and the debug
  // harness both read `cameraTarget`, so a tour that only aimed the camera
  // would have been yanked back to the old target by either of them.
  cameraTarget.copy(tourLookAt)
  camera.position.copy(cameraTarget).add(tourOffset)
  viewDirection.copy(tourOffset).normalize()
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
  updateCameraProjection()
}

// -------------------------------------------------------------------- input --

function pointerDesign(event: PointerEvent) {
  return ui.viewport.toDesign(event.clientX, event.clientY, gameCanvas.getBoundingClientRect())
}

/**
 * Decide what the pointer looks like.
 *
 * Anything the pointer would act on (an animal, a prop, the shop door,
 * a plant's care marker) owns the cursor and the press, whatever tool is armed.
 * That is what lets a seedbag sweep across the lawn without grabbing a
 * neighbour. Otherwise the armed tool or seed owns the pointer over the farm,
 * and everything else gets the balloon arrow.
 */
function updateCursor(point: DesignPoint | null): void {
  if (!point) {
    setCursor('idle', gameCanvas)
    return
  }
  const farmOpen = !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen
  const overFarm = farmOpen && !isOverGameHUD(lastPointerClient.x, lastPointerClient.y)
  // Only pointer mode (Shift, or nothing armed) lets farm objects claim the pointer.
  const interactive = overFarm && pointerActive() && hoverInteractable(lastPointerClient.x, lastPointerClient.y)
  syncWorldTool(interactive)
  for (const panel of [...panels].sort((a, b) => b.order - a.order)) {
    const kind = panel.cursor?.(point as DesignPoint)
    if (kind) {
      setCursor(kind, gameCanvas)
      return
    }
  }
  if (overFarm) {
    const markerKind = pointerActive() ? gardenPlants?.markerKindAt(lastPointerClient.x, lastPointerClient.y) : null
    if (markerKind) {
      setCursor(markerKind === 'water' ? 'water' : markerKind === 'prune' ? 'prune' : 'point', gameCanvas)
      return
    }
    if (interactive) {
      setCursor('point', gameCanvas)
      return
    }
    if (plantingArmed()) {
      setCursor('plant', gameCanvas)
      return
    }
    if (isWorldToolActive()) {
      // A tool stroke lags the pointer by design (drag speed cap), so the OS
      // pointer stays visible mid-stroke: it marks the real mouse while the
      // ring marks where the tool actually works. Without it the mouse goes
      // invisible mid-drag and flies off the screen.
      setCursor(gardenTools?.strokeHeld ? 'point' : 'hidden', gameCanvas)
      return
    }
  }
  setCursor('idle', gameCanvas)
}

/** Keeps the brush ring off while the pointer is on a farm object or Shift holds it. A stroke in progress keeps its ring. */
function syncWorldTool(interactive: boolean): void {
  if (toolPointer !== null) return
  gardenTools?.setSuspended(shiftHeld || interactive)
}

/** Whether a press here belongs to a farm object rather than to the armed tool or seed. */
function hoverInteractable(clientX: number, clientY: number): boolean {
  if (menu.isOpen || journal.isOpen || shed.isOpen || shop.isOpen) return false
  if (gardenProps?.placingId) return false
  return Boolean(
    pickAnimal(clientX, clientY)
    || gardenProps?.propAt(clientX, clientY)
    || gardenProps?.pickShop(clientX, clientY)
    || gardenPlants?.markerKindAt(clientX, clientY)
  )
}

// ---------------------------------------------------------------- hover glow --

/** The soft light under whatever the pointer would act on. */
const hoverGlow = createHoverGlow()
scene.add(hoverGlow.root)
const HOVER_ANIMAL_RADIUS = 0.9
let hoverPlantId: number | null = null
let lastHoverRefreshAt = -Infinity
const HOVER_REFRESH_SECONDS = 1 / 12

/** What the pointer would act on under it, and where to glow for it. Only pointer mode glows. */
function hoverTargetAt(clientX: number, clientY: number): { glow: HoverGlowTarget; plantId: number | null } | null {
  if (!pointerActive()) return null
  const animal = pickAnimal(clientX, clientY)
  if (animal) {
    const at = animal.root.getWorldPosition(new THREE.Vector3())
    const ground = GARDEN_LAWN_Y + (gardenTerrain?.heightAt(at.x, at.z) ?? 0)
    return { glow: { x: at.x, y: ground, z: at.z, radius: HOVER_ANIMAL_RADIUS }, plantId: null }
  }
  const prop = gardenProps?.propAt(clientX, clientY) ?? null
  if (prop) return { glow: prop, plantId: null }
  const plant = gardenPlants?.plantAt(clientX, clientY) ?? null
  if (plant) return { glow: plant, plantId: plant.instanceId }
  return null
}

/** The glow only shows over the farm, with nothing else on top and no press in progress. */
function hoverAllowed(): boolean {
  return pointerWasSeen
    && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !salePanel.isOpen
    && !gardenProps?.placingId
    && dragPointer === null && toolPointer === null
    && !isOverGameHUD(lastPointerClient.x, lastPointerClient.y)
}

function refreshHover(nowSeconds: number, deltaSeconds: number): void {
  hoverGlow.update(deltaSeconds, nowSeconds)
  if (nowSeconds - lastHoverRefreshAt < HOVER_REFRESH_SECONDS) return
  lastHoverRefreshAt = nowSeconds
  const target = hoverAllowed() ? hoverTargetAt(lastPointerClient.x, lastPointerClient.y) : null
  if (target) hoverGlow.show(target.glow)
  else hoverGlow.hide()
  const plantId = target?.plantId ?? null
  if (plantId !== hoverPlantId) {
    hoverPlantId = plantId
    gardenPlants?.setHoveredPlant(plantId)
  }
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
 * journal) always count as the interface; the tool bar asks its own
 * slots, and the expansion card still lives in its own 1280x720 scene so its
 * rectangle is measured in device pixels.
 */
function isOverGameHUD(clientX: number, clientY: number): boolean {
  if (menu.isOpen || journal.isOpen || shed.isOpen || shop.isOpen) return true
  const point = ui.viewport.toDesign(clientX, clientY, gameCanvas.getBoundingClientRect())
  return Boolean(point && (
    (toolsHud.isVisible && toolsHud.hitTest?.(point))
    || shed.contains(point)
    || salePanel.hitTest?.(point)
    || animalCard.hitTest?.(point)
    || propCard.hitTest?.(point)
    || plantCard.hitTest?.(point)
  ))
}

function updateCameraPan(deltaSeconds: number): void {
  if (menu.isOpen || deltaSeconds <= 0) return
  let horizontal = Number(pressedKeys.has('d') || pressedKeys.has('arrowright'))
    - Number(pressedKeys.has('a') || pressedKeys.has('arrowleft'))
  let vertical = Number(pressedKeys.has('w') || pressedKeys.has('arrowup'))
    - Number(pressedKeys.has('s') || pressedKeys.has('arrowdown'))
  let edgeStrength = 0

  if (cameraTour) {
    // A key takes the camera back from the tour; a mouse resting near the edge
    // does not, or the tour would end the moment the pointer drifted.
    if (Math.abs(horizontal) + Math.abs(vertical) < 0.001) return
    endCameraTour(true)
  }

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
  if (menu.isOpen) return
  // A press on a farm object goes to the object, whatever tool is armed.
  const onObject = !isOverGameHUD(event.clientX, event.clientY) && pointerActive() && hoverInteractable(event.clientX, event.clientY)
  if (event.button === 0 && (pointerActive() || onObject) && !isOverGameHUD(event.clientX, event.clientY)) {
    // Placement owns the click outright while a prop is on the ghost.
    if (gardenProps?.placingId) {
      event.preventDefault()
      gardenProps.pointerMove(event)
      gardenProps.pointerDown(event)
      gardenProps.update(0)
      if (!gardenProps.placingId) shed.setPlacementActive(false)
      shedDom.refresh()
      syncFarmChrome()
      return
    }
    if (!journal.isOpen && !shed.isOpen && !shop.isOpen) {
      // A placed prop opens its info card (move, store or sell); then the shop door.
      const propHit = gardenProps?.inspectAt(event.clientX, event.clientY)
      if (propHit) {
        openPropCardFor(propHit)
        return
      }
      if (gardenProps?.pickShop(event.clientX, event.clientY)) {
        salePanel.close()
        animalCard.close()
        propCard.close()
        gardenProps?.cancelPlacement()
        gardenPlants?.cancelPlacement()
        gardenTools?.setPlantingMode(false)
        shed.setPlacementActive(false)
        shop.setOpen(true)
        syncFarmChrome()
        refreshCursor()
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
      openAnimalCardFor(animal)
      return
    }
    const plant = gardenPlants?.selectAt(event.clientX, event.clientY)
    if (plant) {
      propCard.close()
      animalCard.close()
      focusedAnimalId = null
      openPlantCardFor(plant)
      return
    }
  }
  if (salePanel.isOpen) {
    salePanel.close()
  }
  // Plant mode owns the lawn press, so an armed seed plants without Shift.
  if (event.button === 0 && (pointerActive() || plantingArmed()) && !onObject && !journal.isOpen && !shed.isOpen && !shop.isOpen && gardenPlants?.pointerDown(event)) {
    event.preventDefault()
    if (!gardenPlants.selectedSpecies) {
      shed.setPlacementActive(false)
      gardenTools?.setPlantingMode(false)
    }
    syncFarmChrome()
    shedDom.refresh()
    return
  }
  if (event.button === 0 && event.detail >= 2) return
  // Middle click levels with the shovel. With no tool armed, left-drag orbits
  // the farm and right-drag pans it; the farm tools keep their own buttons.
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
  if (event.button === 2 && isWorldToolActive() && !onObject && !isOverGameHUD(event.clientX, event.clientY) && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  // Tool selections are handled by the shared HUD above. Right-click belongs
  // to the active garden tool inside the plot; outside the plot it remains a pan.

  if (isOverGameHUD(event.clientX, event.clientY)) {
    event.preventDefault()
    return
  }
  if (event.button === 0 && isWorldToolActive() && !onObject && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  if (event.button === 1 && isWorldToolActive() && !onObject && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  // In the debug harness, synthetic drags (the garden-drag script) must not
  // move the camera; a real player's drag in a debug build still should.
  if (gardenDebugMode && !event.isTrusted) return
  dragPointer = event.pointerId
  dragMode = event.button === 2 ? 'pan' : 'orbit'
  previousPointer = { x: event.clientX, y: event.clientY }
  gameCanvas.setPointerCapture(event.pointerId)
}

function orbitPointerMove(event: PointerEvent): void {
  if (uiPointerMove(event)) return
  updateCursor(pointerDesign(event))
  if (gardenProps?.placingId) gardenProps.pointerMove(event)
  if (!menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && plantingArmed()) gardenPlants?.pointerMove(event)
  if (isWorldToolActive()) gardenTools?.pointerMove(event)
  if (toolPointer === event.pointerId || dragPointer !== event.pointerId) return
  const dx = event.clientX - previousPointer.x
  const dy = event.clientY - previousPointer.y
  previousPointer = { x: event.clientX, y: event.clientY }
  if (dragMode === 'pan') {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const panScale = viewHalfHeight / Math.max(1, window.innerHeight)
    // Per-move delta only: `cameraPanStep` is deliberately stateless. The old
    // version accumulated into a shared offset, so every pan move re-applied
    // all the previous ones and the camera accelerated away.
    const step = cameraPanStep(cameraRight, cameraUp, dx, dy, panScale)
    targetOffset.set(step.x, step.y, step.z)
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
    if (!gardenProps.placingId) shed.setPlacementActive(false)
    shedDom.refresh()
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
  // Zooming takes the camera back from a running tour at its current pose.
  if (cameraTour) endCameraTour(false)
  viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(event.deltaY * 0.001), CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
  updateCameraProjection()
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
}

/**
 * The key a tool definition would name, with one wrinkle: the camera tool's
 * hotkey is the space bar, whose `event.key` is the character " ".
 */
function toolHotkey(event: KeyboardEvent): string {
  return event.code === 'Space' ? 'space' : event.key.toLowerCase()
}

const PAN_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Shift') setShiftHeld(true)
  if (gardenPlants?.selectedSpecies && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !event.altKey && !event.ctrlKey && !event.metaKey && !isTextInputTarget(event.target)) {
    const tool = GARDEN_TOOLS.find((entry) => entry.hotkey === toolHotkey(event) && toolIsOwned(entry.id))
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
      gardenProps.rotate(event.shiftKey ? -1 : 1)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      gardenProps.cancelPlacement()
      shed.setPlacementActive(false)
      refreshShopUi()
      syncFarmChrome()
      return
    }
  }
  if (event.altKey || event.ctrlKey || event.metaKey || isTextInputTarget(event.target)) return
  if (event.code === 'Space') {
    // The tool bar claims Space while it is on screen; this only keeps the page
    // itself from scrolling when a screen owns the keys instead.
    event.preventDefault()
    return
  }
  const key = event.key.toLowerCase()
  if (key === 'e' && !event.repeat && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && swapGrassPack()) {
    event.preventDefault()
    return
  }
  if (event.key === 'Escape' && cameraTour) {
    // Escape leaves the tour before it means anything else, so a tour ends
    // where it started instead of dropping the player into the menu.
    event.preventDefault()
    endCameraTour(true)
    return
  }
  if (PAN_KEYS.includes(key)) {
    pressedKeys.add(key)
    event.preventDefault()
    return
  }
  if (event.key === 'Escape' && (salePanel.isOpen || animalCard.isOpen || plantCard.isOpen)) {
    salePanel.close()
    animalCard.close()
    plantCard.close()
    syncFarmChrome()
    event.preventDefault()
    return
  }
  if (event.key === 'Escape' && !menu.isOpen && !journal.isOpen) {
    if (gardenPlants?.selectedSpecies) {
      gardenPlants.cancelPlacement()
      shed.setPlacementActive(false)
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
  if (event.key === 'Shift') setShiftHeld(false)
  pressedKeys.delete(event.key.toLowerCase())
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
  setShiftHeld(false)
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

/**
 * Point the camera at a spot and hold it there. Shared by the harness verbs:
 * framing a species and framing a pond are the same camera move, and one copy
 * keeps the two from drifting apart.
 */
function frameAt(target: THREE.Vector3, height: number): void {
  cameraTarget.copy(target)
  viewHalfHeight = height / 2
  camera.position.copy(cameraTarget).add(initialOffset)
  viewDirection.copy(initialOffset).normalize()
  cameraDistance = initialOffset.length()
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
  updateCameraProjection()
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

// ------------------------------------------------------------- intro film --
// A fresh farm starts with the intro cutscene (scene/intro-cutscene.ts). While
// it runs, the farm is neither simulated nor drawn and every key and click
// belongs to the film: Escape skips, anything else asks to be pressed again.

let intro: IntroCutscene | null = null
let introPlayed = false
let introSkipArmedUntil = 0
const INTRO_SKIP_CONFIRM_MS = 2600

/** Fresh farms only, once a session; the debug harness opts in with ?intro. */
function introWanted(): boolean {
  if (introPlayed || loadedSave) return false
  return !gardenDebugMode || pageParams.has('intro')
}

function startIntro(): void {
  if (intro) return
  introPlayed = true
  menu.close()
  const cutscene = createIntroCutscene(renderer, window.innerWidth, window.innerHeight)
  intro = cutscene
  setCursor('idle', gameCanvas)
  cutscene.load().catch((error: unknown) => {
    // A film that cannot load must never stand between the player and the farm.
    console.warn('[intro] could not load the cutscene; going straight to the farm', error)
    if (intro === cutscene) finishIntro()
  })
}

function finishIntro(): void {
  const cutscene = intro
  if (!cutscene) return
  intro = null
  cutscene.dispose()
  previousTime = performance.now()
  handleMenuChoice('enter')
}

function interceptIntroInput(event: KeyboardEvent | PointerEvent): void {
  if (!intro) return
  event.stopImmediatePropagation()
  event.preventDefault()
  // After a New Farm reload the film starts without a gesture, so its sound
  // waits for this first press.
  intro.resumeAudio()
  if (event instanceof KeyboardEvent && event.repeat) return
  const now = performance.now()
  if ((event instanceof KeyboardEvent && event.key === 'Escape') || now < introSkipArmedUntil) {
    intro.skip()
    return
  }
  introSkipArmedUntil = now + INTRO_SKIP_CONFIRM_MS
  intro.flashSkipHint()
}

window.addEventListener('keydown', interceptIntroInput, { capture: true })
window.addEventListener('pointerdown', interceptIntroInput, { capture: true })
window.addEventListener('resize', () => intro?.resize(window.innerWidth, window.innerHeight))
if (bootRequest?.kind === 'new' && introWanted()) startIntro()
else if (gardenDebugMode && pageParams.has('intro')) startIntro()

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
  /**
   * Open the animal info card for an instance or species id. A preview
   * forces the rendered stage/sellable so states the live ladder cannot
   * hold on demand can still be checked headlessly; selling still
   * validates the live animal.
   */
  animalCard(id: string, preview?: { stage?: number; sellable?: boolean }): unknown
  /** Open the plant info card for a planted instance (default: the first one). */
  plantCard(instanceId?: number): unknown
  /** Direct water/terrain controls for repeatable visual checks, compiled out in production. */
  digAt(x: number, z: number, radius: number, amount: number): number
  pourAt(x: number, z: number, radius: number, amount: number): unknown
  clearGarden(): void
  waterSummary(): unknown
  /** Select a garden tool for repeatable input tests. */
  selectTool(tool: GardenToolId): void
  clock(): { readonly timeOfDay: number; readonly phase: string; readonly date: string; readonly elapsedDays: number }
  setTimeOfDay(time: number): void
  skipToMorning(): void
  /** Start the intro cutscene, hold it at a moment (or resume it), and report what it shows. */
  intro(seconds?: number): unknown
  skipToNight(): void
  /** Jump whole days ahead, e.g. to watch the carnival set up on a Sunday. */
  skipDays(days: number): void
  /** Project a world point into the game canvas for real pointer-event tests. */
  projectGardenPoint(x: number, z: number): { readonly x: number; readonly y: number } | null

  /** Live scene graph, for poking at a panel that is not drawing. */
  readonly scene: THREE.Scene
  readonly uiScene: THREE.Scene
  /** Frame-by-frame performance samples for scripted stress tests. */
  performanceSamples(): readonly GardenFrameTiming[]
  layout(): Record<string, unknown>
  /** Fire a ticket on demand, for visual checks without playing to the milestone. */
  notify(kind: 'carnival' | 'farm' | 'resident' | 'birth' | 'plant', subject: string): void
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
  sowGrass(x: number, z: number, radius: number, pack?: 'short' | 'tall'): FarmState
  /** Lay (or, negative, lift) a disc of snow in garden meters; returns the snow now lying. */
  blowSnow(x: number, z: number, radius: number, amount?: number): { snowArea: number; frostedBlades: number }
  /** Stand an ice crystal ('ice') or snowball ('ball') on snow already lying there. */
  snowFeature(kind: 'ice' | 'ball', x: number, z: number): boolean
  /** Dig a pond of the given radius, which is what the water conditions want. */
  digPond(x: number, z: number, radius: number): FarmState
  /**
   * Plant one seed, through the same rules the shed uses, and report the
   * placement failure rather than doing nothing silently. A lily pad needs
   * visible pond water, so this is normally `digPond` then `pourAt` first.
   */
  plant(species: string, x: number, z: number): PlantHarnessResult
  /**
   * Grow what has been planted, answering each care marker on the way. A lily
   * pauses for a drink and a pinch, so time alone will not mature it.
   */
  growPlants(steps?: number, secondsPerStep?: number): PlantHarnessResult
  /** Run the progression tick `steps` times, optionally with a time jump. */
  advance(steps?: number, secondsPerStep?: number): AnimalConditionReport
  /** Forget everything: no grass, no pond, every animal back to the carnival. */
  resetConditions(): void
  /** Where each animal is, and what it looks like right now. */
  animalReport(): Record<string, unknown>[]
  /** Frame a species closely, for inspecting eyes and other small details. */
  focusSpecies(species: string, height?: number): void
  /** Current earned progression and next expansion milestone. */
  progression(): { readonly points: number; readonly level: number; readonly pointsToNextLevel: number }
  /** Drawn and tracked animal counts: `outside` have a model, `drawn` are on screen right now. */
  rendering(): { readonly population: number; readonly outside: number; readonly drawn: number; readonly crowdFixtures: number; readonly houseRoom: number; readonly houseUsed: number }
  /** Every placed house with its residents, split into indoors and out. */
  houses(): readonly Record<string, unknown>[]
  /** Advance the herd and garden progression without simulating browser time. */
  simulate(seconds: number, steps?: number): AnimalConditionReport
  /** Stand n real animal models on the lawn, render once, and report draw calls and triangles. The fixtures stay until clearCrowd. */
  crowdStressTest(count?: number): Promise<{ readonly count: number; readonly renderCalls: number; readonly triangles: number }>
  /** One-line usage for every harness command, so agents stop rediscovering this surface. */
  help(): Record<string, string>
  /**
   * Fill the live crowd with deterministic fixtures that stay up until cleared.
   * Unlike crowdStressTest (one render, then restore), this keeps the load on
   * screen so scripted ramps can sample sustained frame times.
   */
  setCrowd(count?: number): Promise<{ readonly count: number }>
  /** Remove live crowd fixtures and restore the real herd. */
  clearCrowd(): { readonly count: number }

  /** Snapshot the current terrain, water and active parcel dimensions. */
  gardenReport(): { readonly bounds: { readonly halfWidth: number; readonly halfDepth: number }; readonly terrain: { readonly cols: number; readonly rows: number; readonly originX: number; readonly originZ: number }; readonly water: { readonly cols: number; readonly rows: number; readonly originX: number; readonly originZ: number } }
  /** Reveal parcels on demand so expansion-only visuals can be reviewed. */
  expandFarm(level: number): number
  /** Begin a real-time packing/reveal sequence rather than fast-forwarding it. */
  expandOnce(): unknown
  carnivalReport(): unknown
  /** The arcade store's build: null before the model loads, else started/finished. */
  shopBuild(): ShopBuildReport | null
  /** Predator and prey: what the owls are doing, and how many chickens have been eaten. */
  predation(): { readonly eaten: Readonly<Record<string, number>>; readonly owls: ReturnType<typeof owlHunt.report>['owls']; readonly snakes: ReturnType<typeof snakeHunt.report>['snakes']; readonly oaks: number; readonly flock: number }
  /** Freeze or release the day clock. */
  holdTime(hold: boolean): void
  /** The test scenarios you can jump into, by id. Nothing here ships. */
  scenarios(): Record<string, string>
  /** Apply a scenario to the running game, e.g. `runScenario('owl/hunt-now')`. */
  runScenario(name: string): Promise<string>
  /** Set every owl's helium, 0..1, to test the deflate-and-pop without a two-minute wait. */
  setOwlHelium(level: number): void
  /** Make the owls and snakes hunt as soon as they can, instead of waiting out the cooldown. */
  hurryHunt(): void
  /** Step the owl and snake hunts and any pops forward without waiting on rendered frames. */
  stepHunt(seconds: number, secondsPerStep?: number): ReturnType<typeof owlHunt.report>['owls']
  /** Add a tracked animal at a rung of the ladder, standing at its farm spawn; returns its id. */
  addAnimal(species: string, stage?: number): string | null
  /** Credit chickens as already eaten, to reach the stay condition without a long night. */
  feedOwl(count: number): Readonly<Record<string, number>>
  /** Credit mice as already eaten by snakes, to reach the snake's stay condition without a long hunt. */
  feedSnake(count: number): Readonly<Record<string, number>>
  /** What the topmost visible surfaces at a garden point are, for finding stray planes. */
  probeGround(x: number, z: number): readonly { readonly name: string; readonly y: number; readonly color: string | null }[]
  /**
   * Every surface a screen pixel looks through, nearest first. Where
   * `probeGround` answers "what is under this point", this answers "what am I
   * actually looking at" for a declared-fine visual bug.
   */
  probeView(screenX: number, screenY: number): readonly { readonly distance: number; readonly name: string; readonly y: number; readonly color: string | null }[]
  /**
   * Frame a spot on the ground, for inspecting a habitat rather than an animal
   * — a pond and the lily pads planted in it, say.
   */
  focusPoint(x: number, z: number, height?: number): void
  /**
   * Frame a point from any side, for model review. `azimuthDegrees` walks round the
   * target (0 looks along -z), `elevationDegrees` is the angle above the ground
   * (the game's own view is steep; 15-20 reads a pose from the side).
   */
  frameAngle(x: number, z: number, height: number, azimuthDegrees: number, elevationDegrees: number): void
  /** Camera pose and tour state, for verifying framing without screenshots. */
  camera(): CameraDebugReport
  /** Advance the cinematic tour by `seconds` of simulated time, no waiting. */
  advanceTour(seconds: number): CameraDebugReport
  /** Start the cinematic tour on a fixed seed so a review pass is repeatable. */
  startTour(seed?: number): boolean
  /** Leave the tour; `restore` puts back the framing it interrupted. */
  endTour(restore?: boolean): void
  /** Snap the farm camera back to its opening shot. */
  resetCamera(): void
  /** Put coins in the wallet without farming for them, so the shop can be driven. */
  grantCoins(amount: number): number
  /** Award progression points outright, e.g. 500 reaches farmer level 10. */
  grantPoints(points: number): { points: number; level: number }
  /** Put `count` seeds of every plant in the shed. */
  grantSeeds(count: number): void
  /** Open the storefront screen without walking up to the building. */
  shop(): void
  /** Open the shed inventory without clicking the 3D shed. */
  shed(): void
  /** Open the farm-post inbox without clicking the balloon. */
  inbox(): unknown
  /** Balloon radial nav state, for verifying quadrants without pointer math. */
  balloon(): unknown
  /** Open the player panel without clicking the balloon. */
  player(): unknown
  /** Buy one prop from the shared wallet. Skips the farmer-level gate, like grantCoins skips earning. */
  buy(id: string): unknown
  /** Buy a shop upgrade ('tall-grass' | 'land-deed') through the same rules as the Upgrades tab. */
  buyUpgrade(id: string): { readonly ok: boolean; readonly text: string }
  /** Upgrades owned, farmer level, and what the shop would charge for each next one. */
  upgrades(): Record<string, unknown>
  /** Hand out progression points without playing for them, to reach a farmer level. */
  awardPoints(points: number): { readonly points: number; readonly level: number }
  /** Step the brush forward without waiting on rendered frames, for holding the seeder in a headless check. */
  stepTools(seconds: number, secondsPerStep?: number): void
  /** Press E: swap the seeder between the blue short pack and the green tall pack. */
  swapPack(): string
  propCounts(): Record<string, number>
  placeProp(id: string, cellX: number, cellZ: number, rotation?: number): unknown
  placeFence(fromX: number, fromZ: number, toX: number, toZ: number): unknown
  propReport(): unknown
  /** Hand-tool pick-up at a client point; returns the prop returned to the box. */
  pickUpProp(clientX: number, clientY: number): string | null
}

/** Where the farm camera is pointing, and what the tour is doing with it. */
interface CameraDebugReport {
  readonly target: { readonly x: number; readonly y: number; readonly z: number }
  readonly position: { readonly x: number; readonly y: number; readonly z: number }
  readonly viewHeight: number
  readonly tour: {
    readonly active: boolean
    readonly seed: number
    readonly view: 'vista' | 'subject' | null
    readonly subject: string | null
  }
}

/** What a harness planting attempt did, and what the farm now counts. */
interface PlantHarnessResult {
  readonly ok: boolean
  readonly failure: string | null
  /** Mature plants per species, i.e. what a `plantCount` condition reads. */
  readonly mature: Readonly<Record<string, number>>
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
    const record = progress.animal(animal.instanceId)
    if (!record) continue
    species[animal.instanceId] = {
      stage: record.stage,
      appearance: record.appearance,
      heartEyes: animal.heartEyeCount > 0,
      isCaptured: animal.isCaptured,
      invited: record.invited,
      position: { x: +animal.root.position.x.toFixed(2), z: +animal.root.position.z.toFixed(2) },
      conditions: progress.statusOf(animal.instanceId),
    }
  }
  return { farm, species }
}

interface GardenFrameTiming {
  readonly frameNumber: number
  readonly intervalMs: number
  readonly workMs: number
  readonly fairgroundMs: number
  readonly expansionBoundsMs: number
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
  readonly expansionBoundsMs: { readonly p95: number; readonly max: number }
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
let performanceFrameNumber = 0
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
    expansionBoundsMs: summarizeTail(get('expansionBoundsMs')),
    animalsMs: summarizeTail(get('animalsMs')),
    toolsMs: summarizeTail(get('toolsMs')),
    otherUpdateMs: summarizeTail(get('otherUpdateMs')),
    sceneRenderMs: summarizeTail(get('sceneRenderMs')),
    overlayRenderMs: summarizeTail(get('overlayRenderMs')),
  }
}

if (__GARDEN_DEBUG__ && gardenDebugMode) {
  const cameraReport = (): CameraDebugReport => ({
    target: { x: +cameraTarget.x.toFixed(3), y: +cameraTarget.y.toFixed(3), z: +cameraTarget.z.toFixed(3) },
    position: { x: +camera.position.x.toFixed(3), y: +camera.position.y.toFixed(3), z: +camera.position.z.toFixed(3) },
    viewHeight: +(viewHalfHeight * 2).toFixed(3),
    tour: {
      active: cameraTour !== null,
      seed: cameraTourSeed,
      view: cameraTour?.view ?? null,
      subject: cameraTour?.subjectId ?? null,
    },
  })
  let scenarioList: Record<string, string> = {}
  void import('../dev/scenarios/index').then((module) => { scenarioList = module.listScenarios() })
  const debugHarness: GardenDebugHarness = {
    enabled: true,
    state: () => ({
      menuOpen: menu.isOpen,
      journalOpen: journal.isOpen,
      shopOpen: shop.isOpen,
      shedOpen: shed.isOpen,
      placing: gardenProps?.placingId ?? null,
      performance: summarizeFrameTimings(),
      tools: gardenTools?.debugState() ?? null,
    }),
    focusGarden: focusCamera,
    intro: (seconds) => {
      if (!intro) startIntro()
      // A seek holds the frame for a screenshot; a bare call lets the film run on.
      intro?.setPaused(seconds !== undefined)
      if (seconds !== undefined && intro) {
        intro.seek(seconds)
        // Draw now: a hidden tab throttles animation frames, and a screenshot
        // taken before the next one would show the previous moment.
        intro.update(0)
        intro.render()
      }
      Object.defineProperty(window, '__introScenes', { value: intro?.scenes ?? null, configurable: true })
      return intro ? { loaded: intro.loaded, ...intro.describe() } : null
    },
    openMenu: () => menu.open(),
    closeMenu: () => menu.close(),
    openJournal: () => journal.open(),
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
      clearCrowdFixtures()
      refreshAnimalVisibility(performance.now() / 1000, true)
    },
    waterSummary: () => gardenWater?.summary() ?? null,
    selectTool: (tool) => selectGardenTool(tool),
    clock: () => ({ timeOfDay: dayNightClock.timeOfDay, phase: phaseOf(dayNightClock.timeOfDay), date: formatCalendarDate(calendarOf(dayNightClock.elapsedDays)), elapsedDays: dayNightClock.elapsedDays }),
    setTimeOfDay: (time) => { setTimeOfDay(dayNightClock, time) },
    skipToMorning: () => { skipToNext(dayNightClock, 0.32) },
    skipToNight: () => { skipToNext(dayNightClock, 0) },
    skipDays: (days) => { dayNightClock.elapsedDays += Math.max(0, Math.floor(days)) },
    projectGardenPoint: (x, z) => {
      if (!gardenTerrain) return null
      const rect = gameCanvas.getBoundingClientRect()
      const projected = new THREE.Vector3(x, GARDEN_LAWN_Y + gardenTerrain.heightAt(x, z), z).project(camera)
      return {
        x: rect.left + (projected.x + 1) * rect.width / 2,
        y: rect.top + (1 - projected.y) * rect.height / 2,
      }
    },
    farmState: () => measureFarm(),
    conditions: () => reportConditions(),
    setStage: (species, stage) => {
      const target = Math.max(0, Math.min(4, Math.floor(stage))) as 0 | 1 | 2 | 3 | 4
      const animal = animals.find((entry) => entry.id === species || entry.instanceId === species)
      if (!animal) return reportConditions()
      focusedAnimalId = animal.instanceId
  // Resetting the stage still replays the model's capture transition.
      const id = animal.instanceId
      handleAnimalLifeEvents(progress.setStage(id, target))
      animal.stage = target
      animal.setDetailedVisible(target > 0)
      // One more tick so a settled animal is reflected in the resident set the
      // next species is judged against.
      refreshAnimalVisibility(performance.now() / 1000, true)
      return reportConditions()
    },
    sowGrass: (x, z, radius, pack) => {
      gardenTools?.sowGrassDisc(x, z, radius, pack ?? gardenTools.grassPack)
      remeasureMeadow()
      return measureFarm()
    },
    snowFeature: (kind, x, z) => gardenTools?.placeSnowFeature(kind, x, z) ?? false,
    blowSnow: (x, z, radius, amount) => {
      gardenTools?.blowSnowDisc(x, z, radius, amount ?? 1)
      const tools = gardenTools?.debugState()
      return { snowArea: tools?.snowArea ?? 0, frostedBlades: tools?.frostedBlades ?? 0 }
    },
    digPond: (x, z, radius) => {
      gardenTools?.digBasin(x, z, radius, -1.1)
      return measureFarm()
    },
    plant: (species, x, z) => {
      const simulation = gardenPlants?.simulation
      if (!simulation) return { ok: false, failure: 'no-plant-system', mature: {} }
      const id = species as PlantId
      const surface = plantSurfaceAt(x, z)
      const result = simulation.placementResult(id, x, z, surface)
      // Report the reason rather than planting nothing: a rejected seed is the
      // single hardest thing to debug through a screenshot.
      if (!result.valid) return { ok: false, failure: result.failure, mature: maturePlantCounts() }
      const planted = simulation.plant(id, x, z, surface)
      return { ok: planted !== null, failure: planted ? null : 'rejected', mature: maturePlantCounts() }
    },
    growPlants: (steps = 90, secondsPerStep = 1) => {
      const simulation = gardenPlants?.simulation
      if (!simulation) return { ok: false, failure: 'no-plant-system', mature: {} }
      for (let step = 0; step < steps; step += 1) {
        simulation.tick(secondsPerStep)
        for (const plant of simulation.plants) {
          if (plant.careNeeded) simulation.resolveCare(plant.instanceId, plant.careNeeded)
        }
      }
      return { ok: true, failure: null, mature: maturePlantCounts() }
    },
    advance: (steps = 1, secondsPerStep = 1 / 30) => {
      for (let step = 0; step < steps; step += 1) {
        const events = progress.tick(animalLifeSnapshot(), secondsPerStep)
        handleAnimalLifeEvents(events)
      }
      return reportConditions()
    },
    resetConditions: () => {
      gardenTools?.clearGrass()
      remeasureMeadow()
      upgrades.reset()
      gardenTools?.setGrassPack('short')
      syncGrassPack()
      progress.reset()
      progression.reset()
      accomplishments.reset()
      knownMaturePlants.clear()
      for (const animal of animals) animal.dispose()
      animals.length = 0
      for (const pop of popsInFlight) {
        pop.burst.dispose()
        pop.animal.dispose()
      }
      popsInFlight.length = 0
      predationLedger.clear()
      owlHunt.reset()
      snakeHunt.reset()
      bolting.clear()
      hidingUntil.clear()
      panicking.clear()
      animalById.clear()
      for (const burst of sellBursts) {
        scene.remove(burst.root)
        burst.dispose()
      }
      sellBursts.length = 0
      clearCrowdFixtures()
      focusedAnimalId = null
      goingIn.clear()
      newbornUntil.clear()
      lastHouseOf.clear()
      outdoorRoster = new Set()
      lastRosterAt = -Infinity
      lastVisibilityRefreshAt = 0
      animalNames.clear()
      farmHomes.clear()
      void Promise.all(progress.all().map((record) => createAnimalInstance(record))).then((created) => {
        for (const animal of created) {
          farmHomes.set(animal.instanceId, { parent: animal.root.parent ?? fairground.root, position: animal.root.position.clone() })
        }
      })
      measureFarm()
      reportConditions()
    },
    animalReport: () => animals.filter((animal) => !animal.isSold).map((animal) => ({
      id: animal.instanceId,
      species: animal.id,
      name: animalNames.get(animal.instanceId),
      stage: animal.stage,
      appearance: animal.appearance,
      heartEyes: animal.heartEyeCount > 0,
      heartCount: animal.heartEyeCount,
      x: +animal.root.position.x.toFixed(2),
      z: +animal.root.position.z.toFixed(2),
      loose: isLoose(animal.instanceId),
      atFarm: animal.isAtFarm,
      residencyPending: animal.isResidencyPending,
      sleeping: animal.isSleeping,
      bed: sleepBeds.get(animal.instanceId) ?? null,
    })),
    focusSpecies: (species, height = 4.5) => {
      const animal = animals.find((entry) => entry.id === species || entry.instanceId === species)
      if (!animal) return
      frameAt(animal.root.position.clone().setY(GARDEN_LAWN_Y + 1.1), height)
    },
    focusPoint: (x, z, height = 14) => {
      frameAt(new THREE.Vector3(x, GARDEN_LAWN_Y + 1.1, z), height)
    },
    frameAngle: (x, z, height, azimuthDegrees, elevationDegrees) => {
      const target = new THREE.Vector3(x, GARDEN_LAWN_Y + 1.1, z)
      const azimuth = THREE.MathUtils.degToRad(azimuthDegrees)
      const elevation = THREE.MathUtils.degToRad(elevationDegrees)
      const distance = initialOffset.length()
      const offset = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ).multiplyScalar(distance)
      cameraTarget.copy(target)
      viewHalfHeight = height / 2
      camera.position.copy(cameraTarget).add(offset)
      viewDirection.copy(offset).normalize()
      cameraDistance = distance
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld()
      updateCameraProjection()
    },
    progression: () => ({ points: progression.points, level: progression.level, pointsToNextLevel: progression.pointsToNextLevel }),
    rendering: () => {
      const housing = progress.housing()
      return {
        population: progress.all().filter((record) => record.stage > 0).length,
        outside: animals.filter((animal) => !animal.isSold && (progress.animal(animal.instanceId)?.stage ?? 0) > 0).length,
        drawn: shownAnimalCount,
        crowdFixtures: crowdFixtures.length,
        houseRoom: housing.capacity,
        houseUsed: housing.used,
      }
    },
    houses: () => houseSpots.map((house) => {
      return { ...house, residents: residentsOf({ id: house.prop, siteId: house.id }) }
    }),
    crowdStressTest: async (requestedCount = OUTDOOR_LIMITS.total) => {
      const count = await setCrowdFixtures(requestedCount)
      focusCamera()
      const previousAutoReset = renderer.info.autoReset
      try {
        renderer.info.autoReset = true
        renderer.info.reset()
        renderer.render(scene, camera)
        return { count, renderCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
      } finally {
        renderer.info.autoReset = previousAutoReset
        renderer.info.reset()
      }
    },
    setCrowd: async (requestedCount = OUTDOOR_LIMITS.total) => {
      const count = await setCrowdFixtures(requestedCount)
      focusCamera()
      return { count }
    },
    clearCrowd: () => {
      clearCrowdFixtures()
      return { count: 0 }
    },
    help: () => ({
      state: 'Snapshot: mode, menu, camera, tools, water, herd summary.',
      help: 'This table: one-line usage for every harness command.',
      focusGarden: 'Frame the whole garden. Run before pointer scenarios.',
      focusPoint: 'focusPoint(x, z, height?) — frame a habitat, e.g. a pond.',
      focusSpecies: 'focusSpecies(species, height?) — close-up for model review.',
      frameAngle: 'frameAngle(x, z, height, azimuthDeg, elevationDeg) — low side-on view; scripts/angle-sheet.mjs uses it.',
      resetCamera: 'Back to the opening shot.',
      'openMenu / closeMenu / openJournal': 'Drive the menu without clicks.',
      layout: 'Every UI panel rect — use instead of screenshots for layout checks.',
      camera: 'Camera pose + tour state. advanceTour(seconds) steps the cinematic.',
      'startTour / endTour': 'Deterministic tour on a fixed seed for review passes.',
      farmState: 'Measured m2: tall grass, water, flat grass, plant counts.',
      conditions: 'Every species ladder rung + live numbers.',
      setStage: 'setStage(species, 0-4) — force a rung and play its transition.',
      'advance / simulate': 'Tick progression without waiting (advance) or without browser time (simulate).',
      resetConditions: 'Forget everything: clears garden, herd, fixtures, progression, upgrades.',
      'upgrades / buyUpgrade / awardPoints / swapPack / stepTools': 'Farmer level, shop upgrades (tall grass pack, land deeds), and the E pack swap.',
      'sowGrass / digPond / digAt / pourAt / clearGarden': 'Terrain + water fixtures in garden meters.',
      blowSnow: 'blowSnow(x, z, radius, amount?) — lay a disc of snow (negative amount melts it).',
      'plant / growPlants': 'plant(species, x, z) then growPlants() to mature.',
      'waterSummary / gardenReport / probeGround / probeView': 'Water, terrain/parcel dims, surface inspector.',
      expandFarm: 'expandFarm(level) — reveal parcels without earning them.',
      expandOnce: 'expandOnce() — watch one real-time carnival pack-up and land reveal.',
      carnivalReport: 'carnivalReport() — inspect close attraction identities and migration phases.',
      progression: 'Points, level, next expansion milestone.',
      'selectTool / projectGardenPoint': 'Arm a tool; project garden meters to canvas pixels for pointer tests.',
      'animalReport / rendering': 'Herd list; population, animals outside, models drawn, beds.',
      houses: 'Every placed house with beds used and residents in or out, by species.',
      'grantPoints / grantSeeds': 'Jump progression level / stock the seed shed without playing.',
      'grantCoins / shop / buy / placeProp / placeFence / propCounts': 'Wallet + prop placement without UI clicks.',
      crowdStressTest: 'crowdStressTest(n) — stand n real animal models up and render once; returns calls/tris.',
      'setCrowd / clearCrowd': 'setCrowd(n) keeps n real animal models live for sustained ramps; clearCrowd removes them.',
      'scenarios / runScenario / holdTime': 'scenarios() lists saved test states; runScenario(id) jumps into one; ?scenario=id does it on load; holdTime(bool) freezes the clock.',
      performanceSamples: 'Per-frame work/interval splits. Basis for every perf scenario; see TESTING.md.',
    }),
    simulate: (seconds, steps = Math.max(1, Math.ceil(seconds * 4))) => {
      if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(steps) || steps < 1) return reportConditions()
      const dt = seconds / Math.floor(steps)
      for (let step = 0; step < Math.floor(steps); step += 1) {
        const events = progress.tick(animalLifeSnapshot(), dt)
        handleAnimalLifeEvents(events)
        updateHousing(performance.now() / 1000)
      }
      return reportConditions()
    },
    gardenReport: () => ({
      bounds: { ...currentGardenBounds },
      terrain: { cols: gardenTerrain?.gridCols ?? 0, rows: gardenTerrain?.gridRows ?? 0, originX: gardenTerrain?.originX ?? 0, originZ: gardenTerrain?.originZ ?? 0 },
      water: { cols: gardenWater?.gridCols ?? 0, rows: gardenWater?.gridRows ?? 0, originX: gardenWater?.originX ?? 0, originZ: gardenWater?.originZ ?? 0 },
    }),
    expandOnce: () => fairground.farmExpansion?.expand() ?? null,
    carnivalReport: () => fairground.carnivalReport?.() ?? [],
    shopBuild: () => gardenProps?.shopBuildState() ?? null,
    predation: () => ({
      eaten: predationLedger.totals,
      owls: owlHunt.report().owls,
      snakes: snakeHunt.report().snakes,
      oaks: gardenProps?.propCounts().oak ?? 0,
      flock: animals.filter((animal) => animal.id === 'chicken' && !animal.isSold && (progress.animal(animal.instanceId)?.stage ?? 0) >= 3).length,
    }),
    hurryHunt: () => {
      owlHunt.hurry()
      snakeHunt.hurry()
    },
    setOwlHelium: (level) => owlHunt.setHelium(level),
    holdTime: (hold) => { clockHeld = hold },
    scenarios: () => scenarioList,
    runScenario: async (name) => (await import('../dev/scenarios/index')).runScenario(name, debugHarness),
    stepHunt: (seconds, secondsPerStep = 1 / 30) => {
      const steps = Math.max(0, Math.round(seconds / secondsPerStep))
      // Mirror the frame loop, collisions included: a hunt that only works
      // without them (animals passing through each other) is not a hunt.
      let simulatedSeconds = performance.now() / 1000
      for (let step = 0; step < steps; step += 1) {
        simulatedSeconds += secondsPerStep
        animals.forEach((animal) => animal.update(secondsPerStep))
        collideAnimals(simulatedSeconds)
        updateOwlHunt(secondsPerStep)
        updateSnakeHunt(secondsPerStep)
      }
      return owlHunt.report().owls
    },
    addAnimal: (species, stage = 3) => {
      const record = progress.add(species, Math.max(0, Math.min(4, Math.floor(stage))) as AnimalStage)
      if (!record) return null
      // Well inside the fence, so a settled animal is actually at the farm and not queued at the gate.
      const slot = harnessSpawnCount++ % 8
      void createAnimalInstance(record, { x: -3.5 + (slot % 4) * 1.6, z: 2.6 + Math.floor(slot / 4) * 1.5 })
      return record.id
    },
    feedOwl: (count) => {
      for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) predationLedger.record('chicken')
      return predationLedger.totals
    },
    feedSnake: (count) => {
      for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) predationLedger.record('mouse')
      return predationLedger.totals
    },
    expandFarm: (level) => {
      const expansion = fairground.farmExpansion
      if (!expansion) return 0
      const target = Math.max(0, Math.min(FARM_EXPANSION_CONFIG.maximumLevel, Math.floor(level)))
      let guard = 0
      while (expansion.state.level < target && guard < FARM_EXPANSION_CONFIG.maximumLevel * 3 + 10) {
        expansion.expand()
        for (let step = 0; step < 160; step += 1) fairground.update(.5, dayNightClock.elapsedDays)
        guard += 1
      }
      upgrades.set('land-deed', expansion.state.level)
      currentGardenBounds = expansion.state.bounds
      gardenTerrain?.syncBounds()
      gardenTerrain?.applyToMeshes()
      gardenWater?.resize(gardenTerrain?.gridCols ?? 0, gardenTerrain?.gridRows ?? 0)
      gardenWater?.markTerrainChanged()
      gardenWaterMesh?.markDirty()
      gardenTools?.syncSurfaceGeometry()
      // Attribute update ranges describe pending GPU uploads, not just CPU
      // writes. Fast-forwarding many steps without a render must commit the
      // whole final mask, otherwise the GPU keeps the original starter patch.
      fairground.refreshLandReveal?.()
      return expansion.state.level
    },
    probeGround: (x, z) => {
      const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0))
      // Sprites need a camera to raycast against; the probe only wants meshes
      // anyway, but the raycaster walks the whole scene to find them.
      raycaster.camera = camera
      const surfaces: { name: string; y: number; color: string | null }[] = []
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (surfaces.length >= 6) break
        const object = hit.object
        if (!object.visible || !(object instanceof THREE.Mesh)) continue
        const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial
        surfaces.push({ name: object.name || '(unnamed)', y: +hit.point.y.toFixed(3), color: material?.color ? `#${material.color.getHexString()}` : null })
      }
      return surfaces
    },
    probeView: (screenX, screenY) => {
      const rect = gameCanvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return []
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(
        ((screenX - rect.left) / rect.width) * 2 - 1,
        -((screenY - rect.top) / rect.height) * 2 + 1,
      ), camera)
      raycaster.camera = camera
      const surfaces: { distance: number; name: string; y: number; color: string | null }[] = []
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (surfaces.length >= 6) break
        const object = hit.object
        if (!object.visible || !(object instanceof THREE.Mesh)) continue
        const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial
        surfaces.push({
          distance: +hit.distance.toFixed(2),
          name: object.name || `unnamed ${material?.color ? `#${material.color.getHexString()}` : ''}`,
          y: +hit.point.y.toFixed(3),
          color: material?.color ? `#${material.color.getHexString()}` : null,
        })
      }
      return surfaces
    },
    camera: () => cameraReport(),
    advanceTour: (seconds) => {
      // Fixed steps so a review pass replays identically; the cap keeps a typo
      // from locking the tab up.
      const step = 1 / 60
      const steps = Math.max(0, Math.min(60 * 120, Math.round(seconds / step)))
      for (let index = 0; index < steps; index += 1) updateCameraTour(step)
      return cameraReport()
    },
    startTour: (seed) => beginCameraTour(seed),
    endTour: (restore = true) => { endCameraTour(restore) },
    resetCamera: () => { resetCameraToStart() },
    grantPoints: (points) => {
      progression.awardPoints(`debug-grant-${progression.points}-${Math.floor(points)}`, points)
      return { points: progression.points, level: progression.level }
    },
    grantSeeds: (count) => {
      for (const plant of PLANT_CATALOG) gardenPlants?.simulation.addSeeds(plant.id, count)
      shedDom.refresh()
      shop.refresh()
    },
    grantCoins: (amount) => {
      const balance = wallet.credit(amount)
      salePanel.setWallet(balance)
      shedDom.refresh()
      shop.refresh()
      return balance
    },
    shop: () => {
      shop.setOpen(true)
      syncFarmChrome()
      return { open: shop.isOpen }
    },
    shed: () => {
      shed.open()
      return shed.describe?.() ?? null
    },
    balloon: () => balloon.describe?.() ?? null,
    animalCard: (id, preview?: { stage?: number; sellable?: boolean }) => {
      const animal = animalById.get(id) ?? animals.find((entry) => entry.id === id)
      if (!animal) return null
      openAnimalCardFor(animal, preview)
      return animalCard.describe?.() ?? null
    },
    plantCard: (instanceId) => {
      const plant = gardenPlants?.simulation.plants.find((entry) => instanceId === undefined || entry.instanceId === instanceId)
      if (!plant) return null
      openPlantCardFor(plant)
      return plantCard.describe?.() ?? null
    },
    player: () => {
      playerDom.refresh(playerDomStats())
      playerDom.setOpen(true)
      syncFarmChrome()
      return { open: playerDom.isOpen }
    },
    inbox: () => {
      notificationPanel.markAllRead()
      notificationDom.refresh(notificationPanel.getLetters(), notificationPanel.nowSeconds())
      notificationDom.setOpen(true, balloonInboxAnchor())
      syncFarmChrome()
      return { open: notificationDom.isOpen }
    },
    buyUpgrade: (id) => {
      if (!(id in UPGRADE_CATALOG)) return { ok: false, text: `Unknown upgrade ${id}.` }
      return buyUpgrade(id as UpgradeId)
    },
    upgrades: () => ({
      farmerLevel: progression.level,
      pack: gardenTools?.grassPack ?? 'short',
      parcels: fairground.farmExpansion?.state.level ?? 0,
      quotes: Object.fromEntries((Object.keys(UPGRADE_CATALOG) as UpgradeId[]).map((id) => [id, upgradeQuote(id, upgrades, progression.level)])),
      propLevels: Object.fromEntries((Object.keys(PROP_CATALOG) as PropId[]).map((id) => [id, propUnlockLevel(id)])),
    }),
    awardPoints: (points) => {
      progression.awardPoints(`debug-${progression.points}-${points}`, Math.max(0, Math.floor(points)))
      refreshShopUi()
      return { points: progression.points, level: progression.level }
    },
    stepTools: (seconds, secondsPerStep = 0.05) => {
      const steps = Math.max(0, Math.min(2400, Math.round(seconds / secondsPerStep)))
      for (let index = 0; index < steps; index += 1) gardenTools?.update(secondsPerStep)
    },
    swapPack: () => {
      swapGrassPack()
      return gardenTools?.grassPack ?? 'short'
    },
    buy: (id) => {
      if (!gardenProps) return null
      const result = purchaseProp(wallet, gardenProps.inventory, id as PropId)
      salePanel.setWallet(wallet.balance)
      shedDom.refresh()
      shop.refresh()
      return result
    },
    propCounts: () => (gardenProps ? { ...gardenProps.inventory.counts } : {}),
    placeProp: (id, cellX, cellZ, rotation = 0) => gardenProps?.placeProp(id as PropId, cellX, cellZ, rotation) ?? null,
    placeFence: (fromX, fromZ, toX, toZ) => gardenProps?.placeFence(fromX, fromZ, toX, toZ) ?? null,
    propReport: () => gardenProps?.report() ?? null,
    notify: (kind, subject) => {
      if (kind === 'plant') notificationPanel.notifyPlantGrown(String(subject ?? 'Clover'))
      else notificationPanel.notifyMilestone(kind, String(subject ?? 'Pig'))
    },
    pickUpProp: (clientX, clientY) => gardenProps?.pickUpAt(clientX, clientY) ?? null,
    scene,
    uiScene: ui.scene,
    performanceSamples: () => frameTimingSamples,
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
  // ?scenario=owl/hunt-now jumps straight into a saved test state on load.
  const requestedScenario = pageParams.get('scenario')
  if (requestedScenario) {
    void debugHarness.runScenario(requestedScenario).then(
      (id) => console.info(`[Animal Balloon Farm] scenario ready: ${id}`),
      (error) => console.error('[Animal Balloon Farm] scenario failed', error),
    )
  }
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
  const target = menu.isOpen ? 1 : 0
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
  fpsCounter.frame(now)
  const intervalMs = previousFrameTimestamp === null ? 0 : now - previousFrameTimestamp
  previousFrameTimestamp = now
  const timingEnabled = __GARDEN_DEBUG__ && gardenDebugMode
  const workStartedAt = timingEnabled ? performance.now() : 0
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  if (intro) {
    intro.update(delta)
    intro.render()
    if (intro.done) finishIntro()
    requestAnimationFrame(frame)
    return
  }
  let stageStartedAt = workStartedAt
  removePreviousCameraShake()
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
  updateMenuDrift(delta, now / 1000)
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
  refreshAnimalVisibility(now / 1000)
  refreshHover(now / 1000, delta)
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
  if (gardenTools && gardenTools.snowRevision !== lastSnowRevision) {
    lastSnowRevision = gardenTools.snowRevision
    gardenWaterMesh?.markDirty()
  }
  if (gardenWaterMesh && (gardenWater?.dirty || gardenWaterMesh.dirty)) {
    gardenWaterMesh.update(now * 0.001)
  }
  if (fairground.farmExpansion) {
    if (expansionLevel > lastExpansionLevel) {
      lastExpansionLevel = expansionLevel
      expansionFeedbackSeconds = CAMERA_SHAKE_DURATION
      expansionFeedbackStrength = 1
    }
  }
  gardenPlants?.update(delta, !menu.isOpen && !journal.isOpen && !salePanel.isOpen)
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
  notificationPanel.setVisible(!menu.isOpen && !journal.isOpen && !salePanel.isOpen && !shop.isOpen && !shed.isOpen && !playerDom.isOpen)
  if (!gardenPlants?.selectedSpecies && !shed.isOpen) gardenTools?.setPlantingMode(false)
  if (!menu.isOpen && !journal.isOpen && !shop.isOpen && !shed.isOpen) refreshShopUi()
  shedDom.refresh()
  const toolsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  updateCameraPan(delta)
  applyExpansionCameraShake(delta, now / 1000)
  if (pointerWasSeen && !isOverGameHUD(pointerPosition.x, pointerPosition.y)) {
    if (!menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && plantingArmed()) gardenPlants?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y, button: 0 })
    gardenProps?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
    if (isWorldToolActive()) gardenTools?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
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
      frameNumber: ++performanceFrameNumber,
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
