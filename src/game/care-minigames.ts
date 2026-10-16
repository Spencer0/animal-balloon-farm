/**
 * The rules of the plant-care minigames: what each one asks, how long it
 * lasts, and when a round is won or lost.
 *
 * Every plant type has its own three games, one per chore (`CARE_GAMES`):
 *
 *   bush   rain  (water)  a rain cloud bobs over the plant; tap it before it drifts off
 *          swat  (pest)   beetles fly at the berries; swat them, spare the ladybugs
 *          snip  (prune)  wild leaves fly up out of the bush; slice them, not the berries
 *   flower buzz (water)   a bee carries a dewdrop through the stem gaps; flap, don't bonk
 *          hop   (pest)   a ladybug auto-runs past the aphids; jump the thorns
 *          chop  (prune)  a spent stalk falls past the shears; cut it on the dashed line
 *   water  skim (water)   a dragonfly climbs and sinks over the pond; catch the dew
 *          paddle (pest) a frog swims up the stream in lanes; snap the mosquitoes
 *          rope  (prune)  the lily's runner whips round the pad; hop each pass
 *
 * The scenes (`src/scene/care-games/`) only report what happened (a hit, a
 * miss, a harm, a beetle that left); this module decides the outcome, so the
 * win and loss rules are tested in `tests/care-minigames.test.mjs` without a
 * browser. Pure: no Three.js and no DOM.
 */
import { plantSpecies, type PlantCare, type PlantId, type PlantType } from './plants'

/** Every close-up or farm-side care game. */
export type CareGameKind = 'rain' | 'swat' | 'snip' | 'buzz' | 'hop' | 'chop' | 'skim' | 'paddle' | 'rope'

export const CARE_GAME_KINDS: readonly CareGameKind[] = ['rain', 'swat', 'snip', 'buzz', 'hop', 'chop', 'skim', 'paddle', 'rope']

/** Which game answers each chore, for each plant type. */
export const CARE_GAMES: Readonly<Record<PlantType, Readonly<Record<PlantCare, CareGameKind>>>> = {
  bush: { water: 'rain', pest: 'swat', prune: 'snip' },
  flower: { water: 'buzz', pest: 'hop', prune: 'chop' },
  water: { water: 'skim', pest: 'paddle', prune: 'rope' },
}

/** The game a species plays for one of its chores. */
export function careGameFor(species: PlantId, care: PlantCare): CareGameKind {
  return CARE_GAMES[plantSpecies(species).careType][care]
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
  // Eight gaps; two bonks and the bee is done.
  buzz: { goal: 8, hearts: 2, misses: 0, seconds: 24 },
  // Twelve aphids eaten on the run; two thorns and it is over.
  hop: { goal: 12, hearts: 2, misses: 0, seconds: 22 },
  // Three rounds of falling stalks, one hit per round played; the score decides the pass (see care-chop.ts).
  chop: { goal: 3, hearts: 0, misses: 0, seconds: 55 },
  // Eighteen dewdrops; three knocks and the dragonfly is out.
  skim: { goal: 18, hearts: 3, misses: 0, seconds: 24 },
  // Twelve mosquitoes; three snags or logs and the frog is out.
  paddle: { goal: 12, hearts: 3, misses: 0, seconds: 22 },
  // Ten passes skipped; two caught and the frog is out.
  rope: { goal: 10, hearts: 2, misses: 0, seconds: 22 },
}

export interface CareGameCopy {
  /** The one-word WarioWare-style command flashed before the round. */
  readonly command: string
  readonly goalLine: string
  readonly winLine: string
  /** What the game is for, in the middle of a sentence: "Pip now stocks ... does the bee run". */
  readonly chore: string
}

export const CARE_GAME_COPY: Readonly<Record<CareGameKind, CareGameCopy>> = {
  rain: { command: 'TAP!', goalLine: 'Tap the cloud six times before it drifts off.', winLine: 'What a downpour!', chore: 'the rain cloud' },
  swat: { command: 'SWAT!', goalLine: 'Swat the beetles before they eat three berries. Spare the ladybugs!', winLine: 'Not a beetle left!', chore: 'the beetle swat' },
  snip: { command: 'SNIP!', goalLine: 'Slice twelve wild leaves. Leave the berries alone!', winLine: 'Neat as a pin!', chore: 'the snipping' },
  buzz: { command: 'FLAP!', goalLine: 'Flap the bee through eight gaps. Bonk a stem and you lose a heart.', winLine: 'Dewdrop delivered!', chore: 'the bee run' },
  hop: { command: 'JUMP!', goalLine: 'Eat twelve aphids on the run. Jump the thorns and burrs!', winLine: 'Every aphid gobbled!', chore: 'the ladybug run' },
  chop: { command: 'CUT!', goalLine: 'Tap as the orange band hits the blade line. Closer scores more, too early scores zero. Three rounds: score big to pass!', winLine: 'Clean as a whistle!', chore: 'the stalk chop' },
  skim: { command: 'HOLD!', goalLine: 'Hold to climb through the dewdrops. Dodge the cattails, fish and fluff!', winLine: 'The lily drinks it all!', chore: 'the dragonfly skim' },
  paddle: { command: 'SWIPE!', goalLine: 'Swipe or tap a side to change lanes, up to hop a log. Snap twelve mosquitoes!', winLine: 'Tongue-tastic!', chore: 'the frog paddle' },
  rope: { command: 'JUMP!', goalLine: 'Hop each sweep of the runner. Ten passes, and do not get caught!', winLine: 'Nothing tripped the frog!', chore: 'the lily skip' },
}

/** How long the command card shows before play starts, in seconds. */
export const CARE_GAME_INTRO_SECONDS = 1.15

export type CareRoundState = 'playing' | 'won' | 'lost'
export type CareLossReason = 'time' | 'hearts' | 'misses' | 'forfeit' | 'score'

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
  /** End the round as lost for a reason the rules above do not track (the chop's score too low). */
  fail(reason: CareLossReason): void
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
    fail(reason): void {
      lose(reason)
    },
    forfeit(): void {
      lose('forfeit')
    },
  }
}

/** Why each game can be lost, one line per reason. Anything not listed reads "So close!". */
const LOSS_LINES: Readonly<Record<CareGameKind, Readonly<Partial<Record<CareLossReason, string>>>>> = {
  rain: { time: 'The cloud drifted off.' },
  swat: { time: 'Out of time!', hearts: 'The beetles got the berries.' },
  snip: { time: 'Out of time!', misses: 'Too many leaves got away.', hearts: 'Too many berries got sliced.' },
  buzz: { time: 'The bee ran out of puff.', hearts: 'The bee bonked too often.' },
  hop: { time: 'Out of time!', hearts: 'Too many thorns caught the ladybug.' },
  chop: { time: 'Out of time!', score: 'Not enough points to pass. Cut closer to the line!' },
  skim: { time: 'Out of time!', hearts: 'The dragonfly got knocked out of the air.' },
  paddle: { time: 'Out of time!', hearts: 'The frog got snagged too often.' },
  rope: { time: 'Out of time!', hearts: 'The runner caught the frog.' },
}

/** One line on why a round was lost, for the result card. */
export function lossLine(kind: CareGameKind, reason: CareLossReason | null): string {
  if (reason === 'forfeit') return 'Maybe later.'
  if (reason === null) return 'So close!'
  return LOSS_LINES[kind][reason] ?? 'So close!'
}
