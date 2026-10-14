/**
 * The rules of the paddle minigame (the water plant's pest chore): a frog
 * swims up a stream in one of three lanes and snaps mosquitoes out of the
 * air, hops logs and dodges snags. Pure: no Three.js and no DOM. The scene
 * (`src/scene/care-games/paddle-game.ts`) plays the course; these helpers
 * decide what a lane, a jump and a beat do, so they are tested on their own
 * in `tests/care-game-paddle.test.mjs`.
 *
 * Everything is keyed by time into the round. The stream's distance is the
 * integral of its speed, so a beat due at `at` seconds reaches the frog after
 * `paddleDistance(at)` metres of stream, and the speed ramps with the round.
 */

/** The three lanes the frog swims in: left, middle, right. */
export const PADDLE_LANES: readonly number[] = [-1, 0, 1]
/** Metres between lane centres. */
export const PADDLE_LANE_SPACING = 0.36
/** How long a hop keeps the frog in the air, in seconds. Logs pass under it. */
export const PADDLE_HOP_SECONDS = 0.6
/** How far ahead of the frog a mosquito is snapped up, in metres. */
export const PADDLE_REACH = 1.4
/** Nothing is due before this many seconds: the first seconds are clear. */
export const PADDLE_FIRST_BEAT_SECONDS = 3

/** The stream's speed in metres per second, `seconds` into the round. */
export function paddleSpeed(seconds: number): number {
  return 5.5 + 0.28 * Math.max(0, seconds)
}

/** How far the stream has run by `seconds` into the round, in metres. */
export function paddleDistance(seconds: number): number {
  const t = Math.max(0, seconds)
  return 5.5 * t + 0.14 * t * t
}

/** Sideways position of a lane's centre, in world units (the middle lane is 0). */
export function paddleLaneX(lane: number): number {
  return lane * PADDLE_LANE_SPACING
}

/** One lane step, clamped to the three lanes. */
export function paddleStepLane(lane: number, direction: -1 | 1): number {
  return Math.max(PADDLE_LANES[0], Math.min(PADDLE_LANES[PADDLE_LANES.length - 1], lane + direction))
}

export type PaddleBeatKind = 'mosquito' | 'snag' | 'log'

export interface PaddleBeat {
  readonly kind: PaddleBeatKind
  /** When the beat reaches the frog, in seconds into the round. */
  readonly at: number
  /** The lanes it occupies: one for a mosquito or a snag, one or two for a log. */
  readonly lanes: readonly number[]
}

/**
 * When the frog's rules decide a beat, in seconds into the round. A mosquito
 * is decided when it comes within the tongue's reach; a snag or a log when it
 * reaches the frog.
 */
export function paddleContactTime(beat: PaddleBeat, reach = PADDLE_REACH): number {
  if (beat.kind !== 'mosquito') return beat.at
  return beat.at - reach / paddleSpeed(beat.at)
}

/** Whether the frog is in the air at `seconds`, having jumped at `hopStart` (or not jumped at all). */
export function paddleAirborne(hopStart: number | null, seconds: number): boolean {
  return hopStart !== null && seconds >= hopStart && seconds < hopStart + PADDLE_HOP_SECONDS
}

/**
 * What a beat does to the frog in `lane`, decided at contact time:
 *   'eat'   the mosquito is snapped up by the tongue
 *   'harm'  a snag, or a log the frog is not hopping over, hits the frog
 *   'pass'  nothing happens (a mosquito in another lane, a log hopped over)
 */
export function paddleOutcome(beat: PaddleBeat, lane: number, airborne: boolean): 'eat' | 'harm' | 'pass' {
  const covers = beat.lanes.includes(lane)
  if (beat.kind === 'mosquito') return covers ? 'eat' : 'pass'
  if (!covers) return 'pass'
  if (beat.kind === 'snag') return 'harm'
  return airborne ? 'pass' : 'harm'
}

/** A small deterministic-friendly random helper: `random` returns [0, 1). */
type Random = () => number

function pickLane(random: Random, exclude?: number): number {
  const choices = PADDLE_LANES.filter((lane) => lane !== exclude)
  return choices[Math.floor(random() * choices.length)] ?? 0
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, amount))
}

/**
 * The round's course: mosquitoes to snap, snags to dodge, logs to hop, in
 * patterns that read as choices. Patterns start simple and get denser and
 * nastier as the round goes on:
 *
 *   single      one mosquito in a lane, sometimes a lane shift away
 *   zigzag      two mosquitoes in two lanes, half a second apart
 *   snagMoth    a snag, then a mosquito hovering right behind it in the same lane:
 *               dodge the snag, then come back for the mosquito
 *   logFree     a log across two lanes, the mosquito in the one lane it leaves free
 *   logHop      a log in one lane, the mosquito just past it: hop, then snap
 *   snagPair    (later) two snags, the mosquito in the one lane left open
 *
 * Returns beats in order of arrival. Nothing is due before the first seconds
 * are clear, and nothing is due in the last one and a half seconds, so a
 * round always has time to finish.
 */
export function buildPaddleCourse(random: Random, seconds: number): PaddleBeat[] {
  const beats: PaddleBeat[] = []
  const end = seconds - 1.5
  let at = PADDLE_FIRST_BEAT_SECONDS
  let lastLane = 0
  while (at < end) {
    const progress = (at - PADDLE_FIRST_BEAT_SECONDS) / Math.max(1, end - PADDLE_FIRST_BEAT_SECONDS)
    const roll = random()
    const pace = mix(1.12, 0.82, progress) * (0.9 + random() * 0.2)
    let gap = pace
    if (at < 6 || roll < 0.36) {
      const lane = pickLane(random, lastLane)
      beats.push({ kind: 'mosquito', at, lanes: [lane] })
      lastLane = lane
    } else if (roll < 0.52) {
      const first = pickLane(random)
      const second = pickLane(random, first)
      beats.push({ kind: 'mosquito', at, lanes: [first] })
      beats.push({ kind: 'mosquito', at: at + 0.55, lanes: [second] })
      lastLane = second
      gap = pace + 0.5
    } else if (roll < 0.7) {
      const lane = pickLane(random)
      beats.push({ kind: 'snag', at, lanes: [lane] })
      beats.push({ kind: 'mosquito', at: at + 1, lanes: [lane] })
      lastLane = lane
      gap = pace + 0.7
    } else if (roll < 0.84 || progress < 0.5) {
      const pair = random() < 0.5 ? [-1, 0] : [0, 1]
      const free = pair[0] === -1 ? 1 : -1
      beats.push({ kind: 'log', at, lanes: pair })
      beats.push({ kind: 'mosquito', at: at + 0.6, lanes: [free] })
      lastLane = free
      gap = pace + 0.6
    } else if (roll < 0.93 || progress < 0.7) {
      const lane = pickLane(random)
      beats.push({ kind: 'log', at, lanes: [lane] })
      beats.push({ kind: 'mosquito', at: at + 0.7, lanes: [lane] })
      lastLane = lane
      gap = pace + 0.5
    } else {
      // Two snags leave only the middle lane open, with a mosquito in it.
      beats.push({ kind: 'snag', at, lanes: [-1] })
      beats.push({ kind: 'snag', at, lanes: [1] })
      beats.push({ kind: 'mosquito', at: at + 0.7, lanes: [0] })
      lastLane = 0
      gap = pace + 0.8
    }
    at += gap
  }
  return beats
    .filter((beat) => beat.at < end)
    .sort((a, b) => a.at - b.at)
}
