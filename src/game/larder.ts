/**
 * The Larder panel's numbers, as plain data.
 *
 * Pure, like the rest of `src/game/`: no DOM, no Three.js. The panel feeds this
 * the food report and the resident list and gets back rows to draw, so the
 * green/amber call and the shortage hint can be tested without a browser.
 */

import {
  DIETS,
  FEED_CAPACITY,
  FOOD_IDS,
  FOOD_LABELS,
  GROWN_FOODS,
  type FoodId,
  type FoodReport,
} from './animal-diet'
import { HARMONY_WEIGHTS, type HarmonyReport } from './harmony'

/** A demand within this much of the supply still counts as keeping up. */
export const SHORTAGE_SLACK = 0.05

export interface LarderEater {
  readonly species: string
  readonly count: number
  readonly name: string
}

export interface LarderRow {
  readonly food: FoodId
  readonly label: string
  readonly icon: string
  readonly stock: number
  readonly capacity: number
  /** Stock as a share of capacity, 0..1. */
  readonly fill: number
  readonly supply: number
  readonly demand: number
  /** ok: the farm grows enough; short: it is eaten faster than it grows; bought: feed, which never regrows. */
  readonly status: 'ok' | 'short' | 'bought'
  readonly eaters: readonly LarderEater[]
}

export function foodIcon(food: FoodId): string {
  return `assets/goods/food-${food}.png`
}

/** One decimal, with no trailing ".0": 18, 4.5, 0.3. */
export function oneDecimal(value: number): string {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Residents that eat a food, species by species, most numerous first. */
export function eatersOf(
  food: FoodId,
  residents: readonly { readonly species: string }[],
  nameOf: (species: string) => string = (species) => species,
): LarderEater[] {
  const counts = new Map<string, number>()
  for (const resident of residents) counts.set(resident.species, (counts.get(resident.species) ?? 0) + 1)
  const out: LarderEater[] = []
  for (const [species, count] of counts) {
    if (DIETS[species]?.foods.includes(food)) out.push({ species, count, name: nameOf(species) })
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * One row per food worth showing: anything the farm grows, anything stocked,
 * anything a current resident eats, and the feed pantry always. Prey is not a
 * larder, so it has no row.
 */
export function buildLarderRows(
  report: readonly FoodReport[],
  residents: readonly { readonly species: string }[],
  nameOf?: (species: string) => string,
): LarderRow[] {
  const byFood = new Map(report.map((entry) => [entry.food, entry]))
  const rows: LarderRow[] = []
  for (const food of FOOD_IDS) {
    if (food === 'prey') continue
    const entry = byFood.get(food)
    const eaters = eatersOf(food, residents, nameOf)
    const supply = entry?.supply ?? 0
    const demand = entry?.demand ?? 0
    const stock = entry?.stock ?? 0
    const capacity = entry?.capacity ?? (food === 'feed' ? FEED_CAPACITY : 0)
    if (food !== 'feed' && supply <= 0 && demand <= 0 && stock <= 0 && eaters.length === 0) continue
    rows.push({
      food,
      label: FOOD_LABELS[food],
      icon: foodIcon(food),
      stock,
      capacity,
      fill: capacity > 0 ? Math.max(0, Math.min(1, stock / capacity)) : 0,
      supply,
      demand,
      status: food === 'feed' ? 'bought' : demand > supply + SHORTAGE_SLACK ? 'short' : 'ok',
      eaters,
    })
  }
  return rows
}

/** What the player can do about a shortage of each grown food. */
const REMEDY: Readonly<Partial<Record<FoodId, string>>> = {
  grass: 'Grow lawn',
  meadow: 'Sow tall grass',
  pondweed: 'Dig the pond bigger or plant lilies',
  seeds: 'Plant more flowers',
  blooms: 'Plant more flowers',
  scraps: 'Add garbage cans',
  worms: 'Leave more bare dirt',
}

/** The worst shortage as one plain sentence, or null when every food keeps up. */
export function shortageHint(rows: readonly LarderRow[]): string | null {
  let worst: LarderRow | null = null
  for (const row of rows) {
    if (row.status !== 'short' || !GROWN_FOODS.includes(row.food)) continue
    if (!worst || row.demand - row.supply > worst.demand - worst.supply) worst = row
  }
  if (!worst) return null
  const grown = worst.supply <= 0.05 ? 'none is grown' : `${oneDecimal(worst.supply)} a day is grown`
  const canBuy = worst.eaters.some((eater) => DIETS[eater.species]?.foods.includes('feed'))
  const fixes = [REMEDY[worst.food] ?? 'Grow more', 'thin the herd', ...(canBuy ? ['buy feed'] : [])]
  const list = fixes.length > 2 ? `${fixes.slice(0, -1).join(', ')}, or ${fixes[fixes.length - 1]}` : fixes.join(' or ')
  return `${worst.label}: ${grown}, ${oneDecimal(worst.demand)} is eaten. ${list}.`
}

const IRREGULAR_PLURALS: Readonly<Record<string, string>> = { sheep: 'Sheep', mouse: 'Mice', goose: 'Geese' }

/** "Cow" becomes "Cows", "Mouse" becomes "Mice": enough for every species on the farm. */
export function pluralName(species: string, name: string): string {
  return IRREGULAR_PLURALS[species] ?? (name.endsWith('s') ? name : `${name}s`)
}

export interface HarmonyPart {
  readonly key: 'variety' | 'balance' | 'fed' | 'links'
  readonly label: string
  /** Points earned and the most this part can give. */
  readonly points: number
  readonly max: number
  /** A plain note with the current value. */
  readonly note: string
}

/** The four parts of Harmony with their points and a note, for the chip's tooltip and the panel. */
export function harmonyParts(
  report: HarmonyReport,
  nameOf: (species: string) => string = (species) => species,
): HarmonyPart[] {
  const part = (key: HarmonyPart['key'], label: string, share: number, note: string): HarmonyPart => ({
    key, label, points: Math.round(share * HARMONY_WEIGHTS[key]), max: HARMONY_WEIGHTS[key], note,
  })
  const crowd = report.crowding ? `${pluralName(report.crowding, nameOf(report.crowding))} are over half the farm` : null
  const eating = report.hunger.full + report.hunger.fed
  const links = report.activeLinks.length
  return [
    part('variety', 'Variety', report.variety, `${report.species} species live here`),
    part('balance', 'Balance', report.balance, crowd ?? (report.species === 1 ? 'Only one kind of animal lives here' : report.species === 0 ? 'No residents yet' : 'Species share the farm evenly')),
    part('fed', 'Fed', report.fed, report.residents > 0 ? `${eating} of ${report.residents} residents are fed` : 'No residents yet'),
    part('links', 'Links', report.links, links > 0 ? `${links} predator and prey ${links === 1 ? 'link' : 'links'}` : 'No predator and prey pairs yet'),
  ]
}
