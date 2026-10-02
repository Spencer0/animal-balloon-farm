export type ProgressAction =
  | 'visitSpecies'
  | 'residentSpecies'
  | 'breedSpecies'
  | 'growPlant'
  | 'growAnimal'
  | 'sellPlant'
  | 'sellAnimal'

export interface ProgressionConfig {
  readonly points: Readonly<Record<ProgressAction, number>>
  readonly firstExpansionAt: number
  readonly expansionInterval: number
}

export const PROGRESSION_CONFIG: ProgressionConfig = {
  points: {
    visitSpecies: 10,
    residentSpecies: 25,
    breedSpecies: 35,
    growPlant: 5,
    growAnimal: 5,
    sellPlant: 3,
    sellAnimal: 12,
  },
  firstExpansionAt: 50,
  expansionInterval: 50,
}

export interface ProgressLedger {
  readonly points: number
  readonly level: number
  readonly pointsToNextLevel: number
  award(action: ProgressAction, count?: number): number
  awardOnce(key: string, action: ProgressAction, count?: number): number
  pointsForNextExpansion(level?: number): number
  reset(): void
}

export function createProgressLedger(config: ProgressionConfig = PROGRESSION_CONFIG): ProgressLedger {
  if (!Number.isFinite(config.firstExpansionAt) || config.firstExpansionAt <= 0
    || !Number.isFinite(config.expansionInterval) || config.expansionInterval <= 0
    || Object.values(config.points).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Progression rewards and milestones must be finite and non-negative')
  }
  let points = 0
  const awarded = new Set<string>()
  const pointsForNextExpansion = (level = 0): number => config.firstExpansionAt + Math.max(0, Math.floor(level)) * config.expansionInterval
  const ledger: ProgressLedger = {
    get points() { return points },
    get level() {
      if (points < config.firstExpansionAt) return 0
      return Math.floor((points - config.firstExpansionAt) / config.expansionInterval) + 1
    },
    get pointsToNextLevel() {
      return Math.max(0, pointsForNextExpansion(ledger.level) - points)
    },
    award(action, count = 1) {
      if (!Number.isFinite(count) || count < 0) return points
      points += config.points[action] * Math.floor(count)
      return points
    },
    awardOnce(key, action, count = 1) {
      if (awarded.has(key)) return points
      awarded.add(key)
      return ledger.award(action, count)
    },
    pointsForNextExpansion,
    reset() {
      points = 0
      awarded.clear()
    },
  }
  return ledger
}
