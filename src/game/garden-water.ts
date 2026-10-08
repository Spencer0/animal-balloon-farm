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
/** `sinkOf` markers: not yet followed, and a route that ends off any basin. */
const UNRESOLVED_SINK = -2
const NO_SINK = -1
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
  /** Cells with enough water to render as an actual pond surface. */
  readonly visibleWetCells: number
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
  readonly originX: number
  readonly originZ: number
  readonly dirty: boolean
  /** Whether any water remains and must react to terrain edits. */
  readonly hasWater: boolean
  /** Whether enough water remains to render a visible mesh. */
  readonly hasRenderableWater: boolean
  /** Water depth (metres) at the grid cell containing a world point. */
  depthAt(x: number, z: number): number
  /** Water surface height (ground + depth) at the grid cell containing a world point. */
  surfaceAt(x: number, z: number): number
  /**
   * Add water to a disc; returns the volume added, in cubic metres. Only cells
   * whose water would reach a basin with room left take water, so ground that
   * drains off the parcel accepts nothing: a big bucket over flat grass adds
   * nothing rather than running water off the edge.
   */
  pour(x: number, z: number, radius: number, metres: number): number
  /**
   * True when a pour at this disc would add any water right now. The bucket
   * cursor reads this to show whether the spot can be poured on.
   */
  canPour(x: number, z: number, radius: number): boolean
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
  /** Grow the simulation grid while preserving every existing water cell. */
  resize(gridCols: number, gridRows: number): void
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
  let gridCols = Math.max(1, Math.floor(options.gridCols))
  let gridRows = Math.max(1, Math.floor(options.gridRows))
  let cellCount = gridCols * gridRows
  const cellArea = cellSize * cellSize
  const cellHeight = options.cellHeight
  let depth = new Float32Array(cellCount)
  let ground = new Float32Array(cellCount)
  let surface = new Float32Array(cellCount)
  /** Minimax escape height per cell — see the module header. */
  let filled = new Float32Array(cellCount)
  /** Generation stamp, so membership tests never clear the whole grid. */
  let memberStamp = new Int32Array(cellCount)
  let generation = 0
  /**
   * Where water poured on each cell ends up: the basin cell it routes into, or
   * -1 when it would drain off the parcel or sit stuck on a flat. Rebuilt lazily
   * whenever the ground snapshot changes.
   */
  let sinkOf = new Int32Array(cellCount)
  let sinkStale = true
  const sinkPath: number[] = []
  /** Pour volume each sink basin is asked to take this call, and the share it can take. */
  let sinkDemand = new Float32Array(cellCount)
  let sinkScale = new Float32Array(cellCount)
  /**
   * Pool budgets (see `poolOf`). Every basin cell points at the representative
   * cell of the pool it joins; the representative holds that pool's room. A
   * stamp older than `capacityGeneration` means the budget is stale.
   */
  let poolOfCell = new Int32Array(cellCount)
  let poolCellStamp = new Int32Array(cellCount)
  let poolRoom = new Float32Array(cellCount)
  /** Pass stamp: cells a settle pass has already levelled, so no pool is solved twice. */
  let settledStamp = new Int32Array(cellCount)
  let settlePass = 0
  let capacityGeneration = 1
  /** Set when terrain moved, so the ground snapshot is re-read before queries. */
  let groundStale = true

  let heap = new MinHeap(cellCount + 1)
  // Scratch reused across every pool in a settle. `component` is the wet run
  // being levelled; `basin` is the set of cells its level can actually occupy.
  // They differ, so a pool that turns out to hold no water has to be cleared
  // from `component` — otherwise the leftovers sit there forever.
  const component: number[] = []
  const basin: number[] = []
  const stack: number[] = []

  let dirty = false
  let hasWater = false
  let hasRenderableWater = false
  let totalRunoff = 0

  // Cell (gx, gz) is centred on the garden origin, matching the terrain grid.
  let cellOriginX = -(gridCols * cellSize) / 2
  let cellOriginZ = -(gridRows * cellSize) / 2

  function readGround(): void {
    for (let gz = 0; gz < gridRows; gz += 1) {
      for (let gx = 0; gx < gridCols; gx += 1) {
        ground[gz * gridCols + gx] = cellHeight(gx, gz)
      }
    }
    sinkStale = true
    groundStale = false
    capacityGeneration += 1
  }

  /**
   * Bring the ground snapshot, escape heights and sinks up to date with the
   * terrain. Queries call this, because a cursor can be read between a terrain
   * edit and the next settle.
   */
  function ensureGround(): void {
    if (!groundStale) return
    readGround()
    computeFilledHeights()
  }

  function refreshSurfaces(): void {
    hasWater = false
    hasRenderableWater = false
    for (let index = 0; index < cellCount; index += 1) {
      surface[index] = ground[index] + depth[index]
      if (depth[index] > WATER_MIN_VISIBLE_DEPTH) hasWater = true
      if (depth[index] >= WATER_MIN_RENDER_DEPTH) hasRenderableWater = true
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

  /**
   * The neighbour water on `index` runs to, using exactly the rule routeDownhill
   * applies: the lowest neighbour strictly below the cell, first match wins.
   * Returns -1 when no neighbour is lower.
   */
  function lowerNeighbour(index: number): number {
    const gx = index % gridCols
    const gz = (index - gx) / gridCols
    let lowestIndex = -1
    let lowestHeight = ground[index]
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = gx + dx
      const nz = gz + dz
      if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) continue
      const neighbour = nz * gridCols + nx
      if (ground[neighbour] >= lowestHeight) continue
      lowestHeight = ground[neighbour]
      lowestIndex = neighbour
    }
    return lowestIndex
  }

  /**
   * Fill `sinkOf` for every cell by following each cell's downhill route to the
   * first basin it reaches. Each step strictly lowers the ground, so every walk
   * ends; a cell whose route ends at a flat (no lower neighbour) has no sink.
   */
  function computeSinks(): void {
    sinkOf.fill(UNRESOLVED_SINK)
    for (let start = 0; start < cellCount; start += 1) {
      if (sinkOf[start] !== UNRESOLVED_SINK) continue
      let current = start
      let result = NO_SINK
      sinkPath.length = 0
      for (;;) {
        if (sinkOf[current] !== UNRESOLVED_SINK) {
          result = sinkOf[current]
          break
        }
        if (isBasinCell(current)) {
          result = current
          break
        }
        const next = lowerNeighbour(current)
        if (next < 0) break
        sinkPath.push(current)
        current = next
      }
      sinkOf[current] = result
      for (const index of sinkPath) sinkOf[index] = result
    }
  }

  function ensureSinks(): void {
    if (!sinkStale) return
    computeSinks()
    sinkStale = false
  }

  /**
   * The representative cell of the pool a basin cell belongs to. The first
   * basin cell of a pool to be asked does the work: it floods the pool below
   * its spill height and records the room left (volume in depth units, the
   * spill volume less the water already there). Every cell it reaches shares
   * that budget, so several sinks feeding one bowl cannot each claim the whole
   * room. The budget is kept current by `pour` and reset by any water or ground
   * change, which bumps `capacityGeneration`.
   */
  function poolOf(seed: number): number {
    if (poolCellStamp[seed] === capacityGeneration) return poolOfCell[seed]
    const level = filled[seed]
    let room = 0
    generation += 1
    memberStamp[seed] = generation
    stack.length = 0
    stack.push(seed)
    let visited = 0
    while (stack.length > 0 && visited < MAX_BASIN_CELLS) {
      const index = stack.pop() as number
      visited += 1
      room += level - ground[index] - depth[index]
      poolCellStamp[index] = capacityGeneration
      poolOfCell[index] = seed
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) continue
        const neighbour = nz * gridCols + nx
        if (memberStamp[neighbour] === generation) continue
        // A cell already claimed by another pool keeps that pool's budget.
        if (poolCellStamp[neighbour] === capacityGeneration) continue
        if (ground[neighbour] >= level || !isBasinCell(neighbour)) continue
        memberStamp[neighbour] = generation
        stack.push(neighbour)
      }
    }
    poolRoom[seed] = Math.max(0, room)
    return seed
  }

  /** Weight of a grid cell in a brush disc: 0 outside, easing to 0 at the rim. */
  function discWeight(x: number, z: number, radius: number, gx: number, gz: number): number {
    const distance = Math.hypot(cellCentreX(gx) - x, cellCentreZ(gz) - z)
    if (distance > radius) return 0
    return 1 - smoothstep(RIM_EASE_START, 1, distance / radius)
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
        // A run is one pool: it spreads through basin cells, wet or dry, so two
        // wet patches in the same bowl are levelled together rather than one
        // overwriting the other. Dry ground ends the run.
        if (depth[neighbour] <= 0 && !isBasinCell(neighbour)) continue
        memberStamp[neighbour] = generation
        stack.push(neighbour)
      }
    }
    return component.length
  }

  /**
   * Grow the set of cells a pool at `level` would occupy. Every cell of the wet
   * run seeds it, not one anchor: water that landed above the pool's surface
   * still belongs to the pool and flows down into it. The region then spreads
   * 4-connected through basin cells below the level. Returns the count.
   */
  function growPoolRegion(level: number, floor: number): number {
    basin.length = 0
    stack.length = 0
    generation += 1
    for (const index of component) {
      memberStamp[index] = generation
      stack.push(index)
    }
    // The floor is the pool's lowest reachable point. Water settles there and
    // spreads back up, so the region must reach it even when the wet run sits
    // on a slope above the final surface.
    if (memberStamp[floor] !== generation) {
      memberStamp[floor] = generation
      stack.push(floor)
    }
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
    // The search must reach the spill height: a flat-floored pit can only be
    // full at its rim, which may sit more than the headroom above its floor.
    let lo = low
    const spill = lowestSpill()
    let hi = Math.max(high + LEVEL_SOLVE_HEADROOM, Number.isFinite(spill) ? spill : low)
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
  /**
   * The lowest cell the wet run can reach through basin cells. Water on a slope
   * flows down to this cell before it spreads, so it is the pool's true floor.
   */
  function findPoolFloor(): number {
    let floor = component[0]
    stack.length = 0
    generation += 1
    for (const index of component) {
      memberStamp[index] = generation
      stack.push(index)
    }
    let visited = 0
    while (stack.length > 0 && visited < MAX_BASIN_CELLS) {
      const index = stack.pop() as number
      visited += 1
      if (ground[index] < ground[floor]) floor = index
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx < 0 || nz < 0 || nx >= gridCols || nz >= gridRows) continue
        const neighbour = nz * gridCols + nx
        if (memberStamp[neighbour] === generation) continue
        if (!isBasinCell(neighbour)) continue
        memberStamp[neighbour] = generation
        stack.push(neighbour)
      }
    }
    return floor
  }

  function settleComponent(volumeDepth: number): boolean {
    // A wet run with no basin cell has nowhere to hold water: it drains off.
    let anyBasin = false
    for (const index of component) {
      if (isBasinCell(index)) anyBasin = true
    }
    if (!anyBasin) {
      for (const index of component) depth[index] = 0
      totalRunoff += volumeDepth * cellArea
      return true
    }

    // Start from the level the volume would reach on the lowest cell of the
    // run, then iterate: the region depends on the level and the level depends
    // on the region. Widening the pool lowers the level it can support, so the
    // spill cap is recomputed on each round until the two agree.
    const floor = findPoolFloor()
    growPoolRegion(ground[floor] + volumeDepth, floor)
    let level = Math.min(solveLevel(volumeDepth), lowestSpill())
    let settled = false
    for (let round = 0; round < MAX_GROWTH_ROUNDS; round += 1) {
      growPoolRegion(level, floor)
      const next = Math.min(solveLevel(volumeDepth), lowestSpill())
      if (Math.abs(next - level) < 1e-6) {
        level = next
        settled = true
        break
      }
      level = next
    }

    // Materialise the pool over the region the final level describes. Every
    // wet cell of the run is a seed, so none is left behind to be counted twice.
    growPoolRegion(level, floor)
    let held = 0
    for (const index of basin) {
      // Keep sub-visible amounts too: zeroing them would count rounding as
      // overflow on every settle and quietly lose water from a full pool.
      const next = level - ground[index]
      depth[index] = next > 0 ? next : 0
      held += depth[index]
    }
    const surplus = volumeDepth - held
    if (surplus > WATER_MIN_VISIBLE_DEPTH) totalRunoff += surplus * cellArea
    return settled
  }

  /** Grid bounds of the square that contains a brush disc, clamped to the grid. */
  function discBounds(x: number, z: number, radius: number): [number, number, number, number] {
    return [
      clampGx(Math.floor((x - radius - cellOriginX) / cellSize)),
      clampGx(Math.floor((x + radius - cellOriginX) / cellSize)),
      clampGz(Math.floor((z - radius - cellOriginZ) / cellSize)),
      clampGz(Math.floor((z + radius - cellOriginZ) / cellSize)),
    ]
  }

  /**
   * Only water that can be kept takes the pour. Each cell's share goes to the
   * basin it drains into, and a basin takes at most the room it has left, so a
   * big bucket never sends water off the parcel. When a basin is short of room,
   * every cell feeding it is scaled down by the same factor.
   */
  function pour(x: number, z: number, radius: number, metres: number): number {
    if (!(metres > 0) || !(radius > 0)) return 0
    ensureGround()
    ensureSinks()
    const [minGx, maxGx, minGz, maxGz] = discBounds(x, z, radius)
    // Demand is totalled per pool, not per sink: every route into one bowl
    // competes for the same room.
    const touched: number[] = []
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const weight = discWeight(x, z, radius, gx, gz)
        const sink = sinkOf[gz * gridCols + gx]
        if (weight <= 0 || sink < 0) continue
        const pool = poolOf(sink)
        if (sinkDemand[pool] === 0) touched.push(pool)
        sinkDemand[pool] += metres * weight
      }
    }
    for (const pool of touched) {
      const room = poolRoom[pool]
      const demand = sinkDemand[pool]
      // Same room threshold canPour uses, so the cursor and the pour agree.
      sinkScale[pool] = room <= BASIN_MIN_DEPTH ? 0 : room < demand ? room / demand : 1
    }
    let added = 0
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const weight = discWeight(x, z, radius, gx, gz)
        const index = gz * gridCols + gx
        const sink = sinkOf[index]
        if (weight <= 0 || sink < 0) continue
        const pool = poolOf(sink)
        const share = sinkScale[pool]
        if (share <= 0) continue
        const add = metres * weight * share
        depth[index] += add
        added += add
        // The next call must see the room this one used.
        poolRoom[pool] -= add
      }
    }
    for (const pool of touched) {
      sinkDemand[pool] = 0
      sinkScale[pool] = 1
    }
    if (added > 0) {
      hasWater = true
      dirty = true
    }
    return added * cellArea
  }

  /**
   * Whether a pour on this disc would add any water right now. It is the same
   * test pour applies, so the cursor colour and the pour never disagree.
   */
  function canPour(x: number, z: number, radius: number): boolean {
    if (!(radius > 0)) return false
    ensureGround()
    ensureSinks()
    const [minGx, maxGx, minGz, maxGz] = discBounds(x, z, radius)
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        if (discWeight(x, z, radius, gx, gz) <= 0) continue
        const sink = sinkOf[gz * gridCols + gx]
        if (sink >= 0 && poolRoom[poolOf(sink)] > BASIN_MIN_DEPTH) return true
      }
    }
    return false
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
    if (removed > 0) {
      hasWater = true
      dirty = true
      capacityGeneration += 1
    }
    return removed * cellArea
  }

  function settle(): void {
    if (!dirty) return
    // A dry shovel edit has no hydrology to solve. Keep the terrain snapshot
    // lazy; the next pour will read the current ground before routing water.
    if (!hasWater) {
      dirty = false
      return
    }
    // Terrain may have moved under the water since the last settle, so both
    // the ground snapshot and the escape heights are rebuilt first.
    readGround()
    computeFilledHeights()
    // Water above the waterline runs downhill into whatever basin it can reach
    // before any pool is levelled, so the routing sees the whole field.
    routeDownhill()
    const seeds: number[] = []
    for (let index = 0; index < cellCount; index += 1) {
      if (depth[index] > 0) seeds.push(index)
    }
    settlePass += 1
    let components = 0
    let deferred = false
    for (const seed of seeds) {
      if (components >= MAX_COMPONENTS_PER_SETTLE) {
        deferred = true
        break
      }
      if (depth[seed] <= 0 || settledStamp[seed] === settlePass) continue
      // The whole wet run belongs to one pool, so its whole volume is levelled
      // together — otherwise a pond draining from one end would tear in half.
      const componentSize = collectWetComponent(seed)
      if (componentSize === 0) continue
      let volumeDepth = 0
      for (let i = 0; i < componentSize; i += 1) volumeDepth += depth[component[i]]
      if (volumeDepth <= 0) {
        for (let i = 0; i < componentSize; i += 1) depth[component[i]] = 0
        continue
      }
      components += 1
      // Stamp the run before solving, so the seeds loop never revisits it.
      for (const index of component) settledStamp[index] = settlePass
      if (!settleComponent(volumeDepth)) deferred = true
    }
    refreshSurfaces()
    // The water moved, so every cached basin room is out of date.
    capacityGeneration += 1
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
  let shoreDistance = new Float32Array(cellCount)
  let shoreSource = new Int32Array(cellCount)
  let shoreLevel = new Float32Array(cellCount)
  let shoreWetness = new Float32Array(cellCount)

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
    let visibleWet = 0
    let volume = 0
    let maxDepth = 0
    let highestSurface = -Infinity
    for (let index = 0; index < cellCount; index += 1) {
      const value = depth[index]
      // Volume counts every drop, including films too thin to read as water, so
      // the total always matches what the bucket put in.
      if (value > 0) volume += value * cellArea
      if (value <= WATER_MIN_VISIBLE_DEPTH) continue
      wet += 1
      if (value >= WATER_MIN_RENDER_DEPTH) visibleWet += 1
      if (value > maxDepth) maxDepth = value
      if (surface[index] > highestSurface) highestSurface = surface[index]
    }
    return {
      wetCells: wet,
      visibleWetCells: visibleWet,
      volume: +volume.toFixed(5),
      maxDepth: +maxDepth.toFixed(4),
      highestSurface: highestSurface === -Infinity ? 0 : +highestSurface.toFixed(3),
      runoff: +totalRunoff.toFixed(5),
    }
  }

  function clear(): void {
    depth.fill(0)
    surface.fill(0)
    hasWater = false
    hasRenderableWater = false
    totalRunoff = 0
    dirty = true
    capacityGeneration += 1
  }

  function resize(nextCols: number, nextRows: number): void {
    const cols = Math.max(gridCols, Math.floor(nextCols))
    const rows = Math.max(gridRows, Math.floor(nextRows))
    if (cols === gridCols && rows === gridRows) return
    const oldHasWater = hasWater
    const oldCols = gridCols
    const oldRows = gridRows
    const oldOriginX = cellOriginX
    const oldOriginZ = cellOriginZ
    const oldDepth = depth
    gridCols = cols
    gridRows = rows
    cellCount = gridCols * gridRows
    cellOriginX = -(gridCols * cellSize) / 2
    cellOriginZ = -(gridRows * cellSize) / 2
    depth = new Float32Array(cellCount)
    ground = new Float32Array(cellCount)
    surface = new Float32Array(cellCount)
    filled = new Float32Array(cellCount)
    memberStamp = new Int32Array(cellCount)
    sinkOf = new Int32Array(cellCount)
    sinkDemand = new Float32Array(cellCount)
    sinkScale = new Float32Array(cellCount)
    poolOfCell = new Int32Array(cellCount)
    poolCellStamp = new Int32Array(cellCount)
    poolRoom = new Float32Array(cellCount)
    settledStamp = new Int32Array(cellCount)
    settlePass = 0
    capacityGeneration += 1
    heap = new MinHeap(cellCount + 1)
    shoreDistance = new Float32Array(cellCount)
    shoreSource = new Int32Array(cellCount)
    shoreLevel = new Float32Array(cellCount)
    shoreWetness = new Float32Array(cellCount)
    generation = 0
    for (let gz = 0; gz < oldRows; gz += 1) {
      const worldZ = oldOriginZ + (gz + 0.5) * cellSize
      const newZ = Math.round((worldZ - cellOriginZ) / cellSize - 0.5)
      if (newZ < 0 || newZ >= gridRows) continue
      for (let gx = 0; gx < oldCols; gx += 1) {
        const value = oldDepth[gz * oldCols + gx]
        if (value <= 0) continue
        const worldX = oldOriginX + (gx + 0.5) * cellSize
        const newX = Math.round((worldX - cellOriginX) / cellSize - 0.5)
        if (newX >= 0 && newX < gridCols) depth[newZ * gridCols + newX] += value
      }
    }
    readGround()
    refreshSurfaces()
    dirty = oldHasWater || hasWater
  }

  readGround()
  computeFilledHeights()

  return {
    cellSize,
    get gridCols() { return gridCols },
    get gridRows() { return gridRows },
    get originX() { return cellOriginX },
    get originZ() { return cellOriginZ },
    get dirty() {
      return dirty
    },
    get hasWater() {
      return hasWater
    },
    get hasRenderableWater() {
      return hasRenderableWater
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
      // The ground snapshot is stale whether or not there is water, so a cursor
      // query or a pour re-reads it before answering.
      groundStale = true
      // No water means there is nothing to resettle; a later pour takes a fresh
      // ground snapshot before solving the new pool.
      if (hasWater) dirty = true
    },
    canPour,
    isDamp,
    wetCells,
    shoreField,
    summary,
    clear,
    resize,
  }
}
