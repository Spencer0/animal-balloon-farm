import * as THREE from 'three'
import { isHeartEyePart } from './animal-eyes'
import { mergeRigidParts, type MergeStaticMeshesReport } from '../scene/merge-static-meshes'

/**
 * Merge each species' parts into one rigidly skinned mesh per material, once,
 * before any animal clones the scene. The GLBs are node hierarchies (curls,
 * toes, markings), so an unmerged animal is ~55 draw calls; merged it is about
 * one per material. The animated nodes stay in the tree as bones, so the mixer
 * drives exactly what it drove before.
 *
 * Pivots are every node a clip animates plus every `rig` node, which the
 * capture flourish turns by name. Pupils and catchlights stay separate because
 * heart eyes hide them by name. Paint swaps work per mesh, so a merged mesh
 * simply swaps one material for many parts.
 */
export function mergeAnimalParts(scene: THREE.Object3D, clips: readonly THREE.AnimationClip[]): MergeStaticMeshesReport {
  const animated = new Set<string>()
  for (const clip of clips) {
    for (const track of clip.tracks) animated.add(THREE.PropertyBinding.parseTrackName(track.name).nodeName)
  }
  return mergeRigidParts(scene, {
    isPivot: (object) => animated.has(object.name) || /rig/i.test(object.name),
    keepMesh: (mesh) => isHeartEyePart(mesh.name),
  })
}

