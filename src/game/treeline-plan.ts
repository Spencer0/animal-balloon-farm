/**
 * Where everything in the tree line stands: pure layout, no Three.js and no DOM,
 * so it is testable and the backdrop can ask "is this spot water?" before it
 * drops a tent or a hill there.
 *
 * The ring around the farm is split into biomes by compass angle (measured the
 * way the scene does, atan2(z, x), so the default camera looks toward -90):
 *
 *   -128..-52  mountain meadow (the arcade store's clearing is in here)
 *    -52..  8  rocky mountain
 *      8.. 75  lake
 *     75..140  swamp
 *    140..215  ocean
 *    215..232  birch woods, easing back into the meadow
 *
 * The biome of each tree is picked from a jittered angle, so borders interleave
 * instead of cutting along a ruler line.
 */
import { isInShopClearing } from './shop-site'

export type BiomeId = 'meadow' | 'woods' | 'rocky' | 'lake' | 'swamp' | 'ocean'

/** Mesh names inside public/assets/props/treeline.glb. */
export const TREELINE_PROPS = [
  'pine', 'spruce', 'birch', 'bush', 'flowers_pink', 'flowers_gold', 'flowers_white',
  'peak_tall', 'peak_broad', 'boulder', 'boulder_mossy', 'snag',
  'willow', 'reeds', 'lily_pads',
  'cypress', 'cattails', 'stump', 'toadstool',
  'palm', 'palm_lean', 'dune_grass', 'sea_stack', 'sailboat',
] as const
export type TreelinePropId = typeof TREELINE_PROPS[number]

export interface TreelinePlacement {
  readonly prop: TreelinePropId
  readonly x: number
  readonly z: number
  readonly rotation: number
  readonly scale: number
  /** 0..1, how far the instance tint leans away from the modelled colours. */
  readonly shade: number
  readonly biome: BiomeId
}

export type Point = readonly [number, number]
export type WaterKind = 'ocean' | 'lake' | 'swamp'

export interface WaterBody {
  readonly kind: WaterKind
  readonly center: Point
  /** Wet sand or mud around the water, drawn lowest. */
  readonly bank: readonly Point[]
  readonly water: readonly Point[]
  /** Darker open water, inside `water` (the ocean's deep side, a lake's middle). */
  readonly deep: readonly Point[]
}

export interface GroundPatch {
  readonly x: number
  readonly z: number
  readonly radius: number
  readonly biome: BiomeId
  /** 0..1 along a per-biome palette of two or three tones. */
  readonly tone: number
}

export interface TreelinePlan {
  readonly placements: readonly TreelinePlacement[]
  readonly water: readonly WaterBody[]
  readonly patches: readonly GroundPatch[]
  /** The open sea sector, in radians, for callers that clear hills out of it. */
  readonly oceanArc: readonly [number, number]
}

const DEG = Math.PI / 180
export const TREELINE_INNER_RADIUS = 42
const SEA_OUTER_RADIUS = 178
const OCEAN_FROM = 140 * DEG
const OCEAN_TO = 215 * DEG
const OCEAN_COAST = 76

const BIOME_RANGES: readonly (readonly [BiomeId, number, number])[] = [
  ['meadow', -128, -52], ['rocky', -52, 8], ['lake', 8, 75], ['swamp', 75, 140], ['ocean', 140, 215], ['woods', 215, 232],
]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Compass angle in degrees, folded into -128..232 so the table above is a single run. */
function foldDegrees(radians: number): number {
  let degrees = radians / DEG
  while (degrees < -128) degrees += 360
  while (degrees >= 232) degrees -= 360
  return degrees
}

export function biomeAtAngle(radians: number): BiomeId {
  const degrees = foldDegrees(radians)
  for (const [id, from, to] of BIOME_RANGES) if (degrees >= from && degrees < to) return id
  return 'meadow'
}

function pointInPolygon(x: number, z: number, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function lumpyBlob(center: Point, rx: number, rz: number, rotation: number, seed: number, steps = 30): Point[] {
  const rng = mulberry32(seed)
  const phase = [rng() * 6.28, rng() * 6.28, rng() * 6.28]
  const points: Point[] = []
  for (let i = 0; i < steps; i += 1) {
    const angle = i / steps * Math.PI * 2
    const bulge = 1 + .13 * Math.sin(3 * angle + phase[0]) + .07 * Math.sin(5 * angle + phase[1]) + .04 * Math.sin(9 * angle + phase[2])
    const lx = Math.cos(angle) * rx * bulge
    const lz = Math.sin(angle) * rz * bulge
    points.push([center[0] + lx * Math.cos(rotation) - lz * Math.sin(rotation), center[1] + lx * Math.sin(rotation) + lz * Math.cos(rotation)])
  }
  return points
}

function scaleAbout(points: readonly Point[], center: Point, factor: number): Point[] {
  return points.map(([x, z]) => [center[0] + (x - center[0]) * factor, center[1] + (z - center[1]) * factor] as Point)
}

function pond(kind: WaterKind, angleDeg: number, radius: number, rx: number, rz: number, seed: number): WaterBody {
  const center: Point = [Math.cos(angleDeg * DEG) * radius, Math.sin(angleDeg * DEG) * radius]
  const water = lumpyBlob(center, rx, rz, angleDeg * DEG + 1.2, seed)
  const bankFactor = kind === 'swamp' ? 1.32 : 1.2
  return { kind, center, water, bank: scaleAbout(water, center, bankFactor), deep: scaleAbout(water, center, .66) }
}

/** The sea: a wedge that tapers to a point at both ends so it reads as a bay, not a cut-out. */
function sea(seed: number): WaterBody {
  const rng = mulberry32(seed)
  const phase = [rng() * 6.28, rng() * 6.28]
  const steps = 48
  const ring = (inner: (radiusIn: number, taper: number) => number): Point[] => {
    const outer: Point[] = []
    const near: Point[] = []
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const angle = OCEAN_FROM + (OCEAN_TO - OCEAN_FROM) * t
      const taper = Math.pow(1 - Math.sin(Math.PI * t), 2)
      const coast = OCEAN_COAST + Math.sin(angle * 9 + phase[0]) * 1.8 + Math.sin(angle * 23 + phase[1]) * .9
      const radiusIn = inner(coast, taper)
      near.push([Math.cos(angle) * radiusIn, Math.sin(angle) * radiusIn])
      outer.push([Math.cos(angle) * SEA_OUTER_RADIUS, Math.sin(angle) * SEA_OUTER_RADIUS])
    }
    return [...near, ...outer.reverse()]
  }
  const mid = (OCEAN_FROM + OCEAN_TO) / 2
  return {
    kind: 'ocean',
    center: [Math.cos(mid) * 120, Math.sin(mid) * 120],
    bank: ring((coast, taper) => Math.min(SEA_OUTER_RADIUS - 2, coast - 7 + 92 * taper)),
    water: ring((coast, taper) => Math.min(SEA_OUTER_RADIUS - 2, coast + 92 * taper)),
    deep: ring((coast, taper) => Math.min(SEA_OUTER_RADIUS - 2, coast + 15 + 80 * taper)),
  }
}

const WATER_BODIES: readonly WaterBody[] = [
  sea(31),
  pond('lake', 40, 74, 19, 11, 7),
  pond('lake', 63, 54, 7, 5, 8),
  pond('swamp', 88, 58, 8, 5.5, 9),
  pond('swamp', 108, 72, 11, 7, 10),
  pond('swamp', 126, 57, 7.5, 5.5, 11),
  pond('swamp', 98, 92, 13, 8, 12),
  pond('swamp', 141, 56, 6, 4.5, 13),
]

export function treelineWater(): readonly WaterBody[] { return WATER_BODIES }

/** True over open water or its muddy bank, where a tent, a hill or a tree must not stand. */
export function isTreelineWater(x: number, z: number, includeBank = false): boolean {
  for (const body of WATER_BODIES) if (pointInPolygon(x, z, includeBank ? body.bank : body.water)) return true
  return false
}

interface Spawn { readonly prop: TreelinePropId; readonly weight: number; readonly scale: readonly [number, number]; readonly near?: boolean }

/** What grows where. `near` props hug the farm's side of the ring; the rest favour the far side. */
const SPAWNS: Record<BiomeId, readonly Spawn[]> = {
  meadow: [
    { prop: 'pine', weight: 4, scale: [.95, 1.45] }, { prop: 'spruce', weight: 3, scale: [.9, 1.4] }, { prop: 'birch', weight: 2.5, scale: [.9, 1.3] },
    { prop: 'bush', weight: 2, scale: [.8, 1.4], near: true }, { prop: 'flowers_pink', weight: 1.6, scale: [.9, 1.5], near: true },
    { prop: 'flowers_gold', weight: 1.6, scale: [.9, 1.5], near: true }, { prop: 'flowers_white', weight: 1.4, scale: [.9, 1.5], near: true },
    { prop: 'boulder_mossy', weight: .7, scale: [.5, .9], near: true },
  ],
  woods: [
    { prop: 'birch', weight: 5, scale: [.95, 1.45] }, { prop: 'pine', weight: 2, scale: [.9, 1.3] }, { prop: 'bush', weight: 2, scale: [.9, 1.4], near: true },
    { prop: 'flowers_white', weight: 1.5, scale: [.9, 1.5], near: true }, { prop: 'flowers_gold', weight: 1.2, scale: [.9, 1.4], near: true },
  ],
  rocky: [
    { prop: 'boulder', weight: 2.8, scale: [.6, 1.7] }, { prop: 'boulder_mossy', weight: 1.2, scale: [.7, 1.5] }, { prop: 'snag', weight: .7, scale: [.6, 1] },
    { prop: 'spruce', weight: 2.6, scale: [.6, .95] }, { prop: 'bush', weight: .8, scale: [.7, 1.1], near: true },
  ],
  lake: [
    { prop: 'willow', weight: 3, scale: [.9, 1.35] }, { prop: 'birch', weight: 2.2, scale: [.9, 1.3] }, { prop: 'pine', weight: 1, scale: [.9, 1.3] },
    { prop: 'bush', weight: 1.6, scale: [.8, 1.3], near: true }, { prop: 'flowers_pink', weight: 1.4, scale: [.9, 1.4], near: true },
    { prop: 'flowers_white', weight: 1.2, scale: [.9, 1.4], near: true },
  ],
  swamp: [
    { prop: 'cypress', weight: 4.5, scale: [.85, 1.35] }, { prop: 'stump', weight: 1.2, scale: [.8, 1.5], near: true }, { prop: 'toadstool', weight: 1.4, scale: [.8, 1.4], near: true },
    { prop: 'bush', weight: 1.2, scale: [.7, 1.2], near: true }, { prop: 'snag', weight: 1.4, scale: [.8, 1.3] },
  ],
  ocean: [
    { prop: 'palm', weight: 2.4, scale: [.85, 1.3] }, { prop: 'palm_lean', weight: 2.2, scale: [.85, 1.3] }, { prop: 'dune_grass', weight: 4, scale: [.9, 1.7], near: true },
    { prop: 'bush', weight: .8, scale: [.7, 1.1], near: true }, { prop: 'boulder', weight: 1, scale: [.5, 1.1], near: true },
  ],
}

/** Spacing a prop wants around it, so crowns do not interpenetrate. */
const CLEARANCE: Record<TreelinePropId, number> = {
  pine: 2.6, spruce: 2, birch: 1.9, bush: 1.3, flowers_pink: 1.2, flowers_gold: 1.2, flowers_white: 1.2,
  peak_tall: 12, peak_broad: 14, boulder: 1.8, boulder_mossy: 1.7, snag: 1.1,
  willow: 3.2, reeds: 1, lily_pads: 1.4, cypress: 3, cattails: 1, stump: 1.1, toadstool: 1.4,
  palm: 3, palm_lean: 3.4, dune_grass: 1, sea_stack: 4, sailboat: 5,
}

function pickSpawn(biome: BiomeId, radius: number, rng: () => number): Spawn {
  const table = SPAWNS[biome]
  const farSide = smoothstep(radius, 56, 84)
  const weights = table.map((entry) => entry.weight * (entry.near ? 1 - farSide * .85 : .55 + farSide * .6))
  let roll = rng() * weights.reduce((sum, w) => sum + w, 0)
  for (let i = 0; i < table.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return table[i]
  }
  return table[table.length - 1]
}

function smoothstep(value: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

function createPlacer(rng: () => number) {
  const placed: TreelinePlacement[] = []
  const cells = new Map<string, TreelinePlacement[]>()
  const keyOf = (x: number, z: number) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`
  function fits(prop: TreelinePropId, x: number, z: number, scale: number): boolean {
    const want = CLEARANCE[prop] * scale
    const cx = Math.floor(x / 8)
    const cz = Math.floor(z / 8)
    const reach = Math.ceil((want + 6) / 8)
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dz = -reach; dz <= reach; dz += 1) {
        for (const other of cells.get(`${cx + dx},${cz + dz}`) ?? []) {
          const gap = (want + CLEARANCE[other.prop] * other.scale) * .78
          if (Math.hypot(other.x - x, other.z - z) < gap) return false
        }
      }
    }
    return true
  }
  function add(prop: TreelinePropId, x: number, z: number, scale: number, biome: BiomeId, checkSpacing = true): boolean {
    if (checkSpacing && !fits(prop, x, z, scale)) return false
    const placement: TreelinePlacement = { prop, x, z, rotation: rng() * Math.PI * 2, scale, shade: rng(), biome }
    placed.push(placement)
    const key = keyOf(x, z)
    const bucket = cells.get(key)
    if (bucket) bucket.push(placement)
    else cells.set(key, [placement])
    return true
  }
  return { placed, add }
}

/** Builds the whole ring. Deterministic: the same seed gives the same horizon every visit. */
export function createTreelinePlan(seed = 20260707): TreelinePlan {
  const rng = mulberry32(seed)
  const placer = createPlacer(rng)
  const { add } = placer
  const lerp = (a: number, b: number) => a + (b - a) * rng()

  // Mountains first: they are enormous and own the far edge of the rocky sector.
  for (let i = 0; i < 9; i += 1) {
    const angle = (-50 + i * 6.4 + lerp(-1.4, 1.4)) * DEG
    const radius = lerp(104, 136)
    add(i % 2 ? 'peak_broad' : 'peak_tall', Math.cos(angle) * radius, Math.sin(angle) * radius, lerp(1.2, 2.0), 'rocky', false)
  }
  // A few smaller far peaks keep the meadow's skyline from being flat.
  for (const degrees of [-122, -104, -88, -70, -58]) {
    const angle = (degrees + lerp(-3, 3)) * DEG
    const radius = lerp(128, 150)
    add(rng() > .5 ? 'peak_broad' : 'peak_tall', Math.cos(angle) * radius, Math.sin(angle) * radius, lerp(.85, 1.25), 'meadow', false)
  }
  for (const degrees of [222, 232, 244]) {
    const angle = (degrees + lerp(-2, 2)) * DEG
    const radius = lerp(130, 150)
    add('peak_broad', Math.cos(angle) * radius, Math.sin(angle) * radius, lerp(.8, 1.1), 'woods', false)
  }

  // Sea stacks and sailboats stand in the water itself.
  for (let i = 0; i < 6; i += 1) {
    const angle = OCEAN_FROM + (OCEAN_TO - OCEAN_FROM) * (.2 + i * .12 + lerp(-.03, .03))
    const radius = lerp(112, 150)
    add('sea_stack', Math.cos(angle) * radius, Math.sin(angle) * radius, lerp(.8, 1.7), 'ocean')
  }
  for (const [degrees, radius] of [[172, 92], [188, 100], [158, 108]] as const) {
    const angle = (degrees + lerp(-2, 2)) * DEG
    add('sailboat', Math.cos(angle) * radius, Math.sin(angle) * radius, lerp(.9, 1.15), 'ocean')
  }

  // Shore life: reeds on lakes, cattails round the swamp pools, dune grass along the beach.
  for (const body of WATER_BODIES) {
    const shore = body.kind === 'ocean' ? body.water.slice(0, body.water.length / 2) : body.water
    const stride = body.kind === 'ocean' ? 2 : 1
    for (let i = 0; i < shore.length; i += stride) {
      const [x, z] = shore[i]
      const away = body.kind === 'ocean' ? Math.hypot(x, z) : Math.hypot(x - body.center[0], z - body.center[1])
      const nx = body.kind === 'ocean' ? -x / away : (x - body.center[0]) / away
      const nz = body.kind === 'ocean' ? -z / away : (z - body.center[1]) / away
      const roll = rng()
      const prop: TreelinePropId = body.kind === 'ocean' ? 'dune_grass' : body.kind === 'swamp' ? 'cattails' : 'reeds'
      if (roll < (body.kind === 'ocean' ? .75 : .8)) {
        const push = lerp(body.kind === 'ocean' ? 2.5 : .6, body.kind === 'ocean' ? 7 : 2.2)
        const px = x + nx * push
        const pz = z + nz * push
        if (!isInShopClearing(px, pz, 6)) add(prop, px, pz, lerp(.85, 1.4), body.kind === 'ocean' ? 'ocean' : body.kind === 'lake' ? 'lake' : 'swamp')
      }
    }
    // Lily pads float inside lakes and swamp pools.
    if (body.kind !== 'ocean') {
      const pads = body.kind === 'lake' ? 7 : 4
      for (let i = 0; i < pads; i += 1) {
        const [cx, cz] = body.center
        const angle = rng() * Math.PI * 2
        const x = cx + Math.cos(angle) * lerp(0, 5)
        const z = cz + Math.sin(angle) * lerp(0, 3)
        if (isTreelineWater(x, z)) add('lily_pads', x, z, lerp(.9, 1.5), body.kind)
      }
    }
  }

  // The scatter itself: denser close to the farm, thinning toward the hills.
  for (let attempt = 0; attempt < 2600; attempt += 1) {
    const angle = rng() * Math.PI * 2
    const radius = TREELINE_INNER_RADIUS + Math.pow(rng(), 1.55) * 78
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (isInShopClearing(x, z, 10)) continue
    if (isTreelineWater(x, z, true)) continue
    // Jitter the angle that picks the biome, so a border is a ragged mix, not a ruler line.
    const biome = biomeAtAngle(angle + (rng() - .5) * 18 * DEG)
    const spawn = pickSpawn(biome, radius, rng)
    // Trees go thin on the sea side: a beach, not a jungle.
    if (biome === 'ocean' && radius > 90 && rng() < .8) continue
    add(spawn.prop, x, z, lerp(spawn.scale[0], spawn.scale[1]), biome)
  }

  // Soft ground patches: gravel, mud and clover, so each biome tints the grass under it.
  const patches: GroundPatch[] = []
  for (let attempt = 0; attempt < 420 && patches.length < 130; attempt += 1) {
    const angle = rng() * Math.PI * 2
    const radius = TREELINE_INNER_RADIUS - 2 + Math.pow(rng(), 1.2) * 70
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (isTreelineWater(x, z, true) || isInShopClearing(x, z, 6)) continue
    const biome = biomeAtAngle(angle + (rng() - .5) * 8 * DEG)
    if (biome === 'ocean' && radius > OCEAN_COAST - 12) continue
    patches.push({ x, z, radius: lerp(5, 12), biome, tone: rng() })
  }

  return { placements: placer.placed, water: WATER_BODIES, patches, oceanArc: [OCEAN_FROM, OCEAN_TO] }
}
