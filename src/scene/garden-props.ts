import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { containsGardenPoint, GARDEN_LAWN_Y } from './fairground'
import type { GardenBounds } from '../game/farm-expansion'
import type { GardenTerrain } from './garden-terrain'
import type { GardenWaterField } from '../game/garden-water'
import type { HoverGlowTarget } from './hover-glow'
import { isHouse } from '../game/animal-housing'
import { createShopBuild, type ShopBuild, type ShopBuildReport } from './shop-build'
import {
  createPropInventory,
  createPropOccupancy,
  cellAt,
  cellKey,
  edgeKey,
  fenceRunPlacement,
  fenceRuns,
  footprintCells,
  footprintCenterWorld,
  footprintWorldRect,
  normalizeRotation,
  placementResult,
  placedCellProp,
  placedFenceRun,
  propDefinition,
  propSaleValue,
  postWorld,
  segmentCenterWorld,
  segmentVertices,
  vertexAt,
  vertexKey,
  PROP_CATALOG,
  PROP_LATTICE_CELL,
  PROP_ORDER,
  type CellCoord,
  type FenceSegment,
  type LatticeVertex,
  type PlacedProp,
  type PropId,
  type PropInventory,
  type PropOccupancy,
  type PropPlacementFailure,
  type PropSurface,
} from '../game/farm-props'

export interface PropPointerEvent {
  readonly clientX: number
  readonly clientY: number
  readonly button: number
}

export interface PropPlacementOutcome {
  readonly ok: boolean
  readonly failure: PropPlacementFailure | 'skewed' | 'skipped' | null
}

/** A placed prop the player clicked, as the info card needs to see it. */
export interface PropSelection {
  /** The placed record; every action re-checks it is still on the farm. */
  readonly handle: PlacedProp
  readonly id: PropId
  readonly name: string
  readonly blurb: string
  /** Fence sections in the run; 1 for everything else. */
  readonly sections: number
  readonly salePrice: number
  /** Cell props can be lifted and set down elsewhere; a fence run cannot. */
  readonly movable: boolean
  readonly rotatable: boolean
  /** World point just above the prop, for pinning the card beside it. */
  readonly anchor: { readonly x: number; readonly y: number; readonly z: number }
  /** Stable id of this placed prop; it survives a move. */
  readonly siteId: string
}

/** A placed animal house, and the spot in front of its door. */
export interface HouseSpot {
  readonly id: string
  readonly prop: PropId
  readonly x: number
  readonly z: number
  readonly doorX: number
  readonly doorZ: number
}

export interface PropReport {
  readonly placing: PropId | null
  /** The prop being moved, as its original cell key, or null. */
  readonly moving: string | null
  readonly rotation: number
  readonly counts: Readonly<Record<PropId, number>>
  readonly placed: readonly {
    readonly id: PropId
    readonly cells: readonly string[]
    readonly segments: readonly string[]
  }[]
  readonly fencePosts: number
  readonly fenceSegments: number
  readonly fenceRuns: number
}

/** Placed props as plain data: cell props by footprint corner, fences as runs of lattice edges. */
export interface SavedProps {
  readonly props: readonly { readonly id: string; readonly cellX: number; readonly cellZ: number; readonly rotation: number }[]
  readonly fenceRuns: readonly (readonly { readonly x: number; readonly z: number; readonly axis: 'x' | 'z' }[])[]
}

export interface ShopBuildingPlacement {
  readonly x: number
  readonly z: number
  readonly rotationY: number
  readonly url: string
  /** Longest side of the loaded model, in garden metres. */
  readonly size: number
}

export interface GardenPropsOptions {
  readonly canvas: HTMLCanvasElement
  readonly camera: THREE.Camera
  readonly lawn: THREE.Mesh
  readonly terrain: GardenTerrain
  readonly water: GardenWaterField
  readonly getBounds: () => GardenBounds
  readonly shop: ShopBuildingPlacement
  /** Called whenever a purchase or placement changes what the panels should show. */
  readonly onChange?: () => void
}

export interface RoostPoint {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Yaw of the prop, so a perched owl can face along or across its branch. */
  readonly rotationY: number
}

export interface GardenProps {
  readonly root: THREE.Group
  readonly occupancy: PropOccupancy
  readonly inventory: PropInventory
  readonly shopBuilding: THREE.Object3D | null
  readonly shopBuildingReady: boolean
  /** Null until the model loads; then whether the build has started and whether it has finished. */
  shopBuildState(): ShopBuildReport | null
  /**
   * Have the shop finish building the moment it can, with no construction
   * show. A loaded farm that was past the unlock level should not rebuild it.
   */
  finishShopBuild(): void
  /** Every placed prop (including one lifted mid-move) as plain data, for saving. */
  exportPlaced(): SavedProps
  /** Clear the farm's props and place the saved ones, skipping any that no longer fit. */
  importPlaced(saved: SavedProps): void
  /** True when the click landed on the shop building. */
  pickShop(clientX: number, clientY: number): boolean
  /** Where an owl can perch: the `OAK roost` node of every placed oak whose model has loaded. */
  roosts(): readonly RoostPoint[]
  /** Placed props per id (fences excluded), which is what a `propCount` condition reads. */
  propCounts(): Readonly<Record<string, number>>
  /** World centres of every placed prop of one id, e.g. the garbage cans a raccoon sleeps beside. */
  placements(id: PropId): readonly { readonly x: number; readonly z: number }[]
  /** Every placed animal house. A house lifted mid-move still counts, where it stood. */
  houses(): readonly HouseSpot[]
  readonly placingId: PropId | null
  /** True while a placed prop is lifted and riding the ghost. */
  readonly moving: boolean
  readonly rotation: number
  beginPlacement(id: PropId): void
  /** Ends placement; a prop being moved goes back where it was. */
  cancelPlacement(): void
  /** Quarter-turn the ghost; `-1` turns the other way. */
  rotate(direction?: 1 | -1): void
  /** The prop under a client point, nearest to the camera, or null. Changes nothing. */
  inspectAt(clientX: number, clientY: number): PropSelection | null
  /** The placed prop under the pointer, read-only; null when nothing is hit. */
  propAt(clientX: number, clientY: number): HoverGlowTarget | null
  /** Highlight a placed prop (or clear the highlight with null). */
  select(selection: PropSelection | null): void
  /** Lift a placed prop onto the ghost; returns false if it is gone or fixed. */
  beginMove(selection: PropSelection): boolean
  /** Send a placed prop back to the shed. */
  store(selection: PropSelection): boolean
  /** Remove a placed prop and return what it sells for, or null if it is gone. */
  sell(selection: PropSelection): number | null
  pointerMove(event: Pick<PropPointerEvent, 'clientX' | 'clientY'>): void
  pointerLeave(): void
  pointerDown(event: PropPointerEvent): boolean
  pointerUp(): void
  /** Direct, harness-friendly placement of a cell prop. */
  placeProp(id: PropId, cellX: number, cellZ: number, rotation?: number): PropPlacementOutcome
  /** Direct, harness-friendly placement of a straight fence run. */
  placeFence(fromX: number, fromZ: number, toX: number, toZ: number): PropPlacementOutcome
  /** Harness shortcut: return the prop under a client point straight to the inventory. */
  pickUpAt(clientX: number, clientY: number): PropId | null
  /** `farmerLevel` drives the shop's build, which starts once the farmer reaches level 2. */
  update(deltaSeconds: number, farmerLevel?: number): void
  report(): PropReport
  dispose(): void
}

/** A 0..3 quarter-turn count as a yaw in radians. */
function quarterTurns(rotation: number): number {
  return normalizeRotation(rotation) * (Math.PI / 2)
}

const MAX_POSTS = 320
const MAX_RAILS = 640

/**
 * Placed garden props: the models the shop sells, the snap-grid ghost that
 * previews a placement, and the instanced fences.
 *
 * Shaped like `garden-plants.ts`: a plain simulation in `farm-props.ts` is the
 * source of truth, this file keeps a visual per placed prop and syncs each
 * frame, and `dispose()` walks everything it built.
 */
export function createGardenProps(options: GardenPropsOptions): GardenProps {
  const { canvas, camera, lawn, terrain, water, getBounds } = options
  const root = new THREE.Group()
  root.name = 'Garden props'
  const occupancy = createPropOccupancy()
  const inventory = createPropInventory()

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const loader = new GLTFLoader()

  const surface: PropSurface = {
    heightAt: (x, z) => (containsGardenPoint(x, z, getBounds()) ? terrain.heightAt(x, z) : null),
    waterAt: (x, z) => water.depthAt(x, z),
    contains: (x, z) => containsGardenPoint(x, z, getBounds()),
  }

  // ------------------------------------------------------------ model cache --

  const sources = new Map<PropId, THREE.Object3D | 'loading' | 'failed'>()

  function loadProp(id: PropId): THREE.Object3D | null {
    const existing = sources.get(id)
    if (existing === 'loading' || existing === 'failed') return null
    if (existing) return existing
    sources.set(id, 'loading')
    loader.load(
      PROP_CATALOG[id].modelUrl,
      (gltf) => sources.set(id, gltf.scene),
      undefined,
      () => {
        console.warn(`[props] could not load ${id} from ${PROP_CATALOG[id].modelUrl}`)
        sources.set(id, 'failed')
      },
    )
    return null
  }

  /** Clone a cached model, scale its longest side to `size`, centre it and ground it. */
  function fitModel(source: THREE.Object3D, size: number, rotationY: number): THREE.Group {
    const wrapper = new THREE.Group()
    const clone = source.clone(true)
    wrapper.add(clone)
    const measured = new THREE.Box3().setFromObject(clone)
    const dims = measured.getSize(new THREE.Vector3())
    const longest = Math.max(dims.x, dims.y, dims.z)
    const scale = size / Math.max(0.0001, longest)
    clone.scale.setScalar(scale)
    clone.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(clone)
    const centre = fitted.getCenter(new THREE.Vector3())
    clone.position.set(-centre.x, -fitted.min.y, -centre.z)
    wrapper.rotation.y = rotationY
    wrapper.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
    })
    return wrapper
  }

  // -------------------------------------------------------- placed visuals --

  interface PlacedVisual {
    readonly prop: PlacedProp
    readonly object: THREE.Object3D
    readonly models: THREE.Object3D[]
  }
  const visualByProp = new Map<PlacedProp, PlacedVisual>()

  function addVisual(prop: PlacedProp): void {
    if (prop.id === 'fence') {
      visualByProp.set(prop, { prop, object: fenceRoot, models: [] })
      fencesDirty = true
      return
    }
    const def = propDefinition(prop.id)
    const models: THREE.Object3D[] = []
    const group = new THREE.Group()
    group.name = `Prop · ${prop.id}`
    const source = loadProp(prop.id)
    if (source) {
      const fitted = fitModel(source, def.size, quarterTurns(prop.rotation))
      group.add(fitted)
      models.push(fitted)
    }
    const centre = footprintCenterWorld(prop.id, prop.cell, prop.rotation)
    group.position.set(centre.x, GARDEN_LAWN_Y + terrain.heightAt(centre.x, centre.z), centre.z)
    root.add(group)
    visualByProp.set(prop, { prop, object: group, models })
  }

  function removeVisual(prop: PlacedProp): void {
    const visual = visualByProp.get(prop)
    if (!visual) return
    visualByProp.delete(prop)
    if (prop.id === 'fence') {
      fencesDirty = true
      return
    }
    // Placed models are clones that share the cached source's geometries and
    // materials, so only detach them here; `dispose()` frees the source once.
    root.remove(visual.object)
  }

  // --------------------------------------------------------------- fences ----

  const fenceRoot = new THREE.Group()
  fenceRoot.name = 'Placed fences'
  root.add(fenceRoot)
  const postGeometry = new THREE.BoxGeometry(0.15, 1.02, 0.15)
  const railGeometry = new THREE.BoxGeometry(1.86, 0.15, 0.08)
  const fenceMaterial = new THREE.MeshStandardMaterial({ color: '#b98a55', roughness: 0.78 })
  const postMesh = new THREE.InstancedMesh(postGeometry, fenceMaterial, MAX_POSTS)
  const railMesh = new THREE.InstancedMesh(railGeometry, fenceMaterial, MAX_RAILS)
  postMesh.name = 'Fence posts'
  railMesh.name = 'Fence rails'
  postMesh.count = 0
  railMesh.count = 0
  postMesh.castShadow = railMesh.castShadow = true
  postMesh.receiveShadow = railMesh.receiveShadow = true
  postMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  railMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  fenceRoot.add(postMesh, railMesh)

  let fencesDirty = true
  const dummy = new THREE.Object3D()

  function rebuildFences(): void {
    fencesDirty = false
    const segments = occupancy.fenceSegments
    const posts = new Map<string, LatticeVertex>()
    for (const segment of segments) {
      for (const vertex of segmentVertices(segment)) posts.set(vertexKey(vertex), vertex)
    }
    let postCount = 0
    for (const vertex of posts.values()) {
      if (postCount >= MAX_POSTS) break
      const point = postWorld(vertex)
      dummy.position.set(point.x, GARDEN_LAWN_Y + terrain.heightAt(point.x, point.z) + 0.51, point.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      postMesh.setMatrixAt(postCount, dummy.matrix)
      postCount += 1
    }
    postMesh.count = postCount
    postMesh.instanceMatrix.needsUpdate = true

    let railCount = 0
    for (const segment of segments) {
      const centre = segmentCenterWorld(segment)
      const y = GARDEN_LAWN_Y + terrain.heightAt(centre.x, centre.z)
      for (const height of [0.34, 0.72]) {
        if (railCount >= MAX_RAILS) break
        dummy.position.set(centre.x, y + height, centre.z)
        dummy.rotation.set(0, segment.axis === 'z' ? Math.PI / 2 : 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        railMesh.setMatrixAt(railCount, dummy.matrix)
        railCount += 1
      }
    }
    railMesh.count = railCount
    railMesh.instanceMatrix.needsUpdate = true

    // An InstancedMesh caches its bounding sphere the first time the renderer
    // frustum-tests it. That first pass happens with `count` at zero, so the
    // cached sphere is empty and every later raycast against the fence misses.
    // Dropping it here makes the next pass measure the instances that exist now.
    postMesh.boundingSphere = null
    railMesh.boundingSphere = null
  }

  // ------------------------------------------------------------------ shop ----

  let shopBuilding: THREE.Object3D | null = null
  let shopBuild: ShopBuild | null = null
  let finishShopWhenReady = false
  const shopMeshes: THREE.Mesh[] = []
  let shopReady = false
  /** Farm-safe landmark: unlike traveling attractions, the shop takes root. */
  const shopZ = options.shop.z

  loader.load(
    options.shop.url,
    (gltf) => {
      const model = gltf.scene
      const measured = new THREE.Box3().setFromObject(model)
      const dims = measured.getSize(new THREE.Vector3())
      const longest = Math.max(dims.x, dims.y, dims.z)
      const scale = options.shop.size / Math.max(0.0001, longest)
      model.scale.setScalar(scale)
      model.updateMatrixWorld(true)
      const fitted = new THREE.Box3().setFromObject(model)
      const centre = fitted.getCenter(new THREE.Vector3())
      model.position.set(-centre.x, -fitted.min.y, -centre.z)
      const holder = new THREE.Group()
      holder.name = 'Farm shop building'
      holder.userData.worldLayer = 'farm'
      holder.userData.removable = false
      holder.add(model)
      const groundY = terrain.heightAt(options.shop.x, options.shop.z)
      holder.position.set(options.shop.x, Math.max(GARDEN_LAWN_Y, groundY), options.shop.z)
      holder.rotation.y = options.shop.rotationY
      holder.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.castShadow = true
        object.receiveShadow = true
        shopMeshes.push(object)
      })
      root.add(holder)
      shopBuilding = holder
      shopBuild = createShopBuild(holder)
      if (finishShopWhenReady) shopBuild.finishNow()
      shopReady = true
      options.onChange?.()
    },
    undefined,
    () => {
      console.warn(`[props] could not load the shop building from ${options.shop.url}`)
    },
  )

  /** The player's permanent shop never packs up or scoots when land is claimed. */
  function updateShopPlacement(): void {
    const building = shopBuilding
    if (!building) return
    building.position.y = Math.max(GARDEN_LAWN_Y, terrain.heightAt(options.shop.x, shopZ))
  }

  function pointerRay(event: Pick<PropPointerEvent, 'clientX' | 'clientY'>): boolean {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    return true
  }

  function groundAt(event: Pick<PropPointerEvent, 'clientX' | 'clientY'>): THREE.Vector3 | null {
    if (!pointerRay(event)) return null
    const hit = raycaster.intersectObject(lawn, false)[0]
    if (!hit || !containsGardenPoint(hit.point.x, hit.point.z, getBounds())) return null
    return hit.point
  }

  function pickShop(clientX: number, clientY: number): boolean {
    // The storefront opens only once the build is finished; a site under construction is not a shop yet.
    if (!shopBuilding || !shopBuild?.finished || !pointerRay({ clientX, clientY })) return false
    return raycaster.intersectObjects(shopMeshes, false).length > 0
  }

  // ---------------------------------------------------------------- ghost ----

  const ghost = new THREE.Group()
  ghost.name = 'Prop placement ghost'
  ghost.visible = false
  root.add(ghost)

  const ghostFillMaterial = new THREE.MeshBasicMaterial({
    color: '#8cff61', transparent: true, opacity: 0.2, depthWrite: false, depthTest: false, toneMapped: false,
  })
  const ghostEdgeMaterial = new THREE.MeshBasicMaterial({
    color: '#8cff61', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, toneMapped: false,
  })
  const cellTiles: THREE.Mesh[] = []
  const cellEdges: THREE.Mesh[] = []
  for (let index = 0; index < 4; index += 1) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(PROP_LATTICE_CELL * 0.94, PROP_LATTICE_CELL * 0.94), ghostFillMaterial)
    tile.rotation.x = -Math.PI / 2
    tile.renderOrder = 890
    tile.visible = false
    ghost.add(tile)
    cellTiles.push(tile)
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(PROP_LATTICE_CELL, PROP_LATTICE_CELL), ghostEdgeMaterial)
    edge.rotation.x = -Math.PI / 2
    edge.renderOrder = 889
    edge.visible = false
    ghost.add(edge)
    cellEdges.push(edge)
  }
  const ghostModelHolder = new THREE.Group()
  ghost.add(ghostModelHolder)
  let ghostModelId: PropId | null = null
  let ghostModel: THREE.Object3D | null = null
  /** The ghost's own copies of the model's materials; geometry and textures stay shared. */
  let ghostMaterials: THREE.Material[] = []
  const GHOST_OPACITY = 0.6
  const GHOST_VALID = new THREE.Color('#8cff61')
  const GHOST_INVALID = new THREE.Color('#ff5148')

  function clearGhostModel(): void {
    if (ghostModel) ghostModelHolder.remove(ghostModel)
    for (const material of ghostMaterials) material.dispose()
    ghostMaterials = []
    ghostModel = null
    ghostModelId = null
  }

  /**
   * Build the translucent model for `id`. The source loads asynchronously, so
   * until it arrives this leaves `ghostModelId` unset and the next frame's
   * `syncVisuals` tries again; only a finished build is remembered.
   */
  function ensureGhostModel(id: PropId): void {
    if (ghostModelId === id) return
    clearGhostModel()
    const source = loadProp(id)
    if (!source) return
    const fitted = fitModel(source, propDefinition(id).size, 0)
    fitted.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = false
      object.receiveShadow = false
      object.renderOrder = 888
      const clones = (Array.isArray(object.material) ? object.material : [object.material]).map((material) => {
        const clone = material.clone()
        clone.transparent = true
        clone.opacity = GHOST_OPACITY
        clone.depthWrite = false
        ghostMaterials.push(clone)
        return clone
      })
      object.material = Array.isArray(object.material) ? clones : clones[0]
    })
    ghostModel = fitted
    ghostModelId = id
    ghostModelHolder.add(fitted)
    tintGhostModel(lastTintValid)
  }

  let lastTintValid = true
  function tintGhostModel(valid: boolean): void {
    const colour = valid ? GHOST_VALID : GHOST_INVALID
    for (const material of ghostMaterials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      material.emissive.copy(colour)
      material.emissiveIntensity = valid ? 0.16 : 0.45
    }
  }

  const reasonSurface = createReasonSurface()
  const reasonTexture = new THREE.CanvasTexture(reasonSurface.canvas)
  reasonTexture.colorSpace = THREE.SRGBColorSpace
  const reasonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: reasonTexture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false,
  }))
  reasonSprite.renderOrder = 2100
  reasonSprite.visible = false
  ghost.add(reasonSprite)
  let lastReason = ''
  const reasonColour = { key: '' }

  function setGhostTint(valid: boolean): void {
    const colour = valid ? '#8cff61' : '#ff5148'
    ghostFillMaterial.color.set(colour)
    ghostEdgeMaterial.color.set(colour)
    lastTintValid = valid
    ghostFenceMaterial.color.set(colour)
    tintGhostModel(valid)
    reasonColour.key = colour
  }

  function showReason(text: string, colour: string, position: THREE.Vector3): void {
    if (!text) {
      reasonSprite.visible = false
      lastReason = ''
      return
    }
    if (text !== lastReason || colour !== reasonSurface.colour) {
      drawReason(reasonSurface, text, colour)
      reasonTexture.needsUpdate = true
      lastReason = text
      reasonSurface.colour = colour
    }
    const worldUnitsPerPixel = camera instanceof THREE.OrthographicCamera
      ? (camera.top - camera.bottom) / Math.max(1, canvas.clientHeight)
      : 0.05
    reasonSprite.position.copy(position)
    reasonSprite.scale.set(248 * worldUnitsPerPixel, 56 * worldUnitsPerPixel, 1)
    reasonSprite.visible = true
  }

  const REASON_LABEL: Record<string, string> = {
    'out-of-bounds': 'outside the garden',
    'in-water': 'too close to the water',
    'too-steep': 'needs level ground',
    occupied: 'blocked',
    'out-of-stock': 'none left in the box',
    skewed: 'drag a straight run',
  }

  // ------------------------------------------------------------ placement ----

  let placingId: PropId | null = null
  /** A placed prop lifted off the farm and riding the ghost; null for a fresh placement. */
  let moving: PlacedProp | null = null
  /** Stable ids for placed props, carried across a move so residents keep their beds. */
  const siteIds = new WeakMap<PlacedProp, string>()
  let nextSiteId = 1
  function siteIdOf(prop: PlacedProp): string {
    let id = siteIds.get(prop)
    if (!id) {
      id = `${prop.id}-${nextSiteId++}`
      siteIds.set(prop, id)
    }
    return id
  }
  let rotation = 0
  let hoverPoint: THREE.Vector3 | null = null
  let fenceAnchor: LatticeVertex | null = null
  let fenceTarget: LatticeVertex | null = null

  function setGhostTransformAlongLattice(cells: readonly CellCoord[], y: number): void {
    for (const [index, tile] of cellTiles.entries()) {
      const cell = cells[index]
      tile.visible = Boolean(cell)
      if (!cell) continue
      tile.position.set(cell.cellX * PROP_LATTICE_CELL + PROP_LATTICE_CELL / 2, y + 0.012, cell.cellZ * PROP_LATTICE_CELL + PROP_LATTICE_CELL / 2)
      const edge = cellEdges[index]
      edge.visible = true
      edge.position.copy(tile.position)
    }
    for (let index = cells.length; index < cellEdges.length; index += 1) cellEdges[index].visible = false
  }

  function previewCells(id: PropId, cell: CellCoord, y: number): void {
    ghostPosts.count = 0
    ghostRails.count = 0
    ensureGhostModel(id)
    const cells = footprintCells(id, cell, rotation)
    setGhostTransformAlongLattice(cells, y)
    const centre = footprintCenterWorld(id, cell, rotation)
    ghostModelHolder.position.set(centre.x, y, centre.z)
    ghostModelHolder.rotation.y = quarterTurns(rotation)
    ghostModelHolder.visible = ghostModel !== null
  }

  // The run preview is the fence itself, translucent: the same posts and rails
  // the placed fence will have, in pooled instances, so a long drag previews in
  // full and shows exactly where the posts land.
  const MAX_GHOST_SEGMENTS = 64
  const ghostFenceMaterial = new THREE.MeshStandardMaterial({
    color: '#8cff61', transparent: true, opacity: 0.6, roughness: 0.78, depthWrite: false,
  })
  const ghostPosts = new THREE.InstancedMesh(postGeometry, ghostFenceMaterial, MAX_GHOST_SEGMENTS + 1)
  const ghostRails = new THREE.InstancedMesh(railGeometry, ghostFenceMaterial, MAX_GHOST_SEGMENTS * 2)
  ghostPosts.name = 'Ghost fence posts'
  ghostRails.name = 'Ghost fence rails'
  ghostPosts.count = 0
  ghostRails.count = 0
  ghostPosts.frustumCulled = false
  ghostRails.frustumCulled = false
  ghostPosts.renderOrder = ghostRails.renderOrder = 888
  ghost.add(ghostPosts, ghostRails)

  /** Show `segments` as a ghost run, or one lone post at `loneVertex` before a drag has begun. */
  function previewFence(segments: readonly FenceSegment[], loneVertex: LatticeVertex | null): void {
    for (const tile of cellTiles) tile.visible = false
    for (const edge of cellEdges) edge.visible = false
    ghostModelHolder.visible = false
    const shown = segments.slice(0, MAX_GHOST_SEGMENTS)
    const posts = new Map<string, LatticeVertex>()
    for (const segment of shown) {
      for (const vertex of segmentVertices(segment)) posts.set(vertexKey(vertex), vertex)
    }
    if (loneVertex) posts.set(vertexKey(loneVertex), loneVertex)
    let postCount = 0
    for (const vertex of posts.values()) {
      const point = postWorld(vertex)
      dummy.position.set(point.x, GARDEN_LAWN_Y + terrain.heightAt(point.x, point.z) + 0.51, point.z)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      ghostPosts.setMatrixAt(postCount, dummy.matrix)
      postCount += 1
    }
    ghostPosts.count = postCount
    ghostPosts.instanceMatrix.needsUpdate = true
    let railCount = 0
    for (const segment of shown) {
      const centre = segmentCenterWorld(segment)
      const base = GARDEN_LAWN_Y + terrain.heightAt(centre.x, centre.z)
      for (const height of [0.34, 0.72]) {
        dummy.position.set(centre.x, base + height, centre.z)
        dummy.rotation.set(0, segment.axis === 'z' ? Math.PI / 2 : 0, 0)
        dummy.updateMatrix()
        ghostRails.setMatrixAt(railCount, dummy.matrix)
        railCount += 1
      }
    }
    ghostRails.count = railCount
    ghostRails.instanceMatrix.needsUpdate = true
  }

  function fenceSegmentList(from: LatticeVertex, to: LatticeVertex): FenceSegment[] {
    if (from.z === to.z && from.x !== to.x) {
      const low = Math.min(from.x, to.x)
      const high = Math.max(from.x, to.x)
      const list: FenceSegment[] = []
      for (let x = low; x < high; x += 1) list.push({ x, z: from.z, axis: 'x' })
      return list
    }
    if (from.x === to.x && from.z !== to.z) {
      const low = Math.min(from.z, to.z)
      const high = Math.max(from.z, to.z)
      const list: FenceSegment[] = []
      for (let z = low; z < high; z += 1) list.push({ x: from.x, z, axis: 'z' })
      return list
    }
    return []
  }

  function updatePreview(): void {
    if (!placingId || !hoverPoint) {
      ghost.visible = false
      reasonSprite.visible = false
      return
    }
    ghost.visible = true
    const y = GARDEN_LAWN_Y + terrain.heightAt(hoverPoint.x, hoverPoint.z)
    if (placingId === 'fence') {
      const target = vertexAt(hoverPoint.x, hoverPoint.z)
      fenceTarget = target
      const anchor = fenceAnchor
      const segments = anchor ? fenceSegmentList(anchor, target) : []
      const label = new THREE.Vector3(hoverPoint.x, y + 1.4, hoverPoint.z)
      if (!anchor) {
        previewFence([], target)
        setGhostTint(true)
        showReason('drag a run', '#8cff61', label)
        return
      }
      if (segments.length === 0) {
        previewFence([], target)
        setGhostTint(false)
        showReason(REASON_LABEL.skewed, '#ff5148', label)
        return
      }
      previewFence(segments, null)
      const run = fenceRunPlacement(anchor, target, surface, occupancy, inventory)
      setGhostTint(run.valid)
      if (run.valid) {
        const left = inventory.count('fence') - run.free.length
        showReason(`${run.free.length} fence${run.free.length === 1 ? '' : 's'} · ${left} left`, '#8cff61', label)
      } else {
        showReason(REASON_LABEL[run.failure ?? ''] ?? 'blocked', '#ff5148', label)
      }
      return
    }
    const cell = cellAt(hoverPoint.x, hoverPoint.z)
    const result = placementResult(placingId, cell, rotation, surface, occupancy, moving ? undefined : inventory)
    previewCells(placingId, cell, y)
    setGhostTint(result.valid)
    const rect = footprintWorldRect(placingId, cell, rotation)
    const label = new THREE.Vector3((rect.minX + rect.maxX) / 2, y + propDefinition(placingId).size + 0.5, (rect.minZ + rect.maxZ) / 2)
    if (result.valid) {
      const def = propDefinition(placingId)
      const verb = moving ? 'click to set down' : 'click to place'
      showReason(def.rotatable ? `${def.name} · R rotates` : `${def.name} · ${verb}`, '#8cff61', label)
    } else {
      showReason(REASON_LABEL[result.failure ?? ''] ?? 'blocked', '#ff5148', label)
    }
  }

  function consumeOne(id: PropId): boolean {
    return inventory.take(id, 1)
  }

  function beginPlacement(id: PropId): void {
    if (inventory.count(id) <= 0) return
    cancelPlacement()
    placingId = id
    rotation = 0
    fenceAnchor = null
    fenceTarget = null
    if (hoverPoint) updatePreview()
  }

  /** Put a lifted prop back exactly where it stood. */
  function restoreMove(): void {
    const lifted = moving
    if (!lifted) return
    moving = null
    occupancy.add(lifted)
    const visual = visualByProp.get(lifted)
    if (visual) visual.object.visible = true
  }

  function cancelPlacement(): void {
    restoreMove()
    placingId = null
    fenceAnchor = null
    fenceTarget = null
    ghost.visible = false
    reasonSprite.visible = false
  }

  function rotate(direction: 1 | -1 = 1): void {
    if (!placingId || !propDefinition(placingId).rotatable) return
    rotation = normalizeRotation(rotation + direction)
    if (hoverPoint) updatePreview()
  }

  function placeCell(id: PropId, cell: CellCoord, rot: number): PropPlacementOutcome {
    const lifted = moving
    const result = placementResult(id, cell, rot, surface, occupancy, lifted ? undefined : inventory)
    if (!result.valid) return { ok: false, failure: result.failure }
    if (lifted) {
      // A move spends nothing: the lifted prop's visual is swapped for a fresh one at the new cell.
      moving = null
      removeVisual(lifted)
    } else if (!consumeOne(id)) {
      return { ok: false, failure: 'out-of-stock' }
    }
    const placed = placedCellProp(id, cell, rot)
    if (lifted) siteIds.set(placed, siteIdOf(lifted))
    occupancy.add(placed)
    addVisual(placed)
    fencesDirty = true
    options.onChange?.()
    return { ok: true, failure: null }
  }

  function placeFenceSegments(segments: readonly FenceSegment[]): PropPlacementOutcome {
    if (segments.length === 0) return { ok: false, failure: 'skewed' }
    if (inventory.count('fence') < segments.length) return { ok: false, failure: 'out-of-stock' }
    const placed = placedFenceRun(segments)
    occupancy.add(placed)
    inventory.take('fence', segments.length)
    fencesDirty = true
    options.onChange?.()
    return { ok: true, failure: null }
  }

  function commitFenceRun(): PropPlacementOutcome {
    if (!fenceAnchor || !fenceTarget) return { ok: false, failure: 'skipped' }
    const run = fenceRunPlacement(fenceAnchor, fenceTarget, surface, occupancy, inventory)
    if (!run.valid) return { ok: false, failure: run.failure }
    return placeFenceSegments(run.free)
  }

  function placeProp(id: PropId, cellX: number, cellZ: number, rot = 0): PropPlacementOutcome {
    if (id === 'fence') return placeFence(cellX, cellZ, cellX + 1, cellZ)
    return placeCell(id, { cellX, cellZ }, rot)
  }

  function placeFence(fromX: number, fromZ: number, toX: number, toZ: number): PropPlacementOutcome {
    const run = fenceRunPlacement({ x: fromX, z: fromZ }, { x: toX, z: toZ }, surface, occupancy, inventory)
    if (!run.valid) return { ok: false, failure: run.failure }
    return placeFenceSegments(run.free)
  }

  function pointerDown(event: PropPointerEvent): boolean {
    if (event.button !== 0 || !placingId) return false
    if (placingId === 'fence') {
      // Press sets the run's first post; the drag previews and `pointerUp` commits.
      const point = hoverPoint ?? groundAt(event)
      if (!point) return true
      fenceAnchor = vertexAt(point.x, point.z)
      fenceTarget = fenceAnchor
      updatePreview()
      return true
    }
    const point = hoverPoint ?? groundAt(event)
    if (!point) return true
    const cell = cellAt(point.x, point.z)
    const wasMoving = moving !== null
    const outcome = placeCell(placingId, cell, rotation)
    // A move is one set-down; a fresh placement carries on while the box has stock.
    if (wasMoving ? outcome.ok : inventory.count(placingId) <= 0) cancelPlacement()
    else if (hoverPoint) updatePreview()
    return true
  }

  function pointerUp(): void {
    if (placingId !== 'fence' || !fenceAnchor) return
    commitFenceRun()
    fenceAnchor = null
    fenceTarget = null
    if (inventory.count('fence') <= 0) cancelPlacement()
    else if (hoverPoint) updatePreview()
  }

  // ------------------------------------------------------------ selection ----

  const selectionGroup = new THREE.Group()
  selectionGroup.name = 'Prop selection highlight'
  root.add(selectionGroup)
  const selectionGeometry = new THREE.PlaneGeometry(1, 1)
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: '#f2cd72', transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, toneMapped: false,
  })
  const selectionTiles: THREE.Mesh[] = []
  const MAX_SELECTION_TILES = 64
  let selected: PlacedProp | null = null
  let selectionClock = 0

  function showSelection(prop: PlacedProp | null): void {
    selected = prop
    const rects: { x: number; z: number; w: number; d: number }[] = []
    if (prop?.id === 'fence') {
      for (const segment of prop.segments) {
        const centre = segmentCenterWorld(segment)
        const along = segment.axis === 'x'
        rects.push({ x: centre.x, z: centre.z, w: along ? PROP_LATTICE_CELL : 0.5, d: along ? 0.5 : PROP_LATTICE_CELL })
      }
    } else if (prop) {
      for (const cell of prop.cells) {
        rects.push({
          x: cell.cellX * PROP_LATTICE_CELL + PROP_LATTICE_CELL / 2,
          z: cell.cellZ * PROP_LATTICE_CELL + PROP_LATTICE_CELL / 2,
          w: PROP_LATTICE_CELL * 0.96,
          d: PROP_LATTICE_CELL * 0.96,
        })
      }
    }
    for (const [index, rect] of rects.slice(0, MAX_SELECTION_TILES).entries()) {
      let tile = selectionTiles[index]
      if (!tile) {
        tile = new THREE.Mesh(selectionGeometry, selectionMaterial)
        tile.rotation.x = -Math.PI / 2
        tile.renderOrder = 880
        selectionGroup.add(tile)
        selectionTiles.push(tile)
      }
      tile.visible = true
      tile.scale.set(rect.w, rect.d, 1)
      tile.position.set(rect.x, GARDEN_LAWN_Y + terrain.heightAt(rect.x, rect.z) + 0.03, rect.z)
    }
    for (let index = Math.min(rects.length, MAX_SELECTION_TILES); index < selectionTiles.length; index += 1) {
      selectionTiles[index].visible = false
    }
  }

  function select(selection: PropSelection | null): void {
    showSelection(selection && occupancy.placed.includes(selection.handle) ? selection.handle : null)
  }

  // ------------------------------------------------------------ inspection ----

  interface PropHit {
    readonly prop: PlacedProp
    readonly distance: number
    readonly point: THREE.Vector3
  }

  /** The placed prop nearest the camera along the pointer ray, fences included. */
  function nearestHit(clientX: number, clientY: number): PropHit | null {
    if (!pointerRay({ clientX, clientY })) return null
    let best: PropHit | null = null
    for (const prop of occupancy.placed) {
      if (prop.id === 'fence') continue
      const visual = visualByProp.get(prop)
      if (!visual?.object.visible) continue
      const hit = raycaster.intersectObject(visual.object, true)[0]
      if (hit && (!best || hit.distance < best.distance)) best = { prop, distance: hit.distance, point: hit.point.clone() }
    }
    // A fence is declared by its instanced rails and posts; a hit names one segment, and its owner is the whole drawn run.
    const fenceHit = raycaster.intersectObjects([postMesh, railMesh], false)[0]
    if (fenceHit && fenceHit.instanceId !== undefined && (!best || fenceHit.distance < best.distance)) {
      const segment = fenceSegmentForInstance(fenceHit)
      const owner = segment ? occupancy.edgeOwner(segment) : null
      if (owner) best = { prop: owner, distance: fenceHit.distance, point: fenceHit.point.clone() }
    }
    return best
  }

  function inspectAt(clientX: number, clientY: number): PropSelection | null {
    const hit = nearestHit(clientX, clientY)
    if (!hit) return null
    const { prop } = hit
    const def = propDefinition(prop.id)
    const sections = prop.id === 'fence' ? prop.segments.length : 1
    let anchor: PropSelection['anchor']
    if (prop.id === 'fence') {
      anchor = { x: hit.point.x, y: hit.point.y + 0.8, z: hit.point.z }
    } else {
      const centre = footprintCenterWorld(prop.id, prop.cell, prop.rotation)
      anchor = { x: centre.x, y: GARDEN_LAWN_Y + terrain.heightAt(centre.x, centre.z) + def.size * 0.6, z: centre.z }
    }
    return {
      handle: prop,
      id: prop.id,
      name: def.name,
      blurb: def.blurb,
      sections,
      salePrice: propSaleValue(prop.id, sections),
      movable: def.kind === 'cell',
      rotatable: def.rotatable,
      anchor,
      siteId: siteIdOf(prop),
    }
  }

  /** Take a placed prop off the farm. Returns false when it is already gone. */
  function detach(prop: PlacedProp): boolean {
    if (!occupancy.remove(prop)) return false
    removeVisual(prop)
    // Fence runs have no visual of their own; the instanced rails and posts rebuild from occupancy.
    if (prop.id === 'fence') fencesDirty = true
    if (selected === prop) showSelection(null)
    options.onChange?.()
    return true
  }

  function store(selection: PropSelection): boolean {
    const prop = selection.handle
    const sections = prop.id === 'fence' ? prop.segments.length : 1
    if (!detach(prop)) return false
    inventory.add(prop.id, sections)
    return true
  }

  function sell(selection: PropSelection): number | null {
    const prop = selection.handle
    const sections = prop.id === 'fence' ? prop.segments.length : 1
    if (!detach(prop)) return null
    return propSaleValue(prop.id, sections)
  }

  function beginMove(selection: PropSelection): boolean {
    const prop = selection.handle
    if (propDefinition(prop.id).kind !== 'cell' || !occupancy.placed.includes(prop)) return false
    cancelPlacement()
    occupancy.remove(prop)
    const visual = visualByProp.get(prop)
    if (visual) visual.object.visible = false
    moving = prop
    placingId = prop.id
    rotation = prop.rotation
    fenceAnchor = null
    fenceTarget = null
    showSelection(null)
    if (hoverPoint) updatePreview()
    return true
  }

  /** Harness shortcut: straight back to the shed, no card. */
  /** Footprint of the placed prop under the pointer, read-only, for the hover glow. */
  function propAt(clientX: number, clientY: number): HoverGlowTarget | null {
    const selection = inspectAt(clientX, clientY)
    const visual = selection ? visualByProp.get(selection.handle) : undefined
    if (!visual) return null
    const box = new THREE.Box3().setFromObject(visual.object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    return { x: center.x, y: box.min.y, z: center.z, radius: Math.max(size.x, size.z) / 2 }
  }

  function pickUpAt(clientX: number, clientY: number): PropId | null {
    const selection = inspectAt(clientX, clientY)
    if (!selection || !store(selection)) return null
    return selection.id
  }

  function fenceSegmentForInstance(hit: THREE.Intersection): FenceSegment | null {
    if (hit.object === railMesh) {
      const railIndex = Math.floor((hit.instanceId ?? 0) / 2)
      return occupancy.fenceSegments[railIndex] ?? null
    }
    if (hit.object === postMesh) {
      // A post belongs to whichever run owns a segment touching this vertex.
      const position = new THREE.Vector3()
      postMesh.getMatrixAt(hit.instanceId ?? 0, dummy.matrix)
      position.setFromMatrixPosition(dummy.matrix)
      const vertex = { x: Math.round(position.x / PROP_LATTICE_CELL), z: Math.round(position.z / PROP_LATTICE_CELL) }
      for (const segment of occupancy.fenceSegments) {
        for (const corner of segmentVertices(segment)) {
          if (corner.x === vertex.x && corner.z === vertex.z) return segment
        }
      }
    }
    return null
  }

  function pointerMove(event: Pick<PropPointerEvent, 'clientX' | 'clientY'>): void {
    if (!placingId) return
    hoverPoint = groundAt(event)
    if (!hoverPoint) {
      ghost.visible = false
      reasonSprite.visible = false
      return
    }
    updatePreview()
  }

  function pointerLeave(): void {
    ghost.visible = false
    reasonSprite.visible = false
    hoverPoint = null
  }

  // ------------------------------------------------------------------ sync ----

  function syncVisuals(): void {
    // Models that finished loading after their placement was recorded.
    for (const visual of visualByProp.values()) {
      if (visual.prop.id === 'fence' || visual.models.length > 0) continue
      const source = loadProp(visual.prop.id)
      if (!source) continue
      const fitted = fitModel(source, propDefinition(visual.prop.id).size, quarterTurns(visual.prop.rotation))
      visual.object.add(fitted)
      visual.models.push(fitted)
    }
    if (placingId && placingId !== 'fence') ensureGhostModel(placingId)
  }

  function exportPlaced(): SavedProps {
    const owned = moving ? [...occupancy.placed, moving] : occupancy.placed
    return {
      props: owned.filter((prop) => prop.id !== 'fence').map((prop) => ({
        id: prop.id,
        cellX: prop.cell.cellX,
        cellZ: prop.cell.cellZ,
        rotation: prop.rotation,
      })),
      fenceRuns: owned.filter((prop) => prop.id === 'fence').map((prop) => prop.segments.map((segment) => ({
        x: segment.x,
        z: segment.z,
        axis: segment.axis,
      }))),
    }
  }

  function importPlaced(saved: SavedProps): void {
    cancelPlacement()
    showSelection(null)
    for (const prop of [...occupancy.placed]) {
      occupancy.remove(prop)
      removeVisual(prop)
    }
    fencesDirty = true
    for (const entry of saved.props) {
      if (!PROP_ORDER.includes(entry.id as PropId) || entry.id === 'fence') continue
      if (![entry.cellX, entry.cellZ, entry.rotation].every(Number.isFinite)) continue
      const id = entry.id as PropId
      const cell = { cellX: Math.floor(entry.cellX), cellZ: Math.floor(entry.cellZ) }
      // Placement rules are checked against the loaded ground, not trusted: a
      // save made before a rule changed must not seat a statue in a pond.
      const result = placementResult(id, cell, entry.rotation, surface, occupancy)
      if (!result.valid) continue
      const placed = placedCellProp(id, cell, entry.rotation)
      occupancy.add(placed)
      addVisual(placed)
    }
    for (const run of saved.fenceRuns) {
      const segments = run
        .filter((segment) => Number.isFinite(segment.x) && Number.isFinite(segment.z) && (segment.axis === 'x' || segment.axis === 'z'))
        .map((segment) => ({ x: Math.floor(segment.x), z: Math.floor(segment.z), axis: segment.axis }))
        .filter((segment) => occupancy.isEdgeFree(segment))
      if (segments.length === 0) continue
      const placed = placedFenceRun(segments)
      occupancy.add(placed)
      addVisual(placed)
    }
    options.onChange?.()
  }

  function report(): PropReport {
    return {
      placing: placingId,
      moving: moving ? cellKey(moving.cell) : null,
      rotation,
      counts: inventory.counts,
      placed: occupancy.placed.map((prop) => ({
        id: prop.id,
        cells: prop.cells.map((cell) => cellKey(cell)),
        segments: prop.segments.map((segment) => edgeKey(segment)),
      })),
      fencePosts: postMesh.count,
      fenceSegments: railMesh.count / 2,
      fenceRuns: fenceRuns(occupancy.fenceSegments).length,
    }
  }

  /** GLTFLoader turns the Blender node `OAK roost` into `OAK_roost`. */
  const ROOST_NODE = 'OAK_roost'
  const roostWorld = new THREE.Vector3()

  function roosts(): readonly RoostPoint[] {
    const points: RoostPoint[] = []
    for (const visual of visualByProp.values()) {
      if (visual.prop.id !== 'oak' || !visual.object.visible) continue
      const node = visual.object.getObjectByName(ROOST_NODE)
      if (!node) continue
      visual.object.updateWorldMatrix(true, true)
      node.getWorldPosition(roostWorld)
      points.push({ x: roostWorld.x, y: roostWorld.y, z: roostWorld.z, rotationY: quarterTurns(visual.prop.rotation) })
    }
    return points
  }

  function propCounts(): Readonly<Record<string, number>> {
    const counts: Record<string, number> = {}
    // A prop in the air mid-move is still the player's; it must not blink out of conditions.
    const owned = moving ? [...occupancy.placed, moving] : occupancy.placed
    for (const prop of owned) {
      if (prop.id === 'fence') continue
      counts[prop.id] = (counts[prop.id] ?? 0) + 1
    }
    return counts
  }

  function houses(): readonly HouseSpot[] {
    const owned = moving ? [...occupancy.placed, moving] : occupancy.placed
    return owned.filter((prop) => isHouse(prop.id)).map((prop) => {
      const centre = footprintCenterWorld(prop.id, prop.cell, prop.rotation)
      // Every house model faces local +Z; a quarter turn about +Y swings that to (sin, cos).
      const yaw = quarterTurns(prop.rotation)
      const reach = propDefinition(prop.id).footprint.depth * PROP_LATTICE_CELL / 2 + 0.6
      return {
        id: siteIdOf(prop),
        prop: prop.id,
        x: centre.x,
        z: centre.z,
        doorX: centre.x + Math.sin(yaw) * reach,
        doorZ: centre.z + Math.cos(yaw) * reach,
      }
    })
  }

  function placements(id: PropId): readonly { readonly x: number; readonly z: number }[] {
    return occupancy.placed.filter((prop) => prop.id === id).map((prop) => {
      const centre = footprintCenterWorld(prop.id, prop.cell, prop.rotation)
      return { x: centre.x, z: centre.z }
    })
  }

  /** Free a cached source's geometry and materials; clones share them. */
  function disposeSource(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material.dispose()
    })
  }

  return {
    root,
    occupancy,
    inventory,
    get shopBuilding() { return shopBuilding },
    get shopBuildingReady() { return shopReady },
    shopBuildState() {
      return shopBuild ? shopBuild.report() : null
    },
    finishShopBuild() {
      finishShopWhenReady = true
      shopBuild?.finishNow()
    },
    exportPlaced,
    importPlaced,
    pickShop,
    roosts,
    propCounts,
    placements,
    houses,
    get placingId() { return placingId },
    get moving() { return moving !== null },
    get rotation() { return rotation },
    beginPlacement,
    cancelPlacement,
    rotate,
    inspectAt,
    propAt,
    select,
    beginMove,
    store,
    sell,
    pointerMove,
    pointerLeave,
    pointerDown,
    pointerUp,
    placeProp,
    placeFence,
    pickUpAt,
    update(deltaSeconds: number, farmerLevel = 0): void {
      if (fencesDirty) rebuildFences()
      if (selected) {
        selectionClock += deltaSeconds
        selectionMaterial.opacity = 0.34 + 0.14 * Math.sin(selectionClock * 4)
      }
      syncVisuals()
      updateShopPlacement()
      shopBuild?.update(deltaSeconds, farmerLevel)
    },
    report,
    dispose(): void {
      for (const visual of visualByProp.values()) {
        if (visual.prop.id === 'fence') continue
        root.remove(visual.object)
      }
      visualByProp.clear()
      postGeometry.dispose()
      railGeometry.dispose()
      fenceMaterial.dispose()
      restoreMove()
      selectionGeometry.dispose()
      selectionMaterial.dispose()
      ghostPosts.dispose()
      ghostRails.dispose()
      ghostFenceMaterial.dispose()
      for (const mesh of [...cellTiles, ...cellEdges]) mesh.geometry.dispose()
      ghostFillMaterial.dispose()
      ghostEdgeMaterial.dispose()
      reasonTexture.dispose()
      reasonSprite.material.dispose()
      clearGhostModel()
      for (const object of sources.values()) {
        if (object === 'loading' || object === 'failed') continue
        disposeSource(object)
      }
      sources.clear()
      disposeSource(shopBuilding ?? new THREE.Group())
    },
  }
}

// ------------------------------------------------------------------ helpers --

export const GARDEN_PROP_LATTICE = PROP_LATTICE_CELL

interface ReasonSurface {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  colour: string
}

function createReasonSurface(): ReasonSurface {
  const canvas = document.createElement('canvas')
  canvas.width = 992
  canvas.height = 224
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for prop placement reason')
  return { canvas, context, colour: '' }
}

function drawReason(surface: ReasonSurface, text: string, colour: string): void {
  const context = surface.context
  const { width, height } = surface.canvas
  context.clearRect(0, 0, width, height)
  context.fillStyle = 'rgba(38, 24, 16, .82)'
  context.beginPath()
  context.roundRect(10, 16, width - 20, height - 32, 44)
  context.fill()
  context.strokeStyle = colour
  context.lineWidth = 11
  context.beginPath()
  context.roundRect(10, 16, width - 20, height - 32, 44)
  context.stroke()
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#fff6df'
  let size = 74
  context.font = `bold ${size}px Georgia, "Times New Roman", serif`
  while (size > 36 && context.measureText(text).width > width - 90) {
    size -= 4
    context.font = `bold ${size}px Georgia, "Times New Roman", serif`
  }
  context.fillText(text, width / 2, height / 2 + 5)
}
