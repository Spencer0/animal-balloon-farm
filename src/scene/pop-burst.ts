import * as THREE from 'three'
import {
  POP_FEATHER_COUNT,
  POP_SHARD_COUNT,
  featherState,
  popFrame,
  ringState,
  scrapState,
  shardState,
} from '../game/pop-animation'

export interface PopBurst {
  readonly root: THREE.Object3D
  /** Advance the effect; returns false once nothing is left to draw. */
  update(deltaSeconds: number): boolean
  dispose(): void
}

export interface PopBurstOptions {
  /** Ground position of the animal when it was caught. */
  readonly position: THREE.Vector3
  /** The animal's body colour, which the latex shards and scrap are made from. */
  readonly color: string
  /** A second tone for every other shard, so the spray reads as pieces of a patterned balloon. */
  readonly accent: string
  /** Height of the middle of the balloon above the ground, for the bang. */
  readonly burstHeight: number
  /** The animal still standing there; swelled and hidden by the effect, never disposed by it. */
  readonly animal?: THREE.Object3D | null
}

/**
 * The pop and its clean-up, in the world. A balloon swells, bangs, throws a ring
 * and a spray of latex shards, and leaves a deflated scrap that flutters down and
 * is then tidied away. Timing lives in `src/game/pop-animation.ts`.
 */
export function createPopBurst(options: PopBurstOptions): PopBurst {
  const { position, burstHeight, animal } = options
  const root = new THREE.Group()
  root.name = 'Pop burst'
  root.position.copy(position)

  const baseScale = animal ? animal.scale.clone() : new THREE.Vector3(1, 1, 1)

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.3, side: THREE.DoubleSide, transparent: true })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: options.accent, roughness: 0.34, side: THREE.DoubleSide, transparent: true })
  // The scrap is solid until the moment it is tidied away, so it keeps its own material.
  const scrapMaterial = new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.36 })
  const featherMaterial = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.8, transparent: true })
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#fff0c4', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), ringMaterial)
  ring.name = 'Pop ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.14
  ring.visible = false
  root.add(ring)

  // One shard is a small triangle of latex; two materials alternate across the spray.
  const shardGeometry = new THREE.BufferGeometry()
  shardGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.12, 0, -0.08, 0.14, 0, -0.04, -0.02, 0, 0.13]), 3))
  shardGeometry.computeVertexNormals()
  const shards: THREE.Mesh[] = []
  for (let index = 0; index < POP_SHARD_COUNT; index += 1) {
    const shard = new THREE.Mesh(shardGeometry, index % 2 === 0 ? bodyMaterial : accentMaterial)
    shard.name = `Pop shard ${index + 1}`
    shard.visible = false
    root.add(shard)
    shards.push(shard)
  }

  const featherGeometry = new THREE.SphereGeometry(1, 10, 8)
  const feathers: THREE.Mesh[] = []
  for (let index = 0; index < POP_FEATHER_COUNT; index += 1) {
    const feather = new THREE.Mesh(featherGeometry, featherMaterial)
    feather.name = `Pop feather ${index + 1}`
    feather.scale.set(0.05, 0.015, 0.17)
    feather.visible = false
    root.add(feather)
    feathers.push(feather)
  }

  const scrap = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), scrapMaterial)
  scrap.name = 'Pop scrap'
  scrap.visible = false
  root.add(scrap)

  let elapsed = 0
  let banged = false

  return {
    root,
    update(deltaSeconds: number): boolean {
      elapsed += Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0)
      const frame = popFrame(elapsed)
      if (animal) {
        animal.scale.copy(baseScale).multiplyScalar(frame.swell)
        if (!frame.animalVisible) animal.visible = false
      }
      if (frame.burstAge === null) return true
      if (!banged) {
        banged = true
        ring.visible = true
        scrap.visible = true
        for (const shard of shards) shard.visible = true
        for (const feather of feathers) feather.visible = true
      }
      const age = frame.burstAge

      const ringFrame = ringState(age)
      ring.scale.setScalar(Math.max(0.001, ringFrame.scale))
      ringMaterial.opacity = ringFrame.alpha

      shards.forEach((shard, index) => {
        const state = shardState(index, age, burstHeight)
        shard.position.set(state.x, state.y, state.z)
        shard.rotation.set(state.spinX, index, state.spinZ)
        shard.scale.setScalar(Math.max(0.001, state.scale))
      })
      // The shared materials fade together; the per-shard curve is the same for all.
      const shardAlpha = shardState(0, age, burstHeight).alpha
      bodyMaterial.opacity = shardAlpha
      accentMaterial.opacity = shardAlpha
      for (const shard of shards) shard.visible = shardAlpha > 0.01

      feathers.forEach((feather, index) => {
        const state = featherState(index, age, burstHeight)
        feather.position.set(state.x, state.y, state.z)
        feather.rotation.set(state.roll, index * 1.3, state.roll * 0.5)
        feather.visible = state.alpha > 0.01
      })
      featherMaterial.opacity = featherState(0, age, burstHeight).alpha

      const scrapFrame = scrapState(age, burstHeight)
      scrap.visible = scrapFrame.scale > 0.01
      scrap.position.set(scrapFrame.sway, scrapFrame.y, scrapFrame.sway * 0.4)
      scrap.rotation.y = scrapFrame.spin
      const flat = scrapFrame.flat
      scrap.scale.set(
        (0.34 + 0.2 * flat) * scrapFrame.scale,
        Math.max(0.001, (0.3 - 0.265 * flat) * scrapFrame.scale),
        (0.3 + 0.12 * flat) * scrapFrame.scale,
      )
      return !frame.finished
    },
    dispose(): void {
      shardGeometry.dispose()
      featherGeometry.dispose()
      ring.geometry.dispose()
      scrap.geometry.dispose()
      bodyMaterial.dispose()
      scrapMaterial.dispose()
      accentMaterial.dispose()
      featherMaterial.dispose()
      ringMaterial.dispose()
      root.parent?.remove(root)
    },
  }
}
