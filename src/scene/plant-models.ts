import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { PlantId } from '../game/plants'
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
/** The poppy (art/blender/poppy.py); its groups are listed in POPPY_PIVOTS. */
export const POPPY_URL = 'assets/plants/poppy.glb'

/**
 * The care casts: the critters of the flower, water, root and vine minigames,
 * authored in Blender (art/blender/*_care_cast.py). Loaded lazily, the first
 * time a game of that type opens, never at boot.
 */
export const CARE_CAST_URLS = {
  flower: 'assets/plants/flower-care-cast.glb',
  water: 'assets/plants/water-care-cast.glb',
  root: 'assets/plants/root-care-cast.glb',
  vine: 'assets/plants/vine-care-cast.glb',
} as const
export const CARE_CAST_CRITTERS = {
  flower: ['bee', 'dewdrop', 'aphid', 'burr', 'thorn', 'shears', 'stalk'],
  water: ['dragonfly', 'frog', 'fish', 'cattail', 'mosquito', 'log', 'snag', 'runner_leaf'],
  // art/blender/root_care_cast.py: trim pong, bug breakout and the barrel climb.
  root: ['pea', 'trowel', 'shoot', 'hoe', 'pebble', 'grub', 'beetle', 'shellbug', 'barrel', 'gopher', 'can', 'rainbarrel'],
  // art/blender/vine_care_cast.py: the pipe spin, the caterpillar squirt and the runner steer.
  vine: ['pump', 'trough', 'elbow', 'cross', 'rock', 'sprayer', 'caterpillar_head', 'caterpillar_body', 'trellis_leaf', 'bubble', 'tip', 'vine_leaf', 'blossom', 'peg'],
} as const
export type CareCastType = keyof typeof CARE_CAST_URLS
/** A critter name in one cast; the GLB root is `CRITTER_<name>`. */
export type CareCritterName<T extends CareCastType> = (typeof CARE_CAST_CRITTERS)[T][number]

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
const castModels = new Map<CareCastType, ReadonlyMap<string, THREE.Object3D>>()
const castPending = new Map<CareCastType, Promise<void>>()

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

/** Nodes that move on their own inside a care critter: wings, shears' blades, a frog's tongue, the can's legs, the gopher's arms. */
const CAST_PIVOTS = /^(wing_[LR]|blade_[AB]|tongue|leg_[LR]|arm_[LR])$/

function prepareCastCritter(node: THREE.Object3D): void {
  node.removeFromParent()
  node.position.set(0, 0, 0)
  mergeStaticMeshes(node, { isPivot: (object) => CAST_PIVOTS.test(object.name) })
  node.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    const material = object.material as THREE.Material
    if (material.transparent) {
      object.renderOrder = 2
      material.depthWrite = false
    }
  })
}

/**
 * Load one care cast (once). A missing or broken file logs a single warning and
 * resolves: its games then open without their critters rather than failing.
 */
export function loadCareCast(type: CareCastType): Promise<void> {
  if (castModels.has(type)) return Promise.resolve()
  const existing = castPending.get(type)
  if (existing) return existing
  const pendingCast = new GLTFLoader().loadAsync(CARE_CAST_URLS[type]).then(
    (gltf) => {
      const critters = new Map<string, THREE.Object3D>()
      for (const name of CARE_CAST_CRITTERS[type]) {
        const node = gltf.scene.getObjectByName(`CRITTER_${name}`)
        if (!node) continue
        prepareCastCritter(node)
        critters.set(name, node)
      }
      castModels.set(type, critters)
    },
    (error: unknown) => {
      console.warn(`[plants] could not load the ${type} care cast`, error)
      castModels.set(type, new Map())
    },
  )
  castPending.set(type, pendingCast)
  return pendingCast
}

/** A fresh clone of one cast critter, or null if the cast is not loaded or has no such critter. */
export function cloneCastCritter<T extends CareCastType>(type: T, name: CareCritterName<T>): THREE.Object3D | null {
  const source = castModels.get(type)?.get(name)
  return source ? source.clone(true) : null
}

/**
 * The poppy's groups, as GLTFLoader names them: the bed, the rosette, the stray
 * shoot, and per stalk N its stem, its head (holding bud and bloom) and its aphids.
 */
const POPPY_PIVOTS = /^PP_(mound|rosette|shoot|stalk_\d|head_\d|bud_\d|bloom_\d|aphids_\d)$/

let poppyModel: THREE.Object3D | null = null
let poppyPending: Promise<THREE.Object3D> | null = null

/** Start loading the poppy (once) and resolve when it is ready. */
export function loadPoppyModel(): Promise<THREE.Object3D> {
  if (poppyModel) return Promise.resolve(poppyModel)
  if (poppyPending) return poppyPending
  poppyPending = new GLTFLoader().loadAsync(POPPY_URL).then((gltf) => {
    const poppy = gltf.scene.getObjectByName('PP_root') ?? gltf.scene
    mergeStaticMeshes(poppy, { isPivot: (object) => POPPY_PIVOTS.test(object.name) })
    poppy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
    })
    poppyModel = poppy
    return poppy
  })
  poppyPending.catch((error: unknown) => {
    console.warn('[plants] could not load the poppy', error)
    poppyPending = null
  })
  return poppyPending
}

/** A fresh poppy clone in its fully grown pose, or null until the model has loaded. */
export function clonePoppy(): THREE.Object3D | null {
  return poppyModel ? poppyModel.clone(true) : null
}

/**
 * The root vegetables (art/blender/root_vegetables.py), one GLB each. They share
 * one set of group names (see ROOT_PIVOTS), so one visual grows all three.
 */
export const ROOT_VEGETABLE_URLS = {
  carrot: 'assets/plants/carrot.glb',
  potato: 'assets/plants/potato.glb',
  onion: 'assets/plants/onion.glb',
} as const
export type RootVegetableId = keyof typeof ROOT_VEGETABLE_URLS

export function isRootVegetable(species: PlantId): species is RootVegetableId {
  return species in ROOT_VEGETABLE_URLS
}

/** A root vegetable's groups: the bed, the root showing, each leaf, the potato's blossoms, the pests and the shoot a trim takes. */
const ROOT_PIVOTS = /^RV_(mound|crown|leaf_\d+|flowers|flowers_\d+|pests|shoot)$/

const rootModels = new Map<RootVegetableId, THREE.Object3D>()
const rootPending = new Map<RootVegetableId, Promise<THREE.Object3D>>()

/** Start loading one root vegetable (once) and resolve when it is ready. */
export function loadRootVegetable(id: RootVegetableId): Promise<THREE.Object3D> {
  const loaded = rootModels.get(id)
  if (loaded) return Promise.resolve(loaded)
  const existing = rootPending.get(id)
  if (existing) return existing
  const next = new GLTFLoader().loadAsync(ROOT_VEGETABLE_URLS[id]).then((gltf) => {
    const model = gltf.scene.getObjectByName('RV_root') ?? gltf.scene
    mergeStaticMeshes(model, { isPivot: (object) => ROOT_PIVOTS.test(object.name) })
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
    })
    rootModels.set(id, model)
    return model
  })
  rootPending.set(id, next)
  next.catch((error: unknown) => {
    console.warn(`[plants] could not load the ${id}`, error)
    rootPending.delete(id)
  })
  return next
}

/** Load all three root vegetables. */
export function loadRootVegetables(): Promise<unknown> {
  return Promise.all((Object.keys(ROOT_VEGETABLE_URLS) as RootVegetableId[]).map(loadRootVegetable))
}

/** A fresh clone of a root vegetable as authored (everything shown), or null until it has loaded. */
export function cloneRootVegetable(id: RootVegetableId): THREE.Object3D | null {
  const model = rootModels.get(id)
  return model ? model.clone(true) : null
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

/**
 * One clone of every critter a plant type's games can spawn (the bush's garden
 * critters, or a care cast), to put in a scene while its shaders precompile.
 * Clones share the source materials, so warming these warms every later spawn.
 */
export function cloneWholeCast(type: CareCastType | 'bush'): THREE.Object3D[] {
  const sources = type === 'bush' ? models?.critters : castModels.get(type)
  return sources ? [...sources.values()].map((source) => source.clone(true)) : []
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
