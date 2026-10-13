/**
 * The pure rules of the skim game (the water plant's hold-to-rise chore): the
 * dragonfly's climb and sink, the scroll and hazard ramp, the dewdrop patterns
 * and the hit tests. No Three.js and no DOM: the scene in
 * `src/scene/care-games/skim-game.ts` plays these, and
 * `tests/care-game-skim.test.mjs` covers them without a browser.
 *
 * Units are world units on the stage (the scene's own scale). The dragonfly
 * stays at a fixed screen x; the world scrolls left past it.
 */

export const SKIM_TUNING = {
  /** The dragonfly's fixed x in the world (the world scrolls past it). */
  dragonX: -0.55,
  /** Lowest and highest it can fly: the floor is just over the water. */
  floorY: 0.16,
  ceilingY: 1.3,
  /** Climb acceleration while held, and sink acceleration once released. */
  thrust: 3.4,
  fall: 2.7,
  /** Top climb speed and top sink speed. */
  maxRise: 1.5,
  maxSink: 1.35,
  /** Hit radii: the dragonfly, a dewdrop (a pickup reach), a fluff clump. */
  dragonRadius: 0.11,
  dewRadius: 0.06,
  pickupReach: 0.26,
  fluffRadius: 0.15,
  fishRadius: 0.1,
  /** A cattail is a thin reed: half its width, and its top when fully risen. */
  cattailHalfWidth: 0.05,
  cattailTop: 0.6,
  /** Fish leap this high, and stay in the air this long. */
  fishPeak: 0.78,
  fishLeapSeconds: 1.25,
  /** New things enter at this x, just off the right of the frame. */
  spawnX: 2.2,
  /** Scroll speed: starts gentle and speeds up over `rampSeconds`. */
  scrollStart: 0.6,
  scrollEnd: 1.0,
  rampSeconds: 20,
  /** No hazards before this many seconds of play. */
  hazardGrace: 3,
  /** Seconds between hazards: from `hazardGapStart` down to `hazardGapEnd`. */
  hazardGapStart: 3.2,
  hazardGapEnd: 1.9,
  /** After a bonk the dragonfly blinks, unhurt, for this long. */
  bonkSeconds: 1.0,
} as const

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

/** Scroll speed (world units per second) after `playSeconds` of play. */
export function scrollSpeed(playSeconds: number): number {
  const ramp = clamp01(playSeconds / SKIM_TUNING.rampSeconds)
  return lerp(SKIM_TUNING.scrollStart, SKIM_TUNING.scrollEnd, ramp)
}

/** Seconds from one hazard to the next, after `playSeconds` of play. */
export function hazardGap(playSeconds: number): number {
  const ramp = clamp01((playSeconds - SKIM_TUNING.hazardGrace) / (SKIM_TUNING.rampSeconds - SKIM_TUNING.hazardGrace))
  return lerp(SKIM_TUNING.hazardGapStart, SKIM_TUNING.hazardGapEnd, ramp)
}

export interface DragonState {
  readonly y: number
  readonly vy: number
}

/**
 * One physics step of the dragonfly's height. Holding accelerates it up,
 * releasing lets it sink; both ramp, so it never snaps. The water and the sky
 * are soft walls: it bounces off them rather than being hurt.
 */
export function stepDragon(state: DragonState, held: boolean, deltaSeconds: number): DragonState {
  if (!(deltaSeconds > 0)) return state
  const acceleration = held ? SKIM_TUNING.thrust : -SKIM_TUNING.fall
  let vy = Math.min(SKIM_TUNING.maxRise, Math.max(-SKIM_TUNING.maxSink, state.vy + acceleration * deltaSeconds))
  let y = state.y + vy * deltaSeconds
  if (y < SKIM_TUNING.floorY) {
    y = SKIM_TUNING.floorY
    vy = Math.max(vy, 0.3)
  }
  if (y > SKIM_TUNING.ceilingY) {
    y = SKIM_TUNING.ceilingY
    vy = Math.min(vy, 0)
  }
  return { y, vy }
}

/** Tilt (radians, nose up is positive) from the vertical speed: climbing tips up, sinking tips down. */
export function dragonTilt(vy: number): number {
  return Math.min(0.5, Math.max(-0.45, vy * 0.3))
}

/** Wing beats per second: faster while climbing. */
export function wingBeatRate(vy: number): number {
  return 9 + 5 * clamp01(vy / SKIM_TUNING.maxRise)
}

/** One dewdrop, relative to the x where its pattern enters, and its height. */
export interface DewDrop {
  readonly dx: number
  readonly y: number
}

export type DewShape = 'line' | 'wave' | 'arc'

export interface DewPattern {
  readonly shape: DewShape
  /** Seconds of play when the pattern enters the frame. */
  readonly at: number
  readonly drops: readonly DewDrop[]
}

/** When each pattern enters, in seconds of play. Four patterns, 25 drops: 18 win the round. */
export const DEW_PATTERN_TIMES = [1.6, 5.6, 10.2, 14.6] as const

/**
 * The four dew patterns, in order. `random` picks the height each sits at, so
 * no two rounds look the same; the shapes and spacing never change, so each
 * pattern always reads at a glance.
 */
export function dewPatterns(random: () => number): DewPattern[] {
  const shapes: readonly DewShape[] = ['line', 'wave', 'arc', 'wave']
  return DEW_PATTERN_TIMES.map((at, index) => {
    const centre = 0.6 + random() * 0.32
    return { shape: shapes[index], at, drops: dewShape(shapes[index], centre) }
  })
}

/** The drops of one pattern shape, centred on `centre` in height. */
export function dewShape(shape: DewShape, centre: number): DewDrop[] {
  if (shape === 'line') {
    return Array.from({ length: 5 }, (_, i) => ({ dx: i * 0.2, y: centre }))
  }
  if (shape === 'wave') {
    // One full sine period across seven drops.
    return Array.from({ length: 7 }, (_, i) => ({ dx: i * 0.17, y: centre + 0.22 * Math.sin((i / 6) * Math.PI * 2) }))
  }
  // An arc: six drops rising to a peak in the middle and falling back.
  return Array.from({ length: 6 }, (_, i) => {
    const u = (i - 2.5) / 2.5
    return { dx: i * 0.18, y: centre + 0.28 * (1 - u * u) }
  })
}

export type HazardKind = 'cattail' | 'fish' | 'fluff'

/** Which hazard comes next, from a uniform random roll in [0, 1). */
export function hazardKind(roll: number): HazardKind {
  if (roll < 0.34) return 'cattail'
  if (roll < 0.67) return 'fish'
  return 'fluff'
}

/** Height of a leaping fish `t` seconds into its leap (t from 0 to 1 over the leap). */
export function fishLift(progress: number, peak: number = SKIM_TUNING.fishPeak): number {
  const t = clamp01(progress)
  return 4 * peak * t * (1 - t)
}

/** How far a cattail has risen out of the water: 0 (hidden) to 1 (fully up). */
export function cattailRise(secondsSinceRise: number, riseSeconds = 0.3): number {
  return clamp01(secondsSinceRise / riseSeconds)
}

/** The height a cattail stands at, given how far it has risen. */
export function cattailHeight(rise: number): number {
  return SKIM_TUNING.cattailTop * clamp01(rise)
}

/** Circle against circle: do the two overlap? */
export function touchesCircle(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  return Math.hypot(ax - bx, ay - by) < ar + br
}

/** A circle against a cattail: a thin reed standing on the water, `height` tall at `x`. */
export function touchesCattail(x: number, y: number, radius: number, reedX: number, height: number): boolean {
  if (height <= 0) return false
  return Math.abs(x - reedX) < SKIM_TUNING.cattailHalfWidth + radius && y - radius < height
}
