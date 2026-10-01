/**
 * Pure camera gesture math.
 *
 * The renderer owns the Three.js camera; these helpers only answer "how far
 * does one pointer move shift the view". They live here so the pan rule -- a
 * per-move delta that is never accumulated -- is pinned by a test instead of
 * reappearing as a runaway camera the next time someone edits the drag code.
 */

export interface Vector3Like {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The world-space shift for one pointer move, given the camera's screen axes.
 * `dx`/`dy` are client pixels; `unitsPerPixel` is world units per pixel at the
 * current zoom. Dragging right moves the farm right, which is the look-at
 * point travelling along -right; dragging down pulls it along +up.
 */
export function cameraPanStep(
  right: Vector3Like,
  up: Vector3Like,
  dx: number,
  dy: number,
  unitsPerPixel: number,
): { x: number; y: number; z: number } {
  return {
    x: (-dx * right.x + dy * up.x) * unitsPerPixel,
    y: (-dx * right.y + dy * up.y) * unitsPerPixel,
    z: (-dx * right.z + dy * up.z) * unitsPerPixel,
  }
}
