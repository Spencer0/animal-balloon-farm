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

export const TERRAIN_MIN_H = -2.6
export const TERRAIN_MAX_H = 1.2
const TERRAIN_CELL = 0.55
// Pond banks want to read steep (real garden ponds run 30–45°) and balloon
// animals traverse purely by eased ground-sampling — they hop, not climb — so
// slope clamping only has to kill jagged spikes, not gentle hills. 0.75 ≈ 37°:
// a 2.6 m-deep pond needs ~2 m of bank per side, leaving room for a real
// flat bottom in the 28×19 m plot. (At 0.42 a max-depth pond is ALL bank.)
const TERRAIN_MAX_SLOPE = 0.75
// The complete parcel is sculptable up to its edge. Ground beyond that edge
// is fixed at grade, so only a real terrain basin—not an artificial rim or
// faded shovel radius—can hold water in the corners.
// Start slope constraints around the touched cells; a work queue propagates
// only through neighboring pairs that actually become too steep.
const CLAMP_SEED_PAD_CELLS = 1
// Mesh XY sampling is ~0.42 m and rounded parcel corners displace vertices by
// up to 0.9 m from the uncut plane; include that footprint around dirty cells.
const TERRAIN_MESH_DIRTY_PAD = 1.2

// Contour rings are ratios over the soil texture so at-grade ground is unchanged.
export const DEPTH_RING_SPACING = 0.35
const SOIL_BASE_COLOR = new THREE.Color('#96744e')
const SOIL_WET_COLOR = new THREE.Color('#4c3524')
const SOIL_WET_RATIO = new THREE.Vector3(
  SOIL_WET_COLOR.r / SOIL_BASE_COLOR.r,
  SOIL_WET_COLOR.g / SOIL_BASE_COLOR.g,
  SOIL_WET_COLOR.b / SOIL_BASE_COLOR.b,
)


export interface GardenTerrain {
  readonly cellSize: number
  readonly gridCols: number
  readonly gridRows: number
  readonly originX: number
  readonly originZ: number
  heightAt(x: number, z: number): number
  /** Ground height at a grid cell. Water samples the same edited surface shown to the player. */
  cellHeightAt(gx: number, gz: number): number
  splat(x: number, z: number, radius: number, amount: number): number
  smooth(x: number, z: number, radius: number, strength: number): number
  level(x: number, z: number, radius: number, strength: number): number
  applyToMeshes(forceFull?: boolean): void
  /** Rebuild the editable parcel mask after bounds change. Returns true if it moved. */
  syncBounds(): boolean
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

interface TerrainPlaneTopology {
  readonly widthSegments: number
  readonly heightSegments: number
  readonly width: number
  readonly height: number
  readonly indices: ArrayLike<number>
}

const terrainPlaneTopologyCache = new WeakMap<THREE.BufferGeometry, TerrainPlaneTopology | null>()

function terrainPlaneTopology(geometry: THREE.BufferGeometry): TerrainPlaneTopology | null {
  if (terrainPlaneTopologyCache.has(geometry)) return terrainPlaneTopologyCache.get(geometry) ?? null
  const parameters = (geometry as THREE.BufferGeometry & { parameters?: {
    width?: number
    height?: number
    widthSegments?: number
    heightSegments?: number
  } }).parameters
  const index = geometry.getIndex()
  const widthSegments = parameters?.widthSegments
  const heightSegments = parameters?.heightSegments
  const supported = !!index && !!parameters?.width && !!parameters.height
    && !!widthSegments && !!heightSegments
    && geometry.getAttribute('position').count === (widthSegments + 1) * (heightSegments + 1)
  const topology: TerrainPlaneTopology | null = supported ? {
    widthSegments: widthSegments!,
    heightSegments: heightSegments!,
    width: parameters!.width!,
    height: parameters!.height!,
    indices: index!.array,
  } : null
  terrainPlaneTopologyCache.set(geometry, topology)
  return topology
}

function markAttributeRows(
  attribute: THREE.BufferAttribute,
  columns: number,
  minColumn: number,
  maxColumn: number,
  minRow: number,
  maxRow: number,
): void {
  attribute.clearUpdateRanges()
  for (let row = minRow; row <= maxRow; row += 1) {
    const firstComponent = (row * columns + minColumn) * attribute.itemSize
    const componentCount = (maxColumn - minColumn + 1) * attribute.itemSize
    attribute.addUpdateRange(firstComponent, componentCount)
  }
  attribute.needsUpdate = true
}

function setTerrainBoundingSphere(
  geometry: THREE.BufferGeometry,
  topology: TerrainPlaneTopology,
  mesh: THREE.Mesh,
  offset: number,
): void {
  const centerHeight = (TERRAIN_MIN_H + TERRAIN_MAX_H) * 0.5 - mesh.position.y + offset
  const verticalRadius = (TERRAIN_MAX_H - TERRAIN_MIN_H) * 0.5
  const radius = Math.hypot(topology.width * 0.5, topology.height * 0.5, verticalRadius)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, centerHeight), radius)
}

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

export function createGardenTerrain(
  bindings: readonly TerrainMeshBinding[],
  getActiveBounds: () => GardenBounds = () => GARDEN_BOUNDS,
): GardenTerrain {
  let gridCols = Math.ceil((GARDEN_MAX_BOUNDS.halfWidth * 2 + 0.16) / TERRAIN_CELL) + 1
  let gridRows = Math.ceil((GARDEN_MAX_BOUNDS.halfDepth * 2 + 0.16) / TERRAIN_CELL) + 1
  // Center the preallocated field on the farm so its vertices align exactly
  // with the water field's cell centers and its full bounds cover max acreage.
  let gridOriginX = -((gridCols - 1) * TERRAIN_CELL) / 2
  let gridOriginZ = -((gridRows - 1) * TERRAIN_CELL) / 2
  let heights = new Float32Array(gridCols * gridRows)
  let outsideParcel = new Uint8Array(gridCols * gridRows)
  let queuedEdges = new Uint8Array(heights.length * 2)
  let edgeQueue = new Int32Array(queuedEdges.length)
  const initialBounds = getActiveBounds()
  let dirty = false
  let fullMeshDirty = true
  let dirtyMinGx = Infinity
  let dirtyMaxGx = -Infinity
  let dirtyMinGz = Infinity
  let dirtyMaxGz = -Infinity
  let parcelBoundsHalfWidth = 0
  let parcelBoundsHalfDepth = 0

  function gridX(x: number): number {
    return (x - gridOriginX) / TERRAIN_CELL
  }

  function gridZ(z: number): number {
    return (z - gridOriginZ) / TERRAIN_CELL
  }

  function clampX(index: number): number {
    return Math.min(gridCols - 1, Math.max(0, index))
  }

  function clampZ(index: number): number {
    return Math.min(gridRows - 1, Math.max(0, index))
  }

  /** Mark grid cells outside the active plot; those cells remain flat at grade. */
  function rebuildParcelMask(): void {
    const bounds = getActiveBounds()
    for (let gz = 0; gz < gridRows; gz += 1) {
      const worldZ = gridOriginZ + gz * TERRAIN_CELL
      const outsideZ = Math.abs(worldZ) > bounds.halfDepth
      const row = gz * gridCols
      for (let gx = 0; gx < gridCols; gx += 1) {
        const worldX = gridOriginX + gx * TERRAIN_CELL
        const index = row + gx
        const outside = outsideZ || Math.abs(worldX) > bounds.halfWidth
        outsideParcel[index] = outside ? 1 : 0
        if (outside) heights[index] = 0
      }
    }
  }

  /** True when the cell lies beyond the active garden bounds. */
  function isOutsideParcel(gx: number, gz: number): boolean {
    return outsideParcel[gz * gridCols + gx] === 1
  }

  function markCellChanged(gx: number, gz: number): void {
    dirty = true
    dirtyMinGx = Math.min(dirtyMinGx, gx)
    dirtyMaxGx = Math.max(dirtyMaxGx, gx)
    dirtyMinGz = Math.min(dirtyMinGz, gz)
    dirtyMaxGz = Math.max(dirtyMaxGz, gz)
  }

  function markIndexChanged(index: number): void {
    const gx = index % gridCols
    markCellChanged(gx, (index - gx) / gridCols)
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
    const h00 = heights[iz * gridCols + ix]
    const h10 = heights[iz * gridCols + jx]
    const h01 = heights[jz * gridCols + ix]
    const h11 = heights[jz * gridCols + jx]
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
  }

  function cellHeightAt(gx: number, gz: number): number {
    const ix = clampX(gx)
    const iz = clampZ(gz)
    return heights[iz * gridCols + ix]
  }

  /** Bring one neighbor pair within the slope limit; outside cells stay at grade. */
  function clampPair(index: number, neighbor: number, limit: number): number {
    const indexOutside = outsideParcel[index] === 1
    const neighborOutside = outsideParcel[neighbor] === 1
    if (indexOutside && neighborOutside) return 0
    if (indexOutside) return clampPair(neighbor, index, limit)
    const delta = heights[neighbor] - heights[index]
    const excess = Math.abs(delta) - limit
    // Float32 heights can otherwise cause tiny pair corrections to ping-pong
    // through the work queue without producing a meaningful terrain change.
    if (excess <= 1e-5) return 0
    const beforeIndex = heights[index]
    const beforeNeighbor = heights[neighbor]
    if (neighborOutside) {
      // The parcel edge meets flat surrounding ground; slope correction moves
      // only the in-plot cell, never creates a hidden bank outside the fence.
      if (delta > 0) {
        heights[index] += Math.min(excess, TERRAIN_MAX_H - heights[index])
      } else {
        heights[index] -= Math.max(0, Math.min(excess, heights[index] - terrainFloor()))
      }
    } else if (delta > 0) {
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
    if (heights[index] !== beforeIndex) markIndexChanged(index)
    if (heights[neighbor] !== beforeNeighbor) markIndexChanged(neighbor)
    return excess
  }

  /** Enforce |Δh| ≤ MAX_SLOPE × cell, revisiting only edges affected by a correction. */
  function clampSlope(minGx: number, maxGx: number, minGz: number, maxGz: number): void {
    const limit = TERRAIN_MAX_SLOPE * TERRAIN_CELL
    const fromGx = clampX(minGx)
    const toGx = clampX(maxGx)
    const fromGz = clampZ(minGz)
    const toGz = clampZ(maxGz)
    const seedFromGx = clampX(fromGx - CLAMP_SEED_PAD_CELLS)
    const seedToGx = clampX(toGx + CLAMP_SEED_PAD_CELLS)
    const seedFromGz = clampZ(fromGz - CLAMP_SEED_PAD_CELLS)
    const seedToGz = clampZ(toGz + CLAMP_SEED_PAD_CELLS)
    // At most one entry per edge is pending; reuse the field-sized ring buffer.
    const queue = edgeQueue
    let queueHead = 0
    let queueTail = 0
    let queueSize = 0

    function enqueueEdge(index: number, vertical: boolean): void {
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      if (vertical ? gz + 1 >= gridRows : gx + 1 >= gridCols) return
      const edge = index * 2 + (vertical ? 1 : 0)
      if (queuedEdges[edge]) return
      queuedEdges[edge] = 1
      queue[queueTail] = edge
      queueTail = (queueTail + 1) % queue.length
      queueSize += 1
    }

    function enqueueAround(index: number): void {
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      if (gx > 0) enqueueEdge(index - 1, false)
      enqueueEdge(index, false)
      if (gz > 0) enqueueEdge(index - gridCols, true)
      enqueueEdge(index, true)
    }

    // Seed edges only in the edited brush footprint plus its immediate rim.
    for (let gz = seedFromGz; gz <= seedToGz; gz += 1) {
      const row = gz * gridCols
      for (let gx = seedFromGx; gx <= seedToGx; gx += 1) {
        const index = row + gx
        enqueueEdge(index, false)
        enqueueEdge(index, true)
      }
    }

    while (queueSize > 0) {
      const edge = queue[queueHead]
      queueHead = (queueHead + 1) % queue.length
      queueSize -= 1
      queuedEdges[edge] = 0
      const index = Math.floor(edge / 2)
      const vertical = edge % 2 === 1
      const neighbor = index + (vertical ? gridCols : 1)
      const beforeIndex = heights[index]
      const beforeNeighbor = heights[neighbor]
      clampPair(index, neighbor, limit)
      if (heights[index] === beforeIndex && heights[neighbor] === beforeNeighbor) continue
      enqueueAround(index)
      enqueueAround(neighbor)
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
        const worldX = gridOriginX + gx * TERRAIN_CELL
        const worldZ = gridOriginZ + gz * TERRAIN_CELL
        const distance = Math.hypot(worldX - x, worldZ - z)
        if (distance > radius) continue
        // Full effect through the middle, easing out over the rim.
        const weight = 1 - smoothstep(0.6, 1, distance / radius)
        const effect = weight
        if (effect <= 0) continue
        const index = gz * gridCols + gx
        if (outsideParcel[index] === 1) continue
        const before = heights[index]
        const after = Math.min(TERRAIN_MAX_H, Math.max(TERRAIN_MIN_H, before + amount * effect))
        if (after === before) continue
        heights[index] = after
        markCellChanged(gx, gz)
        changed += 1
      }
    }
    if (changed > 0) {
      clampSlope(minGx - CLAMP_SEED_PAD_CELLS, maxGx + CLAMP_SEED_PAD_CELLS, minGz - CLAMP_SEED_PAD_CELLS, maxGz + CLAMP_SEED_PAD_CELLS)
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
        const worldX = gridOriginX + gx * TERRAIN_CELL
        const worldZ = gridOriginZ + gz * TERRAIN_CELL
        const distance = Math.hypot(worldX - x, worldZ - z)
        if (distance > radius) continue
        const weight = 1 - smoothstep(0.6, 1, distance / radius)
        if (weight <= 0) continue
        if (isOutsideParcel(gx, gz)) continue
        indices.push(gz * gridCols + gx)
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
        const gx = index % gridCols
        markCellChanged(gx, (index - gx) / gridCols)
        changed += 1
      }
    }
    if (changed > 0) {
      clampSlope(minGx - CLAMP_SEED_PAD_CELLS, maxGx + CLAMP_SEED_PAD_CELLS, minGz - CLAMP_SEED_PAD_CELLS, maxGz + CLAMP_SEED_PAD_CELLS)
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
        const index = gz * gridCols + gx
        const worldX = gridOriginX + gx * TERRAIN_CELL
        const worldZ = gridOriginZ + gz * TERRAIN_CELL
        const distance = Math.hypot(worldX - x, worldZ - z)
        if (distance > radius) continue
        const weight = 1 - smoothstep(0.6, 1, distance / radius)
        if (weight <= 0 || isOutsideParcel(gx, gz)) continue
        let sum = 0
        let count = 0
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = clampX(gx + dx)
            const nz = clampZ(gz + dz)
            sum += snapshot[nz * gridCols + nx]
            count += 1
          }
        }
        const target = sum / count
        const after = Math.min(TERRAIN_MAX_H, Math.max(TERRAIN_MIN_H, snapshot[index] + (target - snapshot[index]) * Math.min(1, strength * weight)))
        if (after !== snapshot[index]) {
          heights[index] = after
          markCellChanged(gx, gz)
          changed += 1
        }
      }
    }
    if (changed > 0) {
      clampSlope(minGx - CLAMP_SEED_PAD_CELLS, maxGx + CLAMP_SEED_PAD_CELLS, minGz - CLAMP_SEED_PAD_CELLS, maxGz + CLAMP_SEED_PAD_CELLS)
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

  function enableSoilVertexColors(mesh: THREE.Mesh): void {
    const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
    const standards = Array.isArray(material) ? material : [material]
    for (const standard of standards) {
      if (!standard.vertexColors) {
        standard.vertexColors = true
        standard.needsUpdate = true
      }
    }
  }

  function writeTerrainVertex(
    index: number,
    mesh: THREE.Mesh,
    offset: number,
    positions: THREE.BufferAttribute,
    colors: THREE.BufferAttribute | null,
    bandRatio: THREE.Vector3,
  ): boolean {
    const worldX = positions.getX(index)
    const worldZ = -positions.getY(index)
    const height = heightAt(worldX, worldZ)
    const localHeight = height - mesh.position.y + offset
    const changed = positions.getZ(index) !== localHeight
    positions.setZ(index, localHeight)
    if (colors) {
      soilBandColor(-height, bandRatio)
      colors.setXYZ(index, bandRatio.x, bandRatio.y, bandRatio.z)
    }
    return changed
  }

  /** Rebuild normals only for the grid cells touching changed terrain vertices. */
  function updatePlaneNormals(
    topology: TerrainPlaneTopology,
    positions: THREE.BufferAttribute,
    normals: THREE.BufferAttribute,
    changedVertices: readonly number[],
  ): { minColumn: number; maxColumn: number; minRow: number; maxRow: number } | null {
    const columns = topology.widthSegments + 1
    const targets = new Set<number>()
    let minColumn = topology.widthSegments
    let maxColumn = 0
    let minRow = topology.heightSegments
    let maxRow = 0
    for (const index of changedVertices) {
      const column = index % columns
      const row = Math.floor(index / columns)
      for (let targetRow = Math.max(0, row - 1); targetRow <= Math.min(topology.heightSegments, row + 1); targetRow += 1) {
        for (let targetColumn = Math.max(0, column - 1); targetColumn <= Math.min(topology.widthSegments, column + 1); targetColumn += 1) {
          const target = targetRow * columns + targetColumn
          targets.add(target)
          minColumn = Math.min(minColumn, targetColumn)
          maxColumn = Math.max(maxColumn, targetColumn)
          minRow = Math.min(minRow, targetRow)
          maxRow = Math.max(maxRow, targetRow)
        }
      }
    }
    if (!targets.size) return null

    const indexAttribute = topology.indices
    const positionArray = positions.array as ArrayLike<number>
    const normal = new THREE.Vector3()
    for (const target of targets) {
      const targetColumn = target % columns
      const targetRow = Math.floor(target / columns)
      let nx = 0
      let ny = 0
      let nz = 0
      for (let row = Math.max(0, targetRow - 1); row <= Math.min(topology.heightSegments - 1, targetRow); row += 1) {
        for (let column = Math.max(0, targetColumn - 1); column <= Math.min(topology.widthSegments - 1, targetColumn); column += 1) {
          const faceStart = (row * topology.widthSegments + column) * 6
          for (let triangle = 0; triangle < 2; triangle += 1) {
            const face = faceStart + triangle * 3
            const a = indexAttribute[face]
            const b = indexAttribute[face + 1]
            const c = indexAttribute[face + 2]
            if (a !== target && b !== target && c !== target) continue
            const ai = a * 3
            const bi = b * 3
            const ci = c * 3
            const cbx = positionArray[ci] - positionArray[bi]
            const cby = positionArray[ci + 1] - positionArray[bi + 1]
            const cbz = positionArray[ci + 2] - positionArray[bi + 2]
            const abx = positionArray[ai] - positionArray[bi]
            const aby = positionArray[ai + 1] - positionArray[bi + 1]
            const abz = positionArray[ai + 2] - positionArray[bi + 2]
            nx += cby * abz - cbz * aby
            ny += cbz * abx - cbx * abz
            nz += cbx * aby - cby * abx
          }
        }
      }
      normal.set(nx, ny, nz).normalize()
      normals.setXYZ(target, normal.x, normal.y, normal.z)
    }
    return { minColumn, maxColumn, minRow, maxRow }
  }

  function applyFullToMesh(
    mesh: THREE.Mesh,
    offset: number,
    colors: THREE.BufferAttribute | null,
    topology: TerrainPlaneTopology | null,
  ): void {
    const geometry = mesh.geometry
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const bandRatio = new THREE.Vector3()
    for (let index = 0; index < positions.count; index += 1) {
      writeTerrainVertex(index, mesh, offset, positions, colors, bandRatio)
    }
    positions.clearUpdateRanges()
    positions.needsUpdate = true
    if (colors) {
      colors.clearUpdateRanges()
      colors.needsUpdate = true
    }
    geometry.computeVertexNormals()
    if (topology) setTerrainBoundingSphere(geometry, topology, mesh, offset)
    else geometry.computeBoundingSphere()
  }

  function applyPartialPlaneToMesh(
    mesh: THREE.Mesh,
    offset: number,
    colors: THREE.BufferAttribute | null,
    topology: TerrainPlaneTopology,
    minWorldX: number,
    maxWorldX: number,
    minWorldZ: number,
    maxWorldZ: number,
  ): void {
    const geometry = mesh.geometry
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const normals = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
    if (!normals) {
      applyFullToMesh(mesh, offset, colors, topology)
      return
    }
    const columns = topology.widthSegments + 1
    const minColumn = Math.max(0, Math.floor((minWorldX + topology.width * 0.5) * topology.widthSegments / topology.width) - 2)
    const maxColumn = Math.min(topology.widthSegments, Math.ceil((maxWorldX + topology.width * 0.5) * topology.widthSegments / topology.width) + 2)
    const minRow = Math.max(0, Math.floor((minWorldZ + topology.height * 0.5) * topology.heightSegments / topology.height) - 2)
    const maxRow = Math.min(topology.heightSegments, Math.ceil((maxWorldZ + topology.height * 0.5) * topology.heightSegments / topology.height) + 2)
    const changedVertices: number[] = []
    const bandRatio = new THREE.Vector3()
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const index = row * columns + column
        const worldX = positions.getX(index)
        const worldZ = -positions.getY(index)
        if (worldX < minWorldX - 1e-5 || worldX > maxWorldX + 1e-5
          || worldZ < minWorldZ - 1e-5 || worldZ > maxWorldZ + 1e-5) continue
        if (writeTerrainVertex(index, mesh, offset, positions, colors, bandRatio)) changedVertices.push(index)
      }
    }
    if (!changedVertices.length) return
    const normalRange = updatePlaneNormals(topology, positions, normals, changedVertices)
    markAttributeRows(positions, columns, minColumn, maxColumn, minRow, maxRow)
    if (colors) markAttributeRows(colors, columns, minColumn, maxColumn, minRow, maxRow)
    if (normalRange) markAttributeRows(normals, columns, normalRange.minColumn, normalRange.maxColumn, normalRange.minRow, normalRange.maxRow)
  }

  /** Re-derive mesh vertices from the grid; local +z maps to world height. */
  function applyToMeshes(forceFull = false): void {
    if (!dirty && !fullMeshDirty && !forceFull) return
    const fullUpdate = fullMeshDirty || forceFull
    const changedWorldBounds = fullUpdate ? null : {
      minX: gridOriginX + dirtyMinGx * TERRAIN_CELL,
      maxX: gridOriginX + dirtyMaxGx * TERRAIN_CELL,
      minZ: gridOriginZ + dirtyMinGz * TERRAIN_CELL,
      maxZ: gridOriginZ + dirtyMaxGz * TERRAIN_CELL,
    }
    for (const binding of bindings) {
      const mesh = binding.mesh
      const geometry = mesh.geometry
      const offset = binding.offset ?? 0
      const colors = binding.soilRings ? soilColorsAt(geometry) : null
      if (colors) enableSoilVertexColors(mesh)
      const topology = terrainPlaneTopology(geometry)
      if (fullUpdate || !topology) {
        applyFullToMesh(mesh, offset, colors, topology)
      } else {
        if (changedWorldBounds) {
          applyPartialPlaneToMesh(mesh, offset, colors, topology,
            changedWorldBounds.minX - TERRAIN_MESH_DIRTY_PAD, changedWorldBounds.maxX + TERRAIN_MESH_DIRTY_PAD,
            changedWorldBounds.minZ - TERRAIN_MESH_DIRTY_PAD, changedWorldBounds.maxZ + TERRAIN_MESH_DIRTY_PAD)
        }
      }
    }
    dirty = false
    fullMeshDirty = false
    dirtyMinGx = Infinity
    dirtyMaxGx = -Infinity
    dirtyMinGz = Infinity
    dirtyMaxGz = -Infinity
  }

  function clear(): void {
    heights.fill(0)
    rebuildParcelMask()
    dirty = true
    fullMeshDirty = true
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
      const gx = index % gridCols
      const gz = (index - gx) / gridCols
      if (gx + 1 < gridCols) maxNeighborDelta = Math.max(maxNeighborDelta, Math.abs(heights[index + 1] - value))
      if (gz + 1 < gridRows) maxNeighborDelta = Math.max(maxNeighborDelta, Math.abs(heights[index + gridCols] - value))
    }
    return { min, max, changedCells, depthBands: bands.size, maxNeighborDelta: +maxNeighborDelta.toFixed(3) }
  }

  /**
   * Update the editable parcel mask after a bounds change. Expansions reveal
   * only the newly admitted rows and columns; returns true when bounds moved so
   * the caller can re-solve water against the new grade edge.
   */
  function syncBounds(): boolean {
    const bounds = getActiveBounds()
    if (bounds.halfWidth === parcelBoundsHalfWidth && bounds.halfDepth === parcelBoundsHalfDepth) return false
    const previousHalfWidth = parcelBoundsHalfWidth
    const previousHalfDepth = parcelBoundsHalfDepth
    const widthOnlyExpands = bounds.halfWidth >= previousHalfWidth
    const depthOnlyExpands = bounds.halfDepth >= previousHalfDepth
    const onlyExpanding = widthOnlyExpands && depthOnlyExpands
    parcelBoundsHalfWidth = bounds.halfWidth
    parcelBoundsHalfDepth = bounds.halfDepth
    let gridResized = false
    if (bounds.halfWidth > (gridCols - 1) * TERRAIN_CELL / 2 - 0.08
      || bounds.halfDepth > (gridRows - 1) * TERRAIN_CELL / 2 - 0.08) {
      gridResized = true
      const previous = { cols: gridCols, rows: gridRows, originX: gridOriginX, originZ: gridOriginZ, heights }
      gridCols = Math.max(gridCols, Math.ceil((bounds.halfWidth * 2 + 0.16) / TERRAIN_CELL) + 1)
      gridRows = Math.max(gridRows, Math.ceil((bounds.halfDepth * 2 + 0.16) / TERRAIN_CELL) + 1)
      gridOriginX = -(gridCols - 1) * TERRAIN_CELL / 2
      gridOriginZ = -(gridRows - 1) * TERRAIN_CELL / 2
      heights = new Float32Array(gridCols * gridRows)
      outsideParcel = new Uint8Array(gridCols * gridRows)
      queuedEdges = new Uint8Array(gridCols * gridRows * 2)
      edgeQueue = new Int32Array(queuedEdges.length)
      for (let gz = 0; gz < gridRows; gz += 1) {
        const z = gridOriginZ + gz * TERRAIN_CELL
        const oldZ = (z - previous.originZ) / TERRAIN_CELL
        const z0 = Math.max(0, Math.min(previous.rows - 1, Math.floor(oldZ)))
        const z1 = Math.min(previous.rows - 1, z0 + 1)
        const tz = Math.max(0, Math.min(1, oldZ - z0))
        for (let gx = 0; gx < gridCols; gx += 1) {
          const x = gridOriginX + gx * TERRAIN_CELL
          const oldX = (x - previous.originX) / TERRAIN_CELL
          const x0 = Math.max(0, Math.min(previous.cols - 1, Math.floor(oldX)))
          const x1 = Math.min(previous.cols - 1, x0 + 1)
          const tx = Math.max(0, Math.min(1, oldX - x0))
          const a = previous.heights[z0 * previous.cols + x0] * (1 - tx) + previous.heights[z0 * previous.cols + x1] * tx
          const b = previous.heights[z1 * previous.cols + x0] * (1 - tx) + previous.heights[z1 * previous.cols + x1] * tx
          heights[gz * gridCols + gx] = a * (1 - tz) + b * tz
        }
      }
    }
    if (gridResized) {
      // Resizing is a rare fallback beyond the preallocated progression grid;
      // rebuild the full mask so newly allocated cells outside the current
      // parcel cannot accidentally become editable.
      rebuildParcelMask()
      clampSlope(0, gridCols - 1, 0, gridRows - 1)
      dirty = true
      fullMeshDirty = true
      return true
    }
    if (onlyExpanding) {
      // Reveal only newly editable rows/columns. Newly admitted cells were held
      // at grade while outside, so they need neither slope propagation nor a
      // full-height-field scan. Expansion animates this mask each frame.
      const widthColumns: number[] = []
      for (let gx = 0; gx < gridCols; gx += 1) {
        const x = gridOriginX + gx * TERRAIN_CELL
        if (Math.abs(x) > previousHalfWidth && Math.abs(x) <= bounds.halfWidth) widthColumns.push(gx)
      }
      const depthRows: number[] = []
      for (let gz = 0; gz < gridRows; gz += 1) {
        const z = gridOriginZ + gz * TERRAIN_CELL
        if (Math.abs(z) > previousHalfDepth && Math.abs(z) <= bounds.halfDepth) depthRows.push(gz)
      }
      for (let gz = 0; gz < gridRows; gz += 1) {
        const z = gridOriginZ + gz * TERRAIN_CELL
        if (Math.abs(z) > bounds.halfDepth) continue
        const row = gz * gridCols
        for (const gx of widthColumns) outsideParcel[row + gx] = 0
      }
      for (const gz of depthRows) {
        const row = gz * gridCols
        for (let gx = 0; gx < gridCols; gx += 1) {
          const x = gridOriginX + gx * TERRAIN_CELL
          if (Math.abs(x) <= bounds.halfWidth) outsideParcel[row + gx] = 0
        }
      }
      return true
    }
    rebuildParcelMask()
    clampSlope(0, gridCols - 1, 0, gridRows - 1)
    dirty = true
    fullMeshDirty = true
    return true
  }

  parcelBoundsHalfWidth = initialBounds.halfWidth
  parcelBoundsHalfDepth = initialBounds.halfDepth
  rebuildParcelMask()
  // Ground outside the startup parcel is immutable at grade. Keep the first
  // editable row level too, so a flat edge pour drains cleanly and dug corner
  // basins remain held only by their intentionally shaped terrain.
  for (let gz = 0; gz < gridRows; gz += 1) {
    for (let gx = 0; gx < gridCols; gx += 1) {
      const index = gz * gridCols + gx
      if (outsideParcel[index] === 1) continue
      const nextOutside = gx + 1 < gridCols && outsideParcel[index + 1] === 1
      const belowOutside = gz + 1 < gridRows && outsideParcel[index + gridCols] === 1
      if (nextOutside || belowOutside) heights[index] = 0
    }
  }
  clampSlope(0, gridCols - 1, 0, gridRows - 1)

  return {
    cellSize: TERRAIN_CELL,
    get gridCols() { return gridCols },
    get gridRows() { return gridRows },
    get originX() { return gridOriginX },
    get originZ() { return gridOriginZ },
    heightAt,
    cellHeightAt,
    splat,
    smooth,
    level,
    applyToMeshes,
    syncBounds,
    get dirty() {
      return dirty
    },
    clear,
    clearSoilBandColors: resetSoilBandColors,
    stats,
  }
}
