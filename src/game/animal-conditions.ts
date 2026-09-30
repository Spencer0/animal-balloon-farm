/**
 * Animal conditions: the four-step arc every species climbs (SPEC §5.3).
 *
 *   0  undiscovered  nothing is known; the animal is not in the world
 *   1  carnival      it has turned up at the carnival          -> wild appearance
 *   2  farm          it has wandered into the farm              -> wild appearance
 *   3  resident      it has called the farm home               -> standard appearance
 *   4  breedable     it loves the farm and can breed           -> standard + heart eyes
 *
 * This module is deliberately pure: no Three.js, no DOM, no timers. The scene
 * reads it, the journal renders it, and the tests assert on it. That is what
 * lets the whole mechanic be verified without a browser.
 *
 * Progressive disclosure (the rule from SPEC §5.3 and the journal's stated
 * caveat in ANIMAL_PIPELINE.md): a stage's requirement is *hidden* until the
 * previous stage is reached. You never see what a creature needs to stay until
 * it has already visited.
 */

export type AnimalStage = 0 | 1 | 2 | 3 | 4

export const FIRST_STAGE = 1
export const LAST_STAGE = 4

/** One measurable thing the farm can be asked to provide. */
export type ConditionKind =
  | 'grassArea'
  | 'waterArea'
  | 'flatArea'
  | 'residentSpecies'

export interface ConditionRequirement {
  readonly kind: ConditionKind
  /** Square meters, for the area kinds. */
  readonly amount?: number
  /** Species id, for `residentSpecies`. */
  readonly species?: string
  /** Minimum grass maturity (0..1) for a patch to count toward `grassArea`. */
  readonly maturity?: number
}

/** Plain-language name for the habitat a numeric condition measures. */
export function conditionMetricLabel(requirement: ConditionRequirement | null): string | null {
  if (!requirement) return null
  switch (requirement.kind) {
    case 'grassArea': return 'Mature tall grass'
    case 'waterArea': return 'Visible pond water'
    case 'flatArea': return 'Level grassy pasture'
    case 'residentSpecies': return null
  }
}

export interface StageDefinition {
  readonly stage: AnimalStage
  /** Short journal label, e.g. "Call the farm home". */
  readonly title: string
  /** What the requirement is in plain language. */
  readonly hint: string
  /**
   * The single requirement for this stage, or null for stage 1 (simply turning
   * up at the carnival is its own condition and asks nothing of the player).
   */
  readonly requirement: ConditionRequirement | null
  /** Journal blurb describing the resulting state. */
  readonly result: string
}

export interface SpeciesConditions {
  /** Which stages the species climbs through, in order. */
  readonly stages: readonly StageDefinition[]
  /**
   * Species ids that must already be residents before this one can settle.
   * This is how the pig's dependency on a resident cow is expressed.
   */
  readonly requiresResident?: readonly string[]
}

/**
 * The canonical four-step ladder. Every species reuses these; only the numbers
 * and the companion requirement differ. Stage numbers are filled in by
 * `withStageNumbers` so the table below stays readable.
 */
const CARNIVAL: Omit<StageDefinition, 'stage'> = {
  title: 'Visit the carnival',
  hint: 'Wander up to the fairground and see what is going on.',
  requirement: null,
  result: 'Turns up at the carnival in wild balloon red.',
}

const ENTER_FARM = (hint: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Visit the farm',
  hint,
  requirement: null,
  result: 'Wanders inside the fence. Still wild, still deciding.',
})

const CALL_HOME = (kind: 'grassArea' | 'waterArea' | 'flatArea', amount: number, hint: string, maturity?: number): Omit<StageDefinition, 'stage'> => ({
  title: 'Call the farm home',
  hint,
  requirement: { kind, amount, maturity },
  result: 'Paints into its own colors. A resident of the farm.',
})

const LOVE_THE_FARM = (kind: 'grassArea' | 'waterArea' | 'flatArea', amount: number, hint: string, maturity?: number): Omit<StageDefinition, 'stage'> => ({
  title: 'Love the farm',
  hint,
  requirement: { kind, amount, maturity },
  result: 'Eyes go to hearts. Ready to court and breed.',
})

const REQUIRE_RESIDENT = (species: string, name: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Call the farm home',
  hint: `Likes what it sees here. Wants a ${name} already living on the farm.`,
  requirement: { kind: 'residentSpecies', species },
  result: 'Paints into its own colors. A resident of the farm.',
})

const SHARE_LIFE = (species: string, name: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Love the farm',
  hint: `Adores its ${name} friend. Likes the farm even more once company is around.`,
  requirement: { kind: 'residentSpecies', species },
  result: 'Eyes go to hearts. Ready to court and breed.',
})

function withStageNumbers(stages: readonly Omit<StageDefinition, 'stage'>[]): readonly StageDefinition[] {
  return stages.map((stage, index) => ({ ...stage, stage: (index + 1) as AnimalStage }))
}

/**
 * The test configuration the user asked for, and the shape the rest of the
 * catalog will grow into.
 *
 *  - Cow is the simple case: 15 m² of tall grass to call the farm home.
 *  - Pig depends on a resident cow, so a fresh plot cannot settle it.
 *  - Duck and goose want water; sheep wants flat, open ground.
 */
export const SPECIES_CONDITIONS: Readonly<Record<string, SpeciesConditions>> = {
  cow: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Likes the look of the open plot, and comes over the fence to investigate.'),
      CALL_HOME('grassArea', 15, 'Wants a good stretch of tall grass to lie in.', 0.75),
      LOVE_THE_FARM('grassArea', 30, 'Wants a bigger meadow than the one that settled it — twice the grass.', 0.75),
    ]),
  },
  pig: {
    requiresResident: ['cow'],
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Sniffs its way in through the gate and starts turning up soil.'),
      REQUIRE_RESIDENT('cow', 'Cow'),
      SHARE_LIFE('cow', 'Cow'),
    ]),
  },
  sheep: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Prefers gentle, open ground and comes in to graze.'),
      CALL_HOME('flatArea', 12, 'Wants a flat, level patch to rest on.', 0.75),
      LOVE_THE_FARM('grassArea', 24, 'Wants proper pasture — enough tall grass to be content.', 0.75),
    ]),
  },
  chicken: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Pokes its head over the fence and comes scrabbling in.'),
      CALL_HOME('grassArea', 6, 'Wants a small grassy corner to scratch about in.', 0.75),
      LOVE_THE_FARM('grassArea', 12, 'Wants company and a bit more lawn to range over.', 0.75),
    ]),
  },
  duck: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Heads straight for the low ground and paddles in.'),
      CALL_HOME('waterArea', 8, 'Wants a proper pool to swim in, not just damp soil.', 0.75),
      LOVE_THE_FARM('waterArea', 16, 'Wants a bigger pond and plenty of grass at the waterline.', 0.75),
    ]),
  },
  goose: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Waddles in from the tents, inspecting everything.'),
      CALL_HOME('waterArea', 10, 'Wants a deep enough pond to float on.', 0.75),
      LOVE_THE_FARM('waterArea', 20, 'Wants a proper stretch of water to patrol.', 0.75),
    ]),
  },
}

/** Species that begin the game already turned up at the carnival. */
export const CARNIVAL_STARTERS: readonly string[] = ['cow', 'sheep', 'chicken', 'duck']

/**
 * How a species that did not start at the carnival first gets noticed.
 *
 * Without this a species at stage 0 is stuck forever, and a condition the
 * player can never satisfy is the same as a hidden one. Each entry says what
 * the farm has to look like before that species wanders up to the tents.
 */
export const DISCOVERY: Readonly<Record<string, ConditionRequirement & { readonly description: string }>> = {
  pig: { kind: 'grassArea', amount: 8, description: 'A patch of grass catches the eye of something rooting around.' },
  goose: { kind: 'waterArea', amount: 5, description: 'Water somewhere on the farm draws the waddlers over.' },
}

export function getSpeciesConditions(species: string): readonly StageDefinition[] {
  return SPECIES_CONDITIONS[species]?.stages ?? withStageNumbers([CARNIVAL, ENTER_FARM('Comes in to look around.'), CALL_HOME('grassArea', 15, 'Wants a meadow.', 0.75), LOVE_THE_FARM('grassArea', 30, 'Wants more meadow.', 0.75)])
}

export function stageCount(species: string): number {
  return getSpeciesConditions(species).length
}

export function stageDefinition(species: string, stage: AnimalStage): StageDefinition | null {
  return getSpeciesConditions(species).find((entry) => entry.stage === stage) ?? null
}

export function stageTitle(species: string, stage: AnimalStage): string {
  return stageDefinition(species, stage)?.title ?? 'Unknown'
}

/** The wild look covers stages 1-2; standard covers 3-4. */
export function stageAppearance(stage: AnimalStage): 'wild' | 'standard' {
  return stage <= 2 ? 'wild' : 'standard'
}

/** Only the final stage wears hearts. */
export function stageHasHeartEyes(stage: AnimalStage): boolean {
  return stage >= 4
}
