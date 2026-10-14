/**
 * Green Thumb ribbons and garden helpers: do a chore by hand once, then hire
 * someone to do it for you.
 *
 * A species that cares through minigames (`PlantSpecies.minigames`) asks for
 * each chore by opening a little game that can be lost. Winning a chore's game
 * once for a species earns that species a ribbon for it. A ribbon puts the
 * chore's helper on Pip's shelf for that species, and a hired helper answers
 * that chore on every plant of that species from then on:
 *
 *   water  Pet Raincloud     a tame cloud drifts over and rains on it
 *   pest   Ladybug Lodge     a squad of ladybugs flies over and eats the beetles
 *   prune  Hedgehog Snipper  a hedgehog with shears pops up and tidies the shoots
 *
 * Pure rules: no Three.js and no DOM, so they are tested in
 * `tests/plant-helpers.test.mjs`.
 */
import { PLANT_CARE_KINDS, plantSpecies, type PlantCare, type PlantId } from './plants'

export type CareHelperId = 'pet-raincloud' | 'ladybug-lodge' | 'hedgehog-snipper'

export interface CareHelper {
  readonly id: CareHelperId
  readonly care: PlantCare
  readonly name: string
  /** Shop copy, written for the species it is bought for. */
  readonly blurb: (speciesName: string) => string
  /** What the ribbon is for, e.g. "the rain cloud". */
  readonly chore: string
  readonly basePrice: number
}

export const CARE_HELPERS: Readonly<Record<PlantCare, CareHelper>> = {
  water: {
    id: 'pet-raincloud', care: 'water', name: 'Pet Raincloud', chore: 'the rain cloud', basePrice: 18,
    blurb: (species) => `A sleepy little cloud that follows your ${species} around and rains on it whenever it gets thirsty.`,
  },
  pest: {
    id: 'ladybug-lodge', care: 'pest', name: 'Ladybug Lodge', chore: 'the beetle swat', basePrice: 28,
    blurb: (species) => `A tiny hotel for ladybugs. When beetles come for your ${species}, the guests fly out and eat them.`,
  },
  prune: {
    id: 'hedgehog-snipper', care: 'prune', name: 'Hedgehog Snipper', chore: 'the snipping', basePrice: 36,
    blurb: (species) => `A tidy hedgehog with a pair of shears. It pops up and trims your ${species} whenever a shoot runs wild.`,
  },
}

/**
 * Helpers for pricier plants cost more: the multiplier is the species' seed
 * price over a blueberry's, never below one.
 */
const PRICE_REFERENCE_SEED = 12

export function helperPrice(care: PlantCare, seedPrice: number): number {
  const scale = Math.max(1, seedPrice / PRICE_REFERENCE_SEED)
  return Math.round(CARE_HELPERS[care].basePrice * scale)
}

/**
 * How a chore was answered decides whether it earns a Green Thumb ribbon: only
 * winning a real minigame does. A plain tap (a game not built yet) answers the
 * care but earns nothing.
 */
export type CareAnswer = 'game-won' | 'plain-tap'

export function earnsRibbon(answer: CareAnswer): boolean {
  return answer === 'game-won'
}

export type HelperStatus = 'needs-ribbon' | 'available' | 'hired'

export interface HelperQuote {
  readonly species: PlantId
  readonly care: PlantCare
  readonly helper: CareHelper
  readonly status: HelperStatus
  readonly price: number
}

export interface GreenThumbState {
  /** `species:care` keys, e.g. `blueberry:pest`. */
  readonly ribbons: readonly string[]
  readonly helpers: readonly string[]
}

export interface GreenThumb {
  hasRibbon(species: PlantId, care: PlantCare): boolean
  /** Record a won minigame. True only the first time, when the ribbon is new. */
  earnRibbon(species: PlantId, care: PlantCare): boolean
  isHired(species: PlantId, care: PlantCare): boolean
  quote(species: PlantId, care: PlantCare, seedPrice: number): HelperQuote
  /**
   * Hire a helper if the ribbon is earned, it is not hired yet, and `pay`
   * accepts the price. `pay` is only called when everything else allows it.
   */
  hire(species: PlantId, care: PlantCare, seedPrice: number, pay: (price: number) => boolean): HelperQuote
  /** How many ribbons a species holds, 0..3. */
  ribbonCount(species: PlantId): number
  exportState(): GreenThumbState
  importState(state: unknown): void
}

const key = (species: PlantId, care: PlantCare): string => `${species}:${care}`

function validKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const [species, care, extra] = value.split(':')
  if (extra !== undefined || !PLANT_CARE_KINDS.includes(care as PlantCare)) return false
  try {
    return plantSpecies(species as PlantId).minigames === true
  } catch {
    return false
  }
}

export function createGreenThumb(): GreenThumb {
  const ribbons = new Set<string>()
  const helpers = new Set<string>()

  function quote(species: PlantId, care: PlantCare, seedPrice: number): HelperQuote {
    const status: HelperStatus = helpers.has(key(species, care)) ? 'hired' : ribbons.has(key(species, care)) ? 'available' : 'needs-ribbon'
    return { species, care, helper: CARE_HELPERS[care], status, price: helperPrice(care, seedPrice) }
  }

  return {
    hasRibbon: (species, care) => ribbons.has(key(species, care)),
    earnRibbon(species, care): boolean {
      const entry = key(species, care)
      if (ribbons.has(entry)) return false
      ribbons.add(entry)
      return true
    },
    isHired: (species, care) => helpers.has(key(species, care)),
    quote,
    hire(species, care, seedPrice, pay): HelperQuote {
      const current = quote(species, care, seedPrice)
      if (current.status !== 'available' || !pay(current.price)) return current
      helpers.add(key(species, care))
      return quote(species, care, seedPrice)
    },
    ribbonCount: (species) => PLANT_CARE_KINDS.filter((care) => ribbons.has(key(species, care))).length,
    exportState: () => ({ ribbons: [...ribbons].sort(), helpers: [...helpers].sort() }),
    importState(state): void {
      ribbons.clear()
      helpers.clear()
      if (typeof state !== 'object' || state === null) return
      const record = state as Record<string, unknown>
      const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter(validKey) : [])
      for (const entry of list(record['ribbons'])) ribbons.add(entry)
      // A helper is only ever hired with its ribbon, so a save cannot hold one without it.
      for (const entry of list(record['helpers'])) if (ribbons.has(entry)) helpers.add(entry)
    },
  }
}
