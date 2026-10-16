import * as THREE from 'three'
import { CARE_GAME_RULES } from '../../game/care-minigames'
import { cloneCritter } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * SNIP! The bush throws its wild leaves up into the air; slice them with a
 * swipe before they fall back. Berry clusters get thrown up too, and cutting
 * one bursts it. Drop three leaves, or cut two berry clusters, and the round
 * is lost.
 *
 * Swipe with the button held: the blade leaves a glowing trail, and every leaf
 * the stroke crosses is cut in two along the line of the cut. Cutting several
 * in one stroke is a combo. The wild shoots on the bush behind shrink with
 * every leaf, so the bush gets visibly tidier as you play.
 */

const LAUNCH_Z = 0.55
const GRAVITY = 4.2
const LEAF_SCALE = 1.7
/** Slicing needs a moving blade: a stroke slower than this cuts nothing. */
const MIN_BLADE_SPEED = 380
const TRAIL_SECONDS = 0.14

type ThrownKind = 'leaf' | 'berries'

interface Thrown {
  readonly kind: ThrownKind
  readonly object: THREE.Object3D
  readonly velocity: THREE.Vector3
  readonly spin: THREE.Vector3
  /** Screen-space radius in metres. */
  readonly radius: number
  state: 'flying' | 'cut' | 'gone'
  age: number
}

interface Piece {
  readonly object: THREE.Object3D
  readonly velocity: THREE.Vector3
  readonly spin: THREE.Vector3
  age: number
}

interface TrailPoint {
  readonly x: number
  readonly y: number
  readonly t: number
}

export function createSnipGame(context: CareGameContext): CareGameScene {
  const { stage, round, dom, sfx, bursts } = context
  const root = new THREE.Group()
  root.name = 'Snip game'
  stage.scene.add(root)
  // GPU parts go on the player's shelf; it frees them once the next round is ready.
  const owned: Array<{ dispose(): void }> = context.owned
  const berryGeometry = new THREE.SphereGeometry(0.075, 14, 10)
  owned.push(berryGeometry)

  // The bush shows its wild shoots for the round; they shrink as leaves fall.
  const shoots = stage.group('BB_shoots')
  if (shoots) shoots.visible = true

  const thrown: Thrown[] = []
  const pieces: Piece[] = []
  let time = 0
  let nextWave = 0.35
  let waves = 0
  let finished = false
  let pressed = false
  const trail: TrailPoint[] = []
  let strokeCuts = 0
  let last: TrailPoint | null = null
  const canvas = dom.trail()
  const pen = canvas.getContext('2d')

  function launch(kind: ThrownKind): void {
    let object: THREE.Object3D | null
    if (kind === 'leaf') {
      object = cloneCritter('leaf')
      object?.scale.setScalar(LEAF_SCALE)
    } else {
      object = new THREE.Group()
      object.name = 'Thrown berry cluster'
      for (const [x, y] of [[-0.06, 0], [0.06, 0.01], [0, 0.08]]) {
        const berry = new THREE.Mesh(berryGeometry, stage.berryMaterial)
        berry.position.set(x, y, 0)
        object.add(berry)
      }
    }
    if (!object) return
    const x = (Math.random() - 0.5) * 1.7
    object.position.set(x, -0.55, LAUNCH_Z + (Math.random() - 0.5) * 0.2)
    object.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    root.add(object)
    thrown.push({
      kind, object,
      velocity: new THREE.Vector3(-x * (0.35 + Math.random() * 0.4), 3.05 + Math.random() * 0.55, 0),
      spin: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5),
      radius: kind === 'leaf' ? 0.12 : 0.13,
      state: 'flying', age: 0,
    })
  }

  function wave(): void {
    waves += 1
    // One leaf to start, then twos and threes; berries join from the third wave.
    const size = waves < 3 ? 1 : waves < 7 ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2)
    for (let index = 0; index < size; index += 1) launch('leaf')
    if (waves >= 3 && Math.random() < 0.42) launch('berries')
    nextWave = time + Math.max(0.75, 1.25 - waves * 0.05) + Math.random() * 0.2
  }

  /** Split a cut leaf into its two halves, flung apart across the cut. */
  function splitLeaf(item: Thrown, across: THREE.Vector3): void {
    item.object.updateMatrixWorld(true)
    for (const [name, side] of [['CRITTER_leaf_half_L', -1], ['CRITTER_leaf_half_R', 1]] as const) {
      const half = item.object.getObjectByName(name)
      if (!half) continue
      // Keep the half exactly where it was in the world as it leaves the leaf.
      root.attach(half)
      pieces.push({
        object: half,
        velocity: item.velocity.clone().multiplyScalar(0.4).addScaledVector(across, side * 1.1).add(new THREE.Vector3(0, 0.6, 0)),
        spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, side * 9),
        age: 0,
      })
    }
    item.object.visible = false
  }

  function cut(item: Thrown, direction: THREE.Vector2): void {
    item.state = 'cut'
    item.age = 0
    // The cut line in world space; the halves fly apart across it.
    const across = new THREE.Vector3(-direction.y, -direction.x, 0).normalize()
    const at = item.object.position.clone()
    if (item.kind === 'leaf') {
      splitLeaf(item, across)
      bursts.add(createBurst(at, { count: 12, colors: ['#b9db7a', '#7fb64f', '#e9f7c4'], size: 0.022, speed: [1, 2.2], lift: 0.3, gravity: 5, seconds: 0.55, onTop: true }), root)
      strokeCuts += 1
      const streak = round.hit()
      sfx.play('snip', 1 + Math.min(0.6, (strokeCuts - 1) * 0.12))
      if (strokeCuts >= 2) context.popAt(at, `COMBO x${strokeCuts}!`, 'good', true)
      else context.popAt(at, streak >= 5 ? `SNIP! x${streak}` : 'SNIP!', 'good')
      if (strokeCuts >= 2) context.hitStop(0.04)
    } else {
      item.object.visible = false
      bursts.add(createBurst(at, { count: 22, colors: ['#5b3f9a', '#7a5ac8', '#3e4f9f', '#c48ad8'], size: 0.035, speed: [1.2, 2.6], lift: 0.4, gravity: 5, seconds: 0.8, onTop: true }), root)
      round.harm()
      sfx.play('squish')
      sfx.play('harm')
      stage.shake(0.1)
      context.popAt(at, 'Not the berries!', 'bad', true)
    }
  }

  function bladeSegment(from: TrailPoint, to: TrailPoint): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const seconds = Math.max(1 / 240, to.t - from.t)
    if (length < 2 || length / seconds < MIN_BLADE_SPEED) return
    const direction = new THREE.Vector2(to.x - from.x, to.y - from.y).normalize()
    const screen = new THREE.Vector2()
    for (const item of thrown) {
      if (item.state !== 'flying') continue
      stage.toScreen(item.object.position, screen)
      const radius = item.radius * stage.pixelsPerUnit(item.object.position) + 6
      // Distance from the item's centre to the blade segment, in pixels.
      const t = THREE.MathUtils.clamp(((screen.x - from.x) * (to.x - from.x) + (screen.y - from.y) * (to.y - from.y)) / (length * length), 0, 1)
      const distance = Math.hypot(from.x + (to.x - from.x) * t - screen.x, from.y + (to.y - from.y) * t - screen.y)
      if (distance <= radius) cut(item, direction)
    }
  }

  function drawTrail(): void {
    if (!pen) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.round(innerWidth * ratio)
    const height = Math.round(innerHeight * ratio)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    pen.setTransform(ratio, 0, 0, ratio, 0, 0)
    pen.clearRect(0, 0, innerWidth, innerHeight)
    const now = time
    while (trail.length && now - trail[0].t > TRAIL_SECONDS) trail.shift()
    if (trail.length < 2) return
    pen.lineCap = 'round'
    pen.lineJoin = 'round'
    for (const [widthScale, colour] of [[2.6, 'rgba(160, 230, 200, 0.35)'], [1, 'rgba(255, 252, 235, 0.95)']] as const) {
      for (let index = 1; index < trail.length; index += 1) {
        const a = trail[index - 1]
        const b = trail[index]
        const life = 1 - (now - b.t) / TRAIL_SECONDS
        if (life <= 0) continue
        pen.strokeStyle = colour
        pen.lineWidth = Math.max(1, 9 * life * widthScale * (index / trail.length))
        pen.beginPath()
        pen.moveTo(a.x, a.y)
        pen.lineTo(b.x, b.y)
        pen.stroke()
      }
    }
  }

  return {
    update(dt): void {
      time += dt
      if (!finished && time >= nextWave) wave()
      for (const item of thrown) {
        if (item.state !== 'flying') continue
        item.age += dt
        item.velocity.y -= GRAVITY * dt
        item.object.position.addScaledVector(item.velocity, dt)
        item.object.rotation.x += item.spin.x * dt
        item.object.rotation.y += item.spin.y * dt
        item.object.rotation.z += item.spin.z * dt
        if (item.velocity.y < 0 && item.object.position.y < -0.6) {
          item.state = 'gone'
          item.object.visible = false
          if (item.kind === 'leaf' && !finished) {
            round.miss()
            sfx.play('harm')
            const at = item.object.position.clone()
            at.y = -0.25
            context.popAt(at, 'MISS', 'bad')
          }
        }
      }
      for (let index = pieces.length - 1; index >= 0; index -= 1) {
        const piece = pieces[index]
        piece.age += dt
        piece.velocity.y -= GRAVITY * 1.3 * dt
        piece.object.position.addScaledVector(piece.velocity, dt)
        piece.object.rotation.x += piece.spin.x * dt
        piece.object.rotation.z += piece.spin.z * dt
        if (piece.age > 1.6) {
          piece.object.removeFromParent()
          pieces.splice(index, 1)
        }
      }
      for (let index = thrown.length - 1; index >= 0; index -= 1) {
        if (thrown[index].state === 'flying') continue
        thrown[index].object.removeFromParent()
        thrown.splice(index, 1)
      }
      if (shoots) {
        const left = 1 - round.snapshot.hits / CARE_GAME_RULES.snip.goal
        shoots.scale.setScalar(Math.max(0.001, shoots.scale.x + (left - shoots.scale.x) * Math.min(1, dt * 8)))
        shoots.visible = shoots.scale.x > 0.02
      }
      drawTrail()
    },
    pointerDown(x, y): void {
      pressed = true
      strokeCuts = 0
      last = { x, y, t: time }
      trail.length = 0
      trail.push(last)
    },
    pointerMove(x, y): void {
      stage.setLook((x / innerWidth * 2 - 1) * 0.4, -(y / innerHeight * 2 - 1) * 0.3)
      if (!pressed || finished) return
      const point = { x, y, t: time }
      if (last) bladeSegment(last, point)
      last = point
      trail.push(point)
    },
    pointerUp(): void {
      pressed = false
      last = null
      strokeCuts = 0
    },
    finish(won): void {
      finished = true
      pressed = false
      last = null
      trail.length = 0
      if (pen) pen.clearRect(0, 0, canvas.width, canvas.height)
      if (won && shoots) shoots.visible = false
    },
    dispose(): void {
      if (pen) pen.clearRect(0, 0, canvas.width, canvas.height)
      if (shoots) {
        shoots.visible = false
        shoots.scale.setScalar(1)
      }
      root.removeFromParent()
    },
  }
}
