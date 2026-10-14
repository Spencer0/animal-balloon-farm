import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeStaticMeshes } from './merge-static-meshes'

/**
 * The Blender-authored garden models (art/blender/blueberry_bush.py): the
 * blueberry bush and the cast of its care minigames. Loaded once, early, so a
 * bush appears the moment it is planted and a minigame opens without a wait.
 *
 * Templates are merged per node group (`BB_canopy`, `BB_berries`, ...), never
 * across one, so a clone can still show, hide and scale each group on its own.
 * Clones share geometry and materials with the template; anything a clone
 * recolours (the berries) is cloned by its owner.
 */

export const BLUEBERRY_BUSH_URL = 'assets/plants/blueberry-bush.glb'
export const GARDEN_CRITTERS_URL = 'assets/plants/garden-critters.glb'

export type CritterName = 'beetle' | 'ladybug' | 'leaf' | 'cloud' | 'swatter' | 'hedgehog'

/** The bush's groups, as GLTFLoader names them. */
export const BUSH_GROUPS = ['BB_mound', 'BB_canes', 'BB_canopy', 'BB_shoots', 'BB_flowers', 'BB_berries'] as const
export const HARVEST_BERRY_PIVOTS = ['BB_berry_1_1', 'BB_berry_1_2', 'BB_berry_1_3', 'BB_berry_2_1', 'BB_berry_2_2', 'BB_berry_2_3'] as const
export type BushGroup = (typeof BUSH_GROUPS)[number]

/** The berry material's name in the GLB; re-tinted per bush as the berries ripen. */
export const BERRY_MATERIAL = 'BB berry'

/** Nodes that move on their own inside a critter, so merging leaves them separate. */
const CRITTER_PIVOTS = /^CRITTER_(beetle_wing_[LR]|leaf_half_[LR])$/

interface GardenModels {
  readonly bush: THREE.Object3D
  readonly critters: ReadonlyMap<CritterName, THREE.Object3D>
}

let models: GardenModels | null = null
let pending: Promise<GardenModels> | null = null

function prepareBush(root: THREE.Object3D): THREE.Object3D {
  const bush = root.getObjectByName('BB_root') ?? root
  mergeStaticMeshes(bush, { isPivot: (object) => (BUSH_GROUPS as readonly string[]).includes(object.name) || (HARVEST_BERRY_PIVOTS as readonly string[]).includes(object.name) })
  bush.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
  })
  return bush
}

function prepareCritters(root: THREE.Object3D): Map<CritterName, THREE.Object3D> {
  const critters = new Map<CritterName, THREE.Object3D>()
  for (const name of ['beetle', 'ladybug', 'leaf', 'cloud', 'swatter', 'hedgehog'] as const) {
    const node = root.getObjectByName(`CRITTER_${name}`)
    if (!node) continue
    node.removeFromParent()
    node.position.set(0, 0, 0)
    mergeStaticMeshes(node, { isPivot: (object) => CRITTER_PIVOTS.test(object.name) })
    node.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      // Wings are see-through; drawing them after the body keeps them from hiding it.
      const material = object.material as THREE.Material
      if (material.transparent) {
        object.renderOrder = 2
        material.depthWrite = false
      }
    })
    critters.set(name, node)
  }
  return critters
}

/** Start loading (once) and resolve when both models are ready. */
export function loadGardenModels(): Promise<GardenModels> {
  if (models) return Promise.resolve(models)
  if (pending) return pending
  const loader = new GLTFLoader()
  pending = Promise.all([loader.loadAsync(BLUEBERRY_BUSH_URL), loader.loadAsync(GARDEN_CRITTERS_URL)]).then(([bush, critters]) => {
    models = { bush: prepareBush(bush.scene), critters: prepareCritters(critters.scene) }
    return models
  })
  pending.catch((error: unknown) => {
    console.warn('[plants] could not load the garden models', error)
    pending = null
  })
  return pending
}

/** A fresh bush clone, or null until the model has loaded. */
export function cloneBush(): THREE.Object3D | null {
  return models ? models.bush.clone(true) : null
}

/** A fresh critter clone, or null until the model has loaded. */
export function cloneCritter(name: CritterName): THREE.Object3D | null {
  const source = models?.critters.get(name)
  return source ? source.clone(true) : null
}

/**
 * Give a bush clone its own berry material so it can ripen on its own. The
 * returned material belongs to the caller, which disposes it.
 */
export function ownBerryMaterial(bush: THREE.Object3D): THREE.MeshStandardMaterial | null {
  let own: THREE.MeshStandardMaterial | null = null
  bush.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const material = object.material as THREE.Material
    if (material.name !== BERRY_MATERIAL || !(material instanceof THREE.MeshStandardMaterial)) return
    own ??= material.clone()
    object.material = own
  })
  return own
}

const GREEN_BERRY = new THREE.Color('#8fbf62')
const PINK_BERRY = new THREE.Color('#d86f8f')
const RIPE_BERRY = new THREE.Color('#3e4f9f')

/** Berry colour for a ripeness of 0 (hard and green) to 1 (dusty blue). */
export function berryColor(ripeness: number, target: THREE.Color): THREE.Color {
  const t = THREE.MathUtils.clamp(ripeness, 0, 1)
  if (t < 0.5) return target.copy(GREEN_BERRY).lerp(PINK_BERRY, t / 0.5)
  return target.copy(PINK_BERRY).lerp(RIPE_BERRY, (t - 0.5) / 0.5)
}
