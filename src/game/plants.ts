export type PlantId = 'clover' | 'dandelion' | 'poppy' | 'water-lily'
export type PlantCare = 'water' | 'prune'
export type PlantSubstrate = 'grass' | 'soil' | 'water' | 'unknown'
export type PlantPlacementFailure = 'out-of-bounds' | 'wrong-substrate' | 'needs-visible-water' | 'too-close' | 'out-of-seeds'

export interface PlantSpecies {
  readonly id: PlantId
  readonly name: string
  readonly subtitle: string
  readonly description: string
  readonly color: string
  readonly substrate: PlantSubstrate
  readonly spacingRadius: number
  readonly growthSeconds: number
  /**
   * Where in its growth (0..1) the plant stops and asks for something. Care is
   * a short list of moments, not a timer: a few taps per plant, and a plant
   * that has to wait for you just waits. It never wilts and never dies.
   */
  readonly care: readonly PlantCareStop[]
  /**
   * Ground cover blends into the lawn instead of standing on it: it needs real
   * turf under it (this much grass coverage, 0..1) and is drawn as a round patch.
   */
  readonly groundCover?: { readonly minCoverage: number }
}

export interface PlantCareStop {
  readonly at: number
  readonly kind: PlantCare
}

export const PLANT_CATALOG: readonly PlantSpecies[] = [
  {
    id: 'clover', name: 'Clover', subtitle: 'Meadow groundcover',
    description: 'A round patch of clover sown into the lawn. Water it twice while it spreads; it stays for good. Sheep come for it.',
    color: '#79ad58', substrate: 'grass', spacingRadius: 1.05,
    growthSeconds: 80,
    care: [{ at: 0.2, kind: 'water' }, { at: 0.6, kind: 'water' }],
    groundCover: { minCoverage: 0.5 },
  },
  {
    id: 'dandelion', name: 'Dandelion', subtitle: 'Sunny lawn weed',
    description: 'A round patch of dandelions sown into the lawn. Water it twice while it blooms; it stays for good. Chickens come for it.',
    color: '#e9c545', substrate: 'grass', spacingRadius: 1.05,
    growthSeconds: 90,
    care: [{ at: 0.25, kind: 'water' }, { at: 0.65, kind: 'water' }],
    groundCover: { minCoverage: 0.5 },
  },
  {
    id: 'poppy', name: 'Poppy', subtitle: 'A bright little flower',
    description: 'Plant in bare soil. Keep it watered and pinch back one stray shoot.',
    color: '#e77b62', substrate: 'soil', spacingRadius: 0.64,
    growthSeconds: 90,
    care: [{ at: 0.3, kind: 'water' }, { at: 0.52, kind: 'prune' }, { at: 0.78, kind: 'water' }],
  },
  {
    id: 'water-lily', name: 'Water lily', subtitle: 'Pondside floater',
    description: 'Needs a visible pond, a drink, and a little pruning as it grows.',
    color: '#d994c9', substrate: 'water', spacingRadius: 0.8,
    growthSeconds: 100,
    care: [{ at: 0.3, kind: 'water' }, { at: 0.48, kind: 'prune' }, { at: 0.75, kind: 'water' }],
  },
] as const

export const STARTING_SEEDS_PER_PLANT = 5
export const PLANT_WATER_MIN_DEPTH = 0.04
const PLANT_SPACING_GAP = 0.12

/**
 * How much room one plant claims around its own centre: its own radius plus
 * half the gap it keeps from a neighbour. The placement preview ring is drawn
 * at exactly this radius so the circle the player sees is the space the rules
 * enforce.
 */
export function plantSpacingExtent(species: PlantId): number {
  return plantSpecies(species).spacingRadius + PLANT_SPACING_GAP / 2
}

export interface PlantSurface {
  readonly substrate: PlantSubstrate
  readonly waterDepth: number
  readonly inBounds: boolean
  /** How thickly grassed the ground is, 0..1. Unset counts as thick enough. */
  readonly coverage?: number
}

export interface GardenPlant {
  readonly instanceId: number
  readonly species: PlantId
  readonly x: number
  readonly z: number
  readonly growth: number
  readonly mature: boolean
  readonly careNeeded: PlantCare | null
}

export interface PlantPlacementResult {
  readonly valid: boolean
  readonly failure: PlantPlacementFailure | null
}

export interface PlantSimulation {
  readonly plants: readonly GardenPlant[]
  seedsFor(species: PlantId): number
  countPlants(species?: PlantId): number
  placementResult(species: PlantId, x: number, z: number, surface: PlantSurface): PlantPlacementResult
  plant(species: PlantId, x: number, z: number, surface: PlantSurface): GardenPlant | null
  remove(instanceId: number): GardenPlant | null
  resolveCare(instanceId: number, care: PlantCare): boolean
  tick(deltaSeconds: number): void
}

interface MutablePlant {
  readonly instanceId: number
  readonly species: PlantId
  readonly x: number
  readonly z: number
  growth: number
  careNeeded: PlantCare | null
  /** How many of the species' care stops have been answered. */
  stopsDone: number
}

const SPECIES_BY_ID = new Map(PLANT_CATALOG.map((species) => [species.id, species]))

export function plantSpecies(species: PlantId): PlantSpecies {
  const definition = SPECIES_BY_ID.get(species)
  if (!definition) throw new RangeError(`Unknown plant species: ${species}`)
  return definition
}

export function createPlantSimulation(): PlantSimulation {
  const plants: MutablePlant[] = []
  const seedCounts = new Map<PlantId, number>(PLANT_CATALOG.map(({ id }) => [id, STARTING_SEEDS_PER_PLANT]))
  let nextInstanceId = 1

  function snapshot(plant: MutablePlant): GardenPlant {
    return {
      instanceId: plant.instanceId,
      species: plant.species,
      x: plant.x,
      z: plant.z,
      growth: plant.growth,
      mature: plant.growth >= 1,
      careNeeded: plant.careNeeded,
    }
  }

  function placementResult(species: PlantId, x: number, z: number, surface: PlantSurface): PlantPlacementResult {
    const definition = plantSpecies(species)
    if (!surface.inBounds) return { valid: false, failure: 'out-of-bounds' }
    if ((seedCounts.get(species) ?? 0) <= 0) return { valid: false, failure: 'out-of-seeds' }
    if (definition.substrate === 'water') {
      if (surface.substrate !== 'water' || surface.waterDepth < PLANT_WATER_MIN_DEPTH) {
        return { valid: false, failure: 'needs-visible-water' }
      }
    } else if (surface.substrate !== definition.substrate) {
      return { valid: false, failure: 'wrong-substrate' }
    } else if (definition.groundCover && (surface.coverage ?? 1) < definition.groundCover.minCoverage) {
      return { valid: false, failure: 'wrong-substrate' }
    }
    const tooClose = plants.some((other) => {
      const otherRadius = plantSpecies(other.species).spacingRadius
      const minimum = definition.spacingRadius + otherRadius + PLANT_SPACING_GAP
      return (other.x - x) ** 2 + (other.z - z) ** 2 < minimum * minimum
    })
    if (tooClose) return { valid: false, failure: 'too-close' }
    return { valid: true, failure: null }
  }

  return {
    get plants(): readonly GardenPlant[] {
      return plants.map(snapshot)
    },
    seedsFor(species): number {
      return seedCounts.get(species) ?? 0
    },
    countPlants(species): number {
      return species === undefined ? plants.length : plants.filter((plant) => plant.species === species).length
    },
    placementResult,
    plant(species, x, z, surface): GardenPlant | null {
      if (!placementResult(species, x, z, surface).valid) return null
      const plant: MutablePlant = {
        instanceId: nextInstanceId++,
        species,
        x,
        z,
        growth: 0.04,
        careNeeded: null,
        stopsDone: 0,
      }
      plants.push(plant)
      seedCounts.set(species, (seedCounts.get(species) ?? 0) - 1)
      return snapshot(plant)
    },
    remove(instanceId): GardenPlant | null {
      const index = plants.findIndex((plant) => plant.instanceId === instanceId)
      if (index < 0) return null
      return snapshot(plants.splice(index, 1)[0])
    },
    resolveCare(instanceId, care): boolean {
      const plant = plants.find((entry) => entry.instanceId === instanceId)
      if (!plant || plant.growth >= 1 || plant.careNeeded !== care) return false
      plant.careNeeded = null
      plant.stopsDone += 1
      return true
    },
    tick(deltaSeconds): void {
      const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      if (delta === 0) return
      for (const plant of plants) {
        if (plant.growth >= 1 || plant.careNeeded) continue
        const definition = plantSpecies(plant.species)
        const stop = definition.care[plant.stopsDone]
        const nextGrowth = Math.min(1, plant.growth + delta / definition.growthSeconds)
        if (stop && nextGrowth >= stop.at) {
          plant.growth = stop.at
          plant.careNeeded = stop.kind
          continue
        }
        plant.growth = nextGrowth
      }
    },
  }
}
