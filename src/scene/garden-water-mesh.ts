import * as THREE from 'three'
import { GARDEN_LAWN_Y } from './fairground'
import { makeGardenLawnGeometry } from './fairground'
import type { GardenWaterField } from '../game/garden-water'
import type { GardenTerrain } from './garden-terrain'

/**
 * The visible water surface.
 *
 * One extra mesh spans the whole garden and is driven per-vertex, exactly like
 * the soil and lawn planes already are:
 *
 * - `y = ground + depth`, so where the solver has levelled a pool the surface is
 *   dead flat for free, and where it has not, the sheet hugs the ground.
 * - `alpha = smoothstep(0, EDGE_FADE, depth)`, so the mesh covers dry ground
 *   too but is fully transparent there. That buys a soft, organically shaped
 *   shoreline instead of the hard polygon edge a clipped contour would give,
 *   in a single draw call, with no marching-squares pass.
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
  // Drawn after the lawn and soil so the wet ground reads through the water.
  mesh.renderOrder = 3
  mesh.frustumCulled = false

  let dirty = true

  function update(elapsedSeconds: number): void {
    // The shore field is the whole point: it carries the pool's own level out
    // past the waterline, so the sheet stays flat while it fades, instead of
    // teetering on the terrain and shredding into a saw of spikes.
    const { level, wetness } = water.shoreField()
    const originX = -(water.gridCols * water.cellSize) / 2
    const originZ = -(water.gridRows * water.cellSize) / 2
    for (let index = 0; index < positions.count; index += 1) {
      const worldX = positions.getX(index)
      const worldZ = -positions.getY(index)
      const gx = Math.min(water.gridCols - 1, Math.max(0, Math.floor((worldX - originX) / water.cellSize)))
      const gz = Math.min(water.gridRows - 1, Math.max(0, Math.floor((worldZ - originZ) / water.cellSize)))
      const cell = gz * water.gridCols + gx
      const alpha = wetness[cell]
      const height = level[cell]
      if (alpha <= 0.001 || Number.isNaN(height)) {
        positions.setZ(index, 0)
        colors.setXYZW(index, 1, 1, 1, 0)
        continue
      }
      // A slow, shallow shimmer keeps a still pond from looking like glass.
      const shimmer = Math.sin(worldX * 1.7 + elapsedSeconds * SHIMMER_SPEED)
        * Math.sin(worldZ * 1.3 - elapsedSeconds * SHIMMER_SPEED * 0.7)
      // The sheet is placed at the pool's own level even where that is below
      // the surrounding bank. It is NOT clamped up to the terrain: on a steep
      // shore that clamp tilts the edge vertices up into a fringe of spikes.
      // The soil is drawn first and writes depth, so the bank simply occludes
      // the part of the sheet that has sunk into it.
      positions.setZ(index, height - mesh.position.y + SURFACE_OFFSET + shimmer * SHIMMER_AMPLITUDE)
      // Deeper water reads more solid, so a pond has a gradient rather than one
      // flat wash of colour.
      const depth = Math.max(0, height - terrain.heightAt(worldX, worldZ))
      colors.setXYZW(index, 1, 1, 1, alpha * Math.min(1, 0.62 + depth * 0.5))
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
