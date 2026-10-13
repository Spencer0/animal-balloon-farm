/**
 * The pure rules of the hop minigame (the flower's pest chore): a ladybug
 * auto-runs along a leaf path on a beat. A tap jumps it over thorns and burrs;
 * it eats the aphid clusters it runs into, and the floating arcs at the top of
 * a jump. Pure: no Three.js and no DOM, so the physics and the beat pattern are
 * tested in `tests/care-game-hop.test.mjs`.
 *
 * The run is measured in beats, not seconds: the obstacles sit on the beat
 * grid, so a tap on the beat before a thorn lands the jump on the music. A
 * jump is a fixed-height arc that lasts exactly two beats at the opening tempo.
 */

/** Distance the ladybug covers per beat, in world units. */
export const HOP_BEAT_UNITS = 1.5
export const HOP_BPM = 120
/** The run speeds up a little from `HOP_FAST_FROM_BEAT`. */
export const HOP_FAST_BPM = 128
export const HOP_FAST_FROM_BEAT = 24
/** A jump's flight, in seconds, and its apex height in world units. */
export const HOP_JUMP_AIR_SECONDS = 1
export const HOP_JUMP_APEX = 1
/** Half the ladybug's length: how far its middle reaches for contact. */
export const HOP_RUNNER_HALF = 0.22
export const HOP_THORN_HEIGHT = 0.62
export const HOP_THORN_HALF = 0.1
export const HOP_BURR_HEIGHT = 0.5
export const HOP_BURR_HALF = 0.12
/** Where a grounded aphid cluster can be touched, in height above the path. */
const APHID_GROUND_TOP = 0.25
const APHID_GROUND_HALF = 0.18
/** The hop-blink after a harm, in seconds, during which other burrs do not hurt. */
export const HOP_HARM_BLINK_SECONDS = 1

export type HopObstacleKind = 'thorn' | 'burr' | 'aphid' | 'arc'

/** One entry of the beat pattern. An `arc` is a floating aphid arc with a burr under its middle. */
export interface HopPatternEntry {
  readonly beat: number
  readonly kind: HopObstacleKind
}

/**
 * The run's pattern. The first four beats are empty; then single thorns and
 * ground aphids, doubles (thorns three beats apart), and floating arcs over
 * burrs that tempt a late jump. Every harm is clearable by a tap on the beat
 * before it, and the twelve aphids are all there with two spare (see the tests).
 */
export const HOP_PATTERN: readonly HopPatternEntry[] = [
  { beat: 5, kind: 'thorn' },
  { beat: 8, kind: 'aphid' },
  { beat: 10, kind: 'thorn' },
  { beat: 12, kind: 'aphid' },
  { beat: 13, kind: 'aphid' },
  { beat: 15, kind: 'thorn' },
  { beat: 18, kind: 'burr' },
  { beat: 20, kind: 'aphid' },
  { beat: 21, kind: 'aphid' },
  { beat: 23, kind: 'arc' },
  { beat: 26, kind: 'aphid' },
  { beat: 27, kind: 'aphid' },
  { beat: 29, kind: 'thorn' },
  { beat: 32, kind: 'arc' },
  { beat: 34, kind: 'aphid' },
  { beat: 35, kind: 'aphid' },
  { beat: 36, kind: 'aphid' },
  { beat: 38, kind: 'thorn' },
  { beat: 40, kind: 'aphid' },
  { beat: 41, kind: 'aphid' },
]

/** One aphid of a floating arc: its offset along the run (world units) and height above the path. */
export interface HopArcPoint {
  readonly dx: number
  readonly y: number
}

/** A thing on the path, at a fixed place in the run. */
export interface HopObstacle {
  readonly id: number
  readonly kind: 'thorn' | 'burr' | 'aphid' | 'arc'
  readonly beat: number
  /** Where it sits along the run, in world units (its beat times the beat length). */
  readonly x: number
  /** Harm obstacles: half their width, and their height. */
  readonly half: number
  readonly height: number
  /** Arcs only: the aphids in the arc. */
  readonly points: readonly HopArcPoint[]
}

const ARC_HALF_SPAN = 0.6
const ARC_TOP = 1
const ARC_ENDS = 0.55

/** The obstacles of a pattern, in run order, with stable ids. An arc becomes an arc plus a burr under it. */
export function hopObstacles(pattern: readonly HopPatternEntry[] = HOP_PATTERN): HopObstacle[] {
  const out: HopObstacle[] = []
  const add = (entry: Omit<HopObstacle, 'id'>): void => {
    out.push({ ...entry, id: out.length })
  }
  for (const entry of pattern) {
    const x = entry.beat * HOP_BEAT_UNITS
    if (entry.kind === 'thorn') add({ kind: 'thorn', beat: entry.beat, x, half: HOP_THORN_HALF, height: HOP_THORN_HEIGHT, points: [] })
    else if (entry.kind === 'burr') add({ kind: 'burr', beat: entry.beat, x, half: HOP_BURR_HALF, height: HOP_BURR_HEIGHT, points: [] })
    else if (entry.kind === 'aphid') add({ kind: 'aphid', beat: entry.beat, x, half: APHID_GROUND_HALF, height: APHID_GROUND_TOP, points: [] })
    else {
      // The arc's aphids hang on a parabola that peaks above the middle of the burr.
      const points: HopArcPoint[] = [-0.6, -0.3, 0, 0.3, 0.6].map((dx) => ({
        dx,
        y: ARC_ENDS + (ARC_TOP - ARC_ENDS) * (1 - (dx / ARC_HALF_SPAN) ** 2),
      }))
      add({ kind: 'arc', beat: entry.beat, x, half: 0, height: 0, points })
      add({ kind: 'burr', beat: entry.beat, x, half: HOP_BURR_HALF, height: HOP_BURR_HEIGHT, points: [] })
    }
  }
  return out
}

/** Beats per minute at a given beat of the run. */
export function hopBpm(beat: number): number {
  return beat >= HOP_FAST_FROM_BEAT ? HOP_FAST_BPM : HOP_BPM
}

/** The height of a jump `airSeconds` after take-off: a fixed arc, 0 on the ground. */
export function hopLift(airSeconds: number): number {
  if (airSeconds <= 0 || airSeconds >= HOP_JUMP_AIR_SECONDS) return 0
  const s = airSeconds / HOP_JUMP_AIR_SECONDS
  return 4 * HOP_JUMP_APEX * s * (1 - s)
}

/**
 * Whether the ladybug touches an obstacle at a run position and height: `eat`
 * for aphids, `harm` for thorns and burrs, null otherwise.
 */
export function hopContact(obstacle: HopObstacle, runnerX: number, lift: number): 'eat' | 'harm' | null {
  if (obstacle.kind === 'arc') {
    // Aphids in the arc are eaten at the top of a jump only: the ladybug has to be near the peak.
    for (const point of obstacle.points) {
      if (Math.abs(runnerX - (obstacle.x + point.dx)) < HOP_RUNNER_HALF + 0.1 && Math.abs(point.y - lift) < 0.14) return 'eat'
    }
    return null
  }
  const near = Math.abs(runnerX - obstacle.x) < HOP_RUNNER_HALF + obstacle.half
  if (!near) return null
  if (obstacle.kind === 'aphid') return lift < APHID_GROUND_TOP ? 'eat' : null
  return lift < obstacle.height ? 'harm' : null
}

export type HopEvent =
  | { readonly kind: 'beat'; readonly beat: number }
  | { readonly kind: 'takeoff' }
  | { readonly kind: 'land' }
  | { readonly kind: 'eat'; readonly obstacle: HopObstacle }
  | { readonly kind: 'harm'; readonly obstacle: HopObstacle }

export interface HopRun {
  /** Beats run so far; the ladybug's run position is `beats * HOP_BEAT_UNITS`. */
  readonly beats: number
  readonly runnerX: number
  readonly lift: number
  readonly airborne: boolean
  /** Seconds since take-off, while airborne. */
  readonly airSeconds: number
  /** Seconds left of the post-harm blink. */
  readonly blink: number
  readonly obstacles: readonly HopObstacle[]
  /** Whether an obstacle has been eaten or has hurt the runner already. */
  isDone(obstacle: HopObstacle): boolean
  /** Tap: take off if on the ground. Returns whether a jump started. */
  jump(): boolean
  /** Whether the finger is down: a held finger jumps again on every landing. */
  setHolding(holding: boolean): void
  /** Advance by a frame (at most 1/60 s is simulated per step) and return what happened. */
  step(deltaSeconds: number): HopEvent[]
}

const SUBSTEP = 1 / 60

export function createHopRun(obstacles: readonly HopObstacle[] = hopObstacles()): HopRun {
  let beats = 0
  let airborne = false
  let airSeconds = 0
  let blink = 0
  let holding = false
  let lastBeat = 0
  const done = new Set<number>()

  const run: HopRun = {
    get beats() { return beats },
    get runnerX() { return beats * HOP_BEAT_UNITS },
    get lift() { return airborne ? hopLift(airSeconds) : 0 },
    get airborne() { return airborne },
    get airSeconds() { return airSeconds },
    get blink() { return blink },
    obstacles,
    isDone: (obstacle) => done.has(obstacle.id),
    jump(): boolean {
      if (airborne) return false
      airborne = true
      airSeconds = 0
      return true
    },
    setHolding(value: boolean): void {
      holding = value
    },
    step(deltaSeconds: number): HopEvent[] {
      const events: HopEvent[] = []
      let remaining = Math.max(0, deltaSeconds)
      while (remaining > 1e-9) {
        const dt = Math.min(SUBSTEP, remaining)
        remaining -= dt
        beats += (dt * hopBpm(beats)) / 60
        blink = Math.max(0, blink - dt)
        if (airborne) {
          airSeconds += dt
          if (airSeconds >= HOP_JUMP_AIR_SECONDS) {
            airborne = false
            airSeconds = 0
            events.push({ kind: 'land' })
            if (holding) {
              // A held finger keeps the ladybug hopping: the next jump starts on the landing.
              airborne = true
              events.push({ kind: 'takeoff' })
            }
          }
        }
        const beat = Math.floor(beats)
        while (lastBeat < beat) {
          lastBeat += 1
          events.push({ kind: 'beat', beat: lastBeat })
        }
        const lift = airborne ? hopLift(airSeconds) : 0
        for (const obstacle of obstacles) {
          if (done.has(obstacle.id)) continue
          const contact = hopContact(obstacle, beats * HOP_BEAT_UNITS, lift)
          if (contact === 'eat') {
            done.add(obstacle.id)
            events.push({ kind: 'eat', obstacle })
          } else if (contact === 'harm') {
            // A thorn hurts once; during the blink it is simply passed through.
            done.add(obstacle.id)
            if (blink <= 0) {
              blink = HOP_HARM_BLINK_SECONDS
              events.push({ kind: 'harm', obstacle })
            }
          }
        }
      }
      return events
    },
  }
  return run
}
