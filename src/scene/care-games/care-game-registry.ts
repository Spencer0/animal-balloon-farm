import type { CareGameKind } from '../../game/care-minigames'
import { createBarrelGame } from './barrel-game'
import { createBreakoutGame } from './breakout-game'
import { createBuzzGame } from './buzz-game'
import { createHopGame } from './hop-game'
import { createChopGame } from './chop-game'
import { createSkimGame } from './skim-game'
import { createPaddleGame } from './paddle-game'
import { createPongGame } from './pong-game'
import { createRopeGame } from './rope-game'
import { createSnipGame } from './snip-game'
import { createSwatGame } from './swat-game'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * The close-up care minigames, one entry per kind. This is the only place a
 * game is wired in: a new game replaces its `create: null` with its factory
 * and adds one import above. The player and the controller read the table, so
 * nothing else needs to know the new game exists.
 *
 * `create: null` means the game is not built yet: the controller then answers
 * that care with a plain tap, so every chore stays playable.
 *
 * `input` says how the player is held while the game plays:
 *   aim    the swatter reticle; the system cursor is hidden
 *   capture the snip trail; the cursor stays, the overlay takes the pointer
 *   tap    plain pointer input; the scene reads pointerdown and pointermove
 */

/** Every kind played close-up; the farm-side rain cloud is not one of them. */
export type CloseUpGameKind = Exclude<CareGameKind, 'rain'>

export type CareGameInput = 'aim' | 'capture' | 'tap'

export interface CloseUpGameEntry {
  /** Builds the scene, or null while the game is not built yet. */
  readonly create: ((context: CareGameContext) => CareGameScene) | null
  readonly input: CareGameInput
}

export const CLOSE_UP_GAMES: Readonly<Record<CloseUpGameKind, CloseUpGameEntry>> = {
  swat: { create: createSwatGame, input: 'aim' },
  snip: { create: createSnipGame, input: 'capture' },
  buzz: { create: createBuzzGame, input: 'tap' },
  hop: { create: createHopGame, input: 'tap' },
  chop: { create: createChopGame, input: 'tap' },
  skim: { create: createSkimGame, input: 'tap' },
  paddle: { create: createPaddleGame, input: 'tap' },
  rope: { create: createRopeGame, input: 'tap' },
  barrel: { create: createBarrelGame, input: 'tap' },
  breakout: { create: createBreakoutGame, input: 'tap' },
  pong: { create: createPongGame, input: 'tap' },
  pipes: { create: null, input: 'tap' },
  squirt: { create: null, input: 'tap' },
  runner: { create: null, input: 'tap' },
}

/** Whether a kind has a close-up scene yet. */
export function isCloseUpBuilt(kind: CareGameKind): kind is CloseUpGameKind {
  return kind !== 'rain' && CLOSE_UP_GAMES[kind].create !== null
}
