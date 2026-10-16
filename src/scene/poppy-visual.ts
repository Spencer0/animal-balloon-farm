import * as THREE from 'three'
import type { BlueberryLook, BlueberryVisual } from './blueberry-visual'
import { clonePoppy, loadPoppyModel } from './plant-models'

/**
 * How a poppy looks at each moment of its life, from the Blender model's
 * groups (art/blender/poppy.py):
 *
 * - Its bed of tilled soil is there from the moment it is planted, so even a
 *   seedling has a footprint to see and to click.
 * - A rosette of lobed leaves comes first, then three stalks rise one after
 *   another, each with a hairy bud that nods on its neck. The buds straighten
 *   up and split into scarlet cups as the poppy matures.
 * - It shows what it needs before you read a marker: thirsty stalks bow and
 *   their blooms hang, aphids cluster on the stems when pests come, and one
 *   leggy shoot sticks out of the rosette when it wants a pinch.
 *
 * A stalk stretches as it grows, so its head and aphids are not its children
 * (they would squash). Each rides its stalk instead: its place in the stalk's
 * frame is measured once from the authored pose and re-applied every frame.
 */

export type PoppyLook = BlueberryLook
export type PoppyVisual = BlueberryVisual

/** The poppy is authored at garden size: about 0.6 m across its bed, 0.75 m tall in bloom. */
export const POPPY_GROWN_SCALE = 1

/** How tall the poppy stands at a growth, for markers and helpers. */
export function poppyHeight(growth: number): number {
  return 0.12 + 0.62 * smoothstep(0.08, 0.75, growth)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Each stalk lags the one before by this much growth, so they rise one after another. */
const STALK_LAG = 0.05
const UP = new THREE.Vector3(0, 1, 0)

/** Something that rides a stalk: a head or a cluster of aphids. */
interface Rider {
  readonly object: THREE.Object3D
  /** Where it sits in its stalk's frame, measured from the authored pose. */
  readonly local: THREE.Vector3
  readonly rest: THREE.Quaternion
}

interface Stalk {
  readonly object: THREE.Object3D
  /** The horizontal axis a stalk bows around: tipping it outward, away from the crown. */
  readonly bowAxis: THREE.Vector3
  readonly head: Rider | null
  readonly bud: THREE.Object3D | null
  readonly bloom: THREE.Object3D | null
  readonly aphids: Rider | null
  readonly lag: number
}

export function createPoppyVisual(): PoppyVisual {
  const root = new THREE.Group()
  root.name = 'Poppy'
  let poppy: THREE.Object3D | null = null
  let rosette: THREE.Object3D | null = null
  let shoot: THREE.Object3D | null = null
  const stalks: Stalk[] = []
  let shootShown = 0
  let aphidsShown = 0
  let disposed = false
  const bow = new THREE.Quaternion()
  const nod = new THREE.Quaternion()

  function rider(object: THREE.Object3D | undefined, stalk: THREE.Object3D): Rider | null {
    if (!object) return null
    stalk.updateMatrix()
    const local = object.position.clone().applyMatrix4(stalk.matrix.clone().invert())
    return { object, local, rest: object.quaternion.clone() }
  }

  function attach(): void {
    if (poppy || disposed) return
    const clone = clonePoppy()
    if (!clone) return
    poppy = clone
    rosette = clone.getObjectByName('PP_rosette') ?? null
    shoot = clone.getObjectByName('PP_shoot') ?? null
    for (let index = 1; ; index += 1) {
      const object = clone.getObjectByName(`PP_stalk_${index}`)
      if (!object) break
      const outward = new THREE.Vector3(object.position.x, 0, object.position.z)
      if (outward.lengthSq() < 1e-8) outward.set(1, 0, 0)
      stalks.push({
        object,
        bowAxis: new THREE.Vector3().crossVectors(UP, outward.normalize()).normalize(),
        head: rider(clone.getObjectByName(`PP_head_${index}`), object),
        bud: clone.getObjectByName(`PP_bud_${index}`) ?? null,
        bloom: clone.getObjectByName(`PP_bloom_${index}`) ?? null,
        aphids: rider(clone.getObjectByName(`PP_aphids_${index}`), object),
        lag: (index - 1) * STALK_LAG,
      })
    }
    root.add(clone)
  }

  attach()
  if (!poppy) void loadPoppyModel().then(attach).catch(() => {})

  return {
    root,
    get ready() { return poppy !== null },
    update(look, elapsed, deltaSeconds): void {
      if (!poppy) {
        attach()
        if (!poppy) return
      }
      const growth = THREE.MathUtils.clamp(look.growth, 0, 1)
      const thirsty = look.care === 'water' && !look.answering
      if (rosette) {
        const leafy = 0.4 + 0.6 * smoothstep(0, 0.45, growth)
        // A thirsty rosette flattens out on the soil.
        rosette.scale.set(leafy, leafy * (thirsty ? 0.7 : 1), leafy)
      }

      const wantAphids = look.care === 'pest' && !look.answering ? 1 : 0
      aphidsShown += (wantAphids - aphidsShown) * Math.min(1, deltaSeconds * 6)
      stalks.forEach((stalk, index) => {
        const rise = smoothstep(0.08 + stalk.lag, 0.7 + stalk.lag * 0.5, growth)
        stalk.object.visible = rise > 0.01
        const girth = 0.6 + 0.4 * rise
        stalk.object.scale.set(girth, Math.max(0.02, rise * (thirsty ? 0.9 : 1)), girth)
        // Sway, and a deep bow outward while thirsty.
        const sway = Math.sin(elapsed * (thirsty ? 0.9 : 1.7) + index * 2.1) * (thirsty ? 0.03 : 0.06)
        bow.setFromAxisAngle(stalk.bowAxis, sway + (thirsty ? 0.32 : 0))
        stalk.object.quaternion.copy(bow)
        stalk.object.updateMatrix()

        // A bud appears, nods on its neck, then straightens and opens into a cup.
        const budding = smoothstep(0.2 + stalk.lag, 0.32 + stalk.lag, growth)
        const open = smoothstep(0.68 + stalk.lag * 0.5, 0.86 + stalk.lag * 0.5, growth)
        const straighten = smoothstep(0.6 + stalk.lag * 0.5, 0.78 + stalk.lag * 0.5, growth)
        if (stalk.bud) {
          const size = budding * (1 - open)
          stalk.bud.visible = size > 0.01
          stalk.bud.scale.setScalar(Math.max(0.001, size))
        }
        if (stalk.bloom) {
          stalk.bloom.visible = open > 0.01
          // The petals unfurl from a narrow cup.
          stalk.bloom.scale.set(Math.max(0.001, open), Math.max(0.001, 0.4 + 0.6 * open), Math.max(0.001, open))
        }
        if (stalk.head) {
          stalk.head.object.visible = stalk.object.visible
          stalk.head.object.position.copy(stalk.head.local).applyMatrix4(stalk.object.matrix)
          // A bud hangs nearly upside down; a thirsty bloom hangs its head too.
          const hang = 2.5 * (1 - straighten) + (thirsty ? 0.7 : 0)
          nod.setFromAxisAngle(stalk.bowAxis, hang)
          stalk.head.object.quaternion.copy(bow).multiply(nod).multiply(stalk.head.rest)
          stalk.head.object.scale.setScalar(Math.max(0.001, 0.5 + 0.5 * rise))
        }
        if (stalk.aphids) {
          stalk.aphids.object.visible = aphidsShown > 0.05 && stalk.object.visible
          stalk.aphids.object.position.copy(stalk.aphids.local).applyMatrix4(stalk.object.matrix)
          stalk.aphids.object.quaternion.copy(bow).multiply(stalk.aphids.rest)
          // They jostle as they feed.
          stalk.aphids.object.scale.setScalar(Math.max(0.001, aphidsShown * (1 + Math.sin(elapsed * 9 + index) * 0.06)))
        }
      })

      // The stray shoot springs out when a pinch is due and snaps back once taken.
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
      poppy = null
      rosette = null
      shoot = null
      stalks.length = 0
    },
  }
}

/** A grown poppy for the placement ghost and the care stage: in bloom, with nothing asking for care. */
export function cloneGrownPoppy(): THREE.Object3D | null {
  const poppy = clonePoppy()
  if (!poppy) return null
  poppy.traverse((object) => {
    if (/^PP_(bud_\d|aphids_\d|shoot)$/.test(object.name)) object.visible = false
  })
  return poppy
}
