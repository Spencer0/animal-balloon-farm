/**
 * The clock and rules of the rope minigame (water plant, prune chore): the lily
 * runner whips round the pad like a skipping rope, and the frog hops over it
 * each time it passes under the frog's spot.
 *
 * Pure: no Three.js and no DOM, so the timing is tested in
 * `tests/care-game-rope.test.mjs`. The scene reads crossings from `step` and
 * decides hits and harms; this module only knows angles, seconds and heights.
 *
 * Angles are radians measured in the pad's plane from +X toward +Z (the camera
 * side), the same convention Three.js uses for a Y-rotation.
 */

/** Where the frog sits on the pad, as an angle and a radius from the stem. */
export const ROPE_FROG_ANGLE = 0.35
export const ROPE_FROG_RADIUS = 0.3
/** The runner's length: the full vine, and the shortest it gets (always past the frog). */
export const ROPE_MAX_LENGTH = 0.66
export const ROPE_MIN_LENGTH = 0.44
/** The sweep starts this far behind the frog, so the first pass is a few seconds off. */
export const ROPE_START_AHEAD = 2.6
/** Angular speed (rad/s) on the first pass, and how much faster each pass after it. */
export const ROPE_SPEED_START = 2.8
export const ROPE_SPEED_RAMP = 0.12
/** A shorter runner sweeps faster: speed scales by (max length / length) to this power. */
export const ROPE_SHORTNESS_POWER = 0.5
/** A fake slow-down: the pass after this index crawls until it is close, then whips. */
export const ROPE_FAKE_PASS = 6
export const ROPE_FAKE_SLOW = 0.45
export const ROPE_FAKE_WHIP = 2.2
export const ROPE_FAKE_RADIANS = 1.1
/** A pass at these indexes flicks back out past the frog and returns: two passes close together. */
export const ROPE_FLICK_PASSES: readonly number[] = [3, 7]
export const ROPE_FLICK_RADIANS = 0.6
/** The telegraph: the shadow sector shows this far ahead of the runner. */
export const ROPE_TELEGRAPH_RADIANS = 2.4
/** The hop: a fixed arc, airborne for this long, peaking at this height above the pad. */
export const ROPE_HOP_SECONDS = 0.7
export const ROPE_HOP_HEIGHT = 0.42
/** After a landing the frog squats this long before the next hop, so hops cannot be chained. */
export const ROPE_LAND_SECONDS = 0.45
/** A hop clears a pass when the frog is at least this high (above the pad) as the runner crosses. */
export const ROPE_CLEAR_HEIGHT = 0.14
/** How long a knocked-out frog spends in the pond before it climbs back. */
export const ROPE_KNOCK_SECONDS = 1.1
/** Largest substep of the clock, so a slow frame still gives an exact pass time. */
export const ROPE_SUBSTEP = 1 / 60

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2
  let wrapped = ((angle + Math.PI) % turn + turn) % turn - Math.PI
  if (wrapped <= -Math.PI) wrapped += turn
  return wrapped
}

/** The runner's length for the hits still to make: full at the start, shortest at the last pass. */
export function ropeLength(remaining: number, goal: number): number {
  const share = goal > 0 ? Math.min(1, Math.max(0, remaining / goal)) : 0
  return ROPE_MIN_LENGTH + (ROPE_MAX_LENGTH - ROPE_MIN_LENGTH) * share
}

/** How much faster a runner of this length sweeps than the full one (1 at full length). */
export function ropeShortness(length: number): number {
  return (ROPE_MAX_LENGTH / Math.max(1e-3, length)) ** ROPE_SHORTNESS_POWER
}

/** The base angular speed for the pass that is `pass` passes into the round. */
export function ropeBaseSpeed(pass: number): number {
  return ROPE_SPEED_START + ROPE_SPEED_RAMP * pass
}

/** The frog's height above the pad `elapsed` seconds into a hop (0 on the pad). */
export function hopHeight(elapsed: number, peak = ROPE_HOP_HEIGHT): number {
  if (elapsed <= 0 || elapsed >= ROPE_HOP_SECONDS) return 0
  const t = elapsed / ROPE_HOP_SECONDS
  return 4 * peak * t * (1 - t)
}

export interface RopeFrog {
  /** Take off from the pad at clock time `now`. False while airborne, landing, or knocked out. */
  hop(now: number, peak?: number): boolean
  /** The frog's height above the pad at clock time `t`. */
  heightAt(t: number): number
  /** Knock the frog into the pond at `t`. */
  knock(t: number): void
  /** Whether the frog is on the pad (not knocked into the pond) at `t`. */
  onPad(t: number): boolean
  /** Clock time the last hop left the pad (-Infinity before the first). */
  readonly hopStart: number
  readonly peak: number
  /** Clock time the last knock-out began (-Infinity before the first). */
  readonly knockedAt: number
}

export function createRopeFrog(): RopeFrog {
  let hopStart = Number.NEGATIVE_INFINITY
  let peak = ROPE_HOP_HEIGHT
  let knockedAt = Number.NEGATIVE_INFINITY
  const knockedUntil = (): number => knockedAt + ROPE_KNOCK_SECONDS
  return {
    hop(now, height = ROPE_HOP_HEIGHT): boolean {
      if (!this.onPad(now)) return false
      if (now < hopStart + ROPE_HOP_SECONDS + ROPE_LAND_SECONDS) return false
      hopStart = now
      peak = height
      return true
    },
    heightAt(t): number {
      return hopHeight(t - hopStart, peak)
    },
    knock(t): void {
      if (this.onPad(t)) knockedAt = t
    },
    onPad(t): boolean {
      return !(t >= knockedAt && t < knockedUntil())
    },
    get hopStart(): number {
      return hopStart
    },
    get peak(): number {
      return peak
    },
    get knockedAt(): number {
      return knockedAt
    },
  }
}

export interface RopeCrossing {
  /** Which pass this is, counting from 0 for the first pass of the round. */
  readonly pass: number
  /** Clock time the runner's leading edge reached the frog's spot. */
  readonly time: number
  /** True for the quick return of a double pass (the flick back out and across). */
  readonly returning: boolean
}

export interface RopeSweep {
  /** The runner's angle now, wrapped. */
  readonly angle: number
  /** +1 sweeping counter-clockwise (toward +Z past the frog), -1 after a reverse. */
  readonly direction: 1 | -1
  /** Radians from the runner's leading edge to the frog, along its direction; positive while it approaches. */
  readonly ahead: number
  /** Current angular speed, rad/s (a magnitude). */
  readonly speed: number
  /** Passes so far (crossings of the frog's spot). */
  readonly passes: number
  /** Seconds of sweep so far. */
  readonly clock: number
  /** Whether the runner is in the middle of a double-pass flick. */
  readonly flicking: boolean
  /** Advance by `dt` seconds for a round with `remaining` hits to go out of `goal`; returns the passes that happened. */
  step(dt: number, remaining: number, goal: number): RopeCrossing[]
  /** Freeze the runner where it is (the round is over). */
  stop(): void
}

export function createRopeSweep(): RopeSweep {
  let angle = ROPE_FROG_ANGLE - ROPE_START_AHEAD
  let direction: 1 | -1 = 1
  let ahead = ROPE_START_AHEAD
  let speed = 0
  let passes = 0
  let clock = 0
  let flicking = false
  let overshoot = 0
  let stopped = false
  let returningNext = false

  function speedNow(remaining: number, goal: number): number {
    const length = ropeLength(remaining, goal)
    let rate = ropeBaseSpeed(passes) * ropeShortness(length)
    if (flicking) return rate
    if (passes === ROPE_FAKE_PASS) rate *= ahead > ROPE_FAKE_RADIANS ? ROPE_FAKE_SLOW : ROPE_FAKE_WHIP
    return rate
  }

  return {
    get angle() { return wrapAngle(angle) },
    get direction() { return direction },
    get ahead() { return ahead },
    get speed() { return speed },
    get passes() { return passes },
    get clock() { return clock },
    get flicking() { return flicking },
    step(dt, remaining, goal): RopeCrossing[] {
      const crossings: RopeCrossing[] = []
      if (stopped || !(dt > 0)) return crossings
      let left = dt
      while (left > 1e-9) {
        const h = Math.min(ROPE_SUBSTEP, left)
        left -= h
        speed = speedNow(remaining, goal)
        const move = speed * h
        const before = ahead
        ahead -= move
        angle += direction * move
        clock += h
        if (flicking) {
          // Out past the frog, then back: reverse once the flick has gone far enough.
          overshoot += move
          if (overshoot >= ROPE_FLICK_RADIANS) {
            flicking = false
            direction = direction === 1 ? -1 : 1
            ahead = ROPE_FLICK_RADIANS
          }
        }
        if (before > 0 && ahead <= 0) {
          const fraction = before / (before - ahead)
          const index = passes
          passes += 1
          crossings.push({ pass: index, time: clock - h + h * fraction, returning: returningNext })
          returningNext = false
          if (ROPE_FLICK_PASSES.includes(index)) {
            // Keep going past the frog; the reverse below brings the runner back across it.
            flicking = true
            overshoot = -ahead
            returningNext = true
          } else {
            // Round the full circle to the frog again.
            ahead += Math.PI * 2
          }
        }
      }
      return crossings
    },
    stop(): void {
      stopped = true
      speed = 0
    },
  }
}
