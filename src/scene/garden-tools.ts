import * as THREE from 'three'
import { containsGardenPoint, GARDEN_BOUNDS, GARDEN_LAWN_Y, GARDEN_MAX_BOUNDS } from './fairground'
import type { GardenBounds } from '../game/farm-expansion'
import { createGardenToolModel, GARDEN_TOOLS, type GardenToolId } from './garden-tool-art'
import type { GardenTerrain } from './garden-terrain'

export interface GardenPointerMove {
  readonly clientX: number
  readonly clientY: number
}

export interface GardenPointerDown extends GardenPointerMove {
  readonly button: number
}

export interface GardenToolDebugState {
  readonly selectedTool: GardenToolId
  readonly cursorVisible: boolean
  readonly cursor: { readonly x: number; readonly y: number; readonly z: number } | null
  readonly isPointerDown: boolean
  readonly holdSeconds: number
  readonly activeAction: 'grow' | 'trim' | 'dig' | 'smooth' | null
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
  readonly dirtPiles: number
  readonly carryingDirt: boolean
  readonly terrainMin: number
  readonly terrainMax: number
  readonly pilePositions: readonly { readonly x: number; readonly z: number }[]
}

export interface GardenTools {
  readonly root: THREE.Group
  readonly selectedTool: GardenToolId
  selectTool(id: GardenToolId): void
  cycleBrushSize(): void
  pointerMove(event: GardenPointerMove): void
  pointerDown(event: GardenPointerDown): boolean
  pointerUp(): void
  pointerLeave(): void
  handleContextMenu(event: MouseEvent): boolean
  debugState(): GardenToolDebugState
  pickReport(clientX: number, clientY: number): unknown
  clearGrass(): void
  update(deltaSeconds: number): void
  dispose(): void
}

interface GrassBlade {
  readonly x: number
  readonly z: number
  readonly tileIndex: number
  mesh: THREE.InstancedMesh
  height: number
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
const MAX_BLADE_HEIGHT = 0.72
// Base growth eased by remaining height (sqrt ease-out): a held patch rockets
// up quickly and settles into the cap — full height in about two seconds.
const BLADE_GROWTH_PER_SECOND = 0.7
const LAWN_UNGREEN_PER_SECOND = 0.34
const ACTION_INTERVAL = 0.08
const LAWN_VERTEX_SPACING = 0.58
const GRASS_STROKE_SPACING = 0.34
const GROW_PAINT_FACTOR = 1.06
const TRIM_PAINT_FACTOR = 0.9
// Shovel: dirt is conserved — digging spawns piles, depositing them raises the
// ground by roughly what the dig removed. Slope clamps in garden-terrain keep
// every result walkable.
const DIG_PILE_RADIUS_FACTOR = 0.8
const DIG_DEPTH = -0.2
const DEPOSIT_RISE = 0.2
const DIG_FIRST_PILE_SECONDS = 0.35
const DIG_PILE_INTERVAL = 0.95
const SMOOTH_STRENGTH = 0.35
const MAX_DIRT_PILES = 12
const GROUND_GREEN = new THREE.Color('#6db254')
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

interface DirtPile {
  readonly group: THREE.Group
  x: number
  z: number
}

export function createGardenTools(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  lawn: THREE.Mesh,
  terrain: GardenTerrain,
  getActiveBounds: () => GardenBounds = () => GARDEN_BOUNDS,
): GardenTools {
  // The painted ring IS the cursor inside the garden; the OS arrow would just
  // clutter the meadow scene. Restore the system pointer outside the plot.
  canvas.style.cursor = ''
  const root = new THREE.Group()
  root.name = 'Grass seeder and garden brush cursor'
  root.add(lawn)

  const grassGeometry = makeGrassGeometry()
  const grassMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.84, metalness: 0.01 })
  const grassGroup = new THREE.Group()
  grassGroup.name = 'Hand-painted grass · spatially batched instancing'
  root.add(grassGroup)
  const lawnGeometry = lawn.geometry
  const lawnPositions = lawnGeometry.getAttribute('position') as THREE.BufferAttribute
  const lawnColors = lawnGeometry.getAttribute('color') as THREE.BufferAttribute
  const groundCoverage = new Float32Array(lawnColors.count)
  const lawnVertices = Array.from({ length: lawnPositions.count }, (_, index) => ({
    index,
    x: lawnPositions.getX(index),
    z: -lawnPositions.getY(index),
  }))
  const lawnCoverageLookup = new Map<string, number[]>()
  for (const vertex of lawnVertices) {
    const cellX = Math.floor(vertex.x / LAWN_VERTEX_SPACING)
    const cellZ = Math.floor(vertex.z / LAWN_VERTEX_SPACING)
    const key = `${cellX},${cellZ}`
    let cell = lawnCoverageLookup.get(key)
    if (!cell) {
      cell = []
      lawnCoverageLookup.set(key, cell)
    }
    cell.push(vertex.index)
  }
  const batches = new Map<string, GrassBatch>()
  const occupancy = new Map<string, GrassBlade[]>()
  let random = seededRandom(GRASS_RANDOM_SEED)
  const dummy = new THREE.Object3D()
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const cursor = new THREE.Group()
  const toolModels: Record<GardenToolId, THREE.Group> = {
    grass: createGardenToolModel('grass'),
    shovel: createGardenToolModel('shovel'),
  }
  let selectedTool: GardenToolId = 'grass'
  const brushLevels = new Map<GardenToolId, number>()
  let sizePop = 0
  const SIZE_POP_SECONDS = 0.28
  let tallestBladeHeight = 0

  function brushLevelIndex(): number {
    return brushLevels.get(selectedTool) ?? 1
  }

  function brushRadius(): number {
    return BRUSH_RADIUS * BRUSH_SIZE_LEVELS[brushLevelIndex()]
  }

  // Seed counts scale with the brush's area so density per square meter stays
  // constant across sizes.
  function stampBladeCount(base: number): number {
    return Math.max(4, Math.round(base * BRUSH_SIZE_LEVELS[brushLevelIndex()] ** 2))
  }

  let cursorVisible = false
  let isPointerDown = false
  let activeAction: 'grow' | 'trim' | 'dig' | 'smooth' | null = null
  let lastPaintPoint: THREE.Vector3 | null = null
  let lastSeedPoint: THREE.Vector3 | null = null
  let hoverTint: string | null = null
  let paintTimer = 0
  let actionAccumulator = 0
  let lastPaintDuration = 0
  let totalGrassBlades = 0
  let trimmedBlades = 0
  let greenGroundVertices = 0
  let grassCapacity = 0
  let digTimer = 0

  // --- Dirt piles (shovel) -----------------------------------------------
  const piles: DirtPile[] = []
  let carrying: DirtPile | null = null
  let nextPileIn = DIG_FIRST_PILE_SECONDS
  const pileGroup = new THREE.Group()
  pileGroup.name = 'Dug dirt piles'
  root.add(pileGroup)
  const pileMaterial = new THREE.MeshStandardMaterial({ color: '#8a6a49', roughness: 0.95 })
  const pileDarkMaterial = new THREE.MeshStandardMaterial({ color: '#6f5439', roughness: 0.98 })

  // Separate RNG so pile clods never perturb the deterministic grass layout.
  const pileRandom = seededRandom(918273)

  function createPileVisual(): THREE.Group {
    const group = new THREE.Group()
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), pileMaterial)
    mound.scale.set(1, 0.55, 1)
    mound.castShadow = true
    mound.receiveShadow = true
    group.add(mound)
    for (let index = 0; index < 5; index += 1) {
      const angle = pileRandom() * Math.PI * 2
      const clod = new THREE.Mesh(new THREE.SphereGeometry(0.05 + pileRandom() * 0.05, 8, 6), pileDarkMaterial)
      clod.position.set(Math.cos(angle) * (0.1 + pileRandom() * 0.2), 0.06 + pileRandom() * 0.08, Math.sin(angle) * (0.1 + pileRandom() * 0.2))
      clod.castShadow = true
      group.add(clod)
    }
    return group
  }

  function spawnPile(x: number, z: number): DirtPile {
    const pile: DirtPile = { group: createPileVisual(), x, z }
    pile.group.name = 'Dirt pile'
    pile.group.position.set(x, GARDEN_LAWN_Y + terrain.heightAt(x, z) + 0.1, z)
    pileGroup.add(pile.group)
    piles.push(pile)
    // Abandoned-pile guardrail: the oldest pile settles back into the ground.
    if (piles.length > MAX_DIRT_PILES) {
      const oldest = piles.shift()
      if (oldest && oldest !== carrying) {
        terrain.splat(oldest.x, oldest.z, brushRadius() * DIG_PILE_RADIUS_FACTOR, DEPOSIT_RISE)
        pileGroup.remove(oldest.group)
      }
    }
    return pile
  }

  function pileUnderCursor(): DirtPile | null {
    const hits = raycaster.intersectObjects(pileGroup.children, true)
    if (!hits.length) return null
    let object: THREE.Object3D | null = hits[0].object
    while (object && object.parent !== pileGroup) object = object.parent
    return piles.find((pile) => pile.group === object) ?? null
  }

  function pickUpPile(pile: DirtPile): void {
    carrying = pile
    pile.group.visible = false
    const load = toolModels.shovel.getObjectByName('Shovel dirt load')
    if (load) load.visible = true
  }

  function returnCarriedPile(): void {
    // Dropping mid-carry returns the pile where it was picked up.
    if (!carrying) return
    carrying.group.visible = true
    carrying.group.position.set(carrying.x, GARDEN_LAWN_Y + terrain.heightAt(carrying.x, carrying.z) + 0.1, carrying.z)
    carrying = null
    const load = toolModels.shovel.getObjectByName('Shovel dirt load')
    if (load) load.visible = false
  }

  function depositCarriedPile(x: number, z: number): void {
    if (!carrying) return
    terrain.splat(x, z, brushRadius() * DIG_PILE_RADIUS_FACTOR, DEPOSIT_RISE)
    afterTerrainEdit(x, z, brushRadius() * DIG_PILE_RADIUS_FACTOR)
    pileGroup.remove(carrying.group)
    piles.splice(piles.indexOf(carrying), 1)
    carrying = null
    const load = toolModels.shovel.getObjectByName('Shovel dirt load')
    if (load) load.visible = false
  }

  /** Blades and painted ground must follow the deformed surface. */
  function afterTerrainEdit(x: number, z: number, radius: number): void {
    reprojectGrass(x, z, radius + 0.5)
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
  toolModels.grass.visible = true

  function pointerRay(event: GardenPointerMove): boolean {
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return false
    ndc.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    return true
  }

  function floorPosition(): THREE.Vector3 | null {
    return raycaster.intersectObject(lawn, false)[0]?.point ?? null
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

          // Plateau of full green through most of the disc, easing out only at the
          // rim so the painted lawn blends into the surrounding dirt smoothly.
          const weight = 1 - THREE.MathUtils.smoothstep(Math.sqrt(distanceSquared) / radius, 0.6, 1)
          const before = groundCoverage[vertexIndex]
          const after = THREE.MathUtils.clamp(before + amount * weight, 0, 1)
          if (after === before) continue
          if (before <= 0.05 && after > 0.05) greenGroundVertices += 1
          else if (before > 0.05 && after <= 0.05) greenGroundVertices -= 1
          groundCoverage[vertexIndex] = after
          // RGBA paint layer: rgb is ALWAYS the full grass tint — alpha alone
          // fades the edge. Lerping rgb from white here would leave a pale
          // semi-transparent halo where coverage is partial (paint and trim).
          lawnColors.setXYZW(vertexIndex, GROUND_GREEN.r, GROUND_GREEN.g, GROUND_GREEN.b, after)
          changes += 1
        }
      }
    }
    if (changes > 0) lawnColors.needsUpdate = true
    return changes
  }


  function createBatch(tileX: number, tileZ: number, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, capacity)
    mesh.name = `Hand-seeded grass tile ${tileX},${tileZ}`
    mesh.count = 0
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.frustumCulled = true
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
      const color = GRASS_COLOR_VALUES[Math.floor(random() * GRASS_COLOR_VALUES.length)]
      dummy.position.set(xPos, GARDEN_LAWN_Y + 0.009, zPos)
      dummy.rotation.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.12)
      dummy.scale.set(width, height, width)
      dummy.updateMatrix()
      batch.mesh.setMatrixAt(tileIndex, dummy.matrix)
      batch.mesh.setColorAt(tileIndex, color)
      batch.mesh.count = tileIndex + 1
      const blade = { x: xPos, z: zPos, tileIndex, mesh: batch.mesh, height }
      batch.blades.push(blade)
      cell.push(blade)
      updatedBatches.add(batch)
      totalGrassBlades += 1
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
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const cell = occupancy.get(`${cellX},${cellZ}`)
        if (!cell) continue
        for (const blade of cell) {
          const distanceSquared = (x - blade.x) ** 2 + (z - blade.z) ** 2
          if (distanceSquared > radiusSquared || blade.height >= MAX_BLADE_HEIGHT) continue
          const influence = 1 - Math.sqrt(distanceSquared) / radius
          // Non-linear: rate ∝ remaining height (sqrt ease-out), so blades shoot
          // up early and ease into the cap instead of creeping linearly.
          const remaining = Math.max(0, (MAX_BLADE_HEIGHT - blade.height) / (MAX_BLADE_HEIGHT - STARTING_BLADE_HEIGHT))
          const growth = BLADE_GROWTH_PER_SECOND * deltaSeconds * Math.sqrt(remaining) * (0.6 + 0.4 * influence)
          const height = Math.min(MAX_BLADE_HEIGHT, blade.height + growth)
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
          const progress = Math.min(1, blade.height / (MAX_BLADE_HEIGHT - STARTING_BLADE_HEIGHT))
          const shrink = BLADE_GROWTH_PER_SECOND * 1.35 * deltaSeconds * Math.sqrt(progress) * (0.6 + 0.4 * influence)
          const height = Math.max(0, blade.height - shrink)
          blade.mesh.getMatrixAt(blade.tileIndex, matrix)
          matrix.decompose(position, rotation, scale)
          if (height <= 0.0005) {
            // Fully shrunk: hide the instance and free its spot for reseeding.
            scale.setScalar(0.0001)
            blade.height = 0
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
      canvas.style.cursor = ''
      return null
    }
    const position = floorPosition()
    if (!position || !insideGarden(position.x, position.z, getActiveBounds())) {
      cursor.visible = false
      cursorVisible = false
      actionGlow.visible = false
      canvas.style.cursor = ''
      return null
    }
    cursorVisible = true
    canvas.style.cursor = 'none'
    cursor.position.set(position.x, position.y + 0.008, position.z)
    cursor.scale.setScalar(brushRadius())
    toolModels[selectedTool].scale.setScalar(1 / brushRadius())
    cursor.visible = true
    return position
  }

  function clearGrass(): void {
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
    for (let index = 0; index < lawnColors.count; index += 1) {
      lawnColors.setXYZW(index, 1, 1, 1, 0)
    }
    lawnColors.needsUpdate = true
    tallestBladeHeight = 0
    returnCarriedPile()
    for (const pile of piles.splice(0, piles.length)) pileGroup.remove(pile.group)
    terrain.clear()
  }

  function dispose(): void {
    isPointerDown = false
    const geometries = new Set<THREE.BufferGeometry>([grassGeometry])
    const materials = new Set<THREE.Material>([grassMaterial])
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
    get selectedTool(): GardenToolId { return selectedTool },
    selectTool(id): void {
      if (!GARDEN_TOOLS.some((tool) => tool.id === id)) return
      if (selectedTool === id) return
      // Leaving the shovel mid-carry returns the pile to its spot untouched.
      if (selectedTool === 'shovel') returnCarriedPile()
      selectedTool = id
      for (const [key, model] of Object.entries(toolModels)) model.visible = key === id
    },
    cycleBrushSize(): void {
      brushLevels.set(selectedTool, (brushLevelIndex() + 1) % BRUSH_SIZE_LEVELS.length)
      sizePop = SIZE_POP_SECONDS
    },
    pointerMove(event): void {
      const position = updateCursorPosition(event)
      if (!position) {
        lastPaintPoint = null
        lastSeedPoint = null
        return
      }
      if (selectedTool === 'shovel') {
        // Digging and smoothing follow the pointer continuously; deposits are
        // click-actions handled in pointerDown.
        if (activeAction === 'dig' || activeAction === 'smooth') lastSeedPoint = position.clone()
        hoverTint = carrying ? '#e8c78f' : '#d9a06b'
        return
      }
      // Moving while growing drags a seed trail: each stamp greens the ground and
      // plants a light sprinkle of short blades. Height only accumulates where the
      // brush lingers (see update), so dragging leaves short grass, not tall.
      if (isPointerDown && activeAction === 'grow') {
        const spacing = Math.max(GRASS_STROKE_SPACING, brushRadius() * 0.3)
        if (!lastPaintPoint || lastPaintPoint.distanceTo(position) >= spacing) {
          lastPaintPoint = position.clone()
          lastSeedPoint = position.clone()
          updateLawnCoverage(position.x, position.z, brushRadius() * GROW_PAINT_FACTOR, 1.05)
          addGrass(position.x, position.z, brushRadius() * 0.88, stampBladeCount(MIN_SEED_BLADES))
        }
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
      if (event.button !== 0 && event.button !== 2) return false
      const position = updateCursorPosition(event)
      if (!position) return false
      if (selectedTool === 'shovel') {
        isPointerDown = true
        lastPaintPoint = position.clone()
        lastSeedPoint = position.clone()
        paintTimer = 0
        actionAccumulator = 0
        lastPaintDuration = 0
        if (event.button === 0) {
          if (carrying) {
            depositCarriedPile(position.x, position.z)
            return true
          }
          const pile = pileUnderCursor()
          if (pile) {
            pickUpPile(pile)
            return true
          }
          activeAction = 'dig'
          digTimer = 0
          nextPileIn = DIG_FIRST_PILE_SECONDS
        } else {
          activeAction = 'smooth'
        }
        return true
      }
      activeAction = event.button === 0 ? 'grow' : 'trim'
      isPointerDown = true
      lastPaintPoint = position.clone()
      lastSeedPoint = position.clone()
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
      isPointerDown = false
      activeAction = null
      lastPaintPoint = null
      paintTimer = 0
      actionAccumulator = 0
    },
    pointerLeave(): void {
      cursor.visible = false
      cursorVisible = false
      actionGlow.visible = false
      canvas.style.cursor = ''
      if (!isPointerDown) return
      // The pointer left the garden mid-stroke: pause painting until it returns.
      lastSeedPoint = null
      lastPaintPoint = null
    },
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
        dirtPiles: piles.length,
        carryingDirt: carrying !== null,
        terrainMin: terrain.stats().min,
        terrainMax: terrain.stats().max,
        pilePositions: piles.map((pile) => ({ x: +pile.x.toFixed(2), z: +pile.z.toFixed(2) })),
      }
    },
    clearGrass,
    update(deltaSeconds): void {
      if (isPointerDown && cursorVisible && activeAction && lastSeedPoint) {
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
            terrain.splat(x, z, brushRadius() * DIG_PILE_RADIUS_FACTOR, DIG_DEPTH * ACTION_INTERVAL)
          } else if (activeAction === 'smooth') {
            terrain.smooth(x, z, brushRadius(), SMOOTH_STRENGTH * ACTION_INTERVAL)
          }
        }
        if (activeAction === 'dig') {
          digTimer += deltaSeconds
          if (digTimer >= nextPileIn) {
            // Piles appear at the hole's rim, never under the cursor, so a
            // re-press keeps digging instead of picking the new pile up.
            const rimAngle = pileRandom() * Math.PI * 2
            const rimDistance = brushRadius() * DIG_PILE_RADIUS_FACTOR * 1.15
            spawnPile(
              lastSeedPoint.x + Math.cos(rimAngle) * rimDistance,
              lastSeedPoint.z + Math.sin(rimAngle) * rimDistance,
            )
            digTimer = 0
            nextPileIn = DIG_PILE_INTERVAL
          }
        }
      }
      if (terrain.dirty) terrain.applyToMeshes()
      const time = performance.now() * 0.001
      sizePop = Math.max(0, sizePop - deltaSeconds)
      const popGlow = sizePop > 0 ? Math.sin((sizePop / SIZE_POP_SECONDS) * Math.PI) : 0
      const popScale = 1 + popGlow * 0.16
      const pulse = isPointerDown ? 0.5 + 0.5 * Math.sin(time * 8.5) : 0.5 + 0.5 * Math.sin(time * 2.2)
      const pulseAmount = isPointerDown ? 0.12 + pulse * 0.12 : pulse * 0.025
      cursor.scale.setScalar(brushRadius() * (1 + pulseAmount) * popScale)
      outerMaterial.emissiveIntensity = isPointerDown ? 0.32 + pulse * 0.72 : 0.11 + pulse * 0.12
      innerMaterial.emissiveIntensity = isPointerDown ? 0.22 + pulse * 0.58 : 0.12 + pulse * 0.12
      const glowMaterial = actionGlow.material as THREE.MeshBasicMaterial
      actionGlow.visible = cursorVisible && (isPointerDown || popGlow > 0)
      actionGlow.scale.setScalar(1 + pulse * 0.18 + popGlow * 0.12)
      glowMaterial.opacity = actionGlow.visible ? (isPointerDown ? 0.18 + pulse * 0.24 : 0) + popGlow * 0.32 : 0
      glowMaterial.color.set(activeAction === 'trim' ? '#f3aa7b'
        : activeAction === 'grow' ? '#c2efa0'
        : activeAction === 'dig' ? '#e0b080'
        : activeAction === 'smooth' ? '#cfe4ee'
        : '#fff3d7')
      ;(cursorShadow.material as THREE.MeshBasicMaterial).opacity = isPointerDown && activeAction === 'grow' ? 0.19 + pulse * 0.1 : 0.14
      // hoverTint is refreshed by pointerMove; re-applying it here keeps a stale
      // hover tint from leaking into later frames.
      outerMaterial.color.set(isPointerDown && activeAction === 'trim' ? '#f3b287' : hoverTint ?? '#b7d97a')
      cursor.rotation.y = Math.sin(time * 1.6) * 0.026
    },
    dispose,
  }
}
