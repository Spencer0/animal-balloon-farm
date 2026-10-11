/**
 * A fixed-rate simulation clock. Frame time goes in; the number of whole
 * simulation steps to run comes out, and the leftover carries to the next frame.
 *
 * Logic that does not need per-frame smoothness (condition ladders, sleep
 * checks, growth) runs on this clock, while motion, animation and camera stay on
 * the display rate. A long stall runs at most `maxStepsPerFrame` steps and drops
 * the rest of the backlog, so a slow frame cannot snowball into more slow frames.
 */

/** The simulation's logic rate. 15 Hz is well above what any ladder or timer needs. */
export const SIM_HZ = 15
/** At 15 Hz a 4-step cap covers ~0.27 s of stall, the same window the frame clamp allows. */
export const SIM_MAX_STEPS_PER_FRAME = 4

export interface SimClock {
  /** Length of one simulation step, in seconds. */
  readonly stepSeconds: number
  /** Add one frame's time and return how many steps to run this frame (0 to maxStepsPerFrame). */
  advance(frameSeconds: number): number
  /** Forget any leftover time, e.g. when the simulation was paused. */
  reset(): void
}

export function createSimClock(options: { hz?: number; maxStepsPerFrame?: number } = {}): SimClock {
  const hz = options.hz ?? SIM_HZ
  const maxSteps = options.maxStepsPerFrame ?? SIM_MAX_STEPS_PER_FRAME
  if (!(hz > 0) || !(maxSteps >= 1)) throw new Error('sim clock needs a positive rate and at least one step per frame')
  const stepSeconds = 1 / hz
  let accumulator = 0
  return {
    stepSeconds,
    advance(frameSeconds: number): number {
      accumulator += Math.max(0, frameSeconds)
      let steps = 0
      while (accumulator >= stepSeconds && steps < maxSteps) {
        accumulator -= stepSeconds
        steps += 1
      }
      // Hit the cap: drop the backlog down to one step so the next frame resumes at the rate.
      if (accumulator > stepSeconds) accumulator = stepSeconds
      return steps
    },
    reset(): void {
      accumulator = 0
    },
  }
}
