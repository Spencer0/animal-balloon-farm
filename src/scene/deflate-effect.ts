import * as THREE from 'three'
import { DEFLATE_PUFF_COUNT, deflateFrame, puffState } from '../game/deflate-animation'
import type { PopBurst } from './pop-burst'

export interface DeflateOptions {
  /** Ground position of the animal as it starts to go flat. */
  readonly position: THREE.Vector3
  /** Height of the middle of the balloon above the ground, for the air puffs. */
  readonly height: number
  /** The animal still standing there; squashed and hidden by the effect, never disposed by it. */
  readonly animal?: THREE.Object3D | null
}

/**
 * A balloon animal running out of helium: it sags, flattens, lies there, then
 * shrinks away, with soft puffs of air escaping. Timing lives in
 * `src/game/deflate-animation.ts`. Shares `PopBurst`'s shape so the same
 * in-flight list tidies it up.
 */
export function createDeflateEffect(options: DeflateOptions): PopBurst {
  const { position, height, animal } = options
  const root = new THREE.Group()
  root.name = 'Deflate'
  root.position.copy(position)

  const baseScale = animal ? animal.scale.clone() : new THREE.Vector3(1, 1, 1)
  const puffMaterial = new THREE.MeshBasicMaterial({ color: '#fff7e4', transparent: true, opacity: 0, depthWrite: false })
  const puffGeometry = new THREE.SphereGeometry(1, 12, 8)
  const puffs: THREE.Mesh[] = []
  for (let index = 0; index < DEFLATE_PUFF_COUNT; index += 1) {
    const puff = new THREE.Mesh(puffGeometry, puffMaterial)
    puff.name = `Air puff ${index + 1}`
    puff.visible = false
    root.add(puff)
    puffs.push(puff)
  }

  let elapsed = 0
  return {
    root,
    update(deltaSeconds: number): boolean {
      elapsed += Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0)
      const frame = deflateFrame(elapsed)
      if (animal) {
        animal.scale.set(baseScale.x * frame.scaleX, baseScale.y * frame.scaleY, baseScale.z * frame.scaleZ)
        if (frame.finished) animal.visible = false
      }
      let strongest = 0
      puffs.forEach((puff, index) => {
        const state = puffState(index, frame.age, height)
        puff.visible = state.alpha > 0.01
        puff.position.set(state.x, state.y, state.z)
        puff.scale.setScalar(Math.max(0.001, state.scale))
        strongest = Math.max(strongest, state.alpha)
      })
      puffMaterial.opacity = strongest
      return !frame.finished
    },
    dispose(): void {
      puffGeometry.dispose()
      puffMaterial.dispose()
      root.parent?.remove(root)
    },
  }
}
