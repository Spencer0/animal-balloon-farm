import * as THREE from 'three'
import { addHeartEyePart, createHeartEyeMaterials, HEART_EYE_COLOR, HEART_PART_ATTRIBUTE, isHeartEyePart, isPupilPart, tagHeartEyeMeshes, type HeartEyeSet } from './animal-eyes'
import { mergeRigidParts, type MergeStaticMeshesReport } from '../scene/merge-static-meshes'

/**
 * Merge each species' parts into one rigidly skinned mesh per material, once,
 * before any animal clones the scene. The GLBs are node hierarchies (curls,
 * toes, markings), so an unmerged animal is ~55 draw calls.
 *
 * Each part's colour moves into vertex colours, so the body draws with at most
 * two materials: a satin one and a brass one for the metal bell and its kin.
 * Every eye part (pupils, catchlights, the hearts) merges into one eye mesh that
 * heart mode swaps between two shared materials. A species costs about three
 * draw calls however many parts its GLB has. The animated nodes stay in the
 * tree as bones, so the mixer drives exactly what it drove before.
 *
 * Pivots are every node a clip animates plus every `rig` node, which the
 * capture flourish turns by name.
 */
export function mergeAnimalParts(scene: THREE.Object3D, clips: readonly THREE.AnimationClip[]): MergeStaticMeshesReport {
  const animated = new Set<string>()
  for (const clip of clips) {
    for (const track of clip.tracks) animated.add(THREE.PropertyBinding.parseTrackName(track.name).nodeName)
  }

  const eyes = createHeartEyeMaterials()
  const meshes: THREE.Mesh[] = []
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })

  const bodies = new Map<'satin' | 'brass', { readonly meshes: THREE.Mesh[]; readonly sources: THREE.MeshStandardMaterial[] }>()
  let pupils = 0
  for (const mesh of meshes) {
    if (mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.SkinnedMesh || mesh instanceof THREE.BatchedMesh) continue
    const source = mesh.material
    // Painting only applies to plain, untextured, opaque parts; anything else keeps its material.
    if (Array.isArray(source) || !(source instanceof THREE.MeshStandardMaterial) || source.map || source.alphaMap || source.transparent) {
      ensureEyePart(mesh.geometry)
      continue
    }
    if (isHeartEyePart(mesh.name)) {
      paintMesh(mesh, source.color, 0)
      mesh.material = eyes.plain
      if (isPupilPart(mesh.name) && addPupilHeart(mesh, eyes)) pupils += 1
      continue
    }
    paintMesh(mesh, source.color, 0)
    const finish = source.metalness >= 0.2 ? 'brass' : 'satin'
    const group = bodies.get(finish) ?? { meshes: [], sources: [] }
    group.meshes.push(mesh)
    group.sources.push(source)
    bodies.set(finish, group)
  }
  eyes.eyes = pupils

  for (const [finish, group] of bodies) {
    const material = bodyMaterial(finish, group.sources)
    for (const mesh of group.meshes) mesh.material = material
  }

  const report = mergeRigidParts(scene, {
    isPivot: (object) => animated.has(object.name) || /rig/i.test(object.name),
  })
  tagHeartEyeMeshes(scene, eyes)
  return report
}

/**
 * A heart sibling for one pupil, painted pink. It joins the eye mesh with its
 * pupil, so `setHeartEyes` only has to swap the material.
 */
function addPupilHeart(pupil: THREE.Mesh, eyes: HeartEyeSet): boolean {
  const heart = addHeartEyePart(pupil, eyes)
  if (!heart) return false
  paintMesh(heart, new THREE.Color(HEART_EYE_COLOR), 1)
  return true
}

/**
 * Give a mesh its own cloned geometry with its colour baked into a `color`
 * attribute, plus the eye-part flag. Cloning first keeps a shared source
 * geometry from being painted twice.
 */
function paintMesh(mesh: THREE.Mesh, color: THREE.Color, eyePart: number): void {
  const geometry = mesh.geometry.clone()
  const count = geometry.getAttribute('position').count
  const rgb = new Float32Array(count * 3)
  for (let vertex = 0; vertex < count; vertex += 1) {
    rgb[vertex * 3] = color.r
    rgb[vertex * 3 + 1] = color.g
    rgb[vertex * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3))
  geometry.setAttribute(HEART_PART_ATTRIBUTE, new THREE.Float32BufferAttribute(new Float32Array(count).fill(eyePart), 1))
  // A part without UVs would split its merge bucket from the rest, one extra draw per species.
  if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2))
  mesh.geometry = geometry
}

/** Non-painted parts still need the flag, so the wild mask's shader can read it. */
function ensureEyePart(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute(HEART_PART_ATTRIBUTE)) return
  const count = geometry.getAttribute('position').count
  geometry.setAttribute(HEART_PART_ATTRIBUTE, new THREE.Float32BufferAttribute(new Float32Array(count), 1))
}

/**
 * One body material for a finish, averaged from the parts it replaces. The
 * per-part colour lives in vertex colours, so the material itself is white.
 */
function bodyMaterial(finish: 'satin' | 'brass', sources: readonly THREE.MeshStandardMaterial[]): THREE.MeshPhysicalMaterial {
  const mean = (read: (source: THREE.MeshPhysicalMaterial) => number): number => {
    let total = 0
    for (const source of sources) total += read(source as THREE.MeshPhysicalMaterial)
    return total / sources.length
  }
  return new THREE.MeshPhysicalMaterial({
    name: `Animal ${finish} body · painted`,
    vertexColors: true,
    roughness: mean((source) => source.roughness ?? 0.3),
    metalness: mean((source) => source.metalness ?? 0),
    clearcoat: mean((source) => source.clearcoat ?? 0),
    clearcoatRoughness: mean((source) => source.clearcoatRoughness ?? 0.2),
  })
}
