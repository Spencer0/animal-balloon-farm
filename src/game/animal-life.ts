import { CARNIVAL_STARTERS, DISCOVERY, NIGHT_ONLY_SPECIES, isNightOnly, conditionMetricLabel, getSpeciesConditions, type AnimalStage, stageAppearance, stageHasHeartEyes } from './animal-conditions'
import { requirementMet, type FarmSnapshot, type RequirementStatus } from './animal-progress'
import { farmMetric } from './farm-state'
import { freeRoomFor, HOUSE_CAPACITY, houseAccepts, houseWithRoom, occupantsByHouse, OUTDOOR_LIMITS, type HouseSite } from './animal-housing'
import type { ProgressAction } from './farm-progression'

export interface SpeciesAnimalTuning {
  readonly visitDelaySeconds?: number
  readonly enterFarmSeconds?: number
  /** Seconds between births for one breeding pair with room in a house. */
  readonly breedIntervalSeconds?: number
  readonly babyDurationSeconds?: number
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
  readonly adultScale: number
  readonly species?: Readonly<Record<string, SpeciesAnimalTuning>>
}

export const ANIMAL_LIFE_CONFIG: AnimalLifeConfig = {
  visitDelaySeconds: 10,
  enterFarmSeconds: 3,
  arrivalIntervalSeconds: 24,
  unhousedPerSpecies: OUTDOOR_LIMITS.perSpecies,
  houseCapacity: HOUSE_CAPACITY,
  maximumPopulation: 400,
  breedIntervalSeconds: 150,
  maxBreedingPairs: 3,
  babyDurationSeconds: 60,
  maxNewVisitorsPerTick: 1,
  adultScale: 1,
}

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
}

export interface AnimalLifeEvent {
  readonly kind: 'arriveCarnival' | 'enterFarm' | 'settle' | 'fallInLove' | 'birth' | 'growUp'
  readonly animalId?: string
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
    }
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
    }
  }

  function eventsFor(animal: MutableAnimal, to: AnimalStage, events: AnimalLifeEvent[], action = true): void {
    if (to <= animal.stage) return
    for (let stage = animal.stage + 1; stage <= to; stage += 1) {
      const rung = stage as AnimalStage
      animal.stage = rung
      animal.elapsed = 0
      animal.invited ||= rung >= 2
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

  function hasRoomFor(species: string): boolean {
    if (!hasPopulationSlot()) return false
    let outdoors = 0
    for (const animal of animals.values()) {
      if (animal.species === species && animal.stage > 0 && !animal.insideId) outdoors += 1
    }
    return outdoors < config.unhousedPerSpecies || freeRoomFor(species, houses, occupancy(), config.houseCapacity) > 0
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
  function addRepeatGuest(farm: FarmSnapshot): void {
    for (const species of speciesIds) {
      const hasResident = [...animals.values()].some((animal) => animal.species === species && !animal.baby && animal.stage >= 3)
      const homeRequirement = getSpeciesConditions(species)[2]?.requirement
      if (!hasResident || !requirementMet(homeRequirement, farm) || !hasRoomFor(species)) continue
      if (populationBySpecies(species) >= Math.max(2, 2 + Math.floor((lastSnapshot?.expansionLevel ?? 0) / 2))) continue
      pendingVisitors.push(species)
      return
    }
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
        })
        highestAnimal = Math.max(highestAnimal, Number(saved.id.replace(/^animal-/, '')) || 0)
      }
      for (const species of state.discovered) if (known(species)) discovered.add(species)
      for (const species of state.pendingVisitors) if (known(species)) pendingVisitors.push(species)
      nextAnimalId = Math.max(highestAnimal + 1, Math.floor(finite(state.nextAnimalId, 1)))
      arrivalElapsed = Math.max(0, finite(state.arrivalElapsed))
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
      const interval = config.arrivalIntervalSeconds / Math.max(1, 1 + snapshot.expansionLevel * 0.35)
      if (pendingVisitors.length === 0 && arrivalElapsed >= interval) addRepeatGuest(snapshot.farm)
      // Every species keeps to its own shift: owls turn up after dark, everything
      // else by day. A species whose shift is not on waits in the queue rather
      // than blocking it. A snapshot that does not say (older tests) allows both.
      const darkNow = snapshot.farm.night
      const onShift = (species: string): boolean => darkNow === undefined || isNightOnly(species) === darkNow
      const arrivingIndex = pendingVisitors.findIndex((species) => onShift(species) && pacingFor(species) > 0 && hasRoomFor(species))
      if (arrivingIndex >= 0 && arrivalElapsed >= interval) {
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
          const tuning = tuningFor(animal.species)
          const onTheirShift = onShift(animal.species)
          if (animal.stage === 1 && animal.elapsed >= tuning.visitDelaySeconds && onTheirShift && next && requirementMet(next.requirement, snapshot.farm)) eventsFor(animal, 2, events)
          else if (animal.stage === 2 && animal.elapsed >= tuning.enterFarmSeconds && next && requirementMet(next.requirement, snapshot.farm)) eventsFor(animal, 3, events)
          else if (animal.stage === 3 && next && requirementMet(next.requirement, snapshot.farm)) eventsFor(animal, 4, events)
        }
      }

      breed(stageDt, events)
      return events
    },
  }
  return api
}
