/**
 * Plant raiders: the animals that eat a grown plant down to nothing. A squirrel
 * strips a blueberry bush, a mole digs up roots, a raccoon raids the vine patch
 * and a goose tears up lily pads (`PlantSpecies.raid` says who eats what). Each
 * raider walks to the nearest grown plant it eats, takes one bite, rests, and
 * comes back; enough bites wither the plant for good. Plants inside a closed
 * fence are never targeted, which is what a fence is for.
 *
 * Pure: the scene hands in the animal, the plants and an atomic `bite`.
 */
import { plantSpecies, type GardenPlant } from './plants'

export const RAID_BITE_SECONDS = 2.4
export const RAID_PLUCK_SECONDS = 0.65
export const RAID_REST_SECONDS = 1.1
export const RAID_REACH = 0.82

export interface PlantRaider {
  targetId: number | null
  phase: 'seek' | 'approach' | 'eat' | 'rest'
  elapsed: number
  plucked: boolean
}

export function createPlantRaider(): PlantRaider {
  return { targetId: null, phase: 'seek', elapsed: 0, plucked: false }
}

export interface RaidCommand {
  readonly target: { x: number; z: number; speedScale: number } | null
  readonly eating: boolean
  /** The bite is in its paws (a squirrel holds its berry up while it chews). */
  readonly holdingBerry: boolean
  readonly completedBite: boolean
}

/** Whether this species eats this plant, and the plant has a bite left to give. */
export function canRaid(species: string, plant: GardenPlant): boolean {
  if (!plant.mature || !plantSpecies(plant.species).raid?.by.includes(species)) return false
  return plant.ripeFruit === undefined || plant.ripeFruit > 0
}

/**
 * The injected bite is atomic: two squirrels cannot both take the last berry.
 * `fenced` holds the plants shut inside a fence, which no raider goes for.
 */
export function stepPlantRaider(
  state: PlantRaider,
  animal: { readonly species: string; readonly x: number; readonly z: number; readonly eligible: boolean },
  plants: readonly GardenPlant[],
  dt: number,
  bite: (plantId: number) => boolean,
  fenced: ReadonlySet<number> = new Set(),
): RaidCommand {
  const idle = { target: null, eating: false, holdingBerry: false, completedBite: false }
  if (!animal.eligible) {
    Object.assign(state, createPlantRaider())
    return idle
  }
  const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0
  state.elapsed += delta
  if (state.phase === 'rest') {
    if (state.elapsed >= RAID_REST_SECONDS) Object.assign(state, createPlantRaider())
    return idle
  }
  if (state.phase === 'seek') {
    const food = plants.filter((plant) => !fenced.has(plant.instanceId) && canRaid(animal.species, plant))
    food.sort((a, b) => (a.x - animal.x) ** 2 + (a.z - animal.z) ** 2 - (b.x - animal.x) ** 2 - (b.z - animal.z) ** 2)
    if (!food[0]) return idle
    state.targetId = food[0].instanceId
    state.phase = 'approach'
    state.elapsed = 0
  }
  const bush = plants.find((plant) => plant.instanceId === state.targetId)
  // Gone, fenced in, withered or picked clean before the bite: give up. Once the
  // bite is in its paws it chews on, even when that bite was the one that withered the plant.
  const spoiled = bush && !state.plucked && (!bush.mature || fenced.has(bush.instanceId) || (state.phase === 'approach' && !canRaid(animal.species, bush)))
  if (!bush || spoiled || state.elapsed > 20) {
    Object.assign(state, createPlantRaider(), { phase: 'rest' })
    return idle
  }
  const dx = animal.x - bush.x
  const dz = animal.z - bush.z
  const distance = Math.hypot(dx, dz)
  if (state.phase === 'approach') {
    if (distance > RAID_REACH + 0.07) {
      const directionX = distance > 0 ? dx / distance : 1
      const directionZ = distance > 0 ? dz / distance : 0
      return { ...idle, target: { x: bush.x + directionX * RAID_REACH, z: bush.z + directionZ * RAID_REACH, speedScale: 1.15 } }
    }
    state.phase = 'eat'
    state.elapsed = 0
    state.plucked = false
  }
  // Nudged away before the pluck: approach again instead of eating across the yard.
  if (!state.plucked && distance > RAID_REACH + 0.22) {
    state.phase = 'approach'
    state.elapsed = 0
    return idle
  }
  if (!state.plucked && state.elapsed >= RAID_PLUCK_SECONDS) {
    if (!bite(bush.instanceId)) {
      Object.assign(state, createPlantRaider(), { phase: 'rest' })
      return idle
    }
    state.plucked = true
  }
  if (state.plucked && state.elapsed >= RAID_BITE_SECONDS) {
    state.phase = 'rest'
    state.elapsed = 0
    return { ...idle, completedBite: true }
  }
  return {
    target: { x: bush.x, z: bush.z, speedScale: 0 },
    eating: true,
    holdingBerry: state.plucked,
    completedBite: false,
  }
}
