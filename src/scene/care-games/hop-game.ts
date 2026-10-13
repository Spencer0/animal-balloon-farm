import * as THREE from 'three'
import {
  HOP_BURR_HEIGHT,
  HOP_JUMP_AIR_SECONDS,
  HOP_THORN_HEIGHT,
  createHopRun,
  type HopEvent,
  type HopObstacle,
} from '../../game/care-hop'
import { cloneCastCritter, cloneCritter } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * HOP! A ladybug runs along a leaf path in a side view, past the player's
 * flower, on a beat. Tap to jump: the arc is fixed, so the rhythm is what you
 * learn. Aphid clusters on the path (and in arcs over the jumps) are eaten by
 * running into them; thorns and burrs must be jumped. Thorns are the harm:
 * a thud, a shake, a blink, and a heart. The flower stands behind the path,
 * where the run ends, and the ladybug skids to a stop beside it on the win.
 *
 * The rules and the physics live in `src/game/care-hop.ts`; this scene only
 * draws them and reports each eat and harm through the round.
 */

/** The ladybug's place on screen (world units from the stage centre). */
const RUNNER_SCREEN_X = -1.0
const RUNNER_STOP_X = -0.45
/** The path lies in front of the flower, which stands on the stage centre. */
const PATH_Z = 0.55
const PATH_STEP = 0.25
const PATH_SAMPLES = 60
const PATH_HALF_WIDTH = 0.22
const PATH_THICKNESS = 0.13
const RUNNER_LENGTH = 0.56
const APHID_SIZE = 0.17
const CAMERA_POSITION = new THREE.Vector3(-0.5, 0.95, 4.6)
const CAMERA_LOOK = new THREE.Vector3(-0.5, 0.42, 0)
/** Objects further than this from the ladybug on screen are not drawn. */
const VISIBLE_HALF = 4.6
const SKID_SECONDS = 1.1
const SKID_SPEED = 3

/** The path's height above the lawn at a point along the run: a gentle up and down. */
function hopGroundY(u: number): number {
  return 0.16 + 0.07 * Math.sin(u * 0.75) + 0.035 * Math.sin(u * 1.9 + 1.1)
}

interface ObstacleView {
  readonly obstacle: HopObstacle
  readonly group: THREE.Group
  /** Harm obstacles: a wobble after a hit; arc aphids: which of them are still there. */
  wobble: number
  readonly aphids: THREE.Object3D[]
  /** Set once eaten or scattered; a scattered aphid drifts up and away, then goes. */
  gone: boolean
  flee: THREE.Vector3 | null
  fleeAge: number
  /** How far a scattered group has drifted from where the run puts it. */
  readonly drift: THREE.Vector3
}

/** Fit a model so its longest side is `size`, standing on y = 0 and centred on x and z. */
function fitCritter(object: THREE.Object3D, size: number): THREE.Group {
  const wrapper = new THREE.Group()
  wrapper.add(object)
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const extent = box.getSize(new THREE.Vector3())
  const scale = size / Math.max(1e-4, extent.x, extent.y, extent.z)
  object.scale.setScalar(scale)
  object.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(object)
  const centre = fitted.getCenter(new THREE.Vector3())
  object.position.set(-centre.x, -fitted.min.y, -centre.z)
  return wrapper
}

export function createHopGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const root = new THREE.Group()
  root.name = 'Hop game'
  stage.scene.add(root)
  const owned: Array<{ dispose(): void }> = []
  stage.setFraming(CAMERA_POSITION, CAMERA_LOOK)

  // ---- the path: a leaf-green top with a stem-brown front, redrawn each frame as the run scrolls.
  const topGeometry = new THREE.BufferGeometry()
  const faceGeometry = new THREE.BufferGeometry()
  const topPositions = new Float32Array(PATH_SAMPLES * 2 * 3)
  const facePositions = new Float32Array(PATH_SAMPLES * 2 * 3)
  const topIndex: number[] = []
  const faceIndex: number[] = []
  for (let index = 0; index < PATH_SAMPLES - 1; index += 1) {
    const a = index * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    topIndex.push(a, c, b, b, c, d)
    faceIndex.push(a, c, b, b, c, d)
  }
  topGeometry.setIndex(topIndex)
  faceGeometry.setIndex(faceIndex)
  topGeometry.setAttribute('position', new THREE.BufferAttribute(topPositions, 3))
  faceGeometry.setAttribute('position', new THREE.BufferAttribute(facePositions, 3))
  topGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(PATH_SAMPLES * 2 * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  faceGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(PATH_SAMPLES * 2 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3))
  const topMaterial = new THREE.MeshLambertMaterial({ color: '#d4ef8a', side: THREE.DoubleSide })
  const faceMaterial = new THREE.MeshLambertMaterial({ color: '#2f6a2c', side: THREE.DoubleSide })
  const top = new THREE.Mesh(topGeometry, topMaterial)
  const face = new THREE.Mesh(faceGeometry, faceMaterial)
  top.name = 'Hop path top'
  face.name = 'Hop path stem'
  top.frustumCulled = false
  face.frustumCulled = false
  root.add(top, face)
  owned.push(topGeometry, faceGeometry, topMaterial, faceMaterial)

  const shadowGeometry = new THREE.CircleGeometry(0.26, 18)
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#2f4a22', transparent: true, opacity: 0.32, depthWrite: false })
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  shadow.name = 'Hop shadow'
  root.add(shadow)
  owned.push(shadowGeometry, shadowMaterial)

  // ---- the ladybug, from the garden's own model.
  const runner = new THREE.Group()
  runner.name = 'Hop ladybug'
  const body = new THREE.Group()
  body.name = 'Hop ladybug body'
  runner.add(body)
  const ladybug = cloneCritter('ladybug')
  if (ladybug) {
    // The model looks at the camera; turn its head to the right, along the run.
    const side = fitCritter(ladybug, RUNNER_LENGTH)
    side.rotation.y = Math.PI / 2
    body.add(side)
  }
  root.add(runner)

  // ---- the run: the obstacles, each with its own group.
  const run = createHopRun()
  const views: ObstacleView[] = run.obstacles.map((obstacle) => {
    const group = new THREE.Group()
    group.name = `Hop ${obstacle.kind} ${obstacle.id}`
    const aphids: THREE.Object3D[] = []
    if (obstacle.kind === 'thorn') {
      const thorn = cloneCastCritter('flower', 'thorn')
      if (thorn) group.add(fitCritter(thorn, HOP_THORN_HEIGHT))
    } else if (obstacle.kind === 'burr') {
      const burr = cloneCastCritter('flower', 'burr')
      if (burr) group.add(fitCritter(burr, HOP_BURR_HEIGHT))
    } else if (obstacle.kind === 'aphid') {
      // A cluster of three on the path.
      for (const [dx, dz] of [[-0.09, 0.03], [0.02, -0.04], [0.11, 0.04]]) {
        const aphid = cloneCastCritter('flower', 'aphid')
        if (!aphid) continue
        const fitted = fitCritter(aphid, APHID_SIZE)
        fitted.position.set(dx, 0, dz)
        fitted.rotation.y = Math.random() * 6
        group.add(fitted)
        aphids.push(fitted)
      }
    } else {
      // A floating arc: one aphid per point, hung in the air above the burr.
      for (const point of obstacle.points) {
        const aphid = cloneCastCritter('flower', 'aphid')
        if (!aphid) continue
        const fitted = fitCritter(aphid, APHID_SIZE)
        fitted.position.set(point.dx, point.y, 0)
        group.add(fitted)
        aphids.push(fitted)
      }
    }
    root.add(group)
    return { obstacle, group, wobble: 0, aphids, gone: false, flee: null, fleeAge: 0, drift: new THREE.Vector3() }
  })

  // ---- the state of the run
  let time = 0
  let finished = false
  let won = false
  let skidAge = 0
  let skidDistance = 0
  let frozenRun = 0
  let stretch = 0
  let squash = 0
  let sparkClock = 0

  const worldPosition = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z)

  // Debug harness only: where the run is, and what is coming up.
  if (new URLSearchParams(window.location.search).has('gardenDebug')) {
    (window as unknown as { __hopDebug?: unknown }).__hopDebug = () => ({
      beats: run.beats,
      runnerX: run.runnerX,
      lift: run.lift,
      airborne: run.airborne,
      blink: run.blink,
      finished,
      won,
      upcoming: views
        .filter((view) => !view.gone && view.obstacle.beat >= run.beats - 1)
        .slice(0, 6)
        .map((view) => ({ id: view.obstacle.id, kind: view.obstacle.kind, beat: view.obstacle.beat, x: view.obstacle.x })),
    })
  }

  function eat(view: ObstacleView, at: THREE.Vector3): void {
    view.gone = true
    if (view.obstacle.kind === 'arc') {
      for (const aphid of view.aphids) aphid.visible = false
    } else {
      view.group.visible = false
    }
    bursts.add(createBurst(at, { count: 14, colors: ['#8fd46a', '#d9f7a6', '#5aa257'], size: 0.02, speed: [0.9, 1.9], lift: 0.5, gravity: 4, seconds: 0.6, onTop: true }), root)
    sfx.play('hopCrunch')
    const streak = round.hit()
    context.popAt(at, streak >= 5 ? `+1 x${streak}` : '+1', 'good', streak >= 5)
    context.hitStop(0.05)
    stage.bounce(0.3)
  }

  function harm(view: ObstacleView, at: THREE.Vector3): void {
    view.wobble = 0.4
    round.harm()
    sfx.play('harm')
    stage.shake(0.12)
    bursts.add(createBurst(at, { count: 12, colors: ['#8a5a2e', '#b5523c', '#f2d2a0'], size: 0.02, speed: [0.8, 1.6], lift: 0.5, gravity: 5, seconds: 0.5, onTop: true }), root)
    context.popAt(at, 'OUCH!', 'bad')
  }

  function handle(events: HopEvent[]): void {
    for (const event of events) {
      if (event.kind === 'beat') {
        // Every beat ticks; each bar's first beat is a kick.
        sfx.play(event.beat % 4 === 0 ? 'hopKick' : 'hopBeat')
      } else if (event.kind === 'takeoff') {
        sfx.play('hopJump')
        stretch = 1
      } else if (event.kind === 'land') {
        sfx.play('hopLand')
        squash = 1
        bursts.add(createBurst(worldPosition(RUNNER_SCREEN_X, hopGroundY(run.runnerX), PATH_Z), { count: 6, colors: ['#e8dcc0', '#fff6e0'], size: 0.018, speed: [0.5, 1.1], lift: 0.2, gravity: 4, seconds: 0.35 }), root)
      } else {
        const view = views.find((entry) => entry.obstacle === event.obstacle)
        if (!view) continue
        if (event.kind === 'eat') {
          const at = worldPosition(view.obstacle.x, hopGroundY(view.obstacle.x) + 0.1, PATH_Z)
          eat(view, at)
          // Eating the last one wins the round; the rest of this step is moot.
          if (round.snapshot.state !== 'playing') return
        } else {
          const at = worldPosition(view.obstacle.x, hopGroundY(view.obstacle.x) + 0.2, PATH_Z)
          harm(view, at)
          if (round.snapshot.state !== 'playing') return
        }
      }
    }
  }

  function drawPath(distance: number): void {
    const first = Math.floor(distance / PATH_STEP) - PATH_SAMPLES / 2
    for (let index = 0; index < PATH_SAMPLES; index += 1) {
      const u = (first + index) * PATH_STEP
      const x = u - distance + RUNNER_SCREEN_X
      const y = hopGroundY(u)
      const front = index * 6
      topPositions[front] = x
      topPositions[front + 1] = y
      topPositions[front + 2] = PATH_Z - PATH_HALF_WIDTH
      topPositions[front + 3] = x
      topPositions[front + 4] = y
      topPositions[front + 5] = PATH_Z + PATH_HALF_WIDTH
      facePositions[front] = x
      facePositions[front + 1] = y
      facePositions[front + 2] = PATH_Z + PATH_HALF_WIDTH
      facePositions[front + 3] = x
      facePositions[front + 4] = y - PATH_THICKNESS
      facePositions[front + 5] = PATH_Z + PATH_HALF_WIDTH
    }
    topGeometry.attributes.position.needsUpdate = true
    faceGeometry.attributes.position.needsUpdate = true
  }

  /** Where the world sits: the run's distance, or the skid's last few centimetres after a win. */
  function currentDistance(): number {
    return finished ? frozenRun + skidDistance : run.runnerX
  }

  return {
    update(dt): void {
      time += dt
      if (!finished) {
        if (dt > 0) handle(run.step(dt))
        if (round.snapshot.state !== 'playing') return
      } else {
        skidAge += dt
        // After a win the world slides on and decays to a stop, the ladybug skidding with it.
        if (won) skidDistance = (SKID_SPEED / 4) * (1 - Math.exp(-4 * Math.min(skidAge, SKID_SECONDS)))
      }
      const distance = currentDistance()
      drawPath(distance)

      // The ladybug: it runs, jumps, squashes and spins.
      const lift = finished ? 0 : run.lift
      const runnerX = won && finished
        ? RUNNER_SCREEN_X + (RUNNER_STOP_X - RUNNER_SCREEN_X) * (1 - Math.pow(1 - Math.min(1, skidAge / SKID_SECONDS), 3))
        : RUNNER_SCREEN_X
      const bob = finished ? 0 : 0.025 * (1 - (run.beats % 1)) ** 2
      stretch = Math.max(0, stretch - dt * 9)
      squash = Math.max(0, squash - dt * 8)
      runner.position.set(runnerX, hopGroundY(distance) + lift + bob, PATH_Z + 0.02)
      body.scale.set(1 - stretch * 0.12 + squash * 0.22, 1 + stretch * 0.28 - squash * 0.3, 1 - stretch * 0.12 + squash * 0.22)
      body.rotation.z = !finished && run.airborne ? (run.airSeconds / HOP_JUMP_AIR_SECONDS) * Math.PI * 2 : 0
      if (won && finished && skidAge < SKID_SECONDS) {
        sparkClock -= dt
        if (sparkClock <= 0) {
          sparkClock = 0.12
          bursts.add(createBurst(worldPosition(runner.position.x, runner.position.y - 0.05, PATH_Z), { count: 3, colors: ['#e8dcc0'], size: 0.016, speed: [0.3, 0.7], lift: 0.1, gravity: 3, seconds: 0.3 }), root)
        }
      }
      // Blink after a harm: the ladybug flickers for a second.
      runner.visible = finished || run.blink <= 0 || Math.floor(time * 12) % 2 === 0

      shadow.position.set(runnerX, hopGroundY(distance) + 0.006, PATH_Z)
      shadow.scale.setScalar(Math.max(0.35, 1 - lift * 0.9))

      // The obstacles scroll in from the right and out to the left.
      for (const view of views) {
        const screenX = view.obstacle.x - distance + RUNNER_SCREEN_X
        const onScreen = Math.abs(screenX) < VISIBLE_HALF
        if (view.gone && view.flee === null) {
          view.group.visible = false
          continue
        }
        view.group.visible = onScreen
        view.group.position.set(screenX + view.drift.x, hopGroundY(view.obstacle.x) + view.drift.y, PATH_Z + view.drift.z)
        if (view.wobble > 0) {
          view.wobble = Math.max(0, view.wobble - dt)
          view.group.rotation.z = Math.sin(view.wobble * 40) * view.wobble * 0.6
        } else {
          view.group.rotation.z = 0
        }
        if (view.flee) {
          view.fleeAge += dt
          view.drift.addScaledVector(view.flee, dt)
          for (const aphid of view.aphids) aphid.rotation.z += dt * 9
          view.group.visible = view.fleeAge < 1.4
        }
      }

      if (finished && won) {
        // The stragglers that were not eaten scatter up and away.
        for (const view of views) {
          if (view.obstacle.kind === 'aphid' || view.obstacle.kind === 'arc') {
            if (!view.gone && !view.flee) {
              view.flee = new THREE.Vector3(1.2 + Math.random(), 1.8 + Math.random(), 0)
              for (const aphid of view.aphids) aphid.visible = true
            }
          }
        }
      }
    },
    pointerDown(): void {
      if (finished) return
      run.setHolding(true)
      if (run.jump()) handle([{ kind: 'takeoff' }])
    },
    pointerMove(): void {},
    pointerUp(): void {
      run.setHolding(false)
    },
    finish(didWin): void {
      finished = true
      won = didWin
      skidAge = 0
      skidDistance = 0
      frozenRun = run.runnerX
      run.setHolding(false)
      if (didWin) {
        // The flower bounces and sparkles; the ladybug has done it.
        stage.bounce(1)
        stage.sparkle()
      } else {
        stretch = 0
        squash = 1
      }
    },
    dispose(): void {
      delete (window as unknown as { __hopDebug?: unknown }).__hopDebug
      root.removeFromParent()
      for (const part of owned) part.dispose()
    },
  }
}
