import { createChapterFilmPlayer, type ChapterFilmPlayer } from './scene/chapter-film-player'
import './style.css'
import * as THREE from 'three'
import type { BalloonAnimal } from './animals/balloon-animal'
import { getAnimalSceneOptions, ANIMAL_CATALOG } from './animals/animal-catalog'
import { isHouse } from './game/animal-housing'
import { carnivalRing } from './game/animal-travel'
import { createHousing } from './scene/housing'
import type { Bed } from './game/sleep'
import { SIM_HZ, SIM_MAX_STEPS_PER_FRAME, createSimClock } from './game/sim-clock'
import { containsGardenPoint, createFairground, createSkyDome, GARDEN_BOUNDS, GARDEN_LAWN_Y } from './scene/fairground'
import { ANIMAL_LIFE_CONFIG, createAnimalLife, type AnimalLifeEvent } from './game/animal-life'
import { createProgressLedger } from './game/farm-progression'
import { buildAccomplishmentCatalog, createAccomplishmentTracker } from './game/accomplishments'
import {
  createUpgradeLedger,
  ownsGardenTool,
  purchasePropAtLevel,
  upgradeQuote,
  type UpgradeId,
} from './game/tool-unlocks'
import { createFarmMeasure } from './scene/farm-measure'
import { createFarmSave } from './game/farm-save'
import { createHerd } from './scene/herd'
import { createDeerRaids } from './scene/deer-raid'
import { createPlantRaids } from './scene/plant-raid'
import { createFarmLifecycle } from './scene/farm-lifecycle'
import { createHungerBubbles } from './scene/hunger-bubbles'
import { createHouseGoodsBadges } from './scene/house-goods-badges'
import { grazedness } from './game/food-cues'
import { createVisitorMotion } from './scene/visitor-motion'
import { createFarmModes } from './ui/farm-modes'
import { tourSubjectsOf } from './scene/tour-subjects'
import { animalDisplayName, plantDisplayName } from './game/display-names'
import { createFarmActions } from './ui/farm-actions'
import { PROP_CATALOG, type PropId } from './game/farm-props'
import { createGardenTools, ICE_SNOW_THRESHOLD, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { createGardenWaterField, WATER_MIN_RENDER_DEPTH } from './game/garden-water'
import { createGardenWaterMesh } from './scene/garden-water-mesh'
import { createGardenPlants, type GardenPlants } from './scene/garden-plants'
import { warmBurstLooks } from './scene/garden-bursts'
import { createGardenProps, type GardenProps, type PropSelection } from './scene/garden-props'
import { PLANT_CARE_KINDS, PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, SEED_PRICES, plantSpecies, type PlantId, type PlantSubstrate } from './game/plants'
import { createGreenThumb } from './game/plant-helpers'
import { createCareController, helperSeedPrice, helperShopCopy } from './care-controller'
import { STARTING_COINS, createWallet, generateAnimalNames, gardenPlantSaleValue } from './game/sales'
import { createTreasureLedger, purchaseTreasure, treasureEffects, TREASURE_CATALOG, type TreasureId } from './game/treasures'
import type { GardenToolId } from './scene/garden-tool-art'
import { createFarmCamera } from './scene/farm-camera'
import { createUILayer, type UIPanel } from './ui/ui-layer'
import { advanceClock, calendarOf, createDayNightClock, daylightAmount, phaseOf } from './game/day-night'
import { createAnimalShadows } from './animals/animal-shadows'
import { createDayNightRig } from './scene/day-night-rig'
import { createShadowRefresh } from './scene/shadow-refresh'
import { weekdayName } from './game/carnival-schedule'
import { shopSite } from './game/shop-site'
import { createClockCalendarHud } from './ui/clock-calendar-hud'
import { createPlantCard } from './ui/plant-card'
import { createJournalPanel } from './ui/journal-panel'
import { createJournalConditions } from './ui/journal-conditions'
import { createJournalDomPanel, type JournalDomPanel } from './ui/journal-dom'
import { createMenuDomPanel } from './ui/menu-dom'
import { createEscapeRouter, menuCloseLayer, menuOpenLayer } from './game/escape-router'
import { createOptionsDomPanel, type OptionsDomPanel } from './ui/options-dom'
import { createFpsCounter } from './ui/fps-counter'
import { createSettingsStore } from './game/settings'
import { createToolsHud } from './ui/tools-hud'
import { createBalloonPanel } from './ui/balloon-panel'
import { createPlayerDomPanel } from './ui/player-dom'
import { createSalePanel } from './ui/sale-panel'
import { createAnimalCard } from './ui/animal-card-dom'
import { createPropCardDom } from './ui/prop-card-dom'
import { formatCollected, goodsValue } from './game/house-goods'
import { warmAnimalLooks } from './animals/animal-warmup'
import { createSellBurst, warmSellBursts, type SellBurst } from './ui/sell-burst'
import { createPredation } from './scene/predation'
import { createShedPanel } from './ui/shed-panel'
import { createShedDomPanel, type ShedDomPanel } from './ui/shed-dom'
import { createTutorialDom } from './ui/tutorial-dom'
import { tutorialSeed, type TutorialStep } from './game/tutorial'
import { createLarderDom } from './ui/larder-dom'
import { CHAPTER_ORDER, chapterPages, createFarmChapters, type ChapterDef, type ChapterId, type ChapterSignals } from './game/farm-chapters'
import { measureHarmony } from './game/harmony'
import { FEED_CAPACITY, FEED_SACK_MEALS, FEED_SACK_PRICE } from './game/animal-diet'
import { createShopDomPanel, type ShopDomPanel } from './ui/shop-dom'
import { setCursor } from './ui/ui-cursor'
import { createHoverGlow } from './scene/hover-glow'
import { createFarmInput } from './input'
import { installGardenHarness } from './debug/garden-harness'
import {
  browserSaveStorage,
  createSaveStore,
  resolveStartup,
} from './game/save-game'
import { createNotificationPanel } from './ui/notification-panel'
import { createNotificationDomPanel } from './ui/notification-dom'
import { createIntroCutscene, type IntroCutscene } from './scene/intro-cutscene'
import { createToolUnlockCutscene, type ToolUnlockCutscene } from './scene/tool-unlock-cutscene'
import { toolUnlockFilmFor, type ChapterToolGift } from './game/tool-unlock-script'
import type { CutscenePlayer } from './scene/cutscene-kit'
import { GARDEN_TOOLS } from './scene/garden-tool-art'
import { createFrameTimer, createPerformanceOverlay } from './debug/frame-timing'
import { createFarmRenderer, precompile } from './render/backend'
import { createLoadingScreen } from './ui/loading-dom'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('Missing game canvas')
const loading = createLoadingScreen()
await loading.setStage('renderer')

// WebGPU by default, with an automatic WebGL fallback; `?renderer=webgl` forces WebGL.
// Top-level await is fine here: nothing below can run without a renderer.
const { renderer, backend: renderBackend } = await createFarmRenderer(canvas)
// A failed WebGPU start can leave the original canvas unusable, in which case the
// renderer brought its own; everything below uses the one actually drawn on.
const gameCanvas = renderer.domElement
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
document.documentElement.dataset.renderer = renderBackend

await loading.setStage('models')
const scene = new THREE.Scene()
scene.background = new THREE.Color('#c2d8cf')
scene.fog = new THREE.Fog('#c2d8cf', 185, 345)
const sky = createSkyDome()
scene.add(sky.mesh)

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
  menuDrifting: () => menu.isOpen,
  tourBlocked: () => menu.isOpen || journal.isOpen || salePanel.isOpen || shed.isOpen || shop.isOpen,
  tourSubjects: () => tourSubjectsOf(animals),
  onReframed: () => refreshAnimalVisibility(performance.now() / 1000, true),
  onTourStart: () => input.cancelDrag(),
  panLimits: () => carnivalRing(currentGardenBounds),
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
sunlight.shadow.mapSize.set(1024, 1024)
sunlight.shadow.camera.left = -48
sunlight.shadow.camera.right = 48
sunlight.shadow.camera.top = 48
sunlight.shadow.camera.bottom = -48
sunlight.shadow.camera.near = 0.5
sunlight.shadow.camera.far = 145
sunlight.shadow.bias = -0.00028
sunlight.shadow.normalBias = 0.025
sunlight.shadow.radius = 5
sunlight.target.position.set(0, 0, 0)
scene.add(sunlight, sunlight.target)
// Casters change only on edits, so the sun's shadow map is drawn on demand (see
// scene/shadow-refresh.ts) rather than on every frame.
const shadowRefresh = createShadowRefresh(sunlight)

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
const dayNightRig = createDayNightRig(scene, renderer, { sun: sunlight, ambient, fill, rim }, sky.colors)
// One instanced draw call of soft ground decals under every animal (animals stay out of the sun's shadow map).
const animalShadows = createAnimalShadows(scene, ANIMAL_LIFE_CONFIG.maximumPopulation + 16)
/** Herd plus harness crowd fixtures, so the perf gate counts the shadow draw as players get it. */
const refreshAnimalShadows = (): void => animalShadows.update([animals, crowdFixtures], daylightAmount(dayNightClock.timeOfDay))
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
let lastSnowRevision = -1
// Snow over water is ice; the pond surface asks the lawn how much snow lies on it.
gardenWaterMesh?.setIce(iceAt)
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
    onChange: () => {
      refreshShopUi()
      shadowRefresh.markDirty()
    },
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
/** Animals in the world that are not drawn right now: the mountain lion while it is inside a house. */
const hiddenAnimals = new Set<string>()
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
  crowdFixtures,
  hiddenAnimals,
})
await Promise.all(progress.all()
  .filter((record) => !savedIndoors.has(record.id))
  .map((record) => createAnimalInstance(record, savedPlaces.get(record.id), true)))
  const wallet = createWallet(STARTING_COINS)
/** Star gems: a second purse, filled only by the starhorn and spent on treasures at the shop. */
const gems = createWallet(0)
const treasures = createTreasureLedger()
/**
 * Push what the owned treasures give into the sim: food multipliers (Clover Charm,
 * Rain Barrel) and the starving leak rate (Helium Pump). The Golden Pail's goods
 * multiplier is read where goods are collected: `treasureEffects(treasures.owned()).goodsValueMultiplier`.
 */
function applyTreasureEffects(): void {
  const effects = treasureEffects(treasures.owned())
  progress.setFoodBoosts(effects.foodBoosts)
  progress.setStarveLeakFactor(effects.starveLeakFactor)
}
applyTreasureEffects()
/** Tools and land the shop has sold. Farmer level decides what it will sell next. */
const upgrades = createUpgradeLedger()
/** Green Thumb ribbons won in the care minigames, and the helpers they let you hire. */
const greenThumb = createGreenThumb()

// Individual residents and visitors are spawned from the pure animal-life records below.

// Farm homes are assigned as each independently tracked animal is created.







/** Adult residents: stage 3 up, not babies, not sold. What `residentCount` conditions and Harmony read. */
function adultResidents() {
  return progress.all().filter((entry) => entry.stage >= 3 && !entry.baby && !animalById.get(entry.id)?.isSold)
}

/** Adult residents per species, which is what a `residentCount` condition reads. */
function residentCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of adultResidents()) counts[entry.species] = (counts[entry.species] ?? 0) + 1
  return counts
}

/**
 * Residents per species, babies and animals indoors included: what "more than six"
 * means to the mountain lion (game/apex-raid.ts), and the journal's biggest-herd bar.
 */
function herdCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of progress.all()) {
    if (entry.stage < 3 || animalById.get(entry.id)?.isSold) continue
    counts[entry.species] = (counts[entry.species] ?? 0) + 1
  }
  return counts
}

/** Who counts toward the farm's Harmony score, with how well fed they are. */
function harmonyResidents(): readonly { readonly species: string; readonly fullness: number }[] {
  return adultResidents().map((entry) => ({ species: entry.species, fullness: entry.fullness }))
}

// ------------------------------------------------------------- chapters --
// Systems open one at a time (GAME_VISION.md). Until a chapter opens, its rules
// stay quiet: no starvation, no goods, no predators, no mythic guests.
const chapters = createFarmChapters()
/** Coins earned from collected goods, ever. Chapter 3 ends on it. */
let goodsCoinsTotal = loadedSave?.goodsCoins ?? 0
/** Game seconds since the last chapter check. */
let chapterClockSeconds = 0

function chapterSignals(): ChapterSignals {
  const farm = measureFarmForSim()
  const plants = gardenPlants?.simulation.plants ?? []
  return {
    grownSpecies: new Set(plants.filter((plant) => plant.mature).map((plant) => plant.species)).size,
    shortGrassArea: farm.shortGrassArea ?? 0,
    meadowArea: farm.meadowArea ?? 0,
    waterArea: farm.waterArea,
    residentSpecies: new Set(adultResidents().map((entry) => entry.species)),
    goodsCoins: goodsCoinsTotal,
    harmony: farm.harmony ?? 0,
    predatorLinks: measureHarmony(harmonyResidents()).activeLinks.length,
    day: Math.floor(dayNightClock.elapsedDays),
  }
}

/**
 * Push the open chapters' flags into the sim and the interface. Call at
 * startup, after a load and after chapters open. A system that is not open yet
 * is hidden outright, not shown locked: the player meets it with its chapter.
 */
function applyChapterFlags(): void {
  const flags = chapters.flags()
  progress.setRules({
    starvation: flags.starvation,
    goods: flags.goods,
    discoverable: (species) => (species === 'owl' || species === 'snake' ? flags.predators : species === 'starhorn' ? flags.mythic : true),
  })
  // DOM panels built elsewhere read these classes (animal-card-dom.css, prop-card-dom.css).
  document.body.classList.toggle('chapter-hunger', flags.hungerShown)
  document.body.classList.toggle('chapter-goods', flags.goods)
  hungerBubbles.setEnabled(flags.hungerShown)
  syncOwnedTools()
  shop.refresh()
}

function announceChapter(def: ChapterDef): void {
  startChapterFilm(def.id)
  notificationPanel.notifyAccomplishment(`Chapter ${def.number}: ${def.title}`, def.letter)
  applyChapterFlags()
}

/** Once a second of game time: open any chapter whose goal the farm has met. */
function tickChapters(): void {
  for (const def of chapters.tick(chapterSignals())) announceChapter(def)
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
  // Lazy: `chapters` and `chapterSignals` are only read when the Stages tab renders.
  chapterPages: () => chapterPages(chapters, chapterSignals()),
  dietShown: () => chapters.flags().hungerShown,
  foodWebShown: () => chapters.flags().harmonyShown,
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

/** Chapter 1 is planting by hand: every tool waits for Chapter 2, which hands over the seeder. */
function toolIsOwned(id: GardenToolId): boolean {
  return chapters.flags().grassSeeder && ownsGardenTool(upgrades, id)
}

/**
 * The tool bar shows what the farmer owns: the seed bag from the start, and the
 * shovel, the bucket and the Snower once Pip has sold them. A tool put away
 * because it is not owned (a reset, a load) is deselected so the pointer is
 * handed back.
 */
function syncOwnedTools(): void {
  const owned = GARDEN_TOOLS.map((tool) => tool.id).filter(toolIsOwned)
  toolsHud.setOwnedTools(owned)
  const armed = gardenTools?.selectedTool ?? null
  if (armed !== null && !toolIsOwned(armed)) selectGardenTool(null)
}

/** Put the seeder's pack in the tool bar, and show the E chip once there is a second one. */
function syncGrassPack(): void {
  toolsHud.setGrassPack(gardenTools?.grassPack ?? 'short', upgrades.owns('tall-grass'))
  syncOwnedTools()
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

syncOwnedTools()
syncGrassPack()

/** Escape may close the main menu only after it has been closed once, so a fresh boot cannot skip it. */
let menuDismissable = false
const menu = createMenuDomPanel({
  onChoose: (choice) => handleMenuChoice(choice),
  keysEnabled: () => !optionsDom.isOpen && !farmsPanel.isOpen,
  onToggle: (isOpen) => {
    // Once the menu has been closed (Enter, a loaded farm), Escape may close it again.
    if (!isOpen) menuDismissable = true
    syncFarmChrome()
  },
})


const salePanel = createSalePanel((target) => {
  if (target.kind === 'animal') {
    return completeAnimalSale(target.id)?.balance ?? null
  }
  const plantId = Number(target.id)
  const plant = gardenPlants?.simulation.plants.find((entry) => entry.instanceId === plantId)
  if (!plant || !gardenPlants?.removePlant(plantId)) return null
  shedDom.refresh()
  const balance = wallet.credit(gardenPlantSaleValue(plant))
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
const propCard = createPropCardDom({
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
  onCollect: () => {
    const house = selectedProp
    if (!house || !isHouse(house.id)) return null
    const collected = progress.collectGoods(house.siteId)
    if (collected.length === 0) return null
    // The Golden Pail treasure doubles what goods fetch.
    const coins = goodsValue(collected) * treasureEffects(treasures.owned()).goodsValueMultiplier
    if (coins > 0) {
      goodsCoinsTotal += coins
      salePanel.setWallet(wallet.credit(coins))
      const burst = createSellBurst(new THREE.Vector3(house.anchor.x, house.anchor.y, house.anchor.z), coins)
      scene.add(burst.root)
      sellBursts.push(burst)
    }
    saveSoon()
    return formatCollected(collected, coins)
  },
  onToggle: (isOpen) => {
    if (!isOpen) gardenProps?.select(null)
    refreshCursor()
  },
}, window.innerWidth, window.innerHeight)


/** The first-plant trail (src/game/tutorial.ts): a glow, never a gate. Set each frame. */
let tutorialNow: TutorialStep = 'done'
/** Plants the trail should show off first, newest first; empty falls back to whichever seed is held. */
const TUTORIAL_FEATURED_SEEDS: readonly PlantId[] = ['blueberry']
const TUTORIAL_PLANTED_KEY = 'tutorial-planted-v1'
const heldSeeds = (): PlantId[] => PLANT_CATALOG.filter((plant) => (gardenPlants?.simulation.seedsFor(plant.id) ?? 0) > 0).map((plant) => plant.id)

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
  gems: () => gems.balance,
  highlight: () => ({
    tab: tutorialNow === 'seeds-tab' ? 'seeds' : null,
    seed: tutorialNow === 'pick-seed' ? tutorialSeed(heldSeeds(), TUTORIAL_FEATURED_SEEDS) : null,
  }),
})

/* Keep the shed and the shop showing the same counts the world does. */


/** Spend gems on a treasure and apply what it gives straight away. */
function buyTreasure(id: TreasureId): { ok: boolean; text: string } {
  const definition = TREASURE_CATALOG[id]
  const result = purchaseTreasure(gems, treasures, id)
  if (!result.ok) {
    if (result.failure === 'owned') return { ok: false, text: `You already own the ${definition.name}.` }
    return { ok: false, text: `Not enough star gems for the ${definition.name} -- it costs ${definition.price}.` }
  }
  applyTreasureEffects()
  saveSoon()
  shedDom.refresh()
  shop.refresh()
  return { ok: true, text: `The ${definition.name} is yours.` }
}

/** A resident made a good. Only the starhorn's gem lands here: it has no house to keep it in, so it goes straight in the purse. */
function onProduce(event: AnimalLifeEvent): void {
  if (event.good !== 'gem') return
  gems.credit(1)
  const name = (event.animalId ? animalNames.get(event.animalId) : undefined) ?? animalDisplayName(event.species)
  notificationPanel.notifyAccomplishment(`${name} found a star gem`, `${gems.balance} in the purse. Treasures at Pip's shop are bought with star gems.`)
  const animal = event.animalId ? animalById.get(event.animalId) : undefined
  if (animal && !animal.isSold) {
    // The sell burst's ring and sparks, reused: a cheap twinkle where it stands.
    const burst = createSellBurst(animal.root.getWorldPosition(new THREE.Vector3()), 1, 'star gem')
    scene.add(burst.root)
    sellBursts.push(burst)
  }
  saveSoon()
  shedDom.refresh()
  shop.refresh()
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
  gems: () => gems.balance,
  // The Treasures tab is a secret until the first star gem: before then it would only be a puzzle.
  treasuresVisible: () => chapters.flags().mythic && (gems.balance > 0 || treasures.owned().length > 0 || progress.all().some((animal) => animal.species === 'starhorn' && animal.stage > 0)),
  // Pip stocks what the farm's chapter has introduced: no tools in the garden chapter, no feed before animal care.
  // Every land seed is on the shelf from the start; water plants wait for the pond tools of the next chapter.
  offers: {
    upgrade: (id) => id === 'land-deed' || chapters.flags().grassSeeder,
    seed: (id) => plantSpecies(id).substrate !== 'water' || chapters.flags().grassSeeder,
    feed: () => chapters.flags().feedShop,
  },
  quoteTreasure: (id: TreasureId) => ({ owned: treasures.owns(id), price: TREASURE_CATALOG[id].price }),
  onBuyTreasure: (id: TreasureId) => buyTreasure(id),
  feedInPantry: () => feedInPantry(),
  onBuyFeed: () => buyFeedSack(),
  quoteUpgrade: (id: UpgradeId) => upgradeQuote(id, upgrades, progression.level),
  onBuyUpgrade: (id: UpgradeId) => buyUpgrade(id),
  helpersFor: (species) => plantSpecies(species).minigames
    ? PLANT_CARE_KINDS.map((care) => {
      const quote = greenThumb.quote(species, care, helperSeedPrice(species))
      return { care, ...helperShopCopy(species, care), status: quote.status, price: quote.price }
    })
    : [],
  onHireHelper: (species, care) => {
    const copy = helperShopCopy(species, care)
    const quote = greenThumb.hire(species, care, helperSeedPrice(species), (price) => wallet.debit(price) !== null)
    if (quote.status !== 'hired') {
      return { ok: false, text: quote.status === 'needs-ribbon' ? copy.needs : `Not enough coins for the ${copy.name} -- it costs ${quote.price}.` }
    }
    salePanel.setWallet(wallet.balance)
    saveSoon()
    shop.refresh()
    return { ok: true, text: `The ${copy.name} is on the job. Pip waves it off with a hanky.` }
  },
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

/** The Harmony chip on the farm HUD, and the Larder it opens: what the farm grows, what is eaten, and feed sacks. */
const larderDom = createLarderDom({
  source: {
    report: () => progress.foodReport(),
    // The same residents residentCounts() counts: grown, not a baby, not sold.
    residents: () => progress.all().filter((entry) => entry.stage >= 3 && !entry.baby && !animalById.get(entry.id)?.isSold),
    balance: () => wallet.balance,
  },
  nameOf: animalDisplayName,
  onOpen: () => {
    larderDom.setOpen(true)
    syncFarmChrome()
    refreshCursor()
  },
  onClose: () => {
    larderDom.setOpen(false)
    syncFarmChrome()
    refreshCursor()
  },
  onBuyFeed: () => buyFeedSack(),
})

/** Meals of bought feed in the pantry. */
function feedInPantry(): number {
  return progress.foodReport().find((entry) => entry.food === 'feed')?.stock ?? 0
}

/** One feed sack, from Pip's Feed tab or the Larder. */
function buyFeedSack(): { readonly ok: boolean; readonly text: string } {
  if (feedInPantry() + FEED_SACK_MEALS > FEED_CAPACITY) return { ok: false, text: `The pantry is full: it holds ${FEED_CAPACITY} meals.` }
  if (wallet.debit(FEED_SACK_PRICE) === null) return { ok: false, text: `Not enough coins: a feed sack costs ${FEED_SACK_PRICE}.` }
  progress.addFeed(FEED_SACK_MEALS)
  salePanel.setWallet(wallet.balance)
  saveSoon()
  return { ok: true, text: `${FEED_SACK_MEALS} meals of feed stacked in the pantry.` }
}

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
    const price = gardenPlantSaleValue(plant)
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



const panels: UIPanel[] = [balloon, notificationPanel, toolsHud, shed, journal, salePanel, plantCard, clockCalendarHud]

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
journalDom.setHerdSource(() => progress.all())

for (const panel of panels) ui.add(panel)







const { predationLedger, owlHunt, snakeHunt, lionHunt, popsInFlight, bolting, hidingUntil, panicking, tickHunts, presentHunts, popAnimal } = createPredation({
  fairgroundRoot: fairground.root,
  lawnY: GARDEN_LAWN_Y,
  scene,
  progress,
  animals,
  animalById,
  animalNames,
  farmHomes,
  goingIn,
  getFocusedAnimal: () => focusedAnimalId,
  setFocusedAnimal: (id) => { focusedAnimalId = id },
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
  herdCounts,
  hiddenAnimals,
  applyLifeEvents: (events) => handleAnimalLifeEvents(events),
  createAnimalInstance,
})
const { measureFarm, measureFarmForSim, remeasureMeadow, maturePlantCounts, setHarmonyOverride } = createFarmMeasure({
  gardenSurface: () => fairground.gardenSurface,
  gardenTerrain,
  gardenWater,
  gardenTools,
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  residentCounts,
  harmonyResidents,
  preyEaten: () => predationLedger.totals,
  frozenWaterCells,
  activeGardenBounds,
  upgrades,
  herdCounts,
  chapterNumber: () => chapters.current().number,
})
const { houses, setHouses, resetRoster, updateHousing, speciesPluralName, sellAnimalsInside, residentsOf, collideAnimalsTick, updateSleepers } = createHousing({
  progress,
  goodsMultiplier: () => treasureEffects(treasures.owned()).goodsValueMultiplier,
  animals,
  animalById,
  farmHomes,
  goingIn,
  newbornUntil,
  knownDoors,
  lastHouseOf,
  savedIndoors,
  sleepBeds,
  bolting,
  hidingUntil,
  getFocusedAnimal: () => focusedAnimalId,
  isHunted: (id) => owlHunt.huntedIds().has(id) || snakeHunt.huntedIds().has(id) || lionHunt.huntedIds().has(id),
  createAnimalInstance,
  animalCreations,
  refreshAnimalVisibility,
  dayNightClock,
  creditCoins: (amount) => { salePanel.setWallet(wallet.credit(amount)) },
  animalDisplayName,
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
  gems,
  treasures,
  applyTreasureEffects,
  progression,
  upgrades,
  accomplishments,
  progress,
  predationLedger,
  fairground,
  gardenTools,
  gardenPlants: () => gardenPlants,
  greenThumb,
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
  syncOwnedTools,
  syncGrassPack,
  refreshShopUi: () => refreshShopUi(),
  noteJournalStages,
  salePanel,
  notificationPanel,
  menuOpen: () => menu.isOpen,
  syncFarmChrome: () => syncFarmChrome(),
  chapterState: () => chapters.exportState(),
  goodsCoins: () => goodsCoinsTotal,
})
window.addEventListener('pagehide', autosave)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave() })
const visitorMotion = createVisitorMotion({ animalById, activeGardenBounds, carnivalSpawnFor })
// The food web made visible: hunger bubbles over hungry animals, goods badges over houses.
const hungerBubbles = createHungerBubbles({ scene, animals, recordOf: (id) => progress.animal(id) })
const houseBadges = createHouseGoodsBadges({ scene, houses: () => houses(), goodsIn: (id) => progress.goodsIn(id) })
const { progressionHudState, handleAnimalLifeEvents, animalLifeSnapshot, updateAnimalProgress, ownedSeedSpecies, unlockAccomplishment } = createFarmLifecycle({
  animalNames,
  hungerShown: () => chapters.flags().hungerShown,
  popAnimal,
  animalCard,
  progress,
  progression,
  accomplishments,
  notificationPanel,
  animals,
  animalById,
  farmHomes,
  newbornUntil,
  NEWBORN_SHOW_SECONDS,
  fairgroundRoot: fairground.root,
  refreshAnimalVisibility,
  getFocusedAnimal: () => focusedAnimalId,
  menuOpen: () => menu.isOpen,
  salePanelOpen: () => salePanel.isOpen,
  gardenProps: () => gardenProps,
  gardenPlants: () => gardenPlants,
  expansionLevel: () => fairground.farmExpansion?.state.level ?? 0,
  houses,
  setHouses,
  updateHousing,
  measureFarmForSim,
  dayNightClock,
  createAnimalInstance,
  visitorMotion,
  animalDisplayName,
  noteJournalStages,
  speciesPluralName: (species) => speciesPluralName(species),
  onProduce: (event) => {
    onProduce(event)
    houseBadges.notifyProduce(event.houseId)
  },
})
const { openAnimalCardFor, completeAnimalSale, openPropCardFor, refreshShopUi, buyUpgrade, playerDomStats, balloonInboxAnchor, openPlantCardFor, syncPlantCard } = createFarmActions({
  syncOwnedTools,
  startToolFilm,
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
const { selectGardenTool, handleMenuChoice, syncFarmChrome } = createFarmModes({
  menu,
  salePanel,
  shed,
  shop,
  journal,
  toolsHud,
  balloon,
  clockCalendarHud,
  notificationDom,
  playerDom,
  larderDom,
  optionsDom,
  farmsPanel,
  markEntered,
  introWanted,
  startIntro,
  gardenTools,
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  toolIsOwned,
  endCameraTour,
  refreshCursor: () => refreshCursor(),
})
/**
 * Earned plant care: a blueberry's markers open the rain cloud, the swatter and
 * the snips; wins hand out Green Thumb ribbons; hired helpers take over.
 */
const careController = createCareController({
  renderer,
  scene,
  camera,
  canvas: gameCanvas,
  gardenPlants: () => gardenPlants,
  greenThumb,
  notify: (title, detail) => notificationPanel.notifyAccomplishment(title, detail),
  saveSoon: () => saveSoon(),
  clearFarmFocus: () => {
    plantCard.close()
    animalCard.close()
    propCard.close()
    salePanel.close()
    gardenPlants?.cancelPlacement()
    gardenTools?.setPlantingMode(false)
  },
  refreshChrome: () => {
    syncFarmChrome()
    refreshCursor()
  },
})
gardenPlants?.setCareHandlers({
  startGame: (plant, care) => careController.startGame(plant, care),
  helperHired: (species, care) => careController.helperHired(species, care),
})
window.addEventListener('resize', () => careController.resize(window.innerWidth, window.innerHeight))

const hoverGlow = createHoverGlow()
scene.add(hoverGlow.root)
const input = createFarmInput({
  canvas: gameCanvas,
  gardenDebugMode,
  ui,
  panels,
  setFocusedAnimal: (id) => { focusedAnimalId = id },
  gardenPlants: () => gardenPlants,
  gardenProps: () => gardenProps,
  gardenTools,
  menu,
  journal,
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
  toolIsOwned,
  rainChallenge: () => careController.rain,
  careGameActive: () => careController.playing,
})
// Used by the UI and the harness; the input module owns the actual cursor logic.
const refreshCursor = (): void => input.refreshCursor()
input.attach()

// Escape: one router, top of the screen first, acting on key-up (see game/escape-router.ts).
const closePanel = (panel: { setOpen(open: boolean): void }): boolean => {
  panel.setOpen(false)
  syncFarmChrome()
  refreshCursor()
  return true
}
const menuEscape = {
  get isOpen() { return menu.isOpen },
  get dismissable() { return menuDismissable },
  open: () => menu.open(),
  dismiss: () => handleMenuChoice('enter'),
}
const escapeRouter = createEscapeRouter([
  () => optionsDom.isOpen && closePanel(optionsDom),
  () => farmsPanel.back(),
  menuCloseLayer(menuEscape),
  () => notificationDom.isOpen && closePanel(notificationDom),
  () => larderDom.isOpen && closePanel(larderDom),
  () => playerDom.isOpen && closePanel(playerDom),
  () => shop.isOpen && closePanel(shop),
  () => shed.isOpen && (shed.close(), true),
  () => journal.isOpen && (journal.close(), true),
  () => input.escapeFarmAction(),
  menuOpenLayer(menuEscape),
])
window.addEventListener('keydown', (event) => escapeRouter.keyDown(event))
window.addEventListener('keyup', (event) => escapeRouter.keyUp(event))
window.addEventListener('blur', () => escapeRouter.reset())

menu.open()
syncFarmChrome()
if (loadedSave) applySavedWorld(loadedSave)
else if (startup.notice) farmsPanel.open(startup.notice)
if (loadedSave) chapters.importState(loadedSave.chapters)
else chapters.reset()
applyChapterFlags()
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
    careController,
    greenThumb,
    intro: controlIntro,
    toolFilm: controlToolFilm,
    chapterFilm: (id: string, seconds?: number) => {
      if (!(CHAPTER_ORDER as readonly string[]).includes(id)) return null
      if (!chapterFilm) startChapterFilm(id as ChapterId)
      if (chapterFilm && seconds !== undefined) {
        chapterFilm.seek(seconds)
        chapterFilm.update(0)
      }
      return chapterFilm?.describe() ?? null
    },
    syncOwnedTools,
    canvas: gameCanvas,
    wallet,
    gems,
    treasures,
    buyTreasure,
    setHarmonyOverride,
    pageParams,
    renderer,
    forceShadowRedraw: shadowRefresh.forceNext,
    refreshAnimalShadows,
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
      shownAnimalCount: () => shownCount(),
    houseSpots: () => houses(),
    gardenBounds: () => currentGardenBounds,
    setGardenBounds: (bounds) => { currentGardenBounds = bounds },
    setClockHeld: (held) => { clockHeld = held },
    setGrazingOverride: (dryness) => {
      grazingOverride = dryness
      // Debug: jump the slow ease so a screenshot does not wait a minute.
      gardenTools?.setGrazing(dryness ?? 0)
      gardenTools?.update(300)
    },
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
    lionHunt,
    hiddenAnimals,
    herdCounts,
    popsInFlight,
    crowdFixtures,
    clearCrowdFixtures,
    setCrowdFixtures,
    farmHomes,
      createAnimalInstance,
    maturePlantCounts,
    remeasureMeadow,
    measureFarm,
    handleAnimalLifeEvents,
    stepAnimalWorld,
    runSimTick,
    presentHunts,
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
    ui,
    frameTimer,
    journal,
    notificationPanel,
    notificationDom,
    knownMaturePlants,
    syncGrassPack,
    swapGrassPack,
    menu,
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
    syncFarmChrome: () => syncFarmChrome(),
    chapters,
    chapterSignals,
    announceChapter,
    applyChapterFlags,
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
  shadowRefresh.markDirty()
  const cutscene = intro
  if (!cutscene) return
  intro = null
  cutscene.dispose()
  previousTime = performance.now()
  handleMenuChoice('enter')
  // A new farm opens on Chapter 1's film, straight after the intro.
  if (!loadedSave && chapters.current().id === 'garden') announceChapter(chapters.current())
}

// ------------------------------------------------------- tool-unlock film --
// Buying a tool at Pip's shop plays a short film of Pip handing it over
// (scene/tool-unlock-cutscene.ts). The shop stays open underneath, hidden, so
// the player is back at the counter when it ends. The farm pauses as for the
// intro.

let toolFilm: ToolUnlockCutscene | null = null

function startToolFilm(id: UpgradeId | ChapterToolGift): void {
  const film = toolUnlockFilmFor(id)
  if (!film || intro) return
  toolFilm?.dispose()
  // A tool film takes over from a chapter film still on screen (its title card included).
  chapterFilm?.dispose()
  chapterFilm = null
  const cutscene = createToolUnlockCutscene(renderer, film, window.innerWidth, window.innerHeight)
  toolFilm = cutscene
  // Every DOM panel (the shop included) hides while the film owns the screen.
  document.body.classList.add('film-playing')
  setCursor('idle', gameCanvas)
  cutscene.resumeAudio()
  cutscene.load().catch((error: unknown) => {
    console.warn('[tool unlock] could not load the cutscene; back to the shop', error)
    if (toolFilm === cutscene) finishToolFilm()
  })
}

function finishToolFilm(): void {
  shadowRefresh.markDirty()
  const cutscene = toolFilm
  if (!cutscene) return
  toolFilm = null
  cutscene.dispose()
  document.body.classList.remove('film-playing')
  previousTime = performance.now()
}

/** A chapter's opening film: a camera move over the player's own farm and a title card. */
let chapterFilm: ChapterFilmPlayer | null = null

function startChapterFilm(id: ChapterId): void {
  // Another film already owns the screen; the letter still tells the player.
  if (intro || toolFilm) return
  chapterFilm?.dispose()
  const bounds = currentGardenBounds
  chapterFilm = createChapterFilmPlayer({ camera: farmCamera.camera, farmRadius: Math.max(bounds.halfWidth, bounds.halfDepth) })
  chapterFilm.start(id)
  document.body.classList.add('film-playing')
}

function finishChapterFilm(): void {
  const id = chapterFilm?.id ?? null
  chapterFilm?.dispose()
  chapterFilm = null
  document.body.classList.remove('film-playing')
  // Chapter 2 is the grass seeder: Pip hands it over in its own film, after the chapter's.
  if (id === 'land') startToolFilm('grass-seeder')
}

/** Whichever film is on screen: the intro, a tool being handed over, or a chapter opening. */
function activeFilm(): CutscenePlayer | null {
  return intro ?? toolFilm ?? chapterFilm
}

function interceptIntroInput(event: KeyboardEvent | PointerEvent): void {
  const film = activeFilm()
  if (!film) return
  event.stopImmediatePropagation()
  event.preventDefault()
  // After a New Farm reload the film starts without a gesture, so its sound
  // waits for this first press.
  film.resumeAudio()
  if (event instanceof KeyboardEvent && event.repeat) return
  const now = performance.now()
  if ((event instanceof KeyboardEvent && event.key === 'Escape') || now < introSkipArmedUntil) {
    film.skip()
    return
  }
  introSkipArmedUntil = now + INTRO_SKIP_CONFIRM_MS
  film.flashSkipHint()
}

window.addEventListener('keydown', interceptIntroInput, { capture: true })
window.addEventListener('pointerdown', interceptIntroInput, { capture: true })
window.addEventListener('resize', () => activeFilm()?.resize(window.innerWidth, window.innerHeight))
if (bootRequest?.kind === 'new' && introWanted()) startIntro()
else if (gardenDebugMode && pageParams.has('intro')) startIntro()
// ?gardenDebug=1&toolFilm=snower plays a tool-unlock film straight away, for watching it.
else if (gardenDebugMode && pageParams.has('toolFilm')) startToolFilm((pageParams.get('toolFilm') || 'snower') as UpgradeId)

function controlIntro(seconds?: number): unknown {
    if (!intro) startIntro()
    // A seek holds the frame for a screenshot; a bare call lets the film run on.
    intro?.setPaused(seconds !== undefined)
    if (seconds !== undefined && intro) {
      intro.seek(seconds)
      // Draw now: a hidden tab throttles animation frames, and a screenshot
      // taken before the next one would show the previous moment.
      intro.update(0)
      shadowRefresh.forceNext()
      intro.render()
    }
    Object.defineProperty(window, '__introScenes', { value: intro?.scenes ?? null, configurable: true })
    return intro ? { loaded: intro.loaded, ...intro.describe() } : null
}

function controlToolFilm(id: string, seconds?: number): unknown {
    if (!toolFilm || toolFilm.film.id !== id) startToolFilm(id as UpgradeId)
    toolFilm?.setPaused(seconds !== undefined)
    if (seconds !== undefined && toolFilm) {
      toolFilm.seek(seconds)
      toolFilm.update(0)
      shadowRefresh.forceNext()
      toolFilm.render()
    }
    return toolFilm ? { loaded: toolFilm.loaded, ...toolFilm.describe() } : null
}

// --------------------------------------------------------------- render loop --

updateCameraProjection()

let previousTime = performance.now()
let previousFrameTimestamp: number | null = null
window.addEventListener('resize', () => {
  performanceOverlay?.resize(window.innerWidth, window.innerHeight)
})
performanceOverlay?.resize(window.innerWidth, window.innerHeight)

/**
 * Plants change their shadow when they are planted, removed or grow through a
 * tenth of their size. Growing is a slow ramp, so the key steps in those buckets
 * instead of every frame. Sway and hover scaling are left out on purpose: they
 * turn a plant a few degrees or grow it a few percent, too little to show.
 */
let lastPlantShadowKey = -1
let expansionWasAnimating = false
function plantShadowKey(): number {
  let key = 0
  for (const plant of gardenPlants?.simulation.plants ?? []) key += 10000 + Math.floor(plant.growth * 10)
  return key
}

/**
 * Logic that does not need per-frame smoothness runs on a fixed simulation clock
 * (see game/sim-clock.ts). Animal wander and walk movement is simulated on it too
 * (game/animal-sim.ts) and drawn blended by simClock.alpha, and so are the
 * walk home, the gate trips, the collision push-out and the owl and snake hunts
 * (game/animal-hunt.ts). Animation, camera and water stay per frame.
 */
const plantRaids = createPlantRaids(animals, progress, () => gardenPlants, () => gardenProps?.occupancy.fenceSegments ?? [],
  (plant) => gardenPlants?.celebrateWither(plant.instanceId))
// Deer eat the garden, one random plant at a time, unless a salt lick is out (src/game/deer-raid.ts).
const deerRaids = createDeerRaids(animals, progress, () => gardenPlants, () => gardenProps?.placements('salt-lick') ?? [], (plant) => {
  notificationPanel.notifyAccomplishment(`A deer ate your ${plantDisplayName(plant.species)}!`, 'Deer would rather lick salt than eat your garden. Pip sells a Salt Lick.')
  shedDom.refresh()
  syncFarmChrome()
})
const simClock = createSimClock({ hz: SIM_HZ, maxStepsPerFrame: SIM_MAX_STEPS_PER_FRAME })

/**
 * One sim tick of the animals: they walk, collision pushes them out of houses and
 * each other, then the hunts decide against where they ended up. The harness steps
 * this directly; the frame loop runs it from `runSimTick`.
 */
function stepAnimalWorld(stepSeconds: number, nowSeconds: number, huntsActive: boolean): void {
  // Wandering, walking and the hunters' steering are simulated here; the frame only blends the last two ticks.
  for (const animal of animals) animal.tickSim(stepSeconds)
  for (const fixture of crowdFixtures) fixture.tickSim(stepSeconds)
  // Push the walkers out of houses and each other once they have moved; the view blends the result.
  collideAnimalsTick(nowSeconds)
  if (huntsActive) tickHunts(stepSeconds)
  plantRaids.tick(stepSeconds, huntsActive && !journal.isOpen)
  deerRaids.tick(stepSeconds, huntsActive && !journal.isOpen)
}

function runSimTick(stepSeconds: number, nowSeconds: number, huntsActive: boolean): void {
  stepAnimalWorld(stepSeconds, nowSeconds, huntsActive)
  updateSleepers()
  // The condition ladder runs after the animals have moved, so a settle
  // triggered this tick is applied against the farm as measured, which the
  // sim refreshes at most once a second (see measureFarmForSim).
  updateAnimalProgress(stepSeconds)
  refreshAnimalVisibility(nowSeconds)
  gardenPlants?.tick(stepSeconds, !menu.isOpen && !journal.isOpen && !salePanel.isOpen)
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
}

/**
 * Panels that show live numbers refresh at most this often. Actions that change
 * what a panel shows (buying, selling, selecting) still refresh it at once.
 */
const DOM_REFRESH_INTERVAL_MS = 250
let lastDomRefreshAt = Number.NEGATIVE_INFINITY
/** Debug only: pins the lawn's overgrazing regardless of the grass larder. */
let grazingOverride: number | null = null

const tutorialDom = createTutorialDom()
let tutorialPlantedBefore = false
// True while a tutorial scenario replays the trail; replays never persist the flag.
let tutorialReplay = false
try {
  // The tutorial scenarios replay the trail for a tester who has planted before.
  tutorialReplay = __GARDEN_DEBUG__ && (pageParams.get('scenario') ?? '').startsWith('tutorial/')
  // A new farm replays the trail even for a veteran: the "planted" memory
  // belongs to the farm left behind, so starting fresh clears it. Loading a
  // save keeps it, so a veteran's loaded farm stays quiet.
  if (!loadedSave) window.localStorage.removeItem(TUTORIAL_PLANTED_KEY)
  tutorialPlantedBefore = !tutorialReplay && window.localStorage.getItem(TUTORIAL_PLANTED_KEY) === '1'
} catch { /* private mode: the trail just checks the garden */ }

function updateTutorial(): void {
  const plantsStanding = gardenPlants?.simulation.plants.length ?? 0
  if (plantsStanding > 0 && !tutorialPlantedBefore) {
    tutorialPlantedBefore = true
    if (!tutorialReplay) {
      try { window.localStorage.setItem(TUTORIAL_PLANTED_KEY, '1') } catch { /* nothing to remember it with */ }
    }
  }
  const before = tutorialNow
  tutorialDom.update({
    playable: !menu.isOpen && !chapterFilm && !journal.isOpen && !shop.isOpen && !salePanel.isOpen && !playerDom.isOpen && !larderDom.isOpen,
    shedOpen: shed.isOpen,
    shedTab: shedDom.tab,
    seedArmed: (gardenPlants?.selectedSpecies ?? null) !== null,
    seedsHeld: heldSeeds().length,
    plantsStanding,
    plantedBefore: tutorialPlantedBefore,
  }, balloon.quadrantCallout('shed'))
  tutorialNow = tutorialDom.step
  balloon.setHighlight(tutorialNow === 'open-shed' ? 'shed' : null)
  if (tutorialNow !== before) shedDom.refresh()
}

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
    shadowRefresh.forceNext()
    intro.render()
    if (intro.done) finishIntro()
    requestAnimationFrame(frame)
    return
  }
  if (toolFilm) {
    toolFilm.update(delta)
    shadowRefresh.forceNext()
    toolFilm.render()
    if (toolFilm.done) finishToolFilm()
    requestAnimationFrame(frame)
    return
  }
  // A close-up care minigame plays like a film: the farm holds still underneath.
  if (careController.playing) {
    const updateStartedAt = timingEnabled ? performance.now() : 0
    careController.update(delta)
    const renderStartedAt = timingEnabled ? performance.now() : 0
    careController.render()
    // Minigame frames are timed too (the farm's stages read zero), so the perf
    // scenarios and the FPS panel see a minigame's cost, not a gap.
    if (__GARDEN_DEBUG__ && timingEnabled) {
      const finishedAt = performance.now()
      frameTimer?.record(now, {
        intervalMs,
        workMs: finishedAt - workStartedAt,
        fairgroundMs: 0,
        expansionBoundsMs: 0,
        animalsMs: 0,
        toolsMs: 0,
        otherUpdateMs: renderStartedAt - updateStartedAt,
        sceneRenderMs: finishedAt - renderStartedAt,
        overlayRenderMs: 0,
      })
    }
    requestAnimationFrame(frame)
    return
  }
  let stageStartedAt = workStartedAt
  farmCamera.removeShake()
  if (!clockHeld) advanceClock(dayNightClock, delta)
  tickAutosave(delta)
  dayNightRig.update(dayNightClock.timeOfDay)
  clockCalendarHud.setState({ timeOfDay: dayNightClock.timeOfDay, phase: phaseOf(dayNightClock.timeOfDay), date: calendarOf(dayNightClock.elapsedDays), weekday: weekdayName(dayNightClock.elapsedDays) })
  const carnivalMoved = fairground.update(delta, dayNightClock.elapsedDays)
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
  // A chapter film drives the camera itself; the farm keeps living underneath it.
  if (chapterFilm) {
    if (!chapterFilm.update(delta)) finishChapterFilm()
  } else {
    farmCamera.updateMenuDrift(delta, now / 1000)
    updateCameraTour(delta)
  }
  const simSteps = simClock.advance(delta)
  // Hunts hold still while a full-screen panel is open, as they always have.
  const huntsActive = !menu.isOpen && !salePanel.isOpen
  for (let step = 0; step < simSteps; step += 1) runSimTick(simClock.stepSeconds, now / 1000, huntsActive)
  const simAlpha = simClock.alpha
  animals.forEach((animal) => animal.update(delta, simAlpha))
  crowdFixtures.forEach((fixture) => fixture.update(delta, simAlpha))
  refreshAnimalShadows()
  hungerBubbles.update(delta, now / 1000)
  houseBadges.update(delta, now / 1000)
  if (huntsActive) presentHunts(delta, simAlpha)
  // Farewell bursts are fire-and-forget: tick them with the herd and prune
  // the finished ones so a selling spree cannot leak scene nodes.
  for (let burstIndex = sellBursts.length - 1; burstIndex >= 0; burstIndex -= 1) {
    const burst = sellBursts[burstIndex]
    if (burst.update(delta)) continue
    scene.remove(burst.root)
    burst.dispose()
    sellBursts.splice(burstIndex, 1)
  }
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
      farmCamera.shakeForExpansion()
    }
  }
  gardenPlants?.update(delta)
  careController.updateFarm(delta)
  syncPlantCard(delta)
  gardenProps?.update(delta, progression.level)
  // Cheap and state-driven, so they stay per frame: the letter tray must hide the
  // frame a panel opens, not 250 ms later.
  notificationPanel.setVisible(!menu.isOpen && !journal.isOpen && !salePanel.isOpen && !shop.isOpen && !shed.isOpen && !playerDom.isOpen && !larderDom.isOpen)
  // The chip belongs to the bare farm view: any open panel or the main menu hides it.
  const bareFarmView = !menu.isOpen && !journal.isOpen && !salePanel.isOpen && !shop.isOpen && !shed.isOpen && !playerDom.isOpen && !larderDom.isOpen && !optionsDom.isOpen && !farmsPanel.isOpen && !notificationDom.isOpen
  larderDom.setChipVisible(bareFarmView && chapters.flags().harmonyShown)
  chapterClockSeconds += delta
  if (!gardenPlants?.selectedSpecies && !shed.isOpen) gardenTools?.setPlantingMode(false)
  // Open panels rebuild their DOM, so they refresh at a fixed low rate. Closed
  // panels skip the work entirely; their stats are only gathered when open.
  if (now - lastDomRefreshAt >= DOM_REFRESH_INTERVAL_MS) {
    lastDomRefreshAt = now
    // The lawn reads as overgrazed when the grass larder runs low (eased inside the tools).
    const grassLarder = progress.foodReport().find((entry) => entry.food === 'grass')
    gardenTools?.setGrazing(grazingOverride ?? (grassLarder ? grazedness(grassLarder.stock, grassLarder.capacity) : 0))
    if (playerDom.isOpen) playerDom.refresh(playerDomStats())
    if (notificationDom.isOpen) notificationDom.refresh(notificationPanel.getLetters(), notificationPanel.nowSeconds())
    const unread = notificationPanel.getUnreadCount()
    balloon.setPostBadge(unread > 9 ? '9+' : unread > 0 ? String(unread) : '')
    if (!menu.isOpen && !journal.isOpen && !shop.isOpen && !shed.isOpen) refreshShopUi()
    shedDom.refresh()
    // Goods accrue and animals come and go while a house's card is open.
    if (propCard.isOpen && selectedProp && isHouse(selectedProp.id)) propCard.setResidents(residentsOf(selectedProp))
    larderDom.refresh()
    if (chapterClockSeconds >= 1) {
      chapterClockSeconds = 0
      tickChapters()
    }
  }
  const toolsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  if (!chapterFilm) {
    input.updateCameraPan(delta)
    farmCamera.applyShake(delta, now / 1000)
    input.followPointer()
  }
  const otherUpdateMs = timingEnabled ? performance.now() - stageStartedAt : 0
  // Redraw the sun's shadows only when a caster moved, the farm is expanding, the
  // carnival packed or unpacked, the shop is going up, a plant changed size, or
  // the sun has swung far enough to matter.
  const shopBuild = gardenProps?.shopBuildState()
  // The frame an expansion settles still carries its last moved geometry, so it counts too.
  if (expansionIsAnimating || expansionWasAnimating || carnivalMoved || (shopBuild?.started && !shopBuild.finished)) shadowRefresh.markDirty()
  expansionWasAnimating = expansionIsAnimating
  const plantKey = plantShadowKey()
  if (plantKey !== lastPlantShadowKey) {
    lastPlantShadowKey = plantKey
    shadowRefresh.markDirty()
  }
  shadowRefresh.prepare(sunlight.position)
  renderer.info.reset()
  stageStartedAt = timingEnabled ? performance.now() : 0
  renderer.render(scene, camera)
  const sceneRenderMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  ui.update(delta)
  updateTutorial()
  // A chapter film is a full-screen moment: the HUD steps aside like it does for the other films.
  if (!chapterFilm) ui.render(renderer)
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
// WebGPU builds pipelines lazily, and the first draw of each stalls the frame.
// Build the farm's up front so the menu opens smoothly. The sale farewell's
// ring, tag and sparks ride along (on both backends), so the first sale is not
// the first time their programs exist.
await loading.setStage('shaders')
try {
  const drawWarmScene = async (): Promise<void> => {
    // The sun's shadow map only redraws on request; ask, so the casters' depth programs are built too.
    shadowRefresh.forceNext()
    await precompile(renderer, scene, camera)
    // WebGL finishes linking on the first draw, so draw once (WebGPU's pipelines are built above).
    if (renderBackend === 'webgl') renderer.render(scene, camera)
  }
  const cowOptions = getAnimalSceneOptions(gameCanvas, camera).find((entry) => entry.id === 'cow')
  const warmupRoot = new THREE.Group()
  warmupRoot.name = 'Animal look warm-up (parked, hidden)'
  scene.add(warmupRoot)
  // The garden's bursts (a planted seed's dirt, a snip's leaves) share one material per look; build those too.
  const unwarmBursts = warmBurstLooks(scene)
  try {
    await warmSellBursts(scene, async () => {
      if (!cowOptions) return drawWarmScene()
      await warmAnimalLooks(warmupRoot, cowOptions, drawWarmScene)
    })
  } finally {
    unwarmBursts()
  }
  warmupRoot.visible = false
} catch (error) {
  // A WebGPU device that starts but cannot build the farm's pipelines (a driver
  // or browser mismatch) would leave a dead canvas; restart the page on WebGL.
  if (renderBackend === 'webgpu') {
    console.warn('[renderer] WebGPU could not compile the farm; reloading on WebGL', error)
    const url = new URL(window.location.href)
    url.searchParams.set('renderer', 'webgl')
    window.location.replace(url.href)
  }
  throw error
}
requestAnimationFrame((now) => {
  frame(now)
  // The first frame has been submitted; the next paint shows the farm.
  requestAnimationFrame(() => loading.done())
})
