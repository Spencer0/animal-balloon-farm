/**
 * Farm state measurement: turns raw garden data into the numbers a condition
 * is compared against (SPEC §9 — simulation stays independent of the renderer).
 *
 * Three quantities matter, all in square meters:
 *
 *   tallGrassArea    lawn covered by grass past a maturity threshold
 *   waterArea        visible pond surface: cells holding actual water
 *   flatGrassArea    level, walkable, *grassy* ground — open pasture
 *
 * Grass is measured on the lawn's vertex grid; terrain is sampled there for
 * pasture, while pond surface uses the water solver's native cell grid. Each
 * tool's own authoritative grid is retained instead of estimating one from
 * another, differently-sized mesh.
 *
 * `flatGrassArea` deliberately requires grass. A freshly dug plot is perfectly
 * flat everywhere, and a condition measured on bare dirt would be satisfied the
 * moment the game starts. Sheep settle on pasture, not on a dirt field.
 */

/** A grass cell only counts once it is at least this mature. */
export const DEFAULT_MATURITY = 0.75

/** Ground this far below grade is not walkable pasture, even if the pit is dry. */
export const MAX_PASTURE_DEPRESSION = 0.35

/** A cell counts as flat when no neighbor rises more than this above it. */
export const FLAT_MAX_SLOPE = 0.12

export interface FarmState {
  readonly tallGrassArea: number
  readonly waterArea: number
  readonly flatGrassArea: number
}

export interface LawnSample {
  /** Lawn vertices laid out row-major, matching the lawn's position attribute. */
  readonly count: number
  /** World x of each vertex. */
  readonly xs: Float32Array
  /** World z of each vertex. */
  readonly zs: Float32Array
  /** Per-vertex grass coverage in 0..1. */
  readonly coverage: Float32Array
  /** Optional per-vertex blade maturity, excluding freshly sown stubs. */
  readonly maturity?: Float32Array
}

export interface TerrainSample {
  /** Height field in row-major order. */
  readonly heights: Float32Array
  readonly cols: number
  readonly rows: number
  readonly cellSize: number
  readonly originX: number
  readonly originZ: number
}

export interface WaterSample {
  /** Number of water-grid cells with a rendered pond surface. */
  readonly visibleWetCells: number
  readonly cellSize: number
}

/**
 * Nearest-cell terrain height at a world position. The height grid is much
 * coarser than the lawn (0.55m cells vs 0.58m vertices), so nearest-cell is
 * the right match and avoids pulling in a dependency just to interpolate.
 */
export function heightAtWorld(terrain: TerrainSample, x: number, z: number): number {
  const gx = Math.round((x - terrain.originX) / terrain.cellSize)
  const gz = Math.round((z - terrain.originZ) / terrain.cellSize)
  if (gx < 0 || gz < 0 || gx >= terrain.cols || gz >= terrain.rows) return 0
  return terrain.heights[gz * terrain.cols + gx]
}

/**
 * One lawn vertex covers a constant area, derived from the grid's own pitch.
 *
 * The pitch cannot be read off vertices 0 and 1: the lawn is a *rounded*
 * rectangle, so the first row is the corner bevel and its steps are short and
 * irregular. Taking that as the grid pitch under-reported every area by ~4x,
 * which quietly halved the cow's 15 m2. Instead take the most common
 * consecutive step, which is the real row pitch everywhere past the corners.
 */
function lawnCellArea(sample: LawnSample): number {
  const spacing = estimateLawnPitch(sample)
  return spacing * spacing
}

function estimateLawnPitch(sample: LawnSample): number {
  // Count consecutive steps. On a regular grid one step value dominates by a
  // wide margin; the corner bevel contributes a handful of odd sizes.
  const steps = new Map<number, number>()
  const limit = Math.min(sample.count - 1, 4000)
  for (let index = 1; index < limit; index += 1) {
    const dx = Math.abs(sample.xs[index] - sample.xs[index - 1])
    if (dx <= 0) continue
    // Quantize so float noise does not split one real step into many buckets.
    const bucket = Math.round(dx * 1000) / 1000
    steps.set(bucket, (steps.get(bucket) ?? 0) + 1)
  }
  let best = 0
  let bestCount = 0
  for (const [value, count] of steps) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return bestCount > 0 ? best : 0.58
}

/** Is this vertex's grass grown past the maturity bar? */
function isMature(sample: LawnSample, index: number, maturity: number): boolean {
  if (sample.coverage[index] < maturity) return false
  if (!sample.maturity) return true
  return sample.maturity[index] >= maturity
}

export function measureTallGrass(lawn: LawnSample, maturity = DEFAULT_MATURITY): number {
  const cellArea = lawnCellArea(lawn)
  let area = 0
  for (let index = 0; index < lawn.count; index += 1) {
    if (isMature(lawn, index, maturity)) area += cellArea
  }
  return round2(area)
}

export function measureWater(water: WaterSample | null | undefined): number {
  if (!water) return 0
  const cellArea = water.cellSize * water.cellSize
  return round2(water.visibleWetCells * cellArea)
}

/**
 * Level, walkable, grassy ground. Both the vertex itself and its grid
 * neighbours must be mature grass, so a lone blade in a dug pit does not
 * count as pasture.
 */
export function measureFlatGrassArea(
  lawn: LawnSample,
  terrain: TerrainSample,
  maturity = DEFAULT_MATURITY,
  maxSlope = FLAT_MAX_SLOPE,
  maxDepression = MAX_PASTURE_DEPRESSION,
): number {
  const cellArea = lawnCellArea(lawn)
  const slopeLimit = maxSlope * terrain.cellSize
  let area = 0
  for (let index = 0; index < lawn.count; index += 1) {
    if (!isMature(lawn, index, maturity)) continue
    const height = heightAtWorld(terrain, lawn.xs[index], lawn.zs[index])
    if (-height >= maxDepression) continue
    // A spot is only "open" if nothing nearby towers over it.
    let steepest = 0
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const neighbour = heightAtWorld(terrain, lawn.xs[index] + dx * terrain.cellSize, lawn.zs[index] + dz * terrain.cellSize)
      steepest = Math.max(steepest, Math.abs(neighbour - height))
    }
    if (steepest <= slopeLimit) area += cellArea
  }
  return round2(area)
}

export function measureFarmState(lawn: LawnSample, terrain: TerrainSample, water?: WaterSample | null): FarmState {
  return {
    tallGrassArea: measureTallGrass(lawn),
    waterArea: measureWater(water),
    flatGrassArea: measureFlatGrassArea(lawn, terrain),
  }
}

/** The metric a requirement is measured in, given what the farm can report. */
export function farmMetric(state: FarmState, kind: string): number {
  switch (kind) {
    case 'grassArea': return state.tallGrassArea
    case 'waterArea': return state.waterArea
    case 'flatArea': return state.flatGrassArea
    default: return 0
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
