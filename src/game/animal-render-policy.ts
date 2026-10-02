export interface AnimalRenderCandidate {
  readonly id: string
  readonly projectedHeight: number
  readonly distance: number
  readonly priority: number
  readonly interactive: boolean
}

export interface AnimalRenderPolicy {
  readonly detailedBudget: number
  readonly minimumDetailedHeight: number
}

export const ANIMAL_RENDER_POLICY: AnimalRenderPolicy = {
  detailedBudget: 16,
  minimumDetailedHeight: 12,
}

/**
 * Choose full-detail residents from candidates already deemed in-view. The
 * cap prevents a close zoom from promoting the whole herd and recreating the
 * draw-call problem; active interactions can temporarily claim budget first.
 */
export function chooseDetailedAnimals(
  candidates: readonly AnimalRenderCandidate[],
  policy: AnimalRenderPolicy = ANIMAL_RENDER_POLICY,
): ReadonlySet<string> {
  const budget = Math.max(0, Math.floor(policy.detailedBudget))
  const ranked = candidates
    .filter((candidate) => Number.isFinite(candidate.projectedHeight)
      && (candidate.interactive || candidate.projectedHeight >= policy.minimumDetailedHeight))
    .sort((a, b) => Number(b.interactive) - Number(a.interactive)
      || b.priority - a.priority
      || b.projectedHeight - a.projectedHeight
      || a.distance - b.distance
      || a.id.localeCompare(b.id))
  return new Set(ranked.slice(0, budget).map((candidate) => candidate.id))
}
