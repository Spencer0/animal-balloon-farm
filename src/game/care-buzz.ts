/**
 * The bee's flight in the buzz care minigame (flower type, water chore): tap to
 * flap the bee through the stem gaps on its way to the flower. Pure: no
 * Three.js and no DOM, so the physics, gap plan and bonk rules are tested in
 * `tests/care-game-buzz.test.mjs`. The scene (`src/scene/care-games/buzz-game.ts`)
 * draws what this module decides.
 *
 * Units are world units on the stage's z = 0 plane. The view (left edge, width
 * and top of the screen on that plane) comes from the scene each step, so the
 * course paces the same on a phone and a desktop: a fixed share of the screen
 * per second, with stems a fixed share of the screen apart.
 */
import { CARE_GAME_RULES } from './care-minigames'

export const BUZZ = {
  /** Strong gravity. A flap sets the upward speed at once, it does not add to it. */
  gravity: 4.4,
  flapSpeed: 1.3,
  /** Terminal fall speed, so a long drop still reads as a fall and not a teleport. */
  maxFall: 2.2,
  /** The bee's hitbox radius. Smaller than its silhouette, so near misses are forgiven. */
  beeRadius: 0.065,
  /** The lowest the bee's centre can go: its dewdrop touches the lawn here. */
  floor: 0.2,
  /** Upward speed after a bonk on a stem's lower half or the lawn, and downward after one on the upper half. */
  bounceLow: 0.9,
  bounceHigh: -0.8,
  stemHalfWidth: 0.06,
  /** How long the bee blinks, invulnerable, after a bonk. */
  blinkSeconds: 1,
  /** The bee's screen position: this share of the view from its left edge. */
  beeAtWidth: 0.3,
  /** One view width per this many seconds. */
  crossSeconds: 3.6,
  /** Stem pairs this many view widths apart. */
  spacingWidths: 0.6,
  /** New stems enter this far beyond the right edge, and are dropped this far beyond the left. */
  spawnBeyond: 0.2,
  despawnBeyond: 0.4,
  /** The ceiling is soft: the bee is held under it, with no harm. */
  ceilingMargin: 0.12,
  /** The first gaps are wide and level, so nobody bonks in the first seconds. */
  wideGaps: 2,
  wideGap: 0.9,
  level: 0.55,
  /** Gap sizes narrow from `widestGap` to `narrowestGap` across the course. */
  widestGap: 0.72,
  narrowestGap: 0.58,
  lowestCentre: 0.42,
  highestCentre: 0.9,
  /** The most a gap's centre can move from the one before it. */
  maxStep: 0.22,
} as const

export interface BeeState {
  /** The bee's centre height. */
  readonly y: number
  /** Vertical speed, up is positive. */
  readonly vy: number
}

/** A tap: the bee's upward speed is set at once. */
export function flapBee(bee: BeeState): BeeState {
  return { y: bee.y, vy: BUZZ.flapSpeed }
}

/** Gravity, with a fall speed cap, then the move (semi-implicit Euler). */
export function stepBee(bee: BeeState, dt: number): BeeState {
  const vy = Math.max(-BUZZ.maxFall, bee.vy - BUZZ.gravity * dt)
  return { y: bee.y + vy * dt, vy }
}

/** How far the bee's nose tips: up on a flap, down as it falls. Radians about Z. */
export function flapTilt(vy: number): number {
  return Math.min(0.5, Math.max(-0.95, vy * 0.28))
}

/** One gap in a stem pair: its centre height and size, and where its edges are. */
export interface BuzzGap {
  readonly index: number
  readonly centre: number
  readonly size: number
  readonly bottom: number
  readonly top: number
}

/**
 * The gap for the stem pair with this index. The first two are wide and level.
 * After them the size narrows, and the centre wanders by at most `maxStep`,
 * kept inside the playfield.
 */
export function buzzGap(index: number, previousCentre: number, random: () => number): BuzzGap {
  const narrowing = Math.min(1, Math.max(0, (index - 1) / 6))
  const size = index < BUZZ.wideGaps ? BUZZ.wideGap : BUZZ.widestGap + (BUZZ.narrowestGap - BUZZ.widestGap) * narrowing
  const centre = index < BUZZ.wideGaps
    ? BUZZ.level
    : Math.min(BUZZ.highestCentre, Math.max(BUZZ.lowestCentre, previousCentre + (random() * 2 - 1) * BUZZ.maxStep))
  return { index, centre, size, bottom: centre - size / 2, top: centre + size / 2 }
}

export interface BuzzStem {
  readonly index: number
  /** Where the stem pair stands on the z = 0 plane. */
  x: number
  readonly gap: BuzzGap
  /** The bee has touched this pair: it cannot score it. */
  touched: boolean
  /** The bee has flown past it clean: it scored. */
  cleared: boolean
}

export interface BuzzRun {
  bee: BeeState
  stems: BuzzStem[]
  /** Stem pairs made so far; the course ends when it reaches the goal. */
  spawned: number
  lastCentre: number
  /** Seconds of blink-invulnerability left after a bonk. */
  invulnerable: number
  bonks: number
  cleared: number
}

export function createBuzzRun(): BuzzRun {
  return { bee: { y: BUZZ.level, vy: 0 }, stems: [], spawned: 0, lastCentre: BUZZ.level, invulnerable: 0, bonks: 0, cleared: 0 }
}

/** The screen on the z = 0 plane: its left edge, its width, and its top edge. */
export interface BuzzView {
  readonly left: number
  readonly width: number
  readonly top: number
}

/** The bee's world x for a view. */
export function beeX(view: BuzzView): number {
  return view.left + view.width * BUZZ.beeAtWidth
}

/** Which half of a stem pair the bee's hitbox touches, or null for clear air. */
export function stemContact(bee: { x: number; y: number }, stem: { x: number; gap: BuzzGap }): 'low' | 'high' | null {
  if (Math.abs(bee.x - stem.x) >= BUZZ.stemHalfWidth + BUZZ.beeRadius) return null
  if (bee.y - BUZZ.beeRadius < stem.gap.bottom) return 'low'
  if (bee.y + BUZZ.beeRadius > stem.gap.top) return 'high'
  return null
}

export interface BuzzStepResult {
  /** Stem pairs the bee flew past clean this step. */
  readonly cleared: readonly BuzzStem[]
  /** A bonk this step: a stem, or the lawn. Null when there was none (or the bee was blinking). */
  readonly bonk: 'stem' | 'floor' | null
  /** The stem pair made this step, if any. */
  readonly spawned: BuzzStem | null
}

/**
 * One step of the flight: the bee flaps (if asked) and falls, the course
 * scrolls and gains stems, and contacts are checked. Mutates `run`, which
 * the scene keeps across steps. `dt` should be at most a frame's worth.
 */
export function stepBuzz(run: BuzzRun, dt: number, view: BuzzView, flap: boolean, random: () => number, goal: number = CARE_GAME_RULES.buzz.goal): BuzzStepResult {
  const cleared: BuzzStem[] = []
  let bonk: 'stem' | 'floor' | null = null
  let spawned: BuzzStem | null = null
  run.invulnerable = Math.max(0, run.invulnerable - dt)

  if (flap) run.bee = flapBee(run.bee)
  run.bee = stepBee(run.bee, dt)
  const ceiling = view.top - BUZZ.ceilingMargin
  if (run.bee.y > ceiling) run.bee = { y: ceiling, vy: Math.min(0, run.bee.vy) }

  const speed = view.width / BUZZ.crossSeconds
  for (const stem of run.stems) stem.x -= speed * dt

  const right = view.left + view.width + BUZZ.spawnBeyond
  const last = run.stems[run.stems.length - 1]
  if (run.spawned < goal && (!last || last.x <= right - view.width * BUZZ.spacingWidths)) {
    const gap = buzzGap(run.spawned, run.lastCentre, random)
    run.lastCentre = gap.centre
    spawned = { index: run.spawned, x: right, gap, touched: false, cleared: false }
    run.stems.push(spawned)
    run.spawned += 1
  }
  run.stems = run.stems.filter((stem) => stem.x > view.left - BUZZ.despawnBeyond)

  const x = beeX(view)
  for (const stem of run.stems) {
    const contact = stemContact({ x, y: run.bee.y }, stem)
    if (contact && !stem.touched) {
      stem.touched = true
      if (run.invulnerable <= 0 && bonk === null) {
        bonk = 'stem'
        run.bonks += 1
        run.invulnerable = BUZZ.blinkSeconds
        run.bee = { y: run.bee.y, vy: contact === 'low' ? BUZZ.bounceLow : BUZZ.bounceHigh }
      }
    }
    if (!stem.cleared && !stem.touched && stem.x < x) {
      stem.cleared = true
      run.cleared += 1
      cleared.push(stem)
    }
  }

  if (run.bee.y < BUZZ.floor) {
    run.bee = { y: BUZZ.floor, vy: BUZZ.bounceLow }
    if (run.invulnerable <= 0 && bonk === null) {
      bonk = 'floor'
      run.bonks += 1
      run.invulnerable = BUZZ.blinkSeconds
    }
  }

  return { cleared, bonk, spawned }
}

/** The chime's pitch for a streak: two semitones up per clear, capped at a ninth clear. */
export function chimePitch(streak: number): number {
  return 2 ** ((Math.min(9, Math.max(1, streak)) - 1) * 2 / 12)
}
