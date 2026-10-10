/**
 * The slow death: a balloon animal that has run out of helium.
 *
 * Pure timeline math, in the same mould as `pop-animation.ts` (which is the
 * bang, for being caught): no Three.js, no DOM, so it is checkable from a node
 * test. `src/scene/deflate-effect.ts` reads a frame each tick and moves meshes.
 *
 * No bang. It hisses and sags toward the ground, widens as it flattens, lies
 * there a beat, then shrinks away. It only drives the model's root scale, so
 * it works on any animal with no per-species animation.
 *
 *   1. hiss     air leaks out as it sags (2.2 s)
 *   2. flat     it lies there, trembling (0.5 s)
 *   3. tidy     it shrinks to nothing (0.5 s)
 */

export const DEFLATE_HISS_SECONDS = 2.2
export const DEFLATE_FLAT_SECONDS = 0.5
export const DEFLATE_TIDY_SECONDS = 0.5
export const DEFLATE_TOTAL_SECONDS = DEFLATE_HISS_SECONDS + DEFLATE_FLAT_SECONDS + DEFLATE_TIDY_SECONDS

export const DEFLATE_PUFF_COUNT = 6
const PUFF_LIFE = 1.1
/** How thin it ends up lying on the ground, as a share of its standing height. */
const FLAT_HEIGHT = 0.07

export interface DeflateFrame {
  /** Scale multipliers applied to the animal's own scale. */
  readonly scaleX: number
  readonly scaleY: number
  readonly scaleZ: number
  /** Seconds into the effect, for the puffs of escaping air. */
  readonly age: number
  /** True once nothing is left to draw and the effect may be disposed. */
  readonly finished: boolean
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function easeInOut(t: number): number {
  const clamped = clamp01(t)
  return clamped * clamped * (3 - 2 * clamped)
}

function easeOutCubic(t: number): number {
  return 1 - (1 - clamp01(t)) ** 3
}

/** A cheap deterministic hash in [0, 1), so a puff is the same in a test and different puff to puff. */
function unit(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function deflateFrame(elapsed: number): DeflateFrame {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
  const finished = t >= DEFLATE_TOTAL_SECONDS
  const sag = easeInOut(t / DEFLATE_HISS_SECONDS)
  // Air leaves in gasps: a shudder that grows with the leak and dies as it settles.
  const shudder = Math.sin(t * 17) * 0.03 * Math.sin(clamp01(t / DEFLATE_HISS_SECONDS) * Math.PI)
  const tremble = t > DEFLATE_HISS_SECONDS ? Math.sin(t * 40) * 0.008 : 0
  const tidy = clamp01((t - DEFLATE_HISS_SECONDS - DEFLATE_FLAT_SECONDS) / DEFLATE_TIDY_SECONDS)
  const shrink = finished ? 0 : 1 - easeInOut(tidy)
  const height = 1 - (1 - FLAT_HEIGHT) * sag
  const spread = 1 + 0.2 * sag
  return {
    scaleX: Math.max(0, (spread + shudder) * shrink),
    scaleY: Math.max(0, (height + tremble) * shrink),
    scaleZ: Math.max(0, (spread - shudder * 0.6) * shrink),
    age: t,
    finished,
  }
}

export interface PuffState {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly scale: number
  readonly alpha: number
}

/** Soft puffs of escaping air that rise and thin out, one after another across the hiss. */
export function puffState(index: number, age: number, height = 0.9): PuffState {
  const start = (index / DEFLATE_PUFF_COUNT) * (DEFLATE_HISS_SECONDS - PUFF_LIFE * 0.5)
  const a = age - start
  if (a < 0 || a > PUFF_LIFE) return { x: 0, y: height, z: 0, scale: 0, alpha: 0 }
  const t = a / PUFF_LIFE
  const angle = unit(index + 3) * Math.PI * 2
  const drift = 0.25 + unit(index + 19) * 0.35
  // Starts the size of a thumb and swells as it thins, so it reads as breath, not a bubble.
  return {
    x: Math.cos(angle) * drift * t,
    y: height * (0.55 + 0.45 * (1 - age / DEFLATE_TOTAL_SECONDS)) + 0.55 * t,
    z: Math.sin(angle) * drift * t,
    scale: 0.08 + 0.2 * easeOutCubic(t),
    alpha: 0.55 * (1 - t),
  }
}
