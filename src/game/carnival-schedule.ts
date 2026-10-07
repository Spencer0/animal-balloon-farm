import type { GardenBounds } from './farm-expansion'
import { farmEdgeDistance, farmEdgePoint } from './farm-footprint'

/**
 * The carnival is open one day a week, on Sundays, and packs away the rest of
 * the time.
 *
 * Pure on purpose (no Three.js, no DOM), like the calendar it reads: the scene
 * in `src/scene/fairground.ts` turns `packProgress` into fold and crate
 * animation, and `tests/carnival-schedule.test.mjs` covers the rules.
 *
 * The epoch day (elapsed day 0) is a Sunday, so the game starts with the
 * carnival already set up.
 */

export const CARNIVAL_OPEN_WEEKDAY = 0

export const WEEKDAY_NAMES: readonly string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Real seconds for the whole set to pack away, or to unpack again. */
export const SETUP_SWEEP_SECONDS = 8

/** Fraction of the sweep each prop takes; neighbours overlap so the sweep reads as one motion. */
export const PROP_WINDOW = 0.35

export function weekdayOf(elapsedDays: number): number {
  if (!Number.isFinite(elapsedDays)) return CARNIVAL_OPEN_WEEKDAY
  const day = Math.max(0, Math.floor(elapsedDays))
  return day % WEEKDAY_NAMES.length
}

export function weekdayName(elapsedDays: number): string {
  return WEEKDAY_NAMES[weekdayOf(elapsedDays)]
}

export function isCarnivalOpen(elapsedDays: number): boolean {
  return weekdayOf(elapsedDays) === CARNIVAL_OPEN_WEEKDAY
}

export interface CarnivalSchedule {
  /** 1 = fully set up, 0 = fully packed away. */
  readonly amount: number
  /**
   * Per prop, 0 = set up and 1 = packed. `propCount` entries, in the order the
   * props were given. Props pack in that order and unpack in reverse.
   */
  packProgress(): readonly number[]
  update(deltaSeconds: number, elapsedDays: number): void
}

export function createCarnivalSchedule(propCount: number, initialElapsedDays = 0): CarnivalSchedule {
  if (!Number.isInteger(propCount) || propCount < 0) throw new RangeError('Carnival prop count must be a non-negative integer')
  let amount = isCarnivalOpen(initialElapsedDays) ? 1 : 0
  const starts = Array.from({ length: propCount }, (_, index) => {
    // The last prop in pack order is the first to unpack, so it gets the earliest window.
    const unpackRank = propCount > 1 ? (propCount - 1 - index) / (propCount - 1) : 0
    return (1 - PROP_WINDOW) * unpackRank
  })
  const progress = (index: number): number => {
    const openness = Math.min(1, Math.max(0, (amount - starts[index]) / PROP_WINDOW))
    return 1 - openness
  }
  return {
    get amount() { return amount },
    packProgress() { return starts.map((_, index) => progress(index)) },
    update(deltaSeconds, elapsedDays) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
      const target = isCarnivalOpen(elapsedDays) ? 1 : 0
      const step = deltaSeconds / SETUP_SWEEP_SECONDS
      amount = target > amount ? Math.min(target, amount + step) : Math.max(target, amount - step)
    },
  }
}

/**
 * Push a carnival prop centre out past the farm's largest footprint.
 *
 * The carnival used to be authored inside the fence and packed away to make
 * room as the farm grew. Placing it beyond the biggest footprint ever allowed
 * means expansion never has to move it. The push runs along the prop's own
 * angle from the farm centre, so the ring keeps its shape.
 */
export function placeOutsideFarm(x: number, z: number, radius: number, bounds: GardenBounds, margin = 2): { x: number; z: number } {
  if (farmEdgeDistance(x, z, bounds) >= radius + margin) return { x, z }
  const angle = Math.atan2(z / bounds.halfDepth, x / bounds.halfWidth)
  return farmEdgePoint(angle, bounds, radius + margin)
}
