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

/** One close-up minigame (swat, snip). The player runs the clock and the result. */
export interface CareGameScene {
  update(deltaSeconds: number): void
  pointerDown(x: number, y: number): void
  pointerMove(x: number, y: number): void
  pointerUp(): void
  /** The round just ended: play the scene's own beat (beetles flee, shoots fall). */
  finish(won: boolean): void
  dispose(): void
}
