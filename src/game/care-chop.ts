/**
 * The pure rules of the chop game (prune chore, flower type): a spent stalk
 * drops from rest under gravity past the garden shears, and a tap cuts it.
 * The cut scores by how close the stalk's dashed band is to the blade line:
 * full marks on the line, fewer the further off it is, nothing at all when
 * the tap comes too early (or too late) to count. Three rounds of stalks, each
 * faster than the last, and the round total has to clear a pass mark.
 * No Three.js and no DOM, so it is tested in `tests/care-game-chop.test.mjs`.
 *
 * Distances are metres between the stalk's band and the blade line, measured
 * on the stalk's fall (positive while the band is still above the blades).
 */

export const CHOP_ROUNDS = 3
export const CHOP_STALKS_PER_ROUND = 4
/** Points for a cut dead on the line. */
export const CHOP_MAX_POINTS = 100
/** Within this, the cut is PERFECT (full marks). */
export const CHOP_PERFECT_BAND = 0.05
/** Points fall off in a straight line to zero at this distance, above or below the line. */
export const CHOP_SCORE_REACH = 0.42
/** A cut worth at least this many points reads GOOD. */
export const CHOP_GOOD_POINTS = 60
/** The share of the best possible total that passes the game. */
export const CHOP_PASS_FRACTION = 0.55

export type ChopGrade = 'perfect' | 'good' | 'ok' | 'early'

/** Points for a cut at this distance from the line: 0 outside the reach (or for a nonsense distance). */
export function chopPoints(distance: number): number {
  const size = Math.abs(distance)
  if (!(size < CHOP_SCORE_REACH)) return 0
  if (size <= CHOP_PERFECT_BAND) return CHOP_MAX_POINTS
  const share = (CHOP_SCORE_REACH - size) / (CHOP_SCORE_REACH - CHOP_PERFECT_BAND)
  return Math.round(CHOP_MAX_POINTS * share)
}

/** The word for a cut. A tap with the band still above the reach is EARLY, worth nothing. */
export function gradeChop(distance: number): ChopGrade {
  const points = chopPoints(distance)
  if (points >= CHOP_MAX_POINTS) return 'perfect'
  if (points >= CHOP_GOOD_POINTS) return 'good'
  if (points > 0) return 'ok'
  return 'early'
}

/** A stalk whose band has dropped out of reach below the blades, uncut, scores nothing. */
export function fellThrough(distance: number): boolean {
  return distance <= -CHOP_SCORE_REACH
}

/** The most a whole game can score. */
export function chopMaxScore(): number {
  return CHOP_ROUNDS * CHOP_STALKS_PER_ROUND * CHOP_MAX_POINTS
}

/** The total that passes. */
export function chopPassScore(): number {
  return Math.ceil(chopMaxScore() * CHOP_PASS_FRACTION)
}

export function chopPassed(total: number): boolean {
  return total >= chopPassScore()
}

/**
 * Seconds a stalk takes to drop from rest to the blades, for a round (0-based).
 * Gravity is fixed by this and the drop height, so a later round is a harder
 * round: the stalk meets the blades faster.
 */
export function chopFallSeconds(round: number): number {
  return Math.max(0.8, 1.25 - 0.2 * round)
}

/** Gravity (m/s^2) that drops a stalk `height` metres in `seconds` from rest. */
export function chopGravity(height: number, seconds: number): number {
  return (2 * height) / (seconds * seconds)
}

/** How fast (m/s) the stalk is moving when it reaches the blades. */
export function chopImpactSpeed(height: number, seconds: number): number {
  return (2 * height) / seconds
}

/** Rest between one stalk landing and the next dropping, in seconds. */
export const CHOP_STALK_PAUSE = 0.55
/** Breather between rounds, in seconds. */
export const CHOP_ROUND_PAUSE = 1.4

/** Where along a stalk the dashed band can be painted, in the stalk's own metres (0 = its middle). */
export const CHOP_BAND_LOW = -0.2
export const CHOP_BAND_HIGH = 0.16

/** Where the band sits on a stalk, from a 0..1 random draw. */
export function chopBandHeight(random: number): number {
  return CHOP_BAND_LOW + Math.min(1, Math.max(0, random)) * (CHOP_BAND_HIGH - CHOP_BAND_LOW)
}

/** The playfield the camera frames: its width, its height, and where it bottoms out and centres (world metres). */
export const CHOP_PLAY_WIDTH = 1.2
export const CHOP_PLAY_HEIGHT = 1.5
export const CHOP_PLAY_BOTTOM = -0.2
export const CHOP_PLAY_CENTRE_X = 0.15

/** The world height the camera shows at the playfield's distance: tall enough for the height, wide enough for the width. */
export function chopViewHeight(aspect: number): number {
  return Math.max(CHOP_PLAY_HEIGHT, CHOP_PLAY_WIDTH / Math.max(0.2, aspect))
}

/** The world height of the top edge of the view. A new stalk starts just above it, so it never pops in. */
export function chopViewTop(aspect: number): number {
  return CHOP_PLAY_BOTTOM + chopViewHeight(aspect)
}
