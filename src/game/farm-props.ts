/**
 * Pure simulation for the shop's garden props.
 *
 * No Three.js import on purpose, matching `animal-conditions.ts` and
 * `farm-expansion.ts`: the catalog, the inventory, the 2 m placement lattice,
 * the validity rules and the fence-run topology are all plain data, so they can
 * be unit tested headless and reused by the scene without the scene leaking back
 * in. Everything a rule needs to know about the ground -- height, water and the
 * garden boundary -- arrives through an injected `PropSurface`.
 */

import type { Wallet } from './sales'

export type PropId = 'fence' | 'statue' | 'fountain' | 'coop' | 'barn' | 'oak' | 'garbage-can' | 'dumpster'
  | 'goose-house' | 'sty' | 'frog-house' | 'owl-box' | 'hollow-log' | 'rock-pile'
export type FenceAxis = 'x' | 'z'

/** The lattice cell size in garden metres. Every prop snaps to this. */
export const PROP_LATTICE_CELL = 2
/** A footprint whose sampled heights spread past this is refused as too steep. */
export const PROP_SLOPE_TOLERANCE = 0.35
/** Water deeper than this inside a footprint is refused. */
export const PROP_WATER_MAX_DEPTH = 0.05

export interface PropFootprint {
  /** Size across the lattice `x` axis, in cells. */
  readonly width: number
  /** Size across the lattice `z` axis, in cells. */
  readonly depth: number
}

export interface PropDefinition {
  readonly id: PropId
  readonly name: string
  readonly description: string
  readonly blurb: string
  readonly color: string
  readonly price: number
  readonly footprint: PropFootprint
  /** Target longest side of the loaded model, in garden metres. */
  readonly size: number
  /** Cell props snap to a cell; edge props are fence segments along a lattice edge. */
  readonly kind: 'cell' | 'edge'
  readonly rotatable: boolean
  /** Blocking props claim their cells against plants and steer animals around. */
  readonly blocking: boolean
  readonly modelUrl: string
}

/**
 * The one price table. First pass, scaled against `sales.ts` sale values: a
 * mature clover is worth 5 and a settled cow 42, so a fountain is roughly a
 * cow and a half. Effortless to retune once the earn rate is felt.
 */
export const PROP_CATALOG: Readonly<Record<PropId, PropDefinition>> = {
  fence: {
    id: 'fence',
    name: 'Fence',
    description: 'A rail run; drag along the lattice to join posts.',
    blurb: 'Keeps the clover tidy. Drag a run and the posts join themselves.',
    color: '#c9a06a',
    price: 12,
    footprint: { width: 1, depth: 1 },
    size: 2,
    kind: 'edge',
    rotatable: false,
    blocking: true,
    modelUrl: 'assets/props/fence.glb',
  },
  statue: {
    id: 'statue',
    name: 'Garden Statue',
    description: 'A carved friend for a quiet corner.',
    blurb: 'A small carved friend, happy wherever the ground is level.',
    color: '#b8b2a4',
    price: 40,
    footprint: { width: 1, depth: 1 },
    size: 1.7,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/statue.glb',
  },
  fountain: {
    id: 'fountain',
    name: 'Fountain',
    description: 'A stone basin that brightens the lawn.',
    blurb: 'Splashy centrepiece. Round, so it does not care which way it faces.',
    color: '#8fb6c6',
    price: 60,
    footprint: { width: 1, depth: 1 },
    size: 2.6,
    kind: 'cell',
    rotatable: false,
    blocking: true,
    modelUrl: 'assets/props/fountain.glb',
  },
  coop: {
    id: 'coop',
    name: 'Chicken Coop',
    description: 'A roomy wooden coop with warm nesting boxes.',
    blurb: 'Home to chickens and ducks: room for ten, and chicks and ducklings are born inside.',
    color: '#c96f4a',
    price: 90,
    footprint: { width: 2, depth: 2 },
    size: 4.1,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/coop.glb',
  },
  barn: {
    id: 'barn',
    name: 'Small Barn',
    description: 'A little red barn with a hayloft.',
    blurb: 'Home to cows and sheep: room for ten, and calves and lambs are born inside.',
    color: '#b8503f',
    price: 110,
    footprint: { width: 2, depth: 2 },
    size: 4.2,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/barn.glb',
  },
  oak: {
    id: 'oak',
    name: 'Oak Tree',
    description: 'A broad balloon-leaf oak with a thick branch for roosting.',
    blurb: 'Shade by day and a perch by night. The owl will not settle without one.',
    color: '#639f50',
    price: 140,
    footprint: { width: 2, depth: 2 },
    size: 6.4,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/oak.glb',
  },
  'garbage-can': {
    id: 'garbage-can',
    name: 'Garbage Can',
    description: 'A dented tin can with a lid that never quite closes.',
    blurb: 'Smells like dinner after dark. A raccoon will not settle without one nearby.',
    color: '#9aa4a8',
    price: 45,
    footprint: { width: 1, depth: 1 },
    size: 1.5,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/garbage-can.glb',
  },
  dumpster: {
    id: 'dumpster',
    name: 'Dumpster',
    description: 'A battered steel dumpster, lids thrown open and heaped with bags.',
    blurb: 'A raccoon\'s home: room for ten, and kits are born inside.',
    color: '#868b8e',
    price: 120,
    footprint: { width: 2, depth: 1 },
    size: 4.5,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/dumpster.glb',
  },
  'goose-house': {
    id: 'goose-house',
    name: 'Goose House',
    description: 'A low A-frame shed with a wide door and a ramp down to the water.',
    blurb: 'Home to geese: room for ten, and goslings are born inside. Geese like it near the pond.',
    color: '#e0c48a',
    price: 100,
    footprint: { width: 2, depth: 2 },
    size: 3.8,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/goose-house.glb',
  },
  sty: {
    id: 'sty',
    name: 'Pig Sty',
    description: 'A snug lean-to shelter beside a fenced mud wallow.',
    blurb: 'Home to pigs: room for ten, and piglets are born inside.',
    color: '#d98b8f',
    price: 95,
    footprint: { width: 2, depth: 2 },
    size: 4,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/sty.glb',
  },
  'frog-house': {
    id: 'frog-house',
    name: 'Frog House',
    description: 'A hollow stump with a little round door, ringed with lily pads.',
    blurb: 'Home to frogs: room for ten, and froglets are born inside. Best on the bank of a pond.',
    color: '#8bb35c',
    price: 70,
    footprint: { width: 1, depth: 1 },
    size: 2,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/frog-house.glb',
  },
  'owl-box': {
    id: 'owl-box',
    name: 'Owl Box',
    description: 'A peaked nest box with a round entrance, up on a tall post.',
    blurb: 'Home to owls: room for ten, and owlets are born inside.',
    color: '#a9774b',
    price: 80,
    footprint: { width: 1, depth: 1 },
    size: 3.2,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/owl-box.glb',
  },
  'hollow-log': {
    id: 'hollow-log',
    name: 'Hollow Log',
    description: 'A fallen hollow log with a knothole door, tucked into the long grass.',
    blurb: 'Home to mice and rats: room for ten, and young are born inside. Best in tall grass.',
    color: '#8a6240',
    price: 75,
    footprint: { width: 2, depth: 1 },
    size: 3.8,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/hollow-log.glb',
  },
  'rock-pile': {
    id: 'rock-pile',
    name: 'Rock Pile',
    description: 'A sun-warmed cairn of round stones with a snug crevice door.',
    blurb: 'Home to snakes: room for ten, and hatchlings are born inside. They bask on top.',
    color: '#b9a582',
    price: 85,
    footprint: { width: 1, depth: 1 },
    size: 2,
    kind: 'cell',
    rotatable: true,
    blocking: true,
    modelUrl: 'assets/props/rock-pile.glb',
  },
}

/** The order the shop and the inventory list items in. */
export const PROP_ORDER: readonly PropId[] = ['statue', 'fountain', 'fence', 'coop', 'barn', 'sty', 'goose-house', 'frog-house', 'hollow-log', 'oak', 'owl-box', 'rock-pile', 'garbage-can', 'dumpster']

export function propDefinition(id: PropId): PropDefinition {
  return PROP_CATALOG[id]
}

export function propPrice(id: PropId): number {
  return PROP_CATALOG[id].price
}

/** A placed prop sells back for this share of its shop price. */
export const PROP_SELL_RATIO = 0.5

/**
 * Coins for selling a placed prop. `sections` is the number of fence sections
 * in a run; every other prop is a single piece. Always at least 1 coin per
 * piece so a sale never rounds down to nothing.
 */
export function propSaleValue(id: PropId, sections = 1): number {
  const pieces = Number.isFinite(sections) ? Math.max(1, Math.floor(sections)) : 1
  return Math.max(1, Math.floor(PROP_CATALOG[id].price * PROP_SELL_RATIO)) * pieces
}

const PROP_CATEGORY: Readonly<Record<PropId, string>> = {
  fence: 'Fence',
  statue: 'Decoration',
  fountain: 'Decoration',
  coop: 'Shelter',
  barn: 'Shelter',
  oak: 'Tree',
  'garbage-can': 'Utility',
  dumpster: 'Shelter',
  'goose-house': 'Shelter',
  sty: 'Shelter',
  'frog-house': 'Shelter',
  'owl-box': 'Shelter',
  'hollow-log': 'Shelter',
  'rock-pile': 'Shelter',
}

/** Chip copy for the info card, e.g. "Shelter" or "Fence run - 4 sections". */
export function propCardChip(id: PropId, sections = 1): string {
  if (id !== 'fence') return PROP_CATEGORY[id]
  const count = Number.isFinite(sections) ? Math.max(1, Math.floor(sections)) : 1
  return `Fence run · ${count} section${count === 1 ? '' : 's'}`
}

// ----------------------------------------------------------------- inventory --

export interface PropInventory {
  count(id: PropId): number
  /** Add owned items. Returns the new count. */
  add(id: PropId, amount?: number): number
  /** Remove owned items. Returns false (and changes nothing) when short. */
  take(id: PropId, amount?: number): boolean
  /** Set the owned count outright; used by the harness. */
  set(id: PropId, amount: number): void
  readonly counts: Readonly<Record<PropId, number>>
  total(): number
  clear(): void
}

export function createPropInventory(initial?: Partial<Record<PropId, number>>): PropInventory {
  const counts: Record<PropId, number> = { fence: 0, statue: 0, fountain: 0, coop: 0, barn: 0, oak: 0, 'garbage-can': 0, dumpster: 0, 'goose-house': 0, sty: 0, 'frog-house': 0, 'owl-box': 0, 'hollow-log': 0, 'rock-pile': 0 }
  for (const id of PROP_ORDER) {
    const value = initial?.[id]
    counts[id] = Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0
  }
  return {
    count(id) { return counts[id] },
    add(id, amount = 1) {
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Prop amounts must be non-negative finite numbers')
      counts[id] += Math.floor(amount)
      return counts[id]
    },
    take(id, amount = 1) {
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Prop amounts must be non-negative finite numbers')
      const cost = Math.floor(amount)
      if (cost > counts[id]) return false
      counts[id] -= cost
      return true
    },
    set(id, amount) {
      counts[id] = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0
    },
    get counts(): Readonly<Record<PropId, number>> { return { ...counts } },
    total() { return PROP_ORDER.reduce((sum, id) => sum + counts[id], 0) },
    clear() { for (const id of PROP_ORDER) counts[id] = 0 },
  }
}

// -------------------------------------------------------------------- lattice --

export interface CellCoord {
  readonly cellX: number
  readonly cellZ: number
}

/** A fence segment sits on the lattice edge from vertex (x,z) along `axis`. */
export interface FenceSegment {
  readonly x: number
  readonly z: number
  readonly axis: FenceAxis
}

export interface LatticeVertex {
  readonly x: number
  readonly z: number
}

export function cellKey(cell: CellCoord): string {
  return `${cell.cellX},${cell.cellZ}`
}

export function edgeKey(segment: FenceSegment): string {
  return `${segment.x},${segment.z},${segment.axis}`
}

export function vertexKey(vertex: LatticeVertex): string {
  return `${vertex.x},${vertex.z}`
}

/** The four vertices of a fence segment, as `[from, to]`. */
export function segmentVertices(segment: FenceSegment): readonly [LatticeVertex, LatticeVertex] {
  return segment.axis === 'x'
    ? [{ x: segment.x, z: segment.z }, { x: segment.x + 1, z: segment.z }]
    : [{ x: segment.x, z: segment.z }, { x: segment.x, z: segment.z + 1 }]
}

/** The lattice vertex at a garden point, rounded to the nearest lattice line. */
export function vertexAt(x: number, z: number): LatticeVertex {
  return {
    x: Math.round(x / PROP_LATTICE_CELL),
    z: Math.round(z / PROP_LATTICE_CELL),
  }
}

/** The cell a garden point falls inside. */
export function cellAt(x: number, z: number): CellCoord {
  return {
    cellX: Math.floor(x / PROP_LATTICE_CELL),
    cellZ: Math.floor(z / PROP_LATTICE_CELL),
  }
}

/** The normalised quarter-turn rotation, 0..3. */
export function normalizeRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0
  return ((Math.round(rotation) % 4) + 4) % 4
}

/** How many cells a footprint covers after rotation swaps width and depth. */
export function footprintExtent(id: PropId, rotation: number): PropFootprint {
  const def = PROP_CATALOG[id]
  const quarter = normalizeRotation(rotation)
  return quarter % 2 === 0
    ? def.footprint
    : { width: def.footprint.depth, depth: def.footprint.width }
}

/** Every cell a prop would occupy, with `cell` as the footprint's min corner. */
export function footprintCells(id: PropId, cell: CellCoord, rotation: number): readonly CellCoord[] {
  const extent = footprintExtent(id, rotation)
  const cells: CellCoord[] = []
  for (let dz = 0; dz < extent.depth; dz += 1) {
    for (let dx = 0; dx < extent.width; dx += 1) {
      cells.push({ cellX: cell.cellX + dx, cellZ: cell.cellZ + dz })
    }
  }
  return cells
}

export interface WorldPoint {
  readonly x: number
  readonly z: number
}

/** Cell min-corner to garden metres. */
export function cellMinWorld(cell: CellCoord): WorldPoint {
  return { x: cell.cellX * PROP_LATTICE_CELL, z: cell.cellZ * PROP_LATTICE_CELL }
}

/** The centre of a footprint in garden metres, for placing the model. */
export function footprintCenterWorld(id: PropId, cell: CellCoord, rotation: number): WorldPoint {
  const extent = footprintExtent(id, rotation)
  const min = cellMinWorld(cell)
  return {
    x: min.x + (extent.width * PROP_LATTICE_CELL) / 2,
    z: min.z + (extent.depth * PROP_LATTICE_CELL) / 2,
  }
}

/** The garden-metre rectangle a footprint covers. */
export function footprintWorldRect(
  id: PropId,
  cell: CellCoord,
  rotation: number,
): { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number } {
  const extent = footprintExtent(id, rotation)
  const min = cellMinWorld(cell)
  return {
    minX: min.x,
    minZ: min.z,
    maxX: min.x + extent.width * PROP_LATTICE_CELL,
    maxZ: min.z + extent.depth * PROP_LATTICE_CELL,
  }
}

// ---------------------------------------------------------------- occupancy --

export interface PlacedProp {
  readonly id: PropId
  /** For cell props this is the footprint min corner; for fences the first segment. */
  readonly cell: CellCoord
  readonly rotation: number
  readonly cells: readonly CellCoord[]
  readonly segments: readonly FenceSegment[]
}

export interface PropOccupancy {
  readonly placed: readonly PlacedProp[]
  cellOwner(cell: CellCoord): PlacedProp | null
  edgeOwner(segment: FenceSegment): PlacedProp | null
  isCellFree(cell: CellCoord): boolean
  isEdgeFree(segment: FenceSegment): boolean
  add(prop: PlacedProp): void
  remove(prop: PlacedProp): boolean
  clear(): void
  readonly fenceSegments: readonly FenceSegment[]
}

function samePlaced(a: PlacedProp, b: PlacedProp): boolean {
  return a === b
}

export function createPropOccupancy(): PropOccupancy {
  const placed: PlacedProp[] = []
  const cells = new Map<string, PlacedProp>()
  const edges = new Map<string, PlacedProp>()

  function releaseCells(prop: PlacedProp): void {
    for (const cell of prop.cells) {
      const key = cellKey(cell)
      if (cells.get(key) === prop) cells.delete(key)
    }
    for (const segment of prop.segments) {
      const key = edgeKey(segment)
      if (edges.get(key) === prop) edges.delete(key)
    }
  }

  const occupancy: PropOccupancy = {
    get placed(): readonly PlacedProp[] { return placed },
    cellOwner(cell) { return cells.get(cellKey(cell)) ?? null },
    edgeOwner(segment) { return edges.get(edgeKey(segment)) ?? null },
    isCellFree(cell) { return !cells.has(cellKey(cell)) },
    isEdgeFree(segment) { return !edges.has(edgeKey(segment)) },
    add(prop) {
      placed.push(prop)
      for (const cell of prop.cells) cells.set(cellKey(cell), prop)
      for (const segment of prop.segments) edges.set(edgeKey(segment), prop)
    },
    remove(prop) {
      const index = placed.findIndex((entry) => samePlaced(entry, prop))
      if (index < 0) return false
      releaseCells(prop)
      placed.splice(index, 1)
      return true
    },
    clear() {
      placed.length = 0
      cells.clear()
      edges.clear()
    },
    get fenceSegments(): readonly FenceSegment[] {
      return placed.flatMap((prop) => prop.segments)
    },
  }
  return occupancy
}

// ------------------------------------------------------------------ surface --

export interface PropSurface {
  /** Ground height at a garden point, or null when the point is off the garden. */
  heightAt(x: number, z: number): number | null
  /** Water depth at a garden point; 0 when dry. */
  waterAt(x: number, z: number): number
  /** Whether the garden (with its inset) contains a garden point. */
  contains(x: number, z: number): boolean
}

export type PropPlacementFailure =
  | 'out-of-bounds'
  | 'in-water'
  | 'too-steep'
  | 'occupied'
  | 'out-of-stock'

export interface CellPlacement {
  readonly valid: boolean
  readonly failure: PropPlacementFailure | null
  readonly cells: readonly CellCoord[]
}

/** Sample points used to judge slope and water across a footprint. */
function footprintSamples(id: PropId, cell: CellCoord, rotation: number): readonly WorldPoint[] {
  const rect = footprintWorldRect(id, cell, rotation)
  const midX = (rect.minX + rect.maxX) / 2
  const midZ = (rect.minZ + rect.maxZ) / 2
  return [
    { x: rect.minX, z: rect.minZ },
    { x: rect.maxX, z: rect.minZ },
    { x: rect.minX, z: rect.maxZ },
    { x: rect.maxX, z: rect.maxZ },
    { x: midX, z: midZ },
  ]
}

function surfaceFailure(id: PropId, cell: CellCoord, rotation: number, surface: PropSurface): PropPlacementFailure | null {
  const samples = footprintSamples(id, cell, rotation)
  let min: number | null = null
  let max: number | null = null
  for (const sample of samples) {
    if (!surface.contains(sample.x, sample.z)) return 'out-of-bounds'
    if (surface.waterAt(sample.x, sample.z) > PROP_WATER_MAX_DEPTH) return 'in-water'
    const height = surface.heightAt(sample.x, sample.z)
    if (height === null) return 'out-of-bounds'
    min = min === null ? height : Math.min(min, height)
    max = max === null ? height : Math.max(max, height)
  }
  if (min !== null && max !== null && max - min > PROP_SLOPE_TOLERANCE) return 'too-steep'
  return null
}

/**
 * Whether a cell prop may be placed at `cell`. `occupancy` and `inventory` are
 * optional so the harness can ask "would this fit" without owning either.
 */
export function placementResult(
  id: PropId,
  cell: CellCoord,
  rotation: number,
  surface: PropSurface,
  occupancy?: PropOccupancy,
  inventory?: PropInventory,
): CellPlacement {
  const cells = footprintCells(id, cell, rotation)
  const fail = (failure: PropPlacementFailure): CellPlacement => ({ valid: false, failure, cells })
  if (inventory && inventory.count(id) <= 0) return fail('out-of-stock')
  if (occupancy) {
    for (const entry of cells) {
      if (!occupancy.isCellFree(entry)) return fail('occupied')
    }
  }
  const surfaceIssue = surfaceFailure(id, cell, rotation, surface)
  if (surfaceIssue) return fail(surfaceIssue)
  return { valid: true, failure: null, cells }
}

/** Build the placed record for a cell prop that has already passed `placementResult`. */
export function placedCellProp(id: PropId, cell: CellCoord, rotation: number): PlacedProp {
  return {
    id,
    cell,
    rotation: normalizeRotation(rotation),
    cells: footprintCells(id, cell, rotation),
    segments: [],
  }
}

// ---------------------------------------------------------------- fence runs --

export interface FenceRun {
  readonly axis: FenceAxis
  readonly segments: readonly FenceSegment[]
  /** The run's unique vertices, in path order -- post positions. */
  readonly posts: readonly LatticeVertex[]
}

/**
 * Collinear adjacent segments join into a single run. This is what makes run
 * posts shared instead of doubled: the run's posts are its endpoints, and two
 * runs that touch share the vertex between them.
 */
export function fenceRuns(segments: readonly FenceSegment[]): readonly FenceRun[] {
  const byAxis: Record<FenceAxis, Map<number, number[]>> = { x: new Map(), z: new Map() }
  for (const segment of segments) {
    const line = segment.axis === 'x' ? segment.z : segment.x
    const start = segment.axis === 'x' ? segment.x : segment.z
    const bucket = byAxis[segment.axis].get(line) ?? []
    bucket.push(start)
    byAxis[segment.axis].set(line, bucket)
  }
  const runs: FenceRun[] = []
  for (const axis of ['x', 'z'] as const) {
    for (const [line, starts] of byAxis[axis]) {
      const sorted = [...new Set(starts)].sort((a, b) => a - b)
      let run: number[] = []
      const flush = (): void => {
        if (run.length === 0) return
        const segmentsInRun = run.map((start) => (axis === 'x'
          ? { x: start, z: line, axis }
          : { x: line, z: start, axis }))
        const first = run[0]
        const last = run[run.length - 1] + 1
        const posts: LatticeVertex[] = []
        for (let index = first; index <= last; index += 1) {
          posts.push(axis === 'x' ? { x: index, z: line } : { x: line, z: index })
        }
        runs.push({ axis, segments: segmentsInRun, posts })
        run = []
      }
      let previous: number | null = null
      for (const start of sorted) {
        if (previous !== null && start !== previous + 1) flush()
        run.push(start)
        previous = start
      }
      flush()
    }
  }
  return runs
}

/** Every unique post across a set of runs, keyed so shared vertices appear once. */
export function fencePosts(segments: readonly FenceSegment[]): readonly LatticeVertex[] {
  const seen = new Map<string, LatticeVertex>()
  for (const run of fenceRuns(segments)) {
    for (const post of run.posts) seen.set(vertexKey(post), post)
  }
  return [...seen.values()]
}

/** A straight run of segments between two lattice vertices, or null when skewed. */
export function fenceSegmentsBetween(from: LatticeVertex, to: LatticeVertex): readonly FenceSegment[] | null {
  if (from.z === to.z && from.x !== to.x) {
    const low = Math.min(from.x, to.x)
    const high = Math.max(from.x, to.x)
    const segments: FenceSegment[] = []
    for (let x = low; x < high; x += 1) segments.push({ x, z: from.z, axis: 'x' })
    return segments
  }
  if (from.x === to.x && from.z !== to.z) {
    const low = Math.min(from.z, to.z)
    const high = Math.max(from.z, to.z)
    const segments: FenceSegment[] = []
    for (let z = low; z < high; z += 1) segments.push({ x: from.x, z, axis: 'z' })
    return segments
  }
  return null
}

/** One post's garden-metre position. */
export function postWorld(post: LatticeVertex): WorldPoint {
  return { x: post.x * PROP_LATTICE_CELL, z: post.z * PROP_LATTICE_CELL }
}

/** The centre of a fence segment in garden metres, for the rail mesh. */
export function segmentCenterWorld(segment: FenceSegment): WorldPoint {
  const [from, to] = segmentVertices(segment)
  return {
    x: ((from.x + to.x) / 2) * PROP_LATTICE_CELL,
    z: ((from.z + to.z) / 2) * PROP_LATTICE_CELL,
  }
}

export interface FenceRunPlacement {
  readonly valid: boolean
  readonly failure: PropPlacementFailure | 'skewed' | null
  readonly segments: readonly FenceSegment[]
  readonly free: readonly FenceSegment[]
  readonly cost: number
}

/**
 * Judge a dragged fence run. Segments already fenced are skipped rather than
 * refused, so extending an existing run with a drag over it just works; the
 * price is charged only for the new segments.
 */
export function fenceRunPlacement(
  from: LatticeVertex,
  to: LatticeVertex,
  surface: PropSurface,
  occupancy: PropOccupancy,
  inventory?: PropInventory,
): FenceRunPlacement {
  const segments = fenceSegmentsBetween(from, to)
  if (!segments) return { valid: false, failure: 'skewed', segments: [], free: [], cost: 0 }
  if (segments.length === 0) return { valid: false, failure: 'skewed', segments: [], free: [], cost: 0 }
  const fail = (failure: PropPlacementFailure): FenceRunPlacement => ({ valid: false, failure, segments, free: [], cost: 0 })
  const free = segments.filter((segment) => occupancy.isEdgeFree(segment))
  if (free.length === 0) return fail('occupied')
  for (const segment of free) {
    const [a, b] = segmentVertices(segment)
    const mid = segmentCenterWorld(segment)
    for (const point of [postWorld(a), postWorld(b), { x: mid.x, z: mid.z }]) {
      if (!surface.contains(point.x, point.z)) return fail('out-of-bounds')
    }
    if (surface.waterAt(mid.x, mid.z) > PROP_WATER_MAX_DEPTH) return fail('in-water')
  }
  // A run is level by construction only if its two ends are; sample posts for slope.
  let min: number | null = null
  let max: number | null = null
  for (const segment of free) {
    for (const vertex of segmentVertices(segment)) {
      const point = postWorld(vertex)
      const height = surface.heightAt(point.x, point.z)
      if (height === null) return fail('out-of-bounds')
      min = min === null ? height : Math.min(min, height)
      max = max === null ? height : Math.max(max, height)
    }
  }
  if (min !== null && max !== null && max - min > PROP_SLOPE_TOLERANCE) return fail('too-steep')
  const cost = free.length * PROP_CATALOG.fence.price
  if (inventory && inventory.count('fence') < free.length) return fail('out-of-stock')
  return { valid: true, failure: null, segments, free, cost }
}

/** The placed record for a committed fence run. */
export function placedFenceRun(segments: readonly FenceSegment[]): PlacedProp {
  const first = segments[0]
  return {
    id: 'fence',
    cell: { cellX: first.x, cellZ: first.z },
    rotation: 0,
    cells: [],
    segments: segments.map((segment) => ({ ...segment })),
  }
}

// ------------------------------------------------------------------- shop --

export interface ShopPurchase {
  readonly ok: boolean
  readonly failure: 'cannot-afford' | null
  readonly balance: number
  readonly count: number
}

/** Spend from the shared wallet and add one item to the inventory. */
export function purchaseProp(wallet: Wallet, inventory: PropInventory, id: PropId): ShopPurchase {
  const price = PROP_CATALOG[id].price
  if (!wallet.canAfford(price)) {
    return { ok: false, failure: 'cannot-afford', balance: wallet.balance, count: inventory.count(id) }
  }
  const balance = wallet.debit(price)
  if (balance === null) {
    return { ok: false, failure: 'cannot-afford', balance: wallet.balance, count: inventory.count(id) }
  }
  const count = inventory.add(id, 1)
  return { ok: true, failure: null, balance, count }
}
