/**
 * Journal copy for the food web: diet blocks on species pages, the Food web
 * chapter's explainers, overview and goods list.
 *
 * Pure, like `animal-diet.ts`: no Three.js, no DOM. Everything is built from
 * DIETS, PRODUCE, GOODS and PREY_OF, so a new species with a diet appears in
 * the journal with no edit here. The journal only draws what this returns.
 *
 * Progressive disclosure: callers pass the set of discovered species and the
 * overview functions give an undiscovered one a null name (a "???" row), never
 * its real name.
 */

import { houseFor } from './animal-housing'
import { DIETS, FOOD_IDS, FOOD_LABELS, GOODS, HUNGER_LABELS, hungerLevel, PRODUCE, isPredatorDiet, type FoodId, type GoodId, type HungerLevel } from './animal-diet'
import { HARMONY_WEIGHTS } from './harmony'
import { PREY_OF } from './predator'

const FOOD_ICON_BASE = 'assets/goods'

/** The icon for a food, or null for prey (a hunter eats what it catches). */
export function foodIcon(food: FoodId): string | null {
  return food === 'prey' ? null : `${FOOD_ICON_BASE}/food-${food}.png`
}

const IRREGULAR_PLURALS: Readonly<Record<string, string>> = { mouse: 'mice', sheep: 'sheep', goose: 'geese' }

/** "Cow" -> "cows", "Mouse" -> "mice". */
export function pluralName(name: string): string {
  const lower = name.toLowerCase()
  return IRREGULAR_PLURALS[lower] ?? `${lower}s`
}

const HOUSE_NAMES: Readonly<Record<string, string>> = {
  barn: 'the barn',
  coop: 'the coop',
  'goose-house': 'the goose house',
  sty: 'the sty',
  dumpster: 'the dumpster',
}

// --------------------------------------------------------- species page --

export interface FoodChip {
  readonly id: FoodId
  readonly label: string
  readonly icon: string | null
}

export interface DietBlock {
  /** Foods in preference order, for the icon row. */
  readonly foods: readonly FoodChip[]
  /** "Grass, then feed sacks" */
  readonly eatsText: string
  /** "Big eater: 1.5 meals a day"; null for a hunter, whose line is `huntText`. */
  readonly appetiteText: string | null
  readonly makes: { readonly good: GoodId; readonly icon: string; readonly text: string } | null
  /** Hunters only. */
  readonly huntText: string | null
  /** Prey only: "Hunted by: Owl". */
  readonly huntedByText: string | null
}

function mealsText(appetite: number): string {
  const rounded = Math.round(appetite * 10) / 10
  return `${rounded} ${rounded === 1 ? 'meal' : 'meals'} a day`
}

export function appetiteWord(appetite: number): string {
  if (appetite >= 1.3) return 'Big eater'
  if (appetite >= 0.9) return 'Steady eater'
  if (appetite >= 0.6) return 'Light eater'
  return 'Small eater'
}

export function eatsText(foods: readonly FoodId[]): string {
  return foods
    .map((food, index) => {
      if (food === 'prey') return index === 0 ? 'Whatever it catches' : 'what it catches'
      const label = FOOD_LABELS[food]
      return index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1)
    })
    .join(', then ')
}

function makesBlock(species: string): DietBlock['makes'] {
  const recipe = PRODUCE[species]
  if (!recipe) return null
  const good = GOODS[recipe.good]
  const house = houseFor(species)
  const houseName = house ? (HOUSE_NAMES[house] ?? `the ${house.replace(/-/g, ' ')}`) : null
  const pace =
    recipe.perDay >= 1
      ? 'One a day when full, half when just fed.'
      : recipe.perDay === 0.5
        ? 'One every two days when full, half as often when just fed.'
        : `About ${Math.round(recipe.perDay * 7)} a week when full, half as many when just fed.`
  const where = recipe.good === 'gem' ? ', for end-game treasures' : houseName ? `, kept in ${houseName}` : ''
  const needs = recipe.needsProp ? ` Only with ${/^[aeiou]/.test(recipe.needsProp) ? 'an' : 'a'} ${recipe.needsProp} on the farm.` : ''
  return { good: recipe.good, icon: good.icon, text: `${good.name}${where}. ${pace}${needs}` }
}

/** Who hunts a species, in the order PREY_OF lists the hunters. */
export function huntersOf(species: string): string[] {
  return Object.entries(PREY_OF).filter(([, prey]) => prey.includes(species)).map(([hunter]) => hunter)
}

export function dietBlock(species: string, nameOf: (id: string) => string): DietBlock | null {
  const diet = DIETS[species]
  if (!diet) return null
  const hunter = isPredatorDiet(species)
  const hunters = huntersOf(species)
  return {
    foods: diet.foods.map((id) => ({ id, label: FOOD_LABELS[id], icon: foodIcon(id) })),
    eatsText: eatsText(diet.foods),
    appetiteText: hunter ? null : `${appetiteWord(diet.appetite)}: ${mealsText(diet.appetite)}`,
    makes: makesBlock(species),
    huntText: hunter ? 'Eats what it catches. One catch fills it for about a day, and a fed hunter leaves the flock be.' : null,
    huntedByText: hunters.length ? `Hunted by: ${hunters.map(nameOf).join(', ')}` : null,
  }
}

// ------------------------------------------------------------ live herd --

export interface HerdAnimal {
  readonly species: string
  readonly stage: number
  readonly fullness: number
}

export interface HerdLine {
  readonly count: number
  readonly counts: Readonly<Record<HungerLevel, number>>
  /** "Your 6 cows: 4 full · 1 fed · 1 hungry" */
  readonly text: string
  /** Shown only when some are hungry or starving. */
  readonly hint: string | null
}

/** The player's own residents (stage 3 or more) of one species, or null when there are none. */
export function herdLine(species: string, herd: readonly HerdAnimal[], speciesName: string): HerdLine | null {
  const residents = herd.filter((animal) => animal.species === species && animal.stage >= 3)
  if (!residents.length) return null
  const counts: Record<HungerLevel, number> = { full: 0, fed: 0, hungry: 0, starving: 0 }
  for (const animal of residents) counts[hungerLevel(animal.fullness)] += 1
  const parts = (['full', 'fed', 'hungry', 'starving'] as const)
    .filter((level) => counts[level] > 0)
    .map((level) => `${counts[level]} ${HUNGER_LABELS[level].toLowerCase()}`)
  const count = residents.length
  const noun = count === 1 ? speciesName.toLowerCase() : pluralName(speciesName)
  const behind = counts.hungry + counts.starving
  const first = DIETS[species]?.foods[0]
  const foodHint = isPredatorDiet(species)
    ? 'A hungry hunter needs prey to catch.'
    : first && first !== 'feed'
      ? `Grow more ${FOOD_LABELS[first].toLowerCase()}, or buy feed sacks, to keep them going.`
      : 'Buy more feed sacks to keep them going.'
  return {
    count,
    counts,
    text: `Your ${count} ${noun}: ${parts.join(' · ')}`,
    hint: behind > 0 ? `${behind === 1 ? 'One is' : `${behind} are`} going hungry. ${foodHint}` : null,
  }
}

// --------------------------------------------------- the Food web chapter --

export interface LadderRung {
  readonly level: HungerLevel
  readonly label: string
  readonly text: string
}

export const HUNGER_INTRO = 'Every animal on your farm eats. A full belly lasts about a day, then it goes looking for its next meal.'

export const HUNGER_LADDER: readonly LadderRung[] = [
  { level: 'full', label: HUNGER_LABELS.full, text: 'Happy and busy. It breeds and makes goods at full pace.' },
  { level: 'fed', label: HUNGER_LABELS.fed, text: 'Doing fine. It still breeds, and makes goods at half pace.' },
  { level: 'hungry', label: HUNGER_LABELS.hungry, text: 'No breeding for the whole species, and no goods.' },
  { level: 'starving', label: HUNGER_LABELS.starving, text: 'It loses helium. A flat balloon is gone for good.' },
]

export const HARMONY_INTRO =
  'Harmony scores your whole farm from 0 to 100. Forty cows on one lawn score worse than a dozen kinds of animal that are all fed.'

export const HARMONY_PARTS: readonly { readonly name: string; readonly points: number; readonly text: string }[] = [
  { name: 'Variety', points: HARMONY_WEIGHTS.variety, text: 'How many kinds of animal live here.' },
  { name: 'Balance', points: HARMONY_WEIGHTS.balance, text: 'Whether any one kind crowds out the rest.' },
  { name: 'Fed', points: HARMONY_WEIGHTS.fed, text: 'How many of your animals have enough to eat.' },
  { name: 'Links', points: HARMONY_WEIGHTS.links, text: 'Hunters and prey living on the same farm.' },
]

export interface OverviewEater {
  readonly species: string
  /** Null when the species is not discovered yet: the journal draws a ??? silhouette. */
  readonly name: string | null
}

export interface FoodOverviewRow {
  readonly food: FoodId
  readonly label: string
  readonly icon: string | null
  /** Where the farm gets it, in a few words. */
  readonly source: string
  readonly eaters: readonly OverviewEater[]
}

const FOOD_SOURCES: Readonly<Record<FoodId, string>> = {
  grass: 'Grows on lawn',
  meadow: 'Grows in tall meadow',
  pondweed: 'Grows in ponds and under lily pads',
  seeds: 'Falls from grown flowers',
  scraps: 'From garbage cans, dumpsters and spoiled goods',
  worms: 'Wriggle in bare dirt',
  blooms: 'Nectar from grown flowers',
  feed: 'Bought at the shop',
  prey: 'Caught by hunters',
}

function eaterOf(species: string, discovered: ReadonlySet<string>, nameOf: (id: string) => string): OverviewEater {
  return { species, name: discovered.has(species) ? nameOf(species) : null }
}

/** One row per food that anyone eats, eaters in catalog order. */
export function foodOverview(catalog: readonly string[], discovered: ReadonlySet<string>, nameOf: (id: string) => string): FoodOverviewRow[] {
  const rows: FoodOverviewRow[] = []
  for (const food of FOOD_IDS) {
    if (food === 'prey') continue
    const eaters = catalog.filter((species) => DIETS[species]?.foods.includes(food)).map((species) => eaterOf(species, discovered, nameOf))
    if (eaters.length) rows.push({ food, label: FOOD_LABELS[food], icon: foodIcon(food), source: FOOD_SOURCES[food], eaters })
  }
  return rows
}

export interface HuntRow {
  readonly hunter: OverviewEater
  readonly prey: readonly OverviewEater[]
}

/** Who hunts whom. Anyone the player has not met is a ??? entry. */
export function huntOverview(catalog: readonly string[], discovered: ReadonlySet<string>, nameOf: (id: string) => string): HuntRow[] {
  return catalog
    .filter((species) => (PREY_OF[species] ?? []).length > 0)
    .map((hunter) => ({
      hunter: eaterOf(hunter, discovered, nameOf),
      prey: (PREY_OF[hunter] ?? []).filter((prey) => catalog.includes(prey)).map((prey) => eaterOf(prey, discovered, nameOf)),
    }))
}

export interface GoodRow {
  readonly good: GoodId
  readonly name: string
  readonly icon: string
  /** "2 coins", or "Not sold". */
  readonly valueText: string
  readonly makers: readonly OverviewEater[]
}

export function goodsList(catalog: readonly string[], discovered: ReadonlySet<string>, nameOf: (id: string) => string): GoodRow[] {
  return (Object.keys(GOODS) as GoodId[])
    .map((id) => {
      const spec = GOODS[id]
      const makers = catalog.filter((species) => PRODUCE[species]?.good === id).map((species) => eaterOf(species, discovered, nameOf))
      const valueText = spec.value > 0 ? `${spec.value} ${spec.value === 1 ? 'coin' : 'coins'}` : 'Not sold'
      return { good: id, name: spec.name, icon: spec.icon, valueText, makers }
    })
    .filter((row) => row.makers.length > 0)
}
