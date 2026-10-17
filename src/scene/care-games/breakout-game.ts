import * as THREE from 'three'
import {
  BREAKOUT_BALL_RADIUS, BREAKOUT_DEPTH, BREAKOUT_HALF_WIDTH, BREAKOUT_PADDLE_HALF,
  createBreakoutField, type BreakoutBug, type BreakoutEvent,
} from '../../game/care-breakout'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'
import { rootCritter, standInMesh } from './root-cast'

/**
 * SQUASH! Bug breakout: looking down a raised bed, rows of bugs sit at the far
 * end in front of the vegetable they are nibbling. Slide the hoe along the near
 * edge (it follows the pointer, or the arrow keys) to bounce a pebble up the bed
 * and squash them; shelled beetles crack on the first hit and squash on the
 * second. A pebble that gets past the hoe is a heart.
 *
 * The bed's field (x across, y up the bed) is laid on the ground: world x is
 * field x and world z runs from the hoe's line toward the far end. The rules
 * and the bounce physics live in `src/game/care-breakout.ts`.
 */

const GROUND_Y = 0.32
/** Where the hoe's line (field y = 0) sits in world z; the bed runs away from it toward -z. */
const LINE_Z = 1.2
const WALL_HEIGHT = 0.16
const BUG_SIZE = 0.36
const PLANT_HEIGHT = 1.3
const PLANT_Z = LINE_Z - BREAKOUT_DEPTH - 0.55

interface BugView {
  readonly bug: BreakoutBug
  readonly group: THREE.Group
  readonly body: THREE.Group
  readonly phase: number
  /** Seconds since it was squashed, or -1 while it is alive. */
  squashed: number
  /** A shake after a hit that only cracked it. */
  wobble: number
  cracked: boolean
}

const fieldToWorld = (x: number, y: number, target: THREE.Vector3, height = GROUND_Y): THREE.Vector3 => target.set(x, height, LINE_Z - y)

export function createBreakoutGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const owned = context.owned
  const root = new THREE.Group()
  root.name = 'Breakout game'
  stage.scene.add(root)

  // ---- the framing: high over the hoe, looking down the bed to the vegetable.
  stage.setFraming((aspect) => {
    // Keep the bed's whole width in view on a narrow window by stepping back.
    const back = aspect < 1.3 ? Math.min(2.2, 1.3 / aspect) : 1
    return {
      position: new THREE.Vector3(0, 3.3 * back + 0.35, 2.4 * back + 0.75),
      look: new THREE.Vector3(0, 0.5, -0.75),
      fov: 46,
    }
  })

  // ---- the raised bed: dark soil inside wooden boards on three sides; the hoe's side is open.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const soilMaterial = new THREE.MeshLambertMaterial({ color: '#5e3c26' })
  const soilLight = new THREE.MeshLambertMaterial({ color: '#6f4a30' })
  const boardMaterial = new THREE.MeshLambertMaterial({ color: '#b5814b' })
  const boardDark = new THREE.MeshLambertMaterial({ color: '#8b5a34' })
  owned.push(boxGeometry, soilMaterial, soilLight, boardMaterial, boardDark)
  const bed = new THREE.Mesh(boxGeometry, soilMaterial)
  bed.scale.set(BREAKOUT_HALF_WIDTH * 2, GROUND_Y, BREAKOUT_DEPTH + 0.36)
  bed.position.set(0, GROUND_Y / 2, LINE_Z - BREAKOUT_DEPTH / 2 + 0.18)
  bed.name = 'Breakout bed'
  root.add(bed)
  // Furrows across the soil, so the pebble's speed reads.
  for (let row = 0; row < 7; row += 1) {
    const furrow = new THREE.Mesh(boxGeometry, soilLight)
    furrow.scale.set(BREAKOUT_HALF_WIDTH * 2 - 0.1, 0.012, 0.06)
    furrow.position.set(0, GROUND_Y + 0.003, LINE_Z - 0.2 - row * 0.4)
    root.add(furrow)
  }
  const walls: Array<[number, number, number, number]> = [
    // x, z, width, depth
    [-BREAKOUT_HALF_WIDTH - 0.06, LINE_Z - BREAKOUT_DEPTH / 2 + 0.12, 0.12, BREAKOUT_DEPTH + 0.48],
    [BREAKOUT_HALF_WIDTH + 0.06, LINE_Z - BREAKOUT_DEPTH / 2 + 0.12, 0.12, BREAKOUT_DEPTH + 0.48],
    [0, LINE_Z - BREAKOUT_DEPTH - 0.06, BREAKOUT_HALF_WIDTH * 2 + 0.24, 0.12],
  ]
  for (const [x, z, width, depth] of walls) {
    const board = new THREE.Mesh(boxGeometry, boardMaterial)
    board.scale.set(width, GROUND_Y + WALL_HEIGHT, depth)
    board.position.set(x, (GROUND_Y + WALL_HEIGHT) / 2, z)
    board.name = 'Breakout board'
    root.add(board)
    const cap = new THREE.Mesh(boxGeometry, boardDark)
    cap.scale.set(width + 0.02, 0.03, depth + 0.02)
    cap.position.set(x, GROUND_Y + WALL_HEIGHT + 0.015, z)
    root.add(cap)
  }

  // ---- the vegetable at the far end, behind the bugs.
  const plantHolder = new THREE.Group()
  plantHolder.name = 'Breakout vegetable'
  plantHolder.position.set(0, GROUND_Y, PLANT_Z)
  root.add(plantHolder)
  if (stage.plant) {
    plantHolder.add(stage.plant)
    plantHolder.scale.setScalar(PLANT_HEIGHT / Math.max(0.01, stage.plantHeight))
  }

  // ---- the bugs, in their rows.
  const field = createBreakoutField()
  const bugStandIn = standInMesh(new THREE.SphereGeometry(0.5, 12, 8), '#f0d27a', owned)
  const views: BugView[] = field.bugs.map((bug, index) => {
    const group = new THREE.Group()
    group.name = `Breakout ${bug.kind} ${bug.id}`
    const body = new THREE.Group()
    const name = bug.kind === 'shell' ? 'shellbug' : bug.kind
    body.add(rootCritter(name, BUG_SIZE, bugStandIn))
    group.add(body)
    fieldToWorld(bug.x, bug.y, group.position)
    root.add(group)
    return { bug, group, body, phase: index * 1.37, squashed: -1, wobble: 0, cracked: false }
  })
  /** A cracked shell's darker copy of each of its materials, made on first crack. */
  function crackShell(view: BugView): void {
    if (view.cracked) return
    view.cracked = true
    view.body.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const material = child.material as THREE.MeshStandardMaterial
      if (!material.color) return
      const copy = material.clone()
      copy.color.multiplyScalar(0.62)
      child.material = copy
      owned.push(copy)
    })
  }

  // ---- the pebble, its shadow and a short trail; the hoe.
  const pebble = rootCritter('pebble', BREAKOUT_BALL_RADIUS * 2, standInMesh(new THREE.SphereGeometry(0.5, 12, 8), '#a9a39a', owned), true)
  root.add(pebble)
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#1e130b', transparent: true, opacity: 0.35, depthWrite: false })
  const shadowGeometry = new THREE.CircleGeometry(BREAKOUT_BALL_RADIUS, 16)
  owned.push(shadowMaterial, shadowGeometry)
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  root.add(shadow)
  const trailMaterial = new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.35, depthWrite: false })
  const trailGeometry = new THREE.CircleGeometry(BREAKOUT_BALL_RADIUS * 0.8, 12)
  owned.push(trailMaterial, trailGeometry)
  const trail: THREE.Mesh[] = Array.from({ length: 6 }, () => {
    const dot = new THREE.Mesh(trailGeometry, trailMaterial)
    dot.rotation.x = -Math.PI / 2
    dot.visible = false
    root.add(dot)
    return dot
  })
  const trailPoints: THREE.Vector3[] = []
  const hoe = rootCritter('hoe', BREAKOUT_PADDLE_HALF * 2, standInMesh(new THREE.BoxGeometry(1, 0.1, 0.12), '#c4ced6', owned))
  hoe.name = 'Breakout hoe'
  root.add(hoe)
  // A dotted launch line while the pebble waits on the hoe.
  const aimMaterial = new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.6, depthWrite: false })
  const aimGeometry = new THREE.CircleGeometry(0.025, 10)
  owned.push(aimMaterial, aimGeometry)
  const aimDots = Array.from({ length: 5 }, () => {
    const dot = new THREE.Mesh(aimGeometry, aimMaterial)
    dot.rotation.x = -Math.PI / 2
    root.add(dot)
    return dot
  })

  // ---- input: the pointer slides the hoe; the arrows slide it too; a tap or Space launches.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y)
  const hit = new THREE.Vector3()
  const keys = new Set<string>()
  function pointerToField(clientX: number, clientY: number): number | null {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1)
    raycaster.setFromCamera(ndc, stage.camera)
    return raycaster.ray.intersectPlane(ground, hit) ? hit.x : null
  }
  function keyDirection(): number {
    return (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const side = event.code === 'ArrowLeft' || event.code === 'KeyA' ? 'left' : event.code === 'ArrowRight' || event.code === 'KeyD' ? 'right' : null
    if (side) {
      event.preventDefault()
      keys.add(side)
      field.setKeyDirection(keyDirection())
    } else if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault()
      if (!finished) handle(field.launch())
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const side = event.code === 'ArrowLeft' || event.code === 'KeyA' ? 'left' : event.code === 'ArrowRight' || event.code === 'KeyD' ? 'right' : null
    if (!side) return
    keys.delete(side)
    field.setKeyDirection(keyDirection())
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  // ---- the state of the round.
  let time = 0
  let finished = false
  let won = false
  let hoeKick = 0
  const at = new THREE.Vector3()

  function handle(events: BreakoutEvent[]): void {
    for (const event of events) {
      if (event.kind === 'launch') {
        sfx.play('swish')
      } else if (event.kind === 'paddle') {
        hoeKick = 1
        sfx.play('clack', 1 + Math.abs(event.offset) * 0.25)
        round.whiff()
      } else if (event.kind === 'wall') {
        sfx.play('clack', 0.7)
        fieldToWorld(event.x, event.y, at, GROUND_Y + 0.05)
        bursts.add(createBurst(at, { count: 4, colors: ['#d8b98a', '#a07a4e'], size: 0.025, speed: [0.3, 0.8], lift: 0.4, gravity: 4, seconds: 0.35 }), root)
      } else if (event.kind === 'crack') {
        const view = views.find((entry) => entry.bug === event.bug)
        if (view) {
          view.wobble = 0.45
          crackShell(view)
        }
        sfx.play('crack')
        fieldToWorld(event.bug.x, event.bug.y, at, GROUND_Y + 0.2)
        bursts.add(createBurst(at, { count: 10, colors: ['#3d8a6a', '#7a5ab5', '#d6f2e4'], size: 0.03, speed: [0.6, 1.4], lift: 0.6, gravity: 4, seconds: 0.45, onTop: true }), root)
        context.popAt(at, 'CRACK!', 'plain')
        context.hitStop(0.03)
      } else if (event.kind === 'squash') {
        squash(event.bug)
      } else if (event.kind === 'lost') {
        round.harm()
        sfx.play('harm')
        stage.shake(0.1)
        fieldToWorld(event.x, 0, at, GROUND_Y + 0.3)
        context.popAt(at, 'MISSED!', 'bad')
      }
      if (round.snapshot.state !== 'playing') return
    }
  }

  function squash(bug: BreakoutBug): void {
    const view = views.find((entry) => entry.bug === bug)
    if (view) view.squashed = 0
    fieldToWorld(bug.x, bug.y, at, GROUND_Y + 0.12)
    const goo = bug.kind === 'grub' ? ['#f3ead2', '#e6d6a6', '#b5642c'] : bug.kind === 'shell' ? ['#3d8a6a', '#7a5ab5', '#c8f0d8'] : ['#f0d27a', '#2b2226', '#d77a2e']
    bursts.add(createBurst(at, { count: 18, colors: goo, size: 0.035, speed: [0.8, 1.8], lift: 0.7, gravity: 5, seconds: 0.55, onTop: true }), root)
    sfx.play('squish')
    const streak = round.hit()
    context.popAt(at, streak >= 4 ? `SQUASH! x${streak}` : 'SQUASH!', 'good', streak >= 4)
    context.hitStop(0.05)
    stage.bounce(0.25)
  }

  /** Debug harness: the pebble, the hoe and the bugs left, for scripted play. */
  function debugState(): unknown {
    const ball = field.ball
    const hoeScreen = stage.toScreen(fieldToWorld(field.paddleX, 0, new THREE.Vector3()))
    return {
      ball,
      docked: field.docked,
      paddleX: field.paddleX,
      squashed: field.squashed,
      left: field.bugs.filter((bug) => field.hitsLeft(bug) > 0).map((bug) => ({ id: bug.id, x: bug.x, y: bug.y, hits: field.hitsLeft(bug) })),
      hoeScreenY: hoeScreen.y,
      /** Screen x of a field x at the hoe's line, so a script can point the hoe. */
      screenXAt: [-1.6, -0.8, 0, 0.8, 1.6].map((x) => ({ x, screenX: stage.toScreen(fieldToWorld(x, 0, new THREE.Vector3())).x })),
      finished,
    }
  }

  return {
    outroSeconds: 1.1,
    update(dt): void {
      time += dt
      if (!finished && dt > 0) {
        handle(field.step(dt))
        if (round.snapshot.state !== 'playing') return
      }
      // The hoe rides its x; it kicks forward a touch on each bounce.
      hoeKick = Math.max(0, hoeKick - dt * 6)
      fieldToWorld(field.paddleX, -hoeKick * 0.05, hoe.position, GROUND_Y + 0.01)
      hoe.rotation.x = -hoeKick * 0.25

      // The pebble rolls; its shadow and trail follow.
      const ball = field.ball
      fieldToWorld(ball.x, ball.y, pebble.position, GROUND_Y + BREAKOUT_BALL_RADIUS + 0.01)
      pebble.visible = !(finished && won)
      pebble.rotation.x -= ball.vy * dt / BREAKOUT_BALL_RADIUS
      pebble.rotation.z -= ball.vx * dt / BREAKOUT_BALL_RADIUS
      shadow.position.set(pebble.position.x + 0.02, GROUND_Y + 0.004, pebble.position.z + 0.02)
      shadow.visible = pebble.visible
      if (!field.docked && !finished) {
        trailPoints.unshift(pebble.position.clone())
        trailPoints.length = Math.min(trailPoints.length, trail.length * 2)
      } else {
        trailPoints.length = 0
      }
      trail.forEach((dot, index) => {
        const point = trailPoints[index * 2 + 1]
        dot.visible = Boolean(point)
        if (point) {
          dot.position.set(point.x, GROUND_Y + 0.005, point.z)
          dot.scale.setScalar(1 - index / trail.length)
        }
      })
      // The launch line from the waiting pebble.
      aimDots.forEach((dot, index) => {
        dot.visible = field.docked && !finished
        const step = (index + 1) * 0.22
        const lean = field.paddleX >= 0 ? -0.22 : 0.22
        fieldToWorld(ball.x + Math.sin(lean * 1.08) * step, ball.y + Math.cos(lean * 1.08) * step, dot.position, GROUND_Y + 0.006)
        dot.scale.setScalar(1 + Math.sin(time * 6 - index) * 0.2)
      })

      // The bugs fidget; cracked ones shake; squashed ones flatten and sink away.
      for (const view of views) {
        if (view.squashed >= 0) {
          view.squashed += dt
          const t = Math.min(1, view.squashed / 0.5)
          view.body.scale.set(1 + t * 0.5, Math.max(0.05, 1 - t * 0.95), 1 + t * 0.5)
          view.group.visible = view.squashed < 0.9
          continue
        }
        const nibble = Math.sin(time * 5 + view.phase)
        view.body.rotation.y = Math.sin(time * 1.6 + view.phase) * 0.25 + (finished && !won ? Math.sin(time * 14) * 0.2 : 0)
        view.body.position.y = Math.max(0, nibble) * 0.025 + (finished && !won ? Math.abs(Math.sin(time * 8 + view.phase)) * 0.12 : 0)
        if (view.wobble > 0) {
          view.wobble = Math.max(0, view.wobble - dt)
          view.body.rotation.z = Math.sin(view.wobble * 40) * view.wobble * 0.6
        } else {
          view.body.rotation.z = 0
        }
      }
    },
    pointerDown(x, y): void {
      const target = pointerToField(x, y)
      if (target !== null) field.setPaddleTarget(target)
      if (!finished) handle(field.launch())
    },
    pointerMove(x, y): void {
      if (keyDirection() !== 0) return
      const target = pointerToField(x, y)
      if (target !== null) field.setPaddleTarget(target)
    },
    pointerUp(): void {},
    finish(didWin): void {
      finished = true
      won = didWin
      if (didWin) {
        stage.bounce(1)
        const top = new THREE.Vector3(0, GROUND_Y + PLANT_HEIGHT * 0.6, PLANT_Z)
        bursts.add(createBurst(top, { count: 26, colors: ['#fff3b0', '#ffd24a', '#bff27a'], size: 0.05, speed: [0.8, 2], lift: 0.8, gravity: 2.5, seconds: 1, shape: 'star', onTop: true }), root)
        sfx.play('bonus')
      }
    },
    debug: debugState,
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (stage.plant && stage.plant.parent === plantHolder) stage.scene.add(stage.plant)
      stage.setFraming(null)
      root.removeFromParent()
    },
  }
}
