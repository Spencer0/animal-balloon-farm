/**
 * The pure rules of the chop game (prune chore, flower type): a spent stalk
 * falls past the garden shears, and a tap cuts whichever stalk's dashed band is
 * nearest the blade line. No Three.js and no DOM, so it is tested in
 * `tests/care-game-chop.test.mjs`.
 *
 * Distances are metres between the stalk's band and the blade line, measured
 * on the stalk's fall (positive while the band is still above the blades).
 */

/** Within this, the cut is PERFECT. */
export const CHOP_PERFECT_BAND = 0.035
/** Within this, the cut is GOOD. Beyond it (but inside the reach) the cut is a MISS. */
export const CHOP_GOOD_BAND = 0.09
/** A tap grades the nearest stalk within this reach; with none, the snap is a whiff. */
export const CHOP_REACH = 0.3
/** A PERFECT counts this many hits; a GOOD counts one. */
export const CHOP_PERFECT_HITS = 2
/** A fake-out: the stalk stalls when its band is this far above the blades (just outside GOOD). */
export const CHOP_FAKE_OUT_AT = CHOP_GOOD_BAND + 0.03
export const CHOP_FAKE_OUT_SECONDS = 0.45
/** Where along a stalk the dashed band can be painted, in the stalk's own metres (0 = its middle). */
export const CHOP_BAND_LOW = -0.2
export const CHOP_BAND_HIGH = 0.16

export type ChopGrade = 'perfect' | 'good' | 'miss' | 'whiff'

/** Grade a tap by the distance from the nearest stalk's band to the blade line. */
export function gradeChop(distance: number): ChopGrade {
  if (!(Math.abs(distance) <= CHOP_REACH)) return 'whiff'
  const size = Math.abs(distance)
  if (size <= CHOP_PERFECT_BAND) return 'perfect'
  if (size <= CHOP_GOOD_BAND) return 'good'
  return 'miss'
}

/** Hits a grade is worth to the round. A MISS is a miss, not a hit. */
export function hitsFor(grade: ChopGrade): number {
  if (grade === 'perfect') return CHOP_PERFECT_HITS
  if (grade === 'good') return 1
  return 0
}

/** A stalk that falls past the blades uncut: its band has dropped out of reach below them. */
export function fellThrough(distance: number): boolean {
  return distance < -CHOP_REACH
}

/** Metres per second for the nth stalk (0-based): each stalk falls a little faster. */
export function chopFallSpeed(index: number): number {
  return Math.min(1.3, 0.72 + 0.06 * index)
}

/** Seconds from one stalk's spawn to the next: quicker as the round goes on. */
export function chopSpawnGap(index: number): number {
  return Math.max(1.9, 2.7 - 0.08 * index)
}

/** Chance that the nth stalk (0-based) stalls just short of the blades. */
export function chopFakeOutChance(index: number): number {
  return Math.min(0.45, 0.15 + 0.04 * index)
}

/** Where the band sits on a stalk, from a 0..1 random draw. */
export function chopBandHeight(random: number): number {
  return CHOP_BAND_LOW + Math.min(1, Math.max(0, random)) * (CHOP_BAND_HIGH - CHOP_BAND_LOW)
}
