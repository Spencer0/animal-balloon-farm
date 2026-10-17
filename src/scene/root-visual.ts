import * as THREE from 'three'
import type { BlueberryLook, BlueberryVisual } from './blueberry-visual'
import { cloneRootVegetable, loadRootVegetable, type RootVegetableId } from './plant-models'

/**
 * How a root vegetable (carrot, potato, onion) looks at each moment of its
 * life, from its Blender model's groups (art/blender/root_vegetables.py). All
 * three share the same group names, so one visual grows them all:
 *
 * - Its bed is there from the moment it is planted, so a seedling has a
 *   footprint to see and to click.
 * - Its leaves rise one after another, and the root showing above ground (the
 *   carrot's shoulder, the potato's tubers, the onion's bulb) swells as it grows.
 *   A grown potato flowers.
 * - It shows what it needs before you read a marker: thirsty leaves flop
 *   outward, bugs sit on the leaves when pests come, and the thing a trim takes
 *   off (a bolting flower stalk, a leggy runner) springs up when it wants one.
 *
 * Each leaf pivots at its base and grows along its own length, so a leaf can be
 * scaled and bowed without its neighbours.
 */

export type RootVisual = BlueberryVisual

/** The vegetables are authored at garden size: about 0.55 m across the bed, 0.5 to 0.65 m tall grown. */
export const ROOT_GROWN_SCALE = 1

/** How tall a root vegetable stands at a growth, for markers and helpers. */
export function rootVegetableHeight(species: RootVegetableId, growth: number): number {
  const top = species === 'potato' ? 0.5 : species === 'onion' ? 0.62 : 0.58
  return 0.12 + (top - 0.12) * smoothstep(0.02, 0.75, growth)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Each leaf lags the one before by this much growth, so they rise one after another. */
const LEAF_LAG = 0.035
const UP = new THREE.Vector3(0, 1, 0)

interface Leaf {
  readonly object: THREE.Object3D
  readonly rest: THREE.Quaternion
  /** The horizontal axis the leaf bows around, tipping it outward and down. */
  readonly bowAxis: THREE.Vector3
  readonly lag: number
  readonly phase: number
}

export function createRootVisual(species: RootVegetableId): RootVisual {
  const root = new THREE.Group()
  root.name = `Root vegetable · ${species}`
  let model: THREE.Object3D | null = null
  let crown: THREE.Object3D | null = null
  let flowers: THREE.Object3D | null = null
  let pests: THREE.Object3D | null = null
  let shoot: THREE.Object3D | null = null
  const leaves: Leaf[] = []
  let pestsShown = 0
  let shootShown = 0
  let disposed = false
  const bow = new THREE.Quaternion()

  function attach(): void {
    if (model || disposed) return
    const clone = cloneRootVegetable(species)
    if (!clone) return
    model = clone
    crown = clone.getObjectByName('RV_crown') ?? null
    flowers = clone.getObjectByName('RV_flowers') ?? null
    pests = clone.getObjectByName('RV_pests') ?? null
    shoot = clone.getObjectByName('RV_shoot') ?? null
    for (let index = 1; ; index += 1) {
      const object = clone.getObjectByName(`RV_leaf_${index}`)
      if (!object) break
      // The leaf's length runs along its local +Y; its outward lean is that axis, flattened.
      const along = UP.clone().applyQuaternion(object.quaternion)
      const outward = new THREE.Vector3(along.x, 0, along.z)
      if (outward.lengthSq() < 1e-6) outward.set(Math.cos(index * 2.4), 0, Math.sin(index * 2.4))
      leaves.push({
        object,
        rest: object.quaternion.clone(),
        bowAxis: new THREE.Vector3().crossVectors(UP, outward.normalize()).normalize(),
        lag: ((index - 1) % 4) * LEAF_LAG,
        phase: index * 1.7,
      })
    }
    root.add(clone)
  }

  attach()
  if (!model) void loadRootVegetable(species).then(attach).catch(() => {})

  return {
    root,
    get ready() { return model !== null },
    update(look: BlueberryLook, elapsed: number, deltaSeconds: number): void {
      if (!model) {
        attach()
        if (!model) return
      }
      const growth = THREE.MathUtils.clamp(look.growth, 0, 1)
      const thirsty = look.care === 'water' && !look.answering
      if (crown) {
        // The root swells as the plant grows; it is a small bump in a seedling.
        const swell = 0.28 + 0.72 * smoothstep(0.12, 0.92, growth)
        crown.scale.setScalar(swell)
      }
      for (const leaf of leaves) {
        const rise = smoothstep(0.02 + leaf.lag, 0.7 + leaf.lag * 0.5, growth)
        leaf.object.visible = rise > 0.01
        const girth = 0.55 + 0.45 * rise
        leaf.object.scale.set(girth, Math.max(0.03, rise * (thirsty ? 0.9 : 1)), girth)
        // Sway, and a deep flop outward while thirsty.
        const sway = Math.sin(elapsed * (thirsty ? 0.9 : 1.6) + leaf.phase) * (thirsty ? 0.03 : 0.05)
        bow.setFromAxisAngle(leaf.bowAxis, sway + (thirsty ? 0.55 : 0))
        leaf.object.quaternion.copy(bow).multiply(leaf.rest)
      }
      if (flowers) {
        // A grown potato blooms; nothing asks for care once it is grown.
        const bloom = smoothstep(0.9, 1, growth)
        flowers.visible = bloom > 0.01 && !thirsty
        flowers.scale.setScalar(Math.max(0.001, bloom))
      }
      const wantPests = look.care === 'pest' && !look.answering ? 1 : 0
      pestsShown += (wantPests - pestsShown) * Math.min(1, deltaSeconds * 6)
      if (pests) {
        pests.visible = pestsShown > 0.05
        // They jostle as they feed.
        pests.scale.setScalar(Math.max(0.001, pestsShown * (1 + Math.sin(elapsed * 9) * 0.05)))
      }
      // The shoot springs up when a trim is due and snaps back once taken.
      const wantShoot = look.care === 'prune' && !look.answering ? 1 : 0
      shootShown += (wantShoot - shootShown) * Math.min(1, deltaSeconds * (wantShoot ? 5 : 12))
      if (shoot) {
        shoot.visible = shootShown > 0.02
        const wobble = 1 + Math.sin(elapsed * 6) * 0.05 * shootShown
        shoot.scale.setScalar(Math.max(0.001, shootShown * wobble))
      }
    },
    dispose(): void {
      disposed = true
      // Geometry and materials belong to the loaded template.
      root.clear()
      model = null
      crown = null
      flowers = null
      pests = null
      shoot = null
      leaves.length = 0
    },
  }
}

/** A grown root vegetable for the placement ghost and the care stage: nothing asking for care. */
export function cloneGrownRootVegetable(species: RootVegetableId): THREE.Object3D | null {
  const model = cloneRootVegetable(species)
  if (!model) return null
  model.traverse((object) => {
    if (object.name === 'RV_pests' || object.name === 'RV_shoot') object.visible = false
  })
  return model
}
