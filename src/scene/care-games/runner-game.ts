import * as THREE from 'three'
import {
  RUNNER_COLS, RUNNER_E, RUNNER_N, RUNNER_ROWS, RUNNER_S, RUNNER_W,
  createRunnerBed, runnerTurnToward, type RunnerEvent,
} from '../../game/care-runner'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'
import { glowTexture, standInMesh } from './root-cast'
import { arrowVector, backOut, borrowPlant, boxFraming, orientedFraming, PORTRAIT_ASPECT, screenHeading, vineCritter } from './vine-cast'

/**
 * STEER! The runner steer: the vine has sent a runaway runner sprawling over its
 * bed. Steer its tip (the arrow keys, a swipe, or a tap toward where it should
 * go) onto the garden peg; the peg pins it down, it grows a leaf longer and
 * creeps a little quicker, and the next peg pops up. Creeping into the bed's
 * edge or into itself tangles it: a heart.
 *
 * The bed lies on the ground: column c along +x, row r away from the camera
 * (-z), so the rules' N is -z and E is +x. The rules live in
 * `src/game/care-runner.ts`.
 */

const CELL = 0.25
const BED_TOP = 0.12
const HALF_X = (RUNNER_COLS / 2) * CELL
const HALF_Z = (RUNNER_ROWS / 2) * CELL
const PLANT_SIZE = 1.05
/** The vine stands behind the bed's far side, or (on a tall window) off its right-hand end. */
const PLANT_BEHIND = new THREE.Vector3(0, 0, -HALF_Z - 0.62)
const PLANT_BEYOND = new THREE.Vector3(HALF_X + 0.62, 0, 0)
const STEM_RADIUS = 0.045
const LEAF_SIZE = 0.3
const PEG_SIZE = 0.5
/** A swipe this many CSS pixels long turns the tip. */
const SWIPE_PIXELS = 26
/** Pooled pieces of the runner: the longest it gets is its start plus a cell per peg. */
const MAX_LENGTH = 16

const gridX = (col: number): number => (col - (RUNNER_COLS - 1) / 2) * CELL
const gridZ = (row: number): number => ((RUNNER_ROWS - 1) / 2 - row) * CELL

export function createRunnerGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const owned = context.owned
  const root = new THREE.Group()
  root.name = 'Runner game'
  stage.scene.add(root)
  const bed = createRunnerBed()

  // ---- the framing: the whole bed and the vine under the HUD. A wide window sees the bed from the front
  // with the vine behind it; a tall one looks along the bed's length, toward the vine at its far end.
  const plantAt = window.innerWidth / Math.max(1, window.innerHeight) < PORTRAIT_ASPECT ? PLANT_BEYOND : PLANT_BEHIND
  const playfield = new THREE.Box3(new THREE.Vector3(-HALF_X - 0.14, 0, -HALF_Z - 0.14), new THREE.Vector3(HALF_X + 0.14, 0.2, HALF_Z + 0.14))
    .union(new THREE.Box3().setFromCenterAndSize(plantAt.clone().setY(PLANT_SIZE * 0.25), new THREE.Vector3(PLANT_SIZE * 0.8, PLANT_SIZE * 0.5, PLANT_SIZE * 0.8)))
  stage.setFraming(orientedFraming(
    boxFraming(playfield, new THREE.Vector3(0, 1.75, 1), 40),
    boxFraming(playfield, new THREE.Vector3(-1, 1.75, 0), 40),
  ))

  // ---- the bed: soil in a wooden frame, with faint furrows marking its rows.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const soil = new THREE.MeshLambertMaterial({ color: '#6b4630' })
  const furrow = new THREE.MeshLambertMaterial({ color: '#7a5236' })
  const frame = new THREE.MeshLambertMaterial({ color: '#b5814b' })
  const frameCap = new THREE.MeshLambertMaterial({ color: '#8b5a34' })
  owned.push(boxGeometry, soil, furrow, frame, frameCap)
  const ground = new THREE.Mesh(boxGeometry, soil)
  ground.scale.set(HALF_X * 2, BED_TOP, HALF_Z * 2)
  ground.position.set(0, BED_TOP / 2, 0)
  ground.name = 'Runner bed'
  root.add(ground)
  for (let row = 0; row < RUNNER_ROWS; row += 1) {
    const line = new THREE.Mesh(boxGeometry, furrow)
    line.scale.set(HALF_X * 2 - 0.06, 0.01, CELL * 0.62)
    line.position.set(0, BED_TOP + 0.002, gridZ(row))
    root.add(line)
  }
  for (const [x, z, width, depth] of [
    [0, -HALF_Z - 0.04, HALF_X * 2 + 0.16, 0.08], [0, HALF_Z + 0.04, HALF_X * 2 + 0.16, 0.08],
    [-HALF_X - 0.04, 0, 0.08, HALF_Z * 2], [HALF_X + 0.04, 0, 0.08, HALF_Z * 2],
  ] as const) {
    const board = new THREE.Mesh(boxGeometry, frame)
    board.scale.set(width, BED_TOP + 0.06, depth)
    board.position.set(x, (BED_TOP + 0.06) / 2, z)
    root.add(board)
    const cap = new THREE.Mesh(boxGeometry, frameCap)
    cap.scale.set(width + 0.012, 0.02, depth + 0.012)
    cap.position.set(x, BED_TOP + 0.07, z)
    root.add(cap)
  }

  // ---- the vine behind the bed.
  const plantHolder = new THREE.Group()
  plantHolder.name = 'Runner vine'
  plantHolder.position.copy(plantAt)
  root.add(plantHolder)
  const returnPlant = borrowPlant(stage, plantHolder, PLANT_SIZE)

  // ---- the runner: a stem of joints and links from a pool, its tip, leaves along it and a blossom where it was pegged.
  const stemMaterial = new THREE.MeshLambertMaterial({ color: '#5e8f3c' })
  const jointGeometry = new THREE.SphereGeometry(STEM_RADIUS, 10, 7)
  const linkGeometry = new THREE.CylinderGeometry(STEM_RADIUS * 0.85, STEM_RADIUS * 0.85, 1, 8)
  linkGeometry.rotateX(Math.PI / 2)
  owned.push(stemMaterial, jointGeometry, linkGeometry)
  const joints = Array.from({ length: MAX_LENGTH }, () => {
    const joint = new THREE.Mesh(jointGeometry, stemMaterial)
    joint.visible = false
    root.add(joint)
    return joint
  })
  const links = Array.from({ length: MAX_LENGTH }, () => {
    const link = new THREE.Mesh(linkGeometry, stemMaterial)
    link.visible = false
    root.add(link)
    return link
  })
  const tip = vineCritter('tip', 0.5, standInMesh(new THREE.ConeGeometry(0.06, 0.3, 8).rotateZ(-Math.PI / 2), '#93c24f', owned))
  root.add(tip)
  const leafStandIn = standInMesh(new THREE.CircleGeometry(0.5, 7).rotateX(-Math.PI / 2), '#5a9a49', owned)
  const leaves = Array.from({ length: MAX_LENGTH }, () => {
    const leaf = vineCritter('vine_leaf', LEAF_SIZE, leafStandIn)
    leaf.visible = false
    root.add(leaf)
    return leaf
  })
  const blossomStandIn = standInMesh(new THREE.SphereGeometry(0.5, 10, 7), '#f6b928', owned)
  const blossoms = Array.from({ length: 10 }, () => {
    const blossom = vineCritter('blossom', 0.16, blossomStandIn)
    blossom.visible = false
    root.add(blossom)
    return blossom
  })
  /**
   * Each peg leaves a blossom on the stem where the tip was. The stem slides a
   * joint toward its tail with every creep, so the blossom rides down it and
   * drops off the end.
   */
  const pegged: Array<{ joint: number; age: number }> = []

  // ---- the peg, a glow round its foot, and the last one being knocked in.
  const pegStandIn = standInMesh(new THREE.BoxGeometry(0.15, 1, 0.15), '#c99a62', owned)
  const peg = vineCritter('peg', PEG_SIZE, pegStandIn)
  root.add(peg)
  const sinking = vineCritter('peg', PEG_SIZE, pegStandIn)
  sinking.visible = false
  root.add(sinking)
  const glowMap = glowTexture('rgba(255,236,150,0.95)', 'rgba(255,220,120,0)')
  const glowMaterial = new THREE.MeshBasicMaterial({ map: glowMap, transparent: true, depthWrite: false })
  const glowGeometry = new THREE.PlaneGeometry(CELL * 1.8, CELL * 1.8)
  owned.push(glowMap, glowMaterial, glowGeometry)
  const glow = new THREE.Mesh(glowGeometry, glowMaterial)
  glow.rotation.x = -Math.PI / 2
  glow.renderOrder = 2
  root.add(glow)
  let pegPop = 1
  let sinkTime = 1

  // ---- input: arrows or WASD; a swipe; or a tap toward where the tip should go.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BED_TOP)
  const hit = new THREE.Vector3()
  let anchor: { x: number; y: number; startX: number; startY: number; swiped: boolean } | null = null
  /** Turn the way a swipe or an arrow points on screen, whichever way the camera faces. */
  function turnOnScreen(dx: number, dy: number): void {
    const head = bed.cells[0]
    bed.turn(screenHeading(stage, new THREE.Vector3(gridX(head.col), BED_TOP, gridZ(head.row)), dx, dy))
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const arrow = arrowVector(event.code)
    if (!arrow) return
    event.preventDefault()
    if (!finished) turnOnScreen(arrow.dx, arrow.dy)
  }
  window.addEventListener('keydown', onKeyDown)
  /** A tap turns the tip toward its side of the runner. */
  function tapTurn(clientX: number, clientY: number): void {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1)
    raycaster.setFromCamera(ndc, stage.camera)
    if (!raycaster.ray.intersectPlane(plane, hit)) return
    const head = bed.cells[0]
    const col = hit.x / CELL + (RUNNER_COLS - 1) / 2
    const row = (RUNNER_ROWS - 1) / 2 - hit.z / CELL
    const way = runnerTurnToward(bed.heading, col - head.col, row - head.row)
    if (way !== null) bed.turn(way)
  }

  // ---- the state of the round.
  let time = 0
  let finished = false
  let won = false
  let knot = 0
  const at = new THREE.Vector3()
  const points: THREE.Vector3[] = Array.from({ length: MAX_LENGTH }, () => new THREE.Vector3())
  const direction = new THREE.Vector3()

  function handle(events: RunnerEvent[]): void {
    for (const event of events) {
      if (event.kind === 'creep') {
        for (const pin of pegged) pin.joint += 1
      } else if (event.kind === 'peg') {
        sinking.position.copy(peg.position)
        sinking.visible = true
        sinkTime = 0
        pegPop = 0
        pegged.push({ joint: 0, age: 0 })
        at.set(gridX(event.col), BED_TOP + 0.2, gridZ(event.row))
        bursts.add(createBurst(at, { count: 14, colors: ['#ffd24a', '#fff3b0', '#93c24f'], size: 0.035, speed: [0.5, 1.4], lift: 0.8, gravity: 4, seconds: 0.6, onTop: true }), root)
        sfx.play('thunk')
        sfx.play('ding', 1 + bed.pegs * 0.03)
        const streak = round.hit()
        stage.bounce(0.35)
        context.popAt(at, streak >= 3 ? `PEGGED! x${streak}` : 'PEGGED!', 'good', streak >= 3)
        context.hitStop(0.04)
      } else if (event.kind === 'tangle') {
        knot = 1
        at.set(gridX(event.col), BED_TOP + 0.15, gridZ(event.row))
        bursts.add(createBurst(at, { count: 10, colors: ['#5a9a49', '#93c24f'], size: 0.05, speed: [0.4, 1.1], lift: 0.5, gravity: 3, seconds: 0.7, shape: 'leaf' }), root)
        round.harm()
        sfx.play('bonk')
        stage.shake(0.12)
        context.popAt(at, event.into === 'edge' ? 'BONK!' : 'TANGLED!', 'bad', true)
      } else if (event.kind === 'unknot' && event.reversed) {
        context.popAt(at.set(gridX(bed.cells[0].col), BED_TOP + 0.2, gridZ(bed.cells[0].row)), 'TURN ROUND!', 'plain')
      }
      if (round.snapshot.state !== 'playing') return
    }
  }

  /** Lay the runner's stem, tip, leaves and blossoms along where the rules have it, part way through its creep. */
  function layRunner(dt: number): void {
    const cells = bed.cells
    const from = bed.from
    const t = bed.progress
    const length = Math.min(MAX_LENGTH, cells.length)
    for (let index = 0; index < length; index += 1) {
      const a = from[index]
      const b = cells[index]
      points[index].set(gridX(a.col + (b.col - a.col) * t), BED_TOP + STEM_RADIUS * 0.8, gridZ(a.row + (b.row - a.row) * t))
    }
    // A wiggle in the stem while it is caught in a knot.
    if (knot > 0) points[0].x += Math.sin(time * 40) * 0.02 * knot
    joints.forEach((joint, index) => {
      joint.visible = index < length
      if (index < length) joint.position.copy(points[index])
    })
    links.forEach((link, index) => {
      const shown = index < length - 1 && points[index].distanceToSquared(points[index + 1]) > 1e-6
      link.visible = shown
      if (!shown) return
      link.position.copy(points[index]).add(points[index + 1]).multiplyScalar(0.5)
      link.lookAt(points[index + 1])
      link.scale.set(1, 1, points[index].distanceTo(points[index + 1]))
    })
    // The tip points along the stem's last link (or its heading when it has none).
    if (length > 1 && points[0].distanceToSquared(points[1]) > 1e-6) direction.subVectors(points[0], points[1]).normalize()
    else direction.set(bed.heading === RUNNER_E ? 1 : bed.heading === RUNNER_W ? -1 : 0, 0, bed.heading === RUNNER_N ? -1 : bed.heading === RUNNER_S ? 1 : 0)
    tip.position.copy(points[0]).setY(BED_TOP)
    tip.rotation.y = Math.atan2(-direction.z, direction.x)
    // Leaves on every other joint, to alternate sides, swaying.
    leaves.forEach((leaf, index) => {
      const joint = index * 2 + 2
      const shown = joint < length
      leaf.visible = shown
      if (!shown) return
      const ahead = points[joint - 1]
      const along = Math.atan2(-(ahead.z - points[joint].z), ahead.x - points[joint].x)
      leaf.position.copy(points[joint]).setY(BED_TOP + 0.01)
      leaf.rotation.y = along + (index % 2 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(time * 2 + index) * 0.12
    })
    // Blossoms that rode off the tail are gone.
    while (pegged.length > 0 && pegged[0].joint >= length) pegged.shift()
    blossoms.forEach((blossom, index) => {
      const pin = pegged[index]
      blossom.visible = Boolean(pin)
      if (!pin) return
      pin.age += dt
      blossom.position.copy(points[pin.joint]).setY(BED_TOP + 0.03)
      blossom.scale.setScalar(Math.max(0.001, backOut(Math.min(1, pin.age * 3))))
    })
  }

  function layPeg(dt: number): void {
    const spot = bed.peg
    peg.visible = Boolean(spot) && !finished
    glow.visible = peg.visible
    if (spot) {
      pegPop = Math.min(1, pegPop + dt * 5)
      const bob = Math.sin(time * 4) * 0.015
      peg.position.set(gridX(spot.col), BED_TOP + bob, gridZ(spot.row))
      peg.scale.setScalar(Math.max(0.001, backOut(pegPop)))
      glow.position.set(peg.position.x, BED_TOP + 0.006, peg.position.z)
      glow.scale.setScalar(1 + Math.sin(time * 5) * 0.12)
    }
    // The last peg is knocked into the soil.
    if (sinkTime < 1) {
      sinkTime = Math.min(1, sinkTime + dt * 3.5)
      sinking.position.y = BED_TOP - sinkTime * PEG_SIZE * 0.7
      sinking.visible = sinkTime < 1
    }
  }

  function debugState(): unknown {
    const head = bed.cells[0]
    const screen = (col: number, row: number): { x: number; y: number } => {
      const point = stage.toScreen(new THREE.Vector3(gridX(col), BED_TOP, gridZ(row)))
      return { x: Math.round(point.x), y: Math.round(point.y) }
    }
    return {
      cells: bed.cells,
      heading: bed.heading,
      peg: bed.peg,
      pegs: bed.pegs,
      bonk: bed.bonk,
      headScreen: screen(head.col, head.row),
      pegScreen: bed.peg ? screen(bed.peg.col, bed.peg.row) : null,
      /** Screen points of three cells, so a script can map any cell to the screen. */
      gridScreen: { origin: screen(0, 0), col1: screen(1, 0), row1: screen(0, 1) },
      finished,
    }
  }

  return {
    outroSeconds: 1.1,
    update(dt): void {
      time += dt
      if (!finished && dt > 0) {
        handle(bed.step(dt))
        if (round.snapshot.state !== 'playing') return
      }
      knot = Math.max(0, knot - dt * 1.6)
      layRunner(dt)
      layPeg(dt)
    },
    pointerDown(x, y): void {
      anchor = { x, y, startX: x, startY: y, swiped: false }
    },
    pointerMove(x, y): void {
      if (!anchor || finished) return
      const dx = x - anchor.x
      const dy = y - anchor.y
      if (Math.hypot(dx, dy) < SWIPE_PIXELS) return
      turnOnScreen(dx, dy)
      anchor = { ...anchor, x, y, swiped: true }
    },
    pointerUp(): void {
      if (anchor && !anchor.swiped && !finished) tapTurn(anchor.startX, anchor.startY)
      anchor = null
    },
    finish(didWin): void {
      finished = true
      won = didWin
      if (won) {
        stage.bounce(1)
        const top = plantAt.clone().setY(PLANT_SIZE * 0.6)
        bursts.add(createBurst(top, { count: 26, colors: ['#fff3b0', '#ffd24a', '#bff27a'], size: 0.05, speed: [0.8, 2], lift: 0.8, gravity: 2.5, seconds: 1, shape: 'star', onTop: true }), root)
        sfx.play('bonus')
      }
    },
    debug: debugState,
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      returnPlant()
      stage.setFraming(null)
      root.removeFromParent()
    },
  }
}
