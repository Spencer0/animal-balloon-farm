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

/** Half-extents, in world units, of the rectangle the look-at point may roam. */
export interface PanLimits {
  readonly x: number
  readonly z: number
}

/**
 * Keep a panned look-at point within reach of the farm.
 *
 * The point first slides along the view ray onto the ground plane at `groundY`.
 * For the orthographic farm camera that slide changes nothing on screen, but it
 * stops a vertical drag from lifting the look-at into the sky forever, so the
 * x/z clamp that follows bounds every pan direction. `viewDirection` points from
 * the look-at back to the eye and must not be level (the orbit keeps it tilted).
 */
export function clampPanTarget(
  target: Vector3Like,
  viewDirection: Vector3Like,
  groundY: number,
  limits: PanLimits,
): { x: number; y: number; z: number } {
  const along = Math.abs(viewDirection.y) > 1e-6 ? (groundY - target.y) / viewDirection.y : 0
  const x = target.x + viewDirection.x * along
  const z = target.z + viewDirection.z * along
  return {
    x: Math.max(-limits.x, Math.min(limits.x, x)),
    y: Math.abs(viewDirection.y) > 1e-6 ? groundY : target.y,
    z: Math.max(-limits.z, Math.min(limits.z, z)),
  }
}
