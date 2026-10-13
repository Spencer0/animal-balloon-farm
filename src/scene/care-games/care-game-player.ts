import * as THREE from 'three'
import {
  CARE_GAME_COPY,
  CARE_GAME_INTRO_SECONDS,
  createCareRound,
  lossLine,
  type CareRound,
  type CareRoundSnapshot,
} from '../../game/care-minigames'
import type { CareGameDom, CareGameResultView } from '../../ui/care-game-dom'
import { precompile, type FarmRenderer } from '../../render/backend'
import { createBurstPool } from '../garden-bursts'
import { createCareSfx } from './care-sfx'
import { createCareStage } from './care-stage'
import { createSnipGame } from './snip-game'
import { createSwatGame } from './swat-game'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * Runs one close-up care minigame from its command card to its result stamp,
 * the way the game loop runs a cutscene: while it plays, the frame loop calls
 * `update` and `render` instead of drawing the farm, and the farm holds still.
 *
 *   intro   the command card ("SWAT!") over the stage; shaders build meanwhile
 *   play    the round runs; the scene reports hits and harms, the round decides
 *   outro   a beat of slow motion once the round is decided
 *   result  CLEARED! or OOPS!, with Try again / Later or Back to the farm
 *
 * A win calls `onWin` the moment the round is decided, so the plant's care is
 * answered even if the player closes the game during the stamp.
 */

export type CloseUpGameKind = 'swat' | 'snip'

export interface CareGameRequest {
  readonly kind: CloseUpGameKind
  /** Shown under the command word, e.g. "Blueberry bush". */
  readonly subject: string
  /** The round was won: answer the care. Returns the ribbon to show on a first win. */
  onWin(): CareGameResultView['ribbon']
}

export interface CareGamePlayer {
  readonly done: boolean
  readonly won: boolean
  readonly kind: CloseUpGameKind
  update(deltaSeconds: number): void
  render(): void
  resize(cssWidth: number, cssHeight: number): void
  /** Debug harness: where the round is. */
  describe(): { phase: string; snapshot: CareRoundSnapshot }
  /** Debug harness: settle the round now, won or lost. */
  settle(won: boolean): void
  dispose(): void
}

type Phase = 'intro' | 'play' | 'outro' | 'result'

const OUTRO_SECONDS = 0.85
const RETRY_INTRO_SECONDS = 0.8

export function createCareGamePlayer(renderer: FarmRenderer, dom: CareGameDom, request: CareGameRequest): CareGamePlayer {
  const stage = createCareStage(window.innerWidth, window.innerHeight)
  const sfx = createCareSfx()
  const bursts = createBurstPool()
  let round: CareRound = createCareRound(request.kind)
  let game: CareGameScene | null = null
  let phase: Phase = 'intro'
  let phaseTime = 0
  let introSeconds = CARE_GAME_INTRO_SECONDS
  let hitStop = 0
  let done = false
  let won = false
  let disposed = false

  const context = (): CareGameContext => ({
    stage,
    get round() { return round },
    dom,
    sfx,
    bursts,
    hitStop(seconds: number): void { hitStop = Math.max(hitStop, seconds) },
    popAt(world: THREE.Vector3, text: string, tone: 'good' | 'bad' | 'plain' = 'plain', big = false): void {
      const at = stage.toScreen(world)
      dom.pop(text, at.x, at.y, tone, big)
    },
  })

  function startIntro(): void {
    phase = 'intro'
    phaseTime = 0
    round = createCareRound(request.kind)
    game?.dispose()
    game = request.kind === 'swat' ? createSwatGame(context()) : createSnipGame(context())
    dom.showIntro(request.kind, request.subject)
    sfx.play('sting')
    document.body.classList.add('care-game-playing')
  }

  function startPlay(): void {
    phase = 'play'
    phaseTime = 0
    dom.hideIntro()
    dom.showHud(request.kind, request.subject, round.snapshot)
    dom.setAiming(request.kind === 'swat')
    dom.setCapturing(request.kind === 'snip')
  }

  function decide(): void {
    phase = 'outro'
    phaseTime = 0
    won = round.snapshot.state === 'won'
    game?.finish(won)
    sfx.play(won ? 'win' : 'lose')
    dom.setAiming(false)
    dom.setCapturing(false)
    const ribbon = won ? request.onWin() : null
    pendingResult = {
      won,
      line: won ? CARE_GAME_COPY[request.kind].winLine : lossLine(request.kind, round.snapshot.lossReason),
      ribbon,
    }
  }
  let pendingResult: CareGameResultView | null = null

  function showResult(): void {
    phase = 'result'
    phaseTime = 0
    dom.hideHud()
    dom.showResult(pendingResult ?? { won, line: '' }, () => {
      dom.hideResult()
      introSeconds = RETRY_INTRO_SECONDS
      startIntro()
    }, close)
  }

  function close(): void {
    done = true
  }

  // ---- input: the overlay owns the pointer while a round plays.
  const onPointerDown = (event: PointerEvent): void => {
    if (phase !== 'play' || event.button !== 0) return
    event.preventDefault()
    dom.overlay.setPointerCapture?.(event.pointerId)
    game?.pointerDown(event.clientX, event.clientY)
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (phase === 'play') game?.pointerMove(event.clientX, event.clientY)
  }
  const onPointerUp = (): void => {
    game?.pointerUp()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (phase === 'result') close()
    else if (phase === 'intro' || phase === 'play') {
      round.forfeit()
      if (phase === 'intro') startPlay()
    }
  }
  dom.overlay.addEventListener('pointerdown', onPointerDown)
  dom.overlay.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKeyDown, true)

  startIntro()
  // Build the stage's pipelines while the command card covers it.
  void precompile(renderer, stage.scene, stage.camera).catch(() => {})

  return {
    get done() { return done },
    get won() { return won },
    kind: request.kind,
    update(deltaSeconds): void {
      if (disposed) return
      phaseTime += deltaSeconds
      let dt = deltaSeconds
      if (hitStop > 0) {
        hitStop = Math.max(0, hitStop - deltaSeconds)
        dt = 0
      }
      if (phase === 'outro') dt *= 0.35
      stage.update(deltaSeconds)
      if (phase === 'intro' && phaseTime >= introSeconds) startPlay()
      if (phase === 'play') {
        round.tick(dt)
        game?.update(dt)
        dom.setRound(round.snapshot)
        if (round.snapshot.state !== 'playing') decide()
      } else if (phase !== 'intro') {
        game?.update(dt)
      }
      bursts.update(dt)
      if (phase === 'outro' && phaseTime >= OUTRO_SECONDS) showResult()
    },
    render(): void {
      if (!disposed) renderer.render(stage.scene, stage.camera)
    },
    resize(cssWidth, cssHeight): void {
      stage.resize(cssWidth, cssHeight)
    },
    describe() {
      return { phase, snapshot: round.snapshot }
    },
    settle(win): void {
      if (phase === 'intro') startPlay()
      if (phase !== 'play') return
      if (win) while (round.snapshot.state === 'playing') round.hit()
      else round.forfeit()
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      dom.overlay.removeEventListener('pointerdown', onPointerDown)
      dom.overlay.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown, true)
      sfx.stopAll()
      game?.dispose()
      bursts.dispose()
      stage.dispose()
      dom.hideIntro()
      dom.hideHud()
      dom.hideResult()
      dom.setAiming(false)
      dom.setCapturing(false)
      document.body.classList.remove('care-game-playing')
    },
  }
}
