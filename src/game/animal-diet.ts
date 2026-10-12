/**
 * The food web: what every species eats, how much the farm grows of it, and
 * what a well-fed animal makes in return.
 *
 * Pure, like `animal-conditions.ts`: no Three.js, no DOM, no timers. The farm
 * is measured into a `FarmState`; this module turns that into *meals per day*
 * of each food, and `createFoodWeb` keeps a larder of each one that regrows
 * toward a day's supply and is eaten down by the animals that live on it.
 *
 * Why food and not a population cap: a fixed cap is a wall the player bumps
 * into. Food is a dial they can see and turn. A lawn feeds so many cows; grow
 * more lawn and it feeds more. When the herd outgrows its food:
 *
 *   1. The animals that eat last go hungry first (`servingOrder`: the oldest
 *      residents eat first, newcomers last), so a shortage lands on the
 *      surplus, not evenly on everyone.
 *   2. A hungry species stops breeding and stops making goods. This is the
 *      brake that does most of the balancing: herds level off at their food.
 *   3. Only an animal left starving loses helium, and only a flat one goes.
 *
 * Everything is measured in *meals*. One meal is what keeps a one-appetite
 * animal fed for a day; a cow's appetite is bigger than a mouse's.
 */

import { DAY_LENGTH_SECONDS } from './day-night'
import type { FarmState } from './farm-state'

/** Every kind of food on the farm. */
export type FoodId =
  /** Grown lawn: cows, sheep and geese graze it. */
  | 'grass'
  /** Seed heads and beetles in the tall meadow: mice and rats. */
  | 'meadow'
  /** Weed and bugs in the pond, more under lily pads: ducks, geese, frogs. */
  | 'pondweed'
  /** Seed from grown flowers (dandelion, poppy, clover): chickens. */
  | 'seeds'
  /** Scraps from garbage cans and dumpsters, and goods left to spoil: pigs, raccoons, rats. */
  | 'scraps'
  /** Grubs under bare dirt: the mole. */
  | 'worms'
  /** Nectar from grown flowers: the starhorn. */
  | 'blooms'
  /** Feed sacks bought at the shop. It never regrows: a pantry, not a field. */
  | 'feed'
  /** Hunted animals. A predator fills up by catching, not from a larder. */
  | 'prey'

export const FOOD_IDS: readonly FoodId[] = ['grass', 'meadow', 'pondweed', 'seeds', 'scraps', 'worms', 'blooms', 'feed', 'prey']

/** Foods that grow on the farm and are measured from it. Feed and prey are not. */
export const GROWN_FOODS: readonly FoodId[] = ['grass', 'meadow', 'pondweed', 'seeds', 'scraps', 'worms', 'blooms']

export const FOOD_LABELS: Readonly<Record<FoodId, string>> = {
  grass: 'Grass',
  meadow: 'Meadow seeds',
  pondweed: 'Pond weed',
  seeds: 'Flower seeds',
  scraps: 'Scraps and slop',
  worms: 'Worms',
  blooms: 'Nectar',
  feed: 'Feed sacks',
  prey: 'Prey',
}

export interface Diet {
  /** Foods in the order the animal prefers them. It moves on when one runs out. */
  readonly foods: readonly FoodId[]
  /** Meals a day this animal eats when fed. */
  readonly appetite: number
}

/**
 * What every species eats. Farm animals fall back on bought feed when their
 * field runs short, which is how a player carries a herd through a shortage,
 * at a price. Predators eat only what they catch.
 */
export const DIETS: Readonly<Record<string, Diet>> = {
  cow: { foods: ['grass', 'feed'], appetite: 1.5 },
  sheep: { foods: ['grass', 'feed'], appetite: 1 },
  goose: { foods: ['pondweed', 'grass', 'feed'], appetite: 1 },
  duck: { foods: ['pondweed', 'feed'], appetite: 0.8 },
  chicken: { foods: ['seeds', 'feed'], appetite: 0.5 },
  // Pigs root through slop first and graze when there is none.
  pig: { foods: ['scraps', 'grass', 'feed'], appetite: 1.2 },
  frog: { foods: ['pondweed'], appetite: 0.4 },
  mouse: { foods: ['meadow'], appetite: 0.4 },
  rat: { foods: ['scraps', 'meadow'], appetite: 0.5 },
  raccoon: { foods: ['scraps'], appetite: 1 },
  mole: { foods: ['worms'], appetite: 0.6 },
  // A predator's appetite is how much of its belly one catch fills (`catchMeal`): about a catch a day.
  owl: { foods: ['prey'], appetite: 0.5 },
  snake: { foods: ['prey'], appetite: 0.6 },
  starhorn: { foods: ['blooms'], appetite: 1.2 },
}

export function dietOf(species: string): Diet | null {
  return DIETS[species] ?? null
}

export function isPredatorDiet(species: string): boolean {
  return DIETS[species]?.foods.includes('prey') ?? false
}

/**
 * How many meals a day the farm grows of each food, from what it measures.
 * Each number is one plain rate times one plain quantity, so a player who
 * doubles the pond doubles the pond weed.
 */
export const FOOD_YIELDS = {
  /** Meals a day per m² of grown lawn. 15 m² (one cow's home) feeds 1.2 cows. */
  grassPerSquareMeter: 0.12,
  /** Per m² of tall meadow. */
  meadowPerSquareMeter: 0.06,
  /** Per m² of visible pond, plus each grown lily pad. */
  pondweedPerSquareMeter: 0.12,
  pondweedPerLily: 0.6,
  /** Per grown flower patch, for chickens (seed) and the starhorn (nectar). */
  seedsPerFlower: 0.6,
  bloomsPerFlower: 0.35,
  /** Per garbage can and per dumpster. Spoiled goods add to this too. */
  scrapsPerCan: 1.5,
  scrapsPerDumpster: 2.5,
  /** Per percent of the farm that is bare dirt. */
  wormsPerDirtPercent: 0.02,
} as const

/** Grown plants that count as flowers for seed and nectar. */
export const FLOWER_PLANTS: readonly string[] = ['dandelion', 'poppy', 'clover']

/** Multipliers bought with gems (see `tool-unlocks.ts`'s treasures). 1 = no bonus. */
export interface FoodBoosts {
  readonly grass?: number
  readonly all?: number
}

/** Meals a day of one grown food the farm supplies right now. */
export function foodSupply(food: FoodId, farm: FarmState, boosts: FoodBoosts = {}): number {
  const all = boosts.all ?? 1
  const plants = farm.plantCounts ?? {}
  const props = farm.propCounts ?? {}
  const flowers = FLOWER_PLANTS.reduce((sum, plant) => sum + (plants[plant] ?? 0), 0)
  switch (food) {
    case 'grass': return farm.tallGrassArea * FOOD_YIELDS.grassPerSquareMeter * (boosts.grass ?? 1) * all
    case 'meadow': return (farm.meadowArea ?? 0) * FOOD_YIELDS.meadowPerSquareMeter * all
    case 'pondweed': return (farm.waterArea * FOOD_YIELDS.pondweedPerSquareMeter + (plants['water-lily'] ?? 0) * FOOD_YIELDS.pondweedPerLily) * all
    case 'seeds': return flowers * FOOD_YIELDS.seedsPerFlower * all
    case 'blooms': return flowers * FOOD_YIELDS.bloomsPerFlower * all
    case 'scraps': return ((props['garbage-can'] ?? 0) * FOOD_YIELDS.scrapsPerCan + (props.dumpster ?? 0) * FOOD_YIELDS.scrapsPerDumpster) * all
    case 'worms': return (farm.terrainShares?.dirt ?? 0) * FOOD_YIELDS.wormsPerDirtPercent * all
    case 'feed':
    case 'prey':
      return 0
  }
}

// ------------------------------------------------------------- hunger --

export type HungerLevel = 'full' | 'fed' | 'hungry' | 'starving'

/**
 * The hunger ladder, by fullness (1 = just ate, 0 = empty).
 *
 *   full      >= 0.7   breeds, makes its best goods
 *   fed       >= 0.4   breeds, makes goods at half pace
 *   hungry    >= 0.12  no breeding, no goods; a thought bubble says so
 *   starving  <  0.12  loses helium
 */
export const HUNGER_THRESHOLDS = { full: 0.7, fed: 0.4, hungry: 0.12 } as const

export function hungerLevel(fullness: number): HungerLevel {
  if (!(fullness >= HUNGER_THRESHOLDS.hungry)) return 'starving'
  if (fullness < HUNGER_THRESHOLDS.fed) return 'hungry'
  if (fullness < HUNGER_THRESHOLDS.full) return 'fed'
  return 'full'
}

export const HUNGER_LABELS: Readonly<Record<HungerLevel, string>> = {
  full: 'Full',
  fed: 'Fed',
  hungry: 'Hungry',
  starving: 'Starving',
}

/** A belly empties from full in this long with nothing to eat: one in-game day. */
export const BELLY_SECONDS = DAY_LENGTH_SECONDS

/** An animal eats whenever it is below this. It never stuffs itself past full. */
export const EAT_BELOW = 0.92

/** How fast a meal goes down, in fullness per second, so eating takes a beat. */
export const EAT_RATE = 1 / 30

/** A catch is this many meals. A predator's belly fills by `catchMeal`. */
export const CATCH_MEAL = 0.5

/** Fullness one catch gives a predator: a small eater is filled up by it. */
export function catchMeal(species: string): number {
  const appetite = DIETS[species]?.appetite ?? 1
  return Math.min(1, CATCH_MEAL / Math.max(0.05, appetite))
}

/** A predator hunts only below this; a fed one lazes about and leaves the prey be. */
export const PREDATOR_HUNTS_BELOW = 0.55

/** A larder holds this many days of its supply, so a lean spell is felt a little late. */
export const LARDER_DAYS = 0.75

/** Babies eat at this share of an adult's appetite. */
export const BABY_APPETITE = 0.5

// -------------------------------------------------------------- goods --

export type GoodId = 'milk' | 'wool' | 'egg' | 'duck-egg' | 'down' | 'truffle' | 'trinket' | 'gem'

export interface GoodSpec {
  readonly id: GoodId
  readonly name: string
  readonly plural: string
  /** Coins each, when collected from a house. Gems are counted, not sold. */
  readonly value: number
  readonly icon: string
}

export const GOODS: Readonly<Record<GoodId, GoodSpec>> = {
  milk: { id: 'milk', name: 'Milk', plural: 'Milk', value: 2, icon: 'assets/goods/good-milk.png' },
  wool: { id: 'wool', name: 'Wool', plural: 'Wool', value: 3, icon: 'assets/goods/good-wool.png' },
  egg: { id: 'egg', name: 'Egg', plural: 'Eggs', value: 1, icon: 'assets/goods/good-egg.png' },
  'duck-egg': { id: 'duck-egg', name: 'Duck egg', plural: 'Duck eggs', value: 2, icon: 'assets/goods/good-duck-egg.png' },
  down: { id: 'down', name: 'Down feather', plural: 'Down feathers', value: 3, icon: 'assets/goods/good-down.png' },
  truffle: { id: 'truffle', name: 'Truffle', plural: 'Truffles', value: 6, icon: 'assets/goods/good-truffle.png' },
  trinket: { id: 'trinket', name: 'Shiny trinket', plural: 'Shiny trinkets', value: 5, icon: 'assets/goods/good-trinket.png' },
  gem: { id: 'gem', name: 'Star gem', plural: 'Star gems', value: 0, icon: 'assets/goods/good-gem.png' },
}

export interface Produce {
  readonly good: GoodId
  /** Goods a day from one full adult. A fed one makes half. */
  readonly perDay: number
  /** A prop that must stand on the farm for this to be made at all (truffles need an oak). */
  readonly needsProp?: string
}

/**
 * What a well-fed resident makes. Goods are kept in its house until the player
 * collects them, and are cheap on purpose: selling the young a herd raises is
 * still the real income, and goods are the steady drip on top. A house that is
 * full lets the rest spoil into scraps, which is what pigs and raccoons eat.
 */
export const PRODUCE: Readonly<Record<string, Produce>> = {
  cow: { good: 'milk', perDay: 1 },
  sheep: { good: 'wool', perDay: 0.5 },
  chicken: { good: 'egg', perDay: 1 },
  duck: { good: 'duck-egg', perDay: 0.6 },
  goose: { good: 'down', perDay: 0.5 },
  pig: { good: 'truffle', perDay: 0.5, needsProp: 'oak' },
  raccoon: { good: 'trinket', perDay: 0.3 },
  starhorn: { good: 'gem', perDay: 1 },
}

/** Goods one house can hold before the rest spoils. */
export const HOUSE_GOODS_CAPACITY = 12

/** One spoiled good becomes this many meals of scraps. */
export const SPOILED_SCRAPS = 0.5

/** Produce rate for a fullness: full animals make the most, hungry ones none. */
export function produceRate(fullness: number): number {
  const level = hungerLevel(fullness)
  return level === 'full' ? 1 : level === 'fed' ? 0.5 : 0
}

// ----------------------------------------------------------- the larder --

/** One animal at the table this tick. */
export interface Eater {
  readonly id: string
  readonly species: string
  fullness: number
  /** Babies eat half. */
  readonly baby: boolean
}

export interface FoodReport {
  readonly food: FoodId
  /** Meals in the larder now, and the most it holds. */
  readonly stock: number
  readonly capacity: number
  /** Meals a day the farm grows of it. */
  readonly supply: number
  /** Meals a day the animals that eat it want. */
  readonly demand: number
}

export interface FoodWebState {
  readonly stocks: Readonly<Partial<Record<FoodId, number>>>
}

export interface FoodWeb {
  /**
   * Regrow every larder toward its supply, then feed the eaters in order. The
   * order matters: the first in line eat their fill, so a shortage falls on the
   * last. Fullness is written back onto each eater.
   */
  tick(eaters: readonly Eater[], farm: FarmState, deltaSeconds: number, boosts?: FoodBoosts): void
  report(): readonly FoodReport[]
  stock(food: FoodId): number
  /** Put meals in a larder: bought feed, or spoiled goods into scraps. */
  add(food: FoodId, meals: number): void
  exportState(): FoodWebState
  importState(state: FoodWebState | null | undefined): void
  reset(): void
}

/** Most meals a feed pantry holds, so a fortune of sacks cannot be banked forever. */
export const FEED_CAPACITY = 200

/**
 * One feed sack from the Larder panel: this many meals for this many coins.
 * Feed deliberately costs more than the goods it keeps coming (a cow eats
 * 1.5 meals a day, so a day of feed is 4.5 coins against 2 coins of
 * milk), so it carries a herd through a shortage but never prints money.
 */
export const FEED_SACK_MEALS = 10
export const FEED_SACK_PRICE = 30

/** Most meals of scraps the farm can pile up from spoiled goods. */
export const SCRAPS_CAPACITY = 40

export function createFoodWeb(): FoodWeb {
  const stocks = new Map<FoodId, number>()
  const supplies = new Map<FoodId, number>()
  const demands = new Map<FoodId, number>()

  const capacityOf = (food: FoodId): number => {
    if (food === 'feed') return FEED_CAPACITY
    // Scraps also hold spoiled goods, so give them at least a little room.
    if (food === 'scraps') return Math.max(6, (supplies.get(food) ?? 0) * LARDER_DAYS)
    return (supplies.get(food) ?? 0) * LARDER_DAYS
  }

  return {
    tick(eaters, farm, deltaSeconds, boosts = {}) {
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      for (const food of GROWN_FOODS) {
        const supply = foodSupply(food, farm, boosts)
        supplies.set(food, supply)
        const capacity = capacityOf(food)
        const stock = stocks.get(food) ?? capacity
        // Regrowth stops at the larder's size, but anything already over it
        // (spoiled goods tipped into scraps) stays until it is eaten. A larder
        // whose field shrank is cut back to the new size.
        if (stock < capacity) stocks.set(food, Math.min(capacity, stock + (supply / DAY_LENGTH_SECONDS) * dt))
        else if (food !== 'scraps') stocks.set(food, capacity)
      }
      demands.clear()
      for (const eater of eaters) {
        const diet = DIETS[eater.species]
        if (!diet) continue
        const appetite = diet.appetite * (eater.baby ? BABY_APPETITE : 1)
        // Every belly empties at the same pace; a bigger appetite costs more meals to refill.
        eater.fullness = Math.max(0, eater.fullness - dt / BELLY_SECONDS)
        const first = diet.foods[0]
        demands.set(first, (demands.get(first) ?? 0) + appetite)
        if (first === 'prey' || eater.fullness >= EAT_BELOW) continue
        let want = Math.min(1 - eater.fullness, EAT_RATE * dt)
        for (const food of diet.foods) {
          if (want <= 0) break
          if (food === 'prey') continue
          const stock = stocks.get(food) ?? 0
          if (stock <= 0) continue
          const meals = Math.min(stock, want * appetite)
          stocks.set(food, stock - meals)
          const gained = meals / appetite
          eater.fullness = Math.min(1, eater.fullness + gained)
          want -= gained
        }
      }
    },
    report() {
      return FOOD_IDS.filter((food) => food !== 'prey').map((food) => ({
        food,
        stock: stocks.get(food) ?? 0,
        capacity: capacityOf(food),
        supply: supplies.get(food) ?? 0,
        demand: demands.get(food) ?? 0,
      }))
    },
    stock: (food) => stocks.get(food) ?? 0,
    add(food, meals) {
      if (!Number.isFinite(meals) || meals <= 0 || food === 'prey') return
      const limit = food === 'scraps' ? Math.max(capacityOf(food), SCRAPS_CAPACITY) : capacityOf(food)
      stocks.set(food, Math.min(limit, (stocks.get(food) ?? 0) + meals))
    },
    exportState() {
      const out: Partial<Record<FoodId, number>> = {}
      for (const [food, stock] of stocks) if (stock > 0) out[food] = Math.round(stock * 1000) / 1000
      return { stocks: out }
    },
    importState(state) {
      stocks.clear()
      for (const food of FOOD_IDS) {
        const value = state?.stocks?.[food]
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) stocks.set(food, value)
      }
    },
    reset() {
      stocks.clear()
      supplies.clear()
      demands.clear()
    },
  }
}

/**
 * The serving order: residents who have been here longest eat first. Animal
 * ids count up as animals are made, so the number in the id is a stable age
 * that survives a save.
 */
export function servingOrder<T extends { readonly id: string }>(eaters: readonly T[]): T[] {
  const age = (id: string): number => Number(id.replace(/^\D+/, '')) || 0
  return [...eaters].sort((a, b) => age(a.id) - age(b.id))
}
