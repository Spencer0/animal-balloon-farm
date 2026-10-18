import * as THREE from 'three'
import type { BlueberryLook, BlueberryVisual } from './blueberry-visual'
import { cloneVine, loadVine, type VineId } from './plant-models'

/**
 * How a vine (pumpkin, watermelon, cucumber) looks at each moment of its life,
 * from its Blender model's groups (art/blender/vines.py). All three share the
 * same group names, so one visual grows them all:
 *
 * - Its bed (with its straw, or the cucumber's teepee of canes) is there from
 *   the moment it is planted, so a seedling has a footprint to see and to click.
 * - Its stems creep out over the bed (or up the canes) and its leaves open one
 *   after another, the higher ones later. Yellow flowers come out while it
 *   grows, and the fruit swells from a little green bud to full size.
 * - It shows what it needs before you read a marker: thirsty leaves flop
 *   outward, caterpillars sit on the leaves when pests come, and the runaway
 *   runner a trim pegs down sprawls off the bed when it wants one.
 *
 * Each leaf pivots at the base of its stalk and grows along the stalk, so a leaf
 * can be scaled and bowed without its neighbours.
 */

export type VineVisual = BlueberryVisual

/** The vines are authored at garden size: about 0.75 m across the leaves (the cucumber's canes 0.75 m tall). */
export const VINE_GROWN_SCALE = 1

/** How tall a vine stands at a growth, for markers and helpers. The cucumber's canes stand tall from the start. */
export function vineHeight(species: VineId, growth: number): number {
  if (species === 'cucumber') return 0.8
  const top = species === 'pumpkin' ? 0.34 : 0.3
  return 0.1 + (top - 0.1) * smoothstep(0.02, 0.75, growth)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** The lag of the highest leaf on a climbing vine, and of each leaf after the last on a sprawling one. */
const CLIMB_LAG = 0.35
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

export function createVineVisual(species: VineId): VineVisual {
  const root = new THREE.Group()
  root.name = `Vine · ${species}`
  let model: THREE.Object3D | null = null
  let vines: THREE.Object3D | null = null
  let flowers: THREE.Object3D | null = null
  let pests: THREE.Object3D | null = null
  let shoot: THREE.Object3D | null = null
  const fruit: THREE.Object3D[] = []
  const leaves: Leaf[] = []
  let pestsShown = 0
  let shootShown = 0
  let disposed = false
  const bow = new THREE.Quaternion()

  function attach(): void {
    if (model || disposed) return
    const clone = cloneVine(species)
    if (!clone) return
    model = clone
    vines = clone.getObjectByName('VN_vines') ?? null
    flowers = clone.getObjectByName('VN_flowers') ?? null
    pests = clone.getObjectByName('VN_pests') ?? null
    shoot = clone.getObjectByName('VN_shoot') ?? null
    for (let index = 1; ; index += 1) {
      const object = clone.getObjectByName(`VN_fruit_${index}`)
      if (!object) break
      fruit.push(object)
    }
    const found: THREE.Object3D[] = []
    for (let index = 1; ; index += 1) {
      const object = clone.getObjectByName(`VN_leaf_${index}`)
      if (!object) break
      found.push(object)
    }
    // A climbing vine opens its leaves from the bed up; a sprawling one, one after another.
    const heights = found.map((object) => object.position.y)
    const low = Math.min(...heights)
    const spread = Math.max(...heights) - low
    found.forEach((object, index) => {
      // The stalk runs along its local +Y; its outward lean is that axis, flattened.
      const along = UP.clone().applyQuaternion(object.quaternion)
      const outward = new THREE.Vector3(along.x, 0, along.z)
      if (outward.lengthSq() < 1e-6) outward.set(Math.cos(index * 2.4), 0, Math.sin(index * 2.4))
      leaves.push({
        object,
        rest: object.quaternion.clone(),
        bowAxis: new THREE.Vector3().crossVectors(UP, outward.normalize()).normalize(),
        lag: spread > 0.1 ? CLIMB_LAG * (object.position.y - low) / spread : (index % 4) * LEAF_LAG,
        phase: index * 1.7,
      })
    })
    root.add(clone)
  }

  attach()
  if (!model) void loadVine(species).then(attach).catch(() => {})

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
      if (vines) vines.scale.setScalar(0.25 + 0.75 * smoothstep(0, 0.7, growth))
      for (const leaf of leaves) {
        const rise = smoothstep(0.02 + leaf.lag, 0.7 + leaf.lag * 0.5, growth)
        leaf.object.visible = rise > 0.01
        const girth = 0.3 + 0.7 * rise
        leaf.object.scale.set(girth, Math.max(0.03, rise * (thirsty ? 0.9 : 1)), girth)
        // Sway, and a deep flop outward while thirsty.
        const sway = Math.sin(elapsed * (thirsty ? 0.9 : 1.4) + leaf.phase) * (thirsty ? 0.03 : 0.04)
        bow.setFromAxisAngle(leaf.bowAxis, sway + (thirsty ? 0.5 : 0))
        leaf.object.quaternion.copy(bow).multiply(leaf.rest)
      }
      // The fruit sets as the flowers fade and swells from a small green bud.
      const swell = smoothstep(0.4, 0.92, growth)
      for (const one of fruit) {
        one.visible = growth > 0.38
        one.scale.setScalar(0.15 + 0.85 * swell)
      }
      if (flowers) {
        const bloom = smoothstep(0.26, 0.38, growth) * (1 - smoothstep(0.86, 0.97, growth))
        flowers.visible = bloom > 0.01 && !thirsty
        flowers.scale.setScalar(Math.max(0.001, bloom))
      }
      const wantPests = look.care === 'pest' && !look.answering ? 1 : 0
      pestsShown += (wantPests - pestsShown) * Math.min(1, deltaSeconds * 6)
      if (pests) {
        pests.visible = pestsShown > 0.05
        // They wriggle as they munch.
        pests.scale.setScalar(Math.max(0.001, pestsShown * (1 + Math.sin(elapsed * 7) * 0.04)))
      }
      // The runaway runner sprawls out when a trim is due and snaps back once pegged.
      const wantShoot = look.care === 'prune' && !look.answering ? 1 : 0
      shootShown += (wantShoot - shootShown) * Math.min(1, deltaSeconds * (wantShoot ? 4 : 12))
      if (shoot) {
        shoot.visible = shootShown > 0.02
        const wobble = 1 + Math.sin(elapsed * 5) * 0.04 * shootShown
        shoot.scale.set(Math.max(0.001, shootShown * wobble), Math.max(0.001, shootShown), Math.max(0.001, shootShown * wobble))
      }
    },
    dispose(): void {
      disposed = true
      // Geometry and materials belong to the loaded template.
      root.clear()
      model = null
      vines = null
      flowers = null
      pests = null
      shoot = null
      fruit.length = 0
      leaves.length = 0
    },
  }
}

/** A grown vine for the placement ghost and the care stage: nothing asking for care, no flowers. */
export function cloneGrownVine(species: VineId): THREE.Object3D | null {
  const model = cloneVine(species)
  if (!model) return null
  model.traverse((object) => {
    if (object.name === 'VN_pests' || object.name === 'VN_shoot' || object.name === 'VN_flowers') object.visible = false
  })
  return model
}
