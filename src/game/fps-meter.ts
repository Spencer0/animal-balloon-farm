/**
 * Frame-rate meter: feed it every frame's timestamp and it reports an average
 * over short windows, so the number is readable instead of flickering. No
 * Three.js and no DOM.
 */

export interface FpsReading {
  /** Frames per second averaged over the last window. */
  readonly fps: number
  /** The slowest single frame in that window, in milliseconds. A spike here is a stutter. */
  readonly worstFrameMs: number
}

export type FpsTone = 'good' | 'warn' | 'bad'

export const FPS_GOOD_AT = 50
export const FPS_WARN_AT = 30

export function fpsTone(fps: number): FpsTone {
  return fps >= FPS_GOOD_AT ? 'good' : fps >= FPS_WARN_AT ? 'warn' : 'bad'
}

export interface FpsMeter {
  /** Record a frame. Returns a new reading once per window, otherwise null. */
  frame(nowMs: number): FpsReading | null
  /** Forget the window, e.g. after the counter was hidden and the gap would read as one huge frame. */
  reset(): void
}

export function createFpsMeter(windowMs = 500): FpsMeter {
  let windowStart: number | null = null
  let lastFrame = 0
  let frames = 0
  let worst = 0
  return {
    frame(nowMs): FpsReading | null {
      if (windowStart === null) {
        windowStart = nowMs
        lastFrame = nowMs
        return null
      }
      frames += 1
      worst = Math.max(worst, nowMs - lastFrame)
      lastFrame = nowMs
      const elapsed = nowMs - windowStart
      if (elapsed < windowMs) return null
      const reading = { fps: (frames * 1000) / elapsed, worstFrameMs: worst }
      windowStart = nowMs
      frames = 0
      worst = 0
      return reading
    },
    reset(): void {
      windowStart = null
      frames = 0
      worst = 0
    },
  }
}
