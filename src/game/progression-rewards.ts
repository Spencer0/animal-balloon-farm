export interface ExpansionTarget {
  readonly level: number
  readonly isAnimating: boolean
}

/** Start no more than one queued parcel reveal per frame. */
export function startNextEarnedExpansion(
  expansion: ExpansionTarget & { expand(): unknown },
  progressionLevel: number,
): boolean {
  if (expansion.isAnimating || expansion.level >= Math.max(0, Math.floor(progressionLevel))) return false
  return expansion.expand() !== null
}
