import { CARNIVAL_STARTERS, DISCOVERY, NIGHT_ONLY_SPECIES, holdsResidency, isNightOnly, conditionMetricLabel, getSpeciesConditions, type AnimalStage, stageAppearance, stageHasHeartEyes } from './animal-conditions'
import { requirementMet, type FarmSnapshot, type RequirementStatus } from './animal-progress'
import { farmMetric } from './farm-state'
import { stepHelium } from './predator'
import { freeRoomFor, HOUSE_CAPACITY, houseAccepts, houseWithRoom, occupantsByHouse, OUTDOOR_LIMITS, type HouseSite } from './animal-housing'
import type { ProgressAction } from './farm-progression'

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
}

export interface AnimalLifeEvent {
  readonly kind: 'arriveCarnival' | 'departCarnival' | 'enterFarm' | 'settle' | 'fallInLove' | 'birth' | 'growUp' | 'unsettle' | 'resettle' | 'deflate'
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
    for (const animal of animals.values()) {
      if (animal.baby || animal.stage < 4) continue
      const list = adultsBySpecies.get(animal.species) ?? []
      list.push(animal)
      adultsBySpecies.set(animal.species, list)
    }
    for (const species of speciesIds) {
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
      if (!trigger || !requirementMet(trigger, farm) || discovered.has(species)) continue
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
      if ((cooldowns.get(species) ?? 0) > 0) continue
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
        })),
        discovered: [...discovered],
        pendingVisitors: [...pendingVisitors],
        nextAnimalId,
        arrivalElapsed,
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
        })
        rollWaits(animals.get(saved.id)!)
        highestAnimal = Math.max(highestAnimal, Number(saved.id.replace(/^animal-/, '')) || 0)
      }
      for (const species of state.discovered) if (known(species)) discovered.add(species)
      for (const species of state.pendingVisitors) if (known(species)) pendingVisitors.push(species)
      nextAnimalId = Math.max(highestAnimal + 1, Math.floor(finite(state.nextAnimalId, 1)))
      arrivalElapsed = Math.max(0, finite(state.arrivalElapsed))
      arrivalWait = rollArrivalWait()
      lastSnapshot = null
    },
    tick(snapshot, deltaSeconds) {
      lastSnapshot = snapshot
      houses = snapshot.houses ?? []
      evictFromMissingHouses()
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

      // Residents that hold their residency: the farm has to keep suiting them.
      // Helium drains while it does not and refills (faster) once it does, and a
      // flat balloon pops. Removing it here also lets its species be seen again.
      const deflated: MutableAnimal[] = []
      for (const animal of animals.values()) {
        if (animal.baby || animal.stage < 3 || !holdsResidency(animal.species)) continue
        const home = getSpeciesConditions(animal.species)[2]?.requirement ?? null
        const suited = requirementMet(home, snapshot.farm)
        animal.helium = stepHelium(animal.helium, !suited, Math.min(dt, 1))
        if (!suited && !animal.unsettled) {
          animal.unsettled = true
          events.push({ kind: 'unsettle', animalId: animal.id, species: animal.species })
        } else if (suited && animal.unsettled) {
          animal.unsettled = false
          events.push({ kind: 'resettle', animalId: animal.id, species: animal.species })
        }
        if (animal.helium <= 0) deflated.push(animal)
      }
      for (const animal of deflated) {
        events.push({ kind: 'deflate', animalId: animal.id, species: animal.species })
        api.remove(animal.id)
      }

      breed(stageDt, events)
      return events
    },
  }
  return api
}
