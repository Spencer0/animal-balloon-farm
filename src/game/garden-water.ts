/**
 * Canonical garden water field (SPEC §5.1: terrain types include shallow
 * water/pond). Pure simulation — no Three.js — matching the
 * `farm-expansion.ts` precedent and AGENTS.md's rule that garden state stays
 * independent of scene objects.
 *
 * The one rule this module exists to enforce: **water runs downhill and fills
 * a basin flat to the height of its lowest rim, then stops.** Wetness is
 * decided by `ground < basin spill level`, never by `ground < 0` — a dip that
 * sits above grade but below its surroundings holds water, exactly as a real
 * puddle does.
 *
 * ## The hydrology
 *
 * Everything rests on one standard primitive, the **filled** (or minimax)
 * surface: `filled[i]` is the lowest level at which water in cell `i` could
 * escape the garden, i.e. the minimum, over all paths from `i` to the border,
 * of the highest ground along that path. It comes from a priority flood seeded
 * on the border, and it answers both questions the solver needs:
 *
 * - `filled[i] === ground[i]` — the cell is a drain; water there escapes
 *   immediately and can never hold a puddle.
 * - `filled[i] > ground[i]` — the cell is a basin cell, and its water is capped
 *   at `filled[i]` no matter how much is poured in.
 *
 * A pool's level is then the volume solve capped by the minimum `filled` over
 * the cells it occupies, iterated to a fixed point. On a flat plate every cell
 * is a drain, so poured water runs off; in a bowl the level rises to the rim
 * and stops; over-pour a rim that has a dip beyond it and the level drops as
 * the basin grows to swallow the overflow, so the sheet visibly runs downhill.
 *
 * ## Note on the garden border
 *
 * The outer simulation grid is an open outlet. The visible parcel sits inside
 * that grid, with surrounding ground fixed at grade: a flat-edge pour drains,
 * while a deliberately dug corner basin can hold water below that grade.
 */

/** Thinner than this and a cell reads as damp soil rather than water. */
export const WATER_MIN_VISIBLE_DEPTH = 0.002
/** Ignore tiny simulation films when choosing rendered pool/shoreline seeds. */
export const WATER_MIN_RENDER_DEPTH = 0.04
/** Damp soil extends this far past a rendered wet cell, softening the shoreline. */
export const WATER_SHORE_BAND = 0.25
/** Bisection steps for the level solve: 24 pins a metre of range to ~0.06 µm. */
const LEVEL_SOLVE_STEPS = 24
/** Height above a basin's highest floor we will ever solve for. */
const LEVEL_SOLVE_HEADROOM = 0.75
/** A cell must sit at least this far below its fill height to hold water at all. */
const BASIN_MIN_DEPTH = 1e-4
/** Pools leveled per settle; the rest continue on the next frame. */
const MAX_COMPONENTS_PER_SETTLE = 32
/** Fixed-point rounds allowed when a pool grows across its rim. */
const MAX_GROWTH_ROUNDS = 16
/** Runaway guard on a single pool's size. */
const MAX_BASIN_CELLS = 6000
/** Brush rim easing, matching the shovel's so the two tools feel related. */
const RIM_EASE_START = 0.6

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
]

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Binary min-heap over cell indices, keyed by the `filled` height. */
class MinHeap {
  private readonly items: Int32Array
  private readonly keys: Float32Array
  private size = 0

  constructor(capacity: number) {
    this.items = new Int32Array(capacity)
    this.keys = new Float32Array(capacity)
  }

  get length(): number {
    return this.size
  }

  clear(): void {
    this.size = 0
  }

  push(index: number, key: number): void {
    let position = this.size
    this.items[position] = index
    this.keys[position] = key
    this.size += 1
    while (position > 0) {
      const parent = (position - 1) >> 1
      if (this.keys[parent] <= this.keys[position]) break
      this.swap(position, parent)
      position = parent
    }
  }

  pop(): number {
    const top = this.items[0]
    this.size -= 1
    if (this.size > 0) {
      this.items[0] = this.items[this.size]
      this.keys[0] = this.keys[this.size]
      let position = 0
      for (;;) {
        const left = position * 2 + 1
        const right = left + 1
        let smallest = position
        if (left < this.size && this.keys[left] < this.keys[smallest]) smallest = left
        if (right < this.size && this.keys[right] < this.keys[smallest]) smallest = right
        if (smallest === position) break
        this.swap(position, smallest)
        position = smallest
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const index = this.items[a]
    const key = this.keys[a]
    this.items[a] = this.items[b]
    this.keys[a] = this.keys[b]
    this.items[b] = index
    this.keys[b] = key
  }
}

export interface WaterFieldSummary {
  /** Cells holding at least one visible drop of water. */
  readonly wetCells: number
  /** Total water on the field, in cubic metres. */
  readonly volume: number
  /** Deepest single cell, in metres. */
  readonly maxDepth: number
  /** Highest water surface on the field, in metres. */
  readonly highestSurface: number
  /** Water that has left the garden as runoff, in cubic metres. */
  readonly runoff: number
}

export interface GardenWaterField {
  readonly cellSize: number
  readonly gridCols: number
  readonly gridRows: number
  readonly dirty: boolean
  /** Water depth (metres) at the grid cell containing a world point. */
  depthAt(x: number, z: number): number
  /** Water surface height (ground + depth) at the grid cell containing a world point. */
  surfaceAt(x: number, z: number): number
  /** Add water to a disc; returns the volume added, in cubic metres. */
  pour(x: number, z: number, radius: number, metres: number): number
  /** Remove water from a disc; returns the volume removed, in cubic metres. */
  drain(x: number, z: number, radius: number, metres: number): number
  /** Flow water downhill and level every pool. Cheap when the field is clean. */
  settle(): void
  /**
   * Announce that the ground moved under the water, so the next `settle`
   * re-reads heights and re-solves even though no water was added or removed.
   * The shovel calls this after every dig/fill/level: deepening a pond should
   * make it deeper, and filling one in should make it disappear, without
   * needing a bucket of water to nudge the field awake.
   */
  markTerrainChanged(): void
  /** True when a wet cell lies within WATER_SHORE_BAND of this point. */
  isDamp(x: number, z: number): boolean
  /** Every cell currently holding visible water, in row-major order. */
  wetCells(): number[]
  /**
   * A smoothed view of the water for rendering: per grid cell, the nearest
   * pool's surface height and how solidly wet it is. Surface height is carried
   * over the entire field, even where wetness is zero, because transparent
   * vertices still participate in triangle interpolation. Only wetness fades
   * across the shore band; the flat carried level avoids angular ramps at the
   * last partially transparent triangles.
   */
  shoreField(): { readonly level: Float32Array; readonly wetness: Float32Array }
  summary(): WaterFieldSummary
  clear(): void
}

export interface GardenWaterOptions {
  readonly cellSize: number
  readonly gridCols: number
  readonly gridRows: number
  /** Ground height in metres at a grid cell. */
  cellHeight(gx: number, gz: number): number
}

export function createGardenWaterField(
  options: GardenWaterOptions,
): GardenWaterField {
  const cellSize = options.cellSize
  const gridCols = Math.max(1, Math.floor(options.gridCols))
  const gridRows = Math.max(1, Math.floor(options.gridRows))
  const cellCount = gridCols * gridRows
  const cellArea = cellSize * cellSize
  const cellHeight = options.cellHeight
  const depth = new Float32Array(cellCount)
  const ground = new Float32Array(cellCount)
  const surface = new Float32Array(cellCount)
  /** Minimax escape height per cell — see the module header. */
  const filled = new Float32Array(cellCount)
  /** Generation stamp, so membership tests never clear the whole grid. */
  const memberStamp = new Int32Array(cellCount)
  let generation = 0

  const heap = new MinHeap(cellCount + 1)
  // Scratch reused across every pool in a settle. `component` is the wet run
  // being levelled; `basin` is the set of cells its level can actually occupy.
  // They differ, so a pool that turns out to hold no water has to be cleared
  // from `component` — otherwise the leftovers sit there forever.
  const component: number[] = []
  const basin: number[] = []
  const stack: number[] = []

  let dirty = false
  let totalRunoff = 0

  // Cell (gx, gz) is centred on the garden origin, matching the terrain grid.
  const cellOriginX = -(gridCols * cellSize) / 2
  const cellOriginZ = -(gridRows * cellSize) / 2

  function readGround(): void {
    for (let gz = 0; gz < gridRows; gz += 1) {
      for (let gx = 0; gx < gridCols; gx += 1) {
        ground[gz * gridCols + gx] = cellHeight(gx, gz)
      }
    }
  }

  function refreshSurfaces(): void {
    for (let index = 0; index < cellCount; index += 1) {
      surface[index] = ground[index] + depth[index]
    }
  }

  function clampGx(gx: number): number {
    return Math.min(gridCols - 1, Math.max(0, gx))
  }

  function clampGz(gz: number): number {
    return Math.min(gridRows - 1, Math.max(0, gz))
  }

  function cellCentreX(gx: number): number {
    return cellOriginX + (gx + 0.5) * cellSize
  }

  function cellCentreZ(gz: number): number {
    return cellOriginZ + (gz + 0.5) * cellSize
  }

  function cellAt(x: number, z: number): number {
    const gx = clampGx(Math.floor((x - cellOriginX) / cellSize))
    const gz = clampGz(Math.floor((z - cellOriginZ) / cellSize))
    return gz * gridCols + gx
  }

  /**
   * Priority flood from the border: `filled[i]` becomes the lowest level at
   * which cell `i` can reach open ground. Cells are marked when *pushed*, which
   * is the correct eager variant in 2D — the first push for a cell is already
   * its minimax value, because it always arrives from the lowest-keyed
   * neighbour that can reach it.
   */
  function computeFilledHeights(): void {
    heap.clear()
    generation += 1
    for (let gx = 0; gx < gridCols; gx += 1) {
      for (const gz of [0, gridRows - 1]) {
        const index = gz * gridCols + gx
        if (memberStamp[index] === generation) continue
        memberStamp[index] = generation
        filled[index] = ground[index]
        heap.push(index, filled[index])
      }
    }
    for (let gz = 1; gz < gridRows - 1; gz += 1) {
      for (const gx of [0, gridCols - 1]) {
        const index = gz * gridCols + gx
        if (memberStamp[index] === generation) continue
        memberStamp[index] = generation
        filled[index] = ground[index]
        heap.push(index, filled[index])
      }
    }
    while (heap.length > 0) {
      const index = heap.pop()
      const level = filled[index]
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) continue
        const neighbour = nz * gridCols + nx
        if (memberStamp[neighbour] === generation) continue
        // Raising the neighbour to at least this level is the minimax step.
        const next = ground[neighbour] > level ? ground[neighbour] : level
        memberStamp[neighbour] = generation
        filled[neighbour] = next
        heap.push(neighbour, next)
      }
    }
  }

  /** True when a cell can actually hold water rather than drain straight out. */
  function isBasinCell(index: number): boolean {
    return filled[index] - ground[index] > BASIN_MIN_DEPTH
  }

  /** The 4-connected run of wet cells containing `seed`, left in `component`. */
  function collectWetComponent(seed: number): number {
    component.length = 0
    stack.length = 0
    generation += 1
    memberStamp[seed] = generation
    stack.push(seed)
    while (stack.length > 0 && component.length < MAX_BASIN_CELLS) {
      const index = stack.pop() as number
      component.push(index)
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) continue
        const neighbour = nz * gridCols + nx
        if (memberStamp[neighbour] === generation) continue
        if (depth[neighbour] <= WATER_MIN_VISIBLE_DEPTH) continue
        memberStamp[neighbour] = generation
        stack.push(neighbour)
      }
    }
    return component.length
  }

  /**
   * Grow the set of cells a pool at `level` would occupy, starting from `seed`:
   * 4-connected, below the level, and able to hold water. Returns the count.
   */
  function growPoolRegion(seed: number, level: number): number {
    basin.length = 0
    stack.length = 0
    if (ground[seed] >= level || !isBasinCell(seed)) return 0
    generation += 1
    memberStamp[seed] = generation
    stack.push(seed)
    while (stack.length > 0 && basin.length < MAX_BASIN_CELLS) {
      const index = stack.pop() as number
      basin.push(index)
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) continue
        const neighbour = nz * gridCols + nx
        if (memberStamp[neighbour] === generation) continue
        if (ground[neighbour] >= level) continue
        if (!isBasinCell(neighbour)) continue
        memberStamp[neighbour] = generation
        stack.push(neighbour)
      }
    }
    return basin.length
  }

  /**
   * Bisect for the level L satisfying `Σ max(0, L − hᵢ) = volume` over the
   * current pool. F(L) is continuous and strictly increasing, so the result is
   * exact to its step size and volume is conserved by construction.
   */
  function solveLevel(volumeDepth: number): number {
    let low = Infinity
    let high = -Infinity
    for (const index of basin) {
      const height = ground[index]
      if (height < low) low = height
      if (height > high) high = height
    }
    if (!Number.isFinite(low)) return 0
    let lo = low
    let hi = high + LEVEL_SOLVE_HEADROOM
    for (let step = 0; step < LEVEL_SOLVE_STEPS; step += 1) {
      const mid = (lo + hi) / 2
      let held = 0
      for (const index of basin) {
        const above = mid - ground[index]
        if (above > 0) held += above
      }
      if (held > volumeDepth) hi = mid
      else lo = mid
    }
    return (lo + hi) / 2
  }

  /** The lowest spill level among the cells this pool occupies. */
  function lowestSpill(): number {
    let lowest = Infinity
    for (const index of basin) {
      if (filled[index] < lowest) lowest = filled[index]
    }
    return lowest
  }

  /**
   * Move water downhill until it reaches a cell that can hold it.
   *
   * Water resting on a slope is in a cell that is *not* a basin cell, but that
   * does not mean the water is lost — it means it has somewhere to go. Without
   * this pass, water poured above a pond would be deleted on the spot instead
   * of running down and joining it, and "water finds the low ground" would be
   * false anywhere except directly below the bucket.
   *
   * Routing is steepest descent on the *ground*, so every hop strictly lowers
   * the bed and the walk always terminates: it ends at a basin cell, at the
   * garden border, or at a local flat where the water is genuinely stuck.
   */
  function routeDownhill(): void {
    const queue: number[] = []
    const queued = new Set<number>()
    for (let index = 0; index < cellCount; index += 1) {
      if (depth[index] <= WATER_MIN_VISIBLE_DEPTH) continue
      if (isBasinCell(index)) continue
      queue.push(index)
      queued.add(index)
    }
    let guard = cellCount * 4
    while (queue.length > 0 && guard > 0) {
      guard -= 1
      const index = queue.pop() as number
      queued.delete(index)
      const volume = depth[index]
      if (volume <= WATER_MIN_VISIBLE_DEPTH) continue
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      let lowestIndex = -1
      let lowestHeight = ground[index]
      let atBorder = false
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) {
          atBorder = true
          continue
        }
        const neighbour = nz * gridCols + nx
        if (ground[neighbour] >= lowestHeight) continue
        lowestHeight = ground[neighbour]
        lowestIndex = neighbour
      }
      // The border is an open outlet, so a cell that can spill off the parcel
      // loses its water outright — that is the runoff a player sees drain away.
      if (lowestIndex < 0 || atBorder) {
        if (atBorder && lowestIndex < 0) {
          depth[index] = 0
          totalRunoff += volume * cellArea
          continue
        }
        if (lowestIndex < 0) {
          // A dead-flat spot with nowhere lower: the water stays put as a
          // film rather than vanishing, and reads as damp ground.
          continue
        }
      }
      depth[index] = 0
      depth[lowestIndex] += volume
      if (!isBasinCell(lowestIndex) && !queued.has(lowestIndex)) {
        queue.push(lowestIndex)
        queued.add(lowestIndex)
      }
    }
  }

  /**
   * Level one pool, iterating to a fixed point: solve for the level this
   * volume wants, cap it at the pool's spill height, and let the cap widen the
   * pool into whatever lies beyond. Returns false when the pool could not be
   * fully resolved and the field should settle again next frame.
   */
  function settleComponent(seed: number, volumeDepth: number): boolean {
    // Anchor the pool on the LOWEST cell of the wet run, not on whichever cell
    // the scan happened to reach first. Water flows to the low point, so if the
    // shovel digs a pit in the middle of a pond, the surface must be free to
    // fall below the surrounding shallows — anchoring on a shallow seed would
    // make that look like the pond had drained.
    let anchor = seed
    for (const index of component) {
      if (ground[index] < ground[anchor]) anchor = index
    }

    // No basin cell reachable: this water drains straight off the parcel, so
    // the whole component is emptied, not just the anchor.
    if (growPoolRegion(anchor, ground[anchor] + volumeDepth) === 0) {
      for (const index of component) depth[index] = 0
      totalRunoff += volumeDepth * cellArea
      return true
    }
    let level = Math.min(solveLevel(volumeDepth), lowestSpill())
    let settled = false
    for (let round = 0; round < MAX_GROWTH_ROUNDS; round += 1) {
      // Widening the pool lowers the level it can support, so the cap has to
      // be recomputed on the new region; iterate until the two agree.
      if (growPoolRegion(anchor, level) === 0) {
        for (const index of component) depth[index] = 0
        totalRunoff += volumeDepth * cellArea
        return true
      }
      const spill = lowestSpill()
      const solved = solveLevel(volumeDepth)
      const next = Math.min(solved, spill)
      if (Math.abs(next - level) < 1e-6) {
        level = next
        settled = true
        break
      }
      level = next
    }

    // Materialise the pool, then dry everything the level left behind. A cell
    // that drained out of the wet run into a lower part of the pool is no
    // longer part of the surface, so its old depth has to go.
    generation += 1
    for (const index of basin) {
      const next = level - ground[index]
      depth[index] = next >= WATER_MIN_VISIBLE_DEPTH ? next : 0
      memberStamp[index] = generation
    }
    let held = 0
    for (const index of basin) held += depth[index]
    for (const index of component) {
      if (memberStamp[index] === generation) continue
      held += depth[index]
      depth[index] = 0
    }
    const surplus = volumeDepth - held
    if (surplus > WATER_MIN_VISIBLE_DEPTH) totalRunoff += surplus * cellArea
    return settled
  }

  function pour(x: number, z: number, radius: number, metres: number): number {
    if (!(metres > 0) || !(radius > 0)) return 0
    const minGx = clampGx(Math.floor((x - radius - cellOriginX) / cellSize))
    const maxGx = clampGx(Math.floor((x + radius - cellOriginX) / cellSize))
    const minGz = clampGz(Math.floor((z - radius - cellOriginZ) / cellSize))
    const maxGz = clampGz(Math.floor((z + radius - cellOriginZ) / cellSize))
    let added = 0
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const distance = Math.hypot(cellCentreX(gx) - x, cellCentreZ(gz) - z)
        if (distance > radius) continue
        const weight = 1 - smoothstep(RIM_EASE_START, 1, distance / radius)
        if (weight <= 0) continue
        const add = metres * weight
        depth[gz * gridCols + gx] += add
        added += add
      }
    }
    if (added > 0) dirty = true
    return added * cellArea
  }

  function drain(x: number, z: number, radius: number, metres: number): number {
    if (!(metres > 0) || !(radius > 0)) return 0
    const minGx = clampGx(Math.floor((x - radius - cellOriginX) / cellSize))
    const maxGx = clampGx(Math.floor((x + radius - cellOriginX) / cellSize))
    const minGz = clampGz(Math.floor((z - radius - cellOriginZ) / cellSize))
    const maxGz = clampGz(Math.floor((z + radius - cellOriginZ) / cellSize))
    let removed = 0
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const distance = Math.hypot(cellCentreX(gx) - x, cellCentreZ(gz) - z)
        if (distance > radius) continue
        const weight = 1 - smoothstep(RIM_EASE_START, 1, distance / radius)
        if (weight <= 0) continue
        const index = gz * gridCols + gx
        const take = Math.min(depth[index], metres * weight)
        if (take <= 0) continue
        depth[index] -= take
        removed += take
      }
    }
    if (removed > 0) dirty = true
    return removed * cellArea
  }

  function settle(): void {
    if (!dirty) return
    // Terrain may have moved under the water since the last settle, so both
    // the ground snapshot and the escape heights are rebuilt first.
    readGround()
    computeFilledHeights()
    // Water above the waterline runs downhill into whatever basin it can reach
    // before any pool is levelled, so the routing sees the whole field.
    routeDownhill()
    const seeds: number[] = []
    for (let index = 0; index < cellCount; index += 1) {
      if (depth[index] > WATER_MIN_VISIBLE_DEPTH) seeds.push(index)
    }
    let components = 0
    let deferred = false
    for (const seed of seeds) {
      if (components >= MAX_COMPONENTS_PER_SETTLE) {
        deferred = true
        break
      }
      if (depth[seed] <= WATER_MIN_VISIBLE_DEPTH) continue
      // The whole wet run belongs to one pool, so its whole volume is levelled
      // together — otherwise a pond draining from one end would tear in half.
      const componentSize = collectWetComponent(seed)
      if (componentSize === 0) continue
      let volumeDepth = 0
      for (let i = 0; i < componentSize; i += 1) volumeDepth += depth[component[i]]
      if (volumeDepth <= WATER_MIN_VISIBLE_DEPTH) {
        for (let i = 0; i < componentSize; i += 1) depth[component[i]] = 0
        continue
      }
      components += 1
      if (!settleComponent(seed, volumeDepth)) deferred = true
    }
    refreshSurfaces()
    if (!deferred) dirty = false
  }

  function wetCells(): number[] {
    const found: number[] = []
    for (let index = 0; index < cellCount; index += 1) {
      if (depth[index] > WATER_MIN_VISIBLE_DEPTH) found.push(index)
    }
    return found
  }

  // Scratch for the shore field: a two-pass 8-neighbour chamfer transform
  // finds a rounded distance to water instead of diamond-shaped Manhattan
  // rings made by a 4-neighbour flood fill.
  const shoreDistance = new Float32Array(cellCount)
  const shoreSource = new Int32Array(cellCount)
  const shoreLevel = new Float32Array(cellCount)
  const shoreWetness = new Float32Array(cellCount)

  function shoreField(): { level: Float32Array; wetness: Float32Array } {
    shoreDistance.fill(Infinity)
    shoreSource.fill(-1)
    shoreLevel.fill(Number.NaN)
    for (let index = 0; index < cellCount; index += 1) {
      // The water solver still keeps tiny films for gameplay, but they should
      // not start a wide translucent shore sheet until a cell has a visible,
      // meaningful amount of water.
      if (depth[index] < WATER_MIN_RENDER_DEPTH) continue
      shoreDistance[index] = 0
      shoreSource[index] = index
    }

    const diagonal = Math.SQRT2
    const relax = (index: number, neighbour: number, cost: number): void => {
      const candidate = shoreDistance[neighbour] + cost
      if (candidate >= shoreDistance[index]) return
      shoreDistance[index] = candidate
      shoreSource[index] = shoreSource[neighbour]
    }
    // Forward chamfer pass.
    for (let gz = 0; gz < gridRows; gz += 1) {
      for (let gx = 0; gx < gridCols; gx += 1) {
        const index = gz * gridCols + gx
        if (gx > 0) relax(index, index - 1, 1)
        if (gz > 0) {
          relax(index, index - gridCols, 1)
          if (gx > 0) relax(index, index - gridCols - 1, diagonal)
          if (gx + 1 < gridCols) relax(index, index - gridCols + 1, diagonal)
        }
      }
    }
    // Backward chamfer pass.
    for (let gz = gridRows - 1; gz >= 0; gz -= 1) {
      for (let gx = gridCols - 1; gx >= 0; gx -= 1) {
        const index = gz * gridCols + gx
        if (gx + 1 < gridCols) relax(index, index + 1, 1)
        if (gz + 1 < gridRows) {
          relax(index, index + gridCols, 1)
          if (gx > 0) relax(index, index + gridCols - 1, diagonal)
          if (gx + 1 < gridCols) relax(index, index + gridCols + 1, diagonal)
        }
      }
    }

    const fadeEnd = WATER_SHORE_BAND + cellSize * 1.1
    for (let index = 0; index < cellCount; index += 1) {
      const source = shoreSource[index]
      if (source < 0) {
        shoreWetness[index] = 0
        continue
      }
      shoreLevel[index] = surface[source]
      shoreWetness[index] = 1 - smoothstep(WATER_SHORE_BAND, fadeEnd, shoreDistance[index] * cellSize)
    }
    return { level: shoreLevel, wetness: shoreWetness }
  }

  function isDamp(x: number, z: number): boolean {
    const reach = Math.max(1, Math.ceil(WATER_SHORE_BAND / cellSize))
    const gx = clampGx(Math.floor((x - cellOriginX) / cellSize))
    const gz = clampGz(Math.floor((z - cellOriginZ) / cellSize))
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) continue
        if (depth[nz * gridCols + nx] > WATER_MIN_VISIBLE_DEPTH) return true
      }
    }
    return false
  }

  function summary(): WaterFieldSummary {
    let wet = 0
    let volume = 0
    let maxDepth = 0
    let highestSurface = -Infinity
    for (let index = 0; index < cellCount; index += 1) {
      const value = depth[index]
      if (value <= WATER_MIN_VISIBLE_DEPTH) continue
      wet += 1
      volume += value * cellArea
      if (value > maxDepth) maxDepth = value
      if (surface[index] > highestSurface) highestSurface = surface[index]
    }
    return {
      wetCells: wet,
      volume: +volume.toFixed(5),
      maxDepth: +maxDepth.toFixed(4),
      highestSurface: highestSurface === -Infinity ? 0 : +highestSurface.toFixed(3),
      runoff: +totalRunoff.toFixed(5),
    }
  }

  function clear(): void {
    depth.fill(0)
    surface.fill(0)
    totalRunoff = 0
    dirty = true
  }

  readGround()
  computeFilledHeights()

  return {
    cellSize,
    gridCols,
    gridRows,
    get dirty() {
      return dirty
    },
    depthAt(x, z) {
      return depth[cellAt(x, z)]
    },
    surfaceAt(x, z) {
      return surface[cellAt(x, z)]
    },
    pour,
    drain,
    settle,
    markTerrainChanged() {
      dirty = true
    },
    isDamp,
    wetCells,
    shoreField,
    summary,
    clear,
  }
}
