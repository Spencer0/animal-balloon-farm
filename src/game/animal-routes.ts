/**
 * Walks that are not wandering, as simulation systems: the trip to a house door
 * (a stroll, or a sprint when something is chasing it), steering toward a point
 * (a hunting snake, a visitor crossing the meadow), the walk to bed and the visitor's route
 * through the farm gate. All of them steer an `AnimalSimRecord` on the fixed tick; the
 * view only shows the result.
 *
 * Speeds, thresholds and random draws match what the per-frame animal did
 * before the sim/view split.
 */
import { containsFarmPoint } from './farm-footprint'
import type { GardenBounds } from './farm-expansion'
import { advanceAnimalTravel, canAnimalLeaveFarm, createAnimalTravelRoute } from './animal-travel'
import { headingOf, type AnimalSimRecord, type AnimalVisit } from './animal-sim'

/** Closer than this to the door counts as arrived. */
export const HOME_ARRIVE_DISTANCE = 0.25
/** Closer than this to its bed it is curled up there. */
export const SLEEP_ARRIVE_DISTANCE = 0.12
/** The walk to bed is a stroll: this share of its walking speed. */
export const SLEEP_WALK_SCALE = 0.8
/** Closer than this to its pursuit point it stops. */
export const PURSUIT_ARRIVE_DISTANCE = 0.05

/**
 * One tick of the walk to a house door. The caller has opened the step with
 * `beginSimStep`. Reaching the door sets `atDoor` and stands still there.
 */
export function stepHomeTrip(record: AnimalSimRecord, walkSpeed: number, dt: number): void {
  const trip = record.home
  if (!trip) return
  const dx = trip.x - record.x
  const dz = trip.z - record.z
  const distance = Math.hypot(dx, dz)
  if (distance > HOME_ARRIVE_DISTANCE) {
    record.heading = headingOf(dx, dz)
    const travel = Math.min(walkSpeed * trip.speedScale * dt, distance)
    record.x += (dx / distance) * travel
    record.z += (dz / distance) * travel
    record.motion = 'walk'
  } else {
    record.atDoor = true
    record.motion = 'idle'
  }
}

/**
 * One tick of steering toward the pursuit point at `walkSpeed` times its scale.
 * The caller has opened the step with `beginSimStep`. A zero scale, or being
 * on the spot, stands still.
 */
export function stepPursuit(record: AnimalSimRecord, walkSpeed: number, dt: number): void {
  const pursuit = record.pursuit
  if (!pursuit) return
  const dx = pursuit.x - record.x
  const dz = pursuit.z - record.z
  const distance = Math.hypot(dx, dz)
  const speed = walkSpeed * pursuit.speedScale
  if (speed > 0 && distance > PURSUIT_ARRIVE_DISTANCE) {
    record.heading = headingOf(dx, dz)
    const travel = Math.min(speed * dt, distance)
    record.x += (dx / distance) * travel
    record.z += (dz / distance) * travel
    record.motion = 'walk'
  } else {
    record.motion = 'idle'
  }
}

/**
 * One tick of the walk to bed, then of lying in it. The caller has opened the
 * step with `beginSimStep`. A sleeper that was nudged away gets up and goes back.
 */
export function stepSleep(record: AnimalSimRecord, walkSpeed: number, dt: number): void {
  const spot = record.sleepSpot
  if (!spot) return
  const dx = spot.x - record.x
  const dz = spot.z - record.z
  const distance = Math.hypot(dx, dz)
  if (distance > SLEEP_ARRIVE_DISTANCE) {
    record.asleep = false
    record.heading = headingOf(dx, dz)
    const travel = Math.min(walkSpeed * SLEEP_WALK_SCALE * dt, distance)
    record.x += (dx / distance) * travel
    record.z += (dz / distance) * travel
    record.motion = 'walk'
  } else {
    record.asleep = true
    record.heading = spot.heading
    record.motion = 'sleep'
  }
}

/**
 * How long a visitor stays on a side of the gate. A visitor pokes its head
 * into the plot and ambles back out, so its time inside is short; the time
 * out at the tents is longer so visits read as comings and goings.
 */
export function visitCooldown(stage: number, side: 'carnival' | 'farm', rng: () => number): number {
  if (stage >= 3) return 28 + rng() * 18
  // Long enough to look like browsing, and different every time.
  return side === 'farm' ? 16 + rng() * 34 : 14 + rng() * 36
}

/**
 * Start a gate walk from `at`. A flier crosses by air, so it only changes side.
 * A carnival wanderer that already stands inside the plot is simply on the farm.
 */
export function beginGateTravel(
  record: AnimalSimRecord,
  direction: 'enter' | 'leave',
  at: { readonly x: number; readonly z: number },
  bounds: GardenBounds,
  flier: boolean,
  stage: number,
  rng: () => number,
): void {
  const visit = record.visit
  if (flier) {
    visit.side = direction === 'enter' ? 'farm' : 'carnival'
    return
  }
  if (direction === 'enter' && containsFarmPoint(at.x, at.z, bounds)) {
    visit.side = 'farm'
    visit.direction = null
    visit.route = null
    visit.cooldown = visitCooldown(stage, 'farm', rng)
    return
  }
  if (direction === 'enter') visit.side = 'carnival'
  visit.direction = direction
  visit.route = createAnimalTravelRoute(direction, bounds, { x: at.x, z: at.z })
  const first = visit.route.waypoints[visit.route.nextWaypoint]
  record.targetX = first.x
  record.targetZ = first.z
  record.nextDecision = 0
  record.paused = 0
  record.motion = 'walk'
}

/**
 * Count down the rest on this side of the gate and start the next trip when it
 * ends. Only stage-two visitors browse both sides; settled residents stay in.
 */
export function tickVisitCooldown(
  record: AnimalSimRecord,
  dt: number,
  bounds: GardenBounds,
  flier: boolean,
  stage: number,
  rng: () => number,
): void {
  const visit = record.visit
  if (!canAnimalLeaveFarm(stage) || visit.cooldown <= 0) return
  visit.cooldown = Math.max(0, visit.cooldown - dt)
  if (visit.cooldown === 0) beginGateTravel(record, visit.side === 'farm' ? 'leave' : 'enter', record, bounds, flier, stage, rng)
}

/**
 * One tick along the gate route at `speed`. The caller has opened the step with
 * `beginSimStep`. Returns true on the tick the route ends.
 */
export function stepGateTravel(record: AnimalSimRecord, speed: number, dt: number, stage: number, rng: () => number): boolean {
  const visit: AnimalVisit = record.visit
  if (!visit.route) return false
  const step = advanceAnimalTravel({ x: record.x, z: record.z }, visit.route, speed * dt)
  const dx = step.position.x - record.x
  const dz = step.position.z - record.z
  record.x = step.position.x
  record.z = step.position.z
  if (dx * dx + dz * dz > 1e-8) {
    record.heading = headingOf(dx, dz)
    record.motion = 'walk'
  }
  visit.route = step.route
  if (!step.completed) return false
  const finished = visit.direction
  visit.side = finished === 'leave' ? 'carnival' : 'farm'
  visit.direction = null
  visit.cooldown = canAnimalLeaveFarm(stage) ? visitCooldown(stage, visit.side, rng) : 0
  record.targetX = record.x
  record.targetZ = record.z
  record.motion = 'idle'
  return true
}
