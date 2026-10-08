/**
 * Plant info card: the pure rules behind the click-a-plant popup.
 *
 * Twin of `src/game/animal-card.ts`. The card itself is Three.js
 * (`src/ui/plant-card.ts`) and only draws what this module says is true, so the
 * growth chip, the care line and the always-sellable rule are testable in
 * `tests/plant-card.test.mjs` without a browser. The two-press sell confirm is
 * shared with the animal card (`armSellConfirm` and friends).
 */

export type PlantCareNeed = 'water' | 'prune' | null

export type PlantGrowthStage = 'Seedling' | 'Growing' | 'Mature'

/** Below this a plant is still a seedling. */
export const SEEDLING_UNTIL = 0.34

/** Growth is a 0..1 fraction; anything else is clamped so a bad value cannot break the meter. */
export function plantGrowthLevel(growth: number): number {
  return Number.isFinite(growth) ? Math.min(1, Math.max(0, growth)) : 0
}

export function plantGrowthStage(growth: number): PlantGrowthStage {
  const level = plantGrowthLevel(growth)
  if (level >= 1) return 'Mature'
  return level < SEEDLING_UNTIL ? 'Seedling' : 'Growing'
}

/** Chip copy, e.g. "Growing · 62%". A mature plant just says "Mature". */
export function plantStageChip(growth: number): string {
  const stage = plantGrowthStage(growth)
  return stage === 'Mature' ? 'Mature' : `${stage} · ${Math.round(plantGrowthLevel(growth) * 100)}%`
}

/** The word written beside the growth meter. */
export function plantGrowthStatus(growth: number): string {
  return plantGrowthStage(growth) === 'Mature' ? 'fully grown' : `${Math.round(plantGrowthLevel(growth) * 100)}% grown`
}

/** One sentence on what the plant wants right now. */
export function plantCareLine(growth: number, care: PlantCareNeed): string {
  if (care === 'water') return 'Thirsty: tap its water drop to give it a drink.'
  if (care === 'prune') return 'A stray shoot needs pinching back.'
  return plantGrowthStage(growth) === 'Mature' ? 'Fully grown and thriving.' : 'Growing happily; nothing needed right now.'
}
