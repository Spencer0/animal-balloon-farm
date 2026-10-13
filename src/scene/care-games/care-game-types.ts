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
 * free every geometry, material and texture it created, but not the stage's.
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
  /** Debug harness: a snapshot of the scene's own state, for scripted play. Optional. */
  debug?(): unknown
  dispose(): void
}
