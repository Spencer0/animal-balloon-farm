import * as THREE from 'three'
import { SHOP_BUILD_PARTS, SHOP_BUILD_SECONDS, shopBuildProgress, shopPartPose, shopUnlocked, type ShopBuildPart } from '../game/shop-construction'

/**
 * Builds the balloon arcade store on its site. The GLB keeps each build piece as
 * a named node (`SHOP BUILD walls` and so on), and this drives those nodes along
 * the timeline in `src/game/shop-construction.ts`.
 */
export interface ShopBuildReport {
  readonly started: boolean
  readonly finished: boolean
  readonly pieces: readonly { readonly name: string; readonly visible: boolean; readonly scale: number }[]
}

export interface ShopBuild {
  /** Starts the build the first frame the expansion level reaches the unlock level. */
  update(deltaSeconds: number, expansionLevel: number): void
  /** True once the build has begun. */
  readonly started: boolean
  /** True once every piece has settled and the construction site is packed away. */
  readonly finished: boolean
  report(): ShopBuildReport
}

interface BuildPiece {
  readonly node: THREE.Object3D
  /** Bottom centre of the piece, in its parent's space. Scaling pivots here. */
  readonly anchor: THREE.Vector3
  readonly spec: ShopBuildPart
}

/** Pieces must start at the pivot origin, so a pose can be written as position = anchor * (1 - scale). */
const MIN_SCALE = 0.001

export function createShopBuild(building: THREE.Object3D): ShopBuild {
  building.updateMatrixWorld(true)
  const pieces: BuildPiece[] = []
  for (const spec of SHOP_BUILD_PARTS) {
    // GLTFLoader sanitizes node names, so "SHOP BUILD site" in Blender loads as "SHOP_BUILD_site".
    const node = building.getObjectByName(`SHOP_BUILD_${spec.name}`)
    if (!node?.parent) {
      console.warn(`[shop] the shop model has no "SHOP BUILD ${spec.name}" node; that piece will not build`)
      continue
    }
    const box = new THREE.Box3().setFromObject(node)
    const bottom = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
    pieces.push({ node, anchor: node.parent.worldToLocal(bottom), spec })
  }

  let elapsed = 0
  let started = false
  let finished = false

  function apply(progress: number): void {
    for (const piece of pieces) {
      const pose = shopPartPose(piece.spec, progress)
      const scale = Math.max(MIN_SCALE, pose.scale)
      piece.node.visible = pose.visible
      piece.node.scale.setScalar(scale)
      piece.node.position.copy(piece.anchor).multiplyScalar(1 - scale)
      // Parts sit at the pivot of the export root, which is Z-up in Blender and Y-up in three.js.
      piece.node.position.y += pose.lift
    }
  }

  // Nothing shows until the expansion reaches the unlock level.
  for (const piece of pieces) piece.node.visible = false

  return {
    update(deltaSeconds: number, expansionLevel: number): void {
      if (!started && shopUnlocked(expansionLevel)) started = true
      if (!started || finished) return
      if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) elapsed = Math.min(SHOP_BUILD_SECONDS, elapsed + deltaSeconds)
      apply(shopBuildProgress(elapsed))
      if (elapsed >= SHOP_BUILD_SECONDS) finished = true
    },
    get started() { return started },
    get finished() { return finished },
    report(): ShopBuildReport {
      return {
        started,
        finished,
        pieces: pieces.map((piece) => ({ name: piece.spec.name, visible: piece.node.visible, scale: piece.node.scale.x })),
      }
    },
  }
}
