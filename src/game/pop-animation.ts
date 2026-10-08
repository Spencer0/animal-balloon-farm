/**
 * The pop: what happens to a balloon animal the owl catches.
 *
 * Pure timeline math, in the same mould as `sell-animation.ts`: no Three.js, no
 * DOM, so the sequence is checkable from a node test. The scene effect in
 * `src/scene/pop-burst.ts` reads a frame each tick and moves meshes to match.
 *
 * The sequence, in order:
 *   1. swell    the balloon puffs up and wobbles for a beat (0.18 s)
 *   2. bang     the animal vanishes; a ring and a spray of latex shards fly out
 *   3. scrap    the deflated skin flutters down, settles, and lies there
 *   4. clean-up feathers finish drifting, the scrap shrinks away, nothing is left
 */

export const POP_SWELL_SECONDS = 0.18
export const POP_BURST_SECONDS = 2.0
export const POP_TOTAL_SECONDS = POP_SWELL_SECONDS + POP_BURST_SECONDS

export const POP_SHARD_COUNT = 18
export const POP_FEATHER_COUNT = 7

const SHARD_LIFE = 1.15
const FEATHER_LIFE = 1.9
const GRAVITY = 9.2

export interface PopFrame {
  /** Scale multiplier for the animal during the swell; 1 once it has gone. */
  readonly swell: number
  /** Whether the animal itself is still drawn. */
  readonly animalVisible: boolean
  /** Seconds since the bang, or null while still swelling. */
  readonly burstAge: number | null
  /** True once there is nothing left to draw and the effect may be disposed. */
  readonly finished: boolean
}

function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - (1 - clamped) ** 3
}

export function popFrame(elapsed: number): PopFrame {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
  if (t < POP_SWELL_SECONDS) {
    const wobble = Math.sin(t * 95) * 0.035 * (t / POP_SWELL_SECONDS)
    return { swell: 1 + 0.38 * easeOutCubic(t / POP_SWELL_SECONDS) + wobble, animalVisible: true, burstAge: null, finished: false }
  }
  const age = t - POP_SWELL_SECONDS
  return { swell: 1, animalVisible: false, burstAge: age, finished: age >= POP_BURST_SECONDS }
}

/** A cheap deterministic hash in [0, 1), so every pop looks the same in a test and different shard to shard. */
function unit(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// ------------------------------------------------------------------ ring ----

export interface RingState {
  readonly scale: number
  readonly alpha: number
}

export function ringState(age: number): RingState {
  const t = Math.min(1, Math.max(0, age / 0.4))
  return { scale: 0.25 + 2.3 * easeOutCubic(t), alpha: 0.85 * (1 - t) }
}

// ---------------------------------------------------------------- shards ----

export interface ShardState {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly spinX: number
  readonly spinZ: number
  readonly scale: number
  readonly alpha: number
}

/** Ballistic latex shards, thrown out from the middle of the balloon. */
export function shardState(index: number, age: number, burstHeight = 0.9): ShardState {
  const a = Math.max(0, age)
  const angle = (index / POP_SHARD_COUNT) * Math.PI * 2 + unit(index) * 0.5
  const speed = 2.6 + unit(index + 40) * 2.8
  const lift = 2.2 + unit(index + 80) * 2.4
  const x = Math.cos(angle) * speed * a
  const z = Math.sin(angle) * speed * a
  const y = Math.max(0.02, burstHeight + lift * a - 0.5 * GRAVITY * a * a)
  const fade = Math.min(1, Math.max(0, (SHARD_LIFE - a) / 0.45))
  return {
    x, y, z,
    spinX: a * (6 + unit(index + 120) * 10),
    spinZ: a * (5 + unit(index + 160) * 9),
    scale: (0.7 + unit(index + 200) * 0.7) * (a < SHARD_LIFE ? 1 : 0),
    alpha: fade,
  }
}

// -------------------------------------------------------------- feathers ----

export interface FeatherState {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly roll: number
  readonly alpha: number
}

/** Soft puffs that burst out and then drift down slowly, swaying as they go. */
export function featherState(index: number, age: number, burstHeight = 0.9): FeatherState {
  const a = Math.max(0, age)
  const angle = (index / POP_FEATHER_COUNT) * Math.PI * 2 + unit(index + 7) * 1.1
  const burst = easeOutCubic(a / 0.35) * (0.7 + unit(index + 30) * 0.9)
  const sway = Math.sin(a * 4 + index) * 0.18 * Math.min(1, a / 0.6)
  const y = Math.max(0.03, burstHeight + 0.7 * easeOutCubic(a / 0.3) - Math.max(0, a - 0.3) * (0.45 + unit(index + 60) * 0.3))
  const fade = Math.min(1, Math.max(0, (FEATHER_LIFE - a) / 0.6))
  return {
    x: Math.cos(angle) * burst + sway,
    y,
    z: Math.sin(angle) * burst + sway * 0.6,
    roll: Math.sin(a * 5 + index * 2) * 0.9,
    alpha: fade,
  }
}

// ----------------------------------------------------------------- scrap ----

export interface ScrapState {
  readonly y: number
  readonly sway: number
  readonly spin: number
  /** 0 = still a plump bag, 1 = lying flat. */
  readonly flat: number
  /** 1 while it lies there, shrinking to 0 as the scene is tidied. */
  readonly scale: number
}

/** The deflated skin: it flutters down, settles flat, then shrinks away. */
export function scrapState(age: number, burstHeight = 0.9): ScrapState {
  const a = Math.max(0, age)
  const fall = easeOutCubic(a / 1.0)
  const y = Math.max(0.04, burstHeight * (1 - fall) + 0.04 * fall)
  const sway = Math.sin(a * 6.5) * 0.28 * (1 - Math.min(1, a / 1.0))
  const flat = easeOutCubic(a / 0.7)
  const shrinkStart = POP_BURST_SECONDS - 0.5
  const scale = a < shrinkStart ? 1 : Math.max(0, 1 - (a - shrinkStart) / 0.5)
  return { y, sway, spin: a * 2.2, flat, scale }
}
