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

// The plant catalog is pure data with no renderer and no DOM, so reading a
// plant's name from here keeps the journal's wording in step with the seedbox.
import { PLANT_CATALOG } from './plants'

export type AnimalStage = 0 | 1 | 2 | 3 | 4

export const FIRST_STAGE = 1
export const LAST_STAGE = 4

/** One measurable thing the farm can be asked to provide. */
export type ConditionKind =
  | 'grassArea'
  | 'waterArea'
  | 'flatArea'
  | 'residentSpecies'
  | 'plantCount'
  /** How many adults of a species are residents right now, e.g. three chickens. */
  | 'residentCount'
  /** How many of a prey species have been eaten on this farm, in total. */
  | 'preyEaten'
  /** How many of a shop prop the player has placed, e.g. an oak tree. */
  | 'propCount'

export interface ConditionRequirement {
  readonly kind: ConditionKind
  /** Square meters for the area kinds; a whole number of plants for `plantCount`. */
  readonly amount?: number
  /** Animal species id for `residentSpecies`, plant species id for `plantCount`. */
  readonly species?: string
  /** Minimum grass maturity (0..1) for a patch to count toward `grassArea`. */
  readonly maturity?: number
  /**
   * Further requirements that must hold at the same time. A stage still has one
   * headline number for the journal, but a few species need two things at once
   * (the owl stays for eaten chickens *and* an oak to roost in).
   */
  readonly and?: readonly ConditionRequirement[]
}

/**
 * How a plant is described in the journal when a condition counts it.
 *
 * Keyed by plant id and falling back to the catalog's own name, so a new plant
 * gets a readable label without anyone remembering to come back here.
 */
const PLANT_METRIC_LABELS: Readonly<Record<string, string>> = {
  'water-lily': 'Lily pads in the pond',
  clover: 'Clover patches',
  dandelion: 'Dandelion patches',
}

function plantMetricLabel(plantId: string): string {
  const known = PLANT_METRIC_LABELS[plantId]
  if (known) return known
  const species = PLANT_CATALOG.find((entry) => entry.id === plantId)
  return species ? `${species.name} beds` : 'Plants in the ground'
}

/** Plain-language name for the habitat a numeric condition measures. */
export function conditionMetricLabel(requirement: ConditionRequirement | null): string | null {
  if (!requirement) return null
  switch (requirement.kind) {
    case 'grassArea': return 'Mature tall grass'
    case 'waterArea': return 'Visible pond water'
    case 'flatArea': return 'Level grassy pasture'
    case 'plantCount': return requirement.species ? plantMetricLabel(requirement.species) : null
    case 'residentCount': return requirement.species ? `Resident ${speciesPlural(requirement.species)}` : null
    case 'preyEaten': return requirement.species ? `${capitalise(speciesPlural(requirement.species))} eaten` : null
    case 'propCount': return requirement.species ? `${capitalise(propPlural(requirement.species))} on the farm` : null
    case 'residentSpecies': return null
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function speciesPlural(species: string): string {
  return species === 'sheep' ? 'sheep' : species === 'goose' ? 'geese' : `${species}s`
}

const PROP_PLURALS: Readonly<Record<string, string>> = {
  oak: 'oak trees',
  coop: 'chicken coops',
  barn: 'small barns',
  'garbage-can': 'garbage cans',
}

function propPlural(prop: string): string {
  return PROP_PLURALS[prop] ?? `${prop}s`
}

/** True for the kinds that are a whole number of things rather than square meters. */
export function isCountKind(kind: ConditionKind | undefined): boolean {
  return kind === 'plantCount' || kind === 'residentCount' || kind === 'preyEaten' || kind === 'propCount'
}

/**
 * The unit a metric is written in.
 *
 * The land kinds are areas and take square meters; a `plantCount` is a number
 * of plants and takes no unit at all. "5.0 / 2 m²" of lily pads is nonsense,
 * and the journal is exactly where a player would read it.
 */
export function conditionMetricUnit(requirement: ConditionRequirement | null): string {
  return isCountKind(requirement?.kind) ? '' : ' m²'
}

/**
 * A metric's current value at a precision that suits it: whole plants, one
 * decimal of square meter.
 */
export function formatConditionMetric(requirement: ConditionRequirement | null, value: number): string {
  return isCountKind(requirement?.kind) ? value.toFixed(0) : value.toFixed(1)
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

/**
 * Conditions answered by plants rather than by land.
 *
 * A `plantCount` is a habitat the player *builds* one plant at a time, and only
 * grown-up plants count — the same maturity bargain `grassArea` strikes. The
 * usual chain is therefore implied rather than stated: a water lily can only be
 * planted in visible pond water, so asking for lily pads quietly asks for a
 * pond first.
 */
const PLANT_HOME = (plant: string, amount: number, hint: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Call the farm home',
  hint,
  requirement: { kind: 'plantCount', species: plant, amount },
  result: 'Paints into its own colors. A resident of the farm.',
})

const PLANT_LOVE = (plant: string, amount: number, hint: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Love the farm',
  hint,
  requirement: { kind: 'plantCount', species: plant, amount },
  result: 'Eyes go to hearts. Ready to court and breed.',
})

/**
 * A stage whose requirement is a count of something rather than an area: so
 * many resident chickens, so many chickens eaten, so many oaks. `title` and
 * `result` default to the shared wording for that rung.
 */
const COUNT_STAGE = (
  title: string,
  hint: string,
  requirement: ConditionRequirement,
  result: string,
): Omit<StageDefinition, 'stage'> => ({ title, hint, requirement, result })

/** A visit that waits on plants: the animal only wanders in once its food is growing. */
const ENTER_FOR_PLANTS = (plant: string, amount: number, hint: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Visit the farm',
  hint,
  requirement: { kind: 'plantCount', species: plant, amount },
  result: 'Wanders inside the fence. Still wild, still deciding.',
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
 * The owl is the first predator, and the first species with a night shift.
 *
 *  - Appears (DISCOVERY): a resident chicken is something to hunt.
 *  - Visits the farm: a flock of three, so a hunt does not empty the yard.
 *  - Stays: five chickens eaten *and* an oak to roost in. This is the stage
 *    that makes predator and prey a mechanic and not just an animation.
 *  - Breeds: a second oak, because owls roost alone, and a flock left to hunt.
 */
const OWL_CONDITIONS: SpeciesConditions = {
  stages: withStageNumbers([
    {
      title: 'Appear at the carnival',
      hint: 'Comes out after dark, drawn by the sound of chickens.',
      requirement: null,
      result: 'Turns up at the carnival in wild balloon red, but only after dark.',
    },
    COUNT_STAGE(
      'Visit the farm',
      'Wants a proper flock to watch: three resident chickens.',
      { kind: 'residentCount', species: 'chicken', amount: 3 },
      'Glides over the fence at night. Still wild, still hungry.',
    ),
    COUNT_STAGE(
      'Call the farm home',
      'Must eat five chickens on your farm, and needs an oak tree to roost in.',
      { kind: 'preyEaten', species: 'chicken', amount: 5, and: [{ kind: 'propCount', species: 'oak', amount: 1 }] },
      'Paints into its own colors and roosts in the oak. A resident of the farm.',
    ),
    COUNT_STAGE(
      'Love the farm',
      'Wants a second oak for a mate to roost in, and a flock of three chickens left to hunt.',
      { kind: 'propCount', species: 'oak', amount: 2, and: [{ kind: 'residentCount', species: 'chicken', amount: 3 }] },
      'Eyes go to hearts. Ready to court and breed.',
    ),
  ]),
}

/**
 * The raccoon is the simplest night animal: a ground walker with no hunt, only props.
 *
 *  - Appears (DISCOVERY): a resident cow means spilt feed and scraps.
 *  - Visits the farm: nothing asked, it just sniffs around after dark.
 *  - Stays: a garbage can to raid. It sleeps beside it through the day.
 *  - Breeds: a dumpster, which is its house, with the can still in place.
 */
const RACCOON_CONDITIONS: SpeciesConditions = {
  stages: withStageNumbers([
    {
      title: 'Appear at the carnival',
      hint: 'Creeps out after dark, drawn by the smell of a working farm.',
      requirement: null,
      result: 'Turns up at the carnival in wild balloon red, but only after dark.',
    },
    ENTER_FARM('Slips under the fence at night to sniff around.'),
    COUNT_STAGE(
      'Call the farm home',
      'Wants a garbage can to raid. It sleeps beside it all day.',
      { kind: 'propCount', species: 'garbage-can', amount: 1 },
      'Paints into its own colors and curls up beside the can by day. A resident of the farm.',
    ),
    COUNT_STAGE(
      'Love the farm',
      'Wants a dumpster to call home, with the garbage can kept close. It sleeps beside the dumpster.',
      { kind: 'propCount', species: 'dumpster', amount: 1, and: [{ kind: 'propCount', species: 'garbage-can', amount: 1 }] },
      'Eyes go to hearts. Ready to court and breed.',
    ),
  ]),
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
      COUNT_STAGE(
        'Love the farm',
        'Wants twice the meadow, and a small barn to raise a calf in.',
        { kind: 'grassArea', amount: 30, maturity: 0.75, and: [{ kind: 'propCount', species: 'barn', amount: 1 }] },
        'Eyes go to hearts. Ready to court and breed.',
      ),
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
      ENTER_FOR_PLANTS('clover', 3, 'Smells clover on the breeze and comes in to graze: three grown clover patches.'),
      COUNT_STAGE(
        'Call the farm home',
        'Wants a flat, level patch to rest on, and a small barn to shelter in.',
        { kind: 'flatArea', amount: 12, maturity: 0.75, and: [{ kind: 'propCount', species: 'barn', amount: 1 }] },
        'Paints into its own colors. A resident of the farm.',
      ),
      COUNT_STAGE(
        'Love the farm',
        'Wants proper pasture, and clover enough to keep a flock fed.',
        { kind: 'grassArea', amount: 24, maturity: 0.75, and: [{ kind: 'plantCount', species: 'clover', amount: 4 }] },
        'Eyes go to hearts. Ready to court and breed.',
      ),
    ]),
  },
  chicken: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FOR_PLANTS('dandelion', 3, 'Comes scrabbling in for the seeds: three grown dandelion patches.'),
      COUNT_STAGE(
        'Call the farm home',
        'Wants a small grassy corner to scratch about in, and a coop to roost in.',
        { kind: 'grassArea', amount: 6, maturity: 0.75, and: [{ kind: 'propCount', species: 'coop', amount: 1 }] },
        'Paints into its own colors. A resident of the farm.',
      ),
      COUNT_STAGE(
        'Love the farm',
        'Wants a second coop for the nesting boxes, and a bit more lawn to range over.',
        { kind: 'propCount', species: 'coop', amount: 2, and: [{ kind: 'grassArea', amount: 12, maturity: 0.75 }] },
        'Eyes go to hearts. Ready to court and breed.',
      ),
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
  owl: OWL_CONDITIONS,
  raccoon: RACCOON_CONDITIONS,
  frog: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Springs over the fence and sits in the mud to listen.'),
      PLANT_HOME('water-lily', 2, 'Wants lily pads to sit on — a couple of grown ones in the pond.'),
      PLANT_LOVE('water-lily', 4, 'Wants a proper lily pond: twice the pads, and grass along the banks.'),
    ]),
  },
}

/** Species that only come out after dark. They arrive, visit and hunt at night. */
export const NIGHT_ONLY_SPECIES: readonly string[] = ['owl', 'raccoon']

/**
 * Species that begin the game already turned up at the carnival.
 *
 * Only the cow, which asks for nothing but grass. Sheep and chickens come when
 * the plants they eat are growing (see `DISCOVERY`), so the farm fills up one
 * animal at a time instead of all at once.
 */
export const CARNIVAL_STARTERS: readonly string[] = ['cow', 'duck']

/** Whether a species only turns up after dark. Every other species arrives in daylight. */
export function isNightOnly(species: string): boolean {
  return NIGHT_ONLY_SPECIES.includes(species)
}

/**
 * How a species that did not start at the carnival first gets noticed.
 *
 * Without this a species at stage 0 is stuck forever, and a condition the
 * player can never satisfy is the same as a hidden one. Each entry says what
 * the farm has to look like before that species wanders up to the tents.
 */
export const DISCOVERY: Readonly<Record<string, ConditionRequirement & { readonly description: string }>> = {
  sheep: { kind: 'plantCount', species: 'clover', amount: 2, description: 'Clover on the breeze carries all the way to the tents.' },
  chicken: { kind: 'plantCount', species: 'dandelion', amount: 2, description: 'Dandelion seed is a rumor every hen hears.' },
  pig: { kind: 'grassArea', amount: 8, description: 'A patch of grass catches the eye of something rooting around.' },
  goose: { kind: 'waterArea', amount: 5, description: 'Water somewhere on the farm draws the waddlers over.' },
  frog: { kind: 'waterArea', amount: 4, description: 'A little water is sure to bring something green and bouncy.' },
  raccoon: { kind: 'residentCount', species: 'cow', amount: 1, description: 'Spilt feed and scraps from a working farm smell like dinner.' },
  owl: { kind: 'residentCount', species: 'chicken', amount: 1, description: 'A resident chicken carries a long way on a still night.' },
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
