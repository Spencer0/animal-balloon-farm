import * as THREE from 'three'

/**
 * Heart eyes: the one cosmetic that marks a breedable animal.
 *
 * The GLBs already name their face parts precisely (`COW · near dark pupil`,
 * `COW · near starry catchlight`), so the conversion is a runtime mesh swap
 * keyed on those names rather than a Blender re-export. That matters: the
 * standard -> hearts transition is something the player triggers and undoes
 * during play, and a baked asset would make it a reload.
 *
 * The pupil is hidden and a heart is drawn in its place at the same transform,
 * so the eyes do not slide when they change.
 */

/** Node-name substrings for the black dot we replace. */
const PUPIL_MATCH = /pupil/i
/** The catchlight sits on top of the pupil; it is kept, just nudged. */
const CATCHLIGHT_MATCH = /catchlight|glint/i

/**
 * The one heart-eye tint. Breeding reads as a single shared signal, so every
 * species wears the same candy pink rather than its own body colour; a cow's
 * near-black palette made its hearts read as a smudge instead of a heart.
 */
export const HEART_EYE_COLOR = '#ff5d7a'

export interface HeartEyeOptions {
  /** Heart tint; defaults to the shared breeding pink. */
  readonly color?: string
  /** Uniform scale relative to the pupil it replaces. */
  readonly scale?: number
}

interface HeartEyes {
  readonly hearts: readonly THREE.Mesh[]
  readonly material: THREE.Material
}

const installed = new WeakMap<THREE.Object3D, HeartEyes>()

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
  return geometry
}

let sharedHeartGeometry: THREE.BufferGeometry | null = null

function heartGeometry(): THREE.BufferGeometry {
  if (!sharedHeartGeometry) sharedHeartGeometry = createHeartGeometry()
  return sharedHeartGeometry
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh
}

/**
 * Swap the black pupils for hearts. Returns the number of eyes converted so
 * the caller can warn about a species whose naming ever drifts.
 */
export function setHeartEyes(root: THREE.Object3D, options: HeartEyeOptions = {}): number {
  const color = options.color ?? HEART_EYE_COLOR
  const existing = installed.get(root)
  if (existing) {
    (existing.material as THREE.MeshStandardMaterial).color.set(color)
    return existing.hearts.length
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.24,
    metalness: 0.02,
    emissive: new THREE.Color(color).multiplyScalar(0.18),
  })
  const hearts: THREE.Mesh[] = []
  let converted = 0

  root.traverse((object) => {
    if (!isMesh(object) || !PUPIL_MATCH.test(object.name)) return
    const heart = new THREE.Mesh(heartGeometry(), material)
    heart.name = `heart for ${object.name}`
    // The heart is added as a *sibling* of the pupil, copying its local
    // transform. Pupils are children of a head rig pivot, so parenting to the
    // pivot is what makes the heart follow the head's idle and walk motion
    // automatically -- and it avoids any world-matrix math, which is how the
    // first attempt ended up hanging off in root space.
    if (!object.parent) return
    object.parent.add(heart)
    heart.position.copy(object.position)
    heart.quaternion.copy(object.quaternion)
    // The heart geometry is unit-sized, so matching the pupil's own scale is
    // what keeps it the same size on the face whatever the model's scale is.
    heart.scale.copy(object.scale).multiplyScalar(options.scale ?? 1.1)
    // Sit slightly proud of the face so it never z-fights with the eye.
    heart.position.y += (options.scale ?? 1.1) * 0.06
    object.visible = false
    hearts.push(heart)
    converted += 1
  })

  if (converted === 0) {
    material.dispose()
    return 0
  }

  // The catchlight rides on the pupil; hide it while the hearts are in, or it
  // floats over a shape that is no longer there.
  root.traverse((object) => {
    if (isMesh(object) && CATCHLIGHT_MATCH.test(object.name)) object.visible = false
  })

  installed.set(root, { hearts, material })
  return converted
}

/** How many heart eyes a species is currently wearing, for the debug report. */
export function heartEyeCount(root: THREE.Object3D): number {
  return installed.get(root)?.hearts.length ?? 0
}

export function clearHeartEyes(root: THREE.Object3D): void {
  const existing = installed.get(root)
  if (!existing) return
  for (const heart of existing.hearts) {
    // Detach rather than just hide: the heart is a sibling of the pupil under
    // the head pivot, so removing it is what actually takes it off the face.
    heart.parent?.remove(heart)
  }
  root.traverse((object) => {
    if (!isMesh(object)) return
    if (PUPIL_MATCH.test(object.name) || CATCHLIGHT_MATCH.test(object.name)) object.visible = true
  })
  // Fully undo, including the bookkeeping. Leaving the entry behind kept the
  // hearts off the face but still reported them, which made the debug report
  // claim a species was breeding when it was not.
  existing.material.dispose()
  installed.delete(root)
}

function disposeHeartEyes(root: THREE.Object3D): void {
  clearHeartEyes(root)
}

export { disposeHeartEyes }
