/**
 * The first-plant tutorial: a glow trail, never a gate.
 *
 * Pure like the rest of `src/game/`: the scene reports what the player is
 * looking at, and `tutorialStep` says which thing should glow next. Nothing
 * here blocks input; the hints only point. The trail is stateless (derived
 * from the live UI and the farm), so there is no progress to save and no way
 * to get stuck on a step.
 */

export type TutorialStep =
  /** The shed is closed: glow the shed and nudge it with "Grow plants". */
  | 'open-shed'
  /** The shed is open on another tab: glow the Seeds tab. */
  | 'seeds-tab'
  /** The Seeds tab is showing: glow the seed to plant and its Plant button. */
  | 'pick-seed'
  /** A seed is in hand: the cursor is the guide, so only a quiet line of text. */
  | 'place-seed'
  /** Nothing left to teach. */
  | 'done'

export interface TutorialSignals {
  /** The farm is on screen and the player can act: no menu, film or intro over it. */
  readonly playable: boolean
  readonly shedOpen: boolean
  /** The shed's current tab id: "seeds" or "props". */
  readonly shedTab: string
  /** A seed is armed for planting. */
  readonly seedArmed: boolean
  /** Seeds held, all species. Without any, the shop is the lesson, not the shed. */
  readonly seedsHeld: number
  /** Plants standing in the garden right now. */
  readonly plantsStanding: number
  /** The first plant was placed on this device, ever. */
  readonly plantedBefore: boolean
}

export function tutorialStep(signals: TutorialSignals): TutorialStep {
  if (signals.plantedBefore || signals.plantsStanding > 0) return 'done'
  if (!signals.playable) return 'done'
  if (signals.seedArmed) return 'place-seed'
  if (signals.seedsHeld <= 0) return 'done'
  if (!signals.shedOpen) return 'open-shed'
  if (signals.shedTab !== 'seeds') return 'seeds-tab'
  return 'pick-seed'
}

/** How often the shed's text bubble reappears, and how long it stays. */
export const TUTORIAL_NUDGE_EVERY_SECONDS = 10
export const TUTORIAL_NUDGE_VISIBLE_SECONDS = 3.5

/** What the nudge says beside each glowing thing. */
export const TUTORIAL_TEXT: Readonly<Record<Exclude<TutorialStep, 'done'>, string>> = {
  'open-shed': 'Grow plants',
  'seeds-tab': 'Open Seeds',
  'pick-seed': 'Press Plant',
  'place-seed': 'Click the ground to plant',
}

/**
 * Whether the nudge bubble is showing `seconds` after the step began. It shows
 * a moment after the step starts (so it never flashes in on a transition),
 * then once every `TUTORIAL_NUDGE_EVERY_SECONDS`.
 */
export function nudgeVisible(seconds: number): boolean {
  if (seconds < 1) return false
  const phase = seconds % TUTORIAL_NUDGE_EVERY_SECONDS
  return phase < TUTORIAL_NUDGE_VISIBLE_SECONDS
}

/**
 * The seed the trail points at. Prefers a species named by the tutorial
 * (the newest plant to show off), then the first one held.
 */
export function tutorialSeed<T extends string>(held: readonly T[], preferred: readonly T[] = []): T | null {
  return preferred.find((id) => held.includes(id)) ?? held[0] ?? null
}
