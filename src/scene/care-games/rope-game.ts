import * as THREE from 'three'
import { cloneCastCritter } from '../plant-models'
import { createBurst } from '../garden-bursts'
import {
  createRopeFrog,
  createRopeSweep,
  hopHeight,
  ropeLength,
  ROPE_CLEAR_HEIGHT,
  ROPE_FROG_ANGLE,
  ROPE_FROG_RADIUS,
  ROPE_HOP_SECONDS,
  ROPE_KNOCK_SECONDS,
  ROPE_MAX_LENGTH,
  ROPE_TELEGRAPH_RADIANS,
  type RopeCrossing,
} from '../../game/care-rope'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * RUNNER! The frog sits on the lily pad while the lily's overgrown runner whips
 * round the pad like a skipping rope. Tap (or Space) to hop; the runner sweeps
 * low across the frog's spot once per turn, and a hop that is still in the air
 * as it passes clears it. A clear snips a segment off the runner's tip, which
 * flies off spinning. Caught on the pad, the frog tumbles into the pond.
 *
 * Every pass is telegraphed: a shadow sector sweeps across the pad ahead of the
 * runner, and a whoosh climbs as the runner nears. The timing (angles, speeds,
 * the double passes, the fake slow-down) is in `src/game/care-rope.ts`.
 */

/** The pad's top, the pond's surface, and the runner's pivot at the stem. */
const PAD_Y = 0.04
const WATER_Y = 0.012
const PIVOT_Y = PAD_Y + 0.05
const RUNNER_RADIUS = 0.032
const RUNNER_ARCH = 0.018
const LEAF_SCALE = 2.2
const FROG_SCALE = 1.5
/** A critter is centred on its origin, so its feet sit this far below it (in model units). */
const FROG_LIFT = 0.075
const KNOCK_SPOT = 0.8
const KNOCK_OUT_PART = 0.25
const KNOCK_CLIMB_PART = 0.7
const PIECE_SECONDS = 1.5
const FAN_SEGMENTS = 20
const BLOOM_SCALE_Y = 0.055

interface Piece {
  readonly object: THREE.Mesh
  readonly geometry: THREE.TubeGeometry
  readonly velocity: THREE.Vector3
  readonly spin: THREE.Vector3
  age: number
}

interface Bloom {
  readonly object: THREE.Object3D
  readonly scale: THREE.Vector3
}

/** A snapshot for the debug harness (`window.__ropeGame()`), read by the browser tests. */
export interface RopeDebugState {
  readonly clock: number
  readonly angle: number
  readonly direction: 1 | -1
  readonly ahead: number
  readonly speed: number
  readonly passes: number
  readonly flicking: boolean
  readonly hits: number
  readonly harms: number
  readonly onPad: boolean
  readonly hopStart: number
  readonly finished: boolean
}

interface RopeDebugWindow {
  __ropeGame?: () => RopeDebugState | null
}

export function createRopeGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const root = new THREE.Group()
  root.name = 'Rope game'
  stage.scene.add(root)
  const owned: Array<{ dispose(): void }> = []

  const sweep = createRopeSweep()
  const frog = createRopeFrog()
  const goal = round.snapshot.goal
  let finished = false
  let won = false
  let harms = 0
  let visualTime = 0
  let winAt = 0
  let landedFor = Number.NEGATIVE_INFINITY
  let dropAt = -1

  // ---- the runner: a pivot at the stem, an arm that turns, and the vine on it.
  const pivot = new THREE.Group()
  pivot.name = 'Runner pivot'
  pivot.position.set(0, PIVOT_Y, 0)
  root.add(pivot)
  const arm = new THREE.Group()
  arm.name = 'Runner arm'
  pivot.add(arm)
  // A deep green, so the vine reads against the lily pad.
  const runnerMaterial = new THREE.MeshStandardMaterial({ color: '#2c6a2f', roughness: 0.5, metalness: 0 })
  owned.push(runnerMaterial)
  const runner = new THREE.Mesh(new THREE.BufferGeometry(), runnerMaterial)
  runner.name = 'Runner vine'
  runner.castShadow = true
  arm.add(runner)
  let runnerLength = ROPE_MAX_LENGTH
  let leaves: THREE.Object3D[] = []
  const pieces: Piece[] = []
  setRunnerLength(ROPE_MAX_LENGTH)

  // ---- the telegraph: a shadow sector on the pad, from the runner's edge out to ahead of it.
  const fanPositions: number[] = [0, 0, 0]
  for (let index = 0; index <= FAN_SEGMENTS; index += 1) {
    const angle = (index / FAN_SEGMENTS) * ROPE_TELEGRAPH_RADIANS
    fanPositions.push(Math.cos(angle) * ROPE_MAX_LENGTH * 1.05, 0, Math.sin(angle) * ROPE_MAX_LENGTH * 1.05)
  }
  const fanIndices: number[] = []
  for (let index = 1; index <= FAN_SEGMENTS; index += 1) fanIndices.push(0, index, index + 1)
  const fanGeometry = new THREE.BufferGeometry()
  fanGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fanPositions, 3))
  fanGeometry.setIndex(fanIndices)
  const fanMaterial = new THREE.MeshBasicMaterial({ color: '#0f2e1d', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })
  owned.push(fanGeometry, fanMaterial)
  const fan = new THREE.Mesh(fanGeometry, fanMaterial)
  fan.name = 'Runner shadow'
  fan.position.set(0, PAD_Y + 0.006, 0)
  fan.renderOrder = 1
  root.add(fan)

  // ---- the frog, on its spot of the pad.
  const frogSpot = new THREE.Vector3(Math.cos(ROPE_FROG_ANGLE) * ROPE_FROG_RADIUS, PAD_Y, Math.sin(ROPE_FROG_ANGLE) * ROPE_FROG_RADIUS)
  const knockSpot = new THREE.Vector3(Math.cos(ROPE_FROG_ANGLE) * KNOCK_SPOT, WATER_Y, Math.sin(ROPE_FROG_ANGLE) * KNOCK_SPOT)
  const frogRoot = new THREE.Group()
  frogRoot.name = 'Runner frog'
  frogRoot.position.copy(frogSpot)
  root.add(frogRoot)
  const frogModel = new THREE.Group()
  frogModel.name = 'Runner frog model'
  frogModel.scale.setScalar(FROG_SCALE)
  frogModel.position.y = FROG_LIFT * FROG_SCALE
  frogRoot.add(frogModel)
  const frogCritter = cloneCastCritter('water', 'frog')
  if (frogCritter) {
    frogModel.add(frogCritter)
  } else {
    // The cast is always loaded before a water game opens; this keeps a broken file playable.
    const body = new THREE.SphereGeometry(0.1, 14, 10)
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#6fb24f' })
    owned.push(body, bodyMaterial)
    frogModel.add(new THREE.Mesh(body, bodyMaterial))
  }

  // The lily's flower buds, to open on the win.
  const blooms: Bloom[] = []
  stage.plant?.traverse((object) => {
    if (object instanceof THREE.Mesh && Math.abs(object.scale.y - BLOOM_SCALE_Y) < 1e-4) {
      blooms.push({ object, scale: object.scale.clone() })
    }
  })

  // ---- helpers

  function runnerCurve(length: number): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = []
    for (let index = 0; index <= 4; index += 1) {
      const s = (index / 4) * length
      points.push(new THREE.Vector3(s, RUNNER_ARCH * Math.sin(Math.PI * s / ROPE_MAX_LENGTH), 0))
    }
    return new THREE.CatmullRomCurve3(points)
  }

  /** A piece of vine from `from` to `to` along the arm, as its own tube. */
  function vinePiece(from: number, to: number): THREE.TubeGeometry {
    const length = Math.max(0.02, to - from)
    const points: THREE.Vector3[] = []
    for (let index = 0; index <= 3; index += 1) {
      const s = from + (index / 3) * length
      points.push(new THREE.Vector3(s, RUNNER_ARCH * Math.sin(Math.PI * s / ROPE_MAX_LENGTH), 0))
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, RUNNER_RADIUS, 8, false)
  }

  function setRunnerLength(length: number): void {
    runnerLength = length
    runner.geometry.dispose()
    runner.geometry = new THREE.TubeGeometry(runnerCurve(length), 24, RUNNER_RADIUS, 8, false)
    for (const leaf of leaves) leaf.removeFromParent()
    leaves = []
    // Leaves along the vine; the cast's leaf is shared with the template, so it is never disposed here.
    const count = length > 0.5 ? 3 : 2
    for (let index = 0; index < count; index += 1) {
      const leaf = cloneCastCritter('water', 'runner_leaf')
      if (!leaf) continue
      const s = length * (index + 0.6) / (count + 0.4)
      leaf.position.set(s, RUNNER_ARCH * Math.sin(Math.PI * s / ROPE_MAX_LENGTH) + RUNNER_RADIUS, 0)
      leaf.scale.setScalar(LEAF_SCALE)
      leaf.rotation.set(0, index * 1.7, index % 2 ? 0.25 : -0.25)
      arm.add(leaf)
      leaves.push(leaf)
    }
  }

  /** Cut a piece of vine off the arm: it flies off spinning, and is disposed when it lands. */
  function snipPiece(from: number, to: number): void {
    // The arm is aimed at the sweep now, so the piece leaves from where the vine is this frame.
    arm.rotation.y = -sweep.angle
    const geometry = vinePiece(from, to)
    const object = new THREE.Mesh(geometry, runnerMaterial)
    object.name = 'Snipped runner'
    object.castShadow = true
    arm.add(object)
    // Keep it where it was in the world as it leaves, then let it fly off the way the arm points.
    root.attach(object)
    const direction = new THREE.Vector3(Math.cos(sweep.angle), 0, Math.sin(sweep.angle))
    const outward = (from + to) / 2
    pieces.push({
      object,
      geometry,
      velocity: direction.multiplyScalar(0.9 + outward * 0.4).add(new THREE.Vector3(0, 1.5 + Math.random() * 0.6, 0)),
      spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
      age: 0,
    })
  }

  function frogWorld(lift = 0): THREE.Vector3 {
    return frogRoot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.22 + lift, 0))
  }

  function onPass(crossing: RopeCrossing): void {
    if (!frog.onPad(crossing.time)) return
    const height = frog.heightAt(crossing.time)
    if (height >= ROPE_CLEAR_HEIGHT) {
      const before = runnerLength
      const streak = round.hit()
      const remaining = round.snapshot.goal - round.snapshot.hits
      const next = ropeLength(remaining, goal)
      if (next < before) snipPiece(next, before)
      setRunnerLength(next)
      sfx.play('snip', 1 + Math.min(0.6, streak * 0.08))
      stage.bounce(0.3)
      bursts.add(createBurst(frogWorld(0.05), {
        count: 12, colors: ['#b9db7a', '#7fb64f', '#e9f7c4'], size: 0.022, speed: [1, 2.2], lift: 0.4, gravity: 5, seconds: 0.55, onTop: true,
      }), root)
      if (crossing.returning) context.popAt(frogWorld(), 'DOUBLE!', 'good', true)
      else context.popAt(frogWorld(), streak >= 3 ? `+1 x${streak}` : '+1', 'good', streak >= 3)
      return
    }
    // Caught on the pad: a heart, a splash, and the frog goes into the pond.
    harms += 1
    round.harm()
    frog.knock(crossing.time)
    sfx.play('splash')
    sfx.play('harm')
    stage.shake(0.08)
    bursts.add(createBurst(knockSpot.clone().setY(WATER_Y + 0.05), {
      count: 26, colors: ['#ffffff', '#bfe9f5', '#7ec8e3'], size: 0.03, speed: [0.8, 1.8], lift: 1.4, gravity: 4, seconds: 0.9, shape: 'blob', onTop: true,
    }), root)
    bursts.add(createBurst(knockSpot.clone().setY(WATER_Y + 0.01), {
      count: 10, colors: ['#ffffff'], size: 0.02, speed: [0.4, 0.9], lift: 0.1, gravity: 0.5, seconds: 0.6, shape: 'star', onTop: true,
    }), root)
    context.popAt(frogWorld(), 'CAUGHT!', 'bad')
  }

  /** Where the frog is, how it is squashed and blinking, on the clock the runner keeps. */
  function placeFrog(): void {
    const clock = sweep.clock
    frogRoot.visible = true
    frogRoot.rotation.set(0, 0, 0)
    frogModel.scale.setScalar(FROG_SCALE)
    if (!frog.onPad(clock)) {
      const p = (clock - frog.knockedAt) / ROPE_KNOCK_SECONDS
      frogRoot.visible = Math.floor(clock * 12) % 2 === 0
      if (p < KNOCK_OUT_PART) {
        const q = p / KNOCK_OUT_PART
        frogRoot.position.lerpVectors(frogSpot, knockSpot, q)
        frogRoot.position.y = THREE.MathUtils.lerp(PAD_Y, WATER_Y, q) + Math.sin(Math.PI * q) * 0.3
        frogRoot.rotation.z = q * 3
      } else if (p < KNOCK_CLIMB_PART) {
        const q = (p - KNOCK_OUT_PART) / (KNOCK_CLIMB_PART - KNOCK_OUT_PART)
        frogRoot.position.copy(knockSpot)
        frogRoot.position.y = WATER_Y + Math.sin(q * Math.PI * 4) * 0.012
        frogRoot.rotation.z = 3 + q * 9
        frogRoot.rotation.x = Math.sin(q * 6) * 0.4
      } else {
        const q = Math.min(1, (p - KNOCK_CLIMB_PART) / (1 - KNOCK_CLIMB_PART))
        frogRoot.position.lerpVectors(knockSpot, frogSpot, q)
        frogRoot.position.y = THREE.MathUtils.lerp(WATER_Y, PAD_Y, q) + Math.sin(Math.PI * q) * 0.2
        frogRoot.rotation.z = (1 - q) * 0.5
      }
      frogModel.scale.set(FROG_SCALE, FROG_SCALE * 0.95, FROG_SCALE)
      return
    }
    frogRoot.position.copy(frogSpot)
    const since = clock - frog.hopStart
    if (Number.isFinite(since) && since >= 0 && since < ROPE_HOP_SECONDS) {
      frogRoot.position.y = PAD_Y + hopHeight(since, frog.peak)
      // Stretch in the air, squash on the take-off and on the landing.
      frogModel.scale.set(FROG_SCALE * 0.93, FROG_SCALE * 1.1, FROG_SCALE * 0.93)
      if (since < 0.08) frogModel.scale.set(FROG_SCALE * 1.14, FROG_SCALE * 0.82, FROG_SCALE * 1.14)
    } else if (Number.isFinite(since) && since >= ROPE_HOP_SECONDS && since < ROPE_HOP_SECONDS + 0.1) {
      frogModel.scale.set(FROG_SCALE * 1.16, FROG_SCALE * 0.8, FROG_SCALE * 1.16)
    }
    if (finished && won) {
      // The victory: two big hops, and the frog spins a little on the second.
      const t = visualTime - winAt
      if (t < 1.2) {
        const hop = t < 0.6 ? t : t - 0.6
        const height = t < 0.6 ? 0.5 : 0.36
        const u = hop / 0.6
        frogRoot.position.y = PAD_Y + 4 * height * u * (1 - u)
        if (t >= 0.6) frogRoot.rotation.y = (t - 0.6) / 0.6 * Math.PI * 2
      }
    }
  }

  function updateBlooms(): void {
    if (!finished || !won) return
    const eased = 1 - Math.pow(1 - Math.min(1, (visualTime - winAt) / 0.7), 3)
    for (const bloom of blooms) {
      bloom.object.scale.set(bloom.scale.x * (1 + 0.9 * eased), bloom.scale.y * (1 + 1.4 * eased), bloom.scale.z * (1 + 0.9 * eased))
    }
  }

  function hop(): void {
    if (finished || !frog.hop(sweep.clock)) return
    sfx.play('hop')
  }

  function debugState(): RopeDebugState {
    const snapshot = round.snapshot
    return {
      clock: sweep.clock,
      angle: sweep.angle,
      direction: sweep.direction,
      ahead: sweep.ahead,
      speed: sweep.speed,
      passes: sweep.passes,
      flicking: sweep.flicking,
      hits: snapshot.hits,
      harms,
      onPad: frog.onPad(sweep.clock),
      hopStart: frog.hopStart,
      finished,
    }
  }

  // Space hops too, as a bonus to the tap (the overlay owns the pointer, not the keys).
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ' || event.repeat) return
    event.preventDefault()
    hop()
  }
  window.addEventListener('keydown', onKeyDown)
  // A debug accessor for the browser checks (never shipped to a player: only with gardenDebug).
  const debugHook = new URLSearchParams(window.location.search).has('gardenDebug')
  if (debugHook) (window as RopeDebugWindow).__ropeGame = () => debugState()

  return {
    update(dt): void {
      visualTime += dt
      if (!finished) {
        for (const crossing of sweep.step(dt, round.snapshot.goal - round.snapshot.hits, goal)) onPass(crossing)
      }
      // The arm sits on the sweep; the shadow sector and the whoosh show what is coming.
      arm.rotation.y = -sweep.angle
      fan.rotation.y = -sweep.angle
      fan.scale.z = sweep.direction
      const ahead = sweep.ahead
      const prox = finished || ahead <= 0 ? 0 : Math.min(1, Math.max(0, 1 - ahead / ROPE_TELEGRAPH_RADIANS))
      fan.visible = !finished
      fanMaterial.opacity = 0.1 + 0.36 * prox
      sfx.whoosh(finished ? 0 : sweep.flicking ? 0.55 : Math.pow(prox, 1.5))
      for (const piece of pieces) {
        piece.age += dt
        piece.velocity.y -= 5 * dt
        piece.object.position.addScaledVector(piece.velocity, dt)
        piece.object.rotation.x += piece.spin.x * dt
        piece.object.rotation.y += piece.spin.y * dt
        piece.object.rotation.z += piece.spin.z * dt
      }
      for (let index = pieces.length - 1; index >= 0; index -= 1) {
        const piece = pieces[index]
        if (piece.age < PIECE_SECONDS) continue
        piece.object.removeFromParent()
        piece.geometry.dispose()
        pieces.splice(index, 1)
      }
      if (dropAt >= 0) {
        const t = Math.min(1, (visualTime - dropAt) / 0.5)
        pivot.position.y = THREE.MathUtils.lerp(PIVOT_Y, PAD_Y + 0.01, t)
        arm.rotation.x = t * 0.4
      }
      placeFrog()
      updateBlooms()
      // The landing sound: once per hop, as the frog comes down.
      const since = sweep.clock - frog.hopStart
      if (Number.isFinite(since) && since >= ROPE_HOP_SECONDS && landedFor !== frog.hopStart) {
        landedFor = frog.hopStart
        sfx.play('tap', 0.6)
      }
    },
    pointerDown(): void {
      hop()
    },
    pointerMove(): void {},
    pointerUp(): void {},
    finish(didWin): void {
      finished = true
      won = didWin
      sweep.stop()
      sfx.whoosh(0)
      winAt = visualTime
      if (didWin) {
        // The last segment snips off, the lily bounces and sparkles, and its flower opens.
        const last = runnerLength
        snipPiece(0, last)
        runner.visible = false
        for (const leaf of leaves) leaf.visible = false
        stage.bounce(1)
        stage.sparkle()
      } else {
        dropAt = visualTime
      }
      fan.visible = false
    },
    dispose(): void {
      sfx.whoosh(0)
      for (const piece of pieces) {
        piece.object.removeFromParent()
        piece.geometry.dispose()
      }
      pieces.length = 0
      for (const leaf of leaves) leaf.removeFromParent()
      leaves = []
      runner.geometry.dispose()
      window.removeEventListener('keydown', onKeyDown)
      root.removeFromParent()
      for (const part of owned) part.dispose()
      if (debugHook) delete (window as RopeDebugWindow).__ropeGame
    },
  }
}
