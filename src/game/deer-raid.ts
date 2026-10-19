import type { GardenPlant } from './plants'

/**
 * Deer raid the garden: pure, like the rest of `src/game/`.
 *
 * A deer on the farm rests a while, picks a *random* plant (not the nearest:
 * nothing in the garden is safe), walks up to it and eats it whole. The plant
 * is gone. A placed salt lick beats any plant: while one stands on the farm,
 * every deer goes and licks it instead, and leaves the garden alone. That is
 * the whole cure, and Pip sells it from the first shelf. A fence is not: deer
 * jump it.
 */

/** Seconds head-down at a plant before it is gone. Long enough to run over and see it happen. */
export const DEER_BITE_SECONDS = 3.2
/** How far from a plant's centre the deer stands to eat it. */
export const DEER_REACH = 1.05
/** Seconds between one raid and the next, per deer: a random wait in this range. */
export const DEER_REST_SECONDS = { min: 28, max: 55 } as const
/** The first raid after a deer steps onto the farm comes sooner, so the player sees why it came. */
export const DEER_FIRST_RAID_SECONDS = 6
/** A plant this far grown is worth eating; a seed just in the ground (or a withered one) is not. */
export const DEER_MIN_GROWTH = 0.25
/** A deer that cannot reach its plant in this long gives up for a short while. */
export const DEER_APPROACH_LIMIT_SECONDS = 25
/**
 * How far from a salt lick's centre the deer stands to lick it. The lick blocks its whole 2 m
 * cell and a deer's body is about 0.6 m round, so anything under 1.6 cannot be reached.
 */
export const SALT_LICK_REACH = 1.8
/** A licking session, then a short wander, then back to the lick. */
export const SALT_LICK_SECONDS = 9
export const SALT_BROWSE_SECONDS = 10

export interface DeerRaider {
  phase: 'rest' | 'approach' | 'eat' | 'lick' | 'browse'
  targetId: number | null
  elapsed: number
  /** How long this rest lasts. */
  restFor: number
}

export function createDeerRaider(): DeerRaider {
  return { phase: 'rest', targetId: null, elapsed: 0, restFor: DEER_FIRST_RAID_SECONDS }
}

export interface DeerCommand {
  /** Where to walk; `speedScale` 0 holds it in place. Null hands the deer back to its wander. */
  readonly target: { x: number; z: number; speedScale: number } | null
  /** What to face while eating or licking. */
  readonly face: { x: number; z: number } | null
  /** Head down: eating a plant or licking salt. */
  readonly eating: boolean
  readonly licking: boolean
  /** The plant this deer finished eating this tick, already taken through `eat`. */
  readonly ate: number | null
}

const IDLE: DeerCommand = { target: null, face: null, eating: false, licking: false, ate: null }

export interface SaltLickSpot {
  readonly x: number
  readonly z: number
}

/** Deer jump fences, so unlike the other raiders (`plant-raid.ts`) a fenced plant is no safer: only a salt lick is. */
export function edibleForDeer(plant: GardenPlant): boolean {
  return plant.growth >= DEER_MIN_GROWTH && !plant.withered
}

function standBeside(animal: { readonly x: number; readonly z: number }, spot: { readonly x: number; readonly z: number }, reach: number, speedScale: number) {
  const dx = animal.x - spot.x
  const dz = animal.z - spot.z
  const distance = Math.hypot(dx, dz)
  const ux = distance > 1e-6 ? dx / distance : 1
  const uz = distance > 1e-6 ? dz / distance : 0
  return { distance, stand: { x: spot.x + ux * reach, z: spot.z + uz * reach, speedScale } }
}

function rest(state: DeerRaider, seconds: number): DeerCommand {
  Object.assign(state, { phase: 'rest', targetId: null, elapsed: 0, restFor: seconds })
  return IDLE
}

function restSeconds(random: () => number): number {
  return DEER_REST_SECONDS.min + (DEER_REST_SECONDS.max - DEER_REST_SECONDS.min) * random()
}

/**
 * One tick of one deer. `eat` removes the plant and says whether it was still
 * there (two deer can pick the same plant; only one gets it).
 */
export function stepDeerRaider(
  state: DeerRaider,
  animal: { readonly x: number; readonly z: number; readonly eligible: boolean },
  plants: readonly GardenPlant[],
  licks: readonly SaltLickSpot[],
  dt: number,
  random: () => number,
  eat: (plantId: number) => boolean,
): DeerCommand {
  const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0
  if (!animal.eligible) {
    // Drop whatever it was walking to, but a rest keeps running: a deer that strolled off the
    // farm for a minute comes back hungry.
    if (state.phase !== 'rest') Object.assign(state, { phase: 'rest', targetId: null, elapsed: 0 })
    else state.elapsed += delta
    return IDLE
  }
  state.elapsed += delta

  // A salt lick wins over every plant, even one half eaten.
  if (licks.length > 0) {
    if (state.phase !== 'lick' && state.phase !== 'browse') Object.assign(state, { phase: 'lick', targetId: null, elapsed: 0 })
    if (state.phase === 'browse') {
      if (state.elapsed < SALT_BROWSE_SECONDS) return IDLE
      Object.assign(state, { phase: 'lick', elapsed: 0 })
    }
    const lick = [...licks].sort((a, b) => (a.x - animal.x) ** 2 + (a.z - animal.z) ** 2 - (b.x - animal.x) ** 2 - (b.z - animal.z) ** 2)[0]
    const { distance, stand } = standBeside(animal, lick, SALT_LICK_REACH, 1)
    if (distance > SALT_LICK_REACH + 0.35) {
      // Walking over does not use up the session.
      state.elapsed = 0
      return { ...IDLE, target: stand }
    }
    if (state.elapsed >= SALT_LICK_SECONDS) {
      Object.assign(state, { phase: 'browse', elapsed: 0 })
      return IDLE
    }
    return { target: { ...stand, speedScale: 0 }, face: lick, eating: true, licking: true, ate: null }
  }
  if (state.phase === 'lick' || state.phase === 'browse') return rest(state, restSeconds(random))

  if (state.phase === 'rest') {
    if (state.elapsed < state.restFor) return IDLE
    const edible = plants.filter(edibleForDeer)
    if (edible.length === 0) return rest(state, 4)
    const pick = edible[Math.min(edible.length - 1, Math.floor(random() * edible.length))]
    Object.assign(state, { phase: 'approach', targetId: pick.instanceId, elapsed: 0 })
  }

  const plant = plants.find((entry) => entry.instanceId === state.targetId)
  if (!plant) return rest(state, 3)
  const { distance, stand } = standBeside(animal, plant, DEER_REACH, 1.1)
  if (state.phase === 'approach') {
    if (state.elapsed > DEER_APPROACH_LIMIT_SECONDS) return rest(state, 6)
    if (distance > DEER_REACH + 0.12) return { ...IDLE, target: stand }
    Object.assign(state, { phase: 'eat', elapsed: 0 })
  }
  // Pushed off it mid-bite: walk back and start the bite over.
  if (distance > DEER_REACH + 0.4) {
    Object.assign(state, { phase: 'approach', elapsed: 0 })
    return { ...IDLE, target: stand }
  }
  if (state.elapsed >= DEER_BITE_SECONDS) {
    const id = plant.instanceId
    const gone = eat(id)
    rest(state, restSeconds(random))
    return gone ? { ...IDLE, ate: id } : IDLE
  }
  return { target: { ...stand, speedScale: 0 }, face: plant, eating: true, licking: false, ate: null }
}
