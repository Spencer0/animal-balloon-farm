import { CARNIVAL_STARTERS, DISCOVERY, NIGHT_ONLY_SPECIES, conditionMetricLabel, getSpeciesConditions, type AnimalStage, stageAppearance, stageHasHeartEyes } from './animal-conditions'
import { requirementMet, type FarmSnapshot, type RequirementStatus } from './animal-progress'
import { farmMetric } from './farm-state'
import type { ProgressAction } from './farm-progression'

export interface SpeciesAnimalTuning {
  readonly visitDelaySeconds?: number
  readonly enterFarmSeconds?: number
  readonly romanceChance?: number
  readonly romanceCooldownSeconds?: number
  readonly eggIncubationSeconds?: number
  readonly babyDurationSeconds?: number
  readonly courtshipSeconds?: number
}

export interface AnimalLifeConfig {
  readonly visitDelaySeconds: number
  readonly enterFarmSeconds: number
  readonly arrivalIntervalSeconds: number
  readonly baseResidentCapacity: number
  readonly residentsPerExpansion: number
  readonly maximumPopulation: number
  readonly romanceChance: number
  readonly romanceCooldownSeconds: number
  readonly courtshipSeconds: number
  readonly eggIncubationSeconds: number
  readonly babyDurationSeconds: number
  readonly maxNewVisitorsPerTick: number
  readonly adultScale: number
  readonly species?: Readonly<Record<string, SpeciesAnimalTuning>>
}

export const ANIMAL_LIFE_CONFIG: AnimalLifeConfig = {
  visitDelaySeconds: 10,
  enterFarmSeconds: 3,
  arrivalIntervalSeconds: 24,
  baseResidentCapacity: 6,
  residentsPerExpansion: 3,
  maximumPopulation: 50,
  romanceChance: 0.28,
  romanceCooldownSeconds: 180,
  courtshipSeconds: 3.5,
  eggIncubationSeconds: 60,
  babyDurationSeconds: 60,
  maxNewVisitorsPerTick: 1,
  adultScale: 1,
}

export interface AnimalRecord {
  readonly id: string
  readonly species: string
  readonly stage: AnimalStage
  readonly elapsed: number
  readonly paired: boolean
  readonly partnerId: string | null
  readonly romancing: boolean
  readonly appearance: 'wild' | 'standard'
  readonly heartEyes: boolean
  readonly invited: boolean
  readonly baby: boolean
  readonly ageSeconds: number
  readonly growth: number
  readonly romanceCooldown: number
  readonly parentIds: readonly string[]
  readonly adultScale: number
}

export interface EggRecord {
  readonly id: number
  readonly species: string
  readonly x: number
  readonly z: number
  readonly incubation: number
  readonly ready: boolean
  readonly incubationProgress: number
}

export interface AnimalLifeEvent {
  readonly kind: 'arriveCarnival' | 'enterFarm' | 'settle' | 'fallInLove' | 'courtship' | 'courtshipEnd' | 'layEgg' | 'hatch' | 'growUp'
  readonly animalId?: string
  readonly partnerId?: string
  readonly species: string
  readonly eggId?: number
  readonly stage?: AnimalStage
  readonly action?: ProgressAction
}

export interface AnimalLifeSnapshot {
  readonly farm: FarmSnapshot
  readonly expansionLevel: number
  readonly positions?: Readonly<Record<string, { readonly x: number; readonly z: number }>>
}

export interface AnimalLifeOptions {
  readonly config?: Partial<AnimalLifeConfig>
  readonly random?: () => number
}

export interface AnimalLife {
  all(): readonly AnimalRecord[]
  /** Add a tracked animal record, used by deterministic load/scale harnesses. */
  add(species: string, stage?: AnimalStage, baby?: boolean): AnimalRecord | null
  eggs(): readonly EggRecord[]
  animal(id: string): AnimalRecord | undefined
  statusOf(id: string): readonly RequirementStatus[]
  tick(snapshot: AnimalLifeSnapshot, deltaSeconds: number): readonly AnimalLifeEvent[]
  setStage(id: string, stage: AnimalStage): readonly AnimalLifeEvent[]
  discover(species: string): readonly AnimalLifeEvent[]
  hatch(eggId: number): AnimalLifeEvent | null
  remove(id: string): AnimalRecord | null
  capacity(expansionLevel: number): number
  reset(): void
}

interface MutableAnimal {
  id: string
  species: string
  stage: AnimalStage
  elapsed: number
  invited: boolean
  baby: boolean
  ageSeconds: number
  romanceCooldown: number
  parentIds: readonly string[]
  paired: boolean
  courtshipPartnerId: string | null
  courtshipRemaining: number
  courtshipSuccessful: boolean
}

interface MutableEgg {
  id: number
  species: string
  x: number
  z: number
  incubation: number
  parentIds: readonly string[]
}

export function createAnimalLife(speciesIds: readonly string[], options: AnimalLifeOptions = {}): AnimalLife {
  const config: AnimalLifeConfig = { ...ANIMAL_LIFE_CONFIG, ...options.config }
  const random = options.random ?? Math.random
  const animals = new Map<string, MutableAnimal>()
  const eggs = new Map<number, MutableEgg>()
  const discovered = new Set<string>()
  const pendingVisitors: string[] = []
  let nextAnimalId = 1
  let nextEggId = 1
  let arrivalElapsed = 0
  let lastSnapshot: AnimalLifeSnapshot | null = null
  const clampedChance = Math.max(0, Math.min(1, config.romanceChance))
  const inFlightAnimalIds = new Set<string>()

  function tuningFor(species: string): Required<SpeciesAnimalTuning> {
    return {
      visitDelaySeconds: config.species?.[species]?.visitDelaySeconds ?? config.visitDelaySeconds,
      enterFarmSeconds: config.species?.[species]?.enterFarmSeconds ?? config.enterFarmSeconds,
      romanceChance: Math.max(0, Math.min(1, config.species?.[species]?.romanceChance ?? config.romanceChance)),
      romanceCooldownSeconds: config.species?.[species]?.romanceCooldownSeconds ?? config.romanceCooldownSeconds,
      courtshipSeconds: config.species?.[species]?.courtshipSeconds ?? config.courtshipSeconds,
      eggIncubationSeconds: config.species?.[species]?.eggIncubationSeconds ?? config.eggIncubationSeconds,
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
      romanceCooldown: 0,
      parentIds,
      paired: false,
      courtshipPartnerId: null,
      courtshipRemaining: 0,
      courtshipSuccessful: false,
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
      paired: animal.paired,
      partnerId: animal.courtshipPartnerId,
      romancing: animal.courtshipPartnerId !== null,
      appearance: stageAppearance(animal.stage),
      heartEyes: stageHasHeartEyes(animal.stage),
      invited: animal.invited,
      baby: animal.baby,
      ageSeconds: animal.ageSeconds,
      growth,
      romanceCooldown: animal.romanceCooldown,
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

  function populationCount(): number {
    return [...animals.values()].filter((animal) => animal.stage > 0).length + eggs.size
  }

  function hasPopulationSlot(): boolean {
    return trackedCount() < config.maximumPopulation
  }

  function trackedCount(): number {
    return animals.size + eggs.size
  }

  function populationBySpecies(species: string): number {
    return [...animals.values()].filter((animal) => animal.species === species && animal.stage > 0).length
  }


  function capacity(level: number): number {
    return Math.min(config.maximumPopulation,
      config.baseResidentCapacity + Math.max(0, Math.floor(level)) * config.residentsPerExpansion)
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
      if (!hasResident || !requirementMet(homeRequirement, farm)) continue
      if (populationBySpecies(species) >= Math.max(2, 2 + Math.floor((lastSnapshot?.expansionLevel ?? 0) / 2))) continue
      pendingVisitors.push(species)
      return
    }
  }

  const api: AnimalLife = {
    all: () => [...animals.values()].map(view),
    eggs: () => [...eggs.values()].map((egg) => {
      const duration = Math.max(0, tuningFor(egg.species).eggIncubationSeconds)
      const incubationProgress = duration === 0 ? 1 : Math.min(1, egg.incubation / duration)
      return { ...egg, ready: incubationProgress >= 1, incubationProgress }
    }),
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
    capacity,
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
    hatch(eggId) {
      const egg = eggs.get(eggId)
      if (!egg || egg.incubation < tuningFor(egg.species).eggIncubationSeconds
        || populationCount() > capacity(lastSnapshot?.expansionLevel ?? 0)) return null
      eggs.delete(eggId)
      const baby = newAnimal(egg.species, 3, true, egg.parentIds)
      baby.ageSeconds = 0
      return { kind: 'hatch', animalId: baby.id, species: baby.species, eggId }
    },
    remove(id) {
      const animal = animals.get(id)
      if (!animal) return null
      if (animal.courtshipPartnerId) {
        const partner = animals.get(animal.courtshipPartnerId)
        if (partner) {
          partner.courtshipPartnerId = null
          partner.courtshipRemaining = 0
          partner.paired = false
        }
        inFlightAnimalIds.delete(animal.id)
        inFlightAnimalIds.delete(animal.courtshipPartnerId)
      }
      animals.delete(id)
      return view(animal)
    },
    reset() {
      animals.clear()
      eggs.clear()
      inFlightAnimalIds.clear()
      discovered.clear()
      pendingVisitors.length = 0
      for (const species of CARNIVAL_STARTERS) {
        if (speciesIds.includes(species)) {
          discovered.add(species)
          pendingVisitors.push(species)
        }
      }
      nextAnimalId = 1
      nextEggId = 1
      arrivalElapsed = 0
      for (const species of speciesIds.slice(0, config.maximumPopulation)) newAnimal(species, 0)
      lastSnapshot = null
    },
    tick(snapshot, deltaSeconds) {
      lastSnapshot = snapshot
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      const stageDt = Math.min(0.25, dt)
      const events: AnimalLifeEvent[] = []
      arrivalElapsed += dt
      queueEligibleGuests(snapshot.farm)
      const residentCapacity = capacity(snapshot.expansionLevel)
      const capacitySlots = Math.max(0, residentCapacity - populationCount())
      // Day visitors and the night shift are paced separately: an owl should not
      // wait behind a cow that is still looking for grass, because they never share a sky.
      const visitorsOnShift = (nightShift: boolean): number => [...animals.values()]
        .filter((animal) => animal.stage > 0 && animal.stage < 3 && NIGHT_ONLY_SPECIES.includes(animal.species) === nightShift).length
      const pacingFor = (species: string): number => {
        const nightShift = NIGHT_ONLY_SPECIES.includes(species)
        return Math.max(0, 1 + Math.floor(snapshot.expansionLevel / 2) - visitorsOnShift(nightShift))
      }
      const interval = config.arrivalIntervalSeconds / Math.max(1, 1 + snapshot.expansionLevel * 0.35)
      if (capacitySlots > 0 && pendingVisitors.length === 0 && arrivalElapsed >= interval) addRepeatGuest(snapshot.farm)
      // Night-only species wait in the queue until dark rather than blocking it.
      const nightNow = snapshot.farm.night ?? true
      const arrivingIndex = pendingVisitors.findIndex((species) => (nightNow || !NIGHT_ONLY_SPECIES.includes(species)) && pacingFor(species) > 0)
      if (capacitySlots > 0 && arrivingIndex >= 0 && arrivalElapsed >= interval) {
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
        const previousCooldown = animal.romanceCooldown
        animal.romanceCooldown = Math.max(0, animal.romanceCooldown - stageDt)
        if (previousCooldown > 0 && animal.romanceCooldown === 0) animal.paired = false
        if (animal.stage >= 1 && animal.stage < 4) {
          animal.elapsed += stageDt
          const next = getSpeciesConditions(animal.species)[animal.stage]
          const tuning = tuningFor(animal.species)
          const darkEnough = nightNow || !NIGHT_ONLY_SPECIES.includes(animal.species)
          if (animal.stage === 1 && animal.elapsed >= tuning.visitDelaySeconds && darkEnough && next && requirementMet(next.requirement, snapshot.farm)) eventsFor(animal, 2, events)
          else if (animal.stage === 2 && animal.elapsed >= tuning.enterFarmSeconds && next && requirementMet(next.requirement, snapshot.farm)) eventsFor(animal, 3, events)
          else if (animal.stage === 3 && next && requirementMet(next.requirement, snapshot.farm)) eventsFor(animal, 4, events)
        }
      }

      const eligible = [...animals.values()].filter((animal) => !animal.baby && animal.stage >= 4 && !animal.paired && !animal.courtshipPartnerId && animal.romanceCooldown <= 0 && !inFlightAnimalIds.has(animal.id))
      const eligibleBySpecies = new Map<string, MutableAnimal[]>()
      for (const animal of eligible) {
        const sameSpecies = eligibleBySpecies.get(animal.species) ?? []
        sameSpecies.push(animal)
        eligibleBySpecies.set(animal.species, sameSpecies)
      }
      const used = new Set<string>()
      const cellSize = 12
      for (const sameSpecies of eligibleBySpecies.values()) {
        const buckets = new Map<string, MutableAnimal[]>()
        const positions = new Map<string, { x: number; z: number }>()
        sameSpecies.forEach((animal, index) => {
          const position = snapshot.positions?.[animal.id] ?? { x: index * 0.5, z: 0 }
          positions.set(animal.id, position)
          const key = `${Math.floor(position.x / cellSize)},${Math.floor(position.z / cellSize)}`
          const bucket = buckets.get(key) ?? []
          bucket.push(animal)
          buckets.set(key, bucket)
        })
        for (const first of sameSpecies) {
          if (used.has(first.id)) continue
          const firstPosition = positions.get(first.id)!
          const cellX = Math.floor(firstPosition.x / cellSize)
          const cellZ = Math.floor(firstPosition.z / cellSize)
          let second: MutableAnimal | undefined
          for (let offsetX = -1; offsetX <= 1 && !second; offsetX += 1) {
            for (let offsetZ = -1; offsetZ <= 1 && !second; offsetZ += 1) {
              second = (buckets.get(`${cellX + offsetX},${cellZ + offsetZ}`) ?? []).find((other) => {
                if (other.id === first.id || used.has(other.id)) return false
                const position = positions.get(other.id)!
                return Math.hypot(position.x - firstPosition.x, position.z - firstPosition.z) <= cellSize
              })
            }
          }
          if (!second) continue
          used.add(first.id); used.add(second.id)
          inFlightAnimalIds.add(first.id)
          inFlightAnimalIds.add(second.id)
          const chance = Math.min(clampedChance, tuningFor(first.species).romanceChance)
          const roll = Math.max(0, Math.min(1 - Number.EPSILON, random()))
          const duration = Math.max(0, tuningFor(first.species).courtshipSeconds)
          first.courtshipPartnerId = second.id
          first.courtshipRemaining = duration
          first.courtshipSuccessful = roll < chance
          second.courtshipPartnerId = first.id
          second.courtshipRemaining = duration
          second.courtshipSuccessful = first.courtshipSuccessful
          events.push({ kind: 'courtship', animalId: first.id, partnerId: second.id, species: first.species })
        }
      }

      for (const first of animals.values()) {
        const secondId = first.courtshipPartnerId
        if (!secondId || first.id > secondId) continue
        const second = animals.get(secondId)
        if (first.courtshipRemaining > 0) first.courtshipRemaining = Math.max(0, first.courtshipRemaining - stageDt)
        if (second) second.courtshipRemaining = first.courtshipRemaining
        if (first.courtshipRemaining > 0) continue
        inFlightAnimalIds.delete(first.id)
        inFlightAnimalIds.delete(secondId)
        first.courtshipPartnerId = null
        first.paired = true
        first.romanceCooldown = tuningFor(first.species).romanceCooldownSeconds
        if (second) {
          second.courtshipPartnerId = null
          second.paired = true
          second.romanceCooldown = tuningFor(second.species).romanceCooldownSeconds
        }
        if (first.courtshipSuccessful && second && populationCount() < capacity(snapshot.expansionLevel)
          && hasPopulationSlot()) {
          const firstPosition = snapshot.positions?.[first.id] ?? { x: 0, z: 0 }
          const secondPosition = snapshot.positions?.[second.id] ?? firstPosition
          const egg: MutableEgg = {
            id: nextEggId++, species: first.species,
            x: (firstPosition.x + secondPosition.x) / 2,
            z: (firstPosition.z + secondPosition.z) / 2,
            incubation: 0, parentIds: [first.id, second.id],
          }
          eggs.set(egg.id, egg)
          events.push({ kind: 'layEgg', animalId: first.id, partnerId: second.id, species: first.species, eggId: egg.id, action: 'breedSpecies' })
        } else {
          first.paired = false
          if (second) second.paired = false
          events.push({ kind: 'courtshipEnd', animalId: first.id, partnerId: secondId, species: first.species })
        }
      }
      for (const egg of eggs.values()) egg.incubation += stageDt
      return events
    },
  }
  return api
}
