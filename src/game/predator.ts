/**
 * Predators: who hunts whom, and how an owl flies the night shift.
 *
 * Pure, like the rest of `src/game/` (no Three.js, no DOM). The scene feeds in
 * where the prey are and applies the pose this module returns; everything that
 * decides *what the owl does* lives here, so the hunt can be driven from a node
 * test one simulated second at a time.
 *
 * The owl is a balloon, so it barely flaps. It rides the air on a slow
 * patrol, picks a chicken, circles it while the chicken panics, folds its
 * wings and dives, and the chicken pops. After a catch it climbs away and
 * waits out a cooldown, so a flock is thinned over a night and not in a minute.
 */

import { phaseOf } from './day-night'

/** Who eats what. A predator only ever hunts the species listed against it. */
export const PREY_OF: Readonly<Record<string, readonly string[]>> = {
  owl: ['chicken'],
  // The snake hunts on the ground, in the long grass: see `ground-hunt.ts`.
  snake: ['mouse', 'rat'],
}

/** The flock the owl will not hunt below, so the prey can keep breeding. */
export const PREY_FLOOR = 2

/** True while it is dark enough for the night shift (matches the sky's 'night'). */
export function isNightTime(timeOfDay: number): boolean {
  return phaseOf(timeOfDay) === 'night'
}

// ------------------------------------------------------------------ ledger --

/** A running tally of what has been eaten on this farm, per prey species. */
export interface PredationLedger {
  record(preySpecies: string): number
  eaten(preySpecies: string): number
  readonly totals: Readonly<Record<string, number>>
  clear(): void
  /** Put a saved tally back; counts that are not whole non-negative numbers are dropped. */
  restore(totals: Readonly<Record<string, number>>): void
}

export function createPredationLedger(): PredationLedger {
  const counts = new Map<string, number>()
  return {
    record(preySpecies) {
      const next = (counts.get(preySpecies) ?? 0) + 1
      counts.set(preySpecies, next)
      return next
    },
    eaten: (preySpecies) => counts.get(preySpecies) ?? 0,
    get totals(): Readonly<Record<string, number>> { return Object.fromEntries(counts) },
    clear() { counts.clear() },
    restore(totals) {
      counts.clear()
      for (const [species, count] of Object.entries(totals)) {
        if (Number.isFinite(count) && count > 0) counts.set(species, Math.floor(count))
      }
    },
  }
}

// -------------------------------------------------------------- flight sim --

export type OwlPhase =
  | 'away'      // not in the world: daytime, or no roost to go home to
  | 'roost'     // perched on the oak
  | 'takeoff'   // dropping off the branch and climbing to cruise height
  | 'patrol'    // slow loops over the farm
  | 'stalk'     // circling a chosen chicken, descending
  | 'dive'      // wings folded, straight at the chicken
  | 'strike'    // the catch: one beat of contact
  | 'recover'   // climbing away after a catch
  | 'return'    // heading home to the roost at first light
  | 'landing'   // settling onto the branch

/**
 * A balloon owl stays up on helium, and an oak is where it tops up. A resident
 * with no oak at all (the player picked it up) cannot roost, so it drifts on
 * and slowly deflates; at empty it pops. Putting an oak back refills it.
 */
export const HELIUM_SECONDS = 120
/** Refilling is quicker than leaking: a tank takes a sixth of the time to top up. */
export const HELIUM_REFILL_FACTOR = 6

export function stepHelium(level: number, stranded: boolean, deltaSeconds: number): number {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
  const next = stranded
    ? level - dt / HELIUM_SECONDS
    : level + (dt * HELIUM_REFILL_FACTOR) / HELIUM_SECONDS
  return Math.min(1, Math.max(0, next))
}

export interface Point3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface OwlFlight {
  phase: OwlPhase
  x: number
  y: number
  z: number
  /** Yaw in radians, the model's +X forward axis rotated about +Y (three.js). */
  heading: number
  /** Nose-down angle in radians; positive dives. */
  pitch: number
  /** 0 = wings folded, 1 = full beat. Balloons barely need to flap. */
  flap: number
  /** Seconds spent in the current phase. */
  timer: number
  /** Seconds until the next hunt is allowed. */
  cooldown: number
  /** Angle around the patrol loop. */
  orbit: number
  /** The chicken being hunted, or null. */
  preyId: string | null
  /** 1 = full of helium, 0 = flat. Only drains while stranded. */
  helium: number
}

export interface PreyView {
  readonly id: string
  readonly x: number
  readonly z: number
  /** False for prey that cannot be taken right now (mid-capture, courting, sold). */
  readonly targetable: boolean
}

export interface OwlWorld {
  readonly night: boolean
  /** The perch, or null when the farm has no oak. */
  readonly roost: Point3 | null
  /** Where the patrol loops are centred. */
  readonly center: { readonly x: number; readonly z: number }
  /** Half-extents of the patrol loop. */
  readonly radius: { readonly x: number; readonly z: number }
  /** Whether this owl may hunt (visitors and residents may; carnival owls may not). */
  readonly huntAllowed: boolean
  readonly prey: readonly PreyView[]
  /** Whether the owl may exist in the world at all (a stage above 0). */
  readonly present: boolean
  /** A resident whose farm has no oak: it cannot roost, so it stays aloft and slowly deflates. */
  readonly stranded?: boolean
}

export type OwlEvent =
  | { readonly kind: 'stalk'; readonly preyId: string }
  | { readonly kind: 'abandon'; readonly preyId: string }
  | { readonly kind: 'catch'; readonly preyId: string; readonly x: number; readonly z: number }
  /** The helium ran out: the owl pops. */
  | { readonly kind: 'deflated' }

export const OWL_TUNING = {
  cruiseHeight: 6.2,
  stalkHeight: 3.4,
  strikeHeight: 0.9,
  patrolSpeed: 4.2,
  stalkSpeed: 3.6,
  diveSpeed: 10.5,
  climbSpeed: 3.8,
  loopSpeed: 0.34,
  stalkSeconds: 2.6,
  strikeSeconds: 0.55,
  recoverSeconds: 2.4,
  landingSeconds: 1.8,
  takeoffSeconds: 1.8,
  /** Seconds between hunts. A flock is thinned over a night, not in a minute. */
  huntCooldown: 26,
  /** The first hunt of a night comes sooner, so the owl's arrival has a point. */
  firstHuntCooldown: 9,
  stalkRadius: 1.6,
  catchDistance: 0.55,
  /** How far outside the patrol loop an arriving owl first appears. */
  entryMargin: 14,
} as const

export function createOwlFlight(): OwlFlight {
  return {
    phase: 'away', x: 0, y: OWL_TUNING.cruiseHeight, z: 0, heading: 0, pitch: 0, flap: 0,
    timer: 0, cooldown: OWL_TUNING.firstHuntCooldown, orbit: 0, preyId: null, helium: 1,
  }
}

function headingToward(fromX: number, fromZ: number, toX: number, toZ: number, fallback: number): number {
  const dx = toX - fromX
  const dz = toZ - fromZ
  if (dx * dx + dz * dz < 1e-6) return fallback
  // three.js yaw for a +X-forward model: rotating +X by `heading` about +Y.
  return Math.atan2(-dz, dx)
}

/** Move `flight` toward a point at no more than `speed`, turning to face it. Returns the remaining distance. */
function steer(flight: OwlFlight, tx: number, ty: number, tz: number, speed: number, dt: number): number {
  const dx = tx - flight.x
  const dy = ty - flight.y
  const dz = tz - flight.z
  const distance = Math.hypot(dx, dy, dz)
  if (distance < 1e-6) return 0
  const step = Math.min(distance, speed * dt)
  const flat = Math.hypot(dx, dz)
  // Face the way the owl is actually moving this step, not the way the target
  // lies; chasing a moving target would otherwise let it fly sideways.
  const movedX = (dx / distance) * step
  const movedZ = (dz / distance) * step
  if (Math.hypot(movedX, movedZ) > 1e-4 && flat > 0.05) {
    const wanted = Math.atan2(-movedZ, movedX)
    let turn = wanted - flight.heading
    while (turn > Math.PI) turn -= Math.PI * 2
    while (turn < -Math.PI) turn += Math.PI * 2
    flight.heading += turn * (1 - Math.exp(-9 * dt))
  }
  flight.pitch += (Math.atan2(-dy, Math.max(flat, 0.2)) - flight.pitch) * (1 - Math.exp(-6 * dt))
  flight.x += (dx / distance) * step
  flight.y += (dy / distance) * step
  flight.z += (dz / distance) * step
  return distance - step
}

function enter(flight: OwlFlight, phase: OwlPhase): void {
  flight.phase = phase
  flight.timer = 0
}

function nearestPrey(flight: OwlFlight, prey: readonly PreyView[]): PreyView | null {
  let best: PreyView | null = null
  let bestDistance = Infinity
  for (const candidate of prey) {
    if (!candidate.targetable) continue
    const distance = Math.hypot(candidate.x - flight.x, candidate.z - flight.z)
    if (distance < bestDistance) { best = candidate; bestDistance = distance }
  }
  return best
}

/** Whether a flock is big enough to take from. Counts every chicken, targetable or not. */
export function canHunt(preyCount: number): boolean {
  return preyCount > PREY_FLOOR
}

function patrolPoint(flight: OwlFlight, world: OwlWorld): Point3 {
  return {
    x: world.center.x + Math.cos(flight.orbit) * world.radius.x,
    y: OWL_TUNING.cruiseHeight + Math.sin(flight.orbit * 2) * 0.6,
    z: world.center.z + Math.sin(flight.orbit) * world.radius.z,
  }
}

/**
 * Advance the owl by `dt` seconds and return anything the scene must act on.
 * The flight object is mutated in place; the world is read-only.
 */
export function stepOwl(flight: OwlFlight, world: OwlWorld, deltaSeconds: number): readonly OwlEvent[] {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.25)) : 0
  const events: OwlEvent[] = []
  if (dt === 0) return events
  flight.timer += dt
  flight.cooldown = Math.max(0, flight.cooldown - dt)

  if (!world.present) {
    flight.phase = 'away'
    flight.preyId = null
    return events
  }

  const T = OWL_TUNING
  const home = world.roost
  const stranded = Boolean(world.stranded) && !home
  const before = flight.helium
  flight.helium = stepHelium(flight.helium, stranded, dt)
  if (before > 0 && flight.helium === 0) {
    events.push({ kind: 'deflated' })
    flight.phase = 'away'
    flight.preyId = null
    return events
  }
  // With no perch to go home to, the owl simply stays on the wing, day or night.
  const aloft = world.night || stranded

  switch (flight.phase) {
    case 'away': {
      flight.flap = 0
      if (!aloft) {
        // A resident with an oak is simply there in the morning, asleep.
        if (home) {
          flight.x = home.x; flight.y = home.y; flight.z = home.z
          flight.pitch = 0
          enter(flight, 'roost')
        }
        break
      }
      // Dusk: arrive from beyond the patrol loop, already at cruise height.
      const angle = flight.orbit
      flight.x = world.center.x + Math.cos(angle) * (world.radius.x + T.entryMargin)
      flight.z = world.center.z + Math.sin(angle) * (world.radius.z + T.entryMargin)
      flight.y = T.cruiseHeight
      flight.heading = headingToward(flight.x, flight.z, world.center.x, world.center.z, 0)
      flight.cooldown = T.firstHuntCooldown
      enter(flight, 'patrol')
      break
    }
    case 'roost': {
      flight.flap = 0
      flight.pitch = 0
      if (!home) { enter(flight, stranded ? 'takeoff' : 'away'); break }
      flight.x = home.x; flight.y = home.y; flight.z = home.z
      if (world.night) {
        flight.cooldown = Math.min(flight.cooldown, T.firstHuntCooldown)
        enter(flight, 'takeoff')
      }
      break
    }
    case 'takeoff': {
      flight.flap = 1
      const t = Math.min(1, flight.timer / T.takeoffSeconds)
      const target = patrolPoint(flight, world)
      steer(flight, target.x, flight.y + (T.cruiseHeight - flight.y) * t * 0.35 + 0.05, target.z, T.climbSpeed, dt)
      if (flight.timer >= T.takeoffSeconds) enter(flight, 'patrol')
      break
    }
    case 'patrol': {
      flight.flap = 0.35
      flight.orbit += T.loopSpeed * dt
      const target = patrolPoint(flight, world)
      steer(flight, target.x, target.y, target.z, T.patrolSpeed, dt)
      if (!aloft) { enter(flight, 'return'); break }
      if (world.night && world.huntAllowed && flight.cooldown <= 0 && canHunt(world.prey.length)) {
        const choice = nearestPrey(flight, world.prey)
        if (choice) {
          flight.preyId = choice.id
          enter(flight, 'stalk')
          events.push({ kind: 'stalk', preyId: choice.id })
        }
      }
      break
    }
    case 'stalk': {
      flight.flap = 0.5
      const prey = world.prey.find((entry) => entry.id === flight.preyId)
      if (!prey || !prey.targetable || !world.night) {
        if (flight.preyId) events.push({ kind: 'abandon', preyId: flight.preyId })
        flight.preyId = null
        flight.cooldown = T.huntCooldown * 0.4
        enter(flight, 'patrol')
        break
      }
      // Circle the chicken, sinking as the timer runs out.
      const progress = Math.min(1, flight.timer / T.stalkSeconds)
      const angle = flight.timer * 1.9
      const height = T.cruiseHeight + (T.stalkHeight - T.cruiseHeight) * progress
      steer(flight, prey.x + Math.cos(angle) * T.stalkRadius, height, prey.z + Math.sin(angle) * T.stalkRadius, T.stalkSpeed + 3, dt)
      if (flight.timer >= T.stalkSeconds) enter(flight, 'dive')
      break
    }
    case 'dive': {
      flight.flap = 0
      const prey = world.prey.find((entry) => entry.id === flight.preyId)
      if (!prey || !prey.targetable) {
        if (flight.preyId) events.push({ kind: 'abandon', preyId: flight.preyId })
        flight.preyId = null
        flight.cooldown = T.huntCooldown * 0.4
        enter(flight, 'recover')
        break
      }
      const remaining = steer(flight, prey.x, T.strikeHeight, prey.z, T.diveSpeed, dt)
      const flat = Math.hypot(prey.x - flight.x, prey.z - flight.z)
      if (remaining <= T.catchDistance || flat <= T.catchDistance && flight.y <= T.strikeHeight + 0.35) {
        events.push({ kind: 'catch', preyId: prey.id, x: prey.x, z: prey.z })
        flight.preyId = null
        flight.cooldown = T.huntCooldown
        enter(flight, 'strike')
      }
      break
    }
    case 'strike': {
      flight.flap = 1
      flight.pitch += (-0.5 - flight.pitch) * (1 - Math.exp(-8 * dt))
      if (flight.timer >= T.strikeSeconds) enter(flight, 'recover')
      break
    }
    case 'recover': {
      flight.flap = 0.9
      const target = patrolPoint(flight, world)
      steer(flight, target.x, target.y, target.z, T.climbSpeed + 1.5, dt)
      if (flight.timer >= T.recoverSeconds) enter(flight, 'patrol')
      break
    }
    case 'return': {
      flight.flap = 0.45
      if (aloft) { enter(flight, 'patrol'); break }
      if (!home) {
        // Nowhere to roost: slip away over the treeline and out of the world.
        const exitX = world.center.x + Math.cos(flight.orbit) * (world.radius.x + T.entryMargin * 1.5)
        const exitZ = world.center.z + Math.sin(flight.orbit) * (world.radius.z + T.entryMargin * 1.5)
        steer(flight, exitX, T.cruiseHeight, exitZ, T.patrolSpeed * 1.4, dt)
        if (Math.hypot(exitX - flight.x, exitZ - flight.z) < 1.5 || flight.timer > 12) enter(flight, 'away')
        break
      }
      const remaining = steer(flight, home.x, home.y + 1.6, home.z, T.patrolSpeed * 1.2, dt)
      if (remaining < 0.8) enter(flight, 'landing')
      break
    }
    case 'landing': {
      flight.flap = 0.8
      if (!home) { enter(flight, stranded ? 'takeoff' : 'away'); break }
      steer(flight, home.x, home.y, home.z, 2.2, dt)
      if (flight.timer >= T.landingSeconds) {
        flight.x = home.x; flight.y = home.y; flight.z = home.z
        flight.pitch = 0
        enter(flight, 'roost')
      }
      break
    }
  }
  return events
}

/** True when the owl should be drawn at all. */
export function owlVisible(flight: OwlFlight): boolean {
  return flight.phase !== 'away'
}
