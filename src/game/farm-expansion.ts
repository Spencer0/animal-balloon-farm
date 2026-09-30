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
  readonly steps: readonly FarmExpansionStep[]
}

/** Progression tuning lives in one place; adding/removing parcels needs no scene edits. */
export const FARM_EXPANSION_CONFIG: FarmExpansionConfig = {
  startBounds: { halfWidth: 14, halfDepth: 9.5 },
  durationSeconds: 3.2,
  steps: [
    { name: 'Clover Patch', width: 1.6, depth: 1.1 },
    { name: 'Lantern Walk', width: 1.6, depth: 1.1 },
    { name: 'Wildflower Field', width: 1.6, depth: 1.1 },
    { name: 'Carousel Meadow', width: 1.6, depth: 1.1 },
    { name: 'Grand Garden', width: 1.6, depth: 1.1 },
  ],
}

export function farmBoundsAtLevel(
  level: number,
  config: FarmExpansionConfig = FARM_EXPANSION_CONFIG,
): GardenBounds {
  const safeLevel = Number.isFinite(level)
    ? Math.min(config.steps.length, Math.max(0, Math.floor(level)))
    : 0
  let halfWidth = config.startBounds.halfWidth
  let halfDepth = config.startBounds.halfDepth
  for (let index = 0; index < safeLevel; index += 1) {
    halfWidth += config.steps[index].width
    halfDepth += config.steps[index].depth
  }
  return { halfWidth, halfDepth }
}

export const GARDEN_MAX_BOUNDS = farmBoundsAtLevel(FARM_EXPANSION_CONFIG.steps.length)

export interface FarmExpansionState {
  /** Number of parcels already opened; zero is the starter plot. */
  readonly level: number
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
  if (config.steps.some((step) => typeof step.name !== 'string' || !step.name.trim()
    || !Number.isFinite(step.width) || !Number.isFinite(step.depth)
    || step.width <= 0 || step.depth <= 0)) {
    throw new RangeError('Farm parcels must have a name and finite positive increments')
  }

  // Snapshot caller-provided tuning so progression cannot change partway through
  // a parcel animation if an editor changes the source configuration object.
  const stableConfig: FarmExpansionConfig = {
    startBounds: { ...config.startBounds },
    durationSeconds: config.durationSeconds,
    steps: config.steps.map((step) => ({ ...step })),
  }
  let maxWidth = stableConfig.startBounds.halfWidth
  let maxDepth = stableConfig.startBounds.halfDepth
  for (const step of stableConfig.steps) {
    maxWidth += step.width
    maxDepth += step.depth
    if (!Number.isFinite(maxWidth) || !Number.isFinite(maxDepth)) {
      throw new RangeError('Farm maximum bounds must be finite')
    }
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
    get state(): FarmExpansionState {
      return {
        level,
        totalLevels: stableConfig.steps.length,
        bounds: { ...bounds },
        targetBounds: { ...targetBounds },
        lastStep: level > 0 ? { ...stableConfig.steps[level - 1] } : null,
        isAnimating: elapsed < stableConfig.durationSeconds,
        progress,
        nextStep: stableConfig.steps[level] ? { ...stableConfig.steps[level] } : null,
      }
    },
    expand(): FarmExpansionStart | null {
      if (elapsed < stableConfig.durationSeconds || level >= stableConfig.steps.length) return null
      const step = stableConfig.steps[level]
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
