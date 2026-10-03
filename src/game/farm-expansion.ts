export interface GardenBounds {
  readonly halfWidth: number
  readonly halfDepth: number
}

export interface FarmExpansionStep {
  readonly name: string
  /** Amount added to the plot half-width when this parcel is revealed. */
  readonly width: number
  /** Amount added to the plot half-depth when this parcel is revealed. */
  readonly depth: number
}

export interface FarmExpansionConfig {
  readonly startBounds: GardenBounds
  readonly durationSeconds: number
  readonly maximumLevel?: number
  readonly steps: readonly FarmExpansionStep[]
}

/** Progression tuning lives in one place; adding/removing parcels needs no scene edits. */
export const FARM_EXPANSION_CONFIG = {
  startBounds: { halfWidth: 14, halfDepth: 9.5 },
  durationSeconds: 3.2,
  maximumLevel: 15,
  // Parcel styles repeat until the farm reaches its progression cap.
  steps: [
    { name: 'Clover Patch', width: 1.6, depth: 1.1 },
    { name: 'Lantern Walk', width: 1.6, depth: 1.1 },
    { name: 'Wildflower Field', width: 1.6, depth: 1.1 },
    { name: 'Carousel Meadow', width: 1.6, depth: 1.1 },
    { name: 'Grand Garden', width: 1.6, depth: 1.1 },
  ],
}

function parcelAt(level: number, steps: readonly FarmExpansionStep[]): FarmExpansionStep | null {
  if (steps.length === 0) return null
  const base = steps[level % steps.length]
  const cycle = Math.floor(level / steps.length)
  return cycle === 0 ? base : { ...base, name: `${base.name} ${cycle + 1}` }
}

function roundedBounds(bounds: GardenBounds): GardenBounds {
  return { halfWidth: +bounds.halfWidth.toFixed(3), halfDepth: +bounds.halfDepth.toFixed(3) }
}

export function farmBoundsAtLevel(
  level: number,
  config: FarmExpansionConfig = FARM_EXPANSION_CONFIG,
): GardenBounds {
  const safeLevel = Number.isFinite(level) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(level))) : 0
  const cycles = config.steps.length > 0 ? Math.floor(safeLevel / config.steps.length) : 0
  const remainder = config.steps.length > 0 ? safeLevel % config.steps.length : 0
  const cycleWidth = config.steps.reduce((sum, step) => sum + step.width, 0)
  const cycleDepth = config.steps.reduce((sum, step) => sum + step.depth, 0)
  let halfWidth = config.startBounds.halfWidth + cycles * cycleWidth
  let halfDepth = config.startBounds.halfDepth + cycles * cycleDepth
  for (let index = 0; index < remainder; index += 1) {
    halfWidth += config.steps[index].width
    halfDepth += config.steps[index].depth
  }
  return roundedBounds({ halfWidth, halfDepth })
}

/** Allocate surfaces through the final progression parcel. */
export const GARDEN_MAX_BOUNDS = farmBoundsAtLevel(FARM_EXPANSION_CONFIG.maximumLevel)

export interface FarmExpansionState {
  /** Number of parcels already opened; zero is the starter plot. */
  readonly level: number
  /** Maximum number of parcels that can be revealed. */
  readonly totalLevels: number

  /** Current eased bounds used by tools and scene boundaries. */
  readonly bounds: GardenBounds
  readonly targetBounds: GardenBounds
  /** Most recently started/unlocked parcel, or null for the starter plot. */
  readonly lastStep: FarmExpansionStep | null
  readonly isAnimating: boolean
  /** Smoothstep progress through the current reveal, or 1 while idle. */
  readonly progress: number
  readonly nextStep: FarmExpansionStep | null
}

export interface FarmExpansionStart {
  readonly level: number
  readonly step: FarmExpansionStep
  readonly fromBounds: GardenBounds
  readonly targetBounds: GardenBounds
}

export interface FarmExpansion {
  readonly state: FarmExpansionState
  /** Lightweight live getters for the animation loop; state remains a snapshot API. */
  readonly level: number
  readonly bounds: GardenBounds
  readonly isAnimating: boolean
  readonly progress: number
  expand(): FarmExpansionStart | null
  update(deltaSeconds: number): void
}

/**
 * Pure progression state. The scene consumes bounds every frame; input can only
 * reveal the next parcel, never shrink an existing garden.
 */
export function createFarmExpansion(config: FarmExpansionConfig = FARM_EXPANSION_CONFIG): FarmExpansion {
  if (![config.startBounds.halfWidth, config.startBounds.halfDepth].every(Number.isFinite)
    || config.startBounds.halfWidth <= 0 || config.startBounds.halfDepth <= 0) {
    throw new RangeError('Farm starting bounds must be finite and positive')
  }
  if (!Number.isFinite(config.durationSeconds) || config.durationSeconds <= 0) {
    throw new RangeError('Farm expansion duration must be finite and positive')
  }
  const maximumLevel = config.maximumLevel ?? config.steps.length
  if (!Number.isSafeInteger(maximumLevel) || maximumLevel < 0) {
    throw new RangeError('Farm maximum level must be a non-negative safe integer')
  }
  if (config.steps.some((step) => typeof step.name !== 'string' || !step.name.trim()
    || !Number.isFinite(step.width) || !Number.isFinite(step.depth)
    || step.width <= 0 || step.depth <= 0)) {
    throw new RangeError('Farm parcels must have a name and finite positive increments')
  }

  // Snapshot caller-provided tuning so progression cannot change partway through
  // a parcel animation if an editor changes the source configuration object.
  const stableConfig = {
    startBounds: { ...config.startBounds },
    durationSeconds: config.durationSeconds,
    maximumLevel,
    steps: config.steps.map((step) => ({ ...step })),
  }
  const cycleWidth = stableConfig.steps.reduce((sum, step) => sum + step.width, 0)
  const cycleDepth = stableConfig.steps.reduce((sum, step) => sum + step.depth, 0)
  if (!Number.isFinite(stableConfig.startBounds.halfWidth + cycleWidth)
    || !Number.isFinite(stableConfig.startBounds.halfDepth + cycleDepth)) {
    throw new RangeError('Farm parcel cycle increments must remain finite')
  }
  let level = 0
  let elapsed = stableConfig.durationSeconds
  let fromBounds = stableConfig.startBounds
  let targetBounds = stableConfig.startBounds
  let bounds = stableConfig.startBounds
  let progress = 1

  function update(deltaSeconds: number): void {
    if (elapsed >= stableConfig.durationSeconds || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
    elapsed = Math.min(stableConfig.durationSeconds, elapsed + deltaSeconds)
    const linear = elapsed / stableConfig.durationSeconds
    progress = linear * linear * (3 - 2 * linear)
    bounds = {
      halfWidth: fromBounds.halfWidth + (targetBounds.halfWidth - fromBounds.halfWidth) * progress,
      halfDepth: fromBounds.halfDepth + (targetBounds.halfDepth - fromBounds.halfDepth) * progress,
    }
    if (elapsed >= stableConfig.durationSeconds) bounds = targetBounds
  }

  return {
    get level() { return level },
    get bounds(): GardenBounds { return { ...bounds } },
    get isAnimating() { return elapsed < stableConfig.durationSeconds },
    get progress() { return progress },
    get state(): FarmExpansionState {
      return {
        level,
        totalLevels: stableConfig.steps.length > 0 ? stableConfig.maximumLevel : 0,
        bounds: { ...bounds },
        targetBounds: { ...targetBounds },
        lastStep: level > 0 ? { ...parcelAt(level - 1, stableConfig.steps)! } : null,
        isAnimating: elapsed < stableConfig.durationSeconds,
        progress,
        nextStep: level < stableConfig.maximumLevel ? parcelAt(level, stableConfig.steps) : null,
      }
    },
    expand(): FarmExpansionStart | null {
      if (elapsed < stableConfig.durationSeconds || stableConfig.steps.length === 0 || level >= stableConfig.maximumLevel) return null
      const step = parcelAt(level, stableConfig.steps)!
      const previousBounds = bounds
      level += 1
      fromBounds = previousBounds
      targetBounds = farmBoundsAtLevel(level, stableConfig)
      elapsed = 0
      progress = 0
      return {
        level,
        step: { ...step },
        fromBounds: { ...fromBounds },
        targetBounds: { ...targetBounds },
      }
    },
    update,
  }
}
