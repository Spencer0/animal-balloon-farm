import * as THREE from 'three'
import { GARDEN_BOUNDS, GARDEN_MAX_BOUNDS } from './fairground'
import type { GardenBounds } from '../game/farm-expansion'

/**
 * Canonical garden height field (SPEC §9: garden coordinates independent of
 * Three.js). The grid is the source of truth; meshes are re-derived from it.
 *
 * Every edit funnels through splat/smooth, and both end in clampSlope, so a
 * cliff steeper than MAX_SLOPE is unrepresentable — animals can always walk
 * anywhere without pathfinding.
 */

export const TERRAIN_MIN_H = -0.8
export const TERRAIN_MAX_H = 1.2
const TERRAIN_CELL = 0.55
const TERRAIN_MAX_SLOPE = 0.6
const EDGE_KEEP_OUT = 0.9
const EDGE_FADE_WIDTH = 0.6
const SLOPE_PASSES = 3

const GRID_ORIGIN_X = -(GARDEN_MAX_BOUNDS.halfWidth + 0.08)
const GRID_ORIGIN_Z = -(GARDEN_MAX_BOUNDS.halfDepth + 0.08)
const GRID_COLS = Math.round((GARDEN_MAX_BOUNDS.halfWidth * 2 + 0.16) / TERRAIN_CELL) + 1
const GRID_ROWS = Math.round((GARDEN_MAX_BOUNDS.halfDepth * 2 + 0.16) / TERRAIN_CELL) + 1

export interface GardenTerrain {
  readonly cellSize: number
  readonly gridCols: number
  readonly gridRows: number
  heightAt(x: number, z: number): number
  splat(x: number, z: number, radius: number, amount: number): number
  smooth(x: number, z: number, radius: number, strength: number): number
  applyToMeshes(): void
  readonly dirty: boolean
  clear(): void
  stats(): { min: number; max: number; changedCells: number }
}

export interface TerrainMeshBinding {
  readonly mesh: THREE.Mesh
  /** World-space drop below the exact height, keeping layered planes apart. */
  readonly offset?: number
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function createGardenTerrain(
  bindings: readonly TerrainMeshBinding[],
  getActiveBounds: () => GardenBounds = () => GARDEN_BOUNDS,
): GardenTerrain {
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
    const bounds = getActiveBounds()
    const fadeX = Math.min(1, Math.max(0, (bounds.halfWidth - EDGE_KEEP_OUT - Math.abs(worldX)) / EDGE_FADE_WIDTH))
    const fadeZ = Math.min(1, Math.max(0, (bounds.halfDepth - EDGE_KEEP_OUT - Math.abs(worldZ)) / EDGE_FADE_WIDTH))
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

  /** Enforce walkability: |Δh| between neighbors ≤ MAX_SLOPE × cell. */
  function clampSlope(minGx: number, maxGx: number, minGz: number, maxGz: number): void {
    const limit = TERRAIN_MAX_SLOPE * TERRAIN_CELL
    for (let pass = 0; pass < SLOPE_PASSES; pass += 1) {
      for (let gz = minGz; gz <= maxGz; gz += 1) {
        for (let gx = minGx; gx <= maxGx; gx += 1) {
          const index = gz * GRID_COLS + gx
          for (const neighbor of [index + 1, index + GRID_COLS]) {
            const isRight = neighbor === index + 1
            if (isRight && gx >= GRID_COLS - 1) continue
            if (!isRight && gz >= GRID_ROWS - 1) continue
            const delta = heights[neighbor] - heights[index]
            const excess = Math.abs(delta) - limit
            if (excess <= 0) continue
            if (delta > 0) {
              // neighbor is higher: lower it, raise this cell as far as allowed.
              const lift = Math.min(excess / 2, TERRAIN_MAX_H - heights[index])
              heights[index] += lift
              heights[neighbor] -= excess - lift
            } else {
              const drop = Math.min(excess / 2, heights[index] - TERRAIN_MIN_H)
              heights[index] -= drop
              heights[neighbor] += excess - drop
            }
          }
        }
      }
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
      clampSlope(clampX(minGx - 1), clampX(maxGx + 1), clampZ(minGz - 1), clampZ(maxGz + 1))
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
      clampSlope(clampX(minGx - 1), clampX(maxGx + 1), clampZ(minGz - 1), clampZ(maxGz + 1))
      dirty = true
    }
    return changed
  }

  /** Re-derive mesh vertices from the grid; local +z maps to world height. */
  function applyToMeshes(): void {
    for (const binding of bindings) {
      const mesh = binding.mesh
      const geometry = mesh.geometry
      const positions = geometry.getAttribute('position') as THREE.BufferAttribute
      const offset = binding.offset ?? 0
      for (let index = 0; index < positions.count; index += 1) {
        const worldX = positions.getX(index)
        const worldZ = -positions.getY(index)
        positions.setZ(index, heightAt(worldX, worldZ) - mesh.position.y + offset)
      }
      positions.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
    }
    dirty = false
  }

  function clear(): void {
    heights.fill(0)
    dirty = true
  }

  function stats(): { min: number; max: number; changedCells: number } {
    let min = 0
    let max = 0
    let changedCells = 0
    for (let index = 0; index < heights.length; index += 1) {
      const value = heights[index]
      if (value < min) min = value
      if (value > max) max = value
      if (Math.abs(value) > 0.0005) changedCells += 1
    }
    return { min, max, changedCells }
  }

  return {
    cellSize: TERRAIN_CELL,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    heightAt,
    splat,
    smooth,
    applyToMeshes,
    get dirty() {
      return dirty
    },
    clear,
    stats,
  }
}
