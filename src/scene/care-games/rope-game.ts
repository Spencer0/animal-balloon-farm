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
 * across the frog's knee height once per turn, and a hop still in the air as it
 * passes clears it. A clear snips a segment off the runner's tip. Caught on the
 * pad, the frog tumbles into the pond.
 *
 * The camera is set close on the pad, so the arena fills the screen. Each pass
 * is telegraphed on the pad: a light sweep line just ahead of the vine, a smear
 * trail behind it, and a ring under the frog that flashes as the vine nears.
 * The timing (angles, speeds, double passes, the fake slow-down) lives in
 * `src/game/care-rope.ts`.
 */

/** The pad's top, the pond's surface, and the runner's pivot at the stem. */
const PAD_Y = 0.04
const PAD_RADIUS = 0.45
const WATER_Y = 0.012
const PIVOT_Y = PAD_Y + 0.05
/** A thick vine: about twice the first version's thickness, so it reads at a glance. */
const RUNNER_RADIUS = 0.06
const RUNNER_ARCH = 0.01
const LEAF_SCALE = 3
const KNOCK_SPOT = 0.8
const KNOCK_OUT_PART = 0.25
const KNOCK_CLIMB_PART = 0.7
const PIECE_SECONDS = 1.5
/** The camera: a high 3/4 view, the pad filling this share of the width (desktop) or all of it (phone). */
const CAMERA_PITCH = 0.75
const DESKTOP_FILL = 0.65
const PHONE_FILL = 0.94
const PHONE_ASPECT = 1.2
/** The frog's share of the screen height. */
const FROG_SCREEN_SHARE = 0.13
const SMEAR_SAMPLES = 14
const SMEAR_SPAN = 1.1
const TELEGRAPH_AHEAD = 0.4
const BLOOM_SCALE_Y = 0.055
/** The outro slow-motion the player applies to a scene's update, and the hold after the beat. */
const OUTRO_TIME_SCALE = 0.35
const OUTRO_HOLD = 0.6
/** How long the win and lose beats play, in scene seconds (before the slow-motion). */
const WIN_BEAT = 2
const LOSE_BEAT = 1.6

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

/** A snapshot for the debug harness (`window.__ropeGame()`), read by the browser checks. */
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
  /** Scene seconds since the round ended (the beat), or null while it plays. */
  readonly beat: number | null
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
  let knockVisualAt = Number.NEGATIVE_INFINITY
  let landedFor = Number.NEGATIVE_INFINITY
  let dropAt = -1
  let frogScale = 1

  // ---- the runner: a pivot at the stem, an arm that turns, and the vine on it.
  const pivot = new THREE.Group()
  pivot.name = 'Runner pivot'
  pivot.position.set(0, PIVOT_Y, 0)
  root.add(pivot)
  const arm = new THREE.Group()
  arm.name = 'Runner arm'
  pivot.add(arm)
  // A bright, saturated green, so the vine reads against the pad and the pond.
  const runnerMaterial = new THREE.MeshStandardMaterial({ color: '#38c24a', emissive: '#0f3d14', emissiveIntensity: 0.6, roughness: 0.45, metalness: 0 })
  owned.push(runnerMaterial)
  const runner = new THREE.Mesh(new THREE.BufferGeometry(), runnerMaterial)
  runner.name = 'Runner vine'
  runner.castShadow = true
  arm.add(runner)
  // The leading end: a bud, and a little curl over it, so the tip is obvious.
  const budGeometry = new THREE.SphereGeometry(0.085, 14, 10)
  const curlGeometry = new THREE.TorusGeometry(0.06, 0.022, 8, 18, Math.PI * 1.5)
  owned.push(budGeometry, curlGeometry)
  const bud = new THREE.Mesh(budGeometry, runnerMaterial)
  bud.name = 'Runner bud'
  const curl = new THREE.Mesh(curlGeometry, runnerMaterial)
  curl.name = 'Runner curl'
  curl.rotation.z = -0.6
  arm.add(bud, curl)
  let runnerLength = ROPE_MAX_LENGTH
  let leaves: THREE.Object3D[] = []
  const pieces: Piece[] = []

  // ---- the smear: a fading ribbon of where the vine has just been.
  const smearPositions = new Float32Array((SMEAR_SAMPLES + 1) * 2 * 3)
  const smearColors = new Float32Array((SMEAR_SAMPLES + 1) * 2 * 4)
  const smearIndices: number[] = []
  for (let index = 0; index < SMEAR_SAMPLES; index += 1) {
    const a = index * 2
    smearIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const smearGeometry = new THREE.BufferGeometry()
  smearGeometry.setAttribute('position', new THREE.BufferAttribute(smearPositions, 3))
  smearGeometry.setAttribute('color', new THREE.BufferAttribute(smearColors, 4))
  smearGeometry.setIndex(smearIndices)
  const smearMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  owned.push(smearGeometry, smearMaterial)
  const smear = new THREE.Mesh(smearGeometry, smearMaterial)
  smear.name = 'Runner smear'
  smear.renderOrder = 1
  root.add(smear)

  // ---- the telegraph: a light sweep line just ahead of the vine, and a ring under the frog.
  const lineGeometry = new THREE.BoxGeometry(0.5, 0.004, 0.034)
  const lineMaterial = new THREE.MeshBasicMaterial({ color: '#d8ffb0', transparent: true, opacity: 0, depthWrite: false })
  owned.push(lineGeometry, lineMaterial)
  const line = new THREE.Mesh(lineGeometry, lineMaterial)
  line.name = 'Runner sweep line'
  line.renderOrder = 1
  root.add(line)

  const frogSpot = new THREE.Vector3(Math.cos(ROPE_FROG_ANGLE) * ROPE_FROG_RADIUS, PAD_Y, Math.sin(ROPE_FROG_ANGLE) * ROPE_FROG_RADIUS)
  const knockSpot = new THREE.Vector3(Math.cos(ROPE_FROG_ANGLE) * KNOCK_SPOT, WATER_Y, Math.sin(ROPE_FROG_ANGLE) * KNOCK_SPOT)
  const ringGeometry = new THREE.RingGeometry(0.1, 0.135, 36)
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  owned.push(ringGeometry, ringMaterial)
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  ring.name = 'Frog ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.set(frogSpot.x, PAD_Y + 0.005, frogSpot.z)
  ring.renderOrder = 2
  root.add(ring)

  // ---- the frog, on its spot of the pad. Its size is set by the camera each frame.
  const frogRoot = new THREE.Group()
  frogRoot.name = 'Runner frog'
  frogRoot.position.copy(frogSpot)
  root.add(frogRoot)
  const frogModel = new THREE.Group()
  frogModel.name = 'Runner frog model'
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
  // Measured unscaled, so the frog can be fitted to the screen and its feet kept on the pad.
  const frogBox = new THREE.Box3().setFromObject(frogModel)
  const frogRawHeight = Math.max(1e-3, frogBox.getSize(new THREE.Vector3()).y)
  const frogRawMinY = frogBox.min.y

  // The lily's flower buds, to open on the win.
  const blooms: Bloom[] = []
  stage.plant?.traverse((object) => {
    if (object instanceof THREE.Mesh && Math.abs(object.scale.y - BLOOM_SCALE_Y) < 1e-4) {
      blooms.push({ object, scale: object.scale.clone() })
    }
  })

  // ---- helpers

  function runnerY(s: number): number {
    return RUNNER_ARCH * Math.sin(Math.PI * s / ROPE_MAX_LENGTH)
  }

  function runnerCurve(length: number): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = []
    for (let index = 0; index <= 4; index += 1) {
      const s = (index / 4) * length
      points.push(new THREE.Vector3(s, runnerY(s), 0))
    }
    return new THREE.CatmullRomCurve3(points)
  }

  /** A piece of vine from `from` to `to` along the arm, as its own tube. */
  function vinePiece(from: number, to: number): THREE.TubeGeometry {
    const length = Math.max(0.02, to - from)
    const points: THREE.Vector3[] = []
    for (let index = 0; index <= 3; index += 1) {
      const s = from + (index / 3) * length
      points.push(new THREE.Vector3(s, runnerY(s), 0))
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, RUNNER_RADIUS, 8, false)
  }

  function setRunnerLength(length: number): void {
    runnerLength = length
    runner.geometry.dispose()
    runner.geometry = new THREE.TubeGeometry(runnerCurve(length), 24, RUNNER_RADIUS, 8, false)
    const tipY = runnerY(length)
    bud.position.set(length, tipY, 0)
    curl.position.set(length + 0.03, tipY + 0.07, 0)
    for (const leaf of leaves) leaf.removeFromParent()
    leaves = []
    // Leaves along the vine; the cast's leaf is shared with the template, so it is never disposed here.
    const count = length > 0.5 ? 4 : 2
    for (let index = 0; index < count; index += 1) {
      const leaf = cloneCastCritter('water', 'runner_leaf')
      if (!leaf) continue
      const s = length * (index + 0.6) / (count + 0.4)
      leaf.position.set(s, runnerY(s) + RUNNER_RADIUS * 0.6, 0)
      leaf.scale.setScalar(LEAF_SCALE)
      leaf.rotation.set(0, index * 1.7, index % 2 ? 0.3 : -0.3)
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

  /** Water spray where the vine skims the pad along the frog's ray. */
  function spray(): void {
    for (const radius of [0.14, 0.28, 0.4]) {
      bursts.add(createBurst(new THREE.Vector3(Math.cos(ROPE_FROG_ANGLE) * radius, PAD_Y + 0.02, Math.sin(ROPE_FROG_ANGLE) * radius), {
        count: 8, colors: ['#ffffff', '#bfe9f5', '#7ec8e3'], size: 0.014, speed: [0.5, 1.1], lift: 0.7, gravity: 3.5, seconds: 0.6, shape: 'blob', onTop: true,
      }), root)
    }
  }

  function onPass(crossing: RopeCrossing): void {
    if (!frog.onPad(crossing.time)) return
    const height = frog.heightAt(crossing.time)
    sfx.play('swish', crossing.returning ? 1.3 : 1)
    spray()
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
    knockVisualAt = visualTime
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

  /** Frame the pad: a high 3/4 view that fits the arena, and a frog sized to its share of the screen. */
  function frameCamera(): void {
    const camera = stage.camera
    const aspect = camera.aspect
    const fill = aspect >= PHONE_ASPECT ? DESKTOP_FILL : PHONE_FILL
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const distance = PAD_RADIUS / fill / (tanHalf * aspect)
    // Aim a little above the pad, so the lily's flower clears the HUD bar.
    const target = new THREE.Vector3(0, PAD_Y + 0.1, 0)
    camera.position.set(0, PAD_Y + Math.sin(CAMERA_PITCH) * distance, Math.cos(CAMERA_PITCH) * distance)
    camera.position.add(target)
    camera.lookAt(target)
    const visibleHeight = 2 * distance * tanHalf
    frogScale = (visibleHeight * FROG_SCREEN_SHARE) / frogRawHeight
  }

  function setFrog(sx: number, sy: number, sz: number): void {
    frogModel.scale.set(frogScale * sx, frogScale * sy, frogScale * sz)
    // Keep the feet on the pad however the frog is squashed.
    frogModel.position.y = -frogRawMinY * frogScale * sy
  }

  /** Where the frog is, how it is squashed and blinking. */
  function placeFrog(): void {
    const clock = sweep.clock
    frogRoot.visible = true
    frogRoot.rotation.set(0, 0, 0)
    const sinceKnock = visualTime - knockVisualAt
    if (sinceKnock < ROPE_KNOCK_SECONDS) {
      const p = sinceKnock / ROPE_KNOCK_SECONDS
      frogRoot.visible = Math.floor(visualTime * 12) % 2 === 0
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
      setFrog(1, 0.95, 1)
      return
    }
    frogRoot.position.copy(frogSpot)
    setFrog(1, 1, 1)
    if (finished && won) {
      // The victory: two big hops with a squash on each landing, and a spin on the second.
      const t = visualTime - winAt
      if (t < 1.2) {
        const hop = t < 0.6 ? t : t - 0.6
        const height = t < 0.6 ? 0.5 : 0.36
        const u = hop / 0.6
        frogRoot.position.y = PAD_Y + 4 * height * u * (1 - u)
        if (t >= 0.6) frogRoot.rotation.y = (t - 0.6) / 0.6 * Math.PI * 2
        if (u < 0.1 || (hop >= 0.5 && hop < 0.6)) setFrog(1.2, 0.8, 1.2)
        else setFrog(0.94, 1.1, 0.94)
      }
      return
    }
    const since = clock - frog.hopStart
    if (Number.isFinite(since) && since >= 0 && since < ROPE_HOP_SECONDS) {
      frogRoot.position.y = PAD_Y + hopHeight(since, frog.peak)
      if (since < 0.1) setFrog(1.25, 0.72, 1.25)
      else setFrog(0.9, 1.16, 0.9)
    } else if (Number.isFinite(since) && since >= ROPE_HOP_SECONDS && since < ROPE_HOP_SECONDS + 0.12) {
      setFrog(1.3, 0.7, 1.3)
    }
  }

  /** The smear: the arc the vine has swept over lately, fading out behind it. */
  function updateSmear(): void {
    smear.visible = !finished
    if (finished) return
    for (let index = 0; index <= SMEAR_SAMPLES; index += 1) {
      const t = index / SMEAR_SAMPLES
      const angle = sweep.angle - sweep.direction * SMEAR_SPAN * t
      const alpha = 0.7 * Math.pow(1 - t, 1.6)
      const outer = runnerLength + 0.03
      const inner = Math.max(0.05, runnerLength - 0.12)
      for (let side = 0; side < 2; side += 1) {
        const radius = side === 0 ? inner : outer
        const v = index * 2 + side
        smearPositions[v * 3] = Math.cos(angle) * radius
        smearPositions[v * 3 + 1] = PIVOT_Y + 0.01
        smearPositions[v * 3 + 2] = Math.sin(angle) * radius
        smearColors[v * 4] = 0.85
        smearColors[v * 4 + 1] = 1
        smearColors[v * 4 + 2] = 0.7
        smearColors[v * 4 + 3] = alpha
      }
    }
    smearGeometry.attributes.position.needsUpdate = true
    smearGeometry.attributes.color.needsUpdate = true
  }

  /** The telegraph: a line just ahead of the vine that brightens as the frog nears, and the frog's ring. */
  function updateTelegraph(): void {
    const ahead = sweep.ahead
    const prox = finished || ahead <= 0 ? 0 : Math.min(1, Math.max(0, 1 - ahead / ROPE_TELEGRAPH_RADIANS))
    const lineAngle = sweep.angle + sweep.direction * TELEGRAPH_AHEAD
    line.visible = !finished
    line.position.set(Math.cos(lineAngle) * 0.25, PAD_Y + 0.006, Math.sin(lineAngle) * 0.25)
    line.rotation.y = -lineAngle
    lineMaterial.opacity = 0.14 + 0.4 * prox
    // The ring flashes as the vine nears the frog: the "jump now" cue.
    const arriving = !finished && (sweep.flicking || (ahead > 0 && ahead < ROPE_TELEGRAPH_RADIANS))
    if (arriving) {
      const intensity = sweep.flicking ? 1 : 1 - ahead / ROPE_TELEGRAPH_RADIANS
      const pulse = 0.5 + 0.5 * Math.sin(visualTime * (10 + 22 * intensity))
      ringMaterial.opacity = (0.2 + 0.8 * intensity) * pulse
      ring.scale.setScalar(1 + 0.25 * intensity * pulse)
    } else {
      ringMaterial.opacity = 0
      ring.scale.setScalar(1)
    }
    ring.visible = !finished
  }

  function updateBlooms(): void {
    if (!finished || !won) return
    const eased = 1 - Math.pow(1 - Math.min(1, (visualTime - winAt) / 0.7), 3)
    for (const bloom of blooms) {
      bloom.object.scale.set(bloom.scale.x * (1 + 0.5 * eased), bloom.scale.y * (1 + 0.6 * eased), bloom.scale.z * (1 + 0.5 * eased))
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
      beat: finished ? visualTime - winAt : null,
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

  setRunnerLength(ROPE_MAX_LENGTH)

  return {
    update(dt): void {
      visualTime += dt
      if (!finished) {
        for (const crossing of sweep.step(dt, round.snapshot.goal - round.snapshot.hits, goal)) onPass(crossing)
      }
      // The camera is set after the stage's own update each frame, so the pad stays framed.
      frameCamera()
      // The arm sits on the sweep; the telegraph shows what is coming.
      arm.rotation.y = -sweep.angle
      updateSmear()
      updateTelegraph()
      sfx.whoosh(finished ? 0 : sweep.flicking ? 0.55 : Math.pow(Math.min(1, Math.max(0, 1 - sweep.ahead / ROPE_TELEGRAPH_RADIANS)), 1.5))
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
    /** The beat before the stamp: the scene's own slow-motion beat, then a hold. */
    get outroSeconds(): number {
      return (won ? WIN_BEAT : LOSE_BEAT) / OUTRO_TIME_SCALE + OUTRO_HOLD
    },
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
        bud.visible = false
        curl.visible = false
        for (const leaf of leaves) leaf.visible = false
        stage.bounce(1)
        stage.sparkle()
      } else {
        dropAt = visualTime
      }
      line.visible = false
      ring.visible = false
      smear.visible = false
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
