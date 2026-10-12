import { CARNIVAL_STARTERS, DISCOVERY, NIGHT_ONLY_SPECIES, holdsResidency, isNightOnly, isUniqueSpecies, conditionMetricLabel, getSpeciesConditions, type AnimalStage, stageAppearance, stageHasHeartEyes } from './animal-conditions'
import { requirementMet, type FarmSnapshot, type RequirementStatus } from './animal-progress'
import { farmMetric } from './farm-state'
import { stepHelium } from './predator'
import { freeRoomFor, HOUSE_CAPACITY, houseAccepts, houseWithRoom, occupantsByHouse, OUTDOOR_LIMITS, type HouseSite } from './animal-housing'
import type { ProgressAction } from './farm-progression'
import { createFoodWeb, DIETS, GOODS, HOUSE_GOODS_CAPACITY, hungerLevel, isPredatorDiet, PREDATOR_HUNTS_BELOW, catchMeal, PRODUCE, produceRate, servingOrder, SPOILED_SCRAPS, type FoodBoosts, type FoodReport, type FoodWebState, type GoodId, type HungerLevel } from './animal-diet'
import { DAY_LENGTH_SECONDS } from './day-night'

export interface SpeciesAnimalTuning {
  readonly visitDelaySeconds?: number
  readonly enterFarmSeconds?: number
  /** Seconds between births for one breeding pair with room in a house. */
  readonly breedIntervalSeconds?: number
  readonly babyDurationSeconds?: number
}

/** How many animals of a species turn up together, inclusive. */
export interface PackSize {
  readonly min: number
  readonly max: number
}

/**
 * Herd animals arrive as a small pack; loners and night hunters come alone.
 * A species left out here always arrives singly.
 */
export const DEFAULT_PACK_SIZES: Readonly<Record<string, PackSize>> = {
  cow: { min: 1, max: 2 },
  sheep: { min: 2, max: 4 },
  pig: { min: 1, max: 2 },
  chicken: { min: 2, max: 3 },
  duck: { min: 2, max: 4 },
  goose: { min: 2, max: 3 },
  mouse: { min: 2, max: 3 },
  rat: { min: 2, max: 3 },
  raccoon: { min: 1, max: 2 },
}

export interface AnimalLifeConfig {
  readonly visitDelaySeconds: number
  readonly enterFarmSeconds: number
  readonly arrivalIntervalSeconds: number
  /**
   * Animals of one species the farm keeps out in the open. Anyone past this
   * needs room in a house.
   */
  readonly unhousedPerSpecies: number
  /** Animals each house holds. */
  readonly houseCapacity: number
  /** Hard ceiling on tracked animal records, a guard against runaway breeding. */
  readonly maximumPopulation: number
  readonly breedIntervalSeconds: number
  /** Breeding speeds up with more pairs, up to this many at once. */
  readonly maxBreedingPairs: number
  readonly babyDurationSeconds: number
  readonly maxNewVisitorsPerTick: number
  /**
   * Seconds before a species can be seen again after one of its animals was sold
   * or lost. Each cooldown is stretched by a random factor, so a sale never
   * summons an instant replacement.
   */
  readonly replacementCooldownSeconds: number
  /** Animals loose on the grounds at once on a bare plot, and the extra for each farm expansion. */
  readonly groundsVisitorsBase: number
  readonly groundsVisitorsPerLevel: number
  /** Seconds a visitor whose farm is not ready browses the grounds before it wanders off. */
  readonly visitStaySeconds: number
  /** Seconds a leaving visitor takes to walk out of sight. */
  readonly departSeconds: number
  readonly packSizes: Readonly<Record<string, PackSize>>
  readonly adultScale: number
  readonly species?: Readonly<Record<string, SpeciesAnimalTuning>>
}

export const ANIMAL_LIFE_CONFIG: AnimalLifeConfig = {
  visitDelaySeconds: 22,
  enterFarmSeconds: 8,
  arrivalIntervalSeconds: 20,
  unhousedPerSpecies: OUTDOOR_LIMITS.perSpecies,
  houseCapacity: HOUSE_CAPACITY,
  maximumPopulation: 400,
  breedIntervalSeconds: 150,
  maxBreedingPairs: 3,
  babyDurationSeconds: 60,
  maxNewVisitorsPerTick: 1,
  replacementCooldownSeconds: 120,
  groundsVisitorsBase: 4,
  groundsVisitorsPerLevel: 2,
  visitStaySeconds: 150,
  departSeconds: 18,
  packSizes: DEFAULT_PACK_SIZES,
  adultScale: 1,
}

/** Random stretch factors: no two waits, arrivals or visits come out the same. */
const ARRIVAL_FACTOR = { min: 0.5, max: 1.8 } as const
const DWELL_FACTOR = { min: 0.6, max: 2.2 } as const
const COOLDOWN_FACTOR = { min: 0.75, max: 1.5 } as const
const STAY_FACTOR = { min: 0.7, max: 1.6 } as const
/** A pack's followers decide to step inside a few seconds after their leader. */
const PACK_FOLLOW_SECONDS = 4

export interface AnimalRecord {
  readonly id: string
  readonly species: string
  readonly stage: AnimalStage
  readonly elapsed: number
  /** The house it is inside right now, or null when it is out on the farm. */
  readonly insideId: string | null
  readonly appearance: 'wild' | 'standard'
  readonly heartEyes: boolean
  readonly invited: boolean
  readonly baby: boolean
  readonly ageSeconds: number
  readonly growth: number
  readonly parentIds: readonly string[]
  readonly adultScale: number
  /**
   * 1 = full of helium, 0 = flat. Only a resident whose species holds its
   * residency ever drops below 1: it drains while the farm no longer suits it.
   */
  readonly helium: number
  /** True while a resident's home requirement is unmet and its helium is leaking. */
  readonly unsettled: boolean
  /** True while a visitor that will not be staying is walking off the grounds. */
  readonly departing: boolean
  /** Animals that arrived together share a pack id; null for one that came alone. */
  readonly packId: string | null
  /** 1 = just ate, 0 = empty. Only residents eat, so a visitor reads full. */
  readonly fullness: number
  readonly hunger: HungerLevel
}

export interface AnimalLifeEvent {
  readonly kind: 'arriveCarnival' | 'departCarnival' | 'enterFarm' | 'settle' | 'fallInLove' | 'birth' | 'growUp' | 'unsettle' | 'resettle' | 'deflate'
    /** A resident's belly crossed a rung of the hunger ladder (`hunger` says which). */
    | 'hunger'
    /** A resident made a good. `houseId` is where it was stored; a gem has none. */
    | 'produce'
  readonly animalId?: string
  /** For an arrival in a pack: the animal it came with. The leader has none. */
  readonly leaderId?: string
  /** For a birth: the two parents. */
  readonly parentIds?: readonly string[]
  /** For a birth: the house the baby was born in. */
  readonly houseId?: string
  readonly species: string
  readonly stage?: AnimalStage
  readonly action?: ProgressAction
  /** For a hunger event: the rung it is on now. */
  readonly hunger?: HungerLevel
  /** For a deflate: it went flat because it starved, or because the farm stopped suiting it. */
  readonly reason?: 'starved' | 'unsuited'
  /** For a produce event. */
  readonly good?: GoodId
}

export interface AnimalLifeSnapshot {
  readonly farm: FarmSnapshot
  readonly expansionLevel: number
  readonly positions?: Readonly<Record<string, { readonly x: number; readonly z: number }>>
  /** Houses standing on the farm. Missing means none. */
  readonly houses?: readonly HouseSite[]
}

export interface HousingReport {
  /** Room across every house, and how many animals are inside. */
  readonly capacity: number
  readonly used: number
}

/**
 * One animal as saved: the whole mutable record. `inside` says it was indoors.
 * House ids are rebuilt every session, so the caller puts it back into a house
 * of its kind after loading rather than the sim trusting an old id.
 */
export interface SavedAnimal {
  readonly id: string
  readonly species: string
  readonly stage: number
  readonly elapsed: number
  readonly invited: boolean
  readonly baby: boolean
  readonly ageSeconds: number
  readonly parentIds: readonly string[]
  readonly inside?: boolean
  /** Helium left, 0..1; absent in older saves, which read as full. */
  readonly helium?: number
  /** Fullness, 0..1; absent in older saves, which read as full. */
  readonly fullness?: number
}

/** Goods waiting in one house, saved by where the house stands (house ids are per session). */
export interface SavedHouseGoods {
  readonly prop: string
  readonly x: number
  readonly z: number
  readonly goods: Readonly<Partial<Record<GoodId, number>>>
}

/**
 * Everything `createAnimalLife` needs to carry on where a farm left off. Saves
 * from before houses also carry eggs and courtships; those fields are ignored.
 */
export interface AnimalLifeState {
  readonly animals: readonly SavedAnimal[]
  readonly discovered: readonly string[]
  readonly pendingVisitors: readonly string[]
  readonly nextAnimalId: number
  readonly arrivalElapsed: number
  /** Larders. Absent in older saves, which start every larder full. */
  readonly food?: FoodWebState
  readonly goods?: readonly SavedHouseGoods[]
}

export interface LifeRules {
  readonly starvation: boolean
  readonly goods: boolean
  readonly discoverable: (species: string) => boolean
}

export interface AnimalLifeOptions {
  readonly config?: Partial<AnimalLifeConfig>
  readonly random?: () => number
}

export interface AnimalLife {
  all(): readonly AnimalRecord[]
  /** Add a tracked animal record, used by deterministic load/scale harnesses. */
  add(species: string, stage?: AnimalStage, baby?: boolean): AnimalRecord | null
  animal(id: string): AnimalRecord | undefined
  statusOf(id: string): readonly RequirementStatus[]
  tick(snapshot: AnimalLifeSnapshot, deltaSeconds: number): readonly AnimalLifeEvent[]
  setStage(id: string, stage: AnimalStage): readonly AnimalLifeEvent[]
  discover(species: string): readonly AnimalLifeEvent[]
  remove(id: string): AnimalRecord | null
  /** Set an animal's helium outright, 0..1. The debug harness and the tests use it. */
  setHelium(id: string, level: number): void
  /** Room across every house, and how many animals are inside. */
  housing(): HousingReport
  /** Whether a species could take one more animal: a spare place outdoors or room in a house. */
  hasRoomFor(species: string): boolean
  /**
   * Take an animal indoors. Refused for a visitor, a house that is gone or does
   * not take its species, or a full house.
   */
  enterHouse(id: string, houseId: string): boolean
  /** Bring an animal back out onto the farm. */
  leaveHouse(id: string): void
  /** Every larder: stock, size, and what is grown and eaten of it a day. */
  foodReport(): readonly FoodReport[]
  /** Put bought feed (meals) in the pantry. */
  addFeed(meals: number): void
  /**
   * Which rules are switched on (the chapters in `farm-chapters.ts` decide).
   * `starvation` off: a starving balloon keeps its helium, so hunger only
   * stops breeding. `goods` off: residents make nothing. `discoverable` says
   * whether a species may be discovered at all; a species it refuses waits.
   */
  setRules(rules: Partial<LifeRules>): void
  /** Set what the farm's gem treasures multiply food by. */
  setFoodBoosts(boosts: FoodBoosts): void
  /** How fast a starving balloon leaks helium, as a share of the normal rate (1 = normal, 0.5 = the Helium Pump). A farm that stopped suiting it still leaks at full speed. */
  setStarveLeakFactor(factor: number): void
  /** Set an animal's fullness outright, 0..1. The debug harness and the tests use it. */
  setFullness(id: string, level: number): void
  /** True while a predator should be out hunting: any visitor still earning its home, or a hungry resident. */
  wantsToHunt(id: string): boolean
  /** A predator caught something: it fills up. */
  feedCatch(id: string): void
  /** Put goods in a house outright, up to its capacity. The debug harness and the tests use it. */
  addGoods(houseId: string, good: GoodId, count: number): void
  /** Goods waiting in one house. */
  goodsIn(houseId: string): Readonly<Partial<Record<GoodId, number>>>
  /** Debug only: put goods in a house, capped like real ones. The garden harness uses it. */
  debugAddGoods(houseId: string, good: GoodId, count: number): void
  /** Take every good out of a house. Returns what was in it. */
  collectGoods(houseId: string): readonly { readonly good: GoodId; readonly count: number }[]
  reset(): void
  /** A plain-data copy of the whole simulation, for saving. */
  exportState(): AnimalLifeState
  /**
   * Replace the simulation with a saved one. Unknown species and malformed
   * entries are dropped rather than trusted, so an old or hand-edited save can
   * not put the farm in a state the rules could never reach.
   */
  importState(state: AnimalLifeState): void
}

interface MutableAnimal {
  id: string
  species: string
  stage: AnimalStage
  elapsed: number
  invited: boolean
  baby: boolean
  ageSeconds: number
  parentIds: readonly string[]
  insideId: string | null
  helium: number
  unsettled: boolean
  /** Seconds at stage 1 before it steps onto the farm, and at stage 2 before it settles. */
  visitAfter: number
  enterAfter: number
  /** Seconds a visitor browses the grounds before giving up on a farm that does not suit it. */
  stayLimit: number
  /** Seconds left of its walk off the grounds, or null while it is staying. */
  leaving: number | null
  packId: string | null
  fullness: number
  /** The rung of the hunger ladder last reported, so a change is told once. */
  hunger: HungerLevel
  /** Fraction of the next good made so far. */
  making: number
}

export function createAnimalLife(speciesIds: readonly string[], options: AnimalLifeOptions = {}): AnimalLife {
  const config: AnimalLifeConfig = { ...ANIMAL_LIFE_CONFIG, ...options.config }
  const animals = new Map<string, MutableAnimal>()
  const discovered = new Set<string>()
  const pendingVisitors: string[] = []
  let nextAnimalId = 1
  let arrivalElapsed = 0
  let lastSnapshot: AnimalLifeSnapshot | null = null
  let houses: readonly HouseSite[] = []
  /** Seconds each species has spent ready to breed since its last birth. */
  const breedElapsed = new Map<string, number>()
  let nextParent = 0
  let nextPackId = 1
  const random = options.random ?? Math.random
  const foodWeb = createFoodWeb()
  let foodBoosts: FoodBoosts = {}
  let rules: LifeRules = { starvation: true, goods: true, discoverable: () => true }
  let starveLeakFactor = 1
  /** Goods waiting in each house, by house id. */
  const houseGoods = new Map<string, Map<GoodId, number>>()
  /** Goods from a save, waiting for this session's houses to be known. */
  let pendingGoods: SavedHouseGoods[] = []
  /** Seconds left before a species may arrive again, after one of its animals left for good. */
  const cooldowns = new Map<string, number>()
  const between = (range: { readonly min: number; readonly max: number }): number => range.min + random() * (range.max - range.min)
  const rollArrivalWait = (): number => config.arrivalIntervalSeconds * between(ARRIVAL_FACTOR)
  let arrivalWait = rollArrivalWait()

  function tuningFor(species: string): Required<SpeciesAnimalTuning> {
    return {
      visitDelaySeconds: config.species?.[species]?.visitDelaySeconds ?? config.visitDelaySeconds,
      enterFarmSeconds: config.species?.[species]?.enterFarmSeconds ?? config.enterFarmSeconds,
      breedIntervalSeconds: config.species?.[species]?.breedIntervalSeconds ?? config.breedIntervalSeconds,
      babyDurationSeconds: config.species?.[species]?.babyDurationSeconds ?? config.babyDurationSeconds,
    }
  }

  function newAnimal(species: string, stage: AnimalStage, baby = false, parentIds: readonly string[] = []): MutableAnimal {
    const id = `animal-${nextAnimalId++}`
    const animal: MutableAnimal = {
      id,
      species,
      stage,
      elapsed: 0,
      invited: stage >= 2,
      baby,
      ageSeconds: 0,
      parentIds,
      insideId: null,
      helium: 1,
      unsettled: false,
      visitAfter: 0,
      enterAfter: 0,
      stayLimit: Number.POSITIVE_INFINITY,
      leaving: null,
      packId: null,
      fullness: 1,
      hunger: 'full',
      making: 0,
    }
    rollWaits(animal)
    animals.set(id, animal)
    return animal
  }

  function view(animal: MutableAnimal): AnimalRecord {
    const growth = animal.baby ? Math.min(1, 0.1 + 0.9 * animal.ageSeconds / Math.max(0.001, tuningFor(animal.species).babyDurationSeconds)) : 1
    return {
      id: animal.id,
      species: animal.species,
      stage: animal.stage,
      elapsed: animal.elapsed,
      insideId: animal.insideId,
      appearance: stageAppearance(animal.stage),
      heartEyes: stageHasHeartEyes(animal.stage),
      invited: animal.invited,
      baby: animal.baby,
      ageSeconds: animal.ageSeconds,
      growth,
      parentIds: animal.parentIds,
      adultScale: config.adultScale,
      helium: animal.helium,
      unsettled: animal.unsettled,
      departing: animal.leaving !== null,
      packId: animal.packId,
      fullness: animal.fullness,
      hunger: hungerLevel(animal.fullness),
    }
  }

  /** Roll how long an animal lingers at the rung it has just reached. */
  function rollWaits(animal: MutableAnimal): void {
    const tuning = tuningFor(animal.species)
    if (animal.stage === 1) {
      animal.visitAfter = tuning.visitDelaySeconds * between(DWELL_FACTOR)
      animal.stayLimit = config.visitStaySeconds * between(STAY_FACTOR)
    } else if (animal.stage === 2) {
      animal.enterAfter = tuning.enterFarmSeconds * between(DWELL_FACTOR)
    }
  }

  function startCooldown(species: string, scale = 1): void {
    cooldowns.set(species, config.replacementCooldownSeconds * scale * between(COOLDOWN_FACTOR))
  }

  function eventsFor(animal: MutableAnimal, to: AnimalStage, events: AnimalLifeEvent[], action = true): void {
    if (to <= animal.stage) return
    for (let stage = animal.stage + 1; stage <= to; stage += 1) {
      const rung = stage as AnimalStage
      animal.stage = rung
      animal.elapsed = 0
      animal.invited ||= rung >= 2
      rollWaits(animal)
      const kind = rung === 1 ? 'arriveCarnival' : rung === 2 ? 'enterFarm' : rung === 3 ? 'settle' : 'fallInLove'
      events.push({ kind, animalId: animal.id, species: animal.species, stage: rung, ...(action && (rung === 1 || rung === 3) ? { action: rung === 1 ? 'visitSpecies' : 'residentSpecies' } : {}) })
    }
  }

  function hasPopulationSlot(): boolean {
    return animals.size < config.maximumPopulation
  }

  function populationBySpecies(species: string): number {
    return [...animals.values()].filter((animal) => animal.species === species && animal.stage > 0).length
  }

  function occupancy(): ReadonlyMap<string, number> {
    return occupantsByHouse([...animals.values()])
  }

  /** An animal whose house was sold or stored is back out on the farm. */
  function evictFromMissingHouses(): void {
    const standing = new Map(houses.map((house) => [house.id, house]))
    for (const animal of animals.values()) {
      if (!animal.insideId) continue
      const house = standing.get(animal.insideId)
      if (!house || !houseAccepts(house.prop, animal.species)) animal.insideId = null
    }
  }

  /** How many more of a species the farm could take: spare outdoor places plus free beds. */
  function roomLeftFor(species: string): number {
    if (!hasPopulationSlot()) return 0
    let outdoors = 0
    for (const animal of animals.values()) {
      if (animal.species === species && animal.stage > 0 && !animal.insideId) outdoors += 1
    }
    return Math.max(0, config.unhousedPerSpecies - outdoors) + freeRoomFor(species, houses, occupancy(), config.houseCapacity)
  }

  function hasRoomFor(species: string): boolean {
    return roomLeftFor(species) > 0
  }

  function packSizeFor(species: string): number {
    const size = config.packSizes[species]
    if (!size) return 1
    const min = Math.max(1, Math.floor(size.min))
    const max = Math.max(min, Math.floor(size.max))
    return min + Math.floor(random() * (max - min + 1))
  }

  /**
   * Births. A species breeds while it has two adults that love the farm and a
   * house with room; with more pairs it breeds faster. The baby is born
   * indoors, in the emptiest house that takes its species.
   */
  function breed(dt: number, events: AnimalLifeEvent[]): void {
    const adultsBySpecies = new Map<string, MutableAnimal[]>()
    /** A species with anyone going hungry has no young: the herd is at its food. */
    const shortOfFood = new Set<string>()
    for (const animal of animals.values()) {
      if (animal.stage >= 3 && isHungry(animal)) shortOfFood.add(animal.species)
      if (animal.baby || animal.stage < 4 || isHungry(animal)) continue
      const list = adultsBySpecies.get(animal.species) ?? []
      list.push(animal)
      adultsBySpecies.set(animal.species, list)
    }
    for (const species of speciesIds) {
      if (shortOfFood.has(species)) continue
      const adults = adultsBySpecies.get(species) ?? []
      const pairs = Math.min(config.maxBreedingPairs, Math.floor(adults.length / 2))
      const house = pairs > 0 && hasPopulationSlot() ? houseWithRoom(species, houses, occupancy(), config.houseCapacity) : null
      if (!house) continue
      const elapsed = (breedElapsed.get(species) ?? 0) + dt * pairs
      if (elapsed < tuningFor(species).breedIntervalSeconds) {
        breedElapsed.set(species, elapsed)
        continue
      }
      breedElapsed.set(species, 0)
      const first = adults[nextParent % adults.length]
      const second = adults[(nextParent + 1) % adults.length]
      nextParent += 1
      const baby = newAnimal(species, 3, true, [first.id, second.id])
      baby.insideId = house.id
      events.push({ kind: 'birth', animalId: baby.id, parentIds: [first.id, second.id], houseId: house.id, species, action: 'breedSpecies' })
    }
  }

  function isHungry(animal: MutableAnimal): boolean {
    const level = hungerLevel(animal.fullness)
    return level === 'hungry' || level === 'starving'
  }

  /** Residents eat: oldest first, so a shortage lands on the newest mouths. */
  function feed(farm: AnimalLifeSnapshot['farm'], dt: number, events: AnimalLifeEvent[]): void {
    const eaters = servingOrder([...animals.values()].filter((animal) => animal.stage >= 3 && animal.leaving === null && DIETS[animal.species]))
    foodWeb.tick(eaters, farm.state, dt, foodBoosts)
    for (const animal of eaters) {
      const level = hungerLevel(animal.fullness)
      if (level === animal.hunger) continue
      animal.hunger = level
      events.push({ kind: 'hunger', animalId: animal.id, species: animal.species, hunger: level })
    }
  }

  function goodsOf(houseId: string): Map<GoodId, number> {
    let goods = houseGoods.get(houseId)
    if (!goods) {
      goods = new Map()
      houseGoods.set(houseId, goods)
    }
    return goods
  }

  function goodsCount(houseId: string): number {
    let total = 0
    for (const count of houseGoods.get(houseId)?.values() ?? []) total += count
    return total
  }

  /** The house a good goes to: its maker's own if it has room, else the emptiest of its kind. */
  function storeFor(animal: MutableAnimal): HouseSite | null {
    const own = animal.insideId ? houses.find((house) => house.id === animal.insideId) : undefined
    if (own && goodsCount(own.id) < HOUSE_GOODS_CAPACITY) return own
    let best: HouseSite | null = null
    let bestCount = HOUSE_GOODS_CAPACITY
    for (const house of houses) {
      if (!houseAccepts(house.prop, animal.species)) continue
      const count = goodsCount(house.id)
      if (count < bestCount) {
        best = house
        bestCount = count
      }
    }
    return best
  }

  /** Well-fed adults make goods into their house. A full house lets the good spoil into scraps. */
  function produce(farm: AnimalLifeSnapshot['farm'], dt: number, events: AnimalLifeEvent[]): void {
    if (!rules.goods) return
    for (const animal of animals.values()) {
      if (animal.baby || animal.stage < 3 || animal.leaving !== null) continue
      const recipe = PRODUCE[animal.species]
      if (!recipe) continue
      if (recipe.needsProp && (farm.state.propCounts?.[recipe.needsProp] ?? 0) <= 0) continue
      animal.making += produceRate(animal.fullness) * recipe.perDay * dt / DAY_LENGTH_SECONDS
      if (animal.making < 1) continue
      animal.making -= 1
      if (recipe.good === 'gem' || !GOODS[recipe.good]) {
        events.push({ kind: 'produce', animalId: animal.id, species: animal.species, good: recipe.good })
        continue
      }
      const house = storeFor(animal)
      if (!house) {
        foodWeb.add('scraps', SPOILED_SCRAPS)
        continue
      }
      const goods = goodsOf(house.id)
      goods.set(recipe.good, (goods.get(recipe.good) ?? 0) + 1)
      events.push({ kind: 'produce', animalId: animal.id, species: animal.species, good: recipe.good, houseId: house.id })
    }
  }

  /** Goods from a save find their house again by kind and place, once this session's houses are known. */
  function placePendingGoods(): void {
    if (pendingGoods.length === 0 || houses.length === 0) return
    for (const saved of pendingGoods) {
      let best: HouseSite | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (const house of houses) {
        if (house.prop !== saved.prop) continue
        const distance = Math.hypot(house.x - saved.x, house.z - saved.z)
        if (distance < bestDistance) {
          best = house
          bestDistance = distance
        }
      }
      if (!best) continue
      const goods = goodsOf(best.id)
      for (const [good, count] of Object.entries(saved.goods) as [GoodId, number][]) {
        if (!GOODS[good] || !Number.isFinite(count) || count <= 0) continue
        goods.set(good, Math.min(HOUSE_GOODS_CAPACITY, (goods.get(good) ?? 0) + Math.floor(count)))
      }
    }
    pendingGoods = []
  }

  /** A house that was sold or stored takes its goods with it: they spoil into scraps. */
  function spoilGoodsOfMissingHouses(): void {
    if (pendingGoods.length > 0) return
    const standing = new Set(houses.map((house) => house.id))
    for (const houseId of [...houseGoods.keys()]) {
      if (standing.has(houseId)) continue
      foodWeb.add('scraps', goodsCount(houseId) * SPOILED_SCRAPS)
      houseGoods.delete(houseId)
    }
  }

  for (const species of speciesIds.slice(0, config.maximumPopulation)) newAnimal(species, 0)
  for (const species of CARNIVAL_STARTERS) {
    if (speciesIds.includes(species)) {
      discovered.add(species)
      pendingVisitors.push(species)
    }
  }

  function queueEligibleGuests(farm: FarmSnapshot): void {
    for (const species of speciesIds) {
      const trigger = DISCOVERY[species]
      if (!trigger || !requirementMet(trigger, farm) || discovered.has(species) || !rules.discoverable(species)) continue
      discovered.add(species)
      pendingVisitors.push(species)
    }
  }
  /**
   * Queue one more guest of a species that already has a resident. The choice is
   * weighted toward species the farm has few of, so it is not always the same
   * animal at the gate, and a species on cooldown is left alone.
   */
  function addRepeatGuest(farm: FarmSnapshot): void {
    const level = lastSnapshot?.expansionLevel ?? 0
    const candidates: { species: string; weight: number }[] = []
    for (const species of speciesIds) {
      if ((cooldowns.get(species) ?? 0) > 0 || isUniqueSpecies(species)) continue
      const hasResident = [...animals.values()].some((animal) => animal.species === species && !animal.baby && animal.stage >= 3)
      const homeRequirement = getSpeciesConditions(species)[2]?.requirement
      if (!hasResident || !requirementMet(homeRequirement, farm) || !hasRoomFor(species)) continue
      const population = populationBySpecies(species)
      if (population >= 3 + Math.floor(level / 2)) continue
      candidates.push({ species, weight: 1 / (1 + population) })
    }
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
    if (total <= 0) return
    let pick = random() * total
    for (const candidate of candidates) {
      pick -= candidate.weight
      if (pick <= 0) {
        pendingVisitors.push(candidate.species)
        return
      }
    }
    pendingVisitors.push(candidates[candidates.length - 1].species)
  }

  const api: AnimalLife = {
    all: () => [...animals.values()].map(view),
    animal: (id) => { const entry = animals.get(id); return entry ? view(entry) : undefined },
    add(species, stage = 0, baby = false) {
      if (!speciesIds.includes(species) || !hasPopulationSlot()) return null
      return view(newAnimal(species, stage, baby))
    },
    statusOf(id) {
      const animal = animals.get(id)
      const farm = lastSnapshot?.farm ?? null
      const stage = animal?.stage ?? 0
      return getSpeciesConditions(animal?.species ?? id).map((definition) => {
        const revealed = definition.stage <= stage + 1
        const requirement = definition.requirement
        const numeric = revealed && requirement && requirement.kind !== 'residentSpecies'
        return {
          stage: definition.stage,
          title: definition.title,
          revealed,
          requirement,
          metricLabel: numeric ? conditionMetricLabel(requirement) : null,
          current: numeric && farm ? farmMetric(farm.state, requirement.kind, requirement.species) : null,
          target: numeric ? requirement.amount ?? null : null,
          met: definition.stage <= stage && (farm ? requirementMet(requirement, farm) : false),
          result: definition.result,
        }
      })
    },
    housing() {
      const used = [...animals.values()].filter((animal) => animal.insideId).length
      return { capacity: houses.length * config.houseCapacity, used }
    },
    hasRoomFor,
    enterHouse(id, houseId) {
      const animal = animals.get(id)
      const house = houses.find((entry) => entry.id === houseId)
      if (!animal || !house || animal.stage < 3 || !houseAccepts(house.prop, animal.species)) return false
      if (animal.insideId === houseId) return true
      if ((occupancy().get(houseId) ?? 0) >= config.houseCapacity) return false
      animal.insideId = houseId
      return true
    },
    leaveHouse(id) {
      const animal = animals.get(id)
      if (animal) animal.insideId = null
    },
    foodReport: () => foodWeb.report(),
    addFeed(meals) { foodWeb.add('feed', meals) },
    setFoodBoosts(boosts) { foodBoosts = { ...boosts } },
    setRules(next) { rules = { ...rules, ...next } },
    setStarveLeakFactor(factor) { starveLeakFactor = Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : 1 },
    setFullness(id, level) {
      const animal = animals.get(id)
      if (animal && Number.isFinite(level)) animal.fullness = Math.max(0, Math.min(1, level))
    },
    wantsToHunt(id) {
      const animal = animals.get(id)
      if (!animal || !isPredatorDiet(animal.species)) return true
      // A visitor has to eat here to call the farm home, so it always hunts.
      if (animal.stage < 3) return true
      return animal.fullness < PREDATOR_HUNTS_BELOW
    },
    feedCatch(id) {
      const animal = animals.get(id)
      if (animal) animal.fullness = Math.min(1, animal.fullness + catchMeal(animal.species))
    },
    addGoods(houseId, good, count) {
      if (!GOODS[good] || !Number.isFinite(count) || count <= 0) return
      const goods = goodsOf(houseId)
      const room = Math.max(0, HOUSE_GOODS_CAPACITY - goodsCount(houseId))
      goods.set(good, (goods.get(good) ?? 0) + Math.min(room, Math.floor(count)))
    },
    goodsIn(houseId) {
      return Object.fromEntries(houseGoods.get(houseId) ?? [])
    },
    debugAddGoods(houseId, good, count) {
      const goods = goodsOf(houseId)
      goods.set(good, Math.min(HOUSE_GOODS_CAPACITY - goodsCount(houseId) + (goods.get(good) ?? 0), (goods.get(good) ?? 0) + Math.max(0, Math.floor(count))))
    },
    collectGoods(houseId) {
      const goods = houseGoods.get(houseId)
      if (!goods) return []
      houseGoods.delete(houseId)
      return [...goods].filter(([, count]) => count > 0).map(([good, count]) => ({ good, count }))
    },
    discover(species) {
      if (!speciesIds.includes(species) || discovered.has(species)) return []
      discovered.add(species)
      pendingVisitors.push(species)
      return []
    },
    setStage(id, stage) {
      const animal = animals.get(id)
      if (!animal) return []
      const events: AnimalLifeEvent[] = []
      eventsFor(animal, stage, events, false)
      return events
    },
    setHelium(id, level) {
      const animal = animals.get(id)
      if (animal && Number.isFinite(level)) animal.helium = Math.max(0, Math.min(1, level))
    },
    remove(id) {
      const animal = animals.get(id)
      if (!animal) return null
      animals.delete(id)
      // Selling (or losing) the last of a species must not end its visits for
      // good. Discovery is a one-time unlock, and repeat guests only come for a
      // species that already has a resident, so without this the farm would
      // never see another cow after the first one left.
      const speciesLeft = [...animals.values()].some((other) => other.species === animal.species && other.stage > 0)
      if (animal.stage > 0 && !speciesLeft && !pendingVisitors.includes(animal.species)) pendingVisitors.push(animal.species)
      // A sale is not a vacancy sign: the next guest takes its time, and the
      // species it was sold from waits a while longer still.
      if (animal.stage > 0) {
        startCooldown(animal.species)
        arrivalElapsed = 0
        arrivalWait = rollArrivalWait()
      }
      return view(animal)
    },
    reset() {
      animals.clear()
      foodWeb.reset()
      houseGoods.clear()
      pendingGoods = []
      breedElapsed.clear()
      houses = []
      nextParent = 0
      discovered.clear()
      pendingVisitors.length = 0
      for (const species of CARNIVAL_STARTERS) {
        if (speciesIds.includes(species)) {
          discovered.add(species)
          pendingVisitors.push(species)
        }
      }
      nextAnimalId = 1
      arrivalElapsed = 0
      cooldowns.clear()
      nextPackId = 1
      arrivalWait = rollArrivalWait()
      for (const species of speciesIds.slice(0, config.maximumPopulation)) newAnimal(species, 0)
      lastSnapshot = null
    },
    exportState() {
      return {
        animals: [...animals.values()].map((animal) => ({
          id: animal.id,
          species: animal.species,
          stage: animal.stage,
          elapsed: animal.elapsed,
          invited: animal.invited,
          baby: animal.baby,
          ageSeconds: animal.ageSeconds,
          parentIds: [...animal.parentIds],
          inside: animal.insideId !== null,
          ...(animal.helium < 1 ? { helium: animal.helium } : {}),
          ...(animal.fullness < 1 ? { fullness: Math.round(animal.fullness * 1000) / 1000 } : {}),
        })),
        discovered: [...discovered],
        pendingVisitors: [...pendingVisitors],
        nextAnimalId,
        arrivalElapsed,
        food: foodWeb.exportState(),
        goods: [
          ...pendingGoods,
          ...[...houseGoods].flatMap(([houseId, goods]) => {
            const house = houses.find((entry) => entry.id === houseId)
            if (!house || goods.size === 0) return []
            return [{ prop: house.prop, x: house.x, z: house.z, goods: Object.fromEntries(goods) }]
          }),
        ],
      }
    },
    importState(state) {
      const finite = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
      const known = (species: unknown): species is string => typeof species === 'string' && speciesIds.includes(species)
      const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
      animals.clear()
      breedElapsed.clear()
      cooldowns.clear()
      discovered.clear()
      pendingVisitors.length = 0
      let highestAnimal = 0
      for (const saved of state.animals) {
        if (!known(saved.species) || typeof saved.id !== 'string' || animals.has(saved.id)) continue
        const stage = Math.max(0, Math.min(4, Math.floor(finite(saved.stage)))) as AnimalStage
        animals.set(saved.id, {
          id: saved.id,
          species: saved.species,
          stage,
          elapsed: Math.max(0, finite(saved.elapsed)),
          invited: Boolean(saved.invited) || stage >= 2,
          baby: Boolean(saved.baby),
          ageSeconds: Math.max(0, finite(saved.ageSeconds)),
          parentIds: ids(saved.parentIds),
          // Back indoors once the caller knows this session's houses.
          insideId: null,
          helium: Math.max(0, Math.min(1, finite(saved.helium, 1))),
          unsettled: false,
          visitAfter: 0,
          enterAfter: 0,
          stayLimit: Number.POSITIVE_INFINITY,
          leaving: null,
          packId: null,
          fullness: Math.max(0, Math.min(1, finite(saved.fullness, 1))),
          hunger: hungerLevel(Math.max(0, Math.min(1, finite(saved.fullness, 1)))),
          making: 0,
        })
        rollWaits(animals.get(saved.id)!)
        highestAnimal = Math.max(highestAnimal, Number(saved.id.replace(/^animal-/, '')) || 0)
      }
      for (const species of state.discovered) if (known(species)) discovered.add(species)
      for (const species of state.pendingVisitors) if (known(species)) pendingVisitors.push(species)
      nextAnimalId = Math.max(highestAnimal + 1, Math.floor(finite(state.nextAnimalId, 1)))
      arrivalElapsed = Math.max(0, finite(state.arrivalElapsed))
      foodWeb.importState(state.food)
      houseGoods.clear()
      pendingGoods = Array.isArray(state.goods)
        ? state.goods.filter((entry) => entry && typeof entry.prop === 'string' && Number.isFinite(entry.x) && Number.isFinite(entry.z) && entry.goods && typeof entry.goods === 'object')
        : []
      arrivalWait = rollArrivalWait()
      lastSnapshot = null
    },
    tick(snapshot, deltaSeconds) {
      lastSnapshot = snapshot
      houses = snapshot.houses ?? []
      evictFromMissingHouses()
      placePendingGoods()
      spoilGoodsOfMissingHouses()
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      const stageDt = Math.min(0.25, dt)
      const events: AnimalLifeEvent[] = []
      arrivalElapsed += dt
      queueEligibleGuests(snapshot.farm)
      // Day visitors and the night shift are paced separately: an owl should not
      // wait behind a cow that is still looking for grass, because they never share a sky.
      // Only a visitor that is about to step inside holds the queue; one still waiting on
      // its plants or its pond is not in anyone's way, so the next species can arrive.
      const visitorsOnShift = (nightShift: boolean): number => [...animals.values()]
        .filter((animal) => animal.stage === 1 && NIGHT_ONLY_SPECIES.includes(animal.species) === nightShift
          && requirementMet(getSpeciesConditions(animal.species)[1]?.requirement ?? null, snapshot.farm)).length
      const pacingFor = (species: string): number => {
        const nightShift = NIGHT_ONLY_SPECIES.includes(species)
        return Math.max(0, 1 + Math.floor(snapshot.expansionLevel / 2) - visitorsOnShift(nightShift))
      }
      for (const [species, left] of cooldowns) {
        if (left - dt <= 0) cooldowns.delete(species)
        else cooldowns.set(species, left - dt)
      }
      // The wait is rolled afresh after every arrival, so visits never settle
      // into a metronome, and it is capped so a long quiet spell is not banked
      // up and then spent as a burst.
      const interval = arrivalWait / Math.max(1, 1 + snapshot.expansionLevel * 0.35)
      arrivalElapsed = Math.min(arrivalElapsed, interval + 30)
      if (pendingVisitors.length === 0 && arrivalElapsed >= interval) addRepeatGuest(snapshot.farm)
      const groundsCap = config.groundsVisitorsBase + config.groundsVisitorsPerLevel * Math.max(0, snapshot.expansionLevel)
      const onGrounds = (): number => [...animals.values()].filter((animal) => animal.stage === 1).length
      // Every species keeps to its own shift: owls turn up after dark, everything
      // else by day. A species whose shift is not on waits in the queue rather
      // than blocking it. A snapshot that does not say (older tests) allows both.
      const darkNow = snapshot.farm.night
      const onShift = (species: string): boolean => darkNow === undefined || isNightOnly(species) === darkNow
      const arrivingIndex = pendingVisitors.findIndex((species) => onShift(species) && pacingFor(species) > 0 && hasRoomFor(species)
        && (cooldowns.get(species) ?? 0) <= 0)
      if (arrivingIndex >= 0 && arrivalElapsed >= interval && onGrounds() < groundsCap) {
        const species = pendingVisitors.splice(arrivingIndex, 1)[0]
        let arrival = [...animals.values()].find((animal) => animal.species === species && animal.stage === 0)
        if (!arrival && hasPopulationSlot()) arrival = newAnimal(species, 0)
        if (!arrival) {
          pendingVisitors.splice(arrivingIndex, 0, species)
        } else {
          eventsFor(arrival, 1, events)
          const arrivalEvent = events[events.length - 1]
          events[events.length - 1] = { ...arrivalEvent, action: 'visitSpecies' }
          arrivalElapsed = 0
          arrivalWait = rollArrivalWait()
          // Some species come as a pack. The rest of it trails in behind the
          // leader and makes up its mind about the farm a few seconds after it.
          const followers = Math.min(packSizeFor(species) - 1, groundsCap - onGrounds(), roomLeftFor(species))
          if (followers > 0) {
            const packId = `pack-${nextPackId++}`
            arrival.packId = packId
            for (let index = 0; index < followers; index += 1) {
              const follower = [...animals.values()].find((animal) => animal.species === species && animal.stage === 0)
                ?? (hasPopulationSlot() ? newAnimal(species, 0) : undefined)
              if (!follower) break
              eventsFor(follower, 1, events, false)
              const followerEvent = events[events.length - 1]
              events[events.length - 1] = { ...followerEvent, leaderId: arrival.id }
              follower.packId = packId
              follower.visitAfter = arrival.visitAfter + (tuningFor(species).visitDelaySeconds > 0 ? random() * PACK_FOLLOW_SECONDS : 0)
            }
          }
        }
      }

      for (const animal of animals.values()) {
        if (animal.baby) {
          animal.ageSeconds += stageDt
          if (animal.ageSeconds >= tuningFor(animal.species).babyDurationSeconds) {
            animal.baby = false
            events.push({ kind: 'growUp', animalId: animal.id, species: animal.species, action: 'growAnimal' })
            if (requirementMet(getSpeciesConditions(animal.species)[3].requirement, snapshot.farm)) eventsFor(animal, 4, events)
          }
          continue
        }
        if (animal.stage >= 1 && animal.stage < 4) {
          animal.elapsed += stageDt
          const next = getSpeciesConditions(animal.species)[animal.stage]
          const onTheirShift = onShift(animal.species)
          const suitable = next ? requirementMet(next.requirement, snapshot.farm) : false
          if (animal.stage === 1 && animal.leaving !== null) {
            // Walking off the grounds; the scene watches `departing` and sends it on its way.
            animal.leaving -= stageDt
            if (animal.leaving <= 0) {
              animal.leaving = null
              animal.stage = 0
              animal.elapsed = 0
              animal.packId = null
              events.push({ kind: 'departCarnival', animalId: animal.id, species: animal.species, stage: 0 })
              // It will wander back some other day.
              if (!pendingVisitors.includes(animal.species)) pendingVisitors.push(animal.species)
              startCooldown(animal.species, 0.75)
            }
          } else if (animal.stage === 1 && animal.elapsed >= animal.visitAfter && onTheirShift && suitable) eventsFor(animal, 2, events)
          else if (animal.stage === 1 && animal.elapsed >= animal.stayLimit && onTheirShift && !suitable) animal.leaving = config.departSeconds
          else if (animal.stage === 2 && animal.elapsed >= animal.enterAfter && suitable) eventsFor(animal, 3, events)
          else if (animal.stage === 3 && next && requirementMet(next.requirement, snapshot.farm)) eventsFor(animal, 4, events)
        }
      }

      feed(snapshot.farm, dt, events)
      produce(snapshot.farm, dt, events)

      // Residents leak helium while they starve, and those that hold their
      // residency also while the farm stops suiting them. Helium refills
      // (faster) once both are put right, and a flat balloon pops. Removing it
      // here also lets its species be seen again.
      const deflated: { animal: MutableAnimal; reason: 'starved' | 'unsuited' }[] = []
      for (const animal of animals.values()) {
        if (animal.baby || animal.stage < 3) continue
        const starving = rules.starvation && hungerLevel(animal.fullness) === 'starving'
        const holds = holdsResidency(animal.species)
        if (!holds && !starving && animal.helium >= 1) continue
        const home = getSpeciesConditions(animal.species)[2]?.requirement ?? null
        const suited = !holds || requirementMet(home, snapshot.farm)
        const leaking = !suited || starving
        // Starving alone leaks at the treasure-adjusted rate; an unsuited farm always leaks at full speed.
        const leakScale = leaking && suited ? starveLeakFactor : 1
        animal.helium = stepHelium(animal.helium, leaking, Math.min(dt, 1) * (leaking ? leakScale : 1))
        if (animal.helium <= 0) deflated.push({ animal, reason: starving ? 'starved' : 'unsuited' })
        if (!holds) continue
        if (!suited && !animal.unsettled) {
          animal.unsettled = true
          events.push({ kind: 'unsettle', animalId: animal.id, species: animal.species })
        } else if (suited && animal.unsettled) {
          animal.unsettled = false
          events.push({ kind: 'resettle', animalId: animal.id, species: animal.species })
        }
      }
      for (const { animal, reason } of deflated) {
        events.push({ kind: 'deflate', animalId: animal.id, species: animal.species, reason })
        api.remove(animal.id)
      }

      breed(stageDt, events)
      return events
    },
  }
  return api
}
