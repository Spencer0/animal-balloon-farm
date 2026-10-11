import * as THREE from 'three'
import { containsGardenPoint, GARDEN_BOUNDS, GARDEN_LAWN_Y, GARDEN_MAX_BOUNDS } from './fairground'
import type { GardenBounds } from '../game/farm-expansion'
import { createGardenToolModel, GARDEN_TOOLS, tintSeedPack, type GardenToolId } from './garden-tool-art'
import { GRASS_PACKS, SHORT_GRASS_CEILING, SHORT_GRASS_MAX_HEIGHT, TALL_GRASS_MAX_HEIGHT, type GrassPack } from '../game/tool-unlocks'
import { TERRAIN_MAX_H, TERRAIN_MIN_H, type GardenTerrain } from './garden-terrain'
import { pickHeightField } from './terrain-pick'
import { measureMeadow, type MeadowBlade } from '../game/farm-state'
import type { GardenWaterField } from '../game/garden-water'
import {
  GRASS_HEIGHT_STEPS,
  GRASS_POSITION_SCALE,
  packInt16,
  packUint8,
  unpackInt16,
  unpackUint8,
  type SavedGrass,
} from '../game/save-game'

export interface GardenPointerMove {
  readonly clientX: number
  readonly clientY: number
}

export interface GardenPointerDown extends GardenPointerMove {
  readonly button: number
}

export interface GardenToolDebugState {
  readonly selectedTool: GardenToolId | null
  readonly cursorVisible: boolean
  readonly cursor: { readonly x: number; readonly y: number; readonly z: number } | null
  readonly isPointerDown: boolean
  readonly holdSeconds: number
  readonly activeAction: 'grow' | 'trim' | 'dig' | 'fill' | 'level' | 'pour' | 'drain' | 'snow' | 'melt' | null
  readonly grassBatches: number
  readonly grassBlades: number
  readonly grassCapacity: number
  readonly trimmedBlades: number
  readonly greenGroundVertices: number
  readonly maxGrassBlades: number
  readonly densitySpacing: number
  readonly brushLevel: number
  readonly brushRadius: number
  readonly tallestBlade: number
  readonly grassPack: GrassPack
  /** Blades currently taller than the lawn cap, so a check can see the meadow being mown back. */
  readonly meadowBlades: number
  readonly lastGrassSpawnMaxY: number
  readonly terrainMin: number
  readonly terrainMax: number
  readonly waterCells: number
  readonly waterVolume: number
  readonly waterMaxDepth: number
  readonly waterSurface: number
  readonly waterRunoff: number
  readonly terrainDirty: boolean
  readonly seederDragMaxSpeed: number
  readonly shovelDragMaxSpeed: number
  readonly waterDragMaxSpeed: number
  readonly snowerDragMaxSpeed: number
  /** Lawn vertices carrying snow, and the square meters they stand for. */
  readonly snowVertices: number
  /** Instanced snow mounds standing on the lawn (the snow's counterpart of grass blades). */
  readonly snowMounds: number
  readonly snowArea: number
  /** Blades currently frosted white by snow lying under them. */
  readonly frostedBlades: number
  /** Ice crystals and snowballs, which only appear when the brush is held still. */
  readonly iceShards: number
  readonly snowballs: number
}

export interface GardenTools {
  readonly root: THREE.Group
  readonly selectedTool: GardenToolId | null
  /**
   * Whether the in-world brush ring is on screen. The UI layer reads this to
   * decide between hiding the OS pointer (the ring *is* the pointer) and
   * showing the hand, so the menu and journal are not left with no cursor.
   */
  readonly cursorVisible: boolean
  /**
   * Upgrade level of the grass seeder. Each level raises the drag speed cap;
   * the shop/progression layers own when it increases, this module owns the
   * tuning table it indexes into.
   */
  readonly seederLevel: number
  setSeederLevel(level: number): void
  /** Upgrade level of the shovel; raises its drag speed cap. */
  readonly shovelLevel: number
  setShovelLevel(level: number): void
  /** Upgrade level of the water bucket; raises its drag speed cap. */
  readonly waterLevel: number
  setWaterLevel(level: number): void
  /**
   * True while a tool stroke is held down. The brush lags the pointer by
   * design (drag speed cap), so the caller keeps the OS pointer visible: it
   * marks the real mouse while the ring marks where the tool works.
   */
  readonly strokeHeld: boolean
  selectTool(id: GardenToolId | null): void
  /** While suspended (Shift, or a press that belongs to a farm object), the tool draws no ring and paints nothing. */
  setSuspended(suspended: boolean): void
  /** Whether the pointer is over the lawn, the only place an armed tool acts. */
  overLawn(event: GardenPointerMove): boolean
  /** Which seed pack the grass seeder holds: blue short lawn or green tall meadow. */
  readonly grassPack: GrassPack
  setGrassPack(pack: GrassPack): void
  /**
   * What is growing within `radius` of a point: nothing, a lawn of short grass,
   * or a meadow with at least one blade taller than the lawn cap.
   */
  grassKindAt(x: number, z: number, radius: number): 'none' | 'short' | 'tall'
  /**
   * Tall seed never lifts blades where this says no, so a clover patch is not
   * swallowed by the meadow. The scene wires it to the planted ground cover.
   */
  setTallGrassBlocker(blocked: ((x: number, z: number) => boolean) | null): void
  /**
   * Square meters of tall meadow on the lawn (`measureMeadow`). One pass over
   * every blade, so the caller decides how often to ask.
   */
  meadowArea(): number
  /** Square meters of lawn under snow (each snowy vertex stands for one lawn cell). */
  snowArea(): number
  /** Snow cover 0..1 at a point, blended from the nearby lawn vertices. */
  snowAt(x: number, z: number): number
  /** Bumps whenever snow is laid, lifted, loaded or cleared, so ice can be redrawn. */
  readonly snowRevision: number
  cycleBrushSize(): void
  setPlantingMode(active: boolean): void
  pointerMove(event: GardenPointerMove): void
  pointerDown(event: GardenPointerDown): boolean
  pointerUp(): void
  pointerLeave(): void
  /** Rebuild coverage indices after the fairground replaces its lawn geometry. */
  syncSurfaceGeometry(): void
  handleContextMenu(event: MouseEvent): boolean
  debugState(): GardenToolDebugState
  pickReport(clientX: number, clientY: number): unknown
  clearGrass(): void
  /** Every live blade and the painted lawn as packed plain data, for saving. */
  exportGrass(): SavedGrass
  /**
   * Replace the grass with a saved lawn. Blades are stood on the *current*
   * terrain, so restore the height field first. Throws on data that is not
   * the shape `exportGrass` wrote.
   */
  importGrass(saved: SavedGrass): void
  /**
   * Sow a disc of grass straight to full height, bypassing the per-frame
   * growth. This exists for the condition harness: a condition is measured in
   * square meters, and verifying one by hand-dragging the seeder for a minute
   * per test is not a repeatable loop. Gameplay still grows grass over time.
   */
  sowGrassDisc(x: number, z: number, radius: number, pack?: GrassPack): void
  /**
   * Lay a disc of snow at full depth (or lift it, with a negative `amount`),
   * for the harness: a stroke is slow, and a check wants a known patch.
   */
  blowSnowDisc(x: number, z: number, radius: number, amount?: number): void
  /** Stand an ice crystal or snowball on existing snow (the brush does this on its own after a hold). */
  placeSnowFeature(kind: 'ice' | 'ball', x: number, z: number): boolean
  /** Dig a flat-bottomed basin, which is what a water condition needs. */
  digBasin(x: number, z: number, radius: number, depth: number): void
  update(deltaSeconds: number): void
  dispose(): void
}

interface GrassBlade {
  readonly x: number
  readonly z: number
  readonly tileIndex: number
  mesh: THREE.InstancedMesh
  height: number
  /** Index into GRASS_COLOR_VALUES: the blade's own green, before any frost. */
  readonly base: number
  /** How white the blade is, 0 (its own green) to 1 (snow), from the snow under it. */
  snow: number
}

interface SnowFeature {
  readonly kind: 'ice' | 'ball'
  readonly x: number
  readonly z: number
  /** 0..1 size variation, fixed per feature. */
  readonly size: number
  readonly yaw: number
  readonly tiltX: number
  readonly tiltZ: number
  readonly color: number
  /** 0 just placed .. 1 fully risen. */
  grow: number
}

interface GrassBatch {
  readonly tileX: number
  readonly tileZ: number
  readonly blades: GrassBlade[]
  mesh: THREE.InstancedMesh
  capacity: number
}

const GRASS_COLORS = ['#71a957', '#86bc62', '#a3ca6f', '#618f50', '#b3cc79']
const GRASS_COLOR_VALUES = GRASS_COLORS.map((color) => new THREE.Color(color))
const BRUSH_RADIUS = 1.18
// Tapping the selected tool's hotkey cycles sizes 1..5; level 2 is the original
// radius. Blades, ground paint, seed counts, and stroke spacing all scale with it.
const BRUSH_SIZE_LEVELS = [0.5, 1, 2, 3, 4] as const
const GRASS_TILE_SIZE = 4
const GRASS_CELL_SPACING = 0.085
const INITIAL_BATCH_CAPACITY = 256
const MAX_GRASS_BLADES = 120_000
const STARTING_BLADE_HEIGHT = 0.085
const MIN_SEED_BLADES = 22
const HOLD_SEED_BLADES = 4
// Blade height caps live with the seed packs (game/tool-unlocks): the lawn pack
// stops at SHORT_GRASS_MAX_HEIGHT, the meadow pack at TALL_GRASS_MAX_HEIGHT.
// Base growth eased by remaining height (sqrt ease-out): a held patch rockets
// up quickly and settles into the cap — full height in about two seconds.
const BLADE_GROWTH_PER_SECOND = 0.7
const LAWN_UNGREEN_PER_SECOND = 0.34
const ACTION_INTERVAL = 0.08
const LAWN_VERTEX_SPACING = 0.58
/** Pointer-to-lawn search over the terrain field; see pickHeightField. */
const TERRAIN_PICK = { top: TERRAIN_MAX_H, bottom: TERRAIN_MIN_H, step: 0.12, refine: 10 }
const GRASS_STROKE_SPACING = 0.34
const GROW_PAINT_FACTOR = 1.06
export interface SeederConfig {
  /** Garden units per second the seeder brush may travel while held down. */
  readonly dragMaxSpeed: number
}

/**
 * Seeder drag caps by upgrade level. Level 0 is the starting hand-seeder:
 * deliberately slow so early grass is earned. Future upgrades pick higher
 * rows; the game wires the level, this table stays the tuning knob.
 */
export const SEEDER_CONFIGS: readonly SeederConfig[] = [
  { dragMaxSpeed: 6 },
  { dragMaxSpeed: 9 },
  { dragMaxSpeed: 13 },
] as const

export function seederConfigForLevel(level: number): SeederConfig {
  const index = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0
  return SEEDER_CONFIGS[Math.min(index, SEEDER_CONFIGS.length - 1)]
}

/**
 * Drag caps for the shovel and the water bucket. Same shape as the seeder's:
 * level 0 starts slow and later rows are earned upgrades.
 */
export const SHOVEL_CONFIGS: readonly SeederConfig[] = [
  { dragMaxSpeed: 6 },
  { dragMaxSpeed: 9 },
  { dragMaxSpeed: 13 },
] as const

export const WATER_CONFIGS: readonly SeederConfig[] = [
  { dragMaxSpeed: 6 },
  { dragMaxSpeed: 9 },
  { dragMaxSpeed: 13 },
] as const

const TRIM_PAINT_FACTOR = 0.9
// Shovel: two verbs, no inventory — left-hold carves straight down, right-hold
// mounds straight up. Depth contour rings baked into the soil (garden-terrain)
// make holes read as depth, and slope clamps keep every result walkable.
const DIG_RADIUS_FACTOR = 1
// Leveling (middle button) drags the whole patch toward its average height;
// strength is a per-tick fraction, radius slightly inside the brush ring.
const LEVEL_RADIUS_FACTOR = 0.9
const LEVEL_STRENGTH = 6
// Nominal rates run hot because the walkable-slope clamp redistributes part of
// every stroke into widening the pit walls; these values keep the felt sink
// rate near −0.25 m/s at the cursor and make a pond-floor-size pit take a
// pleasant, deliberate hold rather than an eternity.
const DIG_DROP = -0.5
const FILL_RADIUS_FACTOR = 0.9
const FILL_RISE = 0.4
// Per-cell metres per second: the pour is deliberately a steady stream;
// the disc-wide total naturally grows with brush area.
const WATER_POUR_RATE = 0.42
const WATER_DRAIN_RATE = 0.58
const GROUND_GREEN = new THREE.Color('#6db254')
const GROUND_SNOW = new THREE.Color('#d9eaf9')
const BLADE_SNOW = new THREE.Color('#e8f3fd')
// Snower: a blower, not a brush. Snow builds up quickly where it lingers and
// melts a touch slower than it falls, so a patch is easy to lay and easy to take back.
const SNOW_BLOW_PER_SECOND = 1.8
const SNOW_MELT_PER_SECOND = 1.4
const SNOW_RADIUS_FACTOR = 0.95
const SNOW_BLADE_SAMPLE_RADIUS = 0.9
/** Garden units per second the snower's brush may travel while held down. */
export const SNOWER_DRAG_MAX_SPEED = 8
const SNOW_FLAKES = 14
/**
 * The snow's answer to a grass blade: small squashed mounds scattered over each
 * lawn cell. They rise with the snow lying there (so lingering piles it up),
 * sink as it melts, and are hidden below a thin dusting.
 */
const SNOW_TUFTS_PER_VERTEX = 3
const SNOW_TUFT_MIN_SNOW = 0.08
const SNOW_TUFT_WIDTH = 0.62
const SNOW_TUFT_HEIGHT = 0.15
// Mostly cool blue-whites with the odd bright one, so a drift has shade in it.
const SNOW_TUFT_COLORS = ['#ffffff', '#eaf3fc', '#d8e9f8', '#c6dff4', '#b8d6ef'].map((color) => new THREE.Color(color))
/**
 * Ice shards and snowballs are earned, not derived from depth: hold the Snower
 * still and, after a second, one ice crystal pushes up; keep holding and the odd
 * snowball rolls out further afield. Moving the brush starts the wait over.
 */
const MAX_SNOW_FEATURES = 120
const SNOW_DWELL_RADIUS = 0.3
const ICE_DWELL_SECONDS = 1.0
const ICE_REPEAT_SECONDS = 3.5
const SNOWBALL_DWELL_SECONDS = 2.5
const SNOWBALL_REPEAT_SECONDS = 5
const SNOW_FEATURE_GROW_SECONDS = 1.6
const SNOW_FEATURE_SPACING = 0.5
/** A feature stands only while this much snow lies under it. */
const SNOW_FEATURE_MIN_SNOW = 0.25
const ICE_SHARD_COLORS = ['#9fdcf8', '#7cc8f0', '#c4eafc'].map((color) => new THREE.Color(color))
const SNOWBALL_COLORS = ['#ffffff', '#e6f1fb', '#d3e6f6'].map((color) => new THREE.Color(color))
/**
 * Snow kills what it buries. Grass under snow shrinks (a little, plus a share
 * of its height, so a meadow does not outlast a lawn by much) until it is gone,
 * and the green paint under it fades, so melting the snow shows bare soil.
 * Full snow clears a meadow in about six seconds; a thin dusting takes longer.
 */
const SNOW_BLIGHT_INTERVAL = 0.2
/** Any snow at all kills, but a dusting is treated as at least this deep so the edge of a patch does not linger for minutes. */
const SNOW_BLIGHT_MIN_SNOW = 0.02
const SNOW_BLIGHT_FLOOR = 0.3
const SNOW_BLADE_SHRINK_BASE = 0.04
const SNOW_BLADE_SHRINK_SHARE = 0.35
const SNOW_BLADE_GONE_HEIGHT = 0.012
const SNOW_GROUND_FADE_PER_SECOND = 0.25
/** Snow this deep over standing water turns it to ice. */
export const ICE_SNOW_THRESHOLD = 0.5
const GRASS_RANDOM_SEED = 471903

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function makeGrassGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  // Two crossed blades, slightly bowed outward so dense patches read as a soft
  // meadow silhouette instead of parallel spiky hairs.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.04, 0, 0, 0.04, 0, 0, -0.026, 0.44, 0.018,
    0.026, 0.44, 0.018, -0.004, 0.82, 0.036,
    0, 0, -0.04, 0, 0, 0.04, 0.028, 0.42, -0.006,
    -0.016, 0.4, 0.008, 0.02, 0.76, 0.026,
  ], 3))
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 6, 7, 8, 9])
  geometry.computeVertexNormals()
  return geometry
}

function circleGeometry(radius: number, segments = 48): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(radius, segments)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function insideGarden(x: number, z: number, bounds: GardenBounds): boolean {
  return containsGardenPoint(x, z, bounds)
}

export function createGardenTools(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  lawn: THREE.Mesh,
  terrain: GardenTerrain,
  getActiveBounds: () => GardenBounds = () => GARDEN_BOUNDS,
  water?: GardenWaterField,
  onWaterChanged: () => void = () => {},
): GardenTools {
  // The pointer used to be hidden outright for the whole canvas, which left the
  // menu and the journal with no cursor at all, and was then
  // restored to the system arrow outside the plot. Both were treating the
  // symptom from in here; the UI layer now owns the cursor end to end and asks
  // `cursorVisible` whether the in-world ring is on screen before hiding it.
  const root = new THREE.Group()
  root.name = 'Grass seeder and garden brush cursor'
  root.add(lawn)

  const grassGeometry = makeGrassGeometry()
  const grassMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.84, metalness: 0.01 })
  const tuftGeometry = new THREE.SphereGeometry(0.5, 14, 8)
  const tuftMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 })
  const shardGeometry = new THREE.ConeGeometry(0.5, 1, 5)
  shardGeometry.translate(0, 0.5, 0)
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.12, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.88,
  })
  const snowballGeometry = new THREE.SphereGeometry(0.5, 14, 10)
  const snowballMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0 })
  const grassGroup = new THREE.Group()
  grassGroup.name = 'Hand-painted grass · spatially batched instancing'
  root.add(grassGroup)
  let lawnGeometry = lawn.geometry
  let lawnPositions = lawnGeometry.getAttribute('position') as THREE.BufferAttribute
  let lawnColors = lawnGeometry.getAttribute('color') as THREE.BufferAttribute
  // Vertex span written since the last upload. Re-sending the whole ~20k-vertex
  // colour buffer for every brush tick cost far more than the few vertices a
  // tick changes, so only this span goes to the GPU (see uploadLawnColors).
  let lawnDirtyFirst = Infinity
  let lawnDirtyLast = -1
  let groundCoverage = new Float32Array(lawnColors.count)
  let groundSnow = new Float32Array(lawnColors.count)
  let lawnVertices: { index: number; x: number; z: number }[] = []
  const lawnCoverageLookup = new Map<string, number[]>()
  const groundPaintAt = new Map<string, number>()
  const snowPaintAt = new Map<string, number>()
  const paintPositionKey = (x: number, z: number): string => `${Math.round(x * 4)},${Math.round(z * 4)}`
  function rebuildLawnCoverageLookup(): void {
    const nextGeometry = lawn.geometry
    const geometryChanged = nextGeometry !== lawnGeometry
    lawnGeometry = nextGeometry
    lawnPositions = lawnGeometry.getAttribute('position') as THREE.BufferAttribute
    lawnColors = lawnGeometry.getAttribute('color') as THREE.BufferAttribute
    lawnColors.onUpload(resetLawnColorSpan)
    if (geometryChanged || groundCoverage.length !== lawnColors.count || lawnVertices.length !== lawnPositions.count) {
      const nextCoverage = new Float32Array(lawnColors.count)
      const nextVertices = Array.from({ length: lawnPositions.count }, (_, index) => ({
        index,
        x: lawnPositions.getX(index),
        z: -lawnPositions.getY(index),
      }))
      const oldByPosition = new Map<string, number>()
      for (let index = 0; index < lawnVertices.length; index += 1) {
        oldByPosition.set(paintPositionKey(lawnVertices[index].x, lawnVertices[index].z), groundCoverage[index])
      }
      for (const vertex of nextVertices) {
        nextCoverage[vertex.index] = oldByPosition.get(paintPositionKey(vertex.x, vertex.z)) ?? 0
      }
      groundCoverage = nextCoverage
      groundSnow = new Float32Array(lawnColors.count)
      for (const vertex of nextVertices) {
        groundSnow[vertex.index] = snowPaintAt.get(paintPositionKey(vertex.x, vertex.z)) ?? 0
      }
      lawnVertices = nextVertices
    }
    lawnCoverageLookup.clear()
    for (const vertex of lawnVertices) {
      const cellX = Math.floor(vertex.x / LAWN_VERTEX_SPACING)
      const cellZ = Math.floor(vertex.z / LAWN_VERTEX_SPACING)
      const key = `${cellX},${cellZ}`
      let cell = lawnCoverageLookup.get(key)
      if (!cell) { cell = []; lawnCoverageLookup.set(key, cell) }
      cell.push(vertex.index)
    }
  }
  rebuildLawnCoverageLookup()
  const batches = new Map<string, GrassBatch>()
  const occupancy = new Map<string, GrassBlade[]>()
  let random = seededRandom(GRASS_RANDOM_SEED)
  const dummy = new THREE.Object3D()
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const cursor = new THREE.Group()
  const toolModels: Record<GardenToolId, THREE.Group> = {
    grass: createGardenToolModel('grass', 'short'),
    shovel: createGardenToolModel('shovel'),
    water: createGardenToolModel('water'),
    snower: createGardenToolModel('snower'),
  }
  // Null means no tool is armed: the pointer is in charge.
  let selectedTool: GardenToolId | null = null
  let suspended = false
  let grassPack: GrassPack = 'short'
  let tallGrassBlocked: ((x: number, z: number) => boolean) | null = null
  const brushLevels = new Map<GardenToolId, number>()
  let sizePop = 0
  const SIZE_POP_SECONDS = 0.28
  let tallestBladeHeight = 0
  let snowVertexCount = 0
  /** Blades with snow lying under them: these shrink away until the snow is lifted. */
  const snowyBlades = new Set<GrassBlade>()
  let snowRevision = 0
  let snowTufts: THREE.InstancedMesh | null = null
  let iceShards: THREE.InstancedMesh | null = null
  let snowballs: THREE.InstancedMesh | null = null
  /** Ice crystals and snowballs standing on the snow, each placed by a held brush. */
  const snowFeatures: SnowFeature[] = []
  let dwellAnchor: { x: number; z: number } | null = null
  let dwellSeconds = 0
  let nextIceAt = ICE_DWELL_SECONDS
  let nextBallAt = SNOWBALL_DWELL_SECONDS
  let tuftSource: typeof lawnVertices | null = null
  // x offset, z offset, yaw, size per tuft, derived from the vertex so a reload looks the same.
  let tuftJitter = new Float32Array(0)
  const tuftObject = new THREE.Object3D()
  let snowBlightTimer = 0
  // Debug probe: highest blade base Y seen at spawn (catches grass spawning on
  // the flat lawn plane instead of the deformed terrain).
  let lastGrassSpawnMaxY = 0

  function brushLevelIndex(): number {
    return (selectedTool ? brushLevels.get(selectedTool) : undefined) ?? 1
  }

  function brushRadius(): number {
    return BRUSH_RADIUS * BRUSH_SIZE_LEVELS[brushLevelIndex()]
  }

  // Seed counts scale with the brush's area so density per square meter stays
  // constant across sizes.
  function stampBladeCount(base: number): number {
    return Math.max(4, Math.round(base * BRUSH_SIZE_LEVELS[brushLevelIndex()] ** 2))
  }

  function seederDragMaxSpeed(): number {
    return seederConfigForLevel(seederLevel).dragMaxSpeed
  }

  function levelDragMaxSpeed(table: readonly SeederConfig[], level: number): number {
    const index = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0
    return table[Math.min(index, table.length - 1)].dragMaxSpeed
  }

  function strokeDragMaxSpeed(): number {
    if (selectedTool === 'shovel') return levelDragMaxSpeed(SHOVEL_CONFIGS, shovelLevel)
    if (selectedTool === 'water') return levelDragMaxSpeed(WATER_CONFIGS, waterLevel)
    if (selectedTool === 'snower') return SNOWER_DRAG_MAX_SPEED
    return seederDragMaxSpeed()
  }

  function stampSeederTrail(point: THREE.Vector3): void {
    const spacing = Math.max(GRASS_STROKE_SPACING, brushRadius() * 0.3)
    if (lastPaintPoint && lastPaintPoint.distanceTo(point) < spacing) return
    lastPaintPoint = point.clone()
    updateLawnCoverage(point.x, point.z, brushRadius() * GROW_PAINT_FACTOR, 1.05)
    addGrass(point.x, point.z, brushRadius() * 0.88, stampBladeCount(MIN_SEED_BLADES))
  }

  /**
   * Walk the tool brush toward the pointer at the capped drag speed. Fast
   * flicks leave the brush behind instead of dragging a free stroke across
   * the garden.
   */
  function advanceStrokeBrush(deltaSeconds: number): void {
    const brush = lastSeedPoint
    const target = strokeTarget
    if (!brush || !target) return
    const dx = target.x - brush.x
    const dz = target.z - brush.z
    const distance = Math.hypot(dx, dz)
    if (distance <= 0.0001) return
    const step = Math.min(distance, strokeDragMaxSpeed() * Math.max(0, deltaSeconds))
    brush.x += (dx / distance) * step
    brush.z += (dz / distance) * step
    brush.y = target.y
    // Only the seeder stamps a trail while travelling; the shovel and the
    // bucket apply their effect where the brush rests (see update).
    if (activeAction === 'grow') stampSeederTrail(brush)
    // The ring shows where the tool actually works, not where the mouse ran to.
    cursor.position.set(brush.x, brush.y + 0.008, brush.z)
  }

  let cursorVisible = false
  let plantingMode = false
  let isPointerDown = false
  let activeAction: 'grow' | 'trim' | 'dig' | 'fill' | 'level' | 'pour' | 'drain' | 'snow' | 'melt' | null = null
  let lastPaintPoint: THREE.Vector3 | null = null
  let lastSeedPoint: THREE.Vector3 | null = null
  let seederLevel = 0
  let shovelLevel = 0
  let waterLevel = 0
  // While a tool stroke is held down, the pointer only steers: the brush
  // itself chases this target at the tool's capped drag speed, so a fast
  // mouse flick cannot sweep the whole garden in one stroke.
  let strokeTarget: THREE.Vector3 | null = null
  let hoverTint: string | null = null
  let paintTimer = 0
  let actionAccumulator = 0
  let lastPaintDuration = 0
  let totalGrassBlades = 0
  let trimmedBlades = 0
  let greenGroundVertices = 0
  let grassCapacity = 0
  let terrainApplyTimer = 0
  let waterApplyTimer = 0
  // Coalesce geometry uploads while the canonical terrain field updates. The
  // terrain renderer patches only the affected mesh region at each commit.
  const TERRAIN_APPLY_INTERVAL = 1 / 30
  /**
   * Grass in water: shallow water leaves the meadow standing (reeds at the
   * edge), deep water lays it flat. Driving it off the water depth rather than
   * a boolean wet/dry means it is continuous and self-reversing — drain the
   * pond and the blades stand back up on their own.
   */
  const GRASS_DROWN_START = 0.05
  const GRASS_DROWN_FULL = 0.35
  // The water field centres its grid on the garden origin, the same convention
  // the terrain grid uses, so cell -> world is a straight multiply.
  const waterCellX = (gx: number): number => water ? water.originX + (gx + 0.5) * terrain.cellSize : terrain.originX + gx * terrain.cellSize
  const waterCellZ = (gz: number): number => water ? water.originZ + (gz + 0.5) * terrain.cellSize : terrain.originZ + gz * terrain.cellSize
  function submergeGrass(x: number, z: number, radius: number): void {
    if (!water) return
    const radiusSquared = radius * radius
    const minCellX = Math.floor((x - radius) / GRASS_CELL_SPACING)
    const maxCellX = Math.floor((x + radius) / GRASS_CELL_SPACING)
    const minCellZ = Math.floor((z - radius) / GRASS_CELL_SPACING)
    const maxCellZ = Math.floor((z + radius) / GRASS_CELL_SPACING)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const updatedMeshes = new Set<THREE.InstancedMesh>()
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cell = occupancy.get(`${cellX},${cellZ}`)
        if (!cell) continue
        for (const blade of cell) {
          if (blade.height <= 0) continue
          const dx = blade.x - x
          const dz = blade.z - z
          if (dx * dx + dz * dz > radiusSquared) continue
          const depth = water.depthAt(blade.x, blade.z)
          const drown = 1 - THREE.MathUtils.smoothstep(depth, GRASS_DROWN_START, GRASS_DROWN_FULL)
          const next = blade.height * drown
          if (Math.abs(next - blade.height) < 0.0005) continue
          blade.mesh.getMatrixAt(blade.tileIndex, matrix)
          matrix.decompose(position, rotation, scale)
          // Ride the water surface rather than the bed, so a submerged blade
          // sits in the water instead of under it.
          position.y = GARDEN_LAWN_Y + 0.009
            + Math.max(terrain.heightAt(blade.x, blade.z), water.surfaceAt(blade.x, blade.z) - 0.02)
          if (next <= 0.0005) {
            scale.setScalar(0.0001)
            blade.height = 0
            snowyBlades.delete(blade)
            cell.splice(cell.indexOf(blade), 1)
            totalGrassBlades -= 1
          } else {
            scale.y = next
            blade.height = next
          }
          matrix.compose(position, rotation, scale)
          blade.mesh.setMatrixAt(blade.tileIndex, matrix)
          updatedMeshes.add(blade.mesh)
        }
      }
    }
    updatedMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
  }

  /** Blades and painted ground must follow the deformed surface. */
  function afterTerrainEdit(x: number, z: number, radius: number): void {
    reprojectGrass(x, z, radius + 0.5)
    refreshTuftsNear(x, z, radius + 0.5)
    if (snowFeatures.length > 0) {
      dropBuriedFeatures()
      writeFeatures()
    }
    // The ground just moved under whatever water is sitting on it, so the pond
    // has to re-level: digging deepens it, filling it in makes it disappear.
    water?.markTerrainChanged()
  }

  function reprojectGrass(x: number, z: number, radius: number): void {
    const radiusSquared = radius * radius
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const updatedMeshes = new Set<THREE.InstancedMesh>()
    const minCellX = Math.floor((x - radius) / GRASS_CELL_SPACING)
    const maxCellX = Math.floor((x + radius) / GRASS_CELL_SPACING)
    const minCellZ = Math.floor((z - radius) / GRASS_CELL_SPACING)
    const maxCellZ = Math.floor((z + radius) / GRASS_CELL_SPACING)
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cell = occupancy.get(`${cellX},${cellZ}`)
        if (!cell) continue
        for (const blade of cell) {
          if (blade.height <= 0) continue
          const dx = blade.x - x
          const dz = blade.z - z
          if (dx * dx + dz * dz > radiusSquared) continue
          blade.mesh.getMatrixAt(blade.tileIndex, matrix)
          matrix.decompose(position, rotation, scale)
          position.y = GARDEN_LAWN_Y + 0.009 + terrain.heightAt(blade.x, blade.z)
          matrix.compose(position, rotation, scale)
          blade.mesh.setMatrixAt(blade.tileIndex, matrix)
          updatedMeshes.add(blade.mesh)
        }
      }
    }
    updatedMeshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true
    })
  }

  cursor.name = 'Soft garden brush cursor'
  cursor.visible = false
  root.add(cursor)
  const cursorShadow = new THREE.Mesh(
    circleGeometry(1),
    new THREE.MeshBasicMaterial({ color: '#284a35', transparent: true, opacity: 0.14, depthWrite: false }),
  )
  cursorShadow.position.y = 0.012
  cursor.add(cursorShadow)
  const outerMaterial = new THREE.MeshStandardMaterial({ color: '#b7d97a', emissive: '#6a8f47', emissiveIntensity: 0.13, roughness: 0.35 })
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 8, 64), outerMaterial)
  outerRing.rotation.x = Math.PI / 2
  outerRing.position.y = 0.07
  cursor.add(outerRing)
  const innerMaterial = new THREE.MeshStandardMaterial({ color: '#f3d78a', emissive: '#8e7139', emissiveIntensity: 0.16, roughness: 0.4 })
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.014, 6, 56), innerMaterial)
  innerRing.rotation.x = Math.PI / 2
  innerRing.position.y = 0.075
  cursor.add(innerRing)
  const actionGlow = new THREE.Mesh(
    new THREE.TorusGeometry(1.07, 0.085, 8, 64),
    new THREE.MeshBasicMaterial({ color: '#c2efa0', transparent: true, opacity: 0, depthWrite: false }),
  )
  actionGlow.rotation.x = Math.PI / 2
  actionGlow.position.y = 0.09
  actionGlow.visible = false
  cursor.add(actionGlow)
  const waterRipples: THREE.Mesh[] = []
  for (let index = 0; index < 3; index += 1) {
    const ripple = new THREE.Mesh(
      new THREE.TorusGeometry(0.25 + index * 0.18, 0.018, 6, 32),
      new THREE.MeshBasicMaterial({ color: '#8ce7ef', transparent: true, opacity: 0, depthWrite: false }),
    )
    ripple.rotation.x = Math.PI / 2
    ripple.position.y = 0.1 + index * 0.003
    ripple.visible = false
    cursor.add(ripple)
    waterRipples.push(ripple)
  }
  // Flakes the snower blows: they stream from its mouth (the tool model sits at
  // the ring's +x/+z corner) across the disc, and drift up as steam when melting.
  const flakeGeometry = new THREE.SphereGeometry(0.05, 8, 6)
  const flakes: THREE.Mesh[] = []
  for (let index = 0; index < SNOW_FLAKES; index += 1) {
    const flake = new THREE.Mesh(flakeGeometry, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }))
    flake.visible = false
    cursor.add(flake)
    flakes.push(flake)
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = index / 4 * Math.PI * 2
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 7), new THREE.MeshBasicMaterial({ color: '#fff3d7' }))
    pip.position.set(Math.cos(angle) * 0.92, 0.08, Math.sin(angle) * 0.92)
    cursor.add(pip)
  }
  for (const model of Object.values(toolModels)) {
    model.position.set(0.76, 0.12, 0.66)
    model.rotation.set(-0.18, 0.25, -0.58)
    model.visible = false
    cursor.add(model)
  }

  function pointerRay(event: GardenPointerMove): boolean {
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return false
    ndc.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    return true
  }

  const terrainHeight = (x: number, z: number): number => terrain.heightAt(x, z)
  /**
   * Where the pointer ray first meets the lawn. The lawn mesh is the terrain
   * field drawn as a surface, so the ray is resolved against the field
   * (terrain-pick.ts): the mesh has ~40k triangles, and its raycast cost tens
   * of milliseconds per call while the tools ask several times per pointer move.
   */
  function floorPosition(): THREE.Vector3 | null {
    const hit = pickHeightField(raycaster.ray.origin, raycaster.ray.direction, terrainHeight, TERRAIN_PICK)
    return hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : null
  }

  /**
   * One vertex of the lawn layer: rgb is the grass tint, shifted toward snow by
   * the snow lying on it, and alpha is whichever of grass or snow covers more,
   * so snow blown onto bare soil shows and melting it returns the soil.
   */
  function writeLawnColor(index: number): void {
    const snow = groundSnow[index]
    const grass = groundCoverage[index]
    lawnColors.setXYZW(
      index,
      GROUND_GREEN.r + (GROUND_SNOW.r - GROUND_GREEN.r) * snow,
      GROUND_GREEN.g + (GROUND_SNOW.g - GROUND_GREEN.g) * snow,
      GROUND_GREEN.b + (GROUND_SNOW.b - GROUND_GREEN.b) * snow,
      Math.max(grass, snow),
    )
    if (index < lawnDirtyFirst) lawnDirtyFirst = index
    if (index > lawnDirtyLast) lawnDirtyLast = index
  }

  /** Forget the written span once the buffer is on the GPU (three.js calls onUpload). */
  function resetLawnColorSpan(): void {
    lawnDirtyFirst = Infinity
    lawnDirtyLast = -1
  }

  /** Send only the vertices written since the last upload. */
  function uploadLawnColors(): void {
    lawnColors.clearUpdateRanges()
    if (lawnDirtyLast >= lawnDirtyFirst) {
      lawnColors.addUpdateRange(lawnDirtyFirst * lawnColors.itemSize, (lawnDirtyLast - lawnDirtyFirst + 1) * lawnColors.itemSize)
    }
    lawnColors.needsUpdate = true
  }

  /** Every vertex changed (the lawn was rebuilt or cleared): send the whole buffer. */
  function uploadWholeLawnColors(): void {
    lawnColors.clearUpdateRanges()
    lawnColors.needsUpdate = true
  }

  function snowAt(x: number, z: number): number {
    if (snowVertexCount <= 0) return 0
    const cellX = Math.floor(x / LAWN_VERTEX_SPACING)
    const cellZ = Math.floor(z / LAWN_VERTEX_SPACING)
    let sum = 0
    let weight = 0
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const indices = lawnCoverageLookup.get((cellX + offsetX) + ',' + (cellZ + offsetZ))
        if (!indices) continue
        for (const index of indices) {
          const vertex = lawnVertices[index]
          const distance = Math.hypot(vertex.x - x, vertex.z - z)
          if (distance >= SNOW_BLADE_SAMPLE_RADIUS) continue
          const w = 1 - distance / SNOW_BLADE_SAMPLE_RADIUS
          sum += groundSnow[index] * w
          weight += w
        }
      }
    }
    return weight > 0 ? sum / weight : 0
  }

  const frostColor = new THREE.Color()
  function paintBladeFrost(blade: GrassBlade, snow: number): void {
    if (snow > 0.02) snowyBlades.add(blade)
    else snowyBlades.delete(blade)
    blade.snow = snow
    frostColor.copy(GRASS_COLOR_VALUES[blade.base])
    if (snow > 0.02) frostColor.lerp(BLADE_SNOW, Math.min(1, snow * 1.15))
    blade.mesh.setColorAt(blade.tileIndex, frostColor)
  }

  /** Re-tint every blade near a point to the snow now under it. */
  function frostBlades(x: number, z: number, radius: number): void {
    const updated = new Set<THREE.InstancedMesh>()
    const minCellX = Math.floor((x - radius) / GRASS_CELL_SPACING)
    const maxCellX = Math.floor((x + radius) / GRASS_CELL_SPACING)
    const minCellZ = Math.floor((z - radius) / GRASS_CELL_SPACING)
    const maxCellZ = Math.floor((z + radius) / GRASS_CELL_SPACING)
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cell = occupancy.get(cellX + ',' + cellZ)
        if (!cell) continue
        for (const blade of cell) {
          if (blade.height <= 0) continue
          const snow = snowAt(blade.x, blade.z)
          const settled = snow <= 0.02 ? blade.snow <= 0.02 : Math.abs(snow - blade.snow) < 0.03
          if (settled) continue
          paintBladeFrost(blade, snow)
          updated.add(blade.mesh)
        }
      }
    }
    updated.forEach((mesh) => { if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true })
  }

  /** Lay (positive) or lift (negative) snow in a disc. Returns vertices changed. */
  function updateSnow(x: number, z: number, radius: number, amount: number): number {
    let changes = 0
    const tufts = amount > 0 ? ensureTufts() : snowTufts
    const radiusSquared = radius * radius
    const minCellX = Math.floor((x - radius) / LAWN_VERTEX_SPACING)
    const maxCellX = Math.floor((x + radius) / LAWN_VERTEX_SPACING)
    const minCellZ = Math.floor((z - radius) / LAWN_VERTEX_SPACING)
    const maxCellZ = Math.floor((z + radius) / LAWN_VERTEX_SPACING)
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const vertices = lawnCoverageLookup.get(cellX + ',' + cellZ)
        if (!vertices) continue
        for (const vertexIndex of vertices) {
          const vertex = lawnVertices[vertexIndex]
          if (!insideGarden(vertex.x, vertex.z, getActiveBounds())) continue
          const dx = vertex.x - x
          const dz = vertex.z - z
          const distanceSquared = dx * dx + dz * dz
          if (distanceSquared > radiusSquared) continue
          const weight = 1 - THREE.MathUtils.smoothstep(Math.sqrt(distanceSquared) / radius, 0.6, 1)
          const before = groundSnow[vertexIndex]
          const after = THREE.MathUtils.clamp(before + amount * weight, 0, 1)
          if (after === before) continue
          if (before <= 0.05 && after > 0.05) snowVertexCount += 1
          else if (before > 0.05 && after <= 0.05) snowVertexCount -= 1
          groundSnow[vertexIndex] = after
          const key = paintPositionKey(vertex.x, vertex.z)
          if (after < 0.005) snowPaintAt.delete(key)
          else snowPaintAt.set(key, after)
          writeLawnColor(vertexIndex)
          if (tufts) writeTuft(vertexIndex)
          changes += 1
        }
      }
    }
    if (changes > 0) {
      uploadLawnColors()
      if (tufts) flushTufts()
      if (amount < 0) dropBuriedFeatures()
      snowRevision += 1
      frostBlades(x, z, radius + SNOW_BLADE_SAMPLE_RADIUS * 0.5)
    }
    return changes
  }

  /** Build (or rebuild, after the lawn grew) the instanced mounds for every lawn vertex. */
  function ensureTufts(): THREE.InstancedMesh {
    if (snowTufts && tuftSource === lawnVertices) return snowTufts
    if (snowTufts) {
      root.remove(snowTufts)
      snowTufts.dispose()
    }
    const capacity = Math.max(1, lawnVertices.length * SNOW_TUFTS_PER_VERTEX)
    const mesh = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, capacity)
    mesh.name = 'Snow mounds · instanced'
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    tuftJitter = new Float32Array(capacity * 4)
    tuftObject.scale.setScalar(0.0001)
    tuftObject.position.set(0, 0, 0)
    tuftObject.updateMatrix()
    for (const vertex of lawnVertices) {
      const look = seededRandom(Math.imul(Math.round(vertex.x * 100), 83492791) ^ Math.imul(Math.round(vertex.z * 100), 2654435761))
      for (let k = 0; k < SNOW_TUFTS_PER_VERTEX; k += 1) {
        const slot = vertex.index * SNOW_TUFTS_PER_VERTEX + k
        tuftJitter[slot * 4] = (look() - 0.5) * LAWN_VERTEX_SPACING
        tuftJitter[slot * 4 + 1] = (look() - 0.5) * LAWN_VERTEX_SPACING
        tuftJitter[slot * 4 + 2] = look() * Math.PI * 2
        tuftJitter[slot * 4 + 3] = 0.55 + look() * 0.45
        mesh.setMatrixAt(slot, tuftObject.matrix)
        mesh.setColorAt(slot, SNOW_TUFT_COLORS[Math.floor(look() * SNOW_TUFT_COLORS.length)])
      }
    }
    snowTufts = mesh
    tuftSource = lawnVertices
    root.add(mesh)
    // Replay any snow already lying on the lawn (a load, or the lawn growing).
    for (const vertex of lawnVertices) if (groundSnow[vertex.index] > 0) writeTuft(vertex.index)
    flushTufts()
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return mesh
  }

  function flushTufts(): void {
    if (snowTufts) snowTufts.instanceMatrix.needsUpdate = true
  }

  /** The ground a mound stands on: the terrain, or the ice over a pond. */
  function snowGroundAt(x: number, z: number): number {
    const ground = terrain.heightAt(x, z)
    if (water && water.depthAt(x, z) > 0.02) return Math.max(ground, water.surfaceAt(x, z))
    return ground
  }

  /** Stand one vertex's mounds on the ground, as tall as the snow there is deep. */
  function writeTuft(vertexIndex: number): void {
    const mesh = snowTufts
    if (!mesh) return
    const vertex = lawnVertices[vertexIndex]
    const snow = groundSnow[vertexIndex]
    const show = snow > SNOW_TUFT_MIN_SNOW && insideGarden(vertex.x, vertex.z, getActiveBounds())
    for (let k = 0; k < SNOW_TUFTS_PER_VERTEX; k += 1) {
      const slot = vertexIndex * SNOW_TUFTS_PER_VERTEX + k
      if (!show) {
        tuftObject.scale.setScalar(0.0001)
        tuftObject.updateMatrix()
        mesh.setMatrixAt(slot, tuftObject.matrix)
        continue
      }
      const x = vertex.x + tuftJitter[slot * 4]
      const z = vertex.z + tuftJitter[slot * 4 + 1]
      const size = tuftJitter[slot * 4 + 3]
      // Snow over a pond lies on the ice, not on the bed.
      const ground = snowGroundAt(x, z)
      const width = SNOW_TUFT_WIDTH * size * (0.65 + 0.5 * snow)
      const height = SNOW_TUFT_HEIGHT * size * Math.pow(snow, 0.9)
      tuftObject.position.set(x, GARDEN_LAWN_Y + 0.009 + ground + height * 0.18, z)
      tuftObject.rotation.set(0, tuftJitter[slot * 4 + 2], 0)
      tuftObject.scale.set(width, height, width)
      tuftObject.updateMatrix()
      mesh.setMatrixAt(slot, tuftObject.matrix)
    }
  }

  /** Create the two small instanced meshes the first time a feature is placed. */
  function ensureFeatureMeshes(): void {
    if (iceShards && snowballs) return
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_SNOW_FEATURES)
      mesh.name = name
      mesh.count = 0
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      root.add(mesh)
      return mesh
    }
    iceShards = make(shardGeometry, shardMaterial, 'Ice crystals · instanced')
    snowballs = make(snowballGeometry, snowballMaterial, 'Snowballs · instanced')
  }

  /** Rewrite every feature's instance; there are few, so a full pass is cheap. */
  function writeFeatures(): void {
    ensureFeatureMeshes()
    const ice = iceShards as THREE.InstancedMesh
    const balls = snowballs as THREE.InstancedMesh
    let iceCount = 0
    let ballCount = 0
    for (const feature of snowFeatures) {
      const ease = 1 - (1 - feature.grow) ** 3
      const ground = GARDEN_LAWN_Y + 0.009 + snowGroundAt(feature.x, feature.z)
      tuftObject.rotation.set(0, 0, 0)
      if (feature.kind === 'ice') {
        tuftObject.position.set(feature.x, ground + 0.02, feature.z)
        tuftObject.rotation.set(feature.tiltX, feature.yaw, feature.tiltZ)
        tuftObject.scale.set(0.12 * feature.size, (0.24 + 0.3 * feature.size) * ease, 0.12 * feature.size)
        tuftObject.updateMatrix()
        ice.setMatrixAt(iceCount, tuftObject.matrix)
        ice.setColorAt(iceCount, ICE_SHARD_COLORS[feature.color % ICE_SHARD_COLORS.length])
        iceCount += 1
      } else {
        const diameter = (0.22 + 0.18 * feature.size) * (0.25 + 0.75 * ease)
        tuftObject.position.set(feature.x, ground + diameter * 0.32, feature.z)
        tuftObject.rotation.set(0, feature.yaw, 0)
        tuftObject.scale.setScalar(diameter)
        tuftObject.updateMatrix()
        balls.setMatrixAt(ballCount, tuftObject.matrix)
        balls.setColorAt(ballCount, SNOWBALL_COLORS[feature.color % SNOWBALL_COLORS.length])
        ballCount += 1
      }
    }
    ice.count = iceCount
    balls.count = ballCount
    ice.instanceMatrix.needsUpdate = true
    balls.instanceMatrix.needsUpdate = true
    if (ice.instanceColor) ice.instanceColor.needsUpdate = true
    if (balls.instanceColor) balls.instanceColor.needsUpdate = true
  }

  /** Stand a new crystal or snowball; the oldest of its kind makes way at the cap. */
  function addSnowFeature(kind: 'ice' | 'ball', x: number, z: number, grown = false): boolean {
    if (!insideGarden(x, z, getActiveBounds()) || snowAt(x, z) < SNOW_FEATURE_MIN_SNOW) return false
    for (const other of snowFeatures) {
      if ((other.x - x) ** 2 + (other.z - z) ** 2 < SNOW_FEATURE_SPACING * SNOW_FEATURE_SPACING) return false
    }
    // Look comes from where it stands, so a saved feature returns looking the same.
    const look = seededRandom(Math.imul(Math.round(x * 100), 374761393) ^ Math.imul(Math.round(z * 100), 668265263))
    const same = snowFeatures.filter((feature) => feature.kind === kind)
    if (same.length >= MAX_SNOW_FEATURES) snowFeatures.splice(snowFeatures.indexOf(same[0]), 1)
    snowFeatures.push({
      kind,
      x,
      z,
      size: 0.5 + look() * 0.5,
      yaw: look() * Math.PI * 2,
      tiltX: (look() - 0.5) * 0.7,
      tiltZ: (look() - 0.5) * 0.7,
      color: Math.floor(look() * 3),
      grow: grown ? 1 : 0,
    })
    writeFeatures()
    return true
  }

  /** Features that have been melted or dug out from under come down with the snow. */
  function dropBuriedFeatures(): void {
    let removed = false
    for (let index = snowFeatures.length - 1; index >= 0; index -= 1) {
      const feature = snowFeatures[index]
      if (snowAt(feature.x, feature.z) >= SNOW_FEATURE_MIN_SNOW) continue
      snowFeatures.splice(index, 1)
      removed = true
    }
    if (removed) writeFeatures()
  }

  function growFeatures(deltaSeconds: number): void {
    let growing = false
    for (const feature of snowFeatures) {
      if (feature.grow >= 1) continue
      feature.grow = Math.min(1, feature.grow + deltaSeconds / SNOW_FEATURE_GROW_SECONDS)
      growing = true
    }
    if (growing) writeFeatures()
  }

  /** Holding the brush still earns an ice crystal after a second, and a snowball a while after. */
  function trackSnowDwell(x: number, z: number, radius: number, deltaSeconds: number): void {
    if (!dwellAnchor || Math.hypot(x - dwellAnchor.x, z - dwellAnchor.z) > SNOW_DWELL_RADIUS) {
      dwellAnchor = { x, z }
      dwellSeconds = 0
      nextIceAt = ICE_DWELL_SECONDS
      nextBallAt = SNOWBALL_DWELL_SECONDS
      return
    }
    dwellSeconds += deltaSeconds
    const scatter = (reach: number): { x: number; z: number } => {
      const angle = random() * Math.PI * 2
      const distance = radius * reach * Math.sqrt(random())
      return { x: x + Math.cos(angle) * distance, z: z + Math.sin(angle) * distance }
    }
    if (dwellSeconds >= nextIceAt) {
      nextIceAt += ICE_REPEAT_SECONDS
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const at = scatter(0.5)
        if (addSnowFeature('ice', at.x, at.z)) break
      }
    }
    if (dwellSeconds >= nextBallAt) {
      nextBallAt += SNOWBALL_REPEAT_SECONDS
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const at = scatter(0.95)
        if (addSnowFeature('ball', at.x, at.z)) break
      }
    }
  }

  function refreshTuftsNear(x: number, z: number, radius: number): void {
    if (!snowTufts || snowVertexCount <= 0) return
    const minCellX = Math.floor((x - radius) / LAWN_VERTEX_SPACING)
    const maxCellX = Math.floor((x + radius) / LAWN_VERTEX_SPACING)
    const minCellZ = Math.floor((z - radius) / LAWN_VERTEX_SPACING)
    const maxCellZ = Math.floor((z + radius) / LAWN_VERTEX_SPACING)
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        for (const index of lawnCoverageLookup.get(cellX + ',' + cellZ) ?? []) {
          if (groundSnow[index] > SNOW_TUFT_MIN_SNOW) writeTuft(index)
        }
      }
    }
    flushTufts()
  }

  function refreshAllTufts(): void {
    if (groundSnow.every((snow) => snow <= 0) && !snowTufts) return
    ensureTufts()
    for (const vertex of lawnVertices) writeTuft(vertex.index)
    flushTufts()
  }

  function updateLawnCoverage(x: number, z: number, radius: number, amount: number): number {
    let changes = 0
    const radiusSquared = radius * radius
    const minCellX = Math.floor((x - radius) / LAWN_VERTEX_SPACING)
    const maxCellX = Math.floor((x + radius) / LAWN_VERTEX_SPACING)
    const minCellZ = Math.floor((z - radius) / LAWN_VERTEX_SPACING)
    const maxCellZ = Math.floor((z + radius) / LAWN_VERTEX_SPACING)

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const vertices = lawnCoverageLookup.get(`${cellX},${cellZ}`)
        if (!vertices) continue
        for (const vertexIndex of vertices) {
          const vertex = lawnVertices[vertexIndex]
          if (!insideGarden(vertex.x, vertex.z, getActiveBounds())) continue
          const dx = vertex.x - x
          const dz = vertex.z - z
          const distanceSquared = dx * dx + dz * dz
          if (distanceSquared > radiusSquared) continue

          // Plateau of full green through the middle of the disc, easing out over
          // the outer two thirds so the lawn edge spans several vertices (the
          // ground shader rounds it) and blends into the dirt smoothly.
          const weight = 1 - THREE.MathUtils.smoothstep(Math.sqrt(distanceSquared) / radius, 0.35, 1)
          const before = groundCoverage[vertexIndex]
          const after = THREE.MathUtils.clamp(before + amount * weight, 0, 1)
          if (after === before) continue
          if (before <= 0.05 && after > 0.05) greenGroundVertices += 1
          else if (before > 0.05 && after <= 0.05) greenGroundVertices -= 1
          groundCoverage[vertexIndex] = after
          groundPaintAt.set(paintPositionKey(vertex.x, vertex.z), after)
          // RGBA paint layer: rgb is ALWAYS the full grass tint — alpha alone
          // fades the edge. Lerping rgb from white here would leave a pale
          // semi-transparent halo where coverage is partial (paint and trim).
          writeLawnColor(vertexIndex)
          changes += 1
        }
      }
    }
    if (changes > 0) uploadLawnColors()
    return changes
  }


  function createBatch(tileX: number, tileZ: number, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, capacity)
    mesh.name = `Hand-seeded grass tile ${tileX},${tileZ}`
    mesh.count = 0
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(
        -GARDEN_MAX_BOUNDS.halfWidth + (tileX + 0.5) * GRASS_TILE_SIZE,
        GARDEN_LAWN_Y + 0.42,
        -GARDEN_MAX_BOUNDS.halfDepth + (tileZ + 0.5) * GRASS_TILE_SIZE,
      ),
      Math.SQRT2 * GRASS_TILE_SIZE / 2 + 0.8,
    )
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return mesh
  }

  function expandBatch(batch: GrassBatch): boolean {
    if (grassCapacity >= MAX_GRASS_BLADES) return false
    const capacity = Math.min(batch.capacity * 2, MAX_GRASS_BLADES - grassCapacity + batch.capacity)
    if (capacity <= batch.capacity) return false
    const expanded = createBatch(batch.tileX, batch.tileZ, capacity)
    const color = new THREE.Color()
    for (let index = 0; index < batch.blades.length; index += 1) {
      batch.mesh.getMatrixAt(index, dummy.matrix)
      expanded.setMatrixAt(index, dummy.matrix)
      batch.mesh.getColorAt(index, color)
      expanded.setColorAt(index, color)
      batch.blades[index].mesh = expanded
    }
    expanded.count = batch.blades.length
    expanded.instanceMatrix.needsUpdate = true
    if (expanded.instanceColor) expanded.instanceColor.needsUpdate = true
    grassGroup.remove(batch.mesh)
    batch.mesh.dispose()
    grassGroup.add(expanded)
    grassCapacity += capacity - batch.capacity
    batch.mesh = expanded
    batch.capacity = capacity
    return true
  }

  function getBatch(x: number, z: number): GrassBatch | null {
    // Anchor tile IDs and bounds to the maximum plot so earlier batches never
    // shift beneath their grass when the garden grows.
    const tileX = Math.floor((x + GARDEN_MAX_BOUNDS.halfWidth) / GRASS_TILE_SIZE)
    const tileZ = Math.floor((z + GARDEN_MAX_BOUNDS.halfDepth) / GRASS_TILE_SIZE)
    const key = `${tileX},${tileZ}`
    let batch = batches.get(key)
    if (!batch) {
      if (grassCapacity + INITIAL_BATCH_CAPACITY > MAX_GRASS_BLADES) return null
      const mesh = createBatch(tileX, tileZ, INITIAL_BATCH_CAPACITY)
      batch = { tileX, tileZ, blades: [], mesh, capacity: INITIAL_BATCH_CAPACITY }
      batches.set(key, batch)
      grassGroup.add(mesh)
      grassCapacity += INITIAL_BATCH_CAPACITY
    }
    if (batch.blades.length >= batch.capacity && !expandBatch(batch)) return null
    return batch
  }

  function occupancyCell(x: number, z: number): string {
    return `${Math.floor(x / GRASS_CELL_SPACING)},${Math.floor(z / GRASS_CELL_SPACING)}`
  }

  function occupiedNear(x: number, z: number): boolean {
    const cellX = Math.floor(x / GRASS_CELL_SPACING)
    const cellZ = Math.floor(z / GRASS_CELL_SPACING)
    const spacingSquared = GRASS_CELL_SPACING * GRASS_CELL_SPACING
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const cell = occupancy.get(`${cellX + offsetX},${cellZ + offsetZ}`)
        if (cell?.some((blade) => (blade.x - x) ** 2 + (blade.z - z) ** 2 < spacingSquared)) return true
      }
    }
    return false
  }

  function addGrass(x: number, z: number, radius: number, bladeCount: number): void {
    if (totalGrassBlades >= MAX_GRASS_BLADES) return
    const targetCount = Math.min(bladeCount, MAX_GRASS_BLADES - totalGrassBlades)
    const updatedBatches = new Set<GrassBatch>()
    for (let index = 0; index < targetCount; index += 1) {
      const angle = random() * Math.PI * 2
      const distance = radius * Math.sqrt(random())
      const xPos = x + Math.cos(angle) * distance
      const zPos = z + Math.sin(angle) * distance
      if (!insideGarden(xPos, zPos, getActiveBounds()) || occupiedNear(xPos, zPos)) continue
      const batch = getBatch(xPos, zPos)
      if (!batch) continue
      const cellKey = occupancyCell(xPos, zPos)
      let cell = occupancy.get(cellKey)
      if (!cell) {
        cell = []
        occupancy.set(cellKey, cell)
      }
      const tileIndex = batch.blades.length
      const height = STARTING_BLADE_HEIGHT + random() * 0.025
      const width = 0.62 + random() * 0.62
      const base = Math.floor(random() * GRASS_COLOR_VALUES.length)
      const color = GRASS_COLOR_VALUES[base]
      // Seed onto the CURRENT ground surface, not the flat lawn plane, so
      // grass laid on dug/mounded ground sits on the slope instead of
      // clipping under hills or floating over pits.
      dummy.position.set(xPos, GARDEN_LAWN_Y + 0.009 + terrain.heightAt(xPos, zPos), zPos)
      const baseY = dummy.position.y
      if (baseY > lastGrassSpawnMaxY) lastGrassSpawnMaxY = baseY
      dummy.rotation.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.12)
      dummy.scale.set(width, height, width)
      dummy.updateMatrix()
      batch.mesh.setMatrixAt(tileIndex, dummy.matrix)
      batch.mesh.setColorAt(tileIndex, color)
      batch.mesh.count = tileIndex + 1
      const blade: GrassBlade = { x: xPos, z: zPos, tileIndex, mesh: batch.mesh, height, base, snow: 0 }
      batch.blades.push(blade)
      cell.push(blade)
      updatedBatches.add(batch)
      totalGrassBlades += 1
      // Seed sown onto snow comes up frosted too.
      const lying = snowAt(xPos, zPos)
      if (lying > 0.02) paintBladeFrost(blade, lying)
      if (totalGrassBlades >= MAX_GRASS_BLADES) break
    }
    for (const batch of updatedBatches) {
      batch.mesh.instanceMatrix.needsUpdate = true
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true
    }
  }

  function growGrass(x: number, z: number, deltaSeconds: number): number {
    let changed = 0
    const radius = brushRadius()
    const radiusSquared = radius * radius
    const minCellX = Math.floor((x - radius) / GRASS_CELL_SPACING)
    const maxCellX = Math.floor((x + radius) / GRASS_CELL_SPACING)
    const minCellZ = Math.floor((z - radius) / GRASS_CELL_SPACING)
    const maxCellZ = Math.floor((z + radius) / GRASS_CELL_SPACING)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const updatedMeshes = new Set<THREE.InstancedMesh>()
    const packCap = GRASS_PACKS[grassPack].maxBladeHeight
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cell = occupancy.get(`${cellX},${cellZ}`)
        if (!cell) continue
        for (const blade of cell) {
          const distanceSquared = (x - blade.x) ** 2 + (z - blade.z) ** 2
          if (distanceSquared > radiusSquared) continue
          // The lawn pack stops at the lawn cap and never trims a taller blade;
          // the meadow pack lifts blades past it, except under ground cover.
          const cap = packCap > SHORT_GRASS_MAX_HEIGHT && tallGrassBlocked?.(blade.x, blade.z) ? SHORT_GRASS_MAX_HEIGHT : packCap
          const influence = 1 - Math.sqrt(distanceSquared) / radius
          if (blade.height > cap + 0.0005 && packCap <= SHORT_GRASS_MAX_HEIGHT) {
            // The lawn pack mows a meadow back down to lawn height.
            const shrunk = Math.max(cap, blade.height - BLADE_GROWTH_PER_SECOND * 1.35 * deltaSeconds * (0.6 + 0.4 * influence))
            blade.mesh.getMatrixAt(blade.tileIndex, matrix)
            matrix.decompose(position, rotation, scale)
            scale.y = shrunk
            matrix.compose(position, rotation, scale)
            blade.mesh.setMatrixAt(blade.tileIndex, matrix)
            blade.height = shrunk
            updatedMeshes.add(blade.mesh)
            changed += 1
            continue
          }
          if (blade.height >= cap) continue
          // Non-linear: rate ∝ remaining height (sqrt ease-out), so blades shoot
          // up early and ease into the cap instead of creeping linearly.
          const remaining = Math.max(0, (cap - blade.height) / (cap - STARTING_BLADE_HEIGHT))
          const growth = BLADE_GROWTH_PER_SECOND * deltaSeconds * Math.sqrt(remaining) * (0.6 + 0.4 * influence)
          const height = Math.min(cap, blade.height + growth)
          if (height === blade.height) continue
          if (height > tallestBladeHeight) tallestBladeHeight = height
          blade.mesh.getMatrixAt(blade.tileIndex, matrix)
          matrix.decompose(position, rotation, scale)
          scale.y = height
          matrix.compose(position, rotation, scale)
          blade.mesh.setMatrixAt(blade.tileIndex, matrix)
          blade.height = height
          updatedMeshes.add(blade.mesh)
          changed += 1
        }
      }
    }
    updatedMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
    return changed
  }

  /** Digging demolishes grass: every blade inside the dig disc is removed. */
  function demolishGrass(x: number, z: number, radius: number): number {
    const minCellX = Math.floor((x - radius) / GRASS_CELL_SPACING)
    const maxCellX = Math.floor((x + radius) / GRASS_CELL_SPACING)
    const minCellZ = Math.floor((z - radius) / GRASS_CELL_SPACING)
    const maxCellZ = Math.floor((z + radius) / GRASS_CELL_SPACING)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const updatedMeshes = new Set<THREE.InstancedMesh>()
    let removed = 0
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cell = occupancy.get(`${cellX},${cellZ}`)
        if (!cell) continue
        for (let cellIndex = cell.length - 1; cellIndex >= 0; cellIndex -= 1) {
          const blade = cell[cellIndex]
          if (blade.height <= 0) continue
          const dx = blade.x - x
          const dz = blade.z - z
          if (dx * dx + dz * dz > radius * radius) continue
          blade.mesh.getMatrixAt(blade.tileIndex, matrix)
          matrix.decompose(position, rotation, scale)
          scale.setScalar(0.0001)
          matrix.compose(position, rotation, scale)
          blade.mesh.setMatrixAt(blade.tileIndex, matrix)
          updatedMeshes.add(blade.mesh)
          cell.splice(cellIndex, 1)
          blade.height = 0
          snowyBlades.delete(blade)
          totalGrassBlades -= 1
          removed += 1
        }
      }
    }
    updatedMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
    trimmedBlades += removed
    return removed
  }

  function trimGrass(x: number, z: number, deltaSeconds: number): number {
    // Right-click is a continuous inverse-grow: blades shrink from their current
    // height toward zero (and vanish) the whole time the button is held.
    const radius = brushRadius() * 0.85
    const minCellX = Math.floor((x - radius) / GRASS_CELL_SPACING)
    const maxCellX = Math.floor((x + radius) / GRASS_CELL_SPACING)
    const minCellZ = Math.floor((z - radius) / GRASS_CELL_SPACING)
    const maxCellZ = Math.floor((z + radius) / GRASS_CELL_SPACING)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const updatedMeshes = new Set<THREE.InstancedMesh>()
    let trimmed = 0

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cell = occupancy.get(`${cellX},${cellZ}`)
        if (!cell) continue
        for (let cellIndex = cell.length - 1; cellIndex >= 0; cellIndex -= 1) {
          const blade = cell[cellIndex]
          if (blade.height <= 0) continue
          const distance = Math.sqrt((x - blade.x) ** 2 + (z - blade.z) ** 2)
          if (distance > radius) continue
          const influence = 1 - Math.min(1, distance / radius)
          // Mirror of the growth easing: tall blades fall fast, the last bit eases out.
          const progress = Math.min(1, blade.height / (SHORT_GRASS_MAX_HEIGHT - STARTING_BLADE_HEIGHT))
          const shrink = BLADE_GROWTH_PER_SECOND * 1.35 * deltaSeconds * Math.sqrt(progress) * (0.6 + 0.4 * influence)
          const height = Math.max(0, blade.height - shrink)
          blade.mesh.getMatrixAt(blade.tileIndex, matrix)
          matrix.decompose(position, rotation, scale)
          if (height <= 0.0005) {
            // Fully shrunk: hide the instance and free its spot for reseeding.
            scale.setScalar(0.0001)
            blade.height = 0
            snowyBlades.delete(blade)
            cell.splice(cellIndex, 1)
            totalGrassBlades -= 1
          } else {
            scale.y = height
            blade.height = height
          }
          matrix.compose(position, rotation, scale)
          blade.mesh.setMatrixAt(blade.tileIndex, matrix)
          updatedMeshes.add(blade.mesh)
          trimmed += 1
        }
      }
    }
    updatedMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
    trimmedBlades += trimmed
    return trimmed
  }

  function updateCursorPosition(event: GardenPointerMove): THREE.Vector3 | null {
    if (!pointerRay(event)) {
      cursor.visible = false
      cursorVisible = false
      actionGlow.visible = false
      return null
    }
    const position = floorPosition()
    if (!position || !insideGarden(position.x, position.z, getActiveBounds())) {
      cursor.visible = false
      cursorVisible = false
      actionGlow.visible = false
      return null
    }
    cursorVisible = true
    cursor.position.set(position.x, position.y + 0.008, position.z)
    cursor.scale.setScalar(brushRadius())
    if (selectedTool) toolModels[selectedTool].scale.setScalar(1 / brushRadius())
    cursor.visible = true
    return position
  }

  function syncSurfaceGeometry(): void {
    rebuildLawnCoverageLookup()
    for (const vertex of lawnVertices) {
      const key = paintPositionKey(vertex.x, vertex.z)
      groundCoverage[vertex.index] = groundPaintAt.get(key) ?? 0
      groundSnow[vertex.index] = snowPaintAt.get(key) ?? 0
      writeLawnColor(vertex.index)
    }
    greenGroundVertices = groundCoverage.filter((coverage) => coverage > 0.05).length
    snowVertexCount = groundSnow.filter((snow) => snow > 0.05).length
    snowRevision += 1
    refreshAllTufts()
    uploadWholeLawnColors()
  }

  /** Everything `clearGrass` does except reshape the ground. */
  function clearBlades(): void {
    for (const batch of batches.values()) {
      grassGroup.remove(batch.mesh)
      batch.mesh.dispose()
    }
    batches.clear()
    occupancy.clear()
    totalGrassBlades = 0
    grassCapacity = 0
    trimmedBlades = 0
    random = seededRandom(GRASS_RANDOM_SEED)
    lastPaintDuration = 0
    greenGroundVertices = 0
    paintTimer = 0
    actionAccumulator = 0
    isPointerDown = false
    activeAction = null
    groundCoverage.fill(0)
    groundSnow.fill(0)
    groundPaintAt.clear()
    snowPaintAt.clear()
    snowVertexCount = 0
    snowyBlades.clear()
    snowFeatures.length = 0
    dwellAnchor = null
    if (iceShards) writeFeatures()
    snowRevision += 1
    refreshAllTufts()
    for (let index = 0; index < lawnColors.count; index += 1) {
      lawnColors.setXYZW(index, 1, 1, 1, 0)
    }
    uploadWholeLawnColors()
    tallestBladeHeight = 0
    lastGrassSpawnMaxY = 0
  }

  /** Each lawn vertex stands for one LAWN_VERTEX_SPACING cell of ground. */
  function snowArea(): number {
    let weight = 0
    for (let index = 0; index < groundSnow.length; index += 1) {
      if (groundSnow[index] > 0.05) weight += groundSnow[index]
    }
    return weight * LAWN_VERTEX_SPACING * LAWN_VERTEX_SPACING
  }

  /** Grass and green ground under snow wither; called on a slow timer. */
  function blightUnderSnow(deltaSeconds: number): void {
    if (snowVertexCount <= 0 && snowyBlades.size === 0) return
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const updatedMeshes = new Set<THREE.InstancedMesh>()
    for (const blade of [...snowyBlades]) {
      if (blade.height <= 0) {
        snowyBlades.delete(blade)
        continue
      }
      if (blade.snow < SNOW_BLIGHT_MIN_SNOW) continue
      const height = blade.height - (SNOW_BLADE_SHRINK_BASE + blade.height * SNOW_BLADE_SHRINK_SHARE) * Math.max(blade.snow, SNOW_BLIGHT_FLOOR) * deltaSeconds
      blade.mesh.getMatrixAt(blade.tileIndex, matrix)
      matrix.decompose(position, rotation, scale)
      if (height <= SNOW_BLADE_GONE_HEIGHT) {
        scale.setScalar(0.0001)
        blade.height = 0
        snowyBlades.delete(blade)
        const cell = occupancy.get(occupancyCell(blade.x, blade.z))
        const at = cell ? cell.indexOf(blade) : -1
        if (cell && at >= 0) cell.splice(at, 1)
        totalGrassBlades -= 1
        trimmedBlades += 1
      } else {
        scale.y = height
        blade.height = height
      }
      matrix.compose(position, rotation, scale)
      blade.mesh.setMatrixAt(blade.tileIndex, matrix)
      updatedMeshes.add(blade.mesh)
    }
    updatedMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
    let painted = false
    for (let index = 0; index < groundSnow.length; index += 1) {
      const snow = groundSnow[index]
      const before = groundCoverage[index]
      if (snow < SNOW_BLIGHT_MIN_SNOW || before <= 0) continue
      const after = Math.max(0, before - SNOW_GROUND_FADE_PER_SECOND * Math.max(snow, SNOW_BLIGHT_FLOOR) * deltaSeconds)
      if (before > 0.05 && after <= 0.05) greenGroundVertices -= 1
      groundCoverage[index] = after
      const vertex = lawnVertices[index]
      const key = paintPositionKey(vertex.x, vertex.z)
      if (after < 0.005) {
        groundCoverage[index] = 0
        groundPaintAt.delete(key)
      } else {
        groundPaintAt.set(key, after)
      }
      writeLawnColor(index)
      painted = true
    }
    if (painted) uploadLawnColors()
  }

  function clearGrass(): void {
    clearBlades()
    terrain.clear()
    terrain.clearSoilBandColors()
  }

  function exportGrass(): SavedGrass {
    const xs: number[] = []
    const zs: number[] = []
    const heights: number[] = []
    for (const cell of occupancy.values()) {
      for (const blade of cell) {
        if (blade.height <= 0) continue
        xs.push(blade.x)
        zs.push(blade.z)
        heights.push(blade.height)
      }
    }
    const paintKeys: number[] = []
    const paintCoverage: number[] = []
    for (const [key, coverage] of groundPaintAt) {
      if (coverage < 0.005) continue
      const [kx, kz] = key.split(',').map(Number)
      paintKeys.push(kx, kz)
      paintCoverage.push(coverage)
    }
    const snowKeys: number[] = []
    const snowCoverage: number[] = []
    for (const [key, coverage] of snowPaintAt) {
      if (coverage < 0.005) continue
      const [kx, kz] = key.split(',').map(Number)
      snowKeys.push(kx, kz)
      snowCoverage.push(coverage)
    }
    return {
      xs: packInt16(xs, GRASS_POSITION_SCALE),
      zs: packInt16(zs, GRASS_POSITION_SCALE),
      heights: packUint8(heights, GRASS_HEIGHT_STEPS),
      count: xs.length,
      paintKeys: packInt16(paintKeys, 1),
      paintCoverage: packUint8(paintCoverage, 100),
      paintCount: paintCoverage.length,
      snowKeys: packInt16(snowKeys, 1),
      snowCoverage: packUint8(snowCoverage, 100),
      snowCount: snowCoverage.length,
      featureXs: packInt16(snowFeatures.map((feature) => feature.x), GRASS_POSITION_SCALE),
      featureZs: packInt16(snowFeatures.map((feature) => feature.z), GRASS_POSITION_SCALE),
      featureKinds: packUint8(snowFeatures.map((feature) => (feature.kind === 'ice' ? 0 : 1)), 1),
      featureCount: snowFeatures.length,
    }
  }

  function importGrass(saved: SavedGrass): void {
    const xs = unpackInt16(saved.xs, GRASS_POSITION_SCALE, saved.count)
    const zs = unpackInt16(saved.zs, GRASS_POSITION_SCALE, saved.count)
    const heights = unpackUint8(saved.heights, GRASS_HEIGHT_STEPS, saved.count)
    const paintKeys = unpackInt16(saved.paintKeys, 1, saved.paintCount * 2)
    const paintCoverage = unpackUint8(saved.paintCoverage, 100, saved.paintCount)
    const snowCount = saved.snowCount ?? 0
    const snowKeys = snowCount > 0 && saved.snowKeys ? unpackInt16(saved.snowKeys, 1, snowCount * 2) : []
    const snowCoverage = snowCount > 0 && saved.snowCoverage ? unpackUint8(saved.snowCoverage, 100, snowCount) : []
    clearBlades()
    for (let index = 0; index < saved.paintCount; index += 1) {
      groundPaintAt.set(`${paintKeys[index * 2]},${paintKeys[index * 2 + 1]}`, Math.min(1, paintCoverage[index]))
    }
    for (let index = 0; index < snowCoverage.length; index += 1) {
      snowPaintAt.set(`${snowKeys[index * 2]},${snowKeys[index * 2 + 1]}`, Math.min(1, snowCoverage[index]))
    }
    syncSurfaceGeometry()
    const bounds = getActiveBounds()
    const updatedBatches = new Set<GrassBatch>()
    for (let index = 0; index < saved.count && totalGrassBlades < MAX_GRASS_BLADES; index += 1) {
      const x = xs[index]
      const z = zs[index]
      const height = Math.min(TALL_GRASS_MAX_HEIGHT, heights[index])
      if (height <= 0 || !insideGarden(x, z, bounds)) continue
      const batch = getBatch(x, z)
      if (!batch) break
      const cellKey = occupancyCell(x, z)
      let cell = occupancy.get(cellKey)
      if (!cell) {
        cell = []
        occupancy.set(cellKey, cell)
      }
      // A blade's lean, width and tint are not worth saving; they come from
      // where it stands, so a reload looks the same every time.
      const look = seededRandom(Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(z * 100), 19349663))
      const width = 0.62 + look() * 0.62
      const base = Math.floor(look() * GRASS_COLOR_VALUES.length)
      const color = GRASS_COLOR_VALUES[base]
      const tileIndex = batch.blades.length
      dummy.position.set(x, GARDEN_LAWN_Y + 0.009 + terrain.heightAt(x, z), z)
      dummy.rotation.set((look() - 0.5) * 0.12, look() * Math.PI * 2, (look() - 0.5) * 0.12)
      dummy.scale.set(width, height, width)
      dummy.updateMatrix()
      batch.mesh.setMatrixAt(tileIndex, dummy.matrix)
      batch.mesh.setColorAt(tileIndex, color)
      batch.mesh.count = tileIndex + 1
      const blade: GrassBlade = { x, z, tileIndex, mesh: batch.mesh, height, base, snow: 0 }
      batch.blades.push(blade)
      cell.push(blade)
      updatedBatches.add(batch)
      totalGrassBlades += 1
      const lying = snowAt(x, z)
      if (lying > 0.02) paintBladeFrost(blade, lying)
      tallestBladeHeight = Math.max(tallestBladeHeight, height)
    }
    for (const batch of updatedBatches) {
      batch.mesh.instanceMatrix.needsUpdate = true
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true
    }
    const featureCount = Math.min(saved.featureCount ?? 0, MAX_SNOW_FEATURES * 2)
    if (featureCount > 0 && saved.featureXs && saved.featureZs && saved.featureKinds) {
      const fx = unpackInt16(saved.featureXs, GRASS_POSITION_SCALE, featureCount)
      const fz = unpackInt16(saved.featureZs, GRASS_POSITION_SCALE, featureCount)
      const fk = unpackUint8(saved.featureKinds, 1, featureCount)
      for (let index = 0; index < featureCount; index += 1) {
        addSnowFeature(fk[index] >= 0.5 ? 'ball' : 'ice', fx[index], fz[index], true)
      }
    }
  }

  function dispose(): void {
    isPointerDown = false
    const geometries = new Set<THREE.BufferGeometry>([grassGeometry, flakeGeometry, tuftGeometry, shardGeometry, snowballGeometry])
    const materials = new Set<THREE.Material>([grassMaterial, tuftMaterial, shardMaterial, snowballMaterial])
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      geometries.add(object.geometry)
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material))
      else materials.add(object.material)
    })
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
  }

  return {
    root,
    get selectedTool(): GardenToolId | null { return selectedTool },
    get cursorVisible(): boolean { return cursorVisible },
    get strokeHeld(): boolean { return isPointerDown && activeAction !== null },
    get seederLevel(): number { return seederLevel },
    setSeederLevel(level: number): void {
      seederLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0
    },
    get shovelLevel(): number { return shovelLevel },
    setShovelLevel(level: number): void {
      shovelLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0
    },
    get waterLevel(): number { return waterLevel },
    setWaterLevel(level: number): void {
      waterLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0
    },
    get grassPack(): GrassPack { return grassPack },
    setGrassPack(pack): void {
      if (!(pack in GRASS_PACKS) || grassPack === pack) return
      grassPack = pack
      tintSeedPack(toolModels.grass, pack)
      sizePop = SIZE_POP_SECONDS
    },
    grassKindAt(x, z, radius): 'none' | 'short' | 'tall' {
      const minCellX = Math.floor((x - radius) / GRASS_CELL_SPACING)
      const maxCellX = Math.floor((x + radius) / GRASS_CELL_SPACING)
      const minCellZ = Math.floor((z - radius) / GRASS_CELL_SPACING)
      const maxCellZ = Math.floor((z + radius) / GRASS_CELL_SPACING)
      const radiusSquared = radius * radius
      let found = false
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const cell = occupancy.get(`${cellX},${cellZ}`)
          if (!cell) continue
          for (const blade of cell) {
            if ((blade.x - x) ** 2 + (blade.z - z) ** 2 > radiusSquared) continue
            if (blade.height > SHORT_GRASS_CEILING) return 'tall'
            found = true
          }
        }
      }
      return found ? 'short' : 'none'
    },
    setTallGrassBlocker(blocked): void { tallGrassBlocked = blocked },
    snowArea,
    snowAt,
    get snowRevision(): number { return snowRevision },
    meadowArea(): number {
      function* everyBlade(): Generator<MeadowBlade> {
        for (const batch of batches.values()) yield* batch.blades
      }
      return measureMeadow(everyBlade())
    },
    overLawn(event): boolean {
      if (!pointerRay(event)) return false
      const position = floorPosition()
      return !!position && insideGarden(position.x, position.z, getActiveBounds())
    },
    setSuspended(value): void {
      suspended = value
      if (!value) return
      cursor.visible = false
      cursorVisible = false
      actionGlow.visible = false
    },
    selectTool(id): void {
      if (id !== null && !GARDEN_TOOLS.some((tool) => tool.id === id)) return
      if (selectedTool === id) return
      selectedTool = id
      // The brush ring belongs to the tool that drew it. Hide it now instead of
      // leaving it on screen until the pointer next moves.
      cursor.visible = false
      cursorVisible = false
      actionGlow.visible = false
      hoverTint = id === 'water' ? '#77c9d5'
        : id === 'snower' ? '#cfeaff'
        : id === 'shovel' ? '#d9a06b'
          : id === 'grass' ? '#b7d97a'
              : '#efc894'
      for (const [key, model] of Object.entries(toolModels)) model.visible = key === id
    },
    cycleBrushSize(): void {
      if (!selectedTool) return
      brushLevels.set(selectedTool, (brushLevelIndex() + 1) % BRUSH_SIZE_LEVELS.length)
      sizePop = SIZE_POP_SECONDS
    },
    setPlantingMode(active): void {
      if (plantingMode === active) return
      plantingMode = active
      // Stop a garden stroke only when changing into or out of plant placement.
      isPointerDown = false
      activeAction = null
      lastPaintPoint = null
      lastSeedPoint = null
      strokeTarget = null
      paintTimer = 0
      actionAccumulator = 0
      if (active) {
        cursor.visible = false
        cursorVisible = false
        actionGlow.visible = false
      }
    },
    pointerMove(event): void {
      if (plantingMode || selectedTool === null || suspended) {
        cursor.visible = false
        cursorVisible = false
        actionGlow.visible = false
        return
      }
      const position = updateCursorPosition(event)
      if (!position) {
        lastPaintPoint = null
        lastSeedPoint = null
        return
      }
      if (selectedTool === 'grass') hoverTint = '#b7d97a'
      if (selectedTool === 'shovel') {
        // The pointer only steers while held: the brush chases it at the
        // capped drag speed (see advanceStrokeBrush).
        if (activeAction === 'dig' || activeAction === 'fill' || activeAction === 'level') {
          strokeTarget = position.clone()
          if (lastSeedPoint) cursor.position.set(lastSeedPoint.x, lastSeedPoint.y + 0.008, lastSeedPoint.z)
        }
        hoverTint = '#d9a06b'
        return
      }
      if (selectedTool === 'snower') {
        if (activeAction === 'snow' || activeAction === 'melt') {
          strokeTarget = position.clone()
          if (lastSeedPoint) cursor.position.set(lastSeedPoint.x, lastSeedPoint.y + 0.008, lastSeedPoint.z)
        }
        hoverTint = '#cfeaff'
        return
      }
      if (selectedTool === 'water') {
        if (activeAction === 'pour' || activeAction === 'drain') {
          strokeTarget = position.clone()
          if (lastSeedPoint) cursor.position.set(lastSeedPoint.x, lastSeedPoint.y + 0.008, lastSeedPoint.z)
        }
        hoverTint = '#77c9d5'
        return
      }
      // Moving while growing drags a seed trail: each stamp greens the ground and
      // plants a light sprinkle of short blades. Height only accumulates where the
      // brush lingers (see update), so dragging leaves short grass, not tall.
      if (isPointerDown && activeAction === 'grow') {
        // The pointer only steers while held: the brush chases it at the capped
        // drag speed (see advanceStrokeBrush), so coverage speed is bounded no
        // matter how fast the mouse moves.
        strokeTarget = position.clone()
        if (lastSeedPoint) cursor.position.set(lastSeedPoint.x, lastSeedPoint.y + 0.008, lastSeedPoint.z)
        return
      }
      if (activeAction) return
      const hoverRadius = brushRadius() * 1.8
      const minimumX = Math.floor((position.x - hoverRadius) / LAWN_VERTEX_SPACING)
      const maximumX = Math.floor((position.x + hoverRadius) / LAWN_VERTEX_SPACING)
      const minimumZ = Math.floor((position.z - hoverRadius) / LAWN_VERTEX_SPACING)
      const maximumZ = Math.floor((position.z + hoverRadius) / LAWN_VERTEX_SPACING)
      let nearbyCoverage = 0
      for (let x = minimumX; x <= maximumX; x += 1) {
        for (let z = minimumZ; z <= maximumZ; z += 1) {
          for (const index of lawnCoverageLookup.get(`${x},${z}`) ?? []) nearbyCoverage = Math.max(nearbyCoverage, groundCoverage[index])
        }
      }
      hoverTint = nearbyCoverage > 0.14 ? '#c2e39a' : '#b7d97a'
    },
    pointerDown(event): boolean {
      if (plantingMode) return false
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return false
      if (selectedTool === null || suspended) return false
      const position = updateCursorPosition(event)
      if (!position) return false
      if (selectedTool === 'shovel') {
        isPointerDown = true
        lastPaintPoint = position.clone()
        lastSeedPoint = position.clone()
        strokeTarget = position.clone()
        paintTimer = 0
        actionAccumulator = 0
        lastPaintDuration = 0
        activeAction = event.button === 0 ? 'dig' : event.button === 1 ? 'level' : 'fill'
        return true
      }
      if (selectedTool === 'snower') {
        if (event.button !== 0 && event.button !== 2) return false
        isPointerDown = true
        lastPaintPoint = position.clone()
        lastSeedPoint = position.clone()
        strokeTarget = position.clone()
        paintTimer = 0
        actionAccumulator = 0
        lastPaintDuration = 0
        activeAction = event.button === 0 ? 'snow' : 'melt'
        dwellAnchor = null
        return true
      }
      if (selectedTool === 'water') {
        if (event.button !== 0 && event.button !== 2) return false
        if (!water) return false
        isPointerDown = true
        lastPaintPoint = position.clone()
        lastSeedPoint = position.clone()
        strokeTarget = position.clone()
        paintTimer = 0
        actionAccumulator = 0
        lastPaintDuration = 0
        activeAction = event.button === 0 ? 'pour' : 'drain'
        return true
      }
      activeAction = event.button === 0 ? 'grow' : 'trim'
      isPointerDown = true
      lastPaintPoint = position.clone()
      lastSeedPoint = position.clone()
      strokeTarget = position.clone()
      paintTimer = 0
      actionAccumulator = 0
      lastPaintDuration = 0
      if (activeAction === 'grow') {
        // The first press starts a light sprinkle of short blades on freshly
        // greened ground; holding in place then grows that patch (see update).
        updateLawnCoverage(position.x, position.z, brushRadius() * GROW_PAINT_FACTOR, 1.05)
        addGrass(position.x, position.z, brushRadius() * 0.88, stampBladeCount(MIN_SEED_BLADES))
      }
      return true
    },
    pointerUp(): void {
      if (isPointerDown) lastPaintDuration = paintTimer
      dwellAnchor = null
      isPointerDown = false
      activeAction = null
      lastPaintPoint = null
      strokeTarget = null
      paintTimer = 0
      actionAccumulator = 0
    },
    pointerLeave(): void {
      cursor.visible = false
      cursorVisible = false
      actionGlow.visible = false
      if (!isPointerDown) return
      // The pointer left the garden mid-stroke: pause painting until it returns.
      // A held stroke keeps its brush so re-entry chases from where it waited
      // instead of teleporting to the pointer.
      if (activeAction) {
        strokeTarget = null
        return
      }
      lastSeedPoint = null
      lastPaintPoint = null
    },
    syncSurfaceGeometry,
    handleContextMenu(event): boolean {
      event.preventDefault()
      return true
    },
    pickReport(clientX, clientY): unknown {
      const probeNdc = new THREE.Vector2()
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return { error: 'no canvas bounds' }
      probeNdc.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1)
      raycaster.setFromCamera(probeNdc, camera)
      const rootScene = root.parent
      const lawnHits = raycaster.intersectObject(lawn, false)
      let baseHit: number | null = null
      let occluder: string | null = null
      if (rootScene) {
        const base = rootScene.getObjectByName('Rounded cutaway farm-garden parcel')
        if (base) {
          const hit = raycaster.intersectObject(base, false)[0]
          if (hit) {
            baseHit = +hit.distance.toFixed(2)
            occluder = lawnHits[0] && lawnHits[0].distance < hit.distance ? null : (base.name ?? 'parcel base')
          }
        }
      }
      const material = lawn.material as THREE.MeshStandardMaterial
      return {
        lawnDistance: lawnHits[0] ? +lawnHits[0].distance.toFixed(2) : null,
        lawnPoint: lawnHits[0] ? { x: +lawnHits[0].point.x.toFixed(2), y: +lawnHits[0].point.y.toFixed(2), z: +lawnHits[0].point.z.toFixed(2) } : null,
        baseDistance: baseHit,
        occludedBy: occluder,
        lawn: {
          visible: lawn.visible,
          materialColor: material.color.getHexString(),
          vertexColors: material.vertexColors,
          hasColorAttribute: Boolean(lawn.geometry.getAttribute('color')),
        },
      }
    },
    debugState(): GardenToolDebugState {
      const waterStats = water ? water.summary() : {
        wetCells: 0,
        volume: 0,
        maxDepth: 0,
        highestSurface: 0,
        runoff: 0,
      }
      return {
        selectedTool,
        cursorVisible,
        cursor: cursorVisible ? { x: cursor.position.x, y: cursor.position.y, z: cursor.position.z } : null,
        isPointerDown,
        holdSeconds: isPointerDown ? paintTimer : lastPaintDuration,
        grassBatches: batches.size,
        grassBlades: totalGrassBlades,
        grassCapacity,
        trimmedBlades,
        maxGrassBlades: MAX_GRASS_BLADES,
        densitySpacing: GRASS_CELL_SPACING,
        greenGroundVertices,
        activeAction,
        brushLevel: brushLevelIndex() + 1,
        brushRadius: brushRadius(),
        tallestBlade: tallestBladeHeight,
        grassPack,
        meadowBlades: [...occupancy.values()].reduce((sum, cell) => sum + cell.filter((blade) => blade.height > SHORT_GRASS_CEILING).length, 0),
        lastGrassSpawnMaxY: +lastGrassSpawnMaxY.toFixed(3),
        terrainMin: terrain.stats().min,
        terrainMax: terrain.stats().max,
        waterCells: waterStats.wetCells,
        waterVolume: waterStats.volume,
        waterMaxDepth: waterStats.maxDepth,
        waterSurface: waterStats.highestSurface,
        waterRunoff: waterStats.runoff,
        terrainDirty: terrain.dirty,
        seederDragMaxSpeed: seederDragMaxSpeed(),
        shovelDragMaxSpeed: levelDragMaxSpeed(SHOVEL_CONFIGS, shovelLevel),
        waterDragMaxSpeed: levelDragMaxSpeed(WATER_CONFIGS, waterLevel),
        snowerDragMaxSpeed: SNOWER_DRAG_MAX_SPEED,
        snowVertices: snowVertexCount,
        snowMounds: groundSnow.reduce((sum, snow) => sum + (snow > SNOW_TUFT_MIN_SNOW ? SNOW_TUFTS_PER_VERTEX : 0), 0),
        snowArea: snowArea(),
        frostedBlades: snowyBlades.size,
        iceShards: snowFeatures.filter((feature) => feature.kind === 'ice').length,
        snowballs: snowFeatures.filter((feature) => feature.kind === 'ball').length,
      }
    },
    clearGrass,
    exportGrass,
    importGrass,
    sowGrassDisc(x, z, radius, pack = 'tall') {
      if (!insideGarden(x, z, getActiveBounds()) || radius <= 0) return
      // Seed densely enough that the disc reads as a lawn.
      const steps = 24
      for (let index = 0; index < steps; index += 1) {
        const angle = (index / steps) * Math.PI * 2
        addGrass(x + Math.cos(angle) * radius * 0.72, z + Math.sin(angle) * radius * 0.72, radius * 0.42, 34)
      }
      addGrass(x, z, radius, 48)
      // Force every seeded blade to its cap. growGrass is time-based and
      // brush-radius-bound, so it cannot express "this disc is already tall".
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      const rotation = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      const touched = new Set<THREE.InstancedMesh>()
      for (const cell of occupancy.values()) {
        for (const blade of cell) {
          if ((blade.x - x) ** 2 + (blade.z - z) ** 2 > radius * radius) continue
          blade.mesh.getMatrixAt(blade.tileIndex, matrix)
          matrix.decompose(position, rotation, scale)
          scale.y = GRASS_PACKS[pack].maxBladeHeight
          matrix.compose(position, rotation, scale)
          blade.mesh.setMatrixAt(blade.tileIndex, matrix)
          blade.height = GRASS_PACKS[pack].maxBladeHeight
          touched.add(blade.mesh)
        }
      }
      touched.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
      // Paint the ground cover in one go so the measured area matches what the
      // player can see.
      updateLawnCoverage(x, z, radius, 1)
    },
    placeSnowFeature(kind, x, z) {
      return addSnowFeature(kind, x, z)
    },
    blowSnowDisc(x, z, radius, amount = 1) {
      if (radius <= 0) return
      updateSnow(x, z, radius, amount)
    },
    digBasin(x, z, radius, depth) {
      if (!insideGarden(x, z, getActiveBounds()) || radius <= 0) return
      // A few passes so the slope clamp settles the walls rather than shearing
      // a single perfect cone, which the clamp would immediately flatten. The
      // update loop re-derives the meshes from the grid when it is dirty.
      const passes = Math.max(1, Math.ceil(Math.abs(depth) / 0.25))
      for (let pass = 0; pass < passes; pass += 1) {
        terrain.splat(x, z, radius, depth / passes)
      }
      demolishGrass(x, z, radius * 1.2)
    },
    update(deltaSeconds): void {
      if (isPointerDown && cursorVisible && activeAction && lastSeedPoint) {
        // The brush chases the pointer at its capped speed before the effect
        // below runs, so each tick lands where the tool actually is.
        advanceStrokeBrush(deltaSeconds)
        paintTimer += deltaSeconds
        actionAccumulator += deltaSeconds
        while (actionAccumulator >= ACTION_INTERVAL) {
          actionAccumulator -= ACTION_INTERVAL
          const x = lastSeedPoint.x
          const z = lastSeedPoint.z
          if (activeAction === 'grow') {
            growGrass(x, z, ACTION_INTERVAL)
            updateLawnCoverage(x, z, brushRadius() * GROW_PAINT_FACTOR, 0.055)
            // Lingering fills the patch in: extra seeds land until the occupancy
            // grid saturates, so holds raise both height and density.
            addGrass(x, z, brushRadius() * 0.88, stampBladeCount(HOLD_SEED_BLADES))
          } else if (activeAction === 'trim') {
            trimGrass(x, z, ACTION_INTERVAL)
            updateLawnCoverage(x, z, brushRadius() * TRIM_PAINT_FACTOR, -LAWN_UNGREEN_PER_SECOND * ACTION_INTERVAL)
          } else if (activeAction === 'dig') {
            const radius = brushRadius() * DIG_RADIUS_FACTOR
            // The shovel scours the sod even over floor-bound ground (where
            // splat can no longer change heights): blades in the disc are gone
            // and the green paint peels (bare soil shows immediately).
            demolishGrass(x, z, radius + 0.15)
            updateLawnCoverage(x, z, radius * 0.92, -2)
            updateSnow(x, z, radius * 0.92, -2)
            if (terrain.splat(x, z, radius, DIG_DROP * ACTION_INTERVAL) > 0) afterTerrainEdit(x, z, radius)
          } else if (activeAction === 'fill') {
            const radius = brushRadius() * FILL_RADIUS_FACTOR
            if (terrain.splat(x, z, radius, FILL_RISE * ACTION_INTERVAL) > 0) afterTerrainEdit(x, z, radius)
          } else if (activeAction === 'level') {
            const radius = brushRadius() * LEVEL_RADIUS_FACTOR
            if (terrain.level(x, z, radius, LEVEL_STRENGTH * ACTION_INTERVAL) > 0) afterTerrainEdit(x, z, radius)
          } else if (activeAction === 'snow') {
            updateSnow(x, z, brushRadius() * SNOW_RADIUS_FACTOR, SNOW_BLOW_PER_SECOND * ACTION_INTERVAL)
            trackSnowDwell(x, z, brushRadius(), ACTION_INTERVAL)
          } else if (activeAction === 'melt') {
            updateSnow(x, z, brushRadius() * SNOW_RADIUS_FACTOR, -SNOW_MELT_PER_SECOND * ACTION_INTERVAL)
          } else if (activeAction === 'pour' && water) {
            water.pour(x, z, brushRadius(), WATER_POUR_RATE * ACTION_INTERVAL)
          } else if (activeAction === 'drain' && water) {
            water.drain(x, z, brushRadius(), WATER_DRAIN_RATE * ACTION_INTERVAL)
          }
        }
      }
      growFeatures(deltaSeconds)
      snowBlightTimer += deltaSeconds
      if (snowBlightTimer >= SNOW_BLIGHT_INTERVAL) {
        blightUnderSnow(snowBlightTimer)
        snowBlightTimer = 0
      }
      // Water settles on the same 30 Hz cadence as the ground. It is a full
      // priority flood plus pool solve, so it is throttled for the same reason
      // the terrain re-derivation is: a 60 Hz version costs more than the rest
      // of the frame and the pond does not visibly move any faster.
      if (water?.dirty) {
        waterApplyTimer += deltaSeconds
        if (waterApplyTimer >= TERRAIN_APPLY_INTERVAL) {
          water.settle()
          onWaterChanged()
          // Grass has to follow the new surface. Only the wet cells moved, so
          // the work is bounded by the pond rather than the whole lawn.
          const wet = water.wetCells()
          for (const cell of wet) {
            const gx = cell % terrain.gridCols
            const gz = (cell - gx) / terrain.gridCols
            submergeGrass(
              waterCellX(gx),
              waterCellZ(gz),
              terrain.cellSize * 1.5,
            )
          }
          waterApplyTimer = 0
        }
      } else {
        waterApplyTimer = 0
      }
      if (terrain.dirty) {
        terrainApplyTimer += deltaSeconds
        if (terrainApplyTimer >= TERRAIN_APPLY_INTERVAL) {
          terrain.applyToMeshes()
          terrainApplyTimer = 0
        }
      } else {
        terrainApplyTimer = 0
      }
      const time = performance.now() * 0.001
      sizePop = Math.max(0, sizePop - deltaSeconds)
      const popGlow = sizePop > 0 ? Math.sin((sizePop / SIZE_POP_SECONDS) * Math.PI) : 0
      const popScale = 1 + popGlow * 0.16
      const pulse = isPointerDown ? 0.5 + 0.5 * Math.sin(time * 8.5) : 0.5 + 0.5 * Math.sin(time * 2.2)
      const pulseAmount = isPointerDown ? 0.12 + pulse * 0.12 : pulse * 0.025
      cursor.scale.setScalar(brushRadius() * (1 + pulseAmount) * popScale)
      outerMaterial.emissiveIntensity = isPointerDown ? 0.32 + pulse * 0.72 : 0.11 + pulse * 0.12
      innerMaterial.emissiveIntensity = isPointerDown ? 0.22 + pulse * 0.58 : 0.12 + pulse * 0.12
      // Pour cursor reads green when a pour here would be kept, red when it would be refused.
      const pourReady = activeAction !== 'pour' || !water || !cursorVisible
        || water.canPour(cursor.position.x, cursor.position.z, brushRadius())
      const glowMaterial = actionGlow.material as THREE.MeshBasicMaterial
      actionGlow.visible = cursorVisible && (isPointerDown || popGlow > 0)
      actionGlow.scale.setScalar(1 + pulse * 0.18 + popGlow * 0.12)
      glowMaterial.opacity = actionGlow.visible ? (isPointerDown ? 0.18 + pulse * 0.24 : 0) + popGlow * 0.32 : 0
      glowMaterial.color.set(activeAction === 'trim' ? '#f3aa7b'
        : activeAction === 'grow' ? '#c2efa0'
        : activeAction === 'dig' ? '#e0b080'
        : activeAction === 'level' ? '#cfe4ee'
        : activeAction === 'fill' ? '#e8c78f'
        : activeAction === 'pour' ? (pourReady ? '#8ce7ef' : '#e0806f')
        : activeAction === 'drain' ? '#5798d3'
        : activeAction === 'snow' ? '#f2fbff'
        : activeAction === 'melt' ? '#ffc79a'
        : '#fff3d7')
      const isWaterAction = activeAction === 'pour' || activeAction === 'drain'
      waterRipples.forEach((ripple, index) => {
        ripple.visible = cursorVisible && isWaterAction
        const material = ripple.material as THREE.MeshBasicMaterial
        material.color.set(activeAction === 'drain' ? '#5798d3' : pourReady ? '#9beef2' : '#e0806f')
        const phase = (time * 2.8 + index * (Math.PI * 2 / waterRipples.length)) % (Math.PI * 2)
        material.opacity = ripple.visible ? 0.08 + Math.max(0, Math.sin(phase)) * 0.42 : 0
        ripple.scale.setScalar(0.72 + (0.5 + 0.5 * Math.sin(phase)) * 0.48)
      })
      const blowing = cursorVisible && (activeAction === 'snow' || activeAction === 'melt')
      flakes.forEach((flake, index) => {
        flake.visible = blowing
        if (!blowing) return
        const phase = (time * 1.15 + index / flakes.length) % 1
        const spread = Math.sin(index * 12.9898) * 0.5
        const material = flake.material as THREE.MeshBasicMaterial
        material.opacity = Math.sin(phase * Math.PI) * 0.9
        if (activeAction === 'snow') {
          material.color.set('#ffffff')
          flake.position.set(
            0.58 * (1 - phase) + spread * 0.9 * phase,
            0.3 * (1 - phase) + 0.1 + Math.sin(phase * Math.PI) * 0.12,
            0.5 * (1 - phase) - spread * 0.7 * phase,
          )
        } else {
          material.color.set('#bfe6ff')
          const angle = index * 2.399
          flake.position.set(Math.cos(angle) * 0.7 * (0.3 + (index % 3) * 0.3), 0.1 + phase * 0.6, Math.sin(angle) * 0.7 * (0.3 + (index % 3) * 0.3))
        }
      })
      ;(cursorShadow.material as THREE.MeshBasicMaterial).opacity = isPointerDown && activeAction === 'grow' ? 0.19 + pulse * 0.1 : 0.14
      // hoverTint is refreshed by pointerMove; re-applying it here keeps a stale
      // hover tint from leaking into later frames.
      outerMaterial.color.set(activeAction === 'pour' ? (pourReady ? '#77e08a' : '#e0604f')
        : activeAction === 'drain' ? '#5798d3'
        : activeAction === 'snow' ? '#f2fbff'
        : activeAction === 'melt' ? '#ffc79a'
        : isPointerDown && activeAction === 'trim' ? '#f3b287'
        : hoverTint ?? '#b7d97a')
      cursor.rotation.y = Math.sin(time * 1.6) * 0.026
    },
    dispose,
  }
}
