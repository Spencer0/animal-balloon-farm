import type { GoodId } from '../game/animal-diet'
import { frameRenderStats, shaderProgramStats, type FarmRenderer } from '../render/backend'
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
import { PLANT_CARE_KINDS, PLANT_CATALOG, plantSpecies, type PlantCare, type PlantId, type PlantSurface, type PlantType } from '../game/plants'
import { CARE_GAME_COPY, CARE_GAME_KINDS, CARE_GAMES, type CareGameKind } from '../game/care-minigames'
import { CLOSE_UP_GAMES } from '../scene/care-games/care-game-registry'
import { createCarePicker, type CarePickerGroup } from '../ui/care-picker-dom'
import type { CareController } from '../care-controller'
import type { GreenThumb } from '../game/plant-helpers'
import { PROP_CATALOG, purchaseProp, type PropId } from '../game/farm-props'
import { UPGRADE_CATALOG, upgradeQuote, propUnlockLevel, type UpgradeId, type createUpgradeLedger } from '../game/tool-unlocks'
import { OUTDOOR_LIMITS } from '../game/animal-housing'
import { phaseOf, formatCalendarDate, calendarOf, setTimeOfDay, skipToNext, type createDayNightClock } from '../game/day-night'
import { setResidencyOverride, type AnimalStage } from '../game/animal-conditions'
import type { FarmState } from '../game/farm-state'
import type { GardenToolId } from '../scene/garden-tool-art'
import type { ShopBuildReport } from '../scene/shop-build'
import type { createWallet } from '../game/sales'
import { treasureEffects, type TreasureId, type TreasureLedger } from '../game/treasures'
import type { ChapterDef, ChapterFlags, ChapterId, ChapterSignals, FarmChapters } from '../game/farm-chapters'
import type { createPredationLedger } from '../game/predator'
import type { OwlSim, SnakeSim } from '../game/animal-hunt'
import { SIM_HZ } from '../game/sim-clock'
import type { createGardenWaterField } from '../game/garden-water'
import type { createGardenWaterMesh } from '../scene/garden-water-mesh'
import type { createJournalPanel } from '../ui/journal-panel'
import type { createNotificationPanel } from '../ui/notification-panel'
import type { createNotificationDomPanel } from '../ui/notification-dom'
import type { createSalePanel } from '../ui/sale-panel'
import type { createAnimalCard } from '../ui/animal-card-dom'
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
  /**
   * Grow until the first plant of `species` asks for `care` (water, pest or
   * prune), answering every other need on the way. Null if it never asks.
   */
  growUntilCare(care: string, species?: string, maxSteps?: number): { instanceId: number; growth: number } | null
  /**
   * Set a plant's growth (0..1) with every care stop before it answered, so the
   * next stop or maturity comes on its own in a moment of real play.
   */
  setPlantGrowth(instanceId: number, growth: number): { instanceId: number; growth: number } | null
  /** Press a plant's care marker (default: the first plant that needs care), opening its minigame. */
  startCare(instanceId?: number): unknown
  /** Where the open care minigame is: its phase and round. */
  careState(): unknown
  /** Settle the open care minigame now, won or lost. */
  settleCare(won: boolean): unknown
  /** The open close-up care game: its kind, the plant on its stage, its phase and round. Null when none is open. */
  careGame(): { kind: string | null; species: string; phase: string; snapshot: unknown; debug: unknown } | null
  /** Open a close-up game on the stage directly, no plant growing needed. Default species: the first of the kind's type. */
  playCareGame(kind: string, species?: string): { kind: string; species: string } | { error: string }
  /** The bare care stage with a species' plant on it, no game, for screenshots. */
  careStage(species: string): { species: string; type: string } | { error: string }
  /** Close the open game or bare stage. */
  closeCareStage(): unknown
  /** Ribbons and hired helpers. `hire` grants a species' chore ribbon and hires its helper for free. */
  greenThumb(hire?: { species: string; care: string }): unknown
  /** Hold a seed as if picked from the shed, so the placement preview follows the pointer. */
  armSeed(species: string): boolean
  /** Run the progression tick `steps` times, optionally with a time jump. */
  advance(steps?: number, secondsPerStep?: number): AnimalConditionReport
  /** Tick every animal model without drawing, so a capture flourish finishes in a slow headless browser. */
  fastForwardAnimals(seconds: number, secondsPerStep?: number): void
  /** Forget everything: no grass, no pond, every animal back to the carnival. */
  resetConditions(): void
  /** Where each animal is, and what it looks like right now. */
  plantReport(): readonly import('../game/plants').GardenPlant[]
  forageFor(seconds: number): readonly import('../game/animal-life').AnimalRecord[]
  placeAnimal(id: string, x: number, z: number): boolean
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
  /** Render the current scene once, with the shadow map forced to redraw, and report draw calls and triangles. Deterministic for a given scene. */
  renderSnapshot(): { readonly renderCalls: number; readonly triangles: number }
  /** WebGL's live shader programs and the newest one's id (null on WebGPU). A newer id after play started is a mid-play compile. */
  shaderPrograms(): { readonly live: number; readonly newestId: number } | null
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
  predation(): { readonly eaten: Readonly<Record<string, number>>; readonly owls: ReturnType<OwlSim['report']>['owls']; readonly snakes: ReturnType<SnakeSim['report']>['snakes']; readonly oaks: number; readonly flock: number }
  /** Freeze or release the day clock. */
  holdTime(hold: boolean): void
  /** The test scenarios you can jump into, by id. Nothing here ships. */
  scenarios(): Record<string, string>
  /** Apply a scenario to the running game, e.g. `runScenario('owl/hunt-now')`. */
  runScenario(name: string): Promise<string>
  /** Set every owl's helium, 0..1, to test the deflate-and-pop without a two-minute wait. */
  setOwlHelium(level: number): void
  /** Set the helium, 0..1, of every animal of one species, to watch it deflate without a two-minute wait. */
  setHelium(species: string, level: number): number
  /** Set the fullness, 0..1, of every adult resident of one species ('hungry' is under 0.4, 'starving' under 0.12). */
  setFullness(species: string, level: number): number
  /** Put goods in every house of one prop kind (e.g. 'barn'), up to its capacity; returns the houses touched. */
  addGoodsByProp(prop: string, good: string, count: number): number
  /** Pin how overgrazed the lawn reads, 0..1, ignoring the grass larder; null hands it back. */
  setGrazing(dryness: number | null): void
  /** Make a species lose helium when its home requirement stops being met (true), stop (false), or restore its catalog rule (null). */
  holdResidency(species: string, holds: boolean | null): void
  /** Play the tool-unlock film for a shop upgrade, optionally held at a moment, and report what it shows. */
  toolFilm(id: string, seconds?: number): unknown
  /** Play a chapter's opening film (e.g. 'care'), optionally held at a moment. Inert until main wires `chapterFilm`. */
  chapterFilm(id: string, seconds?: number): unknown
  /** Make the owls and snakes hunt as soon as they can, instead of waiting out the cooldown. */
  hurryHunt(): void
  /** Step the owl and snake hunts and any pops forward without waiting on rendered frames. */
  stepHunt(seconds: number, secondsPerStep?: number): ReturnType<OwlSim['report']>['owls']
  /** Add a tracked animal at a rung of the ladder, standing at its farm spawn; returns its id. */
  addAnimal(species: string, stage?: number): string | null
  /** Put goods in a house by its site id (see `houses()`), e.g. `addGoods('barn-1', 'milk', 5)`. */
  addGoods(houseId: string, good: string, count: number): Readonly<Record<string, number>>
  /**
   * Retire an animal's model and rebuild it the way a house door does
   * (`emerging`), so a settled resident that arrives with no flourish to play
   * can be checked for the Sell button. Resolves to its card state.
   */
  emergeAnimal(id: string): Promise<{ readonly stage: number; readonly canSell: boolean; readonly isCaptured: boolean } | null>
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
  /** Put star gems in the purse without waiting for a starhorn. */
  grantGems(amount: number): number
  /** Buy a treasure with gems through the shop's own rules. */
  buyTreasure(id: string): { readonly ok: boolean; readonly text: string }
  /** Gems, owned treasures and what they multiply. */
  treasures(): { readonly gems: number; readonly owned: readonly string[]; readonly effects: ReturnType<typeof treasureEffects> }
  /** Pin the farm's Harmony score for the sim (0..100), or null to measure it again. */
  setHarmony(value: number | null): void
  /** Open chapters up to and including `id`, announce each and apply its flags. */
  openChapter(id: ChapterId): readonly string[]
  /** Open chapters, the current one, its flags and the signals the chapter check reads. */
  chapters(): { readonly open: readonly ChapterId[]; readonly current: string; readonly flags: ChapterFlags; readonly signals: ChapterSignals }
  /** Spawn the starhorn as a resident (stage 4 by default) with Harmony pinned high and its residency held, for screenshots. */
  spawnStarhorn(stage?: number): string | null
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
  readonly renderer: FarmRenderer
  /** Arms the sun's shadow pass for the next render. */
  readonly forceShadowRedraw: () => void
  /** Re-place the animal contact decals, so a snapshot taken before any frame still counts them. */
  readonly refreshAnimalShadows: () => void
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly cameraTarget: THREE.Vector3
  readonly farmCamera: FarmCamera
  readonly wallet: ReturnType<typeof createWallet>
  readonly gems: ReturnType<typeof createWallet>
  readonly treasures: TreasureLedger
  readonly buyTreasure: (id: TreasureId) => { readonly ok: boolean; readonly text: string }
  readonly setHarmonyOverride: (value: number | null) => void
  /** Chapter state, and the same signals the frame loop reads. */
  readonly chapters: FarmChapters
  readonly chapterSignals: () => ChapterSignals
  readonly announceChapter: (def: ChapterDef) => void
  readonly applyChapterFlags: () => void
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
  readonly careController: CareController
  readonly greenThumb: GreenThumb
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
  readonly setGrazingOverride: (dryness: number | null) => void
  readonly owlHunt: Pick<OwlSim, 'huntedIds' | 'hurry' | 'setHelium' | 'reset' | 'report'>
  readonly snakeHunt: SnakeSim
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
  readonly stepAnimalWorld: (stepSeconds: number, nowSeconds: number, huntsActive: boolean) => void
  readonly presentHunts: (deltaSeconds: number, simAlpha: number) => void
  readonly bolting: Set<string>
  readonly hidingUntil: Map<string, number>
  readonly panicking: Map<string, number>
  readonly sleepBeds: Map<string, Bed>
  readonly animalLifeSnapshot: () => import('../game/animal-life').AnimalLifeSnapshot
  readonly goingIn: Map<string, { readonly houseId: string; readonly since: number }>
  readonly newbornUntil: Map<string, number>
  readonly lastHouseOf: Map<string, string>
  readonly updateHousing: (nowSeconds: number) => void
  readonly residentsOf: (selection: { readonly id: PropId; readonly siteId: string }) => import('../ui/prop-card-dom').PropResidents | null
  readonly ui: UILayer
  readonly frameTimer: FrameTimer | null
  readonly journal: ReturnType<typeof createJournalPanel>
  readonly notificationPanel: ReturnType<typeof createNotificationPanel>
  readonly notificationDom: ReturnType<typeof createNotificationDomPanel>
  readonly knownMaturePlants: Set<number>
  readonly syncGrassPack: () => void
  readonly syncOwnedTools: () => void
  readonly toolFilm: (id: string, seconds?: number) => unknown
  /** Optional until main.ts passes it: a chapter film player's start/seek, reported as the harness reads it. */
  readonly chapterFilm?: (id: string, seconds?: number) => unknown
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
  readonly selectGardenTool: (id: import('../scene/garden-tool-art').GardenToolId | null, force?: boolean) => void
  readonly syncFarmChrome: () => void
  readonly intro: (seconds?: number) => unknown
}

declare const __GARDEN_DEBUG__: boolean

/**
 * The literal `__GARDEN_DEBUG__` test sits right at the import so esbuild drops
 * the dynamic import (and with code splitting, the whole scenarios chunk) from
 * a production build instead of emitting it as an unreachable chunk.
 */
const loadScenarios = (): Promise<typeof import('../../dev/scenarios/index')> =>
  __GARDEN_DEBUG__ ? import('../../dev/scenarios/index') : Promise.reject(new Error('Scenarios are not part of production builds.'))

export function installGardenHarness(deps: GardenHarnessDeps): void {
  const {
    canvas: gameCanvas,
    wallet,
    gems,
    treasures,
    buyTreasure,
    setHarmonyOverride,
    chapters,
    chapterSignals,
    announceChapter,
    applyChapterFlags,
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
    stepAnimalWorld,
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
  /**
   * One render of the current scene, reporting its draw calls and triangles.
   * The shadow map is forced to redraw first: it normally redraws only when the
   * sun or the casters move, so without this the count would depend on whether
   * that redraw happened to land in this render. Same scene, same count.
   */
  const renderSnapshot = (): { renderCalls: number; triangles: number } => {
    const previousAutoReset = renderer.info.autoReset
    try {
      renderer.info.autoReset = true
      renderer.info.reset()
      deps.forceShadowRedraw()
      deps.refreshAnimalShadows()
      renderer.render(scene, camera)
      return frameRenderStats(renderer)
    } finally {
      renderer.info.autoReset = previousAutoReset
      renderer.info.reset()
    }
  }
  let scenarioList: Record<string, string> = {}
  void loadScenarios().then((module) => { scenarioList = module.listScenarios() })
  const debugHarness: GardenDebugHarness = {
    enabled: true,
    intro: (seconds) => deps.intro(seconds),
    toolFilm: (id, seconds) => deps.toolFilm(id, seconds),
    chapterFilm: (id, seconds) => deps.chapterFilm?.(id, seconds) ?? null,
    holdResidency: (species, holds) => { setResidencyOverride(species, holds) },
    setFullness: (species, level) => {
      let changed = 0
      for (const record of deps.progress.all()) {
        if (record.species !== species || record.stage < 3) continue
        deps.progress.setFullness(record.id, level)
        changed += 1
      }
      return changed
    },
    addGoodsByProp: (prop, good, count) => {
      let touched = 0
      for (const house of deps.houseSpots()) {
        if (house.prop !== prop) continue
        deps.progress.addGoods(house.id, good as GoodId, count)
        touched += 1
      }
      return touched
    },
    setGrazing: (dryness) => deps.setGrazingOverride(dryness),
    setHelium: (species, level) => {
      let changed = 0
      for (const record of deps.progress.all()) {
        if (record.species !== species || record.stage < 3) continue
        deps.progress.setHelium(record.id, level)
        changed += 1
      }
      return changed
    },
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
    selectTool: (tool) => selectGardenTool(tool, true),
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
    growUntilCare: (care, species = 'blueberry', maxSteps = 600) => {
      const simulation = deps.gardenPlants()?.simulation
      if (!simulation) return null
      for (let step = 0; step < maxSteps; step += 1) {
        const target = simulation.plants.find((plant) => plant.species === species)
        if (!target) return null
        if (target.careNeeded === care) return { instanceId: target.instanceId, growth: target.growth }
        for (const plant of simulation.plants) {
          if (plant.careNeeded) simulation.resolveCare(plant.instanceId, plant.careNeeded)
        }
        simulation.tick(0.5)
      }
      return null
    },
    setPlantGrowth: (instanceId, growth) => {
      const simulation = deps.gardenPlants()?.simulation
      const target = simulation?.plants.find((plant) => plant.instanceId === instanceId)
      if (!simulation || !target) return null
      const clamped = Math.min(1, Math.max(0, growth))
      const stops = plantSpecies(target.species).care
      const state = simulation.exportState()
      simulation.importState({
        ...state,
        plants: state.plants.map((plant) => plant.instanceId !== instanceId ? plant : {
          ...plant,
          growth: clamped,
          careNeeded: null,
          stopsDone: stops.filter((stop) => stop.at < clamped).length,
        }),
      })
      return { instanceId, growth: clamped }
    },
    startCare: (instanceId) => {
      const plant = deps.gardenPlants()?.simulation.plants.find((entry) => (instanceId === undefined ? entry.careNeeded !== null : entry.instanceId === instanceId))
      if (!plant?.careNeeded) return { ok: false, failure: 'no-care-needed' }
      deps.careController.startGame(plant, plant.careNeeded)
      return { ok: true, care: plant.careNeeded, playing: deps.careController.playing, rain: deps.careController.rain.active }
    },
    careGame: () => {
      const player = deps.careController.player
      if (!player) return null
      const described = player.describe()
      return { kind: player.kind, species: player.species, phase: described.phase, snapshot: described.snapshot, debug: described.debug }
    },
    playCareGame: (kind, species) => {
      if (!CARE_GAME_KINDS.includes(kind as CareGameKind)) return { error: `unknown game ${kind}` }
      return deps.careController.openDebugGame(kind as CareGameKind, species as PlantId | undefined)
    },
    careStage: (species) => {
      if (!PLANT_CATALOG.some((entry) => entry.id === species)) return { error: `unknown species ${species}` }
      return deps.careController.showStage(species as PlantId)
    },
    closeCareStage: () => {
      deps.careController.closeDebug()
      return { playing: deps.careController.playing }
    },
    careState: () => ({
      playing: deps.careController.playing,
      rain: deps.careController.rain.active,
      game: deps.careController.player?.describe() ?? null,
      greenThumb: deps.greenThumb.exportState(),
    }),
    settleCare: (won) => {
      if (deps.careController.player) deps.careController.player.settle(won)
      else deps.careController.rain.settle(won)
      return { playing: deps.careController.playing, rain: deps.careController.rain.active }
    },
    armSeed: (species) => {
      const garden = deps.gardenPlants()
      if (!garden || !PLANT_CATALOG.some((entry) => entry.id === species)) return false
      gardenTools?.setPlantingMode(true)
      garden.selectSpecies(species as PlantId)
      return garden.selectedSpecies === species
    },
    greenThumb: (hire) => {
      if (hire && PLANT_CARE_KINDS.includes(hire.care as PlantCare)) {
        deps.greenThumb.earnRibbon(hire.species as PlantId, hire.care as PlantCare)
        deps.greenThumb.hire(hire.species as PlantId, hire.care as PlantCare, 0, () => true)
      }
      return deps.greenThumb.exportState()
    },
    advance: (steps = 1, secondsPerStep = 1 / 30) => {
      for (let step = 0; step < steps; step += 1) {
        const events = progress.tick(animalLifeSnapshot(), secondsPerStep)
        handleAnimalLifeEvents(events)
      }
      return reportConditions()
    },
    fastForwardAnimals: (seconds) => {
      // The sim owns movement now, so tick it at its own rate (like stepHunt) and let the
      // views catch up on each tick; `secondsPerStep` no longer applies.
      const stepSeconds = 1 / SIM_HZ
      const steps = Math.max(0, Math.ceil(seconds / stepSeconds))
      let simulatedSeconds = performance.now() / 1000
      for (let step = 0; step < steps; step += 1) {
        simulatedSeconds += stepSeconds
        stepAnimalWorld(stepSeconds, simulatedSeconds, false)
        animals.forEach((animal) => animal.update(stepSeconds, 1))
      }
    },
    resetConditions: () => {
      gardenTools?.clearGrass()
      remeasureMeadow()
      upgrades.reset()
      gardenTools?.setGrassPack('short')
      deps.syncOwnedTools()
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
      void Promise.all(progress.all().map((record) => createAnimalInstance(record, undefined, true))).then((created) => {
        for (const animal of created) {
          farmHomes.set(animal.instanceId, { parent: animal.root.parent ?? fairground.root, position: animal.root.position.clone() })
        }
      })
      measureFarm()
      reportConditions()
    },
    plantReport: () => deps.gardenPlants()?.simulation.plants ?? [],
    forageFor: (seconds: number) => {
      const step = 1 / SIM_HZ
      for (let elapsed = 0; elapsed < Math.min(180, Math.max(0, seconds)); elapsed += step) {
        deps.gardenPlants()?.simulation.tick(step)
        deps.stepAnimalWorld(step, performance.now() / 1000, true)
        handleAnimalLifeEvents(progress.tick(animalLifeSnapshot(), step))
        animals.forEach((animal) => animal.update(step, 1))
      }
      return progress.all().filter((animal) => animal.species === 'squirrel')
    },
    placeAnimal: (id: string, x: number, z: number) => {
      const animal = animalById.get(id)
      if (!animal) return false
      animal.placeAt(x, z)
      return true
    },
    animalReport: () => animals.filter((animal) => !animal.isSold).map((animal) => ({
      id: animal.instanceId,
      species: animal.id,
      name: animalNames.get(animal.instanceId),
      stage: animal.stage,
      appearance: animal.appearance,
      heartEyes: animal.heartEyeCount > 0,
      heartCount: animal.heartEyeCount,
      helium: deps.progress.animal(animal.instanceId)?.helium ?? 1,
      x: +animal.root.position.x.toFixed(2),
      z: +animal.root.position.z.toFixed(2),
      loose: isLoose(animal.instanceId),
      atFarm: animal.isAtFarm,
      residencyPending: animal.isResidencyPending,
      sleeping: animal.isSleeping,
      eating: animal.isEating,
      fruitEaten: progress.animal(animal.instanceId)?.fruitEaten ?? {},
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
      return { count, ...renderSnapshot() }
    },
    renderSnapshot,
    shaderPrograms: () => shaderProgramStats(renderer),
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
      'growUntilCare / startCare / settleCare': "growUntilCare('pest') then startCare() opens the swat game; settleCare(true) wins it.",
      setPlantGrowth: 'setPlantGrowth(id, 0.49) parks a plant just before a care stop (or 0.99 before maturity); real play takes it from there.',
      'careGame / playCareGame / careStage / closeCareStage': "playCareGame('buzz') opens a game on the stage with no plant growing (default species: the first of its type; unbuilt games say so). careStage('poppy') shows the bare stage; closeCareStage() ends it. URL: ?gardenDebug=1&careGame=<kind>[&careSpecies=<id>] opens a game at load; &careGames=1 shows a picker of all fifteen.",
      greenThumb: "greenThumb({ species: 'blueberry', care: 'water' }) hires the Pet Raincloud for free.",
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
      renderSnapshot: 'renderSnapshot() — render the current scene once (shadows forced); returns calls/tris.',
      shaderPrograms: 'shaderPrograms() — { live, newestId } of WebGL shader programs (null on WebGPU); a newer id after play started is a mid-play compile.',
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
    runScenario: async (name) => {
      // A scenario is a state to look at, not a farm to play from day one: every
      // chapter is open, quietly (no letters or films), so goods and hunters work.
      // A scenario about chapters closes them again itself.
      chapters.openThrough('mythical')
      applyChapterFlags()
      return (await loadScenarios()).runScenario(name, debugHarness)
    },
    stepHunt: (seconds) => {
      // Tick the sim directly, the way the frame loop does: animals walk, collide, then the
      // hunts decide. `secondsPerStep` no longer applies; the sim only runs at its own rate.
      const stepSeconds = 1 / SIM_HZ
      const steps = Math.max(0, Math.round(seconds / stepSeconds))
      let simulatedSeconds = performance.now() / 1000
      for (let step = 0; step < steps; step += 1) {
        simulatedSeconds += stepSeconds
        stepAnimalWorld(stepSeconds, simulatedSeconds, true)
        animals.forEach((animal) => animal.update(stepSeconds, 1))
        presentHunts(stepSeconds, 1)
      }
      return owlHunt.report().owls
    },
    addGoods: (houseId, good, count) => {
      progress.debugAddGoods(houseId, good as GoodId, count)
      return progress.goodsIn(houseId) as Readonly<Record<string, number>>
    },
    addAnimal: (species, stage = 3) => {
      const record = progress.add(species, Math.max(0, Math.min(4, Math.floor(stage))) as AnimalStage)
      if (!record) return null
      // Well inside the fence, so a settled animal is actually at the farm and not queued at the gate.
      const slot = harnessSpawnCount++ % 8
      void createAnimalInstance(record, { x: -3.5 + (slot % 4) * 1.6, z: 2.6 + Math.floor(slot / 4) * 1.5 })
      return record.id
    },
    emergeAnimal: async (id) => {
      const old = animalById.get(id)
      const record = progress.animal(id)
      if (!old || !record) return null
      const at = { x: old.currentPosition.x, z: old.currentPosition.z }
      animalById.delete(id)
      const index = animals.indexOf(old)
      if (index >= 0) animals.splice(index, 1)
      farmHomes.delete(id)
      old.dispose()
      const created = await createAnimalInstance(record, at, true)
      created.placeAt(at.x, at.z)
      return { stage: created.stage, canSell: created.canSell, isCaptured: created.isCaptured }
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
    grantGems: (amount) => {
      const balance = gems.credit(amount)
      shedDom.refresh()
      shop.refresh()
      return balance
    },
    buyTreasure: (id) => buyTreasure(id as TreasureId),
    treasures: () => ({ gems: gems.balance, owned: treasures.owned(), effects: treasureEffects(treasures.owned()) }),
    setHarmony: (value) => {
      setHarmonyOverride(value)
    },
    openChapter: (id) => {
      const opened = chapters.openThrough(id)
      for (const def of opened) announceChapter(def)
      applyChapterFlags()
      return opened.map((def) => def.id)
    },
    chapters: () => ({
      open: chapters.exportState().open,
      current: chapters.current().id,
      flags: chapters.flags(),
      signals: chapterSignals(),
    }),
    spawnStarhorn: (stage = 4) => {
      setHarmonyOverride(100)
      setResidencyOverride('starhorn', false)
      // There is only one starhorn: promote the one waiting at the carnival and walk it in, rather than adding a twin.
      const waiting = animals.find((entry) => entry.id === 'starhorn' && !entry.isSold)
      if (!waiting) return debugHarness.addAnimal('starhorn', stage)
      const rung = Math.max(0, Math.min(4, Math.floor(stage))) as AnimalStage
      handleAnimalLifeEvents(progress.setStage(waiting.instanceId, rung))
      waiting.stage = rung
      waiting.placeAt(-3.5, 2.6)
      // Rebuild it the way a house door does, already in its own colours and on the lawn rather than walking in from the tents.
      void debugHarness.emergeAnimal(waiting.instanceId)
      return waiting.instanceId
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
  installCareDebugUrls(deps, debugHarness)
  // ?scenario=owl/hunt-now jumps straight into a saved test state on load.
  const requestedScenario = deps.pageParams.get('scenario')
  if (requestedScenario) {
    void debugHarness.runScenario(requestedScenario).then(
      (id) => console.info(`[Animal Balloon Farm] scenario ready: ${id}`),
      (error) => console.error('[Animal Balloon Farm] scenario failed', error),
    )
  }
}

/**
 * ?careGame=<kind>[&careSpecies=<id>] opens that game at load, and ?careGames=1
 * shows the picker of every game. Both skip the main menu.
 */
function installCareDebugUrls(deps: GardenHarnessDeps, harness: { closeMenu(): void; playCareGame(kind: string, species?: string): unknown }): void {
  const { pageParams, careController } = deps
  const requested = pageParams.get('careGame')
  const speciesParam = pageParams.get('careSpecies') ?? undefined
  if (requested) {
    harness.closeMenu()
    harness.playCareGame(requested, speciesParam)
    return
  }
  if (!pageParams.has('careGames')) return
  harness.closeMenu()
  const types: Array<{ type: PlantType; label: string }> = [
    { type: 'flower', label: 'Flower' },
    { type: 'water', label: 'Water plant' },
    { type: 'bush', label: 'Bush' },
    { type: 'root', label: 'Root vegetable' },
    { type: 'vine', label: 'Vine' },
  ]
  const groups: CarePickerGroup[] = types.map(({ type, label }) => {
    const plants = PLANT_CATALOG.filter((entry) => entry.careType === type).map((entry) => ({ id: entry.id, name: entry.name }))
    return {
      type: label,
      games: PLANT_CARE_KINDS.map((care) => {
        const kind = CARE_GAMES[type][care]
        // The rain cloud is played on the farm, not close up, so it is listed but not a button.
        const closeUp = kind !== 'rain' && CLOSE_UP_GAMES[kind].create !== null
        return {
          kind,
          chore: kind === 'rain' ? `${CARE_GAME_COPY[kind].chore} (on the farm)` : CARE_GAME_COPY[kind].chore,
          built: closeUp,
          species: plants,
        }
      }),
    }
  })
  const picker = createCarePicker(groups, (kind, species) => {
    picker.hide()
    const opened = harness.playCareGame(kind, species)
    if (typeof opened === 'object' && opened !== null && 'error' in opened) picker.show()
  })
  careController.onClosed(() => picker.show())
  picker.show()
}
