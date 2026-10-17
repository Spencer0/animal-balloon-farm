/**
 * The pure rules of bug breakout (the root vegetable's pest chore): the bugs
 * nibbling a vegetable's leaves sit in rows across the far end of its bed, and
 * you bounce a pebble off a hoe to squash them.
 *
 * - The hoe slides along the near edge (it follows the pointer, or the arrow
 *   keys). A pebble that hits it bounces off at an angle set by where it hit:
 *   the middle sends it straight up the bed, the ends send it out wide.
 * - The pebble bounces off the two sides and the far end. A bug it hits is
 *   squashed (a hit); a shelled beetle takes two.
 * - A pebble that gets past the hoe is lost (a heart), and a new one sits on
 *   the hoe until you launch it (a tap, or by itself after a moment).
 * - It gets a little faster with every bug squashed.
 *
 * The bed is a 2D field: x runs across it (-FIELD_HALF_WIDTH..FIELD_HALF_WIDTH),
 * y runs from the hoe's line (0) up to the far end (FIELD_DEPTH). Pure: no
 * Three.js and no DOM, tested in `tests/care-game-breakout.test.mjs`.
 */

export const BREAKOUT_HALF_WIDTH = 1.6
export const BREAKOUT_DEPTH = 2.7
export const BREAKOUT_BALL_RADIUS = 0.065
export const BREAKOUT_PADDLE_HALF = 0.3
/** The hoe's thickness (its blade, along y) and how far below the line the pebble counts as lost. */
export const BREAKOUT_PADDLE_DEPTH = 0.06
export const BREAKOUT_LOST_BELOW = -0.35
/** The pebble's speed, from launch, gaining a little per bug squashed up to the top speed. */
export const BREAKOUT_START_SPEED = 2.1
export const BREAKOUT_SPEED_PER_SQUASH = 0.09
export const BREAKOUT_TOP_SPEED = 3.5
/** The widest a hoe bounce can send the pebble, from straight up, in radians. */
export const BREAKOUT_MAX_BOUNCE = (62 * Math.PI) / 180
/** A pebble on the hoe launches by itself after this long. */
export const BREAKOUT_AUTO_LAUNCH = 1.6
/** How fast the hoe slides under the keys, in field units per second. */
export const BREAKOUT_KEY_SPEED = 3.4

export type BreakoutBugKind = 'grub' | 'beetle' | 'shell'

export interface BreakoutBug {
  readonly id: number
  readonly kind: BreakoutBugKind
  readonly x: number
  readonly y: number
  readonly halfWidth: number
  readonly halfHeight: number
  /** Hits it takes: two for a shelled beetle, one for the rest. */
  readonly toughness: number
}

/**
 * The bugs, row by row from the far end: a row of shelled beetles that take
 * two hits, a row of striped beetles, and a row of grubs nearest the hoe.
 */
export const BREAKOUT_ROWS: readonly { readonly kind: BreakoutBugKind; readonly count: number }[] = [
  { kind: 'shell', count: 4 },
  { kind: 'beetle', count: 5 },
  { kind: 'grub', count: 6 },
]
const ROW_TOP = BREAKOUT_DEPTH - 0.38
const ROW_GAP = 0.36
const BUG_HALF_HEIGHT = 0.12

/** The level's bugs, in a fixed layout, with stable ids. */
export function breakoutBugs(rows = BREAKOUT_ROWS): BreakoutBug[] {
  const bugs: BreakoutBug[] = []
  rows.forEach((row, rowIndex) => {
    const span = BREAKOUT_HALF_WIDTH * 2 - 0.36
    const step = span / row.count
    for (let column = 0; column < row.count; column += 1) {
      bugs.push({
        id: bugs.length,
        kind: row.kind,
        x: -span / 2 + step * (column + 0.5),
        y: ROW_TOP - rowIndex * ROW_GAP,
        halfWidth: Math.min(0.2, step / 2 - 0.04),
        halfHeight: BUG_HALF_HEIGHT,
        toughness: row.kind === 'shell' ? 2 : 1,
      })
    }
  })
  return bugs
}

/** The pebble's direction off the hoe: `offset` is where it hit, -1 (left end) to 1 (right end). */
export function breakoutBounce(offset: number): { readonly x: number; readonly y: number } {
  const angle = Math.max(-1, Math.min(1, offset)) * BREAKOUT_MAX_BOUNCE
  return { x: Math.sin(angle), y: Math.cos(angle) }
}

/** The pebble's speed after some bugs squashed. */
export function breakoutSpeed(squashed: number): number {
  return Math.min(BREAKOUT_TOP_SPEED, BREAKOUT_START_SPEED + squashed * BREAKOUT_SPEED_PER_SQUASH)
}

export type BreakoutEvent =
  | { readonly kind: 'launch' }
  | { readonly kind: 'paddle'; readonly offset: number }
  | { readonly kind: 'wall'; readonly x: number; readonly y: number }
  | { readonly kind: 'crack'; readonly bug: BreakoutBug }
  | { readonly kind: 'squash'; readonly bug: BreakoutBug }
  | { readonly kind: 'lost'; readonly x: number }

export interface BreakoutField {
  readonly bugs: readonly BreakoutBug[]
  /** Hits each bug has left (0 once squashed). */
  hitsLeft(bug: BreakoutBug): number
  readonly squashed: number
  readonly paddleX: number
  readonly ball: { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number }
  /** The pebble sits on the hoe, waiting for a launch. */
  readonly docked: boolean
  /** Slide the hoe toward a place across the bed (it is clamped to the bed). */
  setPaddleTarget(x: number): void
  /** Hold a key: -1 left, 1 right, 0 none. The keys win over the pointer while held. */
  setKeyDirection(direction: number): void
  launch(): BreakoutEvent[]
  step(deltaSeconds: number): BreakoutEvent[]
}

const SUBSTEP = 1 / 240
const PADDLE_LIMIT = BREAKOUT_HALF_WIDTH - BREAKOUT_PADDLE_HALF

export function createBreakoutField(bugs: readonly BreakoutBug[] = breakoutBugs()): BreakoutField {
  const hits = new Map(bugs.map((bug) => [bug.id, bug.toughness]))
  let squashed = 0
  let paddleX = 0
  let paddleTarget = 0
  let keyDirection = 0
  let docked = true
  let dockedFor = 0
  const ball = { x: 0, y: BREAKOUT_BALL_RADIUS + BREAKOUT_PADDLE_DEPTH, vx: 0, vy: 0 }

  function dock(): void {
    docked = true
    dockedFor = 0
    ball.vx = 0
    ball.vy = 0
    ball.x = paddleX
    ball.y = BREAKOUT_BALL_RADIUS + BREAKOUT_PADDLE_DEPTH
  }

  function launch(): BreakoutEvent[] {
    if (!docked) return []
    docked = false
    // A launch leaves a little to one side, so the first bounce is never a straight rally.
    const direction = breakoutBounce(paddleX >= 0 ? -0.22 : 0.22)
    const speed = breakoutSpeed(squashed)
    ball.vx = direction.x * speed
    ball.vy = direction.y * speed
    return [{ kind: 'launch' }]
  }

  /** The pebble meets a bug: bounce off the face it came through, and damage the bug. */
  function collideBugs(events: BreakoutEvent[]): void {
    for (const bug of bugs) {
      const left = hits.get(bug.id) ?? 0
      if (left <= 0) continue
      const dx = ball.x - bug.x
      const dy = ball.y - bug.y
      const overlapX = bug.halfWidth + BREAKOUT_BALL_RADIUS - Math.abs(dx)
      const overlapY = bug.halfHeight + BREAKOUT_BALL_RADIUS - Math.abs(dy)
      if (overlapX <= 0 || overlapY <= 0) continue
      if (overlapX < overlapY) {
        ball.vx = Math.sign(dx || 1) * Math.abs(ball.vx)
        ball.x += Math.sign(dx || 1) * overlapX
      } else {
        ball.vy = Math.sign(dy || 1) * Math.abs(ball.vy)
        ball.y += Math.sign(dy || 1) * overlapY
      }
      hits.set(bug.id, left - 1)
      if (left - 1 > 0) {
        events.push({ kind: 'crack', bug })
      } else {
        squashed += 1
        events.push({ kind: 'squash', bug })
        // Each squash quickens the pebble a little, keeping its direction.
        const speed = Math.hypot(ball.vx, ball.vy)
        const next = breakoutSpeed(squashed)
        if (speed > 0) {
          ball.vx *= next / speed
          ball.vy *= next / speed
        }
      }
      // One bug per substep keeps a corner hit from bouncing twice.
      return
    }
  }

  function stepOnce(dt: number, events: BreakoutEvent[]): void {
    if (keyDirection !== 0) paddleTarget = paddleX + keyDirection * BREAKOUT_KEY_SPEED * dt
    paddleX = Math.max(-PADDLE_LIMIT, Math.min(PADDLE_LIMIT, paddleTarget))
    if (docked) {
      ball.x = paddleX
      dockedFor += dt
      if (dockedFor >= BREAKOUT_AUTO_LAUNCH) events.push(...launch())
      return
    }
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt
    // The sides and the far end.
    const limitX = BREAKOUT_HALF_WIDTH - BREAKOUT_BALL_RADIUS
    if (ball.x < -limitX || ball.x > limitX) {
      ball.x = Math.max(-limitX, Math.min(limitX, ball.x))
      ball.vx = -ball.vx
      events.push({ kind: 'wall', x: ball.x, y: ball.y })
    }
    const limitY = BREAKOUT_DEPTH - BREAKOUT_BALL_RADIUS
    if (ball.y > limitY) {
      ball.y = limitY
      ball.vy = -Math.abs(ball.vy)
      events.push({ kind: 'wall', x: ball.x, y: ball.y })
    }
    // The hoe: only a pebble coming down onto its blade bounces.
    const paddleTop = BREAKOUT_PADDLE_DEPTH
    if (ball.vy < 0 && ball.y - BREAKOUT_BALL_RADIUS <= paddleTop && ball.y >= -BREAKOUT_PADDLE_DEPTH) {
      const offset = (ball.x - paddleX) / BREAKOUT_PADDLE_HALF
      if (Math.abs(offset) <= 1 + BREAKOUT_BALL_RADIUS / BREAKOUT_PADDLE_HALF) {
        const direction = breakoutBounce(offset)
        const speed = breakoutSpeed(squashed)
        ball.vx = direction.x * speed
        ball.vy = direction.y * speed
        ball.y = paddleTop + BREAKOUT_BALL_RADIUS
        events.push({ kind: 'paddle', offset: Math.max(-1, Math.min(1, offset)) })
      }
    }
    collideBugs(events)
    // A pebble that is far enough below the hoe's line is lost.
    if (ball.y < BREAKOUT_LOST_BELOW) {
      events.push({ kind: 'lost', x: ball.x })
      dock()
    }
  }

  return {
    bugs,
    hitsLeft: (bug) => hits.get(bug.id) ?? 0,
    get squashed() { return squashed },
    get paddleX() { return paddleX },
    get ball() { return { ...ball } },
    get docked() { return docked },
    setPaddleTarget(x): void {
      if (Number.isFinite(x)) paddleTarget = Math.max(-PADDLE_LIMIT, Math.min(PADDLE_LIMIT, x))
    },
    setKeyDirection(direction): void {
      keyDirection = Math.sign(direction)
    },
    launch,
    step(deltaSeconds): BreakoutEvent[] {
      const events: BreakoutEvent[] = []
      let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0
      while (remaining > 1e-9) {
        const dt = Math.min(SUBSTEP, remaining)
        remaining -= dt
        stepOnce(dt, events)
      }
      return events
    },
  }
}
