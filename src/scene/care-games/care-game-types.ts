import type * as THREE from 'three'
import type { CareRound } from '../../game/care-minigames'
import type { CareGameDom } from '../../ui/care-game-dom'
import type { BurstPool } from '../garden-bursts'
import type { CareSfx } from './care-sfx'
import type { CareStage } from './care-stage'

/** What a close-up minigame scene is given to play with. */
export interface CareGameContext {
  readonly stage: CareStage
  readonly round: CareRound
  readonly dom: CareGameDom
  readonly sfx: CareSfx
  readonly bursts: BurstPool
  /**
   * Every geometry, material and texture the scene makes goes here; the scene
   * never frees them itself. The player frees them once the next round's
   * shaders are ready, so a retry or the next game reuses the compiled
   * programs instead of building them again.
   */
  readonly owned: Array<{ dispose(): void }>
  /** Freeze the action for a beat, so a hit lands. */
  hitStop(seconds: number): void
  /** A word that pops off a point in the world. */
  popAt(world: THREE.Vector3, text: string, tone?: 'good' | 'bad' | 'plain', big?: boolean): void
}

/**
 * One close-up minigame. The player runs the clock and the result.
 *
 * A scene is built by its factory (see `care-game-registry.ts`) and may move the
 * stage's camera and the plant in its constructor, e.g. to frame a pond or to
 * lift the plant into a swing. The stage restores nothing on its own, so a
 * scene that moves the camera should not expect it back. Its `dispose()` must
 * undo what it did to the stage; the GPU parts it put on `owned` are the player's to free.
 *
 * Plant reactions go through the stage: `stage.plant` is the player's plant
 * (null if its model failed to load), `stage.plantHeight` its height, and
 * `stage.bounce(amount)` / `stage.sparkle()` make it react the same way in
 * every game.
 */
export interface CareGameScene {
  update(deltaSeconds: number): void
  pointerDown(x: number, y: number): void
  pointerMove(x: number, y: number): void
  pointerUp(): void
  /** The round just ended: play the scene's own beat (beetles flee, shoots fall). */
  finish(won: boolean): void
  /**
   * Templates the scene clones mid-round that are not in its scene yet (a
   * dewdrop, a puff of fluff). The player shows them to the shader precompile
   * so the first spawn does not stall. Cast critters are warmed already.
   */
  readonly warm?: readonly THREE.Object3D[]
  /** Debug harness: a snapshot of the scene's own state, for scripted play. Optional. */
  debug?(): unknown
  /**
   * How long the outro (the scene's beat, in slow motion) runs before the stamp.
   * Omit it for the default; a scene with a longer beat sets its own.
   */
  readonly outroSeconds?: number
  dispose(): void
}
