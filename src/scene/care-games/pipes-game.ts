import * as THREE from 'three'
import {
  PIPES_COLS, PIPES_ROWS, PIPE_N, PIPE_S,
  createPipesRun, type PipeFill, type PipeKind, type PipeSide, type PipesEvent,
} from '../../game/care-pipes'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'
import { standInMesh } from './root-cast'
import { arrowVector, backOut, borrowPlant, boxFraming, orientedFraming, screenHeading, vineCritter } from './vine-cast'

/**
 * SPIN! The pipe spin: a little board of wooden irrigation troughs between a
 * hand pump and the thirsty vine, every one turned the wrong way. Tap a trough
 * to spin it a quarter turn. The pump starts after a few seconds and the water
 * runs trough by trough; get the way to the vine joined up ahead of it. A ring
 * marks the trough the water reaches next: blue if it will take the water, red
 * if it won't. Three boards, a drink each.
 *
 * The board lies on the ground: column c runs along +x, row r runs away from
 * the camera (-z), so the rules' N is -z and E is +x. The troughs are authored
 * at exactly one tile. The rules live in `src/game/care-pipes.ts`.
 */

const CELL = 0.5
/** The top of the board's soil, where the troughs stand. */
const BED_TOP = 0.1
/** The water's surface above a trough's floor, and how wide it runs. */
const WATER_Y = 0.046
const WATER_WIDTH = 0.11
/** How high the cross's bridge arches over the other trough. */
const BRIDGE_RISE = 0.085
const WATER_STEPS = 12
/** The vine's longest side, beside the board. */
const PLANT_SIZE = 1.05
const BOARD_HALF_X = (PIPES_COLS / 2) * CELL
const BOARD_HALF_Z = (PIPES_ROWS / 2) * CELL
/** The pump stands off the board's left edge; the vine off its right. */
const PUMP_X = -BOARD_HALF_X - 0.205
const PLANT_X = BOARD_HALF_X + 0.66
const SPIN_SECONDS = 0.13

const SIDE_VECTORS: Readonly<Record<PipeSide, THREE.Vector3>> = {
  0: new THREE.Vector3(0, 0, -1),
  1: new THREE.Vector3(1, 0, 0),
  2: new THREE.Vector3(0, 0, 1),
  3: new THREE.Vector3(-1, 0, 0),
}

const rowZ = (row: number): number => ((PIPES_ROWS - 1) / 2 - row) * CELL
const colX = (col: number): number => (col - (PIPES_COLS - 1) / 2) * CELL
const cellCentre = (col: number, row: number, target = new THREE.Vector3()): THREE.Vector3 => target.set(colX(col), BED_TOP, rowZ(row))

interface PieceView {
  readonly group: THREE.Group
  readonly model: THREE.Group
  readonly kind: PipeKind
  /** The angle drawn, easing toward the trough's turn. */
  angle: number
  hop: number
  pop: number
}

interface WaterView {
  readonly key: string
  readonly mesh: THREE.Mesh
  readonly points: readonly THREE.Vector3[]
}

/** The water's path through one trough, edge to edge, in world space. */
function waterPath(fill: PipeFill, kind: PipeKind): THREE.Vector3[] {
  const centre = cellCentre(fill.col, fill.row)
  const from = centre.clone().addScaledVector(SIDE_VECTORS[fill.entry], CELL / 2)
  const to = centre.clone().addScaledVector(SIDE_VECTORS[fill.exit], CELL / 2)
  const points: THREE.Vector3[] = []
  const straight = fill.exit === ((fill.entry + 2) % 4)
  // Over the cross's bridge (its N-S trough), the water arches up.
  const arches = kind === 'cross' && (fill.entry === PIPE_N || fill.entry === PIPE_S)
  if (straight) {
    for (let index = 0; index <= WATER_STEPS; index += 1) {
      const t = index / WATER_STEPS
      const point = from.clone().lerp(to, t)
      point.y = BED_TOP + WATER_Y + (arches ? BRIDGE_RISE * Math.sin(Math.PI * t) ** 0.7 : 0)
      points.push(point)
    }
    return points
  }
  // Round an elbow's bend: a quarter circle about the corner its two open ends share.
  const corner = centre.clone().addScaledVector(SIDE_VECTORS[fill.entry], CELL / 2).addScaledVector(SIDE_VECTORS[fill.exit], CELL / 2)
  const start = Math.atan2(from.z - corner.z, from.x - corner.x)
  let end = Math.atan2(to.z - corner.z, to.x - corner.x)
  if (end - start > Math.PI) end -= Math.PI * 2
  if (start - end > Math.PI) end += Math.PI * 2
  for (let index = 0; index <= WATER_STEPS; index += 1) {
    const angle = start + (end - start) * (index / WATER_STEPS)
    points.push(new THREE.Vector3(corner.x + Math.cos(angle) * CELL / 2, BED_TOP + WATER_Y, corner.z + Math.sin(angle) * CELL / 2))
  }
  return points
}

/** A flat ribbon along `points`, built in order so a draw range shows it filling from the start. */
function ribbonGeometry(points: readonly THREE.Vector3[], width: number): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const along = new THREE.Vector3()
  const side = new THREE.Vector3()
  points.forEach((point, index) => {
    along.subVectors(points[Math.min(points.length - 1, index + 1)], points[Math.max(0, index - 1)]).setY(0).normalize()
    side.set(-along.z, 0, along.x).multiplyScalar(width / 2)
    positions.push(point.x + side.x, point.y, point.z + side.z, point.x - side.x, point.y, point.z - side.z)
    if (index > 0) {
      const a = (index - 1) * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createPipesGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const owned = context.owned
  const root = new THREE.Group()
  root.name = 'Pipes game'
  stage.scene.add(root)
  const game = createPipesRun()

  // ---- the framing: the pump, the board and the vine all in view below the HUD. A wide window sees
  // the board from the front, pump to the left; a tall one looks along it from the pump's end, so the
  // water climbs the screen to the vine at the top.
  const playfield = new THREE.Box3(new THREE.Vector3(PUMP_X - 0.25, 0, -BOARD_HALF_Z - 0.12), new THREE.Vector3(PLANT_X + PLANT_SIZE * 0.5, PLANT_SIZE * 0.75, BOARD_HALF_Z + 0.14))
  stage.setFraming(orientedFraming(
    boxFraming(playfield, new THREE.Vector3(0, 1.35, 1), 38),
    boxFraming(playfield, new THREE.Vector3(-1, 1.5, 0), 40),
  ))

  // ---- the board: a raised bed of soil in a wooden frame, a tile per trough.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const soil = new THREE.MeshLambertMaterial({ color: '#6b4630' })
  const tileLight = new THREE.MeshLambertMaterial({ color: '#8a5f3f' })
  const tileDark = new THREE.MeshLambertMaterial({ color: '#7a5236' })
  const frame = new THREE.MeshLambertMaterial({ color: '#b5814b' })
  const frameCap = new THREE.MeshLambertMaterial({ color: '#8b5a34' })
  owned.push(boxGeometry, soil, tileLight, tileDark, frame, frameCap)
  const bedMinX = PUMP_X - 0.2
  const bedMaxX = BOARD_HALF_X + 0.14
  const bed = new THREE.Mesh(boxGeometry, soil)
  bed.scale.set(bedMaxX - bedMinX, BED_TOP, BOARD_HALF_Z * 2 + 0.2)
  bed.position.set((bedMinX + bedMaxX) / 2, BED_TOP / 2, 0)
  bed.name = 'Pipes bed'
  root.add(bed)
  for (const [x, z, width, depth] of [
    [(bedMinX + bedMaxX) / 2, -BOARD_HALF_Z - 0.13, bedMaxX - bedMinX + 0.12, 0.06],
    [(bedMinX + bedMaxX) / 2, BOARD_HALF_Z + 0.13, bedMaxX - bedMinX + 0.12, 0.06],
    [bedMinX - 0.03, 0, 0.06, BOARD_HALF_Z * 2 + 0.2],
    [bedMaxX + 0.03, 0, 0.06, BOARD_HALF_Z * 2 + 0.2],
  ] as const) {
    const board = new THREE.Mesh(boxGeometry, frame)
    board.scale.set(width, BED_TOP + 0.05, depth)
    board.position.set(x, (BED_TOP + 0.05) / 2, z)
    root.add(board)
    const cap = new THREE.Mesh(boxGeometry, frameCap)
    cap.scale.set(width + 0.015, 0.02, depth + 0.015)
    cap.position.set(x, BED_TOP + 0.06, z)
    root.add(cap)
  }
  for (let row = 0; row < PIPES_ROWS; row += 1) {
    for (let col = 0; col < PIPES_COLS; col += 1) {
      const tile = new THREE.Mesh(boxGeometry, (row + col) % 2 ? tileDark : tileLight)
      tile.scale.set(CELL - 0.035, 0.012, CELL - 0.035)
      cellCentre(col, row, tile.position)
      tile.position.y = BED_TOP + 0.002
      root.add(tile)
    }
  }

  // ---- the pump, the vine, and the outlet trough that carries the water to it.
  const pump = vineCritter('pump', null, standInMesh(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 10), '#3f8f7a', owned))
  pump.position.set(PUMP_X, BED_TOP - 0.01, rowZ(game.sourceRow))
  root.add(pump)
  const lever = pump.getObjectByName('handle') ?? null
  const plantHolder = new THREE.Group()
  plantHolder.name = 'Pipes vine'
  plantHolder.position.set(PLANT_X, 0, rowZ(game.targetRow))
  root.add(plantHolder)
  const returnPlant = borrowPlant(stage, plantHolder, PLANT_SIZE)
  const troughStandIn = standInMesh(new THREE.BoxGeometry(CELL, 0.06, 0.16), '#b9824a', owned)
  const outlet = vineCritter('trough', null, troughStandIn)
  outlet.scale.x = (PLANT_X - 0.22 - BOARD_HALF_X) / CELL
  outlet.position.set(BOARD_HALF_X + (PLANT_X - 0.22 - BOARD_HALF_X) / 2, BED_TOP - 0.02, rowZ(game.targetRow))
  root.add(outlet)

  // ---- the water: one ribbon per trough it fills, a stream from the spout, and a foamy front.
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#58b8e8', roughness: 0.15, metalness: 0, emissive: '#1d5f80', emissiveIntensity: 0.35 })
  const foamMaterial = new THREE.MeshStandardMaterial({ color: '#e8f7ff', roughness: 0.3, emissive: '#7fbfe0', emissiveIntensity: 0.3 })
  const puddleMaterial = new THREE.MeshBasicMaterial({ color: '#4aa6d6', transparent: true, opacity: 0.55, depthWrite: false })
  const streamGeometry = new THREE.CylinderGeometry(0.014, 0.018, 1, 8)
  const foamGeometry = new THREE.SphereGeometry(0.03, 10, 7)
  const puddleGeometry = new THREE.CircleGeometry(0.2, 20)
  owned.push(waterMaterial, foamMaterial, puddleMaterial, streamGeometry, foamGeometry, puddleGeometry)
  const stream = new THREE.Mesh(streamGeometry, waterMaterial)
  stream.name = 'Pipes spout stream'
  stream.visible = false
  root.add(stream)
  const foam = new THREE.Mesh(foamGeometry, foamMaterial)
  foam.name = 'Pipes water front'
  foam.visible = false
  root.add(foam)
  const outletWaterGeometry = ribbonGeometry([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)], WATER_WIDTH)
  owned.push(outletWaterGeometry)
  const outletWater = new THREE.Mesh(outletWaterGeometry, waterMaterial)
  outletWater.name = 'Pipes outlet water'
  outletWater.visible = false
  root.add(outletWater)
  const puddles: Array<{ mesh: THREE.Mesh; age: number }> = []
  let water: WaterView[] = []

  // ---- the cues: a square on the trough the water reaches next, and a fainter one on the one you point at.
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, depthWrite: false, opacity: 0.9 })
  const ringGeometry = new THREE.RingGeometry(CELL * 0.6, CELL * 0.7, 4, 1, Math.PI / 4)
  const cursorMaterial = new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.45, depthWrite: false })
  const cursorGeometry = new THREE.RingGeometry(CELL * 0.6, CELL * 0.66, 4, 1, Math.PI / 4)
  owned.push(ringMaterial, ringGeometry, cursorMaterial, cursorGeometry)
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  ring.rotation.x = -Math.PI / 2
  ring.renderOrder = 3
  ring.visible = false
  root.add(ring)
  const cursor = new THREE.Mesh(cursorGeometry, cursorMaterial)
  cursor.rotation.x = -Math.PI / 2
  cursor.renderOrder = 3
  cursor.visible = false
  root.add(cursor)

  // ---- the troughs.
  const rockStandIn = standInMesh(new THREE.DodecahedronGeometry(0.16, 0), '#a59c91', owned)
  const pieceModel = (kind: PipeKind): THREE.Group => (
    kind === 'straight' ? vineCritter('trough', null, troughStandIn)
      : kind === 'elbow' ? vineCritter('elbow', null, troughStandIn)
        : kind === 'cross' ? vineCritter('cross', null, troughStandIn)
          : vineCritter('rock', null, rockStandIn)
  )
  let pieces: PieceView[] = []
  function layBoard(popIn: boolean): void {
    for (const piece of pieces) piece.group.removeFromParent()
    pieces = game.cells.map((cell) => {
      const group = new THREE.Group()
      group.name = `Pipes ${cell.kind} ${cell.col},${cell.row}`
      cellCentre(cell.col, cell.row, group.position)
      const model = pieceModel(cell.kind)
      group.add(model)
      root.add(group)
      const angle = -cell.turn * Math.PI / 2
      model.rotation.y = angle
      return { group, model, kind: cell.kind, angle, hop: 0, pop: popIn ? -((cell.col + cell.row) * 0.04) : 1 }
    })
  }
  layBoard(false)
  const pieceAt = (col: number, row: number): PieceView | undefined => pieces[row * PIPES_COLS + col]

  // ---- input: tap a trough to spin it; the arrows move a cursor, Space or Enter spins.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BED_TOP + 0.04))
  const hit = new THREE.Vector3()
  const hovers = window.matchMedia('(hover: hover)').matches
  let cursorCell: { col: number; row: number } | null = null
  let cursorShown = false
  function pointerCell(clientX: number, clientY: number): { col: number; row: number } | null {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1)
    raycaster.setFromCamera(ndc, stage.camera)
    if (!raycaster.ray.intersectPlane(ground, hit)) return null
    const col = Math.floor(hit.x / CELL + PIPES_COLS / 2)
    const row = Math.floor((PIPES_ROWS / 2) - hit.z / CELL)
    return col >= 0 && col < PIPES_COLS && row >= 0 && row < PIPES_ROWS ? { col, row } : null
  }
  function spin(col: number, row: number): void {
    if (finished) return
    handle(game.spin(col, row))
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const arrow = arrowVector(event.code)
    if (arrow) {
      event.preventDefault()
      const from = cursorCell ?? (game.next && game.next.col >= 0 && game.next.col < PIPES_COLS ? { col: game.next.col, row: game.next.row } : { col: 0, row: game.sourceRow })
      // An arrow moves the cursor the way it points on screen, whichever way the camera faces.
      const way = screenHeading(stage, cellCentre(from.col, from.row), arrow.dx, arrow.dy)
      const step = way === PIPE_N ? [0, 1] : way === PIPE_S ? [0, -1] : way === 1 ? [1, 0] : [-1, 0]
      cursorCell = cursorShown ? {
        col: THREE.MathUtils.clamp(from.col + step[0], 0, PIPES_COLS - 1),
        row: THREE.MathUtils.clamp(from.row + step[1], 0, PIPES_ROWS - 1),
      } : from
      cursorShown = true
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (cursorCell) spin(cursorCell.col, cursorCell.row)
    }
  }
  window.addEventListener('keydown', onKeyDown)

  // ---- the state of the round.
  let time = 0
  let finished = false
  let won = false
  let lastCount = Math.ceil(game.countdown)
  let pumpRow = rowZ(game.sourceRow)
  let plantRow = rowZ(game.targetRow)
  let outletPour = 0
  const at = new THREE.Vector3()

  function waterKey(fill: PipeFill): string {
    return `${fill.col},${fill.row},${fill.entry}`
  }

  /** Draw the water the rules hold: a ribbon per trough, filled as far as the water has run. */
  function syncWater(): void {
    const fills = game.fills
    let keep = 0
    while (keep < water.length && keep < fills.length && water[keep].key === waterKey(fills[keep])) keep += 1
    for (const view of water.splice(keep)) {
      view.mesh.removeFromParent()
      view.mesh.geometry.dispose()
    }
    for (let index = keep; index < fills.length; index += 1) {
      const fill = fills[index]
      const points = waterPath(fill, game.cell(fill.col, fill.row)?.kind ?? 'straight')
      const mesh = new THREE.Mesh(ribbonGeometry(points, WATER_WIDTH), waterMaterial)
      mesh.name = `Pipes water ${fill.col},${fill.row}`
      mesh.renderOrder = 1
      root.add(mesh)
      water.push({ key: waterKey(fill), mesh, points })
    }
    fills.forEach((fill, index) => {
      const view = water[index]
      const shown = Math.round(fill.amount * WATER_STEPS)
      view.mesh.geometry.setDrawRange(0, shown * 6)
      view.mesh.visible = shown > 0
    })
    // The water's leading edge foams.
    const last = fills[fills.length - 1]
    const flowing = game.phase === 'flowing' && last && last.amount < 1
    foam.visible = Boolean(flowing)
    if (last && flowing) {
      const points = water[water.length - 1].points
      const t = last.amount * WATER_STEPS
      const index = Math.min(WATER_STEPS - 1, Math.floor(t))
      foam.position.copy(points[index]).lerp(points[index + 1], t - index)
      foam.scale.setScalar(0.9 + Math.sin(time * 18) * 0.15)
    }
  }

  function handle(events: PipesEvent[]): void {
    for (const event of events) {
      if (event.kind === 'spin') {
        const piece = pieceAt(event.col, event.row)
        if (piece) piece.hop = 1
        sfx.play('creak', 0.9 + Math.random() * 0.2)
      } else if (event.kind === 'flow') {
        sfx.play('gurgle', 0.8)
        context.popAt(at.set(PUMP_X, BED_TOP + 0.5, pumpRow), 'GO!', 'good', true)
      } else if (event.kind === 'enter') {
        sfx.play('gurgle', 0.9 + Math.min(0.6, game.fills.length * 0.05))
      } else if (event.kind === 'rush') {
        if (game.phase === 'flowing') {
          sfx.play('gurgle', 1.6)
          const front = game.fills[game.fills.length - 1]
          if (front) context.popAt(cellCentre(front.col, front.row, at).setY(BED_TOP + 0.25), 'WHOOSH!', 'good')
        }
      } else if (event.kind === 'leak') {
        leak(event.col, event.row, event.side)
      } else if (event.kind === 'drink') {
        drink()
      } else if (event.kind === 'board') {
        layBoard(true)
        water.forEach((view) => {
          view.mesh.removeFromParent()
          view.mesh.geometry.dispose()
        })
        water = []
        lastCount = Math.ceil(game.countdown)
        sfx.play('pop')
      }
      if (round.snapshot.state !== 'playing' && !finished) return
    }
  }

  function leak(col: number, row: number, side: PipeSide): void {
    // The spill is at the edge the water couldn't cross.
    if (col < 0) at.set(-BOARD_HALF_X, BED_TOP + WATER_Y, rowZ(row))
    else cellCentre(col, row, at).addScaledVector(SIDE_VECTORS[side], CELL / 2).setY(BED_TOP + WATER_Y)
    bursts.add(createBurst(at, { count: 22, colors: ['#5ab4e0', '#9fd8f5', '#e8f7ff'], size: 0.03, speed: [0.8, 2.1], lift: 1.4, gravity: 6, seconds: 0.7 }), root)
    const puddle = new THREE.Mesh(puddleGeometry, puddleMaterial)
    puddle.rotation.x = -Math.PI / 2
    puddle.position.set(at.x, BED_TOP + 0.006, at.z)
    puddle.renderOrder = 2
    root.add(puddle)
    puddles.push({ mesh: puddle, age: 0 })
    round.harm()
    sfx.play('spurt')
    stage.shake(0.12)
    context.popAt(at.clone().setY(BED_TOP + 0.3), 'LEAK!', 'bad', true)
  }

  function drink(): void {
    outletPour = 1
    at.set(PLANT_X - 0.15, BED_TOP + 0.05, plantRow)
    bursts.add(createBurst(at, { count: 24, colors: ['#5ab4e0', '#9fd8f5', '#e8f7ff'], size: 0.035, speed: [0.6, 1.6], lift: 1.2, gravity: 5, seconds: 0.8, cone: 0.9 }), root)
    const drinks = round.hit()
    stage.bounce(0.8)
    stage.sparkle()
    sfx.play('pour')
    context.popAt(at.set(PLANT_X, PLANT_SIZE * 0.85, plantRow), drinks >= 2 ? `GLUG x${drinks}!` : 'GLUG!', 'good', true)
  }

  function updateCues(): void {
    const next = game.next
    const onBoard = next && next.col >= 0 && next.col < PIPES_COLS && next.row >= 0 && next.row < PIPES_ROWS
    const live = !finished && (game.phase === 'flowing' || game.phase === 'leaking' || (game.phase === 'waiting' && game.countdown < 3))
    ring.visible = Boolean(onBoard && live)
    if (next && onBoard) {
      cellCentre(next.col, next.row, ring.position)
      ring.position.y = BED_TOP + 0.09
      const open = game.nextOpen
      ringMaterial.color.set(open ? '#7fd0ff' : '#ff5a3a')
      const pulse = open ? 1 : 1 + Math.sin(time * 14) * 0.06
      ring.scale.setScalar(pulse)
      ringMaterial.opacity = open ? 0.75 : 0.95
    }
    cursor.visible = cursorShown && cursorCell !== null && !finished
    if (cursorCell) {
      cellCentre(cursorCell.col, cursorCell.row, cursor.position)
      cursor.position.y = BED_TOP + 0.1
    }
  }

  function debugState(): unknown {
    const cellScreen = game.cells.map((cell) => {
      const screen = stage.toScreen(cellCentre(cell.col, cell.row, new THREE.Vector3()))
      return { col: cell.col, row: cell.row, x: Math.round(screen.x), y: Math.round(screen.y) }
    })
    return {
      phase: game.phase,
      board: game.board,
      countdown: game.countdown,
      rushing: game.rushing,
      sourceRow: game.sourceRow,
      targetRow: game.targetRow,
      next: game.next,
      nextOpen: game.nextOpen,
      fills: game.fills.length,
      cells: game.cells,
      solution: game.solution,
      cellScreen,
      finished,
    }
  }

  return {
    outroSeconds: 1.2,
    warm: [new THREE.Mesh(ribbonGeometry([new THREE.Vector3(), new THREE.Vector3(0.1, 0, 0)], WATER_WIDTH), waterMaterial), new THREE.Mesh(puddleGeometry, puddleMaterial)],
    update(dt): void {
      time += dt
      if (!finished && dt > 0) {
        handle(game.step(dt))
        if (round.snapshot.state !== 'playing') return
        // Count the pump in: 3, 2, 1.
        if (game.phase === 'waiting') {
          const count = Math.ceil(game.countdown)
          if (count < lastCount && count >= 1 && count <= 3) {
            context.popAt(at.set(PUMP_X, BED_TOP + 0.55, pumpRow), String(count), 'plain', true)
            sfx.play('tap', 0.8 + (3 - count) * 0.1)
          }
          lastCount = count
        }
      }
      syncWater()
      updateCues()
      // The troughs ease round to their turns with a little hop, and pop in on a new board.
      for (const [index, piece] of pieces.entries()) {
        const cell = game.cells[index]
        const target = -cell.turn * Math.PI / 2
        // Always turn clockwise from what is drawn.
        while (target > piece.angle + 1e-3) piece.angle += Math.PI * 2
        piece.angle = Math.max(target, piece.angle - dt * (Math.PI / 2) / SPIN_SECONDS)
        piece.model.rotation.y = piece.angle
        piece.hop = Math.max(0, piece.hop - dt * 7)
        piece.group.position.y = BED_TOP + Math.sin(piece.hop * Math.PI) * 0.05
        if (piece.pop < 1) {
          piece.pop = Math.min(1, piece.pop + dt * 3.5)
          piece.group.scale.setScalar(Math.max(0.001, backOut(Math.max(0, piece.pop))))
        } else {
          piece.group.scale.setScalar(1)
        }
      }
      // The pump and the vine slide to their rows on a new board.
      pumpRow += (rowZ(game.sourceRow) - pumpRow) * Math.min(1, dt * 8)
      plantRow += (rowZ(game.targetRow) - plantRow) * Math.min(1, dt * 8)
      pump.position.z = pumpRow
      plantHolder.position.z = plantRow
      outlet.position.z = plantRow
      // The pump works while the water runs; a drop hangs from the spout while it waits.
      const pumping = game.phase === 'flowing' && !finished
      if (lever) lever.rotation.z = pumping ? Math.sin(time * (game.rushing ? 22 : 9)) * 0.35 : Math.sin(time * 2) * 0.03
      stream.visible = pumping && game.fills.length > 0
      // From the spout's mouth down to the water in the first trough.
      stream.position.set(-BOARD_HALF_X + 0.01, BED_TOP + 0.098, pumpRow)
      stream.scale.set(1, 0.104, 1)
      // The outlet runs while the vine drinks.
      outletPour = Math.max(0, outletPour - dt * 0.8)
      outletWater.visible = outletPour > 0
      outletWater.scale.set(PLANT_X - 0.22 - BOARD_HALF_X, 1, 1)
      outletWater.position.set(BOARD_HALF_X, BED_TOP - 0.02 + WATER_Y, plantRow)
      for (const puddle of [...puddles]) {
        puddle.age += dt
        puddle.mesh.scale.setScalar(Math.min(1, puddle.age * 5) * (1 + puddle.age * 0.2))
        if (puddle.age > 2.4) {
          puddle.mesh.removeFromParent()
          puddles.splice(puddles.indexOf(puddle), 1)
        } else if (puddle.age > 1.6) {
          puddle.mesh.scale.multiplyScalar(Math.max(0.01, (2.4 - puddle.age) / 0.8))
        }
      }
    },
    pointerDown(x, y): void {
      const cell = pointerCell(x, y)
      cursorShown = false
      if (cell) spin(cell.col, cell.row)
    },
    pointerMove(x, y): void {
      const cell = pointerCell(x, y)
      // A pointer that hovers (a mouse) shows which trough a click spins.
      if (cell && hovers) {
        cursorCell = cell
        cursorShown = true
      }
    },
    pointerUp(): void {},
    finish(didWin): void {
      finished = true
      won = didWin
      ring.visible = false
      cursor.visible = false
      if (won) {
        stage.bounce(1)
        const top = new THREE.Vector3(PLANT_X, PLANT_SIZE * 0.7, plantRow)
        bursts.add(createBurst(top, { count: 26, colors: ['#fff3b0', '#ffd24a', '#9fd8f5'], size: 0.05, speed: [0.8, 2], lift: 0.8, gravity: 2.5, seconds: 1, shape: 'star', onTop: true }), root)
        sfx.play('bonus')
      }
    },
    debug: debugState,
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      for (const view of water) view.mesh.geometry.dispose()
      returnPlant()
      stage.setFraming(null)
      root.removeFromParent()
    },
  }
}
