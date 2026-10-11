import * as THREE from 'three'

/** Slack around a model's rest-pose box, so a posed limb outside it is still tested. */
const BOX_PAD = 0.35

const box = new THREE.Box3()
const sphere = new THREE.Sphere()
const vertex = new THREE.Vector3()
const cornerA = new THREE.Vector3()
const cornerB = new THREE.Vector3()
const cornerC = new THREE.Vector3()
const hitPoint = new THREE.Vector3()
const hits: THREE.Intersection[] = []
const raycaster = new THREE.Raycaster()
let posed = new Float32Array(0)

/**
 * Distance along `ray` to the nearest visible mesh of `root`, or Infinity.
 *
 * `SkinnedMesh.raycast` poses all three corners of every triangle on the CPU,
 * so each shared vertex is skinned about six times. Here the ray first has to
 * cross the model's padded box, then each skinned mesh is posed once per vertex
 * and its triangles are tested against the cached world positions. Callers that
 * ask repeatedly (hover, cursor, press) should also memoise per pointer spot.
 */
export function nearestRayHit(ray: THREE.Ray, root: THREE.Object3D): number {
  box.setFromObject(root).expandByScalar(BOX_PAD)
  if (!ray.intersectsBox(box)) return Infinity
  let nearest = Infinity
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return
    const distance = object instanceof THREE.SkinnedMesh ? skinnedHit(ray, object) : plainHit(ray, object)
    if (distance < nearest) nearest = distance
  })
  return nearest
}

function plainHit(ray: THREE.Ray, mesh: THREE.Mesh): number {
  raycaster.ray.copy(ray)
  hits.length = 0
  mesh.raycast(raycaster, hits)
  let nearest = Infinity
  for (const hit of hits) nearest = Math.min(nearest, hit.distance)
  return nearest
}

function skinnedHit(ray: THREE.Ray, mesh: THREE.SkinnedMesh): number {
  const geometry = mesh.geometry
  const position = geometry.getAttribute('position')
  if (!position) return Infinity
  if (mesh.boundingSphere === null) mesh.computeBoundingSphere()
  if (!ray.intersectsSphere(sphere.copy(mesh.boundingSphere!).applyMatrix4(mesh.matrixWorld))) return Infinity
  if (posed.length < position.count * 3) posed = new Float32Array(position.count * 3)
  for (let index = 0; index < position.count; index += 1) {
    mesh.getVertexPosition(index, vertex)
    vertex.applyMatrix4(mesh.matrixWorld).toArray(posed, index * 3)
  }
  const indices = geometry.index
  const triangles = (indices ? indices.count : position.count) / 3
  const cull = !Array.isArray(mesh.material) && mesh.material.side === THREE.FrontSide
  let nearest = Infinity
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const a = indices ? indices.getX(triangle * 3) : triangle * 3
    const b = indices ? indices.getX(triangle * 3 + 1) : triangle * 3 + 1
    const c = indices ? indices.getX(triangle * 3 + 2) : triangle * 3 + 2
    cornerA.fromArray(posed, a * 3)
    cornerB.fromArray(posed, b * 3)
    cornerC.fromArray(posed, c * 3)
    if (!ray.intersectTriangle(cornerA, cornerB, cornerC, cull, hitPoint)) continue
    nearest = Math.min(nearest, hitPoint.distanceTo(ray.origin))
  }
  return nearest
}
