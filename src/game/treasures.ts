/**
 * Treasures: end-game upgrades bought with star gems.
 *
 * Coins buy tools, props and land. Star gems, the second currency, come only
 * from the starhorn (see `animal-diet.ts` PRODUCE and `docs/FOOD_WEB.md`) and
 * buy the treasures below: one of each, each a small permanent edge for a farm
 * that has already learned the food web. They are kept apart from
 * `tool-unlocks.ts`'s coin upgrades on purpose: no farmer level gates them, the
 * price is in gems, and the Farmer Level cards must not list them.
 *
 * Pure, like the rest of `src/game/`: no Three.js, no DOM. Tested in
 * `tests/treasures.test.mjs`. The effects are numbers (`treasureEffects`); the
 * scene applies them (`applyTreasureEffects` in `main.ts`).
 */

import type { FoodBoosts } from './animal-diet'
import type { Wallet } from './sales'

export type TreasureId = 'helium-pump' | 'clover-charm' | 'rain-barrel' | 'golden-pail'

export interface TreasureDefinition {
  readonly id: TreasureId
  readonly name: string
  readonly blurb: string
  readonly color: string
  /** Star gems. */
  readonly price: number
}

export const TREASURE_ORDER: readonly TreasureId[] = ['helium-pump', 'clover-charm', 'rain-barrel', 'golden-pail']

export const TREASURE_CATALOG: Readonly<Record<TreasureId, TreasureDefinition>> = {
  'helium-pump': {
    id: 'helium-pump',
    name: 'Helium Pump',
    blurb: 'A brass pump for the barnyard. A starving balloon leaks its helium at half speed, so a lean spell no longer ends in a flat one.',
    color: '#8fb8d9',
    price: 3,
  },
  'clover-charm': {
    id: 'clover-charm',
    name: 'Clover Charm',
    blurb: 'A lucky four-leaf charm on the gate. Every food the farm grows, grass, weeds, seeds and nectar alike, yields 25% more.',
    color: '#6fb260',
    price: 5,
  },
  'rain-barrel': {
    id: 'rain-barrel',
    name: 'Rain Barrel',
    blurb: 'Catches every shower and sprinkles it on the lawn. Grass grows 50% more meals for the grazers.',
    color: '#77c9d5',
    price: 8,
  },
  'golden-pail': {
    id: 'golden-pail',
    name: 'Golden Pail',
    blurb: 'A pail that turns whatever it carries a little precious. Goods are worth double when you collect them.',
    color: '#e4bd58',
    price: 6,
  },
}

export function isTreasureId(value: unknown): value is TreasureId {
  return typeof value === 'string' && value in TREASURE_CATALOG
}

/** What the player has bought. One of each, so ownership is a set. */
export interface TreasureLedger {
  owns(id: TreasureId): boolean
  /** Own it. Returns false when it was already owned. */
  grant(id: TreasureId): boolean
  /** Ids owned, in catalog order. */
  owned(): readonly TreasureId[]
  /** Replace ownership with a saved list; unknown ids are dropped. */
  restore(ids: readonly unknown[]): void
  reset(): void
}

export function createTreasureLedger(): TreasureLedger {
  const owned = new Set<TreasureId>()
  return {
    owns: (id) => owned.has(id),
    grant(id) {
      if (owned.has(id)) return false
      owned.add(id)
      return true
    },
    owned: () => TREASURE_ORDER.filter((id) => owned.has(id)),
    restore(ids) {
      owned.clear()
      for (const id of ids) if (isTreasureId(id)) owned.add(id)
    },
    reset: () => owned.clear(),
  }
}

export interface TreasureEffects {
  /** What the grown foods are multiplied by: `all` for every food, `grass` on top of it for lawn. */
  readonly foodBoosts: Required<FoodBoosts>
  /** How fast a starving balloon leaks helium, as a share of normal. */
  readonly starveLeakFactor: number
  /**
   * What a good is worth when it is collected, as a multiple of its base price (the Golden Pail doubles it).
   * The collect button multiplies a good's coin value by this.
   */
  readonly goodsValueMultiplier: number
}

export const NO_TREASURE_EFFECTS: TreasureEffects = {
  foodBoosts: { all: 1, grass: 1 },
  starveLeakFactor: 1,
  goodsValueMultiplier: 1,
}

/** The multipliers a set of owned treasures gives. Unowned treasures change nothing. */
export function treasureEffects(owned: Iterable<TreasureId>): TreasureEffects {
  const has = new Set(owned)
  return {
    foodBoosts: {
      all: has.has('clover-charm') ? 1.25 : 1,
      grass: has.has('rain-barrel') ? 1.5 : 1,
    },
    starveLeakFactor: has.has('helium-pump') ? 0.5 : 1,
    goodsValueMultiplier: has.has('golden-pail') ? 2 : 1,
  }
}

export type TreasureFailure = 'owned' | 'poor'

export interface TreasurePurchase {
  readonly ok: boolean
  readonly failure: TreasureFailure | null
  readonly price: number
}

/** Buy a treasure with gems. Gems leave the purse only when the treasure is granted. */
export function purchaseTreasure(gems: Wallet, ledger: TreasureLedger, id: TreasureId): TreasurePurchase {
  const price = TREASURE_CATALOG[id].price
  if (ledger.owns(id)) return { ok: false, failure: 'owned', price }
  if (gems.debit(price) === null) return { ok: false, failure: 'poor', price }
  ledger.grant(id)
  return { ok: true, failure: null, price }
}
