import * as THREE from 'three'
import { GARDEN_BOUNDS } from './fairground'

/**
 * Canonical garden height field (SPEC §9: garden coordinates independent of
 * Three.js). The grid is the source of truth; meshes are re-derived from it.
 *
 * Every edit funnels through splat/smooth, and both end in clampSlope, so a
 * cliff steeper than MAX_SLOPE is unrepresentable — animals can always walk
 * anywhere without pathfinding.
 */

export const TERRAIN_MIN_H = -2.6
export const TERRAIN_MAX_H = 1.2
const TERRAIN_CELL = 0.55
// Pond banks want to read steep (real garden ponds run 30–45°) and balloon
// animals traverse purely by eased ground-sampling — they hop, not climb — so
// slope clamping only has to kill jagged spikes, not gentle hills. 0.75 ≈ 37°:
// a 2.6 m-deep pond needs ~2 m of bank per side, leaving room for a real
// flat bottom in the 28×19 m plot. (At 0.42 a max-depth pond is ALL bank.)
const TERRAIN_MAX_SLOPE = 0.75
const EDGE_KEEP_OUT = 0.9
const EDGE_FADE_WIDTH = 0.6
// Slope-clamp sweep bounds: the box around an edit is padded far beyond how
// far one correction wave can travel, sweeps stop as soon as a sweep makes no
// progress, and 60 sweeps is a hard backstop. Digging holds run ~12 splats per
// second — the clamp must cost microseconds, not frames.
const CLAMP_PAD_CELLS = 16
const CLAMP_MAX_SWEEPS = 60

// Contour rings: depth bands baked into the soil vertex colors, one shade step
// every RING_SPACING meters below grade. They give dug holes readable "depth
// rings" (each band = one more ring of depth) and pre-shade future pond beds.
export const DEPTH_RING_SPACING = 0.35
const SOIL_BASE_COLOR = new THREE.Color('#96744e')
const SOIL_WET_COLOR = new THREE.Color('#4c3524')
const SOIL_WET_RATIO = new THREE.Vector3(
  SOIL_WET_COLOR.r / SOIL_BASE_COLOR.r,
  SOIL_WET_COLOR.g / SOIL_BASE_COLOR.g,
  SOIL_WET_COLOR.b / SOIL_BASE_COLOR.b,
)

const GRID_ORIGIN_X = -(GARDEN_BOUNDS.halfWidth + 0.08)
const GRID_ORIGIN_Z = -(GARDEN_BOUNDS.halfDepth + 0.08)
const GRID_COLS = Math.round((GARDEN_BOUNDS.halfWidth * 2 + 0.16) / TERRAIN_CELL) + 1
const GRID_ROWS = Math.round((GARDEN_BOUNDS.halfDepth * 2 + 0.16) / TERRAIN_CELL) + 1

export interface GardenTerrain {
  readonly cellSize: number
  readonly gridCols: number
  readonly gridRows: number
  heightAt(x: number, z: number): number
  splat(x: number, z: number, radius: number, amount: number): number
  smooth(x: number, z: number, radius: number, strength: number): number
  level(x: number, z: number, radius: number, strength: number): number
  applyToMeshes(): void
  readonly dirty: boolean
  clear(): void
  clearSoilBandColors(): void
  stats(): { min: number; max: number; changedCells: number; depthBands: number; maxNeighborDelta: number }
}

export interface TerrainMeshBinding {
  readonly mesh: THREE.Mesh
  /** World-space drop below the exact height, keeping layered planes apart. */
  readonly offset?: number
  /** Bake depth-band contour tinting into this mesh's vertex colors. */
  readonly soilRings?: boolean
}

const soilColorAttributeCache = new WeakMap<THREE.BufferGeometry, THREE.BufferAttribute>()

/** RGBA color slot for depth bands; created lazily so plain meshes stay untouched. */
function soilColorsAt(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const cached = soilColorAttributeCache.get(geometry)
  if (cached) return cached
  const existing = geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  const attribute = existing && existing.itemSize === 4
    ? existing
    : new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 4), 4)
  if (!existing || existing.itemSize !== 4) geometry.setAttribute('color', attribute)
  for (let index = 0; index < attribute.count; index += 1) attribute.setXYZW(index, 1, 1, 1, 1)
  attribute.needsUpdate = true
  soilColorAttributeCache.set(geometry, attribute)
  return attribute
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function createGardenTerrain(bindings: readonly TerrainMeshBinding[]): GardenTerrain {
  const heights = new Float32Array(GRID_COLS * GRID_ROWS)
  let dirty = false

  function gridX(x: number): number {
    return (x - GRID_ORIGIN_X) / TERRAIN_CELL
  }

  function gridZ(z: number): number {
    return (z - GRID_ORIGIN_Z) / TERRAIN_CELL
  }

  function clampX(index: number): number {
    return Math.min(GRID_COLS - 1, Math.max(0, index))
  }

  function clampZ(index: number): number {
    return Math.min(GRID_ROWS - 1, Math.max(0, index))
  }

  function cellEdgeFade(gx: number, gz: number): number {
    const worldX = GRID_ORIGIN_X + gx * TERRAIN_CELL
    const worldZ = GRID_ORIGIN_Z + gz * TERRAIN_CELL
    const fadeX = Math.min(1, Math.max(0, (GARDEN_BOUNDS.halfWidth - EDGE_KEEP_OUT - Math.abs(worldX)) / EDGE_FADE_WIDTH))
    const fadeZ = Math.min(1, Math.max(0, (GARDEN_BOUNDS.halfDepth - EDGE_KEEP_OUT - Math.abs(worldZ)) / EDGE_FADE_WIDTH))
    return Math.min(fadeX, fadeZ)
  }

  function heightAt(x: number, z: number): number {
    const fx = gridX(x)
    const fz = gridZ(z)
    const ix = clampX(Math.floor(fx))
    const iz = clampZ(Math.floor(fz))
    const jx = clampX(ix + 1)
    const jz = clampZ(iz + 1)
    const tx = Math.min(1, Math.max(0, fx - ix))
    const tz = Math.min(1, Math.max(0, fz - iz))
    const h00 = heights[iz * GRID_COLS + ix]
    const h10 = heights[iz * GRID_COLS + jx]
    const h01 = heights[jz * GRID_COLS + ix]
    const h11 = heights[jz * GRID_COLS + jx]
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
  }

  /** Bring one neighbor pair within the slope limit; returns the excess fixed. */
  function clampPair(index: number, neighbor: number, limit: number): number {
    const delta = heights[neighbor] - heights[index]
    const excess = Math.abs(delta) - limit
    if (excess <= 0) return 0
    if (delta > 0) {
      // neighbor is higher: lower it, raise this cell as far as allowed.
      const lift = Math.max(0, Math.min(excess / 2, TERRAIN_MAX_H - heights[index]))
      heights[index] += lift
      heights[neighbor] -= excess - lift
    } else {
      // Honor the floor so slope redistribution can never dig a cell below it
      // (TERRAIN_MIN_H is deep enough for large ponds). The max(0, …) matters:
      // a cell already AT the floor must absorb nothing (not a negative
      // "drop", which would raise it and boost the neighbor).
      const drop = Math.max(0, Math.min(excess / 2, heights[index] - terrainFloor()))
      heights[index] -= drop
      heights[neighbor] += excess - drop
    }
    return excess
  }

  /**
   * Enforce walkability: |Δh| between neighbors ≤ MAX_SLOPE × cell. Sweeps a
   * generously padded box around the edit until a sweep fixes nothing or stops
   * making progress — sequential sweeps can ping-pong residual excess around a
   * deep pit, and chasing it to a full fixed point inside one splat cost whole
   * frames. Whatever residue remains is tiny and re-clamped by the next edit
   * tick (~80 ms later).
   */
  function clampSlope(minGx: number, maxGx: number, minGz: number, maxGz: number): void {
    const limit = TERRAIN_MAX_SLOPE * TERRAIN_CELL
    const fromGx = clampX(minGx)
    const toGx = clampX(maxGx)
    const fromGz = clampZ(minGz)
    const toGz = clampZ(maxGz)
    const rightEnd = Math.min(toGx, GRID_COLS - 2)
    const downEnd = Math.min(toGz, GRID_ROWS - 2)
    let previousExcess = Infinity
    for (let sweep = 0; sweep < CLAMP_MAX_SWEEPS; sweep += 1) {
      let totalExcess = 0
      for (let gz = fromGz; gz <= toGz; gz += 1) {
        const row = gz * GRID_COLS
        for (let gx = fromGx; gx <= rightEnd; gx += 1) totalExcess += clampPair(row + gx, row + gx + 1, limit)
        if (gz <= downEnd) {
          for (let gx = fromGx; gx <= toGx; gx += 1) totalExcess += clampPair(row + gx, row + gx + GRID_COLS, limit)
        }
      }
      if (totalExcess <= 0 || totalExcess >= previousExcess) break
      previousExcess = totalExcess
    }
  }

  function splat(x: number, z: number, radius: number, amount: number): number {
    const minGx = clampX(Math.floor(gridX(x - radius)))
    const maxGx = clampX(Math.ceil(gridX(x + radius)))
    const minGz = clampZ(Math.floor(gridZ(z - radius)))
    const maxGz = clampZ(Math.ceil(gridZ(z + radius)))
    let changed = 0
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const worldX = GRID_ORIGIN_X + gx * TERRAIN_CELL
        const worldZ = GRID_ORIGIN_Z + gz * TERRAIN_CELL
        const distance = Math.hypot(worldX - x, worldZ - z)
        if (distance > radius) continue
        // Full effect through the middle, easing out over the rim.
        const weight = 1 - smoothstep(0.6, 1, distance / radius)
        const edge = cellEdgeFade(gx, gz)
        const effect = weight * edge
        if (effect <= 0) continue
        const index = gz * GRID_COLS + gx
        const before = heights[index]
        const after = Math.min(TERRAIN_MAX_H, Math.max(TERRAIN_MIN_H, before + amount * effect))
        if (after === before) continue
        heights[index] = after
        changed += 1
      }
    }
    if (changed > 0) {
      clampSlope(minGx - CLAMP_PAD_CELLS, maxGx + CLAMP_PAD_CELLS, minGz - CLAMP_PAD_CELLS, maxGz + CLAMP_PAD_CELLS)
      dirty = true
    }
    return changed
  }

  /**
   * Level: pull every cell in the disc toward the disc's brush-weighted average
   * height — the "make this patch flat" verb. Unlike smooth (local blur), a
   * plane emerges even when the patch mixes raised and lowered ground.
   */
  function level(x: number, z: number, radius: number, strength: number): number {
    const minGx = clampX(Math.floor(gridX(x - radius)))
    const maxGx = clampX(Math.ceil(gridX(x + radius)))
    const minGz = clampZ(Math.floor(gridZ(z - radius)))
    const maxGz = clampZ(Math.ceil(gridZ(z + radius)))
    const indices: number[] = []
    const weights: number[] = []
    let weightSum = 0
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const worldX = GRID_ORIGIN_X + gx * TERRAIN_CELL
        const worldZ = GRID_ORIGIN_Z + gz * TERRAIN_CELL
        const distance = Math.hypot(worldX - x, worldZ - z)
        if (distance > radius) continue
        const weight = (1 - smoothstep(0.6, 1, distance / radius)) * cellEdgeFade(gx, gz)
        if (weight <= 0) continue
        indices.push(gz * GRID_COLS + gx)
        weights.push(weight)
        weightSum += weight
      }
    }
    if (!indices.length) return 0
    let average = 0
    for (let i = 0; i < indices.length; i += 1) average += heights[indices[i]] * weights[i]
    average /= weightSum
    let changed = 0
    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i]
      const before = heights[index]
      const after = Math.min(TERRAIN_MAX_H, Math.max(TERRAIN_MIN_H, before + (average - before) * Math.min(1, strength * weights[i])))
      if (after !== before) {
        heights[index] = after
        changed += 1
      }
    }
    if (changed > 0) {
      clampSlope(minGx - CLAMP_PAD_CELLS, maxGx + CLAMP_PAD_CELLS, minGz - CLAMP_PAD_CELLS, maxGz + CLAMP_PAD_CELLS)
      dirty = true
    }
    return changed
  }

  function smooth(x: number, z: number, radius: number, strength: number): number {
    const minGx = clampX(Math.floor(gridX(x - radius)))
    const maxGx = clampX(Math.ceil(gridX(x + radius)))
    const minGz = clampZ(Math.floor(gridZ(z - radius)))
    const maxGz = clampZ(Math.ceil(gridZ(z + radius)))
    const snapshot = Float32Array.from(heights)
    let changed = 0
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const index = gz * GRID_COLS + gx
        const worldX = GRID_ORIGIN_X + gx * TERRAIN_CELL
        const worldZ = GRID_ORIGIN_Z + gz * TERRAIN_CELL
        const distance = Math.hypot(worldX - x, worldZ - z)
        if (distance > radius) continue
        const weight = (1 - smoothstep(0.6, 1, distance / radius)) * cellEdgeFade(gx, gz)
        if (weight <= 0) continue
        let sum = 0
        let count = 0
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = clampX(gx + dx)
            const nz = clampZ(gz + dz)
            sum += snapshot[nz * GRID_COLS + nx]
            count += 1
          }
        }
        const target = sum / count
        const after = Math.min(TERRAIN_MAX_H, Math.max(TERRAIN_MIN_H, snapshot[index] + (target - snapshot[index]) * Math.min(1, strength * weight)))
        if (after !== snapshot[index]) {
          heights[index] = after
          changed += 1
        }
      }
    }
    if (changed > 0) {
      clampSlope(minGx - CLAMP_PAD_CELLS, maxGx + CLAMP_PAD_CELLS, minGz - CLAMP_PAD_CELLS, maxGz + CLAMP_PAD_CELLS)
      dirty = true
    }
    return changed
  }

  function terrainFloor(): number {
    return Math.min(-0.05, TERRAIN_MIN_H + 1e-4)
  }

  function soilBandColor(belowGrade: number, target: THREE.Vector3): void {
    if (belowGrade <= 0) {
      target.set(1, 1, 1)
      return
    }
    // One contour step per DEPTH_RING_SPACING of depth, easing toward the wet
    // ratio. Colors are RATIOS to the base soil color, not absolute tints:
    // the soil material draws texture-map × vertex-color, so white at grade
    // leaves the untouched garden pixel-identical and bands multiply the
    // existing soil texture darker/wetter instead of double-browning it.
    const t = smoothstep(0, 14, belowGrade / DEPTH_RING_SPACING)
    target.set(
      1 + (SOIL_WET_RATIO.x - 1) * t,
      1 + (SOIL_WET_RATIO.y - 1) * t,
      1 + (SOIL_WET_RATIO.z - 1) * t,
    )
  }

  function resetSoilBandColors(): void {
    for (const binding of bindings) {
      if (!binding.soilRings) continue
      const colors = soilColorAttributeCache.get(binding.mesh.geometry)
      if (!colors) continue
      for (let index = 0; index < colors.count; index += 1) colors.setXYZ(index, 1, 1, 1)
      colors.needsUpdate = true
    }
  }

  /** Re-derive mesh vertices from the grid; local +z maps to world height. */
  function applyToMeshes(): void {
    for (const binding of bindings) {
      const mesh = binding.mesh
      const geometry = mesh.geometry
      const positions = geometry.getAttribute('position') as THREE.BufferAttribute
      const offset = binding.offset ?? 0
      const colors = binding.soilRings ? soilColorsAt(geometry) : null
      if (colors) {
        // The color attribute only renders if the material opts in; the soil
        // material ships without vertexColors, so enable it on first ring bake.
        const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
        const standards = Array.isArray(material) ? material : [material]
        for (const standard of standards) {
          if (!standard.vertexColors) {
            standard.vertexColors = true
            standard.needsUpdate = true
          }
        }
      }
      const bandRatio = new THREE.Vector3()
      for (let index = 0; index < positions.count; index += 1) {
        const worldX = positions.getX(index)
        const worldZ = -positions.getY(index)
        const height = heightAt(worldX, worldZ)
        positions.setZ(index, height - mesh.position.y + offset)
        if (colors) {
          soilBandColor(-height, bandRatio)
          colors.setXYZ(index, bandRatio.x, bandRatio.y, bandRatio.z)
        }
      }
      positions.needsUpdate = true
      if (colors) colors.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
    }
    dirty = false
  }

  function clear(): void {
    heights.fill(0)
    dirty = true
  }

  function stats(): { min: number; max: number; changedCells: number; depthBands: number; maxNeighborDelta: number } {
    let min = 0
    let max = 0
    let changedCells = 0
    const bands = new Set<number>()
    let maxNeighborDelta = 0
    for (let index = 0; index < heights.length; index += 1) {
      const value = heights[index]
      if (value < min) min = value
      if (value > max) max = value
      if (Math.abs(value) > 0.0005) changedCells += 1
      if (value < -0.02) bands.add(Math.floor(-value / DEPTH_RING_SPACING))
      const gx = index % GRID_COLS
      const gz = (index - gx) / GRID_COLS
      if (gx + 1 < GRID_COLS) maxNeighborDelta = Math.max(maxNeighborDelta, Math.abs(heights[index + 1] - value))
      if (gz + 1 < GRID_ROWS) maxNeighborDelta = Math.max(maxNeighborDelta, Math.abs(heights[index + GRID_COLS] - value))
    }
    return { min, max, changedCells, depthBands: bands.size, maxNeighborDelta: +maxNeighborDelta.toFixed(3) }
  }

  return {
    cellSize: TERRAIN_CELL,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    heightAt,
    splat,
    smooth,
    level,
    applyToMeshes,
    get dirty() {
      return dirty
    },
    clear,
    clearSoilBandColors: resetSoilBandColors,
    stats,
  }
}
