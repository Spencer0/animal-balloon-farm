import * as THREE from 'three'
import { CARE_GAME_RULES } from '../../game/care-minigames'
import {
  PADDLE_HOP_SECONDS,
  PADDLE_LANE_SPACING,
  PADDLE_REACH,
  buildPaddleCourse,
  paddleAirborne,
  paddleContactTime,
  paddleDistance,
  paddleLaneX,
  paddleOutcome,
  paddleSpeed,
  paddleStepLane,
  type PaddleBeat,
} from '../../game/care-paddle'
import { cloneCastCritter, type CareCritterName } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * SNAP! The frog swims away from the camera up a stream, in one of three lanes.
 * Mosquitoes hover in the lanes: be in the mosquito's lane when it comes into
 * reach and the tongue snaps it up. Logs are hopped (tap the middle, swipe up);
 * snags stand in a lane and must be dodged (swipe sideways, tap a side, or the
 * arrow keys, A and D). Three knocks and the frog is out.
 *
 * The camera sits low behind the frog and the stream runs away from it. The
 * water lily waits at the far end and grows nearer as the round goes on; on the
 * win the frog hops onto its pad. Every beat is keyed to the round's own clock
 * (`rules.seconds - timeLeft`), so the course is the same at any frame rate.
 */

const FROG_SCALE = 0.85
const MOSQUITO_SCALE = 4
const SNAG_SCALE = 1.5
/** The log model is this long along X before it is stretched to its lanes. */
const LOG_MODEL_LENGTH = 0.6
const LOG_THICKNESS = 1.2
/** The tongue model is this long (in its own units) at scale 1. */
const TONGUE_MODEL_LENGTH = 0.05
const TONGUE_FULL = PADDLE_REACH / (TONGUE_MODEL_LENGTH * FROG_SCALE)
const TONGUE_EXTEND = 0.1
const TONGUE_HOLD = 0.12
const TONGUE_RETRACT = 0.22
/** The frog model faces the camera at rest; a half turn shows its back, so it swims away down the stream. */
const FROG_AWAY = Math.PI
const LILY_FAR = 13
const LILY_NEAR = 1.3
const WATER_Y = 0.01
const PAD_Y = 0.1
const STREAM_HALF_WIDTH = 0.58
const STREAM_NEAR = 2.5
const STREAM_LENGTH = 32
const REED_LOOP = 15
const REEDS = 42
const RIPPLES = 10
const BLINK_SECONDS = 1.1
const SPIN_SECONDS = 0.6
const SWIPE_PX = 30
const CAMERA_Z = 1.45
const CAMERA_Y = 0.5
/** A beat is hidden once it has passed the frog (it flies off past the camera), or while it is still lost in the fog. */
const SHOW_NEAR = 0.3
const SHOW_FAR = -24
const FROG_LAND_AT = 0.8
const HOP_HEIGHT = 0.13

interface Item {
  readonly beat: PaddleBeat
  readonly object: THREE.Object3D
  readonly shadow: THREE.Mesh
  /** When the rules decide it, in seconds into the round. */
  readonly contact: number
  readonly centreX: number
  resolved: boolean
  /** A mosquito the tongue took: hidden from the moment it is eaten. */
  eaten: boolean
  /** A snag or log the frog bumped: it shivers for a moment. */
  jolt: number
}

interface Reed {
  readonly side: number
  readonly x: number
  readonly offset: number
  readonly height: number
  readonly cattail: boolean
}

interface Ripple {
  readonly mesh: THREE.Mesh
  readonly material: THREE.MeshBasicMaterial
  age: number
  life: number
  size: number
}

export function createPaddleGame(context: CareGameContext): CareGameScene {
  const { stage, sfx, bursts } = context
  const rules = CARE_GAME_RULES.paddle
  const root = new THREE.Group()
  root.name = 'Paddle game'
  stage.scene.add(root)
  const owned: Array<{ dispose(): void }> = []
  const dummy = new THREE.Object3D()

  // ---- set dressing: a stream instead of the pond, with a longer fog so the
  // lily and the obstacles fade in from the distance.
  for (const object of [...stage.scene.children]) {
    // The balloon hills stand in the stream's path and would hide the lily: push them out past it.
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.SphereGeometry && object.position.y < 0 && object.position.z < -3) object.position.z -= 14
    if (object.name.startsWith('Stage pond') || object.name === 'Stage reed' || object.name === 'Stage cattail') object.removeFromParent()
    // The stage's soft shadow sits under the plant's spot, which is now the stream.
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.PlaneGeometry && object.position.y === 0.005) object.visible = false
  }
  stage.scene.fog = new THREE.Fog('#d9efe6', 7, 24)

  const streamTexture = makeStreamTexture()
  owned.push(streamTexture)
  const streamMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', map: streamTexture })
  const streamGeometry = new THREE.PlaneGeometry(STREAM_HALF_WIDTH * 2, STREAM_LENGTH)
  streamGeometry.rotateX(-Math.PI / 2)
  owned.push(streamGeometry, streamMaterial)
  const stream = new THREE.Mesh(streamGeometry, streamMaterial)
  stream.name = 'Paddle stream'
  stream.position.set(0, WATER_Y, STREAM_NEAR - STREAM_LENGTH / 2)
  root.add(stream)

  const bankMaterial = new THREE.MeshLambertMaterial({ color: '#a98358' })
  const bankGeometry = new THREE.PlaneGeometry(0.7, STREAM_LENGTH)
  bankGeometry.rotateX(-Math.PI / 2)
  owned.push(bankMaterial, bankGeometry)
  for (const side of [-1, 1]) {
    const bank = new THREE.Mesh(bankGeometry, bankMaterial)
    bank.name = side < 0 ? 'Paddle bank left' : 'Paddle bank right'
    bank.position.set(side * (STREAM_HALF_WIDTH + 0.35), 0.006, STREAM_NEAR - STREAM_LENGTH / 2)
    root.add(bank)
  }

  // Reeds and cattails along the banks, instanced and looped past the camera.
  const reedGeometry = new THREE.CylinderGeometry(0.012, 0.016, 1, 5)
  reedGeometry.translate(0, 0.5, 0)
  const reedMaterial = new THREE.MeshLambertMaterial({ color: '#6c9a4e' })
  const cattailGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6)
  const cattailMaterial = new THREE.MeshLambertMaterial({ color: '#7a4f2e' })
  owned.push(reedGeometry, reedMaterial, cattailGeometry, cattailMaterial)
  const reeds = new THREE.InstancedMesh(reedGeometry, reedMaterial, REEDS)
  const cattails = new THREE.InstancedMesh(cattailGeometry, cattailMaterial, REEDS)
  reeds.name = 'Paddle reeds'
  cattails.name = 'Paddle cattails'
  reeds.frustumCulled = false
  cattails.frustumCulled = false
  const reedList: Reed[] = Array.from({ length: REEDS }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1
    return {
      side,
      x: side * (STREAM_HALF_WIDTH + 0.08 + Math.random() * 0.32),
      offset: Math.random() * REED_LOOP,
      height: 0.42 + Math.random() * 0.3,
      cattail: index % 3 === 0,
    }
  })
  root.add(reeds, cattails)

  // Ripples: a pool of rings that spread out and fade.
  const rippleGeometry = new THREE.RingGeometry(0.8, 1, 28)
  rippleGeometry.rotateX(-Math.PI / 2)
  owned.push(rippleGeometry)
  const ripples: Ripple[] = Array.from({ length: RIPPLES }, (_, index) => {
    const material = new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: 0, depthWrite: false })
    owned.push(material)
    const mesh = new THREE.Mesh(rippleGeometry, material)
    mesh.name = `Paddle ripple ${index + 1}`
    mesh.visible = false
    root.add(mesh)
    return { mesh, material, age: 1, life: 1, size: 0.1 }
  })
  const spawnRipple = (x: number, z: number, size: number, life = 0.8): void => {
    const slot = ripples.reduce((oldest, ripple) => (ripple.age / ripple.life > oldest.age / oldest.life ? ripple : oldest), ripples[0]!)
    slot.age = 0
    slot.life = life
    slot.size = size
    slot.mesh.position.set(x, WATER_Y + 0.004, z)
    slot.mesh.visible = true
  }

  // Soft shadows on the water, under every object: the depth cue.
  const shadowTexture = makeDiscTexture()
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, color: '#183a4a', transparent: true, opacity: 0.42, depthWrite: false })
  const shadowGeometry = new THREE.PlaneGeometry(1, 1)
  shadowGeometry.rotateX(-Math.PI / 2)
  owned.push(shadowTexture, shadowMaterial, shadowGeometry)
  const makeShadow = (name: string, width: number, depth: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(shadowGeometry, shadowMaterial)
    mesh.name = name
    mesh.scale.set(width, 1, depth)
    mesh.position.y = WATER_Y + 0.003
    root.add(mesh)
    return mesh
  }

  // ---- the frog, in a rig that moves between lanes and hops
  const frogRig = new THREE.Group()
  frogRig.name = 'Paddle frog'
  root.add(frogRig)
  const frog = cloneCastCritter('water', 'frog') ?? placeholder('frog', 'Paddle frog model')
  frog.scale.setScalar(FROG_SCALE)
  frog.rotation.y = FROG_AWAY
  frogRig.add(frog)
  const tongue = frog.getObjectByName('tongue') ?? null
  const frogShadow = makeShadow('Paddle frog shadow', 0.18, 0.22)

  // ---- the lily at the far end, growing nearer
  const lilyHolder = new THREE.Group()
  lilyHolder.name = 'Paddle lily'
  root.add(lilyHolder)
  if (stage.plant) {
    stage.plant.removeFromParent()
    lilyHolder.add(stage.plant)
  }

  // ---- the course: each beat is a mosquito, a snag or a log
  const beats = buildPaddleCourse(Math.random, rules.seconds)
  const items: Item[] = beats.map((beat, index) => {
    const kind: CareCritterName<'water'> = beat.kind === 'mosquito' ? 'mosquito' : beat.kind === 'snag' ? 'snag' : 'log'
    const object = cloneCastCritter('water', kind) ?? placeholder(beat.kind, `Paddle ${beat.kind} ${index + 1}`)
    const centreX = paddleLaneX(beat.lanes.reduce((sum, lane) => sum + lane, 0) / beat.lanes.length)
    let shadow: THREE.Mesh
    if (beat.kind === 'mosquito') {
      object.scale.setScalar(MOSQUITO_SCALE)
      shadow = makeShadow(`Paddle mosquito shadow ${index + 1}`, 0.09, 0.09)
    } else if (beat.kind === 'snag') {
      object.scale.setScalar(SNAG_SCALE)
      shadow = makeShadow(`Paddle snag shadow ${index + 1}`, 0.2, 0.14)
    } else {
      const length = PADDLE_LANE_SPACING * beat.lanes.length + 0.16
      object.scale.set(length / LOG_MODEL_LENGTH, LOG_THICKNESS, LOG_THICKNESS)
      shadow = makeShadow(`Paddle log shadow ${index + 1}`, length + 0.05, 0.24)
    }
    object.name = `Paddle ${beat.kind} ${index + 1}`
    root.add(object)
    return { beat, object, shadow, contact: paddleContactTime(beat), centreX, resolved: false, eaten: false, jolt: 0 }
  })

  // ---- play state. Lanes, hops and the tongue are the frog's own; the round
  // decides the outcome through `context.round`.
  let lane = 0
  let frogTargetX = paddleLaneX(0)
  let hopStart: number | null = null
  let blinkUntil = -1
  let spinUntil = -1
  let tongueAge = Number.POSITIVE_INFINITY
  let shakeAmount = 0
  let scroll = 0
  let scrollRate = 1
  let elapsed = 0
  let lilyAhead = LILY_FAR
  let finishing: 'won' | 'lost' | null = null
  let finishClock = 0
  let landed = false
  let rippleClock = 0
  const log: Array<{ at: number; beat: string; lane: number; outcome: string }> = []
  let disposed = false
  const pressed = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 }

  const live = (): boolean => {
    const snapshot = context.round.snapshot
    return finishing === null && snapshot.state === 'playing' && snapshot.timeLeft < rules.seconds
  }

  function step(direction: -1 | 1): void {
    if (!live()) return
    const next = paddleStepLane(lane, direction)
    if (next === lane) return
    lane = next
    sfx.play('swish')
    spawnRipple(frogRig.position.x, 0, 0.12, 0.45)
  }

  function hop(): void {
    if (!live() || paddleAirborne(hopStart, elapsed)) return
    hopStart = elapsed
    sfx.play('splash', 1.15)
    spawnRipple(frogRig.position.x, 0, 0.18, 0.7)
  }

  function eat(item: Item): void {
    item.eaten = true
    const streak = context.round.hit()
    tongueAge = 0
    const tip = new THREE.Vector3(paddleLaneX(lane), 0.1, -PADDLE_REACH)
    bursts.add(createBurst(tip, {
      count: 12, colors: ['#ff8fa3', '#ffd0d8', '#ffffff'], size: 0.03, speed: [0.8, 1.6], lift: 0.5, gravity: 4, seconds: 0.5, shape: 'star', onTop: true,
    }), root)
    sfx.play('slurp', 1 + Math.min(0.5, (streak - 1) * 0.08))
    context.popAt(tip, streak >= 3 ? `+1 x${streak}` : '+1', 'good', streak >= 3)
    context.hitStop(0.05)
  }

  function harm(item: Item, at: number): void {
    context.round.harm()
    item.jolt = 1
    blinkUntil = at + BLINK_SECONDS
    spinUntil = at + SPIN_SECONDS
    shakeAmount = 0.12
    sfx.play('thunk')
    sfx.play('harm')
    context.hitStop(0.06)
    const splash = new THREE.Vector3(frogRig.position.x, 0.08, 0)
    bursts.add(createBurst(splash, {
      count: 18, colors: ['#e8fbff', '#7fc9e6', '#ffffff'], size: 0.035, speed: [1, 2], lift: 0.6, gravity: 5, seconds: 0.7, onTop: true,
    }), root)
    context.popAt(new THREE.Vector3(frogRig.position.x, 0.2, 0), 'OUCH!', 'bad', true)
  }

  /** Decide every beat whose contact time has come. */
  function judge(now: number): void {
    for (const item of items) {
      if (item.resolved || item.contact > now) continue
      item.resolved = true
      const outcome = paddleOutcome(item.beat, lane, paddleAirborne(hopStart, item.beat.at))
      log.push({ at: Number(item.beat.at.toFixed(2)), beat: `${item.beat.kind}:${item.beat.lanes.join('/')}`, lane, outcome })
      if (outcome === 'eat') eat(item)
      else if (outcome === 'harm' && now >= blinkUntil) harm(item, now)
      else if (outcome === 'harm') item.jolt = 0.4
    }
  }

  /** Where a beat is now: it reaches the frog's z = 0 at its own time, and the stream carries it on. */
  function place(item: Item, now: number, dt: number): void {
    const z = -(paddleDistance(item.beat.at) - scroll)
    const kind = item.beat.kind
    if (kind === 'mosquito') {
      item.object.position.set(item.centreX, 0.1 + Math.sin(now * 9 + item.beat.at) * 0.018, z)
      item.object.rotation.y = Math.sin(now * 5 + item.beat.at) * 0.25
    } else {
      item.object.position.set(item.centreX, kind === 'log' ? 0.025 : 0, z)
      item.object.rotation.z = item.jolt > 0 ? Math.sin(now * 40) * item.jolt * 0.25 : 0
    }
    item.shadow.position.set(item.centreX, WATER_Y + 0.003, z)
    const hidden = item.eaten || z > SHOW_NEAR || z < SHOW_FAR
    item.object.visible = !hidden
    item.shadow.visible = !hidden
    item.jolt = Math.max(0, item.jolt - dt * 2.5)
  }

  // ---- the camera: low and behind the frog, looking down the stream.
  const camera = stage.camera
  function frame(dt: number): void {
    shakeAmount = Math.max(0, shakeAmount - dt * 0.9)
    const jitter = shakeAmount * shakeAmount * 0.5
    const x = frogRig.position.x
    camera.position.set(
      x * 0.35 + (Math.random() - 0.5) * jitter,
      CAMERA_Y + (Math.random() - 0.5) * jitter,
      CAMERA_Z,
    )
    camera.lookAt(x * 0.5, -0.05, -2.5)
    camera.updateMatrixWorld()
  }
  frame(0)

  // ---- input: swipes and taps, plus keys for the keyboard.
  const onKey = (event: KeyboardEvent): void => {
    if (event.repeat || !live()) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        step(-1)
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        step(1)
        break
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        event.preventDefault()
        hop()
        break
    }
  }
  window.addEventListener('keydown', onKey)

  function gesture(): void {
    const dx = pressed.lastX - pressed.startX
    const dy = pressed.lastY - pressed.startY
    if (Math.hypot(dx, dy) >= SWIPE_PX) {
      if (Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? -1 : 1)
      else if (dy < 0) hop()
      return
    }
    // A tap: a side third changes lanes, the middle third hops.
    const third = window.innerWidth / 3
    if (pressed.startX < third) step(-1)
    else if (pressed.startX > third * 2) step(1)
    else hop()
  }

  return {
    update(dt): void {
      if (disposed) return
      const snapshot = context.round.snapshot
      elapsed = Math.max(0, rules.seconds - snapshot.timeLeft)
      if (finishing === null && snapshot.state === 'playing' && elapsed > 0) judge(elapsed)

      // The stream: its distance follows the round's clock, then runs on after the round.
      if (finishing === null) {
        scroll = paddleDistance(elapsed)
      } else {
        scroll += paddleSpeed(elapsed) * dt * scrollRate
        scrollRate += ((finishing === 'won' ? 0.18 : 2.4) - scrollRate) * (1 - Math.exp(-dt * 3))
      }
      for (const item of items) place(item, elapsed, dt)
      reedList.forEach((reed, index) => {
        const z = -(REED_LOOP - 3) + ((((reed.offset + scroll) % REED_LOOP) + REED_LOOP) % REED_LOOP)
        dummy.position.set(reed.x, 0, z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, reed.height, 1)
        dummy.updateMatrix()
        reeds.setMatrixAt(index, dummy.matrix)
        dummy.position.set(reed.x, reed.height * 0.82 + 0.05, z)
        dummy.scale.set(1, reed.cattail ? 1 : 0.0001, 1)
        dummy.updateMatrix()
        cattails.setMatrixAt(index, dummy.matrix)
      })
      reeds.instanceMatrix.needsUpdate = true
      cattails.instanceMatrix.needsUpdate = true
      streamTexture.offset.y = scroll * 0.5

      // The lily: far at the start, nearer as the round goes on.
      const lilyTarget = finishing === 'won' ? 0 : THREE.MathUtils.lerp(LILY_FAR, LILY_NEAR, Math.min(1, snapshot.hits / rules.goal))
      lilyAhead += (lilyTarget - lilyAhead) * (1 - Math.exp(-dt * (finishing ? 4 : 3)))
      lilyHolder.position.set(0, 0, -lilyAhead)

      // The frog: lane eases, a lean, a paddle bob, a hop, a blink after a knock.
      const airborne = paddleAirborne(hopStart, elapsed)
      const hopProgress = hopStart === null ? 0 : Math.min(1, Math.max(0, (elapsed - hopStart) / PADDLE_HOP_SECONDS))
      const hopHeight = airborne ? Math.sin(Math.PI * hopProgress) * HOP_HEIGHT : 0
      const previousX = frogRig.position.x
      frogRig.position.x += (frogTargetX - previousX) * (1 - Math.exp(-dt * 16))
      const lean = THREE.MathUtils.clamp(-(frogTargetX - frogRig.position.x) * 2.2, -0.5, 0.5)
      frogRig.rotation.z = lean + Math.sin(elapsed * 9) * 0.05
      frogRig.position.y = WATER_Y + 0.004 + Math.sin(elapsed * 6) * 0.008 + hopHeight
      // A knock blinks the frog; after the round the frog is gone once it has bolted.
      const bolted = finishing === 'lost' && finishClock > 1.2
      const blinking = elapsed < blinkUntil && Math.floor(elapsed * 12) % 2 === 1
      frogRig.visible = !bolted && !blinking
      frog.rotation.y = FROG_AWAY + Math.sin(elapsed * 7) * 0.06
      if (elapsed < spinUntil) frog.rotation.y += ((spinUntil - elapsed) / SPIN_SECONDS) * Math.PI * 2
      frogShadow.position.set(frogRig.position.x, WATER_Y + 0.003, 0)
      frogShadow.scale.set(0.18 * (1 - hopHeight * 2.5), 1, 0.22 * (1 - hopHeight * 2.5))

      // The tongue: out to the mosquito, a beat, then back in.
      if (tongue) {
        tongueAge += dt
        let factor = 0
        if (tongueAge < TONGUE_EXTEND) factor = tongueAge / TONGUE_EXTEND
        else if (tongueAge < TONGUE_EXTEND + TONGUE_HOLD) factor = 1
        else if (tongueAge < TONGUE_EXTEND + TONGUE_HOLD + TONGUE_RETRACT) factor = 1 - (tongueAge - TONGUE_EXTEND - TONGUE_HOLD) / TONGUE_RETRACT
        tongue.scale.z = 1 + (TONGUE_FULL - 1) * THREE.MathUtils.clamp(factor, 0, 1)
      }

      // Ripples: the frog stirs the water as it swims.
      if (finishing === null && !airborne) {
        rippleClock += dt
        if (rippleClock > 0.42) {
          rippleClock = 0
          spawnRipple(frogRig.position.x, 0, 0.14)
        }
      }
      for (const ripple of ripples) {
        if (!ripple.mesh.visible) continue
        ripple.age += dt
        const progress = ripple.age / ripple.life
        if (progress >= 1) {
          ripple.mesh.visible = false
          continue
        }
        ripple.mesh.scale.setScalar(ripple.size * (0.6 + progress * 1.2))
        ripple.material.opacity = 0.7 * (1 - progress)
      }

      // The finish beats.
      if (finishing !== null) {
        finishClock += dt
        if (finishing === 'won') {
          frogTargetX = 0
          // The frog hops from the lane onto the pad.
          const landing = Math.min(1, Math.max(0, (finishClock - FROG_LAND_AT) / 0.6))
          frogRig.position.y = WATER_Y + 0.004 + (PAD_Y - WATER_Y - 0.004) * landing + Math.sin(Math.PI * landing) * 0.22
          if (landing >= 1 && !landed) {
            landed = true
            stage.bounce(0.7)
            stage.sparkle()
            sfx.play('win')
            bursts.add(createBurst(new THREE.Vector3(0, PAD_Y, 0), {
              count: 16, colors: ['#ffffff', '#cdeff7', '#fff3b0'], size: 0.03, speed: [0.9, 1.7], lift: 0.7, gravity: 3, seconds: 0.7, onTop: true,
            }), root)
          }
          if (landed) frog.rotation.y = FROG_AWAY + Math.min(1, (finishClock - FROG_LAND_AT - 0.6) / 0.9) * Math.PI * 2
        } else {
          // The frog bolts for the bank, bouncing away from the stream.
          frogTargetX = (frogRig.position.x >= 0 ? 1 : -1) * 0.9
          frogRig.position.y = WATER_Y + 0.004 + Math.abs(Math.sin(finishClock * 9)) * 0.16
        }
      }
      frame(dt)
    },
    pointerDown(x, y): void {
      if (!live()) return
      pressed.active = true
      pressed.startX = pressed.lastX = x
      pressed.startY = pressed.lastY = y
    },
    pointerMove(x, y): void {
      if (!pressed.active) return
      pressed.lastX = x
      pressed.lastY = y
    },
    pointerUp(): void {
      if (!pressed.active) return
      pressed.active = false
      gesture()
    },
    finish(won): void {
      finishing = won ? 'won' : 'lost'
      finishClock = 0
      pressed.active = false
      if (!won) sfx.play('thunk')
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      window.removeEventListener('keydown', onKey)
      root.removeFromParent()
      for (const part of owned) part.dispose()
    },
    debug() {
      return {
        lane,
        elapsed,
        airborne: paddleAirborne(hopStart, elapsed),
        blinking: elapsed < blinkUntil,
        log: log.slice(-30),
        frogX: frogRig.position.x,
        lilyAhead,
        upcoming: items
          .filter((item) => !item.resolved)
          .slice(0, 6)
          .map((item) => ({
            kind: item.beat.kind,
            lanes: [...item.beat.lanes],
            at: item.beat.at,
            contact: item.contact,
            z: Number((-(paddleDistance(item.beat.at) - scroll)).toFixed(3)),
          })),
      }
    },
  }

  function placeholder(kind: string, name: string): THREE.Object3D {
    const geometry = kind === 'mosquito' || kind === 'frog' ? new THREE.SphereGeometry(0.03, 8, 6) : new THREE.BoxGeometry(0.2, 0.12, 0.08)
    const material = new THREE.MeshLambertMaterial({ color: kind === 'frog' ? '#5f9e4a' : kind === 'mosquito' ? '#333333' : '#7a5a3a' })
    owned.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    return mesh
  }
}

function makeStreamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for the paddle stream')
  context.fillStyle = '#5aaccc'
  context.fillRect(0, 0, 64, 64)
  context.strokeStyle = 'rgba(230,250,255,0.6)'
  context.lineWidth = 4
  for (const y of [14, 42]) {
    context.beginPath()
    for (let x = 0; x <= 64; x += 4) {
      const wave = y + Math.sin((x / 64) * Math.PI * 2) * 3
      if (x === 0) context.moveTo(x, wave)
      else context.lineTo(x, wave)
    }
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, STREAM_LENGTH / 2)
  return texture
}

function makeDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for the paddle shadows')
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
