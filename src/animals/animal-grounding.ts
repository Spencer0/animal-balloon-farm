import type * as THREE from 'three'

/** Clip samples taken per animation when finding where the feet really rest. */
const GROUNDING_SAMPLES = 12

/**
 * The lowest height the model reaches across every clip, measured in its
 * wrapper's space. Grounding has to use this, not the bind pose: the walk and
 * idle rigs stand higher than bind, so grounding the bind pose left the feet
 * roughly 0.7 units in the air during play.
 *
 * `measureMinY` returns the current lowest point of the model. Every node's
 * transform is restored afterwards, so the caller's pose is untouched.
 */
export function lowestClipPoseY(
  modelRoot: THREE.Object3D,
  mixer: THREE.AnimationMixer,
  clips: readonly THREE.AnimationClip[],
  measureMinY: () => number,
): number {
  const nodes: THREE.Object3D[] = []
  modelRoot.traverse((node) => { nodes.push(node) })
  const saved = nodes.map((node) => ({
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
  }))

  // Only clip poses count: the bind pose is exactly what sits too low.
  let lowest = Infinity
  for (const clip of clips) {
    const action = mixer.clipAction(clip)
    action.reset().play()
    for (let step = 0; step <= GROUNDING_SAMPLES; step += 1) {
      action.time = (clip.duration * step) / GROUNDING_SAMPLES
      mixer.update(0)
      lowest = Math.min(lowest, measureMinY())
    }
    action.stop()
  }
  mixer.stopAllAction()
  if (!Number.isFinite(lowest)) lowest = measureMinY()

  nodes.forEach((node, index) => {
    node.position.copy(saved[index].position)
    node.quaternion.copy(saved[index].quaternion)
    node.scale.copy(saved[index].scale)
  })
  return lowest
}
