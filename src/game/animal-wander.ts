/**
 * Wandering as a simulation system: pick a spot, walk to it, stand about, pick
 * another. It steers an `AnimalSimRecord` on the fixed tick and decides nothing
 * about drawing; the view shows `record.motion` as a clip and `record.heading`
 * as a facing.
 *
 * The decisions, ranges and random draws match what the per-frame animal did
 * before the sim/view split, so a seeded animal wanders as it always did.
 */
import type { GardenBounds } from './farm-expansion'
import { clampToFarm } from './farm-footprint'
import { clearOfFarmBounds } from './animal-travel'
import { headingOf, type AnimalSimRecord } from './animal-sim'

/** A prey animal in a panic runs this many times its walking speed. */
export const ALARM_SPEED_SCALE = 2.2
/** Closer than this to its target counts as arrived. */
export const WANDER_ARRIVE_DISTANCE = 0.48
/** How long it stands between walks, before any long carnival rest. */
export const WANDER_PAUSE_SECONDS = { min: 0.45, max: 1.25 } as const
/** Past this many units from its pack leader, a visitor heads back to it. */
export const PACK_STRAY_DISTANCE = 6.5
/** Plot boundary inset for a fenced animal's targets and position. */
const PLOT_INSET = 1.2

/** What the wander needs to know about the world this tick. Supplied by the caller. */
export interface WanderContext {
  /** Half-extents it may roam. */
  limitX: number
  limitZ: number
  /** Out at the carnival (loose) rather than fenced into the plot. */
  carnival: boolean
  alarmed: boolean
  /** Walking speed in units per second, before the alarm multiplier. */
  speed: number
  /** The pack leader to keep with, or null. Callers pass null when it does not apply. */
  anchor: { readonly x: number; readonly z: number } | null
  gardenBounds: GardenBounds
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

/** Pick the next spot to walk to and how long to commit to it. */
export function chooseWanderTarget(record: AnimalSimRecord, ctx: WanderContext, rng: () => number): void {
  const { carnival, alarmed, anchor } = ctx
  record.longWalk = false
  let nextX: number
  let nextZ: number
  if (anchor && Math.hypot(anchor.x - record.x, anchor.z - record.z) > PACK_STRAY_DISTANCE) {
    // Keep with the pack: head for a spot beside the leader.
    const around = rng() * Math.PI * 2
    const gap = 1.6 + rng() * 3
    nextX = clamp(anchor.x + Math.cos(around) * gap, -ctx.limitX, ctx.limitX)
    nextZ = clamp(anchor.z + Math.sin(around) * gap * 0.8, -ctx.limitZ, ctx.limitZ)
  } else {
    const angle = rng() * Math.PI * 2
    let radius = (alarmed ? 4.2 : 2.4) + rng() * 5.8
    let squash = 0.62
    if (carnival && !alarmed && !anchor) {
      // Mostly a nibble here and there, now and then a stroll, and once in a
      // while a long trek out across the meadow.
      const roll = rng()
      if (roll > 0.86) {
        radius = 18 + rng() * 20
        squash = 0.85
        record.longWalk = true
      } else if (roll > 0.58) {
        radius = 8 + rng() * 8
      }
    }
    nextX = clamp(record.x + Math.cos(angle) * radius, -ctx.limitX, ctx.limitX)
    nextZ = clamp(record.z + Math.sin(angle) * radius * squash, -ctx.limitZ, ctx.limitZ)
  }
  if (carnival) {
    // Walk targets stay outside the fence too, so a carnival animal never
    // presses against the wall trying to reach a spot it cannot enter.
    const cleared = clearOfFarmBounds({ x: nextX, z: nextZ }, ctx.gardenBounds)
    nextX = cleared.x
    nextZ = cleared.z
  } else {
    const clamped = clampToFarm(nextX, nextZ, ctx.gardenBounds, PLOT_INSET)
    nextX = clamped.x
    nextZ = clamped.z
  }
  record.targetX = nextX
  record.targetZ = nextZ
  record.nextDecision = alarmed ? 0.7 + rng() * 0.9 : 2 + rng() * 2.4
  if (record.longWalk) {
    // Do not change its mind half way across the meadow.
    const walk = Math.hypot(nextX - record.x, nextZ - record.z)
    record.nextDecision = Math.max(record.nextDecision, (walk / Math.max(0.1, ctx.speed)) * 1.25 + 2)
  }
}

/** Keep the record inside its leash, and out of (or inside) the fence as its side requires. */
function keepInside(record: AnimalSimRecord, ctx: WanderContext): void {
  record.x = clamp(record.x, -ctx.limitX, ctx.limitX)
  record.z = clamp(record.z, -ctx.limitZ, ctx.limitZ)
  if (!ctx.carnival) {
    const clamped = clampToFarm(record.x, record.z, ctx.gardenBounds, PLOT_INSET)
    record.x = clamped.x
    record.z = clamped.z
  } else {
    // The farm can grow over a carnival animal's footing, and the fence is not
    // a door: step back onto the meadow rather than stand inside the walls.
    const cleared = clearOfFarmBounds({ x: record.x, z: record.z }, ctx.gardenBounds)
    record.x = cleared.x
    record.z = cleared.z
  }
}

/**
 * One tick of wandering. The caller has already opened the step with
 * `beginSimStep` and checked that no other behaviour owns the animal.
 */
export function stepWander(record: AnimalSimRecord, ctx: WanderContext, dt: number, rng: () => number): void {
  if (record.paused > 0 && Number.isFinite(record.paused)) {
    record.paused = Math.max(0, record.paused - dt)
    if (record.paused === 0) record.nextDecision = 0
  } else {
    record.nextDecision -= dt
  }
  keepInside(record, ctx)
  if (record.paused > 0) return
  const dx = record.targetX - record.x
  const dz = record.targetZ - record.z
  const distance = Math.hypot(dx, dz)
  if (distance < WANDER_ARRIVE_DISTANCE || record.nextDecision <= 0) {
    if (record.motion !== 'idle' && !ctx.alarmed) {
      record.motion = 'idle'
      record.paused = WANDER_PAUSE_SECONDS.min + rng() * (WANDER_PAUSE_SECONDS.max - WANDER_PAUSE_SECONDS.min)
      // Out at the carnival there is time to stand about: now and then a long rest.
      if (ctx.carnival && !ctx.alarmed && rng() < 0.22) record.paused += 4 + rng() * 9
      record.nextDecision = 0
    } else {
      chooseWanderTarget(record, ctx, rng)
    }
    return
  }
  const speed = ctx.speed * (ctx.alarmed ? ALARM_SPEED_SCALE : 1)
  record.heading = headingOf(dx, dz)
  const travel = Math.min(speed * dt, distance)
  record.x += (dx / distance) * travel
  record.z += (dz / distance) * travel
  record.motion = 'walk'
}
