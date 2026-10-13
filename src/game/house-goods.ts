/**
 * Goods stored in a house: the pure rules behind the "Stored goods" block of
 * the prop card (`src/ui/prop-card-dom.ts`). Counts come from
 * `AnimalLife.goodsIn`; the prices and names from `GOODS`. Kept free of the DOM
 * so the sums and the wording are testable in `tests/house-goods.test.mjs`.
 */
import { GOODS, HOUSE_GOODS_CAPACITY, PRODUCE, type GoodId } from './animal-diet'

export type GoodsCounts = Readonly<Partial<Record<GoodId, number>>>

export interface GoodsRow {
  readonly good: GoodId
  readonly count: number
  readonly name: string
  readonly icon: string
  /** Coins for the whole row. */
  readonly value: number
}

export interface CollectedGood {
  readonly good: GoodId
  readonly count: number
}

const GOOD_ORDER = Object.keys(GOODS) as GoodId[]

function wholeCount(count: number | undefined): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count as number)) : 0
}

/** Goods in the house, counting only real ones. */
export function goodsTotal(goods: GoodsCounts): number {
  let total = 0
  for (const good of GOOD_ORDER) total += wholeCount(goods[good])
  return total
}

/** Coins the stock (or a collected list) is worth. Gems are counted, not sold, so they add nothing. */
export function goodsValue(goods: GoodsCounts | readonly CollectedGood[]): number {
  const rows: readonly CollectedGood[] = Array.isArray(goods)
    ? (goods as readonly CollectedGood[])
    : GOOD_ORDER.map((good) => ({ good, count: (goods as GoodsCounts)[good] ?? 0 }))
  let total = 0
  for (const row of rows) total += wholeCount(row.count) * (GOODS[row.good]?.value ?? 0)
  return total
}

/** One row per good present, most valuable row first, then by name, so the card does not shuffle. */
export function goodsRows(goods: GoodsCounts): GoodsRow[] {
  const rows: GoodsRow[] = []
  for (const good of GOOD_ORDER) {
    const count = wholeCount(goods[good])
    if (count <= 0) continue
    const spec = GOODS[good]
    rows.push({ good, count, name: count === 1 ? spec.name : spec.plural, icon: spec.icon, value: count * spec.value })
  }
  return rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

/** A string that changes exactly when the card's goods block would draw differently. */
export function goodsSignature(goods: GoodsCounts): string {
  return goodsRows(goods).map((row) => `${row.good}:${row.count}`).join(',')
}

export function goodsFull(goods: GoodsCounts, capacity: number = HOUSE_GOODS_CAPACITY): boolean {
  return goodsTotal(goods) >= capacity
}

/** The meter's fill, 0..1. */
export function goodsFill(goods: GoodsCounts, capacity: number = HOUSE_GOODS_CAPACITY): number {
  return capacity > 0 ? Math.min(1, goodsTotal(goods) / capacity) : 0
}

function joinList(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "3 milk", "1 egg": lower-cased so it reads in a sentence. */
function countPhrase(good: GoodId, count: number): string {
  const spec = GOODS[good]
  return `${count} ${(count === 1 ? spec.name : spec.plural).toLowerCase()}`
}

/** The notification after a collect, e.g. "Collected 3 milk and 2 eggs · +8 coins". */
export function formatCollected(collected: readonly CollectedGood[], coins: number): string {
  const parts = collected
    .filter((row) => wholeCount(row.count) > 0 && GOODS[row.good])
    .map((row) => countPhrase(row.good, wholeCount(row.count)))
  if (parts.length === 0) return 'Nothing to collect yet'
  return `Collected ${joinList(parts)} · +${coins} ${coins === 1 ? 'coin' : 'coins'}`
}

/**
 * The one-line hint on a house with nothing stored, e.g. "Fed cows make milk
 * here." `species` is the plural display name per species id, supplied by the
 * caller so this file needs no animal catalog. Species that make nothing worth
 * collecting (gems) or nothing at all are left out.
 */
export function makesHint(species: readonly { readonly id: string; readonly plural: string }[]): string | null {
  const parts: string[] = []
  for (const entry of species) {
    const produce = PRODUCE[entry.id]
    if (!produce || GOODS[produce.good].value <= 0) continue
    parts.push(`${entry.plural.toLowerCase()} make ${GOODS[produce.good].plural.toLowerCase()}`)
  }
  return parts.length === 0 ? null : `Fed ${joinList(parts)} here.`
}
