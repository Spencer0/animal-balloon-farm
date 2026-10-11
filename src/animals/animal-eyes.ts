import * as THREE from 'three'
import { webgpuKit } from '../render/backend'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Heart eyes: the one cosmetic that marks a breedable animal.
 *
 * The GLBs already name their face parts precisely (`COW · near dark pupil`,
 * `COW · near starry catchlight`). At load, `mergeAnimalParts` folds every
 * pupil and catchlight into one shared eye mesh, and gives each pupil a heart
 * sibling in the same merged mesh. Heart mode is then a material swap between
 * two shared eye materials. A vertex attribute decides which geometry
 * collapses, so the swap costs no extra draw calls and needs no rebuild.
 *
 * The heart sits where the pupil was, at the same transform, so the eyes do
 * not slide when they change.
 */

/** Node-name substrings for the black dot we replace. */
const PUPIL_MATCH = /pupil/i
/** The catchlight sits on top of the pupil; it is kept, just nudged. */
const CATCHLIGHT_MATCH = /catchlight|glint/i

/** Eye parts this module finds by name when merging, so they never fold into the body. */
export function isHeartEyePart(name: string): boolean {
  return PUPIL_MATCH.test(name) || CATCHLIGHT_MATCH.test(name)
}

export function isPupilPart(name: string): boolean {
  return PUPIL_MATCH.test(name)
}

/**
 * The one heart-eye tint. Breeding reads as a single shared signal, so every
 * species wears the same candy pink rather than its own body colour; a cow's
 * near-black palette made its hearts read as a smudge instead of a heart.
 */
export const HEART_EYE_COLOR = '#ff5d7a'

/** Hearts are about a centimetre across, a touch bigger than the pupil they replace. */
const HEART_SCALE = 1.1

/**
 * Vertex attribute on every eye-merge geometry: 1 on a heart, 0 on a pupil or
 * catchlight. The shader collapses the vertices of whichever kind is hidden.
 */
export const HEART_PART_ATTRIBUTE = 'eyePart'

/**
 * The eye materials of one species. `plain` shows the pupils and catchlights,
 * `hearts` shows the hearts. Both are shared by every clone of the species, and
 * `eyes` counts the eyes the species has (2 for every species today).
 */
export interface HeartEyeSet {
  readonly id: string
  readonly plain: THREE.Material
  readonly hearts: THREE.Material
  eyes: number
}

/**
 * Every species' eye set, by id. A merged eye mesh carries its id in `userData`,
 * which clones copy. The material is not a reliable key: the paint-reveal
 * flourish swaps it out, and a heart stage can arrive during that flourish.
 */
const EYE_SETS = new Map<string, HeartEyeSet>()
const EYE_SET_KEY = 'heartEyeSet'
let nextEyeSetId = 0

/** Tag the merged eye meshes of `set`, so `setHeartEyes` can find them in any clone. */
export function tagHeartEyeMeshes(root: THREE.Object3D, set: HeartEyeSet): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material === set.plain) object.userData[EYE_SET_KEY] = set.id
  })
}

/**
 * A heart, extruded very slightly and built from two lobes and a point.
 * Kept deliberately small and low-poly: it sits about a centimetre across on
 * the model, so anything heavier is wasted triangles on every eye of every
 * animal.
 */
function createHeartGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.bezierCurveTo(0, -0.18, -0.5, 0.02, -0.5, 0.26)
  shape.bezierCurveTo(-0.5, 0.54, -0.16, 0.62, 0, 0.36)
  shape.bezierCurveTo(0.16, 0.62, 0.5, 0.54, 0.5, 0.26)
  shape.bezierCurveTo(0.5, 0.02, 0, -0.18, 0, -0.5)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSize: 0.06,
    bevelThickness: 0.05,
    bevelSegments: 2,
    curveSegments: 10,
  })
  geometry.center()
  // Indexed, like the GLB pupils, so the merge treats both as one layout.
  return mergeVertices(geometry)
}

let sharedHeartGeometry: THREE.BufferGeometry | null = null

function heartGeometry(): THREE.BufferGeometry {
  if (!sharedHeartGeometry) sharedHeartGeometry = createHeartGeometry()
  return sharedHeartGeometry
}

/**
 * Make the two eye materials for a species. The vertex colours carry the
 * pupil, catchlight and heart colours, so both materials are plain white.
 * Each gets its own `uEyeHearts` uniform through `installHeartEyeShader`.
 */
export function createHeartEyeMaterials(): HeartEyeSet {
  const plain = new THREE.MeshPhysicalMaterial({
    name: 'Animal eyes',
    vertexColors: true,
    roughness: 0.2,
    metalness: 0.01,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
  })
  const hearts = new THREE.MeshPhysicalMaterial({
    name: 'Animal heart eyes',
    vertexColors: true,
    roughness: 0.24,
    metalness: 0.02,
    emissive: new THREE.Color(HEART_EYE_COLOR).multiplyScalar(0.18),
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
  })
  installHeartEyeShader(plain, false)
  installHeartEyeShader(hearts, true)
  const set: HeartEyeSet = { id: `eyes-${nextEyeSetId}`, plain, hearts, eyes: 0 }
  nextEyeSetId += 1
  EYE_SETS.set(set.id, set)
  return set
}

/**
 * Collapse the eye vertices that the current mode hides. A collapsed vertex
 * scales to the origin, so its triangles have no area and draw nothing.
 * Pupils and catchlights collapse when `uEyeHearts` is 1, and hearts when it is 0.
 *
 * The shader hook is per material, so the wild mask installs it too: a wild
 * animal's eye mesh then shows its pupils and never its hearts.
 */
export function installHeartEyeShader(material: THREE.Material, hearts: boolean): void {
  material.customProgramCacheKey = () => 'balloon-heart-eyes-v1'
  const nodeKit = webgpuKit()
  if (nodeKit) {
    nodeKit.applyHeartEyes(material, hearts, HEART_PART_ATTRIBUTE)
    return
  }
  const uniform = { value: hearts ? 1 : 0 }
  const previousCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer)
    shader.uniforms.uEyeHearts = uniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float ${HEART_PART_ATTRIBUTE};
uniform float uEyeHearts;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed *= ${HEART_PART_ATTRIBUTE} > 0.5 ? uEyeHearts : 1.0 - uEyeHearts;`)
  }
}

/**
 * Add a heart sibling to a pupil (same parent, same transform), so it rides
 * the head pivot like the pupil does. Returns the heart, or null when the pupil
 * has no parent. The heart is a new mesh with the pink colour and the heart flag.
 */
export function addHeartEyePart(pupil: THREE.Mesh, set: HeartEyeSet): THREE.Mesh | null {
  if (!pupil.parent) return null
  const geometry = heartGeometry().clone()
  const heart = new THREE.Mesh(geometry, set.plain)
  heart.name = `heart for ${pupil.name}`
  pupil.parent.add(heart)
  heart.position.copy(pupil.position)
  heart.quaternion.copy(pupil.quaternion)
  // The heart geometry is unit-sized, so matching the pupil's own scale is
  // what keeps it the same size on the face whatever the model's scale is.
  heart.scale.copy(pupil.scale).multiplyScalar(HEART_SCALE)
  // Sit slightly proud of the face so it never z-fights with the eye.
  heart.position.y += HEART_SCALE * 0.06
  return heart
}

/** The eye set of a tagged eye mesh, or undefined for any other mesh. */
function eyeSetOf(object: THREE.Object3D): HeartEyeSet | undefined {
  if (!(object instanceof THREE.Mesh)) return undefined
  const id = object.userData[EYE_SET_KEY]
  return typeof id === 'string' ? EYE_SETS.get(id) : undefined
}

function eyeMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = []
  root.traverse((object) => {
    if (eyeSetOf(object)) found.push(object as THREE.Mesh)
  })
  return found
}

/**
 * Swap the black pupils for hearts. Returns the number of eyes converted so
 * the caller can warn about a species whose naming ever drifts.
 */
export function setHeartEyes(root: THREE.Object3D): number {
  let eyes = 0
  for (const mesh of eyeMeshes(root)) {
    const set = eyeSetOf(mesh)
    if (!set) continue
    mesh.userData.heartEyes = true
    // A mesh mid-flourish or on the wild mask keeps its material. The flag is
    // kept, so `applyHeartEyeMaterial` shows the hearts when it next goes standard.
    if (mesh.material === set.plain) mesh.material = set.hearts
    eyes = set.eyes
  }
  return eyes
}

/**
 * Restore an eye mesh's material after a palette change: hearts when the mesh
 * is wearing them, plain otherwise. Does nothing for a mesh that is not an eye mesh.
 */
export function applyHeartEyeMaterial(mesh: THREE.Mesh): void {
  const set = eyeSetOf(mesh)
  if (!set) return
  mesh.material = mesh.userData.heartEyes ? set.hearts : set.plain
}

/** How many heart eyes a species is currently wearing, for the debug report. */
export function heartEyeCount(root: THREE.Object3D): number {
  for (const mesh of eyeMeshes(root)) {
    const set = eyeSetOf(mesh)
    if (set && mesh.userData.heartEyes) return set.eyes
  }
  return 0
}

export function clearHeartEyes(root: THREE.Object3D): void {
  for (const mesh of eyeMeshes(root)) {
    mesh.userData.heartEyes = false
    const set = eyeSetOf(mesh)
    if (set && mesh.material === set.hearts) mesh.material = set.plain
  }
}
