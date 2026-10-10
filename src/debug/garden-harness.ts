import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import type { FarmCamera } from '../scene/farm-camera'
import { GARDEN_LAWN_Y, type Fairground } from '../scene/fairground'
import { FARM_EXPANSION_CONFIG, type GardenBounds } from '../game/farm-expansion'
import type { GardenTerrain } from '../scene/garden-terrain'
import type { GardenTools } from '../scene/garden-tools'
import type { GardenPlants } from '../scene/garden-plants'
import type { GardenProps } from '../scene/garden-props'
import type { PopBurst } from '../scene/pop-burst'
import type { UIPanel, UILayer } from '../ui/ui-layer'
import type { ShedDomPanel } from '../ui/shed-dom'
import type { ShopDomPanel } from '../ui/shop-dom'
import type { SellBurst } from '../ui/sell-burst'
import type { FrameTimer, GardenFrameTiming } from './frame-timing'
import type { createAnimalLife, AnimalRecord } from '../game/animal-life'
import type { Bed } from '../game/sleep'
import type { createProgressLedger } from '../game/farm-progression'
import type { createAccomplishmentTracker } from '../game/accomplishments'
import { PLANT_CATALOG, type PlantId, type PlantSurface } from '../game/plants'
import { PROP_CATALOG, purchaseProp, type PropId } from '../game/farm-props'
import { UPGRADE_CATALOG, upgradeQuote, propUnlockLevel, type UpgradeId, type createUpgradeLedger } from '../game/tool-unlocks'
import { OUTDOOR_LIMITS } from '../game/animal-housing'
import { phaseOf, formatCalendarDate, calendarOf, setTimeOfDay, skipToNext, type createDayNightClock } from '../game/day-night'
import type { AnimalStage } from '../game/animal-conditions'
import type { FarmState } from '../game/farm-state'
import type { GardenToolId } from '../scene/garden-tool-art'
import type { ShopBuildReport } from '../scene/shop-build'
import type { createWallet } from '../game/sales'
import type { createPredationLedger } from '../game/predator'
import type { createOwlHunt } from '../scene/owl-hunt'
import type { createSnakeHunt } from '../scene/snake-hunt'
import type { createGardenWaterField } from '../game/garden-water'
import type { createGardenWaterMesh } from '../scene/garden-water-mesh'
import type { createJournalPanel } from '../ui/journal-panel'
import type { createNotificationPanel } from '../ui/notification-panel'
import type { createNotificationDomPanel } from '../ui/notification-dom'
import type { createSalePanel } from '../ui/sale-panel'
import type { createAnimalCard } from '../ui/animal-card'
import type { createShedPanel } from '../ui/shed-panel'
import type { createPlantCard } from '../ui/plant-card'
import type { createPlayerDomPanel } from '../ui/player-dom'
import type { createBalloonPanel } from '../ui/balloon-panel'


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
  /** Lay (or, negative, lift) a disc of snow in garden meters; returns the snow now lying. */
  blowSnow(x: number, z: number, radius: number, amount?: number): { snowArea: number; frostedBlades: number }
  /** Stand an ice crystal ('ice') or snowball ('ball') on snow already lying there. */
  snowFeature(kind: 'ice' | 'ball', x: number, z: number): boolean
  openJournal(): void
  /** Start the intro cutscene, hold it at a moment (or resume it), and report what it shows. */
  intro(seconds?: number): unknown
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
  predation(): { readonly eaten: Readonly<Record<string, number>>; readonly owls: ReturnType<ReturnType<typeof createOwlHunt>['report']>['owls']; readonly snakes: ReturnType<ReturnType<typeof createSnakeHunt>['report']>['snakes']; readonly oaks: number; readonly flock: number }
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
  stepHunt(seconds: number, secondsPerStep?: number): ReturnType<ReturnType<typeof createOwlHunt>['report']>['owls']
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
    readonly conditions: ReturnType<ReturnType<typeof createAnimalLife>['statusOf']>
  }>
}

/**
 * Everything the harness drives. Mutable main-owned values come as getters and
 * setters, so the harness never holds a stale copy of the farm.
 */
export interface GardenHarnessDeps {
  readonly canvas: HTMLCanvasElement
  readonly pageParams: URLSearchParams
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly cameraTarget: THREE.Vector3
  readonly farmCamera: FarmCamera
  readonly wallet: ReturnType<typeof createWallet>
  readonly focusCamera: () => void
  readonly frameAt: (target: THREE.Vector3, height: number) => void
  readonly beginCameraTour: (seed?: number) => boolean
  readonly endCameraTour: (restore: boolean) => void
  readonly resetCameraToStart: () => void
  readonly updateCameraTour: (deltaSeconds: number) => void
  readonly dayNightClock: ReturnType<typeof createDayNightClock>
  readonly fairground: Fairground
  readonly gardenTerrain: GardenTerrain | null
  readonly gardenWater: ReturnType<typeof createGardenWaterField> | null
  readonly gardenWaterMesh: ReturnType<typeof createGardenWaterMesh> | null
  readonly gardenTools: GardenTools | null
  readonly gardenPlants: () => GardenPlants | null
  readonly gardenProps: () => GardenProps | null
  readonly shownAnimalCount: () => number
  readonly houseSpots: () => readonly { readonly id: string; readonly prop: string; readonly x: number; readonly z: number; readonly doorX: number; readonly doorZ: number }[]
  readonly gardenBounds: () => GardenBounds
  readonly setGardenBounds: (bounds: GardenBounds) => void
  readonly setClockHeld: (held: boolean) => void
  readonly setFocusedAnimal: (id: string | null) => void
  readonly resetRoster: () => void
  readonly resetVisibilityClock: () => void
  readonly refreshAnimalVisibility: (nowSeconds: number, force?: boolean) => void
  readonly plantSurfaceAt: (x: number, z: number) => PlantSurface
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly progression: ReturnType<typeof createProgressLedger>
  readonly accomplishments: ReturnType<typeof createAccomplishmentTracker>
  readonly upgrades: ReturnType<typeof createUpgradeLedger>
  readonly isLoose: (animalId: string) => boolean
  readonly animalNames: Map<string, string>
  readonly animalById: Map<string, BalloonAnimal>
  readonly animals: BalloonAnimal[]
  readonly predationLedger: ReturnType<typeof createPredationLedger>
  readonly owlHunt: ReturnType<typeof createOwlHunt>
  readonly snakeHunt: ReturnType<typeof createSnakeHunt>
  readonly popsInFlight: { readonly burst: PopBurst; readonly animal: BalloonAnimal }[]
  readonly crowdFixtures: BalloonAnimal[]
  readonly clearCrowdFixtures: () => void
  readonly setCrowdFixtures: (count: number) => Promise<number>
  readonly farmHomes: Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>
  readonly createAnimalInstance: (record: AnimalRecord, position?: { x: number; z: number }, emerging?: boolean) => Promise<BalloonAnimal>
  readonly maturePlantCounts: () => Record<string, number>
  readonly remeasureMeadow: () => void
  readonly measureFarm: () => import('../game/farm-state').FarmState
  readonly handleAnimalLifeEvents: (events: readonly import('../game/animal-life').AnimalLifeEvent[]) => void
  readonly updateOwlHunt: (deltaSeconds: number) => void
  readonly updateSnakeHunt: (deltaSeconds: number) => void
  readonly bolting: Set<string>
  readonly hidingUntil: Map<string, number>
  readonly panicking: Map<string, number>
  readonly sleepBeds: Map<string, Bed>
  readonly animalLifeSnapshot: () => import('../game/animal-life').AnimalLifeSnapshot
  readonly goingIn: Map<string, { readonly houseId: string; readonly since: number }>
  readonly newbornUntil: Map<string, number>
  readonly lastHouseOf: Map<string, string>
  readonly updateHousing: (nowSeconds: number) => void
  readonly residentsOf: (selection: { readonly id: PropId; readonly siteId: string }) => import('../ui/prop-card').PropResidents | null
  readonly collideAnimals: (nowSeconds: number) => void
  readonly ui: UILayer
  readonly frameTimer: FrameTimer | null
  readonly journal: ReturnType<typeof createJournalPanel>
  readonly notificationPanel: ReturnType<typeof createNotificationPanel>
  readonly notificationDom: ReturnType<typeof createNotificationDomPanel>
  readonly knownMaturePlants: Set<number>
  readonly syncGrassPack: () => void
  readonly swapGrassPack: () => boolean
  readonly menu: { readonly isOpen: boolean; open(): void; close(): void }
  readonly openAnimalCardFor: (animal: BalloonAnimal, preview?: { stage?: number; sellable?: boolean }) => void
  readonly salePanel: ReturnType<typeof createSalePanel>
  readonly sellBursts: SellBurst[]
  readonly animalCard: ReturnType<typeof createAnimalCard>
  readonly shed: ReturnType<typeof createShedPanel>
  readonly shedDom: ShedDomPanel
  readonly refreshShopUi: () => void
  readonly buyUpgrade: (id: import('../game/tool-unlocks').UpgradeId) => { ok: boolean; text: string }
  readonly shop: ShopDomPanel
  readonly playerDomStats: () => Parameters<ReturnType<typeof createPlayerDomPanel>['refresh']>[0]
  readonly playerDom: ReturnType<typeof createPlayerDomPanel>
  readonly balloon: ReturnType<typeof createBalloonPanel>
  readonly balloonInboxAnchor: () => { x: number; y: number }
  readonly plantCard: ReturnType<typeof createPlantCard>
  readonly openPlantCardFor: (plant: import('../game/plants').GardenPlant) => void
  readonly panels: readonly UIPanel[]
  readonly selectGardenTool: (id: import('../scene/garden-tool-art').GardenToolId | null) => void
  readonly syncFarmChrome: () => void
  readonly intro: (seconds?: number) => unknown
}

export function installGardenHarness(deps: GardenHarnessDeps): void {
  const {
    canvas: gameCanvas,
    wallet,
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
    refreshAnimalVisibility,
    plantSurfaceAt,
    progress,
    progression,
    accomplishments,
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
    farmHomes,
    createAnimalInstance,
    upgrades,
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
    syncFarmChrome,
    setCrowdFixtures,
  } = deps
  void gameCanvas
  let harnessSpawnCount = 0
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


  const cameraReport = (): CameraDebugReport => ({
    target: { x: +cameraTarget.x.toFixed(3), y: +cameraTarget.y.toFixed(3), z: +cameraTarget.z.toFixed(3) },
    position: { x: +camera.position.x.toFixed(3), y: +camera.position.y.toFixed(3), z: +camera.position.z.toFixed(3) },
    viewHeight: +(farmCamera.viewHalfHeight * 2).toFixed(3),
    tour: {
      active: farmCamera.tour !== null,
      seed: farmCamera.tourSeed,
      view: farmCamera.tour?.view ?? null,
      subject: farmCamera.tour?.subjectId ?? null,
    },
  })
  let scenarioList: Record<string, string> = {}
  void import('../../dev/scenarios/index').then((module) => { scenarioList = module.listScenarios() })
  const debugHarness: GardenDebugHarness = {
    enabled: true,
    intro: (seconds) => deps.intro(seconds),
    snowFeature: (kind, x, z) => gardenTools?.placeSnowFeature(kind, x, z) ?? false,
    blowSnow: (x, z, radius, amount) => {
      gardenTools?.blowSnowDisc(x, z, radius, amount ?? 1)
      const tools = gardenTools?.debugState()
      return { snowArea: tools?.snowArea ?? 0, frostedBlades: tools?.frostedBlades ?? 0 }
    },
    state: () => ({
        menuOpen: menu.isOpen,
      journalOpen: journal.isOpen,
      shopOpen: shop.isOpen,
      shedOpen: shed.isOpen,
      placing: deps.gardenProps()?.placingId ?? null,
      performance: frameTimer?.summarize() ?? null,
      tools: gardenTools?.debugState() ?? null,
    }),
    focusGarden: focusCamera,
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
      deps.setFocusedAnimal(animal.instanceId)
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
    digPond: (x, z, radius) => {
      gardenTools?.digBasin(x, z, radius, -1.1)
      return measureFarm()
    },
    plant: (species, x, z) => {
      const simulation = deps.gardenPlants()?.simulation
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
      const simulation = deps.gardenPlants()?.simulation
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
      deps.setFocusedAnimal(null)
      goingIn.clear()
      newbornUntil.clear()
      lastHouseOf.clear()
      deps.resetRoster()
      deps.resetVisibilityClock()
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
      const distance = farmCamera.openingDistance
      const offset = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ).multiplyScalar(distance)
      farmCamera.frameFrom(target, height, offset)
    },
    progression: () => ({ points: progression.points, level: progression.level, pointsToNextLevel: progression.pointsToNextLevel }),
    rendering: () => {
      const housing = progress.housing()
      return {
        population: progress.all().filter((record) => record.stage > 0).length,
        outside: animals.filter((animal) => !animal.isSold && (progress.animal(animal.instanceId)?.stage ?? 0) > 0).length,
        drawn: deps.shownAnimalCount(),
        crowdFixtures: crowdFixtures.length,
        houseRoom: housing.capacity,
        houseUsed: housing.used,
      }
    },
    houses: () => deps.houseSpots().map((house) => {
      return { ...house, residents: residentsOf({ id: house.prop as PropId, siteId: house.id }) }
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
      state: 'Snapshot: menu, camera, tools, water, herd summary.',
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
      bounds: { ...deps.gardenBounds() },
      terrain: { cols: gardenTerrain?.gridCols ?? 0, rows: gardenTerrain?.gridRows ?? 0, originX: gardenTerrain?.originX ?? 0, originZ: gardenTerrain?.originZ ?? 0 },
      water: { cols: gardenWater?.gridCols ?? 0, rows: gardenWater?.gridRows ?? 0, originX: gardenWater?.originX ?? 0, originZ: gardenWater?.originZ ?? 0 },
    }),
    expandOnce: () => fairground.farmExpansion?.expand() ?? null,
    carnivalReport: () => fairground.carnivalReport?.() ?? [],
    shopBuild: () => deps.gardenProps()?.shopBuildState() ?? null,
    predation: () => ({
      eaten: predationLedger.totals,
      owls: owlHunt.report().owls,
      snakes: snakeHunt.report().snakes,
      oaks: deps.gardenProps()?.propCounts().oak ?? 0,
      flock: animals.filter((animal) => animal.id === 'chicken' && !animal.isSold && (progress.animal(animal.instanceId)?.stage ?? 0) >= 3).length,
    }),
    hurryHunt: () => {
      owlHunt.hurry()
      snakeHunt.hurry()
    },
    setOwlHelium: (level) => owlHunt.setHelium(level),
    holdTime: (hold) => { deps.setClockHeld(hold) },
    scenarios: () => scenarioList,
    runScenario: async (name) => (await import('../../dev/scenarios/index')).runScenario(name, debugHarness),
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
      deps.setGardenBounds(expansion.state.bounds)
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
      for (const plant of PLANT_CATALOG) deps.gardenPlants()?.simulation.addSeeds(plant.id, count)
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
      const plant = deps.gardenPlants()?.simulation.plants.find((entry) => instanceId === undefined || entry.instanceId === instanceId)
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
      const props = deps.gardenProps()
      if (!props) return null
      const result = purchaseProp(wallet, props.inventory, id as PropId)
      salePanel.setWallet(wallet.balance)
      shedDom.refresh()
      shop.refresh()
      return result
    },
    propCounts: () => ({ ...deps.gardenProps()?.inventory.counts }),
    placeProp: (id, cellX, cellZ, rotation = 0) => deps.gardenProps()?.placeProp(id as PropId, cellX, cellZ, rotation) ?? null,
    placeFence: (fromX, fromZ, toX, toZ) => deps.gardenProps()?.placeFence(fromX, fromZ, toX, toZ) ?? null,
    propReport: () => deps.gardenProps()?.report() ?? null,
    notify: (kind, subject) => {
      if (kind === 'plant') notificationPanel.notifyPlantGrown(String(subject ?? 'Clover'))
      else notificationPanel.notifyMilestone(kind, String(subject ?? 'Pig'))
    },
    pickUpProp: (clientX, clientY) => deps.gardenProps()?.pickUpAt(clientX, clientY) ?? null,
    scene,
    uiScene: ui.scene,
    performanceSamples: () => frameTimer?.samples ?? [],
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
  const requestedScenario = deps.pageParams.get('scenario')
  if (requestedScenario) {
    void debugHarness.runScenario(requestedScenario).then(
      (id) => console.info(`[Animal Balloon Farm] scenario ready: ${id}`),
      (error) => console.error('[Animal Balloon Farm] scenario failed', error),
    )
  }
}
