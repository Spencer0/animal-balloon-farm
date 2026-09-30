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

export interface HeartEyeOptions {
  /** Palette accent, taken from the catalog so each species reads distinctly. */
  readonly color: string
  /** Uniform scale relative to the pupil it replaces. */
  readonly scale?: number
}

interface HeartEyes {
  readonly group: THREE.Group
  dispose(): void
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
export function setHeartEyes(root: THREE.Object3D, options: HeartEyeOptions): number {
  const existing = installed.get(root)
  if (existing) {
    existing.group.visible = true
    existing.group.traverse((object) => {
      if (!isMesh(object)) return
      const material = object.material as THREE.MeshStandardMaterial
      material.color.set(options.color)
    })
    return countPupils(root)
  }

  const group = new THREE.Group()
  group.name = 'Breedable heart eyes'
  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    roughness: 0.24,
    metalness: 0.02,
    emissive: new THREE.Color(options.color).multiplyScalar(0.18),
  })
  let converted = 0

  root.traverse((object) => {
    if (!isMesh(object) || !PUPIL_MATCH.test(object.name)) return
    const heart = new THREE.Mesh(heartGeometry(), material)
    heart.name = `heart for ${object.name}`
    // Match the pupil's placement and size, then let the heart sit slightly
    // proud of the face so it never z-fights with the eye it covers.
    heart.position.copy(object.position)
    heart.quaternion.copy(object.quaternion)
    const longest = longestSide(object)
    heart.scale.setScalar((options.scale ?? 1.15) * longest)
    object.updateWorldMatrix(true, false)
    heart.updateWorldMatrix(true, false)
    heart.position.y += longest * 0.12
    object.visible = false
    group.add(heart)
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

  group.visible = true
  installed.set(root, {
    group,
    dispose() {
      material.dispose()
      installed.delete(root)
    },
  })
  attachHearts(root, group)
  return converted
}

/** Put the heart group back where the model root lives so it inherits scale. */
function attachHearts(root: THREE.Object3D, group: THREE.Group): void {
  const parent = (root as THREE.Group).parent
  if (!parent) return
  parent.add(group)
  root.updateWorldMatrix(true, true)
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert()
  for (const heart of group.children) {
    heart.updateWorldMatrix(true, false)
    heart.applyMatrix4(rootInverse)
  }
}

export function clearHeartEyes(root: THREE.Object3D): void {
  const existing = installed.get(root)
  if (!existing) return
  for (const heart of existing.group.children) heart.visible = false
  existing.group.visible = false
  root.traverse((object) => {
    if (!isMesh(object)) return
    if (PUPIL_MATCH.test(object.name) || CATCHLIGHT_MATCH.test(object.name)) object.visible = true
  })
}

function disposeHeartEyes(root: THREE.Object3D): void {
  const existing = installed.get(root)
  if (!existing) return
  existing.group.parent?.remove(existing.group)
  existing.dispose()
}

function countPupils(root: THREE.Object3D): number {
  let count = 0
  root.traverse((object) => {
    if (isMesh(object) && PUPIL_MATCH.test(object.name)) count += 1
  })
  return count
}

function longestSide(mesh: THREE.Mesh): number {
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  if (!box) return 0.1
  const size = box.getSize(new THREE.Vector3())
  return Math.max(size.x, size.y, size.z) || 0.1
}

export { disposeHeartEyes }
