import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Collapse meshes that never move relative to each other into one mesh per
 * material, so a prop or an animal costs a handful of draw calls instead of one
 * per Blender part.
 *
 * The hierarchy is split at pivots: nodes that move on their own, such as an
 * animated leg or a turning ride rotor. Every mesh belongs to its nearest pivot
 * (or the root), and nothing is ever merged across a pivot's motion:
 *
 * - `mergeStaticMeshes` bakes each pivot's meshes into that pivot's space, one
 *   mesh per material per pivot. Right for props, whose pivots are few.
 * - `mergeRigidParts` bakes every pivot's meshes into one skinned mesh per
 *   material, with each pivot as a bone and every vertex weighted fully to its
 *   own pivot. That is the same rigid motion the node hierarchy produced, in
 *   one draw call per material however many pivots there are. Right for the
 *   animals, whose pivots are many (a snake has a node per body segment).
 *
 * A merged mesh that still has children is replaced by an empty group with the
 * same name and transform, so animation tracks and name lookups keep resolving.
 * Source geometries no longer used anywhere under `root` are disposed; materials
 * are left alone because the caller owns them.
 *
 * Bounds stay exact: a merged geometry remembers each part's own box, and
 * `objectBounds` measures those, so sizing and grounding code reads the same
 * numbers as it did from the separate meshes.
 */
export interface MergeStaticMeshesOptions {
  /** Nodes that move on their own. Nothing is merged across one. */
  readonly isPivot?: (object: THREE.Object3D) => boolean
  /** Meshes that must stay separate objects, e.g. ones looked up by name at runtime. */
  readonly keepMesh?: (mesh: THREE.Mesh) => boolean
  /**
   * `identity` merges meshes that share one material object. `value` also
   * merges meshes whose materials are separate objects with identical settings,
   * which procedural props need because they build a material per part.
   */
  readonly materialMatch?: 'identity' | 'value'
}

export interface MergeStaticMeshesReport {
  /** Meshes under `root` before merging. */
  readonly before: number
  /** Meshes under `root` after merging. */
  readonly after: number
}

/** One source mesh inside a merged geometry: its own box, and where it sits. */
interface MergedPart {
  /** Bone index for a rigid merge; -1 when the part is fixed in the mesh's own space. */
  readonly bone: number
  readonly box: THREE.Box3
  /** Part space to bone space (rigid) or to mesh space (static). */
  readonly matrix: THREE.Matrix4
}

/** Keyed by geometry, which clones share, so every clone of a merged model can measure itself. */
const MERGED_PARTS = new WeakMap<THREE.BufferGeometry, readonly MergedPart[]>()

export function mergeStaticMeshes(root: THREE.Object3D, options: MergeStaticMeshesOptions = {}): MergeStaticMeshesReport {
  return mergeMeshes(root, options, 'static')
}

export function mergeRigidParts(root: THREE.Object3D, options: MergeStaticMeshesOptions = {}): MergeStaticMeshesReport {
  return mergeMeshes(root, options, 'rigid')
}

/**
 * Clone a model made by `mergeRigidParts`, rebinding its skinned meshes to the
 * clone's own nodes. A plain `clone()` would leave them driven by the source's
 * bones. Meshes that shared a skeleton keep sharing one, which matters: three.js
 * updates and uploads each skeleton once per frame, so one per animal is one
 * upload instead of one per material.
 */
export function cloneMerged<T extends THREE.Object3D>(source: T): T {
  const copy = source.clone(true) as T
  const lookup = new Map<THREE.Object3D, THREE.Object3D>()
  const pairs: [THREE.Object3D, THREE.Object3D][] = []
  const walk = (from: THREE.Object3D, to: THREE.Object3D): void => {
    lookup.set(from, to)
    pairs.push([from, to])
    from.children.forEach((child, index) => walk(child, to.children[index]))
  }
  walk(source, copy)
  const skeletons = new Map<THREE.Skeleton, THREE.Skeleton>()
  for (const [from, to] of pairs) {
    if (!(from instanceof THREE.SkinnedMesh) || !(to instanceof THREE.SkinnedMesh)) continue
    let skeleton = skeletons.get(from.skeleton)
    if (!skeleton) {
      const bones = from.skeleton.bones.map((bone) => lookup.get(bone) ?? bone) as THREE.Bone[]
      skeleton = new THREE.Skeleton(bones, from.skeleton.boneInverses)
      skeletons.set(from.skeleton, skeleton)
    }
    to.bind(skeleton, from.bindMatrix)
  }
  return copy
}

/** Every distinct skeleton under `root`, e.g. to dispose a clone's bone textures. */
export function skeletonsOf(root: THREE.Object3D): Set<THREE.Skeleton> {
  const found = new Set<THREE.Skeleton>()
  root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) found.add(object.skeleton) })
  return found
}

/**
 * Axis-aligned bounds of `object` in `space` (world space when omitted).
 *
 * Matches `Box3.setFromObject`, which boxes each mesh's own bounding box, but
 * boxes each original part of a merged mesh rather than the merged whole, and
 * follows a rigid merge's bones into their current pose.
 */
export function objectBounds(object: THREE.Object3D, space?: THREE.Object3D): THREE.Box3 {
  ;(space ?? object).updateWorldMatrix(true, true)
  if (space) object.updateWorldMatrix(false, true)
  const inverse = space ? space.matrixWorld.clone().invert() : new THREE.Matrix4()
  const bounds = new THREE.Box3().makeEmpty()
  const transform = new THREE.Matrix4()
  object.traverse((child) => {
    const geometry = (child as THREE.Object3D & { geometry?: THREE.BufferGeometry }).geometry
    if (!geometry) return
    const parts = MERGED_PARTS.get(geometry)
    if (parts) {
      for (const part of parts) {
        const base = part.bone >= 0 && child instanceof THREE.SkinnedMesh ? child.skeleton.bones[part.bone].matrixWorld : child.matrixWorld
        transform.multiplyMatrices(inverse, base).multiply(part.matrix)
        expandByBox(bounds, part.box, transform)
      }
      return
    }
    // As Box3.expandByObject: instanced, batched and skinned meshes box what they draw.
    const own = child as THREE.Object3D & { boundingBox?: THREE.Box3 | null; computeBoundingBox?: () => void }
    let box: THREE.Box3 | null
    if (own.boundingBox !== undefined && own.computeBoundingBox) {
      if (own.boundingBox === null) own.computeBoundingBox()
      box = own.boundingBox ?? null
    } else {
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      box = geometry.boundingBox
    }
    if (!box) return
    transform.multiplyMatrices(inverse, child.matrixWorld)
    expandByBox(bounds, box, transform)
  })
  return bounds
}

const corner = new THREE.Vector3()

function expandByBox(bounds: THREE.Box3, box: THREE.Box3, matrix: THREE.Matrix4): void {
  if (box.isEmpty()) return
  for (let mask = 0; mask < 8; mask += 1) {
    corner.set(mask & 1 ? box.max.x : box.min.x, mask & 2 ? box.max.y : box.min.y, mask & 4 ? box.max.z : box.min.z)
    bounds.expandByPoint(corner.applyMatrix4(matrix))
  }
}

function mergeMeshes(root: THREE.Object3D, options: MergeStaticMeshesOptions, mode: 'static' | 'rigid'): MergeStaticMeshesReport {
  const isPivot = options.isPivot ?? (() => false)
  const keepMesh = options.keepMesh ?? (() => false)
  const materialKey = options.materialMatch === 'value' ? materialSignature : (material: THREE.Material) => material.uuid
  const before = countMeshes(root)

  root.updateMatrixWorld(true)
  const owned: { owner: THREE.Object3D; mesh: THREE.Mesh }[] = []
  const collect = (owner: THREE.Object3D, node: THREE.Object3D): void => {
    for (const child of node.children) {
      // A hidden node hides everything under it; merging would show it.
      if (!child.visible) continue
      const childOwner = isPivot(child) ? child : owner
      if (child instanceof THREE.Mesh && isMergeable(child, keepMesh)) owned.push({ owner: childOwner, mesh: child })
      collect(childOwner, child)
    }
  }
  collect(root, root)

  // Static merges never cross a pivot; rigid merges share one batch, the root.
  const buckets = new Map<string, { owner: THREE.Object3D; meshes: THREE.Mesh[]; owners: THREE.Object3D[] }>()
  for (const { owner, mesh } of owned) {
    const batchOwner = mode === 'static' ? owner : root
    const key = [
      batchOwner.uuid,
      materialKey(mesh.material as THREE.Material),
      geometrySignature(mesh.geometry),
      mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled,
    ].join('|')
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.meshes.push(mesh)
      bucket.owners.push(owner)
    } else {
      buckets.set(key, { owner: batchOwner, meshes: [mesh], owners: [owner] })
    }
  }

  const merged = new Set<THREE.Mesh>()
  const removedGeometries = new Set<THREE.BufferGeometry>()
  const additions: { owner: THREE.Object3D; mesh: THREE.Mesh }[] = []
  /** Bones of the rigid merge, shared by every skinned mesh it makes. */
  const bones: THREE.Object3D[] = []
  const boneIndex = (node: THREE.Object3D): number => {
    const index = bones.indexOf(node)
    if (index >= 0) return index
    bones.push(node)
    return bones.length - 1
  }
  const inverseOwner = new THREE.Matrix4()
  const toOwner = new THREE.Matrix4()

  for (const { owner, meshes, owners } of buckets.values()) {
    if (meshes.length < 2) continue
    inverseOwner.copy(owner.matrixWorld).invert()
    const records: MergedPart[] = []
    const parts = meshes.map((mesh, index) => {
      toOwner.multiplyMatrices(inverseOwner, mesh.matrixWorld)
      const part = bakedGeometry(mesh.geometry, toOwner)
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const box = (mesh.geometry.boundingBox ?? new THREE.Box3()).clone()
      if (mode === 'rigid') {
        const bone = boneIndex(owners[index])
        addRigidSkin(part, bone)
        const partToBone = owners[index].matrixWorld.clone().invert().multiply(mesh.matrixWorld)
        records.push({ bone, box, matrix: partToBone })
      } else {
        records.push({ bone: -1, box, matrix: toOwner.clone() })
      }
      return part
    })
    const geometry = mergeGeometries(parts, false)
    parts.forEach((part) => part.dispose())
    if (!geometry) continue
    MERGED_PARTS.set(geometry, records)
    const first = meshes[0]
    const material = first.material as THREE.Material
    const mesh = mode === 'rigid' ? new THREE.SkinnedMesh(geometry, material) : new THREE.Mesh(geometry, material)
    mesh.name = `${owner.name || 'root'} · merged ${material.name || material.type} ×${meshes.length}`
    mesh.castShadow = first.castShadow
    mesh.receiveShadow = first.receiveShadow
    mesh.renderOrder = first.renderOrder
    mesh.layers.mask = first.layers.mask
    mesh.frustumCulled = first.frustumCulled
    additions.push({ owner, mesh })
    for (const source of meshes) {
      merged.add(source)
      removedGeometries.add(source.geometry)
    }
  }

  // Detach deepest first, so a merged mesh's merged children are gone before
  // it is decided whether it still needs a stand-in group.
  const ordered = [...merged].sort((a, b) => depth(b) - depth(a))
  for (const mesh of ordered) {
    const parent = mesh.parent
    if (!parent) continue
    const ownsBatch = additions.some((addition) => addition.owner === mesh)
    const isBone = bones.includes(mesh)
    if (mesh.children.length === 0 && !ownsBatch && !isBone) {
      parent.remove(mesh)
      continue
    }
    const standIn = new THREE.Group()
    standIn.name = mesh.name
    standIn.position.copy(mesh.position)
    standIn.quaternion.copy(mesh.quaternion)
    standIn.scale.copy(mesh.scale)
    standIn.userData = mesh.userData
    const index = parent.children.indexOf(mesh)
    parent.children[index] = standIn
    standIn.parent = parent
    mesh.parent = null
    for (const child of [...mesh.children]) standIn.add(child)
    for (const addition of additions) if (addition.owner === mesh) addition.owner = standIn
    if (isBone) bones[bones.indexOf(mesh)] = standIn
  }
  for (const { owner, mesh } of additions) owner.add(mesh)

  if (mode === 'rigid' && bones.length > 0) {
    root.updateMatrixWorld(true)
    // Plain nodes work as bones: a skeleton only reads their world matrices.
    const skeleton = new THREE.Skeleton(bones as THREE.Bone[])
    for (const { mesh } of additions) {
      if (!(mesh instanceof THREE.SkinnedMesh)) continue
      mesh.bind(skeleton, mesh.matrixWorld.clone())
      // A pose can reach past the bind pose, and the game already hides
      // off-screen animals, so never cull on a stale skinned sphere. The
      // raycast pre-test gets a generous sphere for the same reason.
      mesh.frustumCulled = false
      mesh.geometry.computeBoundingSphere()
      const sphere = mesh.geometry.boundingSphere
      if (sphere) mesh.boundingSphere = new THREE.Sphere(sphere.center.clone(), sphere.radius * 2)
    }
  }

  const stillUsed = new Set<THREE.BufferGeometry>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) stillUsed.add(object.geometry)
  })
  for (const geometry of removedGeometries) if (!stillUsed.has(geometry)) geometry.dispose()

  return { before, after: countMeshes(root) }
}

/** Weight every vertex of `geometry` fully to one bone. */
function addRigidSkin(geometry: THREE.BufferGeometry, bone: number): void {
  const count = geometry.getAttribute('position').count
  const indices = new Uint16Array(count * 4)
  const weights = new Float32Array(count * 4)
  for (let vertex = 0; vertex < count; vertex += 1) {
    indices[vertex * 4] = bone
    weights[vertex * 4] = 1
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
}

function depth(object: THREE.Object3D): number {
  let count = 0
  for (let node = object.parent; node; node = node.parent) count += 1
  return count
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0
  root.traverse((object) => { if (object instanceof THREE.Mesh && object.visible) count += 1 })
  return count
}

function isMergeable(mesh: THREE.Mesh, keepMesh: (mesh: THREE.Mesh) => boolean): boolean {
  if (mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.SkinnedMesh || mesh instanceof THREE.BatchedMesh) return false
  if (Array.isArray(mesh.material)) return false
  // Blended parts sort per object; one merged object would draw them in arbitrary order.
  if (mesh.material.transparent) return false
  if (Object.keys(mesh.geometry.morphAttributes).length > 0) return false
  if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false
  return !keepMesh(mesh)
}

/** Attribute layout, which `mergeGeometries` requires to match exactly. */
function geometrySignature(geometry: THREE.BufferGeometry): string {
  const attributes = Object.keys(geometry.attributes).sort().map((name) => {
    const attribute = geometry.getAttribute(name)
    return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`
  })
  return `${geometry.index ? 'indexed' : 'soup'}[${attributes.join(',')}]`
}

/** A standalone, de-interleaved copy of `source` with `matrix` baked in. */
function bakedGeometry(source: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(source.attributes)) {
    // An interleaved attribute clones into a plain one, which is what merging needs.
    geometry.setAttribute(name, attribute.clone())
  }
  if (source.index) geometry.setIndex(source.index.clone())
  geometry.applyMatrix4(matrix)
  // A mirroring transform flips triangle winding, which three.js used to
  // correct per object at draw time. Baked in, it has to be undone here.
  if (matrix.determinant() < 0) flipWinding(geometry)
  return geometry
}

function flipWinding(geometry: THREE.BufferGeometry): void {
  const index = geometry.index
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      const b = index.getX(i + 1)
      index.setX(i + 1, index.getX(i + 2))
      index.setX(i + 2, b)
    }
    return
  }
  for (const attribute of Object.values(geometry.attributes)) {
    const size = attribute.itemSize
    const array = attribute.array
    for (let vertex = 0; vertex + 2 < attribute.count; vertex += 3) {
      for (let k = 0; k < size; k += 1) {
        const b = array[(vertex + 1) * size + k]
        array[(vertex + 1) * size + k] = array[(vertex + 2) * size + k]
        array[(vertex + 2) * size + k] = b
      }
    }
  }
}

const IGNORED_MATERIAL_KEYS = new Set(['uuid', 'name', 'id', 'version', 'userData', '_listeners'])

/** Every setting that affects how a material draws, so look-alike materials compare equal. */
function materialSignature(material: THREE.Material): string {
  const record = material as unknown as Record<string, unknown>
  // A shader hook (ground variation, the paint reveal) can make two otherwise
  // identical materials draw differently, so such a material matches only itself.
  if (Object.hasOwn(material, 'onBeforeCompile') || Object.hasOwn(material, 'customProgramCacheKey')) return material.uuid
  const parts = [material.type]
  for (const key of Object.keys(record).sort()) {
    if (IGNORED_MATERIAL_KEYS.has(key)) continue
    const value = record[key]
    if (typeof value === 'function') continue
    parts.push(`${key}=${describe(value)}`)
  }
  return parts.join(';')
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return String(value)
  if (value instanceof THREE.Color) return value.getHexString()
  if (value instanceof THREE.Texture) return value.uuid
  if (value instanceof THREE.Vector2 || value instanceof THREE.Vector3 || value instanceof THREE.Vector4 || value instanceof THREE.Euler) {
    return value.toArray().join(',')
  }
  if (value instanceof THREE.Matrix3 || value instanceof THREE.Matrix4) return value.elements.join(',')
  if (Array.isArray(value)) return `[${value.map(describe).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${key}:${describe((value as Record<string, unknown>)[key])}`).join(',')}}`
}
