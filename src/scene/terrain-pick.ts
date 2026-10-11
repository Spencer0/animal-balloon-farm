/**
 * Where a ray first meets a height field. The lawn is the terrain field drawn
 * as a mesh, so the pointer can be resolved against the field itself: no mesh
 * triangles are tested, which matters because the lawn has ~40k of them.
 *
 * Pure arithmetic, with no three.js or DOM, so it stays testable in node.
 */

export interface Vector3Like {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface HeightFieldPickOptions {
  /** Highest and lowest heights the field can take. The search covers only that band. */
  readonly top: number
  readonly bottom: number
  /** Distance along the ray between samples. Keep it under the field's smallest feature. */
  readonly step: number
  /** Bisection rounds once a sample drops below the surface. */
  readonly refine: number
}

/**
 * Marches the ray down through the field and returns the first point where it
 * meets the surface. `direction` must be unit length, as a three.js ray is, so
 * `step` is in metres. Returns null when the ray does not head down or misses
 * the field's height band.
 */
export function pickHeightField(
  origin: Vector3Like,
  direction: Vector3Like,
  heightAt: (x: number, z: number) => number,
  options: HeightFieldPickOptions,
): Vector3Like | null {
  if (direction.y >= -1e-6) return null
  const tStart = Math.max(0, (options.top - origin.y) / direction.y)
  const tEnd = (options.bottom - origin.y) / direction.y
  if (tEnd <= tStart) return null
  // Positive while the ray is above the ground, zero or negative once it has dropped through.
  const clearance = (t: number): number =>
    origin.y + direction.y * t - heightAt(origin.x + direction.x * t, origin.z + direction.z * t)
  let previousT = tStart
  const steps = Math.ceil((tEnd - tStart) / options.step)
  for (let index = 1; index <= steps; index += 1) {
    const t = Math.min(tEnd, tStart + index * options.step)
    if (clearance(t) > 0) {
      previousT = t
      continue
    }
    let above = previousT
    let below = t
    for (let round = 0; round < options.refine; round += 1) {
      const middle = (above + below) / 2
      if (clearance(middle) > 0) above = middle
      else below = middle
    }
    const x = origin.x + direction.x * below
    const z = origin.z + direction.z * below
    return { x, y: heightAt(x, z), z }
  }
  return null
}
