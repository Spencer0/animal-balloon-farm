/**
 * Who sleeps, and where. Pure, so the rule is testable without a renderer.
 *
 * A night-only species is awake in the dark and asleep in daylight. A resident
 * that has a garbage can sleeps curled up beside it; one without a can sleeps
 * where it stands. `main.ts` feeds the result to `BalloonAnimal.setSleepSpot`.
 */

import { isNightOnly } from './animal-conditions'

export interface BedPoint {
  readonly x: number
  readonly z: number
}

export interface Bed extends BedPoint {
  /** Yaw about +Y for a +X-forward model, turned toward the thing it sleeps beside. */
  readonly heading: number
}

/** How far from a can's centre a sleeper lies: its own half-length plus the can's radius, so it lies beside the can, not on it. */
export const BED_RADIUS = 1.8
/** The same for a dumpster, which is 3.6 m long: measured from its centre, so it lies a little off the end or side. */
export const DUMPSTER_BED_RADIUS = 2.6
/** A rat curled beside the 3.8 m hollow log: clear of the log's long side. */
export const HOLLOW_LOG_BED_RADIUS = 2.4
/** Angle between neighbouring sleepers around one can, in radians. */
const BED_STEP = 2.2

/** Whether a species should be asleep right now. Day animals never sleep. */
export function shouldSleep(species: string, night: boolean): boolean {
  return isNightOnly(species) && !night
}

/** The spot beside `anchor` for the `slot`-th sleeper, facing the anchor. */
export function bedBeside(anchor: BedPoint, slot: number, radius: number = BED_RADIUS): Bed {
  const angle = 0.6 + slot * BED_STEP
  const x = anchor.x + Math.cos(angle) * radius
  const z = anchor.z + Math.sin(angle) * radius
  return { x, z, heading: Math.atan2(-(anchor.z - z), anchor.x - x) }
}

/**
 * Pick an anchor for a sleeper standing at `from`: the least crowded one, then
 * the nearest. `occupancy[i]` is how many already sleep at `anchors[i]`.
 * Returns the chosen index, or -1 when there is nothing to sleep beside.
 */
export function pickAnchor(anchors: readonly BedPoint[], occupancy: readonly number[], from: BedPoint): number {
  let best = -1
  let bestLoad = Infinity
  let bestDistance = Infinity
  anchors.forEach((anchor, index) => {
    const load = occupancy[index] ?? 0
    const distance = Math.hypot(anchor.x - from.x, anchor.z - from.z)
    if (load < bestLoad || (load === bestLoad && distance < bestDistance)) {
      best = index
      bestLoad = load
      bestDistance = distance
    }
  })
  return best
}

/**
 * What each night species sleeps beside by day, most preferred first, and how far from the
 * prop's centre a bed is (the animal's half-length plus the prop's reach). A species that is not
 * listed, or whose props are not placed, sleeps where it stands. A night animal with room in its
 * house (see animal-housing.ts) sleeps indoors instead; this is for one that has none.
 */
export const SLEEP_PROPS: Readonly<Record<string, readonly { readonly prop: string; readonly radius: number }[]>> = {
  raccoon: [
    { prop: 'dumpster', radius: DUMPSTER_BED_RADIUS },
    { prop: 'garbage-can', radius: BED_RADIUS },
  ],
  rat: [
    { prop: 'hollow-log', radius: HOLLOW_LOG_BED_RADIUS },
    { prop: 'garbage-can', radius: BED_RADIUS },
  ],
}
