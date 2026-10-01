import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * Loader for the Blender-authored UI props in `public/assets/ui`.
 *
 * Three rules, each of which was a visible bug before:
 *
 * 1. **One clone per caller.** The prop is fetched once, but every caller gets its
 *    own fitted copy. Returning a shared instance meant each `FarmButton` re-parented
 *    the same plaque mesh, so only the last button created kept its woodwork and
 *    the rest silently fell back to the flat canvas.
 * 2. **The caller owns the box.** `UI_PROPS` holds a default, but a caller may pass
 *    the size it actually laid out. A plaque fitted to a hard-coded 420x193 while
 *    the label plane was 300 wide made neighbouring tool cards overlap.
 * 3. **The anchor lives on the prop, not on the group.** `fitProp` bakes
 *    `anchorBelow` into the clone's offset and leaves the returned group's position
 *    at the origin, so laying out with `group.position.set(...)` cannot knock the
 *    prop out of its box -- which is exactly what the menu's layout was doing.
 */

export type UIPropId =
  | 'ui-button'
  | 'ui-signboard'
  | 'ui-bunting'
  | 'ui-mailbox'
  | 'ui-counter'
  | 'ui-shelf'
  | 'ui-crate'

export interface UIPropSpec {
  readonly id: UIPropId
  readonly url: string
  /** Default width x height in design units that the prop is fitted into. */
  readonly designWidth: number
  readonly designHeight: number
  /**
   * Fraction of the prop's fitted height that sits below the group's origin, 0..1.
   * Decor props are authored resting on the ground, so they need a different
   * anchor than a button that is already centred.
   */
  readonly anchorBelow: number
}

export const UI_PROPS: Readonly<Record<UIPropId, UIPropSpec>> = {
  'ui-button': { id: 'ui-button', url: 'assets/ui/ui-button.glb', designWidth: 420, designHeight: 193, anchorBelow: 0.5 },
  'ui-signboard': { id: 'ui-signboard', url: 'assets/ui/ui-signboard.glb', designWidth: 860, designHeight: 317, anchorBelow: 0.62 },
  'ui-bunting': { id: 'ui-bunting', url: 'assets/ui/ui-bunting.glb', designWidth: 1180, designHeight: 199, anchorBelow: 1 },
  'ui-mailbox': { id: 'ui-mailbox', url: 'assets/ui/ui-mailbox.glb', designWidth: 300, designHeight: 549, anchorBelow: 1 },
  // The storefront's furniture, authored by art/blender/shop_interior.py. Each
  // rests on the ground, so its anchor hangs the whole box below the origin.
  'ui-counter': { id: 'ui-counter', url: 'assets/ui/ui-counter.glb', designWidth: 380, designHeight: 200, anchorBelow: 1 },
  'ui-shelf': { id: 'ui-shelf', url: 'assets/ui/ui-shelf.glb', designWidth: 262, designHeight: 311, anchorBelow: 1 },
  'ui-crate': { id: 'ui-crate', url: 'assets/ui/ui-crate.glb', designWidth: 150, designHeight: 118, anchorBelow: 1 },
}

/** The box a caller wants a prop fitted into. */
export interface UIPropBox {
  readonly width: number
  readonly height: number
  /** Defaults to the spec's anchor. */
  readonly anchorBelow?: number
}

export interface LoadedUIProp {
  readonly object: THREE.Object3D
  dispose(): void
}

const loader = new GLTFLoader()
/** The one shared, pristine copy of each prop, kept unscaled and unpositioned. */
const sources = new Map<UIPropId, THREE.Object3D | 'loading' | 'failed'>()

/**
 * Returns a fitted copy of a prop, or `null` while it loads.
 * Safe to call every frame until it returns something; each call that succeeds
 * hands back an independent group the caller owns outright.
 */
export function requestUIProp(id: UIPropId, box?: UIPropBox): LoadedUIProp | null {
  const source = loadSource(id)
  if (!source) return null
  const spec = UI_PROPS[id]
  const object = fitProp(source, {
    width: box?.width ?? spec.designWidth,
    height: box?.height ?? spec.designHeight,
    anchorBelow: box?.anchorBelow ?? spec.anchorBelow,
  })
  return { object, dispose: () => disposeShared(object) }
}

function loadSource(id: UIPropId): THREE.Object3D | null {
  const existing = sources.get(id)
  if (existing === 'loading' || existing === 'failed') return null
  if (existing) return existing

  const spec = UI_PROPS[id]
  sources.set(id, 'loading')
  loader.load(
    spec.url,
    (gltf) => sources.set(id, gltf.scene),
    undefined,
    () => {
      // A missing prop must not take the screen down; the canvas fallback stands in.
      console.warn(`[ui] could not load prop ${id} from ${spec.url}`)
      sources.set(id, 'failed')
    },
  )
  return null
}

/**
 * Clones a prop and scales/re-centres the clone so it occupies exactly `box`.
 *
 * The returned group's position is left at the origin: the box's own offset is
 * baked into the clone, so a caller can place the group anywhere and the prop
 * still lands where it was asked to.
 */
function fitProp(source: THREE.Object3D, box: Required<UIPropBox>): THREE.Group {
  const wrapper = new THREE.Group()
  wrapper.name = 'UI prop'
  const clone = source.clone(true)
  wrapper.add(clone)

  // Measure the clone, not the shared source, so concurrent fits never disagree.
  const bounds = new THREE.Box3().setFromObject(clone)
  const size = bounds.getSize(new THREE.Vector3())
  const centre = bounds.getCenter(new THREE.Vector3())
  const scale = Math.min(
    box.width / Math.max(0.0001, size.x),
    box.height / Math.max(0.0001, size.y),
  )
  clone.scale.setScalar(scale)
  // Re-centre horizontally and vertically, then shift so that `anchorBelow` of the
  // box's height hangs below the wrapper's origin.
  clone.position.set(
    -centre.x * scale,
    -centre.y * scale + (0.5 - box.anchorBelow) * box.height,
    0,
  )

  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = false
    object.receiveShadow = false
    object.renderOrder = 1
  })
  return wrapper
}

/** Frees only the geometry/material this clone owns; the source stays cached. */
function disposeShared(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const material = object.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
  })
}
