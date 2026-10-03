import * as THREE from 'three'
import { GARDEN_BOUNDS, GARDEN_LAWN_Y, makeGardenLawnGeometry } from './fairground'
import type { GardenWaterField } from '../game/garden-water'
import type { GardenBounds } from '../game/farm-expansion'
import type { GardenTerrain } from './garden-terrain'

/** Sit just above the lawn paint so the two planes never z-fight. */
const SURFACE_OFFSET = 0.018
/** Ripples are a small vertex wobble; amplitude is deliberately tiny. */
const SHIMMER_AMPLITUDE = 0.006
const SHIMMER_SPEED = 0.9

type PlaneGeometry = THREE.PlaneGeometry & { parameters: { width: number; height: number; widthSegments: number; heightSegments: number } }

export interface GardenWaterMesh {
  readonly geometry: THREE.BufferGeometry
  readonly mesh: THREE.Mesh
  /** Re-derive vertices from the water field. Call when the water is dirty. */
  update(elapsedSeconds: number): void
  /** True when the mesh has never been built, or the field moved under it. */
  readonly dirty: boolean
  /** Resize the water surface for a newly revealed parcel. */
  syncBounds(bounds: GardenBounds): void
  /** Force a rebuild on the next update (e.g. after a garden re-reveal). */
  markDirty(): void
  dispose(): void
}

export function createGardenWaterMesh(
  terrain: GardenTerrain,
  water: GardenWaterField,
  getActiveBounds: () => GardenBounds = () => GARDEN_BOUNDS,
): GardenWaterMesh {
  let bounds = { ...getActiveBounds() }
  // This geometry is already allocated for the maximum parcel; growth adjusts
  // the active update window without changing topology or allocating new buffers.
  let geometry = makeGardenLawnGeometry() as PlaneGeometry
  let colors = geometry.getAttribute('color') as THREE.BufferAttribute
  let positions = geometry.getAttribute('position') as THREE.BufferAttribute
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
  mesh.renderOrder = 0
  mesh.frustumCulled = false

  let dirty = true
  let hasVisibleWater = false

  function hideWater(): void {
    if (hasVisibleWater) {
      for (let index = 3; index < colors.array.length; index += 4) colors.array[index] = 0
      colors.needsUpdate = true
      hasVisibleWater = false
    }
    dirty = false
  }

  function update(elapsedSeconds: number): void {
    bounds = { ...getActiveBounds() }
    // During dry terrain edits there is no surface to redraw. A later pour
    // makes the field dirty and takes this path after the water solver settles.
    if (water.dirty) return
    if (!water.hasRenderableWater) {
      hideWater()
      return
    }

    const { level, wetness } = water.shoreField()
    const widthSegments = geometry.parameters.widthSegments
    const heightSegments = geometry.parameters.heightSegments
    const width = geometry.parameters.width
    const height = geometry.parameters.height
    const columns = widthSegments + 1
    const originX = water.originX
    const originZ = water.originZ
    const cellSize = water.cellSize
    const gridCols = water.gridCols
    const gridRows = water.gridRows
    const minX = Math.max(-bounds.halfWidth - cellSize * 1.5, originX)
    const maxX = Math.min(bounds.halfWidth + cellSize * 1.5, originX + gridCols * cellSize)
    const minZ = Math.max(-bounds.halfDepth - cellSize * 1.5, originZ)
    const maxZ = Math.min(bounds.halfDepth + cellSize * 1.5, originZ + gridRows * cellSize)
    const minColumn = Math.max(0, Math.floor((minX + width * 0.5) * widthSegments / width) - 2)
    const maxColumn = Math.min(widthSegments, Math.ceil((maxX + width * 0.5) * widthSegments / width) + 2)
    const minRow = Math.max(0, Math.floor((minZ + height * 0.5) * heightSegments / height) - 2)
    const maxRow = Math.min(heightSegments, Math.ceil((maxZ + height * 0.5) * heightSegments / height) + 2)
    const positionArray = positions.array as Float32Array
    const colorArray = colors.array as Float32Array
    let changed = false
    for (let row = minRow; row <= maxRow; row += 1) {
      const worldZ = -height * 0.5 + row * height / heightSegments
      const fz = (worldZ - originZ) / cellSize - 0.5
      const gz = THREE.MathUtils.clamp(Math.floor(fz), 0, gridRows - 2)
      const tz = THREE.MathUtils.clamp(fz - gz, 0, 1)
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const worldX = -width * 0.5 + column * width / widthSegments
        const fx = (worldX - originX) / cellSize - 0.5
        const gx = THREE.MathUtils.clamp(Math.floor(fx), 0, gridCols - 2)
        const tx = THREE.MathUtils.clamp(fx - gx, 0, 1)
        const cell = gz * gridCols + gx
        const h00 = level[cell]
        const h10 = level[cell + 1]
        const h01 = level[cell + gridCols]
        const h11 = level[cell + gridCols + 1]
        const w00 = wetness[cell]
        const w10 = wetness[cell + 1]
        const w01 = wetness[cell + gridCols]
        const w11 = wetness[cell + gridCols + 1]
        const waterHeight = (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
        const wet = (w00 * (1 - tx) + w10 * tx) * (1 - tz) + (w01 * (1 - tx) + w11 * tx) * tz
        const index = row * columns + column
        const positionOffset = index * 3
        const colorOffset = index * 4
        let localHeight = -mesh.position.y + SURFACE_OFFSET
        let alpha = 0
        if (Number.isFinite(waterHeight) && Number.isFinite(wet) && wet > 0.001) {
          const shimmer = Math.sin(worldX * 1.7 + elapsedSeconds * SHIMMER_SPEED)
            * Math.sin(worldZ * 1.3 - elapsedSeconds * SHIMMER_SPEED * 0.7) * wet
          localHeight = waterHeight - mesh.position.y + SURFACE_OFFSET + shimmer * SHIMMER_AMPLITUDE
          const depth = waterHeight - terrain.heightAt(worldX, worldZ)
          const bankFade = THREE.MathUtils.smoothstep(depth, -0.06, 0.04)
          const minimumDepthFade = THREE.MathUtils.smoothstep(depth, 0.015, 0.08)
          alpha = wet * bankFade * minimumDepthFade * Math.min(1, 0.62 + Math.max(0, depth) * 0.5)
        }
        if (positionArray[positionOffset + 2] !== localHeight || colorArray[colorOffset + 3] !== alpha) changed = true
        positionArray[positionOffset + 2] = localHeight
        colorArray[colorOffset] = 1
        colorArray[colorOffset + 1] = 1
        colorArray[colorOffset + 2] = 1
        colorArray[colorOffset + 3] = alpha
      }
    }

    if (changed) {
      positions.clearUpdateRanges()
      colors.clearUpdateRanges()
      for (let row = minRow; row <= maxRow; row += 1) {
        positions.addUpdateRange(row * columns * 3 + minColumn * 3, (maxColumn - minColumn + 1) * 3)
        colors.addUpdateRange(row * columns * 4 + minColumn * 4, (maxColumn - minColumn + 1) * 4)
      }
      positions.needsUpdate = true
      colors.needsUpdate = true
      // Water is visually almost planar. Keep its existing smooth normals;
      // recomputing normals for the whole surface per shovel tick was wasteful.
    }
    hasVisibleWater = true
    dirty = false
  }

  return {
    mesh,
    geometry,
    get dirty() { return dirty },
    syncBounds(nextBounds): void {
      if (nextBounds.halfWidth === bounds.halfWidth && nextBounds.halfDepth === bounds.halfDepth) return
      bounds = { ...nextBounds }
      dirty = true
    },
    markDirty(): void { dirty = true },
    update,
    dispose(): void {
      geometry.dispose()
      material.dispose()
    },
  }
}
