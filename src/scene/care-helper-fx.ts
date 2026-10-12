import * as THREE from 'three'
import type { PlantCare } from '../game/plants'
import { cloneCritter } from './plant-models'
import { createBurst, createRainShower, springOut, type BurstPool } from './garden-bursts'

/**
 * A hired helper doing its chore on a plant (see game/plant-helpers.ts):
 *
 *   water  the Pet Raincloud puffs in over the plant and rains on it
 *   pest   three ladybugs fly in, circle the leaves eating beetles, and leave
 *   prune  the hedgehog pops out of the soil, snips, and ducks back down
 *
 * Each plays for a couple of seconds. `resolveAt` is the moment the chore
 * counts as done (the rain lands, the last beetle is eaten, the shoot is cut);
 * the plant's need disappears then, not when the helper leaves.
 */

export interface HelperFx {
  readonly root: THREE.Group
  readonly care: PlantCare
  /** Seconds into the effect when the chore is done. */
  readonly resolveAt: number
  readonly age: number
  /** Advance; false once the helper has left (and freed its own parts). */
  update(deltaSeconds: number): boolean
  dispose(): void
}

const DURATION: Readonly<Record<PlantCare, number>> = { water: 2.6, pest: 3, prune: 2.3 }
const RESOLVE_AT: Readonly<Record<PlantCare, number>> = { water: 1.5, pest: 1.9, prune: 1.05 }

/**
 * `height` is how tall the plant stands (metres, before `root` is placed at
 * its foot); `bursts` receives the leaf confetti and splashes.
 */
export function createHelperFx(care: PlantCare, height: number, bursts: BurstPool): HelperFx {
  const root = new THREE.Group()
  root.name = `Garden helper: ${care}`
  const duration = DURATION[care]
  let age = 0
  let disposed = false
  let resolvedBurst = false
  const owned: Array<{ dispose(): void }> = []

  // ---- Pet Raincloud
  const cloud = care === 'water' ? cloneCritter('cloud') : null
  const shower = care === 'water' ? createRainShower(0.5, height + 0.75, 40) : null
  if (cloud && shower) {
    cloud.scale.setScalar(0.0001)
    root.add(cloud, shower.root)
    owned.push(shower)
  }

  // ---- Ladybug Lodge
  const ladybugs = care === 'pest'
    ? [0, 1, 2].map((index) => {
      const bug = cloneCritter('ladybug')
      if (bug) {
        bug.scale.setScalar(1.3)
        root.add(bug)
      }
      return { bug, phase: index / 3 * Math.PI * 2, from: index / 3 * Math.PI * 2 + 0.6 }
    })
    : []

  // ---- Hedgehog Snipper
  const hedgehog = care === 'prune' ? cloneCritter('hedgehog') : null
  if (hedgehog) {
    hedgehog.scale.setScalar(0.0001)
    root.add(hedgehog)
  }

  const fx: HelperFx = {
    root,
    care,
    resolveAt: RESOLVE_AT[care],
    get age() { return age },
    update(deltaSeconds): boolean {
      if (disposed) return false
      age += deltaSeconds
      if (age >= duration) {
        fx.dispose()
        return false
      }
      const leaving = THREE.MathUtils.clamp((age - (duration - 0.45)) / 0.45, 0, 1)
      if (cloud && shower) {
        const arrive = springOut(Math.min(1, age / 0.55))
        const scale = 1.5 * arrive * (1 - leaving)
        cloud.scale.set(scale * (1 + Math.sin(age * 9) * 0.04), scale * (1 - Math.sin(age * 9) * 0.04), scale)
        cloud.position.set(Math.sin(age * 1.4) * 0.08, height + 0.75 + Math.sin(age * 2.2) * 0.05, 0)
        shower.root.position.set(cloud.position.x, height + 0.62, 0)
        shower.intensity = age < 0.5 ? 0 : 1 - leaving
        shower.update(deltaSeconds)
      }
      for (const { bug, phase, from } of ladybugs) {
        if (!bug) continue
        // In along a swoop, round the bush twice, then off the way they came.
        const inT = THREE.MathUtils.clamp(age / 0.6, 0, 1)
        const outT = THREE.MathUtils.clamp((age - (duration - 0.6)) / 0.6, 0, 1)
        const angle = phase + age * 4.2
        const orbit = new THREE.Vector3(Math.cos(angle) * 0.55, height * 0.65 + Math.sin(age * 7 + phase) * 0.08, Math.sin(angle) * 0.55)
        const away = new THREE.Vector3(Math.cos(from) * 3, height + 1.6, Math.sin(from) * 3)
        const at = inT < 1 ? away.clone().lerp(orbit, 1 - (1 - inT) ** 2) : orbit.clone().lerp(away, outT * outT)
        const heading = at.clone().sub(bug.position)
        bug.position.copy(at)
        if (heading.lengthSq() > 1e-6) bug.rotation.y = Math.atan2(-heading.x, -heading.z)
        bug.rotation.z = Math.sin(age * 20 + phase) * 0.2
      }
      if (hedgehog) {
        const up = springOut(Math.min(1, age / 0.45))
        const down = THREE.MathUtils.clamp((age - (duration - 0.4)) / 0.4, 0, 1)
        const scale = 2.1 * up * (1 - down)
        hedgehog.scale.setScalar(Math.max(0.0001, scale))
        hedgehog.position.set(0.62, Math.sin(Math.min(1, age / 0.45) * Math.PI) * 0.18, 0.35)
        hedgehog.rotation.y = Math.atan2(-0.62, -0.35) + Math.PI
        // Snip-snip: a quick nod while the shears work.
        hedgehog.rotation.x = age > 0.5 && age < 1.4 ? Math.sin(age * 28) * 0.08 : 0
      }
      if (!resolvedBurst && age >= RESOLVE_AT[care]) {
        resolvedBurst = true
        const centre = new THREE.Vector3(0, height * 0.7, 0)
        if (care === 'prune') {
          bursts.add(createBurst(centre, { count: 22, colors: ['#9bc85b', '#7fb64f', '#b9db7a'], size: 0.05, speed: [1.4, 2.6], lift: 1.4, gravity: 6, seconds: 1.1, shape: 'leaf' }), root)
        } else if (care === 'pest') {
          bursts.add(createBurst(centre, { count: 10, colors: ['#ffe17a', '#fff1b3'], size: 0.06, speed: [0.8, 1.6], lift: 1, gravity: 2, seconds: 0.9, shape: 'star' }), root)
        } else {
          bursts.add(createBurst(new THREE.Vector3(0, 0.08, 0), { count: 16, colors: ['#8fd0ea', '#bfe8f5'], size: 0.035, speed: [0.8, 1.5], lift: 1.2, gravity: 8, seconds: 0.7 }), root)
        }
      }
      return true
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      for (const part of owned) part.dispose()
      root.removeFromParent()
      root.clear()
    },
  }
  return fx
}
