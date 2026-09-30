import * as THREE from 'three'
import { GARDEN_LAWN_Y, makeGardenLawnGeometry } from './fairground'
import type { GardenWaterField } from '../game/garden-water'
import type { GardenTerrain } from './garden-terrain'

/**
 * The visible water surface.
 *
 * One extra mesh spans the whole garden and is driven per-vertex, exactly like
 * the soil and lawn planes already are. Its vertices bilinearly sample a
 * rounded shore-distance field and carry the closest pool level outward. Even
 * alpha-zero vertices keep a finite coplanar level because the GPU interpolates
 * across triangles before blending; leaving dry vertices at grade creates a
 * slanted translucent fringe around ponds.
 *
 * It is deliberately plain-shaded for this milestone: a real ripple/normal map
 * is a follow-up, and getting the silhouette and the shoreline right matters
 * more than the surface detail.
 */

/** Sit just above the lawn paint so the two planes never z-fight. */
const SURFACE_OFFSET = 0.018
/** Ripples are a small vertex wobble; amplitude is deliberately tiny. */
const SHIMMER_AMPLITUDE = 0.006
const SHIMMER_SPEED = 0.9

export interface GardenWaterMesh {
  readonly mesh: THREE.Mesh
  /** Re-derive vertices from the water field. Call when the water is dirty. */
  update(elapsedSeconds: number): void
  /** True when the mesh has never been built, or the field moved under it. */
  readonly dirty: boolean
  /** Force a rebuild on the next update (e.g. after a garden re-reveal). */
  markDirty(): void
  dispose(): void
}

export function createGardenWaterMesh(
  terrain: GardenTerrain,
  water: GardenWaterField,
): GardenWaterMesh {
  const geometry = makeGardenLawnGeometry()
  // The lawn/soil planes use RGBA vertex colours, where alpha is coverage.
  // Reuse that slot so the water can fade out per-vertex the same way.
  const colors = geometry.getAttribute('color') as THREE.BufferAttribute
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const material = new THREE.MeshStandardMaterial({
    color: '#2f8fa8',
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    roughness: 0.22,
    metalness: 0.04,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Garden water surface'
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = GARDEN_LAWN_Y
  mesh.receiveShadow = false
  // The plane is kept in the ground draw group; per-vertex alpha defines its shore.
  mesh.renderOrder = 0
  mesh.frustumCulled = false

  let dirty = true

  function update(elapsedSeconds: number): void {
    // Keep the surface level on every vertex, including transparent vertices:
    // zero alpha does not stop vertex-position interpolation. Resetting dry
    // vertices to grade tears the triangles at a pool's fading edge.
    const { level, wetness } = water.shoreField()
    const originX = -(water.gridCols * water.cellSize) / 2
    const originZ = -(water.gridRows * water.cellSize) / 2
    const sampleWater = (values: Float32Array, worldX: number, worldZ: number): number => {
      // Water values live at cell centres, unlike terrain heights which live
      // at grid vertices. Interpolate between those centres to remove the
      // blocky, angular shoreline from nearest-cell sampling.
      const fx = (worldX - originX) / water.cellSize - 0.5
      const fz = (worldZ - originZ) / water.cellSize - 0.5
      const gx = THREE.MathUtils.clamp(Math.floor(fx), 0, water.gridCols - 2)
      const gz = THREE.MathUtils.clamp(Math.floor(fz), 0, water.gridRows - 2)
      const tx = THREE.MathUtils.clamp(fx - gx, 0, 1)
      const tz = THREE.MathUtils.clamp(fz - gz, 0, 1)
      const h00 = values[gz * water.gridCols + gx]
      const h10 = values[gz * water.gridCols + gx + 1]
      const h01 = values[(gz + 1) * water.gridCols + gx]
      const h11 = values[(gz + 1) * water.gridCols + gx + 1]
      if (![h00, h10, h01, h11].every(Number.isFinite)) return Number.NaN
      return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
    }
    for (let index = 0; index < positions.count; index += 1) {
      const worldX = positions.getX(index)
      const worldZ = -positions.getY(index)
      const alpha = sampleWater(wetness, worldX, worldZ)
      const height = sampleWater(level, worldX, worldZ)
      if (!Number.isFinite(height) || !Number.isFinite(alpha) || alpha <= 0.001) {
        positions.setZ(index, -mesh.position.y + SURFACE_OFFSET)
        colors.setXYZW(index, 1, 1, 1, 0)
        continue
      }
      // A slow, shallow shimmer keeps a still pond from looking like glass.
      // It fades with coverage so distant transparent vertices do not disturb
      // the waterline geometry.
      const shimmer = Math.sin(worldX * 1.7 + elapsedSeconds * SHIMMER_SPEED)
        * Math.sin(worldZ * 1.3 - elapsedSeconds * SHIMMER_SPEED * 0.7) * alpha
      positions.setZ(index, height - mesh.position.y + SURFACE_OFFSET + shimmer * SHIMMER_AMPLITUDE)
      // The ground paint sheets are transparent and do not write depth, so
      // suppress water below a raised bank explicitly. Water and terrain share
      // the same tessellation; this per-vertex clip follows the actual bank and
      // avoids the long triangular shards from a pool-level sheet showing over it.
      const depth = height - terrain.heightAt(worldX, worldZ)
      const bankFade = THREE.MathUtils.smoothstep(depth, -0.06, 0.04)
      const minimumDepthFade = THREE.MathUtils.smoothstep(depth, 0.015, 0.08)
      colors.setXYZW(index, 1, 1, 1, alpha * bankFade * minimumDepthFade * Math.min(1, 0.62 + Math.max(0, depth) * 0.5))
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    dirty = false
  }

  return {
    mesh,
    get dirty() {
      return dirty
    },
    markDirty(): void {
      dirty = true
    },
    update,
    dispose(): void {
      geometry.dispose()
      material.dispose()
    },
  }
}
