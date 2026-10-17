/**
 * The pure rules of trim pong (the root vegetable's prune chore): table tennis
 * against the vegetable's own overgrown top. You hold a trowel at the near end
 * of a potting bench; the vegetable stands at the far end with a few wild
 * shoots sticking up out of its leaves.
 *
 * - The leaves bat a pea at you. Swing (tap) as it reaches your trowel: the
 *   trowel finds the pea on its own, so a swing is all timing.
 * - Where you tap aims the return, across the far end of the bench. A pea that
 *   arrives on a wild shoot snips it off (a hit); anywhere else the leaves just
 *   bat it back.
 * - Swing too early and you whiff; let it past and it is a heart.
 * - The closer to the sweet spot you swing, the straighter and faster the
 *   return: a perfect swing goes exactly where you aimed and trims a wider
 *   strip, a late or early one wanders a little.
 *
 * Positions across the bench run -1 (left) to 1 (right). A flight's progress
 * runs 0 at the end it left from to 1 at the end it is going to. Pure: no
 * Three.js and no DOM, tested in `tests/care-game-pong.test.mjs`.
 */

/** Seconds the first pea takes to reach you; each rally after is a little quicker, down to the floor. */
export const PONG_FIRST_FLIGHT = 1.45
export const PONG_FLIGHT_STEP = 0.05
export const PONG_FASTEST_FLIGHT = 0.82
/** Where along an incoming flight the swing window opens, its sweet spot, and where the pea is past you. */
export const PONG_HIT_FROM = 0.8
export const PONG_SWEET = 0.97
export const PONG_PAST = 1.1
/** How far from the sweet spot a swing still counts as perfect, or good. Anything else in the window is ok. */
export const PONG_PERFECT_WITHIN = 0.045
export const PONG_GOOD_WITHIN = 0.1
/** A whiffed swing has to come back before the next one. */
export const PONG_SWING_COOLDOWN = 0.28
/** How far a return wanders from the aim, at most, for each grade. */
export const PONG_WANDER = { perfect: 0, good: 0.1, ok: 0.24 } as const
/** A return's flight time, as a share of the rally's incoming flight time. */
export const PONG_RETURN_SHARE = { perfect: 0.62, good: 0.78, ok: 0.9 } as const
/** Half the width of a shoot, as a target; a perfect smash trims a wider strip. */
export const PONG_SHOOT_HALF = 0.15
export const PONG_SMASH_REACH = 0.08
/** How many wild shoots stand at once, the lanes they grow in, and how long a trimmed one takes to regrow. */
export const PONG_SHOOTS_AT_ONCE = 3
export const PONG_SHOOT_LANES: readonly number[] = [-0.72, -0.36, 0, 0.36, 0.72]
export const PONG_REGROW_SECONDS = 1.1
/** The pause before a new serve, after a pea got past. */
export const PONG_SERVE_PAUSE = 0.9
/** Where a serve or a return from the leaves can land on your side, at most. */
export const PONG_NEAR_SPREAD = 0.75

export type PongGrade = 'perfect' | 'good' | 'ok'

export type PongBallPhase = 'serve' | 'incoming' | 'outgoing' | 'past'

export interface PongShoot {
  readonly id: number
  readonly x: number
}

export type PongEvent =
  | { readonly kind: 'serve'; readonly fromX: number; readonly toX: number }
  | { readonly kind: 'swing'; readonly grade: PongGrade; readonly atX: number; readonly toX: number }
  | { readonly kind: 'whiff' }
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
  /** The grade of the swing that sent an outgoing pea, or null. */
  readonly grade: PongGrade | null
}

export interface PongRally {
  readonly ball: PongBall
  /** The pea's place across the bench now. */
  readonly ballX: number
  readonly shoots: readonly PongShoot[]
  /** Rallies returned so far; each one quickens the next flight. */
  readonly rallies: number
  /** Seconds the trowel still needs before it can swing again. */
  readonly cooldown: number
  /**
   * Swing, aiming at a place across the far end (-1..1). In the window it
   * returns the pea; outside it, it whiffs.
   */
  swing(aimX: number): PongEvent[]
  step(deltaSeconds: number): PongEvent[]
}

/** How a swing at an incoming pea's progress is graded, or null outside the window. */
export function pongGrade(progress: number): PongGrade | null {
  if (progress < PONG_HIT_FROM || progress > PONG_PAST) return null
  const off = Math.abs(progress - PONG_SWEET)
  if (off <= PONG_PERFECT_WITHIN) return 'perfect'
  if (off <= PONG_GOOD_WITHIN) return 'good'
  return 'ok'
}

/** The incoming flight time after a number of returned rallies. */
export function pongFlight(rallies: number): number {
  return Math.max(PONG_FASTEST_FLIGHT, PONG_FIRST_FLIGHT - rallies * PONG_FLIGHT_STEP)
}

/** The shoot an arriving pea trims, if any: the nearest within reach of where it lands. */
export function pongShootHit(shoots: readonly PongShoot[], landX: number, grade: PongGrade): PongShoot | null {
  const reach = PONG_SHOOT_HALF + (grade === 'perfect' ? PONG_SMASH_REACH : 0)
  let best: PongShoot | null = null
  let bestDistance = reach
  for (const shoot of shoots) {
    const distance = Math.abs(shoot.x - landX)
    if (distance <= bestDistance) {
      best = shoot
      bestDistance = distance
    }
  }
  return best
}

const clampX = (x: number): number => Math.max(-1, Math.min(1, x))

export function createPongRally(random: () => number = Math.random): PongRally {
  let nextShootId = 0
  const shoots: PongShoot[] = []
  /** Lanes whose shoot was trimmed, and seconds until each grows back. */
  const regrowing: number[] = []
  let rallies = 0
  let cooldown = 0
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

  /** The leaves send a pea at you from where it is. */
  function sendIncoming(fromX: number, events: PongEvent[], kind: 'serve' | 'batted'): void {
    const toX = clampX((random() * 2 - 1) * PONG_NEAR_SPREAD)
    ball = { phase: 'incoming', fromX, toX, progress: 0, flightSeconds: pongFlight(rallies), grade: null }
    events.push(kind === 'serve' ? { kind: 'serve', fromX, toX } : { kind: 'batted', atX: fromX, toX })
  }

  const ballX = (): number => {
    if (ball.phase === 'serve') return ball.fromX
    const t = Math.min(1, ball.progress)
    return ball.fromX + (ball.toX - ball.fromX) * t
  }

  const rally: PongRally = {
    get ball(): PongBall { return { ...ball } },
    get ballX() { return ballX() },
    get shoots() { return [...shoots] },
    get rallies() { return rallies },
    get cooldown() { return cooldown },
    swing(aimX): PongEvent[] {
      if (cooldown > 0) return []
      const grade = ball.phase === 'incoming' ? pongGrade(ball.progress) : null
      if (!grade) {
        cooldown = PONG_SWING_COOLDOWN
        return [{ kind: 'whiff' }]
      }
      const atX = ballX()
      // A perfect swing goes exactly where it was aimed; a worse one wanders by up to its grade's amount.
      const wander = PONG_WANDER[grade] * (random() * 2 - 1)
      const toX = clampX(aimX + wander)
      ball = { phase: 'outgoing', fromX: atX, toX, progress: 0, flightSeconds: pongFlight(rallies) * PONG_RETURN_SHARE[grade], grade }
      rallies += 1
      cooldown = 0
      return [{ kind: 'swing', grade, atX, toX }]
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
      if (ball.phase === 'incoming' && ball.progress > PONG_PAST) {
        events.push({ kind: 'past', atX: ball.toX })
        ball = { phase: 'past', fromX: ball.toX, toX: ball.toX, progress: 0, flightSeconds: PONG_SERVE_PAUSE, grade: null }
        rallies = Math.max(0, rallies - 2)
      } else if (ball.phase === 'past') {
        if (ball.progress >= 1) {
          ball = { phase: 'serve', fromX: 0, toX: 0, progress: 0, flightSeconds: 0.01, grade: null }
        }
      } else if (ball.phase === 'outgoing' && ball.progress >= 1) {
        const landX = ball.toX
        const grade = ball.grade ?? 'ok'
        const trimmed = pongShootHit(shoots, landX, grade)
        if (trimmed) {
          shoots.splice(shoots.indexOf(trimmed), 1)
          regrowing.push(PONG_REGROW_SECONDS)
          events.push({ kind: 'trim', shoot: trimmed, grade })
        }
        sendIncoming(landX, events, 'batted')
      }
      return events
    },
  }
  return rally
}
