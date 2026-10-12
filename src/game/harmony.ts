/**
 * Harmony: how good the farm is, as one number from 0 to 100.
 *
 * Pure, like the rest of `src/game/`. A big farm is not automatically a good
 * one: forty cows on a lawn that feeds ten is a mess. Harmony rewards what the
 * food web is about:
 *
 *   variety   how many species live here                        (35 points)
 *   balance   how evenly they share the farm (Pielou evenness)   (25 points)
 *   fed       how many residents are fed or full                 (30 points)
 *   links     predators living off prey on the farm              (10 points)
 *
 * Every part is a share, so the score means the same on a starter plot and on
 * a farm with fifteen deeds. The starhorn only comes to a farm in harmony.
 */

import { hungerLevel, type HungerLevel } from './animal-diet'
import { PREY_OF } from './predator'

export interface HarmonyResident {
  readonly species: string
  readonly fullness: number
}

export interface HarmonyReport {
  /** 0..100, rounded. */
  readonly score: number
  readonly variety: number
  readonly balance: number
  readonly fed: number
  readonly links: number
  /** Resident species, and how many of each. */
  readonly species: number
  readonly residents: number
  /** Predator and prey pairs both living on the farm, e.g. "owl → chicken". */
  readonly activeLinks: readonly string[]
  /** The most common species when it holds more than half the farm, else null: the thing to thin out. */
  readonly crowding: string | null
  /** Residents per hunger rung. */
  readonly hunger: Readonly<Record<HungerLevel, number>>
}

export const HARMONY_WEIGHTS = { variety: 35, balance: 25, fed: 30, links: 10 } as const

/** Species count that earns the whole variety share. */
export const HARMONY_FULL_VARIETY = 8

/** Predator and prey pairs that earn the whole links share. */
export const HARMONY_FULL_LINKS = 2

/** Harmony tiers, for the HUD's word and the journal. */
export function harmonyTier(score: number): string {
  if (score >= 85) return 'Flourishing'
  if (score >= 70) return 'In harmony'
  if (score >= 50) return 'Settling'
  if (score >= 25) return 'Lopsided'
  return 'Getting started'
}

export function measureHarmony(residents: readonly HarmonyResident[]): HarmonyReport {
  const counts = new Map<string, number>()
  const hunger: Record<HungerLevel, number> = { full: 0, fed: 0, hungry: 0, starving: 0 }
  for (const resident of residents) {
    counts.set(resident.species, (counts.get(resident.species) ?? 0) + 1)
    hunger[hungerLevel(resident.fullness)] += 1
  }
  const total = residents.length
  const species = counts.size
  const variety = Math.min(1, species / HARMONY_FULL_VARIETY)
  let balance = 0
  if (species === 1) balance = 0.25
  else if (species > 1) {
    let entropy = 0
    for (const count of counts.values()) {
      const share = count / total
      entropy -= share * Math.log(share)
    }
    balance = entropy / Math.log(species)
  }
  const fed = total > 0 ? (hunger.full + hunger.fed) / total : 0
  const activeLinks: string[] = []
  for (const [predator, prey] of Object.entries(PREY_OF)) {
    if (!counts.has(predator)) continue
    for (const target of prey) if (counts.has(target)) activeLinks.push(`${predator} → ${target}`)
  }
  const links = Math.min(1, activeLinks.length / HARMONY_FULL_LINKS)
  let crowding: string | null = null
  for (const [name, count] of counts) if (species > 1 && count / total > 0.5) crowding = name
  const raw = total === 0 ? 0
    : HARMONY_WEIGHTS.variety * variety + HARMONY_WEIGHTS.balance * balance + HARMONY_WEIGHTS.fed * fed + HARMONY_WEIGHTS.links * links
  return {
    score: Math.round(Math.max(0, Math.min(100, raw))),
    variety, balance, fed, links,
    species, residents: total, activeLinks, crowding, hunger,
  }
}
