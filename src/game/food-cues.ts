/**
 * What the food web looks like from outside: the pure rules behind the hunger
 * bubbles, the goods badges over houses and the overgrazed lawn. No Three.js
 * and no DOM, so the rules are testable in node; the scene files under
 * `src/scene/` only draw what these return.
 */
import { GOODS, HOUSE_GOODS_CAPACITY, type GoodId, type HungerLevel } from './animal-diet'

// ------------------------------------------------------------ hunger bubbles --

export type HungerBubbleKind = 'hunger' | 'starving'

/** The thought bubble an animal wears, or null when it is fed well enough to show nothing. */
export function hungerBubbleKind(hunger: HungerLevel): HungerBubbleKind | null {
  if (hunger === 'starving') return 'starving'
  if (hunger === 'hungry') return 'hunger'
  return null
}

// ------------------------------------------------------------- goods badges --

export interface GoodsBadge {
  /** The good with the most stock in the house (ties go to the order of `GOODS`). */
  readonly good: GoodId
  /** How many of that good are stored. */
  readonly count: number
  /** Everything stored, all goods together. */
  readonly total: number
  /** The house is at capacity, so the next good spoils into scraps. */
  readonly full: boolean
}

const GOOD_ORDER = Object.keys(GOODS) as GoodId[]

/** The badge a house shows over its roof for the goods it holds, or null when it holds none. */
export function goodsBadge(goods: Readonly<Partial<Record<GoodId, number>>> | null | undefined, capacity = HOUSE_GOODS_CAPACITY): GoodsBadge | null {
  if (!goods) return null
  let best: GoodId | null = null
  let bestCount = 0
  let total = 0
  for (const good of GOOD_ORDER) {
    const count = Math.floor(goods[good] ?? 0)
    if (!(count > 0)) continue
    total += count
    if (count > bestCount) {
      best = good
      bestCount = count
    }
  }
  if (!best) return null
  return { good: best, count: bestCount, total, full: total >= capacity }
}

/** A string that changes exactly when the badge would be drawn differently. */
export function goodsBadgeKey(badge: GoodsBadge | null): string {
  return badge ? `${badge.good}:${badge.count}:${badge.full ? 1 : 0}` : ''
}

/** The count as printed on the badge: small numbers as they are, never wider than three characters. */
export function badgeCountLabel(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)))
}

// -------------------------------------------------------------- grazed lawn --

/** The lawn starts to look worn once its larder falls below this share of full. */
export const GRAZE_START = 0.5

/**
 * How overgrazed the lawn reads, 0 (lush) to 1 (straw), from the grass larder.
 * Nothing shows while the larder is at least half full; it eases in as it empties.
 * A farm with no grass supply at all (capacity 0) has nothing to graze.
 */
export function grazedness(stock: number, capacity: number): number {
  if (!(capacity > 0) || !Number.isFinite(stock)) return 0
  const fraction = Math.max(0, Math.min(1, stock / capacity))
  if (fraction >= GRAZE_START) return 0
  const t = 1 - fraction / GRAZE_START
  return t * t * (3 - 2 * t)
}

/** Move `current` toward `target` by an exponential ease; `rate` is 1 / time constant in seconds. */
export function easeToward(current: number, target: number, deltaSeconds: number, rate: number): number {
  if (!(deltaSeconds > 0)) return current
  const k = 1 - Math.exp(-rate * deltaSeconds)
  const next = current + (target - current) * k
  return Math.abs(target - next) < 0.001 ? target : next
}

/**
 * Grass colour multipliers (linear light) at full overgrazing. A blade's own
 * green times these lands near straw (#c9b26b); lerp from 1 by `grazedness`.
 */
export const STRAW_MULTIPLIER: readonly [number, number, number] = [3.0, 0.98, 1.35]

/** The material colour multiplier for a dryness 0..1, with snow lying on the lawn washing it out. */
export function grazingMultiplier(dryness: number, snowShare = 0): readonly [number, number, number] {
  const amount = Math.max(0, Math.min(1, dryness)) * (1 - Math.max(0, Math.min(1, snowShare)))
  return [
    1 + (STRAW_MULTIPLIER[0] - 1) * amount,
    1 + (STRAW_MULTIPLIER[1] - 1) * amount,
    1 + (STRAW_MULTIPLIER[2] - 1) * amount,
  ]
}
