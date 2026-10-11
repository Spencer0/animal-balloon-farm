/**
 * The simulation half of an animal: a plain record of where it is and what it
 * intends, advanced on the fixed sim tick (see sim-clock.ts) and never drawn.
 *
 * The view (src/animals/balloon-animal.ts) reads this record and shows it:
 * position interpolated between the previous and current tick by the clock's
 * alpha, the intended motion mapped to an animation clip, the heading turned
 * into a smooth facing. Nothing here knows about three.js or the DOM.
 *
 * See docs/sim-view-split.md for the boundary and the migration plan.
 */

/** What the animal is doing with its legs. The view maps it to a clip. */
export type AnimalMotion = 'walk' | 'idle' | 'sleep'

export interface AnimalSimRecord {
  /** Position on the ground plane at the current tick. */
  x: number
  z: number
  /** Position one tick ago; the view blends from here to (x, z). */
  prevX: number
  prevZ: number
  /** Yaw about +Y for a +X-forward model, set while it walks. */
  heading: number
  motion: AnimalMotion
  /** Where the wander wants to go. */
  targetX: number
  targetZ: number
  /** Standing-about time left, in sim seconds. Infinity holds it still until released. */
  paused: number
  /** Time left before it picks a new target. */
  nextDecision: number
  /** True while on a long trek, so it does not change its mind half way. */
  longWalk: boolean
}

export function createAnimalSimRecord(init: { x: number; z: number; motion: AnimalMotion }): AnimalSimRecord {
  return {
    x: init.x,
    z: init.z,
    prevX: init.x,
    prevZ: init.z,
    heading: 0,
    motion: init.motion,
    targetX: init.x,
    targetZ: init.z,
    paused: 0,
    nextDecision: 0,
    longWalk: false,
  }
}

/** Open a tick: what was current becomes "previous" for the view to blend from. */
export function beginSimStep(record: AnimalSimRecord): void {
  record.prevX = record.x
  record.prevZ = record.z
}

/** Teleport: place the record at a point with no blend across the jump. */
export function snapAnimalSim(record: AnimalSimRecord, x: number, z: number): void {
  record.x = record.prevX = x
  record.z = record.prevZ = z
}

/** Shift the record sideways, previous and current together, so the blend stays continuous. */
export function shiftAnimalSim(record: AnimalSimRecord, dx: number, dz: number): void {
  record.x += dx
  record.z += dz
  record.prevX += dx
  record.prevZ += dz
}

export interface PlanarPoint {
  x: number
  z: number
}

/** The point to draw: `alpha` of the way from the previous tick to the current one. */
export function interpolateAnimalSim(record: AnimalSimRecord, alpha: number, out: PlanarPoint): PlanarPoint {
  const t = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
  out.x = record.prevX + (record.x - record.prevX) * t
  out.z = record.prevZ + (record.z - record.prevZ) * t
  return out
}

/** Yaw about +Y that turns a +X-forward model to face the ground direction (dx, dz). */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx)
}
