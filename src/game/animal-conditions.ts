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
  /** Square meters of tall meadow grass (the green seed pack), not lawn. */
  | 'meadowArea'
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
  /**
   * Percent of the whole farm under one terrain (`species` names it: 'dirt').
   * The only kind measured as a share rather than an amount, so a mole's 90%
   * is as hard on a big farm as on a small one.
   */
  | 'terrainShare'
  /** Whether the farmer owns a garden tool bought at the shop (`species`: 'shovel' | 'water'). */
  | 'toolOwned'

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
    case 'grassArea': return 'Grown grass'
    case 'meadowArea': return 'Tall meadow grass'
    case 'waterArea': return 'Visible pond water'
    case 'flatArea': return 'Level grassy pasture'
    case 'plantCount': return requirement.species ? plantMetricLabel(requirement.species) : null
    case 'residentCount': return requirement.species ? `Resident ${speciesPlural(requirement.species)}` : null
    case 'preyEaten': return requirement.species ? `${capitalise(speciesPlural(requirement.species))} eaten` : null
    case 'propCount': return requirement.species ? `${capitalise(propPlural(requirement.species))} on the farm` : null
    case 'toolOwned': return requirement.species ? `${capitalise(toolName(requirement.species))} bought` : null
    case 'terrainShare': return requirement.species ? `${capitalise(terrainName(requirement.species))} share of the farm` : null
    case 'residentSpecies': return null
  }
}

const TERRAIN_NAMES: Readonly<Record<string, string>> = {
  dirt: 'bare dirt',
  snow: 'snow cover',
}

function toolName(tool: string): string {
  return tool === 'water' ? 'water bucket' : tool
}

function terrainName(terrain: string): string {
  return TERRAIN_NAMES[terrain] ?? terrain
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function speciesPlural(species: string): string {
  if (species === 'sheep') return 'sheep'
  if (species === 'goose') return 'geese'
  if (species === 'mouse') return 'mice'
  return `${species}s`
}

const PROP_PLURALS: Readonly<Record<string, string>> = {
  oak: 'oak trees',
  coop: 'chicken coops',
  barn: 'small barns',
  'goose-house': 'goose houses',
  sty: 'pig sties',
  'frog-house': 'frog houses',
  'owl-box': 'owl boxes',
  'garbage-can': 'garbage cans',
  'hollow-log': 'hollow logs',
  'rock-pile': 'rock piles',
  molehill: 'molehills',
}

function propPlural(prop: string): string {
  return PROP_PLURALS[prop] ?? `${prop}s`
}

/** True for the kinds that are a whole number of things rather than square meters. */
export function isCountKind(kind: ConditionKind | undefined): boolean {
  return kind === 'plantCount' || kind === 'residentCount' || kind === 'preyEaten' || kind === 'propCount' || kind === 'toolOwned'
}

/**
 * The unit a metric is written in.
 *
 * The land kinds are areas and take square meters; a `plantCount` is a number
 * of plants and takes no unit at all. "5.0 / 2 m²" of lily pads is nonsense,
 * and the journal is exactly where a player would read it.
 */
/** True for the kinds whose journal row names what it counts, so it needs its own unit: counts and shares. */
export function hasOwnMetricUnit(kind: ConditionKind | undefined): boolean {
  return isCountKind(kind) || kind === 'terrainShare'
}

export function conditionMetricUnit(requirement: ConditionRequirement | null): string {
  if (requirement?.kind === 'terrainShare') return '%'
  return isCountKind(requirement?.kind) ? '' : ' m²'
}

/**
 * A metric's current value at a precision that suits it: whole plants, one
 * decimal of square meter.
 */
export function formatConditionMetric(requirement: ConditionRequirement | null, value: number): string {
  // A share reads as a whole percent: "62%" of the farm, not "62.4%".
  if (requirement?.kind === 'terrainShare') return value.toFixed(0)
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
  /**
   * A resident that keeps its place only while its "call the farm home"
   * requirement stays met. When the farm stops suiting it, the balloon loses
   * helium, and a flat one pops (see `animal-life.ts`). Without this flag a
   * resident stays for good once settled, which is how most species behave.
   */
  readonly holdsResidency?: boolean
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

/**
 * The breeding rung. Babies are born indoors, so every species asks for its
 * house here (see `HOUSE_SPECIES` in animal-housing.ts) alongside its land.
 */
const LOVE_THE_FARM = (kind: 'grassArea' | 'waterArea' | 'flatArea', amount: number, hint: string, maturity: number | undefined, house: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Love the farm',
  hint,
  requirement: { kind, amount, maturity, and: [{ kind: 'propCount', species: house, amount: 1 }] },
  result: 'Eyes go to hearts. Ready to raise young in its house.',
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

const PLANT_LOVE = (plant: string, amount: number, hint: string, house: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Love the farm',
  hint,
  requirement: { kind: 'plantCount', species: plant, amount, and: [{ kind: 'propCount', species: house, amount: 1 }] },
  result: 'Eyes go to hearts. Ready to raise young in its house.',
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

const SHARE_LIFE = (species: string, name: string, house: string, houseName: string): Omit<StageDefinition, 'stage'> => ({
  title: 'Love the farm',
  hint: `Adores its ${name} friend, and wants a ${houseName} of its own to raise young in.`,
  requirement: { kind: 'residentSpecies', species, and: [{ kind: 'propCount', species: house, amount: 1 }] },
  result: 'Eyes go to hearts. Ready to raise young in its house.',
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
 *  - Breeds: an owl box to nest in, and a flock left to hunt.
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
      'Wants an owl box to nest in, and a flock of three chickens left to hunt.',
      { kind: 'propCount', species: 'owl-box', amount: 1, and: [{ kind: 'residentCount', species: 'chicken', amount: 3 }] },
      'Eyes go to hearts. Ready to raise young in its house.',
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
      'Eyes go to hearts. Ready to raise young in its house.',
    ),
  ]),
}

/**
 * The tall-grass animals. Each asks for meadow (`meadowArea`), the long grass
 * the green seed pack grows, which a lawn of short grass never counts toward.
 *
 *  - Mouse: the first of them. A little meadow lures it; more makes it stay,
 *    with dandelions to nibble; it breeds in a hollow log.
 *  - Rat: a night animal that follows the mice in, settles where there is a
 *    garbage can to raid, and shares the mice's hollow log.
 *  - Snake: comes for the mice, and hunts them (and rats) through the grass.
 *    Like the owl it stays once it has eaten on the farm; it breeds in a rock
 *    pile with mice left to hunt.
 */
const MOUSE_CONDITIONS: SpeciesConditions = {
  stages: withStageNumbers([
    CARNIVAL,
    COUNT_STAGE(
      'Visit the farm',
      'Scurries in once there is long grass to hide in: 6 m² of tall meadow.',
      { kind: 'meadowArea', amount: 6 },
      'Pitter-patters in through the long grass. Still wild, still deciding.',
    ),
    COUNT_STAGE(
      'Call the farm home',
      'Wants a proper meadow to nest in, and dandelions to nibble.',
      { kind: 'meadowArea', amount: 15, and: [{ kind: 'plantCount', species: 'dandelion', amount: 2 }] },
      'Paints into its own colors. A resident of the farm.',
    ),
    COUNT_STAGE(
      'Love the farm',
      'Wants more meadow, and a hollow log to raise its young in.',
      { kind: 'meadowArea', amount: 20, and: [{ kind: 'propCount', species: 'hollow-log', amount: 1 }] },
      'Eyes go to hearts. Ready to raise young in its house.',
    ),
  ]),
}

const RAT_CONDITIONS: SpeciesConditions = {
  stages: withStageNumbers([
    {
      title: 'Appear at the carnival',
      hint: 'Creeps out after dark, following the mice.',
      requirement: null,
      result: 'Turns up at the carnival in wild balloon red, but only after dark.',
    },
    COUNT_STAGE(
      'Visit the farm',
      'Slips in at night where the grass is long: 10 m² of tall meadow.',
      { kind: 'meadowArea', amount: 10 },
      'Noses through the meadow after dark. Still wild, still deciding.',
    ),
    COUNT_STAGE(
      'Call the farm home',
      'Wants a garbage can to raid, and long grass to run home through.',
      { kind: 'propCount', species: 'garbage-can', amount: 1, and: [{ kind: 'meadowArea', amount: 15 }] },
      'Paints into its own colors and curls up by day. A resident of the farm.',
    ),
    COUNT_STAGE(
      'Love the farm',
      'Wants a hollow log to share with the mice, and the can kept close.',
      { kind: 'propCount', species: 'hollow-log', amount: 1, and: [{ kind: 'propCount', species: 'garbage-can', amount: 1 }] },
      'Eyes go to hearts. Ready to raise young in its house.',
    ),
  ]),
}

const SNAKE_CONDITIONS: SpeciesConditions = {
  stages: withStageNumbers([
    CARNIVAL,
    COUNT_STAGE(
      'Visit the farm',
      'Only slithers in where the grass is deep: 15 m² of tall meadow.',
      { kind: 'meadowArea', amount: 15 },
      'Slides through the long grass. Still wild, still deciding.',
    ),
    COUNT_STAGE(
      'Call the farm home',
      'Must catch two mice on your farm, in a big meadow to hunt through.',
      { kind: 'preyEaten', species: 'mouse', amount: 2, and: [{ kind: 'meadowArea', amount: 25 }] },
      'Paints into its own colors. A resident of the farm.',
    ),
    COUNT_STAGE(
      'Love the farm',
      'Wants a rock pile to bask on and raise hatchlings in, deep in the meadow, and three mice left to hunt.',
      { kind: 'propCount', species: 'rock-pile', amount: 1, and: [{ kind: 'meadowArea', amount: 30 }, { kind: 'residentCount', species: 'mouse', amount: 3 }] },
      'Eyes go to hearts. Ready to raise young in its house.',
    ),
  ]),
}

/**
 * The mole is the first species that wants the farm *bare*: a share of the
 * whole farm that is dirt, not an area of something grown.
 *
 *  - Appears (DISCOVERY): the farmer owns a shovel. A mole comes to see what is
 *    being dug.
 *  - Visits the farm: half the farm is dirt.
 *  - Stays: nine tenths is dirt, and it keeps being. A mole that has settled
 *    loses helium and pops if the lawn creeps back (`holdsResidency`).
 *  - Breeds: a molehill to raise pups in, with the farm still nine tenths dirt.
 */
const MOLE_CONDITIONS: SpeciesConditions = {
  holdsResidency: true,
  stages: withStageNumbers([
    COUNT_STAGE(
      'Appear at the carnival',
      'Hears a shovel somewhere and comes over to see: buy the shovel at the shop.',
      { kind: 'toolOwned', species: 'shovel', amount: 1 },
      'Turns up at the carnival in wild balloon red.',
    ),
    COUNT_STAGE(
      'Visit the farm',
      'Wants bare earth to tunnel through: half the farm should be dirt.',
      { kind: 'terrainShare', species: 'dirt', amount: 50 },
      'Noses in through the loam. Still wild, still deciding.',
    ),
    COUNT_STAGE(
      'Call the farm home',
      'Wants almost nothing but dirt: nine tenths of the farm. It leaves, and goes flat, if the lawn creeps back.',
      { kind: 'terrainShare', species: 'dirt', amount: 90 },
      'Paints into its own colors. A resident of the farm, for as long as the farm stays bare.',
    ),
    COUNT_STAGE(
      'Love the farm',
      'Wants a molehill to raise pups in, with the farm kept nearly all dirt.',
      { kind: 'propCount', species: 'molehill', amount: 1, and: [{ kind: 'terrainShare', species: 'dirt', amount: 90 }] },
      'Eyes go to hearts. Ready to raise young in its house.',
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
        'Eyes go to hearts. Ready to raise young in its house.',
      ),
    ]),
  },
  pig: {
    requiresResident: ['cow'],
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Sniffs its way in through the gate and starts turning up soil.'),
      REQUIRE_RESIDENT('cow', 'Cow'),
      SHARE_LIFE('cow', 'Cow', 'sty', 'pig sty'),
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
        'Wants proper pasture, clover enough to keep a flock fed, and the barn to raise lambs in.',
        { kind: 'grassArea', amount: 24, maturity: 0.75, and: [{ kind: 'plantCount', species: 'clover', amount: 4 }, { kind: 'propCount', species: 'barn', amount: 1 }] },
        'Eyes go to hearts. Ready to raise young in its house.',
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
        'Wants a bit more lawn to range over, and the coop to raise chicks in.',
        { kind: 'grassArea', amount: 12, maturity: 0.75, and: [{ kind: 'propCount', species: 'coop', amount: 1 }] },
        'Eyes go to hearts. Ready to raise young in its house.',
      ),
    ]),
  },
  duck: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Heads straight for the low ground and paddles in.'),
      CALL_HOME('waterArea', 8, 'Wants a proper pool to swim in, not just damp soil.', 0.75),
      LOVE_THE_FARM('waterArea', 16, 'Wants a bigger pond, and a coop to raise ducklings in.', 0.75, 'coop'),
    ]),
  },
  goose: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Waddles in from the tents, inspecting everything.'),
      CALL_HOME('waterArea', 10, 'Wants a deep enough pond to float on.', 0.75),
      LOVE_THE_FARM('waterArea', 20, 'Wants a proper stretch of water to patrol, and a goose house to raise goslings in.', 0.75, 'goose-house'),
    ]),
  },
  owl: OWL_CONDITIONS,
  raccoon: RACCOON_CONDITIONS,
  mouse: MOUSE_CONDITIONS,
  rat: RAT_CONDITIONS,
  snake: SNAKE_CONDITIONS,
  mole: MOLE_CONDITIONS,
  frog: {
    stages: withStageNumbers([
      CARNIVAL,
      ENTER_FARM('Springs over the fence and sits in the mud to listen.'),
      PLANT_HOME('water-lily', 2, 'Wants lily pads to sit on — a couple of grown ones in the pond.'),
      PLANT_LOVE('water-lily', 4, 'Wants a proper lily pond: twice the pads, and a frog house on the bank.', 'frog-house'),
    ]),
  },
}

/**
 * Debug: force a species to hold (or not hold) its residency, so the lapse can
 * be watched on a species that does not ask for it. `null` clears the override.
 */
const residencyOverrides = new Map<string, boolean>()

export function setResidencyOverride(species: string, holds: boolean | null): void {
  if (holds === null) residencyOverrides.delete(species)
  else residencyOverrides.set(species, holds)
}

/** Whether a resident of this species leaves when its home requirement stops being met. */
export function holdsResidency(species: string): boolean {
  return residencyOverrides.get(species) ?? SPECIES_CONDITIONS[species]?.holdsResidency === true
}

/** Species that only come out after dark. They arrive, visit and hunt at night. */
export const NIGHT_ONLY_SPECIES: readonly string[] = ['owl', 'raccoon', 'rat']

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
  mouse: { kind: 'meadowArea', amount: 4, description: 'Long grass rustling at the fence line is all a field mouse needs to hear.' },
  rat: { kind: 'residentCount', species: 'mouse', amount: 1, description: 'Where one mouse has settled, a rat is never far behind.' },
  snake: { kind: 'residentCount', species: 'mouse', amount: 2, description: 'Mice in the long grass draw something patient and green.' },
  mole: { kind: 'toolOwned', species: 'shovel', amount: 1, description: 'The sound of a shovel biting into soil carries a long way underground.' },
}

export function getSpeciesConditions(species: string): readonly StageDefinition[] {
  return SPECIES_CONDITIONS[species]?.stages ?? withStageNumbers([CARNIVAL, ENTER_FARM('Comes in to look around.'), CALL_HOME('grassArea', 15, 'Wants a meadow.', 0.75), LOVE_THE_FARM('grassArea', 30, 'Wants more meadow.', 0.75, 'barn')])
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
