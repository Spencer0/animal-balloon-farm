import * as THREE from 'three'
import {
  HOP_BURR_HEIGHT,
  HOP_JUMP_AIR_SECONDS,
  HOP_THORN_HEIGHT,
  createHopRun,
  type HopEvent,
  type HopObstacle,
} from '../../game/care-hop'
import { cloneCastCritter, cloneCritter, loadGardenModels } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * HOP! A ladybug runs a leaf path in a side view on a beat. Tap to jump the
 * thorns and burrs; run into aphid clusters, or eat the arcs at the top of a
 * jump. A thorn or burr is harm: a thud, a shake, a blink and a heart. The
 * flower stands on the far side of the path, and on the win the ladybug skids
 * beside it. On a loss the ladybug tumbles.
 *
 * The framing is the same on every aspect: the view is always the same height,
 * so the ladybug is about a tenth of the screen tall, and the width follows the
 * window. The ladybug sits in the left third and the flower in the right.
 * The rules and physics live in `src/game/care-hop.ts`; this scene draws them
 * and reports each eat and harm through the round.
 */

/** The view: its height in world units at the path, and where things sit across it (-1..1 of the half width). */
const VIEW_HEIGHT = 4.6
const CAMERA_DISTANCE = 4.2
const CAMERA_Y = 0.94
const RUNNER_NDC = -0.6
const FLOWER_NDC = 0.62
const FLOWER_HEIGHT = 2
/** Depths: the path, the ladybug on it, the flower behind, the parallax bushes, the foreground. */
const PATH_Z = 0.4
const FLOWER_Z = -0.7
const MID_Z = -1.6
const FORE_Z = 1.25
const PATH_STEP = 0.25
const PATH_SAMPLES = 64
const PATH_HALF_WIDTH = 0.22
const PATH_THICKNESS = 0.13
const RUNNER_LENGTH = 0.8
const APHID_LENGTH = 0.22
const DANGER = new THREE.Color('#d2392c')
const SKID_SECONDS = 1.1
const SKID_SPEED = 3
const SPARKLE_COUNT = 12
const SPARKLE_SECONDS = 0.8

/** The path's height above the lawn at a point along the run: a gentle up and down. */
function groundY(u: number): number {
  return 0.16 + 0.07 * Math.sin(u * 0.75) + 0.035 * Math.sin(u * 1.9 + 1.1)
}

interface ObstacleView {
  readonly obstacle: HopObstacle
  readonly group: THREE.Group
  readonly aphids: THREE.Object3D[]
  wobble: number
  gone: boolean
  flee: THREE.Vector3 | null
  fleeAge: number
  readonly drift: THREE.Vector3
}

interface Streak {
  readonly mesh: THREE.Mesh
  age: number
  active: boolean
}

interface Sparkle {
  readonly mesh: THREE.Mesh
  readonly from: THREE.Vector3
  readonly drift: THREE.Vector3
  age: number
  active: boolean
}

/** Fit a model so its longest side is `size`, standing on y = 0 and centred on x and z. */
function fitCritter(object: THREE.Object3D, size: number): THREE.Group {
  const wrapper = new THREE.Group()
  wrapper.add(object)
  object.updateMatrixWorld(true)
  const extent = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  object.scale.setScalar(size / Math.max(1e-4, extent.x, extent.y, extent.z))
  object.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(object)
  const centre = fitted.getCenter(new THREE.Vector3())
  object.position.set(-centre.x, -fitted.min.y, -centre.z)
  return wrapper
}

/** A soft round glow, drawn once, for the halo behind each aphid cluster. */
function haloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for the hop halo')
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31)
  gradient.addColorStop(0, 'rgba(240,255,200,0.95)')
  gradient.addColorStop(0.45, 'rgba(210,255,150,0.45)')
  gradient.addColorStop(1, 'rgba(210,255,150,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A copy of every mesh's material in a clone, tinted toward danger red. Owned by the caller. */
function tintDanger(object: THREE.Object3D, into: Array<{ dispose(): void }>): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const material = child.material as THREE.MeshStandardMaterial
    if (!material.color) return
    const copy = material.clone()
    copy.color.lerp(DANGER, 0.45)
    child.material = copy
    into.push(copy)
  })
}

export function createHopGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const root = new THREE.Group()
  root.name = 'Hop game'
  stage.scene.add(root)
  const owned: Array<{ dispose(): void }> = []

  // ---- the framing: a fixed view height; the width follows the window.
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(VIEW_HEIGHT / 2 / CAMERA_DISTANCE))
  const camera = stage.camera
  const frame = (): { halfWidth: number; runnerX: number; flowerX: number } => {
    const halfWidth = (VIEW_HEIGHT / 2) * camera.aspect
    return { halfWidth, runnerX: RUNNER_NDC * halfWidth, flowerX: FLOWER_NDC * halfWidth }
  }
  const hopFov = stage.camera.fov
  const hopFrame = { position: new THREE.Vector3(0, CAMERA_Y, CAMERA_DISTANCE), look: new THREE.Vector3(0, CAMERA_Y, 0), fov: hopFov }
  stage.setFraming(() => hopFrame)

  // ---- the flower: the player's own plant, scaled up and set behind the path.
  const flowerHolder = new THREE.Group()
  flowerHolder.name = 'Hop flower'
  root.add(flowerHolder)
  if (stage.plant) {
    flowerHolder.add(stage.plant)
    flowerHolder.scale.setScalar(FLOWER_HEIGHT / Math.max(0.01, stage.plantHeight))
  }
  flowerHolder.position.z = FLOWER_Z

  const sparkleGeometry = new THREE.OctahedronGeometry(0.05, 0)
  const sparkleMaterial = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, depthWrite: false })
  owned.push(sparkleGeometry, sparkleMaterial)
  const sparkles: Sparkle[] = []
  for (let index = 0; index < SPARKLE_COUNT; index += 1) {
    const mesh = new THREE.Mesh(sparkleGeometry, sparkleMaterial)
    mesh.name = 'Hop sparkle'
    mesh.visible = false
    flowerHolder.add(mesh)
    sparkles.push({ mesh, from: new THREE.Vector3(), drift: new THREE.Vector3(), age: SPARKLE_SECONDS, active: false })
  }

  // ---- the path: a leaf-green top with a stem-brown front, redrawn each frame as the run scrolls.
  const topGeometry = new THREE.BufferGeometry()
  const faceGeometry = new THREE.BufferGeometry()
  const topPositions = new Float32Array(PATH_SAMPLES * 2 * 3)
  const facePositions = new Float32Array(PATH_SAMPLES * 2 * 3)
  const index: number[] = []
  for (let cell = 0; cell < PATH_SAMPLES - 1; cell += 1) {
    const a = cell * 2
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  topGeometry.setIndex(index)
  faceGeometry.setIndex(index)
  topGeometry.setAttribute('position', new THREE.BufferAttribute(topPositions, 3))
  faceGeometry.setAttribute('position', new THREE.BufferAttribute(facePositions, 3))
  const up = new Float32Array(PATH_SAMPLES * 2 * 3)
  for (let i = 1; i < up.length; i += 3) up[i] = 1
  const forward = new Float32Array(PATH_SAMPLES * 2 * 3)
  for (let i = 2; i < forward.length; i += 3) forward[i] = 1
  topGeometry.setAttribute('normal', new THREE.BufferAttribute(up, 3))
  faceGeometry.setAttribute('normal', new THREE.BufferAttribute(forward, 3))
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

  const shadowGeometry = new THREE.CircleGeometry(0.28, 18)
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#2f4a22', transparent: true, opacity: 0.32, depthWrite: false })
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  shadow.name = 'Hop shadow'
  root.add(shadow)
  owned.push(shadowGeometry, shadowMaterial)

  // ---- parallax: bushes at mid-depth that scroll slower than the path, and grass and petals in front that scroll faster.
  const bushGeometry = new THREE.SphereGeometry(1, 14, 10)
  const bushMaterial = new THREE.MeshLambertMaterial({ color: '#5e9a4d' })
  owned.push(bushGeometry, bushMaterial)
  const bushes: Array<{ mesh: THREE.Mesh; base: number }> = []
  for (let i = 0; i < 9; i += 1) {
    const mesh = new THREE.Mesh(bushGeometry, bushMaterial)
    mesh.scale.set(0.3 + (i % 3) * 0.1, 0.22 + (i % 2) * 0.08, 0.3)
    mesh.position.z = MID_Z
    mesh.name = 'Hop mid bush'
    root.add(mesh)
    bushes.push({ mesh, base: i * 1.1 })
  }
  const tuftMaterial = new THREE.MeshLambertMaterial({ color: '#79b453' })
  const petalMaterial = new THREE.MeshLambertMaterial({ color: '#f3a6b5' })
  const tuftGeometry = new THREE.ConeGeometry(0.06, 0.4, 4)
  const petalGeometry = new THREE.SphereGeometry(0.07, 6, 4)
  owned.push(tuftGeometry, petalGeometry, tuftMaterial, petalMaterial)
  const foreground: Array<{ mesh: THREE.Object3D; base: number; y: number; speed: number }> = []
  for (let i = 0; i < 16; i += 1) {
    const tuft = new THREE.Group()
    for (const dx of [-0.03, 0, 0.03]) {
      const blade = new THREE.Mesh(tuftGeometry, tuftMaterial)
      blade.position.set(dx * 2, 0.16, 0)
      blade.rotation.z = dx * -6
      tuft.add(blade)
    }
    tuft.position.z = FORE_Z
    tuft.name = 'Hop foreground grass'
    root.add(tuft)
    foreground.push({ mesh: tuft, base: i * 0.61, y: -0.28 - (i % 3) * 0.05, speed: 1.6 })
  }
  for (let i = 0; i < 8; i += 1) {
    const petal = new THREE.Mesh(petalGeometry, petalMaterial)
    petal.scale.set(1.3, 0.7, 0.4)
    petal.position.z = FORE_Z
    petal.name = 'Hop foreground petal'
    root.add(petal)
    foreground.push({ mesh: petal, base: 0.3 + i * 0.9, y: -0.05 + (i % 4) * 0.12, speed: 1.9 })
  }

  // ---- speed streaks behind the ladybug while it runs.
  const streakGeometry = new THREE.PlaneGeometry(0.42, 0.012)
  const streakMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })
  owned.push(streakGeometry, streakMaterial)
  const streaks: Streak[] = []
  for (let i = 0; i < 6; i += 1) {
    const mesh = new THREE.Mesh(streakGeometry, streakMaterial)
    mesh.visible = false
    mesh.name = 'Hop speed streak'
    root.add(mesh)
    streaks.push({ mesh, age: 1, active: false })
  }

  // ---- the ladybug, from the garden's own model, in a body that squashes and spins.
  const runner = new THREE.Group()
  runner.name = 'Hop ladybug'
  const body = new THREE.Group()
  body.name = 'Hop ladybug body'
  runner.add(body)
  // The garden's critters may still be loading when a game opens (the debug URL skips the garden), so wait for them.
  const attachLadybug = (): boolean => {
    const ladybug = cloneCritter('ladybug')
    if (!ladybug) return false
    const side = fitCritter(ladybug, RUNNER_LENGTH)
    side.rotation.y = Math.PI / 2
    body.add(side)
    return true
  }
  if (!attachLadybug()) void loadGardenModels().then(attachLadybug).catch(() => {})
  root.add(runner)

  // ---- the run: the obstacles, each with its own group.
  const halo = haloTexture()
  const haloMaterial = new THREE.SpriteMaterial({ map: halo, color: '#e8ff9e', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
  owned.push(halo, haloMaterial)
  const run = createHopRun()
  const views: ObstacleView[] = run.obstacles.map((obstacle) => {
    const group = new THREE.Group()
    group.name = `Hop ${obstacle.kind} ${obstacle.id}`
    const aphids: THREE.Object3D[] = []
    if (obstacle.kind === 'thorn' || obstacle.kind === 'burr') {
      const model = cloneCastCritter('flower', obstacle.kind)
      if (model) {
        const fitted = fitCritter(model, obstacle.kind === 'thorn' ? HOP_THORN_HEIGHT : HOP_BURR_HEIGHT)
        tintDanger(fitted, owned)
        group.add(fitted)
      }
    } else {
      // An aphid cluster of three on the path, or a floating arc of five at the top of a jump; each has a halo.
      const spots: Array<{ dx: number; y: number }> = obstacle.kind === 'aphid'
        ? [{ dx: -0.1, y: 0.07 }, { dx: 0.02, y: 0.05 }, { dx: 0.12, y: 0.08 }]
        : obstacle.points.map((point) => ({ dx: point.dx, y: point.y }))
      for (const spot of spots) {
        const aphid = cloneCastCritter('flower', 'aphid')
        if (!aphid) continue
        const fitted = fitCritter(aphid, APHID_LENGTH)
        fitted.position.set(spot.dx, spot.y, obstacle.kind === 'aphid' ? (spot.dx > 0 ? 0.03 : -0.03) : 0)
        fitted.rotation.y = Math.random() * 6
        group.add(fitted)
        aphids.push(fitted)
        const glow = new THREE.Sprite(haloMaterial)
        glow.scale.setScalar(0.5)
        glow.position.set(spot.dx, spot.y + 0.05, -0.04)
        group.add(glow)
      }
    }
    root.add(group)
    return { obstacle, group, aphids, wobble: 0, gone: false, flee: null, fleeAge: 0, drift: new THREE.Vector3() }
  })

  // ---- the state of the round.
  let time = 0
  let finished = false
  let won = false
  let skidAge = 0
  let skidDistance = 0
  let frozenRun = 0
  let stretch = 0
  let squash = 0
  let dustClock = 0
  let streakClock = 0
  let tumble = 0
  let bounce = 0
  let sparkClock = 0
  let runnerX = 0
  let jolt = 0

  /** Debug harness only: where the run is, and what is coming up. */
  if (new URLSearchParams(window.location.search).has('gardenDebug')) {
    (window as unknown as { __hopDebug?: unknown }).__hopDebug = () => ({
      beats: run.beats,
      runnerX: run.runnerX,
      lift: run.lift,
      airborne: run.airborne,
      blink: run.blink,
      finished,
      won,
      runnerVisible: runner.visible,
      bodyScale: body.scale.toArray(),
      bodyChildren: body.children.length,
      bodyMeshes: (() => { let n = 0; let v = 0; body.traverse((c) => { if (c instanceof THREE.Mesh) { n += 1; v += c.geometry.attributes.position?.count ?? 0 } }); return [n, v] })(),
      runnerBox: new THREE.Box3().setFromObject(runner).getSize(new THREE.Vector3()).toArray(),
      runnerMin: new THREE.Box3().setFromObject(runner).min.toArray(),
      runnerScreenX: runner.position.x,
      runnerY: runner.position.y,
      flowerScreenX: flowerHolder.position.x,
      aspect: camera.aspect,
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
    }
    view.group.visible = false
    bursts.add(createBurst(at, { count: 16, colors: ['#8fd46a', '#d9f7a6', '#5aa257'], size: 0.025, speed: [0.9, 2], lift: 0.6, gravity: 4, seconds: 0.6, onTop: true }), root)
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
    jolt = 0.12
    bursts.add(createBurst(at, { count: 14, colors: ['#8a5a2e', '#b5523c', '#f2d2a0'], size: 0.025, speed: [0.8, 1.7], lift: 0.5, gravity: 5, seconds: 0.5, onTop: true }), root)
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
        dust(4, 0.3)
      } else {
        const view = views.find((entry) => entry.obstacle === event.obstacle)
        if (!view) continue
        const at = new THREE.Vector3(view.obstacle.x, groundY(view.obstacle.x) + 0.2, PATH_Z)
        if (event.kind === 'eat') eat(view, at)
        else harm(view, at)
        if (round.snapshot.state !== 'playing') return
      }
    }
  }

  /** A puff of dust at the ladybug's feet. */
  function dust(count: number, size: number): void {
    const at = new THREE.Vector3(runnerX, groundY(run.runnerX) + 0.03, PATH_Z - 0.1)
    bursts.add(createBurst(at, { count, colors: ['#f2ead2', '#e8dcc0', '#fff6e0'], size, speed: [0.4, 1.1], lift: 0.25, gravity: 3, seconds: 0.45 }), root)
  }

  function drawPath(distance: number, lx: number): void {
    const first = Math.floor(distance / PATH_STEP) - PATH_SAMPLES / 2
    for (let i = 0; i < PATH_SAMPLES; i += 1) {
      const u = (first + i) * PATH_STEP
      const x = u - distance + lx
      const y = groundY(u)
      const at = i * 6
      topPositions[at] = x
      topPositions[at + 1] = y
      topPositions[at + 2] = PATH_Z - PATH_HALF_WIDTH
      topPositions[at + 3] = x
      topPositions[at + 4] = y
      topPositions[at + 5] = PATH_Z + PATH_HALF_WIDTH
      facePositions[at] = x
      facePositions[at + 1] = y
      facePositions[at + 2] = PATH_Z + PATH_HALF_WIDTH
      facePositions[at + 3] = x
      facePositions[at + 4] = y - PATH_THICKNESS
      facePositions[at + 5] = PATH_Z + PATH_HALF_WIDTH
    }
    topGeometry.attributes.position.needsUpdate = true
    faceGeometry.attributes.position.needsUpdate = true
  }

  /** Wrap a scrolling x into one span centred on zero. */
  const wrap = (x: number, span: number): number => ((((x % span) + span) % span) - span / 2)

  return {
    update(dt): void {
      time += dt
      const { halfWidth, runnerX: lx, flowerX } = frame()
      // The view: a fixed height, and the ladybug and flower placed by the width.
      camera.fov = fov
      camera.updateProjectionMatrix()
      camera.position.set(jolt > 0 ? (Math.random() - 0.5) * jolt : 0, CAMERA_Y + (jolt > 0 ? (Math.random() - 0.5) * jolt : 0), CAMERA_DISTANCE)
      camera.lookAt(0, CAMERA_Y, 0)
      jolt = Math.max(0, jolt - dt * 0.6)
      flowerHolder.position.x = flowerX

      if (!finished) {
        if (dt > 0) handle(run.step(dt))
        if (round.snapshot.state !== 'playing') return
        runnerX = lx
      } else {
        skidAge += dt
        // After a win the world slides on and decays to a stop, while the ladybug skids to the flower.
        if (won) skidDistance = (SKID_SPEED / 4) * (1 - Math.exp(-4 * Math.min(skidAge, SKID_SECONDS)))
        if (won) {
          const t = Math.min(1, skidAge / SKID_SECONDS)
          runnerX = lx + (flowerX - 0.8 - lx) * (1 - Math.pow(1 - t, 3))
        } else {
          runnerX = lx
        }
        tumble = Math.min(1, tumble + dt * 2.5)
      }
      const distance = finished ? frozenRun + skidDistance : run.runnerX
      drawPath(distance, lx)

      // The ladybug: it runs, jumps, squashes, spins, tumbles or bounces.
      const lift = finished ? 0 : run.lift
      const bob = finished ? 0 : 0.025 * (1 - (run.beats % 1)) ** 2
      stretch = Math.max(0, stretch - dt * 9)
      squash = Math.max(0, squash - dt * 8)
      bounce = Math.max(0, bounce - dt * 3)
      const hop = won && finished && skidAge > SKID_SECONDS ? Math.abs(Math.sin(time * 9)) * bounce * 0.25 : 0
      runner.position.set(runnerX, groundY(distance) + lift + bob + hop - (finished && !won ? tumble * 0.05 : 0), PATH_Z + 0.02)
      body.scale.set(1 - stretch * 0.12 + squash * 0.22, 1 + stretch * 0.28 - squash * 0.3, 1 - stretch * 0.12 + squash * 0.22)
      if (!finished && run.airborne) body.rotation.z = (run.airSeconds / HOP_JUMP_AIR_SECONDS) * Math.PI * 2
      else if (finished && !won) body.rotation.z = tumble * Math.PI * 0.8
      else body.rotation.z = 0
      runner.visible = finished || run.blink <= 0 || Math.floor(time * 12) % 2 === 0

      // Dust under the running ladybug, and speed streaks behind it.
      if (!finished && !run.airborne) {
        dustClock -= dt
        if (dustClock <= 0) {
          dustClock = 0.22
          dust(2, 0.14)
        }
        streakClock -= dt
        if (streakClock <= 0) {
          streakClock = 0.08
          const streak = streaks.find((entry) => !entry.active)
          if (streak) {
            streak.active = true
            streak.age = 0
            streak.mesh.visible = true
            streak.mesh.position.set(runnerX - 0.45 - Math.random() * 0.5, groundY(distance) + 0.08 + Math.random() * 0.4, PATH_Z - 0.2)
          }
        }
      }
      for (const streak of streaks) {
        if (!streak.active) continue
        streak.age += dt
        streak.mesh.position.x -= dt * 6
        if (streak.age > 0.3) {
          streak.active = false
          streak.mesh.visible = false
        }
      }

      if (won && finished && skidAge < SKID_SECONDS) {
        sparkClock -= dt
        if (sparkClock <= 0) {
          sparkClock = 0.12
          bursts.add(createBurst(new THREE.Vector3(runnerX, groundY(distance) + 0.03, PATH_Z), { count: 3, colors: ['#e8dcc0'], size: 0.02, speed: [0.3, 0.7], lift: 0.1, gravity: 3, seconds: 0.3 }), root)
        }
      }

      shadow.position.set(runnerX, groundY(distance) + 0.006, PATH_Z)
      shadow.scale.setScalar(Math.max(0.35, 1 - lift * 0.8))

      // The obstacles scroll in from the right and out to the left.
      for (const view of views) {
        const screenX = view.obstacle.x - distance + lx
        const onScreen = Math.abs(screenX) < halfWidth + 0.8
        if (view.gone && view.flee === null) {
          view.group.visible = false
          continue
        }
        view.group.visible = onScreen
        view.group.position.set(screenX + view.drift.x, groundY(view.obstacle.x) + view.drift.y, PATH_Z + view.drift.z)
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
          if ((view.obstacle.kind === 'aphid' || view.obstacle.kind === 'arc') && !view.gone && !view.flee) {
            view.flee = new THREE.Vector3(1.2 + Math.random(), 1.8 + Math.random(), 0)
            for (const aphid of view.aphids) aphid.visible = true
          }
        }
      }

      // Parallax: mid bushes slower than the path, foreground grass and petals faster.
      const span = Math.max(6, halfWidth * 2 + 3)
      for (const bush of bushes) {
        bush.mesh.position.x = wrap(bush.base - distance * 0.4 + lx, span)
        bush.mesh.position.y = 0.3
      }
      for (const item of foreground) {
        item.mesh.position.x = wrap(item.base - distance * item.speed + lx, span)
        item.mesh.position.y = item.y
      }

      // The flower: its sparkles, when it has won.
      for (const spark of sparkles) {
        if (!spark.active) continue
        spark.age += dt
        const progress = spark.age / SPARKLE_SECONDS
        if (progress >= 1) {
          spark.active = false
          spark.mesh.visible = false
          continue
        }
        spark.mesh.position.copy(spark.from).addScaledVector(spark.drift, spark.age)
        spark.mesh.scale.setScalar(Math.sin(Math.PI * progress) + 0.05)
        spark.mesh.rotation.y += dt * 6
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
      runnerX = frame().runnerX
      run.setHolding(false)
      if (didWin) {
        // The flower bounces and sparkles; the ladybug skids up beside it and hops.
        stage.bounce(1)
        bounce = 1
        for (const spark of sparkles) {
          const angle = Math.random() * Math.PI * 2
          spark.from.set(Math.cos(angle) * 0.22, FLOWER_HEIGHT * (0.55 + Math.random() * 0.35), Math.sin(angle) * 0.22)
          spark.drift.set(Math.cos(angle) * 0.3, 0.3 + Math.random() * 0.3, Math.sin(angle) * 0.3)
          spark.age = 0
          spark.active = true
          spark.mesh.visible = true
          spark.mesh.position.copy(spark.from)
        }
      } else {
        stretch = 0
        squash = 0
        tumble = 0
        sfx.play('harm')
      }
    },
    dispose(): void {
      delete (window as unknown as { __hopDebug?: unknown }).__hopDebug
      if (stage.plant && stage.plant.parent === flowerHolder) stage.scene.add(stage.plant)
      root.removeFromParent()
      for (const part of owned) part.dispose()
    },
  }
}
