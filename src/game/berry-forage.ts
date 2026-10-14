import type { GardenPlant } from './plants'

export const BERRY_BITE_SECONDS = 2.4
export const BERRY_PLUCK_SECONDS = 0.65
export const BERRY_REST_SECONDS = 1.1
export const BERRY_REACH = 0.82

export interface BerryForager {
  targetId: number | null
  phase: 'seek' | 'approach' | 'eat' | 'rest'
  elapsed: number
  plucked: boolean
}

export function createBerryForager(): BerryForager {
  return { targetId: null, phase: 'seek', elapsed: 0, plucked: false }
}

export interface ForageCommand {
  readonly target: { x: number; z: number; speedScale: number } | null
  readonly eating: boolean
  readonly holdingBerry: boolean
  readonly completedBite: boolean
}

/** The injected pick is atomic: two squirrels cannot both take the last berry. */
export function stepBerryForager(
  state: BerryForager,
  animal: { readonly x: number; readonly z: number; readonly eligible: boolean },
  plants: readonly GardenPlant[],
  dt: number,
  pick: (plantId: number) => number | null,
): ForageCommand {
  const idle = { target: null, eating: false, holdingBerry: false, completedBite: false }
  if (!animal.eligible) {
    Object.assign(state, createBerryForager())
    return idle
  }
  const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0
  state.elapsed += delta
  if (state.phase === 'rest') {
    if (state.elapsed >= BERRY_REST_SECONDS) Object.assign(state, createBerryForager())
    return idle
  }
  if (state.phase === 'seek') {
    const ripe = plants.filter((plant) => plant.species === 'blueberry' && plant.mature && (plant.ripeFruit ?? 0) > 0)
    ripe.sort((a, b) => (a.x - animal.x) ** 2 + (a.z - animal.z) ** 2 - (b.x - animal.x) ** 2 - (b.z - animal.z) ** 2)
    if (!ripe[0]) return idle
    state.targetId = ripe[0].instanceId
    state.phase = 'approach'
    state.elapsed = 0
  }
  const bush = plants.find((plant) => plant.instanceId === state.targetId)
  if (!bush || !bush.mature || (state.phase === 'approach' && bush.ripeFruit === 0) || state.elapsed > 20) {
    Object.assign(state, createBerryForager(), { phase: 'rest' })
    return idle
  }
  const dx = animal.x - bush.x
  const dz = animal.z - bush.z
  const distance = Math.hypot(dx, dz)
  if (state.phase === 'approach') {
    if (distance > BERRY_REACH + 0.07) {
      const directionX = distance > 0 ? dx / distance : 1
      const directionZ = distance > 0 ? dz / distance : 0
      return { ...idle, target: { x: bush.x + directionX * BERRY_REACH, z: bush.z + directionZ * BERRY_REACH, speedScale: 1.15 } }
    }
    state.phase = 'eat'
    state.elapsed = 0
    state.plucked = false
  }
  // Nudged away before the pluck: approach again instead of eating across the yard.
  if (!state.plucked && distance > BERRY_REACH + 0.22) {
    state.phase = 'approach'
    state.elapsed = 0
    return idle
  }
  if (!state.plucked && state.elapsed >= BERRY_PLUCK_SECONDS) {
    if (pick(bush.instanceId) === null) {
      Object.assign(state, createBerryForager(), { phase: 'rest' })
      return idle
    }
    state.plucked = true
  }
  if (state.plucked && state.elapsed >= BERRY_BITE_SECONDS) {
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
