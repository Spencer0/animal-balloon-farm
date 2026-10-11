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

import type { AnimalTravelRoute } from './animal-travel'

/** A walk to a house door, and how hard to run: above 1 is a sprint, e.g. a mouse fleeing a snake. */
export interface AnimalHomeTrip {
  readonly x: number
  readonly z: number
  readonly speedScale: number
}

/**
 * Steer toward a point at `speedScale` times the walking speed, as a hunting
 * snake does or a visitor walking in across the meadow. Zero holds it still.
 */
export interface AnimalPursuit {
  readonly x: number
  readonly z: number
  readonly speedScale: number
}

/** Where a night animal curls up for the day, and which way it faces (yaw about +Y, +X-forward model). */
export interface AnimalSleepSpot {
  readonly x: number
  readonly z: number
  readonly heading: number
}

/**
 * Where an animal is in its comings and goings through the farm gate. A visitor
 * walks `route` between the carnival and the plot, and rests `cooldown` seconds
 * on each side before the next trip.
 */
export interface AnimalVisit {
  route: AnimalTravelRoute | null
  direction: 'enter' | 'leave' | null
  side: 'carnival' | 'farm'
  cooldown: number
}

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
  /** Footprint radius for collision, in ground units: catalog size times the growth scale. */
  radius: number
  /** The house door it is walking to, or null. Takes priority over wandering and gate travel. */
  home: AnimalHomeTrip | null
  /** True once it has reached the door it was sent to; cleared by the next trip. */
  atDoor: boolean
  visit: AnimalVisit
  /** A point to steer to; it beats wandering and the gate route, and a home trip beats it. */
  pursuit: AnimalPursuit | null
  /** Prey in a panic: runs 2.2 times faster in short dashes. */
  alarmed: boolean
  /** The bed it was sent to. A home trip and a pursuit beat it; it beats the gate route and wandering. */
  sleepSpot: AnimalSleepSpot | null
  /** True once it has reached its bed and is curled up (not merely on its way there). */
  asleep: boolean
}

export function createAnimalSimRecord(init: {
  x: number
  z: number
  motion: AnimalMotion
  radius?: number
  side?: 'carnival' | 'farm'
}): AnimalSimRecord {
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
    radius: init.radius ?? 0.5,
    home: null,
    atDoor: false,
    visit: { route: null, direction: null, side: init.side ?? 'carnival', cooldown: 0 },
    pursuit: null,
    alarmed: false,
    sleepSpot: null,
    asleep: false,
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

/**
 * Push the record sideways on the current tick only. Collision runs after the
 * walk of the same tick, so the view blends from where the animal was to where
 * it ended up after being pushed, and the correction is spread across the tick.
 */
export function pushAnimalSim(record: AnimalSimRecord, dx: number, dz: number): void {
  record.x += dx
  record.z += dz
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

/**
 * Start, change or end a pursuit. Ending one sends the animal back to wandering
 * with a fresh spot to pick, rather than the one from before the chase.
 */
export function setSimPursuit(record: AnimalSimRecord, next: AnimalPursuit | null): void {
  if (record.pursuit && !next) {
    record.paused = 0
    record.nextDecision = 0
  }
  record.pursuit = next
}

/** Panic or calm an animal. A panic cuts short whatever it was standing about doing. */
export function setSimAlarmed(record: AnimalSimRecord, alarmed: boolean): void {
  if (record.alarmed === alarmed) return
  record.alarmed = alarmed
  if (alarmed) {
    record.paused = 0
    record.nextDecision = 0
  }
}
