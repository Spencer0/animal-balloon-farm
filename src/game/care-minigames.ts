/**
 * The rules of the plant-care minigames: what each one asks, how long it
 * lasts, and when a round is won or lost.
 *
 *   rain  (water)  a rain cloud bobs over the plant; tap it before it drifts off
 *   swat  (pest)   beetles fly at the berries; swat them, spare the ladybugs
 *   snip  (prune)  wild leaves fly up out of the bush; slice them, not the berries
 *
 * The scenes (`src/scene/care-games/`) only report what happened (a hit, a
 * miss, a harm, a beetle that left); this module decides the outcome, so the
 * win and loss rules are tested in `tests/care-minigames.test.mjs` without a
 * browser. Pure: no Three.js and no DOM.
 */
import type { PlantCare } from './plants'

export type CareGameKind = 'rain' | 'swat' | 'snip'

export const CARE_GAME_FOR: Readonly<Record<PlantCare, CareGameKind>> = {
  water: 'rain',
  pest: 'swat',
  prune: 'snip',
}

export interface CareGameRules {
  /** Hits that win the round. */
  readonly goal: number
  /** Harms (a berry eaten or cut, a ladybug swatted) the round survives, minus one. */
  readonly hearts: number
  /** Misses (a leaf let fall) the round survives, minus one; 0 means misses never lose. */
  readonly misses: number
  /** The round is lost when this runs out. */
  readonly seconds: number
}

export const CARE_GAME_RULES: Readonly<Record<CareGameKind, CareGameRules>> = {
  // Six taps on a cloud that hops after every tap, a little faster each time.
  rain: { goal: 6, hearts: 0, misses: 0, seconds: 4.6 },
  // Eight beetles; three berries lost (or ladybugs swatted) and it is over.
  swat: { goal: 8, hearts: 3, misses: 0, seconds: 18 },
  // Twelve leaves; three dropped, or two berries cut, and it is over.
  snip: { goal: 12, hearts: 2, misses: 3, seconds: 22 },
}

export interface CareGameCopy {
  /** The one-word WarioWare-style command flashed before the round. */
  readonly command: string
  readonly goalLine: string
  readonly winLine: string
}

export const CARE_GAME_COPY: Readonly<Record<CareGameKind, CareGameCopy>> = {
  rain: { command: 'TAP!', goalLine: 'Tap the cloud six times before it drifts off.', winLine: 'What a downpour!' },
  swat: { command: 'SWAT!', goalLine: 'Swat the beetles before they eat three berries. Spare the ladybugs!', winLine: 'Not a beetle left!' },
  snip: { command: 'SNIP!', goalLine: 'Slice twelve wild leaves. Leave the berries alone!', winLine: 'Neat as a pin!' },
}

/** How long the command card shows before play starts, in seconds. */
export const CARE_GAME_INTRO_SECONDS = 1.15

export type CareRoundState = 'playing' | 'won' | 'lost'
export type CareLossReason = 'time' | 'hearts' | 'misses' | 'forfeit'

export interface CareRoundSnapshot {
  readonly kind: CareGameKind
  readonly state: CareRoundState
  readonly hits: number
  readonly goal: number
  /** Hearts left; the round is lost at zero. Zero hearts in the rules means none are shown. */
  readonly hearts: number
  readonly misses: number
  readonly timeLeft: number
  /** 0..1 of the round's time still to go. */
  readonly timeFraction: number
  readonly lossReason: CareLossReason | null
  /** The longest run of hits without a miss or harm between them. */
  readonly bestStreak: number
  readonly streak: number
}

export interface CareRound {
  readonly snapshot: CareRoundSnapshot
  /** Something was swatted, sliced or tapped. Returns the new streak. */
  hit(): number
  /** A swing that found nothing. Breaks the streak; never loses the round on its own. */
  whiff(): void
  /** A leaf fell unsliced. */
  miss(): void
  /** A berry was eaten or cut, or a ladybug swatted. */
  harm(): void
  /**
   * A target left play without being hit (a fed beetle flying off). The swat
   * round is won once every beetle is either swatted or gone and hearts remain.
   */
  release(): void
  tick(deltaSeconds: number): void
  forfeit(): void
}

export function createCareRound(kind: CareGameKind, rules: CareGameRules = CARE_GAME_RULES[kind]): CareRound {
  let state: CareRoundState = 'playing'
  let hits = 0
  let released = 0
  let hearts = rules.hearts
  let misses = 0
  let timeLeft = rules.seconds
  let lossReason: CareLossReason | null = null
  let streak = 0
  let bestStreak = 0

  function lose(reason: CareLossReason): void {
    if (state !== 'playing') return
    state = 'lost'
    lossReason = reason
  }

  function settle(): void {
    if (state !== 'playing') return
    if (rules.hearts > 0 && hearts <= 0) return lose('hearts')
    if (rules.misses > 0 && misses >= rules.misses) return lose('misses')
    // A swat round counts beetles that got away against the goal too: the
    // round is over once every one of them has been dealt with.
    if (hits >= rules.goal || (kind === 'swat' && hits + released >= rules.goal)) state = 'won'
  }

  return {
    get snapshot(): CareRoundSnapshot {
      return {
        kind, state, hits, goal: rules.goal, hearts, misses, timeLeft,
        timeFraction: rules.seconds > 0 ? Math.max(0, timeLeft) / rules.seconds : 0,
        lossReason, bestStreak, streak,
      }
    },
    hit(): number {
      if (state !== 'playing') return streak
      hits += 1
      streak += 1
      bestStreak = Math.max(bestStreak, streak)
      settle()
      return streak
    },
    whiff(): void {
      if (state === 'playing') streak = 0
    },
    miss(): void {
      if (state !== 'playing') return
      misses += 1
      streak = 0
      settle()
    },
    harm(): void {
      if (state !== 'playing') return
      hearts = Math.max(0, hearts - 1)
      streak = 0
      settle()
    },
    release(): void {
      if (state !== 'playing') return
      released += 1
      settle()
    },
    tick(deltaSeconds): void {
      if (state !== 'playing' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
      timeLeft = Math.max(0, timeLeft - deltaSeconds)
      if (timeLeft <= 0) lose('time')
    },
    forfeit(): void {
      lose('forfeit')
    },
  }
}

/** One line on why a round was lost, for the result card. */
export function lossLine(kind: CareGameKind, reason: CareLossReason | null): string {
  if (reason === 'forfeit') return 'Maybe later.'
  if (reason === 'time') return kind === 'rain' ? 'The cloud drifted off.' : 'Out of time!'
  if (reason === 'misses') return 'Too many leaves got away.'
  if (reason === 'hearts') return kind === 'swat' ? 'The beetles got the berries.' : 'Too many berries got sliced.'
  return 'So close!'
}
