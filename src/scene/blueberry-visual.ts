import * as THREE from 'three'
import type { PlantCare } from '../game/plants'
import { berryColor, cloneBush, cloneCritter, loadGardenModels, ownBerryMaterial, type BushGroup } from './plant-models'

/**
 * How a blueberry bush looks at each moment of its life, from the Blender
 * model's groups:
 *
 * - The canopy grows in from a sapling tuft; the canes stretch with it.
 * - White bells flower mid-growth, then give way to berries that ripen
 *   green -> pink -> dusty blue as the bush matures.
 * - The bush shows what it needs before you read a marker: it droops when
 *   thirsty, beetles crawl over it when pests come, and three wild shoots
 *   stick out when it wants a trim.
 *
 * The model loads once for every bush (scene/plant-models.ts); a bush planted
 * before it arrives fills in as soon as it does.
 */

export interface BlueberryLook {
  readonly growth: number
  readonly care: PlantCare | null
  /** A helper or a minigame is answering the care right now: hide the need. */
  readonly answering: boolean
}

export interface BlueberryVisual {
  /** Add this under the plant's group; it is scaled and swayed from inside. */
  readonly root: THREE.Group
  /** True once the Blender model is attached. */
  readonly ready: boolean
  update(look: BlueberryLook, elapsed: number, deltaSeconds: number): void
  dispose(): void
}

/** The bush is authored about 1.12 m across; it is drawn at this size when grown. */
export const BLUEBERRY_GROWN_SCALE = 1.08

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

interface CrawlingBeetle {
  readonly object: THREE.Object3D
  readonly wings: THREE.Object3D[]
  readonly phase: number
  readonly speed: number
}

export function createBlueberryVisual(): BlueberryVisual {
  const root = new THREE.Group()
  root.name = 'Blueberry bush'
  let bush: THREE.Object3D | null = null
  let berryMaterial: THREE.MeshStandardMaterial | null = null
  const groups = new Map<BushGroup, THREE.Object3D>()
  const beetles: CrawlingBeetle[] = []
  let shootsShown = 0
  let beetlesShown = 0
  let disposed = false
  const tint = new THREE.Color()

  function attach(): void {
    if (bush || disposed) return
    const clone = cloneBush()
    if (!clone) return
    bush = clone
    berryMaterial = ownBerryMaterial(clone)
    for (const name of ['BB_mound', 'BB_canes', 'BB_canopy', 'BB_shoots', 'BB_flowers', 'BB_berries'] as const) {
      const group = clone.getObjectByName(name)
      if (group) groups.set(name, group)
    }
    // Two beetles that crawl over the leaves while pests are about.
    for (let index = 0; index < 2; index += 1) {
      const beetle = cloneCritter('beetle')
      if (!beetle) continue
      beetle.scale.setScalar(0.9)
      beetle.visible = false
      const wings = ['CRITTER_beetle_wing_L', 'CRITTER_beetle_wing_R'].map((name) => beetle.getObjectByName(name)).filter((wing): wing is THREE.Object3D => !!wing)
      beetles.push({ object: beetle, wings, phase: index * Math.PI, speed: index ? -0.7 : 0.9 })
      root.add(beetle)
    }
    root.add(clone)
  }

  attach()
  if (!bush) void loadGardenModels().then(attach).catch(() => {})

  const group = (name: BushGroup): THREE.Object3D | undefined => groups.get(name)

  return {
    root,
    get ready() { return bush !== null },
    update(look, elapsed, deltaSeconds): void {
      if (!bush) {
        attach()
        if (!bush) return
      }
      const growth = THREE.MathUtils.clamp(look.growth, 0, 1)
      const sapling = 0.32 + 0.68 * smoothstep(0, 1, growth)
      const thirsty = look.care === 'water' && !look.answering
      // A thirsty bush slumps a little and its sway slows; a drink stands it back up.
      const droop = thirsty ? 0.86 : 1
      const canopy = group('BB_canopy')
      if (canopy) {
        const sway = Math.sin(elapsed * (thirsty ? 0.8 : 1.6)) * (thirsty ? 0.015 : 0.03)
        canopy.scale.set(sapling, sapling * droop, sapling)
        canopy.rotation.set(sway, 0, Math.cos(elapsed * 1.3) * 0.02 + (thirsty ? 0.06 : 0))
      }
      const canes = group('BB_canes')
      if (canes) canes.scale.set(0.7 + 0.3 * sapling, sapling * droop, 0.7 + 0.3 * sapling)
      const mound = group('BB_mound')
      if (mound) mound.scale.setScalar(0.75 + 0.25 * sapling)

      // Bells open from 30% and drop as the berries set.
      const flowers = group('BB_flowers')
      if (flowers) {
        const bloom = smoothstep(0.3, 0.4, growth) * (1 - smoothstep(0.72, 0.84, growth))
        flowers.visible = bloom > 0.01
        flowers.scale.setScalar(Math.max(0.001, bloom) * sapling)
      }
      const berries = group('BB_berries')
      if (berries) {
        const set = smoothstep(0.6, 0.78, growth)
        berries.visible = set > 0.01
        berries.scale.setScalar(Math.max(0.001, 0.45 + 0.55 * set) * sapling)
        if (berryMaterial) {
          berryMaterial.color.copy(berryColor((growth - 0.62) / 0.38, tint))
          // A ripe berry is dusty, not shiny.
          berryMaterial.roughness = 0.3 + 0.25 * smoothstep(0.85, 1, growth)
        }
      }
      // Wild shoots spring out when a trim is due and snap back once cut.
      const shoots = group('BB_shoots')
      const wantShoots = look.care === 'prune' && !look.answering ? 1 : 0
      shootsShown += (wantShoots - shootsShown) * Math.min(1, deltaSeconds * (wantShoots ? 5 : 12))
      if (shoots) {
        shoots.visible = shootsShown > 0.02
        const wobble = 1 + Math.sin(elapsed * 6) * 0.04 * shootsShown
        shoots.scale.setScalar(Math.max(0.001, shootsShown * sapling * wobble))
      }
      // Beetles circle the canopy, nibbling, while pests are the trouble.
      const wantBeetles = look.care === 'pest' && !look.answering ? 1 : 0
      beetlesShown += (wantBeetles - beetlesShown) * Math.min(1, deltaSeconds * 6)
      for (const beetle of beetles) {
        beetle.object.visible = beetlesShown > 0.05
        if (!beetle.object.visible) continue
        const angle = beetle.phase + elapsed * beetle.speed
        const lift = 0.5 + Math.sin(elapsed * 2.1 + beetle.phase) * 0.12
        const radius = 0.46 * sapling
        beetle.object.position.set(Math.cos(angle) * radius, lift * sapling + 0.1, Math.sin(angle) * radius)
        // Face along the path, belly to the leaves.
        beetle.object.rotation.set(0, -angle + (beetle.speed > 0 ? 0 : Math.PI), Math.sin(elapsed * 9 + beetle.phase) * 0.15)
        beetle.object.scale.setScalar(0.9 * beetlesShown)
        const flutter = Math.sin(elapsed * 40 + beetle.phase) * 0.5
        beetle.wings.forEach((wing, index) => { wing.rotation.y = (index ? -1 : 1) * (0.2 + flutter * 0.3) })
      }
    },
    dispose(): void {
      disposed = true
      // Geometry and the shared materials belong to the template; only the
      // berry material is this bush's own.
      berryMaterial?.dispose()
      root.clear()
      bush = null
      groups.clear()
      beetles.length = 0
    },
  }
}
