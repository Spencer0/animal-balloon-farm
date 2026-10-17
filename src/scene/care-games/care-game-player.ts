import * as THREE from 'three'
import {
  CARE_GAME_COPY,
  CARE_GAME_INTRO_SECONDS,
  createCareRound,
  lossLine,
  type CareRound,
  type CareRoundSnapshot,
} from '../../game/care-minigames'
import type { PlantId } from '../../game/plants'
import type { CareGameDom, CareGameResultView } from '../../ui/care-game-dom'
import { precompile, warmDraw, type FarmRenderer } from '../../render/backend'
import { createBurstPool, warmBurstLooks } from '../garden-bursts'
import { cloneWholeCast, loadCareCast, type CareCastType } from '../plant-models'
import { createCareSfx } from './care-sfx'
import { createCareStage } from './care-stage'
import { CLOSE_UP_GAMES, type CloseUpGameKind } from './care-game-registry'
import type { CareGameContext, CareGameScene } from './care-game-types'

export type { CloseUpGameKind } from './care-game-registry'

/**
 * Runs one close-up care minigame from its command card to its result stamp,
 * the way the game loop runs a cutscene: while it plays, the frame loop calls
 * `update` and `render` instead of drawing the farm, and the farm holds still.
 *
 *   loading the plant's cast critters load (once per type, never at boot)
 *   intro   the command card ("SWAT!") over the stage; shaders build meanwhile
 *   play    the round runs; the scene reports hits and harms, the round decides
 *   outro   a beat of slow motion once the round is decided
 *   result  CLEARED! or OOPS!, with Try again / Later or Back to the farm
 *
 * A request with a null kind is a still stage: the plant on its set, no game,
 * for screenshots (`__gardenDebug.careStage`). It closes with `close()`.
 *
 * A win calls `onWin` the moment the round is decided, so the plant's care is
 * answered even if the player closes the game during the stamp.
 */

export interface CareGameRequest {
  /** The game to play, or null for a still stage with no round. */
  readonly kind: CloseUpGameKind | null
  /** Whose plant stands on the stage. */
  readonly species: PlantId
  /** Shown under the command word, e.g. "Blueberry bush". */
  readonly subject: string
  /** The round was won: answer the care. Returns the ribbon to show on a first win. */
  onWin(): CareGameResultView['ribbon']
}

export interface CareGamePlayer {
  readonly done: boolean
  readonly won: boolean
  readonly kind: CloseUpGameKind | null
  readonly species: PlantId
  update(deltaSeconds: number): void
  render(): void
  resize(cssWidth: number, cssHeight: number): void
  /** Debug harness: where the round is. The snapshot is null on a still stage. */
  describe(): { phase: string; snapshot: CareRoundSnapshot | null; debug: unknown }
  /** Debug harness: settle the round now, won or lost. */
  settle(won: boolean): void
  /** End the game (or the still stage) now; the owner then disposes it. */
  close(): void
  dispose(): void
}

type Phase = 'loading' | 'intro' | 'play' | 'outro' | 'result' | 'still'

const OUTRO_SECONDS = 0.85
const RETRY_INTRO_SECONDS = 0.8
/** The longest a round waits for its shaders before the command card shows anyway. */
const PREPARE_TIMEOUT_MS = 5000

type GpuPart = { dispose(): void }

/**
 * The GPU parts of the last game that closed. Freeing a material lets three.js
 * release its shader program, so freeing them at once made the next visit
 * compile the stage and the game all over again. They are freed once the next
 * game's shaders are ready (its materials then hold the programs), or after a
 * while with no game, so they never linger.
 */
let retired: GpuPart[] = []
let retiredTimer = 0
const RETIRED_SECONDS = 120

function freeParts(parts: readonly GpuPart[]): void {
  for (const part of parts) part.dispose()
}

function freeRetired(): void {
  window.clearTimeout(retiredTimer)
  const parts = retired
  retired = []
  freeParts(parts)
}

function retire(parts: readonly GpuPart[]): void {
  freeRetired()
  retired = [...parts]
  retiredTimer = window.setTimeout(freeRetired, RETIRED_SECONDS * 1000)
}

export function createCareGamePlayer(renderer: FarmRenderer, dom: CareGameDom, request: CareGameRequest): CareGamePlayer {
  /** The stage's GPU parts, and the current round's (each round's game makes its own). */
  const stageParts: GpuPart[] = []
  let roundParts: GpuPart[] = []
  /** Earlier rounds' parts, freed once the round being prepared is ready. */
  const staleParts: GpuPart[] = []
  const stage = createCareStage(window.innerWidth, window.innerHeight, request.species, stageParts)
  const sfx = createCareSfx()
  const bursts = createBurstPool()
  const still = request.kind === null
  // A still stage has no round; a placeholder keeps the round code below total.
  let round: CareRound = createCareRound(request.kind ?? 'swat')
  let game: CareGameScene | null = null
  let phase: Phase = still ? 'still' : 'loading'
  let phaseTime = 0
  let introSeconds = CARE_GAME_INTRO_SECONDS
  let hitStop = 0
  let done = false
  let won = false
  let disposed = false

  const context = (): CareGameContext => ({
    stage,
    owned: roundParts,
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

  /**
   * Build the round and its scene, then compile every shader it can need (the
   * hidden hit effects, the critters it will spawn and the burst looks
   * included) before the command card shows. Until then nothing draws, so the
   * last frame (the farm, or the result card's backdrop) stays on screen
   * instead of freezing on a stage frame that waits for the driver. A retry
   * comes back through here; its programs are cached, so it is ready at once.
   */
  function prepareRound(): void {
    const kind = request.kind
    if (!kind) return
    phase = 'loading'
    phaseTime = 0
    round = createCareRound(kind)
    // The last round's GPU parts stay until this one's shaders are ready, so they share programs.
    staleParts.push(...roundParts)
    roundParts = []
    game?.dispose()
    game = CLOSE_UP_GAMES[kind].create?.(context()) ?? null
    endWarmUp()
    const warmers = new THREE.Group()
    warmers.name = 'Care game shader warm-up'
    // Hidden in real frames; the precompile and the warm draw show it to themselves.
    warmers.visible = false
    warmers.add(...cloneWholeCast(stage.type))
    for (const template of game?.warm ?? []) warmers.add(template.clone(true))
    stage.scene.add(warmers)
    const unwarmBursts = warmBurstLooks(stage.scene)
    warmUp = {
      end(): void {
        warmers.removeFromParent()
        unwarmBursts()
      },
    }
    const attempt = ++preparing
    const ready = (): void => {
      if (disposed || attempt !== preparing || phase !== 'loading') return
      // The programs are linked now, so this first use costs nothing; on WebGL
      // it moves three's one-time program check off the frame of a hit.
      warmDraw(renderer, stage.scene, stage.camera)
      endWarmUp()
      freeParts(staleParts.splice(0))
      freeRetired()
      startIntro(kind)
    }
    // A driver that never reports ready must not strand the player on a frozen frame.
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, PREPARE_TIMEOUT_MS))
    void Promise.race([precompile(renderer, stage.scene, stage.camera, true), timeout]).catch(() => {}).then(ready)
  }
  let preparing = 0

  function startIntro(kind: CloseUpGameKind): void {
    phase = 'intro'
    phaseTime = 0
    dom.showIntro(kind, request.subject)
    sfx.play('sting')
    document.body.classList.add('care-game-playing')
  }

  /** The shader warm-up of the round being prepared, until its warm draw has run. */
  let warmUp: { end(): void } | null = null

  function endWarmUp(): void {
    warmUp?.end()
    warmUp = null
  }

  function startPlay(): void {
    if (!request.kind) return
    endWarmUp()
    phase = 'play'
    phaseTime = 0
    dom.hideIntro()
    dom.showHud(request.kind, request.subject, round.snapshot)
    const input = CLOSE_UP_GAMES[request.kind].input
    dom.setAiming(input === 'aim')
    // Tap games take the pointer the same way the snip trail does.
    dom.setCapturing(input === 'capture' || input === 'tap')
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
      line: won ? CARE_GAME_COPY[request.kind!].winLine : lossLine(request.kind!, round.snapshot.lossReason),
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
      prepareRound()
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
    if (phase === 'result' || phase === 'still' || phase === 'loading') close()
    else if (phase === 'intro' || phase === 'play') {
      round.forfeit()
      if (phase === 'intro') startPlay()
    }
  }
  dom.overlay.addEventListener('pointerdown', onPointerDown)
  dom.overlay.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKeyDown, true)

  if (still) {
    // Nothing to load: the plant is the whole stage.
    document.body.classList.remove('care-game-playing')
  } else if (stage.type === 'bush') {
    // The bush's own model is already loaded with the garden: start at once.
    prepareRound()
  } else {
    // The cast critters (and a root vegetable's own model) load on first use; the command card waits for them.
    const castType: CareCastType = stage.type
    void Promise.all([loadCareCast(castType), stage.ready]).then(() => {
      if (!disposed && phase === 'loading') prepareRound()
    })
  }

  return {
    get done() { return done },
    get won() { return won },
    kind: request.kind,
    species: request.species,
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
      if (phase === 'loading' || phase === 'still') {
        bursts.update(dt)
        return
      }
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
      if (phase === 'outro' && phaseTime >= (game?.outroSeconds ?? OUTRO_SECONDS)) showResult()
    },
    render(): void {
      // While a round is prepared nothing draws, so the last frame stays up.
      if (!disposed && phase !== 'loading') renderer.render(stage.scene, stage.camera)
    },
    resize(cssWidth, cssHeight): void {
      stage.resize(cssWidth, cssHeight)
    },
    describe() {
      return { phase, snapshot: still ? null : round.snapshot, debug: game?.debug?.() ?? null }
    },
    close,
    settle(win): void {
      if (phase === 'intro') startPlay()
      if (phase !== 'play') return
      if (!win) return round.forfeit()
      // A run to the end is only won when its clock runs out, so hit the goal, then end the clock.
      while (round.snapshot.state === 'playing' && round.snapshot.hits < round.snapshot.goal) round.hit()
      if (round.snapshot.state === 'playing') round.tick(round.snapshot.timeLeft)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      dom.overlay.removeEventListener('pointerdown', onPointerDown)
      dom.overlay.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown, true)
      sfx.stopAll()
      endWarmUp()
      game?.dispose()
      bursts.dispose()
      stage.dispose()
      // Kept for the next visit's shaders; see `retired`.
      retire([...stageParts, ...staleParts, ...roundParts])
      dom.hideIntro()
      dom.hideHud()
      dom.hideResult()
      dom.setAiming(false)
      dom.setCapturing(false)
      document.body.classList.remove('care-game-playing')
    },
  }
}
