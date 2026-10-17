import * as THREE from 'three'
import {
  PONG_GOOD_WITHIN, PONG_HIT_FROM, PONG_PERFECT_WITHIN, PONG_SHOOT_HALF, PONG_SHOOT_LANES, PONG_SWEET,
  createPongRally, pongShootHit, type PongEvent, type PongGrade, type PongShoot,
} from '../../game/care-pong'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'
import { glowTexture, rootCritter, standInMesh } from './root-cast'

/**
 * VOLLEY! Trim pong: table tennis down a potting bench against the vegetable's
 * own overgrown top. The vegetable stands in a planter at the far end with wild
 * shoots sticking up across it; a big leaf bats a pea at you. Tap as the pea
 * reaches your trowel (a ring on the bench closes in on the sweet spot), and tap
 * on a shoot to aim the return at it: a pea that lands on a shoot snips it off.
 *
 * The rules live in `src/game/care-pong.ts`; this scene draws them, turns taps
 * into aimed swings, and reports each trim (a hit) and each pea let past (a harm).
 */

/** The bench: its top's height, half its width, and where the near and far ends are. */
const TABLE_Y = 0.5
const TABLE_HALF = 1.2
const NEAR_Z = 1.35
const FAR_Z = -1.55
/** Where a pea meets the trowel (an incoming flight's end) and where it reaches the shoots (an outgoing one's). */
const HIT_Z = 1.05
const ARRIVE_Z = -1.38
/** A lane across the bench (-1..1) to world x. */
const LANE_X = 1.0
/** The planter at the far end: its soil's height, and where the shoots stand. */
const SOIL_Y = 0.8
const SHOOT_Z = -1.5
const SHOOT_HEIGHT = 0.62
const PEA_SIZE = 0.14
const PLANT_HEIGHT = 1.6
/** Where an incoming pea bounces (its own half) and how high it flies. */
const BOUNCE_AT = 0.65
const NET_Z = -0.15

interface ShootView {
  readonly shoot: PongShoot
  readonly group: THREE.Group
  readonly halo: THREE.Sprite
  /** 0..1 grown in, for the spring when it sprouts. */
  grow: number
  /** Seconds since it was trimmed, or -1 while standing. */
  falling: number
  readonly spin: THREE.Vector3
}

/** The pea's height along a flight: a hump down to its bounce, then up to where it is struck. */
function flightY(t: number, startY: number, endY: number): number {
  const table = TABLE_Y + PEA_SIZE / 2
  if (t < BOUNCE_AT) {
    const s = t / BOUNCE_AT
    return startY + (table - startY) * s + 0.24 * 4 * s * (1 - s)
  }
  const s = (t - BOUNCE_AT) / (1 - BOUNCE_AT)
  return table + (endY - table) * s + 0.3 * 4 * s * (1 - s)
}

export function createPongGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const owned = context.owned
  const root = new THREE.Group()
  root.name = 'Pong game'
  stage.scene.add(root)

  // ---- the framing: from behind the trowel, down the bench to the planter.
  stage.setFraming((aspect) => ({
    position: new THREE.Vector3(0, 1.72, 2.95),
    look: new THREE.Vector3(0, 0.66, -0.55),
    fov: aspect < 1.25 ? 50 * Math.min(1.75, 1.25 / aspect) : 50,
  }))

  // ---- the bench: planks, legs, a painted centre line and a twine net.
  const wood = new THREE.MeshLambertMaterial({ color: '#c79a62' })
  const woodDark = new THREE.MeshLambertMaterial({ color: '#9a6f42' })
  const paint = new THREE.MeshLambertMaterial({ color: '#fff4dc' })
  const plankGeometry = new THREE.BoxGeometry(1, 1, 1)
  owned.push(wood, woodDark, paint, plankGeometry)
  const planks = 6
  for (let index = 0; index < planks; index += 1) {
    const plank = new THREE.Mesh(plankGeometry, index % 2 ? wood : woodDark)
    const width = (TABLE_HALF * 2) / planks
    plank.scale.set(width - 0.02, 0.06, NEAR_Z - FAR_Z)
    plank.position.set(-TABLE_HALF + width * (index + 0.5), TABLE_Y - 0.03, (NEAR_Z + FAR_Z) / 2)
    plank.name = 'Pong bench plank'
    root.add(plank)
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = new THREE.Mesh(plankGeometry, woodDark)
    leg.scale.set(0.09, TABLE_Y, 0.09)
    leg.position.set(x * (TABLE_HALF - 0.1), TABLE_Y / 2 - 0.03, z > 0 ? NEAR_Z - 0.15 : FAR_Z + 0.15)
    leg.name = 'Pong bench leg'
    root.add(leg)
  }
  const line = new THREE.Mesh(plankGeometry, paint)
  line.scale.set(0.03, 0.005, NEAR_Z - FAR_Z - 0.1)
  line.position.set(0, TABLE_Y + 0.002, (NEAR_Z + FAR_Z) / 2)
  root.add(line)
  const netMaterial = new THREE.MeshLambertMaterial({ color: '#f3e7c8', transparent: true, opacity: 0.75 })
  owned.push(netMaterial)
  const net = new THREE.Mesh(plankGeometry, netMaterial)
  net.scale.set(TABLE_HALF * 2 + 0.06, 0.1, 0.012)
  net.position.set(0, TABLE_Y + 0.05, NET_Z)
  net.name = 'Pong twine net'
  root.add(net)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(plankGeometry, woodDark)
    post.scale.set(0.04, 0.14, 0.04)
    post.position.set(side * (TABLE_HALF + 0.03), TABLE_Y + 0.07, NET_Z)
    root.add(post)
  }

  // ---- the planter at the far end, with the vegetable in it.
  const troughMaterial = new THREE.MeshLambertMaterial({ color: '#8b5a34' })
  const soilMaterial = new THREE.MeshLambertMaterial({ color: '#5e3c26' })
  owned.push(troughMaterial, soilMaterial)
  const trough = new THREE.Mesh(plankGeometry, troughMaterial)
  trough.scale.set(TABLE_HALF * 2 + 0.1, SOIL_Y - TABLE_Y + 0.02, 0.6)
  trough.position.set(0, (SOIL_Y + TABLE_Y) / 2 - 0.01, -1.72)
  trough.name = 'Pong planter'
  root.add(trough)
  const soil = new THREE.Mesh(plankGeometry, soilMaterial)
  soil.scale.set(TABLE_HALF * 2, 0.02, 0.5)
  soil.position.set(0, SOIL_Y + 0.005, -1.72)
  root.add(soil)
  const plantHolder = new THREE.Group()
  plantHolder.name = 'Pong vegetable'
  plantHolder.position.set(0, SOIL_Y - 0.02, -1.85)
  root.add(plantHolder)
  if (stage.plant) {
    plantHolder.add(stage.plant)
    plantHolder.scale.setScalar(PLANT_HEIGHT / Math.max(0.01, stage.plantHeight))
  }

  // ---- the plant's bat: a big leaf that slides to meet the pea and swats it back.
  const leafMaterial = new THREE.MeshLambertMaterial({ color: '#5aa046' })
  const leafVein = new THREE.MeshLambertMaterial({ color: '#8cc76a' })
  const leafGeometry = new THREE.SphereGeometry(1, 12, 8)
  owned.push(leafMaterial, leafVein, leafGeometry)
  const bat = new THREE.Group()
  bat.name = 'Pong leaf bat'
  const batPivot = new THREE.Group()
  bat.add(batPivot)
  const blade = new THREE.Mesh(leafGeometry, leafMaterial)
  blade.scale.set(0.2, 0.26, 0.035)
  blade.position.y = 0.26
  const vein = new THREE.Mesh(leafGeometry, leafVein)
  vein.scale.set(0.012, 0.22, 0.04)
  vein.position.y = 0.26
  const stalk = new THREE.Mesh(plankGeometry, leafMaterial)
  stalk.scale.set(0.025, 0.14, 0.025)
  stalk.position.y = 0.04
  batPivot.add(blade, vein, stalk)
  bat.position.set(0, SOIL_Y - 0.05, ARRIVE_Z - 0.18)
  root.add(bat)

  // ---- the wild shoots across the planter, each with a glowing halo so it reads as a target.
  const halo = glowTexture('rgba(240,255,190,0.95)', 'rgba(220,255,150,0)')
  const haloMaterial = new THREE.SpriteMaterial({ map: halo, color: '#f4ffb0', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
  const targetHaloMaterial = new THREE.SpriteMaterial({ map: halo, color: '#ffd76a', transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending })
  owned.push(halo, haloMaterial, targetHaloMaterial)
  const shootStandIn = standInMesh(new THREE.ConeGeometry(0.05, 1, 6).translate(0, 0.5, 0), '#a6cf5a', owned)
  const rally = createPongRally()
  const shootViews: ShootView[] = []

  function addShoot(shoot: PongShoot, grow: number): ShootView {
    const group = new THREE.Group()
    group.name = `Pong shoot ${shoot.id}`
    const model = rootCritter('shoot', SHOOT_HEIGHT, shootStandIn)
    model.rotation.y = (shoot.id * 1.3) % (Math.PI * 2)
    group.add(model)
    const glow = new THREE.Sprite(haloMaterial)
    glow.scale.setScalar(0.42)
    glow.position.set(0, SHOOT_HEIGHT * 0.8, -0.05)
    group.add(glow)
    group.position.set(shoot.x * LANE_X, SOIL_Y, SHOOT_Z)
    root.add(group)
    const view = { shoot, group, halo: glow, grow, falling: -1, spin: new THREE.Vector3() }
    shootViews.push(view)
    return view
  }
  for (const shoot of rally.shoots) addShoot(shoot, 1)

  // ---- the pea, its shadow, the timing ring and the aim marker.
  const pea = rootCritter('pea', PEA_SIZE, standInMesh(new THREE.SphereGeometry(0.5, 12, 8), '#7cc24a', owned), true)
  root.add(pea)
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#2f2216', transparent: true, opacity: 0.3, depthWrite: false })
  const shadowGeometry = new THREE.CircleGeometry(PEA_SIZE * 0.55, 16)
  owned.push(shadowMaterial, shadowGeometry)
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  root.add(shadow)
  const ringGeometry = new THREE.RingGeometry(0.86, 1, 40)
  const timingMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
  const sweetMaterial = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
  owned.push(ringGeometry, timingMaterial, sweetMaterial)
  const timingRing = new THREE.Mesh(ringGeometry, timingMaterial)
  timingRing.rotation.x = -Math.PI / 2
  timingRing.name = 'Pong timing ring'
  const sweetRing = new THREE.Mesh(ringGeometry, sweetMaterial)
  sweetRing.rotation.x = -Math.PI / 2
  sweetRing.scale.setScalar(0.11)
  sweetRing.name = 'Pong sweet spot'
  root.add(timingRing, sweetRing)
  const aimMaterial = new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide })
  const aimGeometry = new THREE.RingGeometry(0.62, 1, 32)
  // A bobbing arrow over the aimed spot, so the aim reads from down the bench.
  const arrowGeometry = new THREE.ConeGeometry(0.07, 0.16, 4).rotateX(Math.PI)
  owned.push(aimMaterial, aimGeometry, arrowGeometry)
  const aimArrow = new THREE.Mesh(arrowGeometry, aimMaterial)
  aimArrow.name = 'Pong aim arrow'
  root.add(aimArrow)
  const aimRing = new THREE.Mesh(aimGeometry, aimMaterial)
  aimRing.rotation.x = -Math.PI / 2
  aimRing.scale.setScalar(PONG_SHOOT_HALF * LANE_X)
  aimRing.position.set(0, SOIL_Y + 0.02, SHOOT_Z)
  aimRing.name = 'Pong aim'
  root.add(aimRing)

  // ---- the trowel, near the camera; it follows the pea across the bench on its own.
  const trowel = new THREE.Group()
  trowel.name = 'Pong trowel'
  const trowelModel = rootCritter('trowel', 0.5, standInMesh(new THREE.BoxGeometry(0.2, 0.5, 0.03).translate(0, 0.25, 0), '#c4ced6', owned))
  trowel.add(trowelModel)
  trowel.position.set(0, TABLE_Y + 0.02, HIT_Z + 0.16)
  root.add(trowel)

  // ---- the state of the round.
  let time = 0
  let aimX = 0
  let swingAge = 1
  let lastGrade: PongGrade | null = null
  let batSwing = 0
  let finished = false
  let won = false
  let peaRoll = 0
  const scratch = new THREE.Vector3()

  /** Aim from a screen point: where its ray meets the planter's front, as a lane. */
  function aimFrom(clientX: number, clientY: number): void {
    const at = stage.screenToPlane(clientX, clientY, SHOOT_Z, scratch)
    aimX = THREE.MathUtils.clamp(at.x / LANE_X, -1, 1)
  }

  function swing(): void {
    if (finished) return
    handle(rally.swing(aimX))
  }

  function handle(events: PongEvent[]): void {
    for (const event of events) {
      if (event.kind === 'swing') {
        swingAge = 0
        lastGrade = event.grade
        sfx.play('tock', event.grade === 'perfect' ? 1.25 : event.grade === 'good' ? 1.05 : 0.9)
        if (event.grade === 'perfect') sfx.play('chopPerfect')
        const at = new THREE.Vector3(event.atX * LANE_X, TABLE_Y + 0.35, HIT_Z)
        context.popAt(at, event.grade === 'perfect' ? 'PERFECT!' : event.grade === 'good' ? 'GOOD' : 'OK', event.grade === 'ok' ? 'plain' : 'good', event.grade === 'perfect')
        if (event.grade === 'perfect') {
          context.hitStop(0.05)
          bursts.add(createBurst(at, { count: 10, colors: ['#fff3b0', '#ffd24a'], size: 0.03, speed: [0.6, 1.4], lift: 0.4, gravity: 3, seconds: 0.45, shape: 'star', onTop: true }), root)
        }
      } else if (event.kind === 'whiff') {
        swingAge = 0
        lastGrade = null
        sfx.play('whiff')
        round.whiff()
        context.popAt(new THREE.Vector3(trowel.position.x, TABLE_Y + 0.4, HIT_Z), 'Too early!', 'plain')
      } else if (event.kind === 'trim') {
        trim(event.shoot, event.grade)
      } else if (event.kind === 'batted' || event.kind === 'serve') {
        batSwing = 1
        sfx.play('swish')
        stage.bounce(0.15)
      } else if (event.kind === 'past') {
        round.harm()
        sfx.play('harm')
        stage.shake(0.1)
        peaRoll = 0
        context.popAt(new THREE.Vector3(event.atX * LANE_X, TABLE_Y + 0.4, HIT_Z), 'MISSED!', 'bad')
      } else if (event.kind === 'regrow') {
        addShoot(event.shoot, 0)
        sfx.play('pop', 1.2)
      }
      if (round.snapshot.state !== 'playing') return
    }
  }

  function trim(shoot: PongShoot, grade: PongGrade): void {
    const view = shootViews.find((entry) => entry.shoot.id === shoot.id)
    const at = new THREE.Vector3(shoot.x * LANE_X, SOIL_Y + SHOOT_HEIGHT * 0.5, SHOOT_Z)
    if (view) {
      view.falling = 0
      view.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3))
      view.halo.visible = false
    }
    sfx.play('snip', grade === 'perfect' ? 1.2 : 1)
    bursts.add(createBurst(at, { count: 16, colors: ['#8fd46a', '#d9f7a6', '#a6cf5a'], size: 0.04, speed: [0.8, 1.8], lift: 0.7, gravity: 4, seconds: 0.7, shape: 'leaf', onTop: true }), root)
    const streak = round.hit()
    context.popAt(at, streak >= 3 ? `TRIM! x${streak}` : 'TRIM!', 'good', streak >= 3)
    context.hitStop(0.06)
    stage.bounce(0.4)
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.repeat) return
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      swing()
      return
    }
    // The arrows hop the aim from shoot to shoot.
    const step = event.code === 'ArrowLeft' || event.code === 'KeyA' ? -1 : event.code === 'ArrowRight' || event.code === 'KeyD' ? 1 : 0
    if (step === 0) return
    event.preventDefault()
    const lanes = [...PONG_SHOOT_LANES].sort((a, b) => a - b)
    const index = lanes.findIndex((lane) => lane >= aimX - 1e-6)
    const current = index < 0 ? lanes.length - 1 : Math.abs(lanes[index] - aimX) < 1e-3 ? index : step > 0 ? index - 1 : index
    aimX = lanes[THREE.MathUtils.clamp(current + step, 0, lanes.length - 1)]
  }
  window.addEventListener('keydown', onKey)

  function peaPosition(target: THREE.Vector3): THREE.Vector3 {
    const ball = rally.ball
    if (ball.phase === 'serve') return target.set(bat.position.x, SOIL_Y + 0.35, ARRIVE_Z)
    if (ball.phase === 'past') {
      // It rolls on past the trowel and drops off the bench.
      const z = HIT_Z + 0.3 + peaRoll * 1.4
      const y = Math.max(-0.2, TABLE_Y + PEA_SIZE / 2 - Math.max(0, z - NEAR_Z) * Math.max(0, z - NEAR_Z) * 6)
      return target.set(ball.toX * LANE_X, y, z)
    }
    const t = ball.progress
    const x = THREE.MathUtils.lerp(ball.fromX, ball.toX, Math.min(1.12, t)) * LANE_X
    if (ball.phase === 'incoming') {
      return target.set(x, flightY(t, SOIL_Y + 0.35, TABLE_Y + 0.3), THREE.MathUtils.lerp(ARRIVE_Z, HIT_Z, t))
    }
    return target.set(x, flightY(t, TABLE_Y + 0.3, SOIL_Y + SHOOT_HEIGHT * 0.45), THREE.MathUtils.lerp(HIT_Z, ARRIVE_Z, t))
  }

  /** Debug harness: where the pea is, where the shoots stand on screen, and how the swing window looks. */
  function debugState(): unknown {
    const ball = rally.ball
    return {
      phase: ball.phase,
      progress: ball.progress,
      sweet: PONG_SWEET,
      ballX: rally.ballX,
      aimX,
      shoots: rally.shoots.map((shoot) => {
        const screen = stage.toScreen(new THREE.Vector3(shoot.x * LANE_X, SOIL_Y + SHOOT_HEIGHT * 0.5, SHOOT_Z))
        return { id: shoot.id, x: shoot.x, screenX: screen.x, screenY: screen.y }
      }),
      finished,
    }
  }

  return {
    // The trimmed shoots tumble a while before the stamp.
    outroSeconds: 1.2,
    update(dt): void {
      time += dt
      if (!finished) {
        if (dt > 0) handle(rally.step(dt))
        if (round.snapshot.state !== 'playing') return
      }
      const ball = rally.ball
      if (ball.phase === 'past') peaRoll += dt

      // The pea and its shadow.
      peaPosition(pea.position)
      pea.visible = !(finished && won) && pea.position.y > -0.15
      pea.rotation.x -= dt * 12
      shadow.visible = pea.visible && pea.position.z < NEAR_Z
      shadow.position.set(pea.position.x, TABLE_Y + 0.003, pea.position.z)
      shadow.scale.setScalar(Math.max(0.4, 1.2 - (pea.position.y - TABLE_Y) * 1.6))

      // The timing ring closes on the sweet spot as an incoming pea nears the trowel.
      const incoming = ball.phase === 'incoming' && !finished
      const ringX = THREE.MathUtils.lerp(ball.fromX, ball.toX, 1) * LANE_X
      timingRing.visible = incoming && ball.progress > 0.3
      sweetRing.visible = incoming
      if (incoming) {
        const closing = THREE.MathUtils.clamp((PONG_SWEET - ball.progress) / (PONG_SWEET - 0.3), 0, 1)
        timingRing.scale.setScalar(Math.max(0.05, 0.11 + closing * 0.5))
        const off = Math.abs(ball.progress - PONG_SWEET)
        const inWindow = ball.progress >= PONG_HIT_FROM
        timingMaterial.color.set(off <= PONG_PERFECT_WITHIN ? '#ffd24a' : inWindow && off <= PONG_GOOD_WITHIN ? '#bff27a' : '#ffffff')
        timingRing.position.set(ringX, TABLE_Y + 0.006, HIT_Z)
        sweetRing.position.set(ringX, TABLE_Y + 0.005, HIT_Z)
      }

      // The trowel tracks the pea across the bench and flicks forward on a swing.
      const followX = ball.phase === 'incoming' ? THREE.MathUtils.lerp(ball.fromX, ball.toX, Math.min(1, ball.progress + 0.15)) * LANE_X : trowel.position.x
      trowel.position.x += (followX - trowel.position.x) * Math.min(1, dt * 10)
      swingAge += dt
      const flick = swingAge < 0.22 ? Math.sin((swingAge / 0.22) * Math.PI) : 0
      trowel.rotation.set(-0.25 - flick * (lastGrade ? 0.9 : 0.5), 0, Math.sin(time * 2) * 0.03 - flick * 0.3 * Math.sign(aimX - trowel.position.x / LANE_X))
      trowel.position.y = TABLE_Y + 0.02 + flick * 0.06

      // The leaf bat slides to where the pea will arrive and swats when it does; between
      // returns it steps aside to the planter's corner, so the vegetable stays in view.
      const corner = (bat.position.x >= 0 ? 1 : -1) * (TABLE_HALF - 0.12)
      const batTarget = ball.phase === 'outgoing' ? ball.toX * LANE_X : ball.phase === 'serve' ? 0 : ball.progress < 0.25 ? ball.fromX * LANE_X : corner
      bat.position.x += (batTarget - bat.position.x) * Math.min(1, dt * (ball.phase === 'outgoing' ? 7 : 3))
      batSwing = Math.max(0, batSwing - dt * 4)
      batPivot.rotation.x = 0.35 + Math.sin(batSwing * Math.PI) * 0.9 + Math.sin(time * 1.7) * 0.05
      batPivot.rotation.z = Math.sin(time * 1.3) * 0.08

      // The aim marker, gold when it is on a shoot.
      aimRing.position.x = aimX * LANE_X
      aimRing.visible = !finished
      const onTarget = pongShootHit(rally.shoots, aimX, 'good')
      aimMaterial.color.set(onTarget ? '#ffd24a' : '#fff6dc')
      aimRing.scale.setScalar(PONG_SHOOT_HALF * LANE_X * (1 + Math.sin(time * 6) * 0.06))
      aimArrow.visible = !finished
      aimArrow.position.set(aimX * LANE_X, SOIL_Y + SHOOT_HEIGHT + 0.22 + Math.sin(time * 5) * 0.04, SHOOT_Z)
      aimArrow.rotation.y = time * 2

      // The shoots: sprouting, swaying, the aimed one glowing, the trimmed ones tumbling away.
      for (let index = shootViews.length - 1; index >= 0; index -= 1) {
        const view = shootViews[index]
        if (view.falling >= 0) {
          view.falling += dt
          const t = view.falling
          view.group.position.y = SOIL_Y + SHOOT_HEIGHT * 0.4 + 1.2 * t - 4.5 * t * t
          view.group.position.z = SHOOT_Z + t * 0.6
          view.group.rotation.x += view.spin.x * dt
          view.group.rotation.y += view.spin.y * dt
          view.group.rotation.z += view.spin.z * dt
          if (t > 1.4) {
            view.group.removeFromParent()
            shootViews.splice(index, 1)
          }
          continue
        }
        view.grow = Math.min(1, view.grow + dt * 2.2)
        const spring = view.grow < 1 ? 1 + Math.sin(view.grow * Math.PI) * 0.25 : 1
        view.group.scale.set(Math.max(0.001, view.grow), Math.max(0.001, view.grow * spring), Math.max(0.001, view.grow))
        view.group.rotation.z = Math.sin(time * 2.1 + view.shoot.id) * 0.08
        view.halo.material = onTarget?.id === view.shoot.id ? targetHaloMaterial : haloMaterial
        view.halo.scale.setScalar(0.42 * (1 + Math.sin(time * 4 + view.shoot.id) * 0.08))
      }
      if (finished && won) {
        // Every shoot left standing is snipped in the celebration.
        for (const view of shootViews) {
          if (view.falling < 0) {
            view.falling = 0
            view.spin.set(2, 1, view.shoot.x > 0 ? -4 : 4)
            view.halo.visible = false
          }
        }
      }
    },
    pointerDown(x, y): void {
      aimFrom(x, y)
      swing()
    },
    pointerMove(x, y): void {
      aimFrom(x, y)
    },
    pointerUp(): void {},
    finish(didWin): void {
      finished = true
      won = didWin
      timingRing.visible = false
      sweetRing.visible = false
      if (didWin) {
        stage.bounce(1)
        const at = new THREE.Vector3(0, SOIL_Y + PLANT_HEIGHT * 0.6, -1.78)
        bursts.add(createBurst(at, { count: 26, colors: ['#fff3b0', '#ffd24a', '#bff27a'], size: 0.05, speed: [0.8, 2], lift: 0.8, gravity: 2.5, seconds: 1, shape: 'star', onTop: true }), root)
      }
    },
    debug: debugState,
    dispose(): void {
      window.removeEventListener('keydown', onKey)
      if (stage.plant && stage.plant.parent === plantHolder) stage.scene.add(stage.plant)
      stage.setFraming(null)
      root.removeFromParent()
    },
  }
}
