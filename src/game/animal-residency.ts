/**
 * Moving up and down the condition ladder, as the sim sees it: which rung an
 * animal shows, and when a settle takes effect.
 *
 * The ladder's verdict (animal-life) can say "settle" while the visitor is still
 * out at the tents. That is a promise, not yet a fact: the rung stays at 2, so the
 * animal keeps its visitor leash and walks in through the gate, and the promotion
 * is applied once it has browsed the plot for a while. When it does, the sim
 * emits a `stage-up` event and the view starts the paint reveal.
 *
 * Pure: no Three.js, no DOM.
 */
import type { GardenBounds } from './farm-expansion'
import { containsFarmPoint } from './farm-footprint'
import type { AnimalStage } from './animal-conditions'
import { beginGateTravel } from './animal-routes'
import type { AnimalSimRecord } from './animal-sim'

/** How long a pending settle has to browse the plot before it takes effect. */
export const RESIDENT_DWELL_SECONDS = 4
/** How far inside the boundary counts as "in the plot". */
export const RESIDENT_INSIDE_MARGIN = 0.6

type Point = { readonly x: number; readonly z: number }

/** Inside the plot proper: not mid-route, and comfortably past the boundary. */
export function insideFarmPlot(record: AnimalSimRecord, at: Point, bounds: GardenBounds): boolean {
  if (record.visit.route !== null) return false
  return containsFarmPoint(at.x, at.z, bounds, RESIDENT_INSIDE_MARGIN)
}

/**
 * Ask for a rung. A demotion cancels a settle that was waiting for the walk in. A
 * promotion to a resident from out at the tents waits (see above); anything else
 * takes effect now, with a `stage-up` or `stage-down` event, and sets the gate
 * trips that go with the rung: a visitor starts through the gate, a settler out
 * at the tents is sent in, and a demoted animal that was a resident is back on the farm.
 */
export function requestStage(
  record: AnimalSimRecord,
  next: AnimalStage,
  at: Point,
  bounds: GardenBounds,
  flier: boolean,
  rng: () => number,
): void {
  if (next < 3) {
    record.pendingStage = null
    record.dwell = 0
  }
  if (next === record.stage) return
  const previous = record.stage
  if (previous < 2 && next === 2) beginGateTravel(record, 'enter', at, bounds, flier, record.stage, rng)
  if (previous < 3 && next >= 3 && record.visit.side === 'carnival' && record.visit.direction !== 'enter') {
    beginGateTravel(record, 'enter', at, bounds, flier, record.stage, rng)
  }
  if (previous >= 3 && next < 2) {
    record.visit.route = null
    record.visit.direction = null
    record.visit.side = 'farm'
  }
  if (next >= 3 && record.stage < 3 && !insideFarmPlot(record, at, bounds)) {
    // The ladder has decided; only the arrival waits. Leaving the rung at 2 is what keeps
    // the animal walking in as a visitor instead of donning residence out on the meadow.
    if (record.pendingStage === null) record.dwell = 0
    record.pendingStage = next
    return
  }
  record.stage = next
  record.events.push({ type: next > previous ? 'stage-up' : 'stage-down', from: previous, to: next })
}

/**
 * One tick of waiting. While a settle is pending, time spent inside the plot
 * counts toward `RESIDENT_DWELL_SECONDS`; stepping out starts the count again.
 */
export function tickResidency(
  record: AnimalSimRecord,
  dt: number,
  at: Point,
  bounds: GardenBounds,
  flier: boolean,
  rng: () => number,
): void {
  if (record.pendingStage === null) return
  if (!insideFarmPlot(record, at, bounds)) {
    // Still out on the meadow: the clock restarts, so the animal has to
    // spend the dwell time actually inside before residence sticks.
    record.dwell = 0
    return
  }
  record.dwell += dt
  if (record.dwell < RESIDENT_DWELL_SECONDS) return
  const next = record.pendingStage
  record.pendingStage = null
  record.dwell = 0
  requestStage(record, next, at, bounds, flier, rng)
}
