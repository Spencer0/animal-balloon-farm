import * as THREE from 'three'
import { cloneCastCritter, type CareCritterName } from '../plant-models'
import type { CareFraming, CareStage } from './care-stage'
import { fitCritter } from './root-cast'

/**
 * The vine games' shared bits: their cast critters (fitted to a size, or at the
 * size they were authored), a framing that fits a playfield under the round's
 * HUD bar on any window, and lending the stage's plant to a game.
 *
 * The cast is loaded before a vine game is built (the player waits for it), so
 * a missing critter means the GLB failed to load and the game draws a plain
 * stand-in instead.
 */

/**
 * A vine cast critter. With a `size`, fitted so its longest side is that, standing
 * on y = 0 (or centred on the origin with `centred`); with none, as authored
 * (the troughs are authored at exactly one tile). A plain stand-in when missing.
 */
export function vineCritter(name: CareCritterName<'vine'>, size: number | null, standIn: () => THREE.Object3D, centred = false): THREE.Group {
  const model = cloneCastCritter('vine', name)
  let fitted: THREE.Group
  if (size === null) {
    fitted = new THREE.Group()
    fitted.add(model ?? standIn())
  } else {
    fitted = fitCritter(model ?? standIn(), size)
  }
  if (centred) {
    const inner = fitted.children[0]
    fitted.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(inner)
    inner.position.y -= box.getCenter(new THREE.Vector3()).y
  }
  fitted.name = `Vine cast · ${name}`
  return fitted
}

/** Overshoots a little and settles: a piece popping in. */
export const backOut = (t: number): number => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2

/** How much of the window's height the HUD bar takes, measured now and then as it settles. */
function hudShareReader(): () => number {
  const hud = document.querySelector<HTMLElement>('.cg-top')
  let share = 0.14
  let clock = 0
  return () => {
    if (hud && clock-- <= 0) {
      clock = 30
      // The bar's laid-out height (its slide-in transform aside), plus a little air.
      share = THREE.MathUtils.clamp((hud.offsetTop + hud.offsetHeight + 10) / Math.max(1, window.innerHeight), 0.05, 0.4)
    }
    return share
  }
}

/** The farthest a framed camera stands back; past it the stage's fog would swallow the playfield, so the view widens instead. */
const MAX_DISTANCE = 7

/**
 * Frame a world-space box from a fixed direction (`view` points from the box
 * toward the camera) so all of it fits below the HUD bar, as large as it can be,
 * whatever the window's shape. It steps the camera back (or, once it is as far
 * back as the fog allows, widens its view) and slides it until the box's eight
 * corners land inside the free part of the screen.
 */
export function boxFraming(box: THREE.Box3, view: THREE.Vector3, fov: number, margin = 0.05): CareFraming {
  const hudShare = hudShareReader()
  const direction = view.clone().normalize()
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 80)
  const corners = Array.from({ length: 8 }, (_, index) => new THREE.Vector3(
    index & 1 ? box.max.x : box.min.x,
    index & 2 ? box.max.y : box.min.y,
    index & 4 ? box.max.z : box.min.z,
  ))
  const projected = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const frame = { position: new THREE.Vector3(), look: new THREE.Vector3(), fov }
  let lastAspect = -1
  let lastShare = -1
  const baseHalfTan = Math.tan(THREE.MathUtils.degToRad(fov / 2))
  return (aspect) => {
    const share = hudShare()
    if (Math.abs(aspect - lastAspect) < 1e-4 && Math.abs(share - lastShare) < 1e-4) return frame
    lastAspect = aspect
    lastShare = share
    camera.aspect = aspect
    const target = box.getCenter(new THREE.Vector3())
    // How far back the camera would stand at the base field of view.
    let reach = box.getSize(new THREE.Vector3()).length() * 1.2
    // The free part of the screen, in normalised device coordinates.
    const top = 1 - 2 * share - margin
    const bottom = -1 + margin
    const wantY = (top + bottom) / 2
    let distance = reach
    let halfTan = baseHalfTan
    for (let pass = 0; pass < 16; pass += 1) {
      distance = Math.min(reach, MAX_DISTANCE)
      halfTan = baseHalfTan * reach / distance
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfTan))
      camera.updateProjectionMatrix()
      camera.position.copy(target).addScaledVector(direction, distance)
      camera.lookAt(target)
      camera.updateMatrixWorld(true)
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const corner of corners) {
        projected.copy(corner).project(camera)
        minX = Math.min(minX, projected.x)
        maxX = Math.max(maxX, projected.x)
        minY = Math.min(minY, projected.y)
        maxY = Math.max(maxY, projected.y)
      }
      // Slide so the box's middle sits in the middle of the free part, then step back or in to fill it.
      right.setFromMatrixColumn(camera.matrixWorld, 0)
      up.setFromMatrixColumn(camera.matrixWorld, 1)
      target.addScaledVector(right, ((minX + maxX) / 2) * distance * halfTan * aspect)
      target.addScaledVector(up, ((minY + maxY) / 2 - wantY) * distance * halfTan)
      const fill = Math.max((maxX - minX) / (2 - 2 * margin), (maxY - minY) / (top - bottom))
      reach *= THREE.MathUtils.clamp(fill, 0.5, 2)
    }
    frame.position.copy(target).addScaledVector(direction, distance)
    frame.look.copy(target)
    frame.fov = camera.fov
    return frame
  }
}

/** Windows narrower than this (width / height) are framed as portrait. */
export const PORTRAIT_ASPECT = 0.85

/** One framing for wide windows and another for tall ones (a phone held upright), chosen as the window changes. */
export function orientedFraming(landscape: CareFraming, portrait: CareFraming): CareFraming {
  return (aspect) => (aspect < PORTRAIT_ASPECT ? portrait(aspect) : landscape(aspect))
}

/** Board directions on the ground, in the rules' order: N (away, -z), E (+x), S (+z), W (-x). */
const BOARD_DIRECTIONS = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)] as const

/**
 * Which board direction (0 N, 1 E, 2 S, 3 W) runs most nearly along a direction
 * on screen (CSS pixels, y down) at a point on the board. A swipe, or an arrow
 * key, means the way it points on screen whichever way the camera faces.
 */
export function screenHeading(stage: CareStage, at: THREE.Vector3, dx: number, dy: number): 0 | 1 | 2 | 3 {
  const from = stage.toScreen(at)
  const length = Math.hypot(dx, dy) || 1
  let best: 0 | 1 | 2 | 3 = 0
  let bestDot = -Infinity
  BOARD_DIRECTIONS.forEach((direction, index) => {
    const to = stage.toScreen(at.clone().addScaledVector(direction, 0.3))
    const sx = to.x - from.x
    const sy = to.y - from.y
    const dot = (sx * dx + sy * dy) / ((Math.hypot(sx, sy) || 1) * length)
    if (dot > bestDot) {
      bestDot = dot
      best = index as 0 | 1 | 2 | 3
    }
  })
  return best
}

/** The screen direction (CSS pixels, y down) of an arrow key or WASD key, or null for any other key. */
export function arrowVector(code: string): { readonly dx: number; readonly dy: number } | null {
  if (code === 'ArrowUp' || code === 'KeyW') return { dx: 0, dy: -1 }
  if (code === 'ArrowDown' || code === 'KeyS') return { dx: 0, dy: 1 }
  if (code === 'ArrowLeft' || code === 'KeyA') return { dx: -1, dy: 0 }
  if (code === 'ArrowRight' || code === 'KeyD') return { dx: 1, dy: 0 }
  return null
}

/**
 * Lend the stage's plant to a game: it stands in `holder`, scaled so its longest
 * side (a pumpkin's spread, a cucumber's canes) is `size`. Returns the
 * hand-back, which puts it back on the stage for the next round.
 */
export function borrowPlant(stage: CareStage, holder: THREE.Object3D, size: number): () => void {
  if (stage.plant) {
    stage.plant.updateMatrixWorld(true)
    const extent = new THREE.Box3().setFromObject(stage.plant).getSize(new THREE.Vector3())
    holder.add(stage.plant)
    holder.scale.setScalar(size / Math.max(0.01, extent.x, extent.y, extent.z))
  }
  return () => {
    if (stage.plant && stage.plant.parent === holder) stage.scene.add(stage.plant)
  }
}
