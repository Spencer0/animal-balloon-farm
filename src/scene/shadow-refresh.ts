import * as THREE from 'three'

/**
 * Decides when the sun's shadow map is worth redrawing.
 *
 * The shadow pass is a full depth render of every caster, so running it every
 * frame costs about as much fill as the main pass. Most casters only change when
 * the player edits the farm, so the map is drawn on demand: when something
 * marks it dirty, or when the sun has swung far enough that the shadows would
 * visibly drift.
 */
export interface ShadowRefresh {
  /** A shadow caster was added, removed or moved. Redraws on the next prepared frame. */
  markDirty(): void
  /**
   * Arms the shadow pass for the next render call. Call once per frame, after
   * the sun has moved and before `renderer.render`.
   */
  prepare(sunPosition: THREE.Vector3): void
  /** Arms the shadow pass for a render whose casters animate every frame (cutscenes). */
  forceNext(): void
}

/**
 * How far the sun may swing before its shadows are redrawn. At the default day
 * length the sun moves about 0.75 degrees a second, so this is a redraw roughly
 * every 1.3 s of play, and a slow frame loop (the CI software renderer clamps the
 * clock step to 50 ms a frame) almost never reaches it.
 */
const SUN_STEP_RADIANS = THREE.MathUtils.degToRad(1)

export function createShadowRefresh(renderer: THREE.WebGLRenderer): ShadowRefresh {
  renderer.shadowMap.autoUpdate = false
  const refreshedSun = new THREE.Vector3()
  let dirty = true
  return {
    markDirty(): void {
      dirty = true
    },
    prepare(sunPosition: THREE.Vector3): void {
      if (!dirty && sunPosition.angleTo(refreshedSun) < SUN_STEP_RADIANS) return
      dirty = false
      refreshedSun.copy(sunPosition)
      renderer.shadowMap.needsUpdate = true
    },
    forceNext(): void {
      renderer.shadowMap.needsUpdate = true
    },
  }
}
