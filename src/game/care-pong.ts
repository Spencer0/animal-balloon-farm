/**
 * The pure rules of trim pong (the root vegetable's prune chore): quick table
 * tennis against the vegetable's own overgrown top. You hold a trowel at the
 * near end of a potting bench; the vegetable stands at the far end with a few
 * wild shoots sticking up out of its leaves, and a big leaf bats a pea at you,
 * anywhere across the bench.
 *
 * - Move the trowel (it follows the pointer) to where the pea is coming, and
 *   smack it (click) just before it meets the trowel. The closer to that
 *   moment, the harder the smack: a perfect one homes in on a wild shoot and
 *   snips it off (a hit), a good one finds a shoot near where it was angled,
 *   an ok one goes where it goes.
 * - The part of the trowel the pea meets angles the return, like a real bat:
 *   off the left edge it goes left, off the middle it goes straight.
 * - A trowel in the pea's way that does not swing just blocks it: the pea
 *   pops back soft and snips nothing. A pea the trowel is not under gets past,
 *   and that is a heart.
 * - A swing too early, or with the trowel nowhere near the pea, whiffs.
 * - Every smack quickens the next pea, and the leaf places them wider.
 *
 * Positions across the bench run -1 (left) to 1 (right). A flight's progress
 * runs 0 at the end it left from to 1 at the end it is going to; an incoming
 * pea meets the trowel at 1. Pure: no Three.js and no DOM, tested in
 * `tests/care-game-pong.test.mjs`.
 */

/** Seconds the first pea takes to reach you; each smack makes the next a little quicker, down to the floor. */
export const PONG_FIRST_FLIGHT = 0.95
export const PONG_FLIGHT_STEP = 0.03
export const PONG_FASTEST_FLIGHT = 0.6
/**
 * The smack window, in seconds before the pea meets the trowel: it opens this
 * early, the sweet spot is this far ahead of the meeting (a swing has to
 * arrive as the pea does), and a swing a hair late still counts.
 */
export const PONG_EARLY = 0.27
export const PONG_SWEET_LEAD = 0.06
export const PONG_LATE = 0.04
/** How far from the sweet spot, in seconds, a smack still counts as perfect, or good. Anything else in the window is ok. */
export const PONG_PERFECT_WITHIN = 0.045
export const PONG_GOOD_WITHIN = 0.1
/** A whiffed swing has to come back before the next one. */
export const PONG_SWING_COOLDOWN = 0.36
/** Half the trowel's reach across the bench: a pea within this of its middle meets it. */
export const PONG_REACH = 0.24
/** How far the trowel's very edge angles a return across the far end. */
export const PONG_ANGLE = 0.6
/** How far from the angled aim a smack still finds a wild shoot, for each grade. */
export const PONG_HOMING = { perfect: 0.6, good: 0.32, ok: 0 } as const
/** How far a smack wanders from its shoot (or its aim), at most, for each grade. */
export const PONG_WANDER = { perfect: 0, good: 0.07, ok: 0.3 } as const
/** A return's flight time, as a share of the incoming flight it answers. */
export const PONG_RETURN_SHARE = { perfect: 0.5, good: 0.62, ok: 0.78, block: 1.05 } as const
/** Half the width of a shoot, as a target. */
export const PONG_SHOOT_HALF = 0.15
/** How many wild shoots stand at once, the lanes they grow in, and how long a trimmed one takes to regrow. */
export const PONG_SHOOTS_AT_ONCE = 3
export const PONG_SHOOT_LANES: readonly number[] = [-0.72, -0.36, 0, 0.36, 0.72]
export const PONG_REGROW_SECONDS = 0.8
/** The pause before a new serve, after a pea got past. */
export const PONG_SERVE_PAUSE = 0.6
/** How far from the middle the leaf places a pea on your side: this at first, widening per smack up to the widest. */
export const PONG_NEAR_SPREAD = 0.5
export const PONG_SPREAD_STEP = 0.04
export const PONG_WIDEST_SPREAD = 0.85

export type PongGrade = 'perfect' | 'good' | 'ok'

export type PongBallPhase = 'serve' | 'incoming' | 'outgoing' | 'past'

export interface PongShoot {
  readonly id: number
  readonly x: number
}

export type PongEvent =
  | { readonly kind: 'serve'; readonly fromX: number; readonly toX: number }
  | { readonly kind: 'smack'; readonly grade: PongGrade; readonly atX: number; readonly toX: number; readonly target: PongShoot | null }
  | { readonly kind: 'block'; readonly atX: number; readonly toX: number }
  | { readonly kind: 'whiff'; readonly reason: 'early' | 'wide' }
  | { readonly kind: 'trim'; readonly shoot: PongShoot; readonly grade: PongGrade }
  | { readonly kind: 'batted'; readonly atX: number; readonly toX: number }
  | { readonly kind: 'past'; readonly atX: number }
  | { readonly kind: 'regrow'; readonly shoot: PongShoot }

export interface PongBall {
  readonly phase: PongBallPhase
  /** Where the current flight left from and is headed, across the bench. */
  readonly fromX: number
  readonly toX: number
  /** 0..1 along the flight; past 1 while it rolls off after a miss. */
  readonly progress: number
  readonly flightSeconds: number
  /** The grade of the smack that sent an outgoing pea, or null (a block, or not outgoing). */
  readonly grade: PongGrade | null
}

export interface PongRally {
  readonly ball: PongBall
  /** The pea's place across the bench now. */
  readonly ballX: number
  /** The trowel's place across the bench. */
  readonly paddleX: number
  /** Seconds until an incoming pea meets the trowel's line (negative once there), or null when none is incoming. */
  readonly untilContact: number | null
  readonly shoots: readonly PongShoot[]
  /** Smacks since the last pea got past; each one quickens the next flight. */
  readonly rallies: number
  /** Seconds the trowel still needs before it can swing again. */
  readonly cooldown: number
  /** Move the trowel across the bench (-1..1). */
  movePaddle(x: number): void
  /** Swing. In the window, with the trowel under the pea, it smacks; otherwise it whiffs. */
  swing(): PongEvent[]
  step(deltaSeconds: number): PongEvent[]
}

/** How a swing this many seconds before the pea meets the trowel is graded, or null outside the window. */
export function pongGrade(untilContact: number): PongGrade | null {
  if (untilContact > PONG_EARLY || untilContact < -PONG_LATE) return null
  const off = Math.abs(untilContact - PONG_SWEET_LEAD)
  if (off <= PONG_PERFECT_WITHIN) return 'perfect'
  if (off <= PONG_GOOD_WITHIN) return 'good'
  return 'ok'
}

/** The incoming flight time after a number of smacks. */
export function pongFlight(rallies: number): number {
  return Math.max(PONG_FASTEST_FLIGHT, PONG_FIRST_FLIGHT - rallies * PONG_FLIGHT_STEP)
}

/** Whether the trowel at `paddleX` is under a pea at `atX`. */
export function pongInReach(atX: number, paddleX: number): boolean {
  return Math.abs(atX - paddleX) <= PONG_REACH
}

/** Where a return off the trowel is angled: straight off its middle, out to the side off its edges. */
export function pongAim(atX: number, paddleX: number): number {
  const offset = Math.max(-1, Math.min(1, (atX - paddleX) / PONG_REACH))
  return clampX(atX + offset * PONG_ANGLE)
}

/** The wild shoot a smack of this grade homes in on from its aim, if any: the nearest within its homing. */
export function pongSmackTarget(shoots: readonly PongShoot[], aimX: number, grade: PongGrade): PongShoot | null {
  return PONG_HOMING[grade] > 0 ? nearestShoot(shoots, aimX, PONG_HOMING[grade]) : null
}

/** The shoot an arriving smack trims, if any: the nearest within a shoot's width of where it lands. */
export function pongShootHit(shoots: readonly PongShoot[], landX: number): PongShoot | null {
  return nearestShoot(shoots, landX, PONG_SHOOT_HALF)
}

function nearestShoot(shoots: readonly PongShoot[], x: number, within: number): PongShoot | null {
  let best: PongShoot | null = null
  let bestDistance = within
  for (const shoot of shoots) {
    const distance = Math.abs(shoot.x - x)
    if (distance <= bestDistance) {
      best = shoot
      bestDistance = distance
    }
  }
  return best
}

function clampX(x: number): number {
  return Math.max(-1, Math.min(1, x))
}

export function createPongRally(random: () => number = Math.random): PongRally {
  let nextShootId = 0
  const shoots: PongShoot[] = []
  /** Lanes whose shoot was trimmed, and seconds until each grows back. */
  const regrowing: number[] = []
  let rallies = 0
  let cooldown = 0
  let paddleX = 0
  let ball: { phase: PongBallPhase; fromX: number; toX: number; progress: number; flightSeconds: number; grade: PongGrade | null } = {
    phase: 'serve', fromX: 0, toX: 0, progress: 0, flightSeconds: PONG_SERVE_PAUSE, grade: null,
  }

  function freeLanes(): number[] {
    return PONG_SHOOT_LANES.filter((lane) => !shoots.some((shoot) => Math.abs(shoot.x - lane) < 1e-6))
  }

  function sprout(): PongShoot | null {
    const free = freeLanes()
    if (free.length === 0) return null
    const shoot = { id: nextShootId++, x: free[Math.floor(random() * free.length) % free.length] }
    shoots.push(shoot)
    return shoot
  }

  for (let index = 0; index < PONG_SHOOTS_AT_ONCE; index += 1) sprout()

  /**
   * The leaf sends a pea at you from where it is. Like a real player it makes
   * you move: of two places it might put the pea, it picks the one farther
   * from your trowel.
   */
  function sendIncoming(fromX: number, events: PongEvent[], kind: 'serve' | 'batted'): void {
    const spread = Math.min(PONG_WIDEST_SPREAD, PONG_NEAR_SPREAD + rallies * PONG_SPREAD_STEP)
    const first = (random() * 2 - 1) * spread
    const second = (random() * 2 - 1) * spread
    const toX = clampX(Math.abs(first - paddleX) >= Math.abs(second - paddleX) ? first : second)
    ball = { phase: 'incoming', fromX, toX, progress: 0, flightSeconds: pongFlight(rallies), grade: null }
    events.push(kind === 'serve' ? { kind: 'serve', fromX, toX } : { kind: 'batted', atX: fromX, toX })
  }

  const ballX = (): number => {
    if (ball.phase === 'serve') return ball.fromX
    const t = Math.min(1, ball.progress)
    return ball.fromX + (ball.toX - ball.fromX) * t
  }

  const untilContact = (): number | null => (ball.phase === 'incoming' ? (1 - ball.progress) * ball.flightSeconds : null)

  const rally: PongRally = {
    get ball(): PongBall { return { ...ball } },
    get ballX() { return ballX() },
    get paddleX() { return paddleX },
    get untilContact() { return untilContact() },
    get shoots() { return [...shoots] },
    get rallies() { return rallies },
    get cooldown() { return cooldown },
    movePaddle(x): void {
      if (Number.isFinite(x)) paddleX = clampX(x)
    },
    swing(): PongEvent[] {
      if (cooldown > 0) return []
      const until = untilContact()
      const grade = until === null ? null : pongGrade(until)
      // The pea meets the trowel's line where its flight ends.
      if (!grade || !pongInReach(ball.toX, paddleX)) {
        cooldown = PONG_SWING_COOLDOWN
        return [{ kind: 'whiff', reason: grade ? 'wide' : 'early' }]
      }
      const atX = ball.toX
      const aim = pongAim(atX, paddleX)
      const target = pongSmackTarget(shoots, aim, grade)
      // A smack lands on the shoot it homed in on (or where it was angled), wandering by up to its grade's amount.
      const wander = PONG_WANDER[grade] * (random() * 2 - 1)
      const toX = clampX((target ? target.x : aim) + wander)
      ball = { phase: 'outgoing', fromX: atX, toX, progress: 0, flightSeconds: ball.flightSeconds * PONG_RETURN_SHARE[grade], grade }
      rallies += 1
      return [{ kind: 'smack', grade, atX, toX, target }]
    },
    step(deltaSeconds): PongEvent[] {
      const events: PongEvent[] = []
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      if (dt === 0) return events
      cooldown = Math.max(0, cooldown - dt)
      for (let index = regrowing.length - 1; index >= 0; index -= 1) {
        regrowing[index] -= dt
        if (regrowing[index] > 0) continue
        regrowing.splice(index, 1)
        const shoot = sprout()
        if (shoot) events.push({ kind: 'regrow', shoot })
      }
      if (ball.phase === 'serve') {
        ball.progress += dt
        if (ball.progress >= ball.flightSeconds) sendIncoming(clampX((random() * 2 - 1) * 0.4), events, 'serve')
        return events
      }
      ball.progress += dt / ball.flightSeconds
      if (ball.phase === 'incoming' && (untilContact() ?? 0) < -PONG_LATE) {
        const atX = ball.toX
        if (pongInReach(atX, paddleX)) {
          // Nobody swung, but the trowel was in the way: the pea pops back soft, toward the middle.
          const toX = clampX(atX * 0.5 + (random() * 2 - 1) * 0.3)
          ball = { phase: 'outgoing', fromX: atX, toX, progress: 0, flightSeconds: ball.flightSeconds * PONG_RETURN_SHARE.block, grade: null }
          events.push({ kind: 'block', atX, toX })
        } else {
          events.push({ kind: 'past', atX })
          ball = { phase: 'past', fromX: atX, toX: atX, progress: 0, flightSeconds: PONG_SERVE_PAUSE, grade: null }
          rallies = Math.max(0, rallies - 2)
        }
      } else if (ball.phase === 'past') {
        if (ball.progress >= 1) {
          ball = { phase: 'serve', fromX: 0, toX: 0, progress: 0, flightSeconds: 0.01, grade: null }
        }
      } else if (ball.phase === 'outgoing' && ball.progress >= 1) {
        const landX = ball.toX
        // A smack snips the shoot it lands on; a block is soft and the leaf just takes it.
        const trimmed = ball.grade ? pongShootHit(shoots, landX) : null
        if (trimmed && ball.grade) {
          shoots.splice(shoots.indexOf(trimmed), 1)
          regrowing.push(PONG_REGROW_SECONDS)
          events.push({ kind: 'trim', shoot: trimmed, grade: ball.grade })
        }
        sendIncoming(landX, events, 'batted')
      }
      return events
    },
  }
  return rally
}
