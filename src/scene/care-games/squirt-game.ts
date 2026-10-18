import * as THREE from 'three'
import {
  SQUIRT_COLS, SQUIRT_LEAF_HITS, SQUIRT_ROWS,
  createSquirtField, type SquirtBlock, type SquirtEvent,
} from '../../game/care-squirt'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'
import { standInMesh } from './root-cast'
import { borrowPlant, boxFraming, vineCritter } from './vine-cast'

/**
 * SQUIRT! The caterpillar squirt: a vine's trellis seen straight on, its wires
 * strung from the vine at its foot up to a top beam. A long caterpillar crawls
 * along the wires, turning and dropping a wire whenever it meets a leaf, a blob
 * of suds or the trellis's side. The spray bottle slides along the shelf at the
 * bottom (it follows the pointer, or the arrow keys) and squirts straight up by
 * itself. A squirted bit floats off in a soap bubble and leaves suds behind; the
 * bits behind it carry on as a caterpillar of their own. One that crawls off the
 * bottom wire drops onto the vine: a heart.
 *
 * The trellis's grid stands in the plane z = 0: column c along +x, row r up +y.
 * The rules live in `src/game/care-squirt.ts`.
 */

const CELL = 0.2
/** The bottom wire's height; the shelf and the vine stand below it. */
const BASE_Y = 0.62
const SHELF_Y = 0.12
const HALF_WIDTH = (SQUIRT_COLS / 2) * CELL
const TOP_Y = BASE_Y + (SQUIRT_ROWS - 0.5) * CELL
const BIT_SIZE = 0.25
const PLANT_SIZE = 0.95
const SPRAYER_SIZE = 0.44
const BUBBLE_SECONDS = 1.3

const fieldX = (col: number): number => (col - (SQUIRT_COLS - 1) / 2) * CELL
const fieldY = (row: number): number => BASE_Y + row * CELL

interface BitView {
  readonly group: THREE.Group
  readonly model: THREE.Group
}

interface BlockView {
  readonly block: SquirtBlock
  readonly group: THREE.Group
  wobble: number
  /** 0..1 as it appears; counts down from 1 as it goes. */
  grow: number
  leaving: boolean
}

interface BubbleView {
  readonly group: THREE.Group
  readonly from: THREE.Vector3
  age: number
  drift: number
}

export function createSquirtGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const owned = context.owned
  const root = new THREE.Group()
  root.name = 'Squirt game'
  stage.scene.add(root)
  const field = createSquirtField()

  // ---- the framing: straight on, a little above, the whole trellis below the HUD.
  stage.setFraming(boxFraming(
    new THREE.Box3(new THREE.Vector3(-HALF_WIDTH - 0.14, 0, -0.3), new THREE.Vector3(HALF_WIDTH + 0.14, TOP_Y + 0.22, 0.25)),
    new THREE.Vector3(0, 0.18, 1), 40,
  ))

  // ---- the trellis: two posts, a top beam, a twine wire per row, and the shelf the bottle runs along.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const wireGeometry = new THREE.CylinderGeometry(0.007, 0.007, 1, 5)
  const wood = new THREE.MeshLambertMaterial({ color: '#b5814b' })
  const woodDark = new THREE.MeshLambertMaterial({ color: '#8b5a34' })
  const twine = new THREE.MeshLambertMaterial({ color: '#e2c48a' })
  owned.push(boxGeometry, wireGeometry, wood, woodDark, twine)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(boxGeometry, wood)
    post.scale.set(0.08, TOP_Y + 0.2, 0.08)
    post.position.set(side * (HALF_WIDTH + 0.06), (TOP_Y + 0.2) / 2, 0)
    post.name = 'Squirt trellis post'
    root.add(post)
  }
  const beam = new THREE.Mesh(boxGeometry, woodDark)
  beam.scale.set(HALF_WIDTH * 2 + 0.26, 0.08, 0.1)
  beam.position.set(0, TOP_Y + 0.2, 0)
  root.add(beam)
  for (let row = 0; row < SQUIRT_ROWS; row += 1) {
    const wire = new THREE.Mesh(wireGeometry, twine)
    wire.rotation.z = Math.PI / 2
    wire.scale.y = HALF_WIDTH * 2 + 0.08
    wire.position.set(0, fieldY(row) - CELL * 0.32, -0.02)
    root.add(wire)
  }
  const shelf = new THREE.Mesh(boxGeometry, wood)
  shelf.scale.set(HALF_WIDTH * 2 + 0.2, 0.04, 0.24)
  shelf.position.set(0, SHELF_Y - 0.02, 0.1)
  root.add(shelf)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(boxGeometry, woodDark)
    leg.scale.set(0.05, SHELF_Y, 0.05)
    leg.position.set(side * HALF_WIDTH, SHELF_Y / 2 - 0.02, 0.18)
    root.add(leg)
  }

  // ---- the vine at the trellis's foot, behind the shelf.
  const plantHolder = new THREE.Group()
  plantHolder.name = 'Squirt vine'
  plantHolder.position.set(0, 0, -0.32)
  root.add(plantHolder)
  const returnPlant = borrowPlant(stage, plantHolder, PLANT_SIZE)

  // ---- the spray bottle and its squirt.
  const sprayer = vineCritter('sprayer', SPRAYER_SIZE, standInMesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 10), '#4fb3bf', owned))
  sprayer.position.set(0, SHELF_Y, 0.1)
  root.add(sprayer)
  const dropGeometry = new THREE.SphereGeometry(0.03, 10, 7)
  const dropMaterial = new THREE.MeshStandardMaterial({ color: '#8fd3f5', roughness: 0.1, emissive: '#3b8fc0', emissiveIntensity: 0.4 })
  owned.push(dropGeometry, dropMaterial)
  const drops = Array.from({ length: 3 }, (_, index) => {
    const drop = new THREE.Mesh(dropGeometry, dropMaterial)
    drop.scale.set(1 - index * 0.25, 2.2 - index * 0.5, 1 - index * 0.25)
    drop.name = 'Squirt drop'
    drop.visible = false
    root.add(drop)
    return drop
  })

  // ---- the caterpillar's bits, from a pool: a head per caterpillar, bodies behind.
  const headStandIn = standInMesh(new THREE.SphereGeometry(0.5, 12, 8), '#6cb83e', owned)
  const bodyStandIn = standInMesh(new THREE.SphereGeometry(0.5, 12, 8), '#9ad04a', owned)
  const makeBit = (name: 'caterpillar_head' | 'caterpillar_body', standIn: () => THREE.Object3D): BitView => {
    const group = new THREE.Group()
    const model = vineCritter(name, BIT_SIZE, standIn, true)
    group.add(model)
    group.visible = false
    root.add(group)
    return { group, model }
  }
  const heads = Array.from({ length: 12 }, () => makeBit('caterpillar_head', headStandIn))
  const bodies = Array.from({ length: 12 }, () => makeBit('caterpillar_body', bodyStandIn))

  // ---- leaves and suds on the trellis, and bubbles floating away with squirted bits.
  const leafStandIn = standInMesh(new THREE.CircleGeometry(0.5, 7), '#3f7d36', owned)
  const sudsStandIn = standInMesh(new THREE.SphereGeometry(0.5, 8, 6), '#f4fbff', owned)
  const blockViews = new Map<string, BlockView>()
  const blockKey = (block: SquirtBlock): string => `${block.col},${block.row}`
  const bubbleStandIn = standInMesh(new THREE.SphereGeometry(0.5, 12, 8), '#cfeaff', owned)
  const bubbles: BubbleView[] = Array.from({ length: 6 }, () => {
    const group = new THREE.Group()
    group.add(vineCritter('bubble', 0.3, bubbleStandIn, true))
    const passenger = vineCritter('caterpillar_body', 0.16, bodyStandIn, true)
    group.add(passenger)
    group.visible = false
    root.add(group)
    return { group, from: new THREE.Vector3(), age: BUBBLE_SECONDS, drift: 0 }
  })

  // ---- input: the pointer slides the bottle; the arrows slide it too.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hit = new THREE.Vector3()
  const keys = new Set<string>()
  function aimAt(clientX: number, clientY: number): void {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1)
    raycaster.setFromCamera(ndc, stage.camera)
    if (raycaster.ray.intersectPlane(plane, hit)) field.setSprayerTarget(hit.x / CELL + (SQUIRT_COLS - 1) / 2)
  }
  const keyDirection = (): number => (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)
  const sideOf = (code: string): string | null => (code === 'ArrowLeft' || code === 'KeyA' ? 'left' : code === 'ArrowRight' || code === 'KeyD' ? 'right' : null)
  const onKeyDown = (event: KeyboardEvent): void => {
    const side = sideOf(event.code)
    if (!side) return
    event.preventDefault()
    keys.add(side)
    field.setKeyDirection(keyDirection())
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const side = sideOf(event.code)
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
  let squish = 0
  const at = new THREE.Vector3()

  function handle(events: SquirtEvent[]): void {
    for (const event of events) {
      if (event.kind === 'squirt') {
        squish = 1
        sfx.play('spritz', 0.8 + Math.random() * 0.4)
      } else if (event.kind === 'pop') {
        pop(event.x, event.y, event.head)
      } else if (event.kind === 'leaf') {
        const view = blockViews.get(`${event.col},${event.row}`)
        if (view) view.wobble = 0.4
        at.set(fieldX(event.col), fieldY(event.row), 0.05)
        bursts.add(createBurst(at, { count: 5, colors: ['#8fd3f5', '#e8f7ff'], size: 0.025, speed: [0.4, 1], lift: 0.4, gravity: 4, seconds: 0.35 }), root)
        if (event.hits === 0) {
          bursts.add(createBurst(at, { count: 8, colors: ['#3f7d36', '#5a9a49'], size: 0.06, speed: [0.3, 0.9], lift: 0.2, gravity: 2, seconds: 0.9, shape: 'leaf' }), root)
          sfx.play('swish')
        } else {
          sfx.play('tap', 0.6)
        }
      } else if (event.kind === 'wash') {
        at.set(fieldX(event.col), fieldY(event.row), 0.05)
        bursts.add(createBurst(at, { count: 10, colors: ['#ffffff', '#d6ecf6'], size: 0.03, speed: [0.3, 0.9], lift: 0.3, gravity: 2, seconds: 0.5 }), root)
        sfx.play('splash')
      } else if (event.kind === 'nibble') {
        nibble(event.x)
      }
      if (round.snapshot.state !== 'playing') return
    }
  }

  function pop(x: number, y: number, head: boolean): void {
    at.set(fieldX(x), fieldY(y), 0.06)
    const bubble = bubbles.reduce((oldest, entry) => (entry.age > oldest.age ? entry : oldest), bubbles[0])
    bubble.from.copy(at)
    bubble.age = 0
    bubble.drift = (Math.random() - 0.5) * 0.6
    bubble.group.visible = true
    bursts.add(createBurst(at, { count: 12, colors: ['#ffffff', '#cfeaff', '#9ad04a'], size: 0.03, speed: [0.5, 1.3], lift: 0.4, gravity: 3, seconds: 0.45, onTop: true }), root)
    sfx.play('pop')
    const streak = round.hit()
    context.popAt(at, head ? 'BONK! POP!' : streak >= 4 ? `POP! x${streak}` : 'POP!', 'good', streak >= 4)
    context.hitStop(0.03)
  }

  function nibble(x: number): void {
    at.set(fieldX(x), BASE_Y * 0.55, -0.1)
    bursts.add(createBurst(at, { count: 12, colors: ['#3f7d36', '#5a9a49', '#9ad04a'], size: 0.05, speed: [0.4, 1.2], lift: 0.6, gravity: 3, seconds: 0.8, shape: 'leaf' }), root)
    round.harm()
    sfx.play('chomp')
    sfx.play('harm')
    stage.shake(0.12)
    stage.bounce(0.6)
    context.popAt(at.setY(BASE_Y), 'MUNCH!', 'bad', true)
  }

  /** Make the trellis's leaves and suds match the rules: new ones grow in, gone ones wither or wash away. */
  function syncBlocks(dt: number): void {
    const live = new Map<string, SquirtBlock>()
    for (const block of field.blocks) {
      const key = blockKey(block)
      live.set(key, block)
      if (blockViews.has(key)) continue
      const group = new THREE.Group()
      const model = block.kind === 'leaf'
        ? vineCritter('trellis_leaf', 0.26, leafStandIn, true)
        : vineCritter('suds', 0.24, sudsStandIn, true)
      if (block.kind === 'leaf') model.rotation.z = ((block.col * 7 + block.row * 3) % 5 - 2) * 0.35
      group.add(model)
      group.position.set(fieldX(block.col), fieldY(block.row), block.kind === 'leaf' ? -0.04 : 0.02)
      root.add(group)
      blockViews.set(key, { block, group, wobble: 0, grow: block.kind === 'leaf' ? 1 : 0, leaving: false })
    }
    for (const [key, view] of blockViews) {
      if (!live.has(key) && !view.leaving) view.leaving = true
      if (view.leaving) {
        view.grow -= dt * 4
        if (view.grow <= 0) {
          view.group.removeFromParent()
          blockViews.delete(key)
          continue
        }
      } else if (view.grow < 1) {
        view.grow = Math.min(1, view.grow + dt * 6)
      }
      const left = live.get(key)
      // A leaf shrinks a little with each squirt it takes.
      const worn = left && left.kind === 'leaf' ? 0.7 + 0.3 * (left.hits / SQUIRT_LEAF_HITS) : 1
      view.wobble = Math.max(0, view.wobble - dt)
      view.group.rotation.z = Math.sin(view.wobble * 40) * view.wobble * 0.5
      const breathe = view.block.kind === 'suds' ? 1 + Math.sin(time * 5 + view.block.col) * 0.04 : 1
      view.group.scale.setScalar(Math.max(0.001, view.grow * worn * breathe))
    }
  }

  function syncBits(): void {
    let headIndex = 0
    let bodyIndex = 0
    for (const chain of field.chains) {
      chain.segments.forEach((bit, index) => {
        const view = bit.head ? heads[headIndex++] : bodies[bodyIndex++]
        if (!view) return
        // Bits filing down onto the trellis show as they come over the top beam.
        const above = bit.y - (SQUIRT_ROWS - 1)
        view.group.visible = above < 0.6
        const enter = THREE.MathUtils.clamp(1 - above / 0.6, 0, 1)
        const wave = Math.sin(time * 11 - index * 0.9)
        view.group.position.set(fieldX(bit.x), fieldY(bit.y) + Math.max(0, wave) * 0.025, 0.04)
        view.group.scale.set(enter * (1 + wave * 0.06), enter * (1 - wave * 0.05), enter)
        // A head looks the way it crawls (straight at you while it drops a wire).
        view.model.rotation.y = THREE.MathUtils.lerp(view.model.rotation.y, bit.heading * 0.7, 0.2)
        view.model.rotation.z = finished && !won ? Math.sin(time * 12 + index) * 0.2 : 0
      })
    }
    for (let index = headIndex; index < heads.length; index += 1) heads[index].group.visible = false
    for (let index = bodyIndex; index < bodies.length; index += 1) bodies[index].group.visible = false
  }

  /** Debug harness: the caterpillars, the bottle and where each column is on screen, for scripted play. */
  function debugState(): unknown {
    return {
      chains: field.chains.map((chain) => chain.segments.map((bit) => ({ x: bit.x, y: bit.y }))),
      sprayerX: field.sprayerX,
      popped: field.popped,
      left: field.left,
      blocks: field.blocks.length,
      shot: field.shot,
      /** Screen x of each column at the bottom wire, and the screen y of the bottle. */
      columnScreenX: Array.from({ length: SQUIRT_COLS }, (_, col) => Math.round(stage.toScreen(new THREE.Vector3(fieldX(col), BASE_Y, 0)).x)),
      sprayerScreenY: Math.round(stage.toScreen(new THREE.Vector3(0, SHELF_Y + 0.1, 0.1)).y),
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
      syncBits()
      syncBlocks(dt)
      // The bottle slides along the shelf and squishes as it squirts.
      squish = Math.max(0, squish - dt * 8)
      sprayer.position.x = fieldX(field.sprayerX)
      sprayer.scale.set(1 + squish * 0.08, 1 - squish * 0.1, 1 + squish * 0.08)
      const shot = field.shot
      drops.forEach((drop, index) => {
        drop.visible = Boolean(shot) && !finished
        if (shot) drop.position.set(fieldX(shot.x), fieldY(shot.y) - index * 0.06, 0.06)
      })
      for (const bubble of bubbles) {
        if (bubble.age >= BUBBLE_SECONDS) continue
        bubble.age += dt
        const t = bubble.age / BUBBLE_SECONDS
        bubble.group.position.set(bubble.from.x + Math.sin(t * 9) * 0.06 + bubble.drift * t, bubble.from.y + t * 1.1, bubble.from.z + 0.1)
        bubble.group.scale.setScalar(Math.min(1, bubble.age * 6) * (1 + t * 0.2))
        bubble.group.rotation.z = Math.sin(t * 7) * 0.3
        if (bubble.age >= BUBBLE_SECONDS) {
          bubble.group.visible = false
          bursts.add(createBurst(bubble.group.position, { count: 8, colors: ['#ffffff', '#cfeaff'], size: 0.025, speed: [0.4, 1], lift: 0.2, gravity: 1, seconds: 0.4 }), root)
        }
      }
    },
    pointerDown(x, y): void {
      if (keyDirection() === 0) aimAt(x, y)
    },
    pointerMove(x, y): void {
      if (keyDirection() === 0) aimAt(x, y)
    },
    pointerUp(): void {},
    finish(didWin): void {
      finished = true
      won = didWin
      field.setSquirting(false)
      if (won) {
        stage.bounce(1)
        const top = new THREE.Vector3(0, PLANT_SIZE * 0.6, -0.3)
        bursts.add(createBurst(top, { count: 26, colors: ['#fff3b0', '#ffd24a', '#bff27a'], size: 0.05, speed: [0.8, 2], lift: 0.8, gravity: 2.5, seconds: 1, shape: 'star', onTop: true }), root)
        sfx.play('bonus')
      }
    },
    debug: debugState,
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      returnPlant()
      stage.setFraming(null)
      root.removeFromParent()
    },
  }
}
