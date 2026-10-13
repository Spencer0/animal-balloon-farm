import * as THREE from 'three'
import { CARE_GAME_RULES } from '../../game/care-minigames'
import { cloneCritter } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * SWAT! Beetles zig-zag in from the edges for the berries; swat them with the
 * fly swatter before they eat three. Two ladybugs bumble about too: they are
 * friends, and swatting one costs a berry's worth of hearts.
 *
 * It plays like a tiny aim trainer. The swatter is a first-person viewmodel
 * that follows the reticle and slams on a click, with a short cooldown so
 * spamming does not work. Beetles juke sideways at random every half second
 * or so, so you lead them or wait for them to land, and a landed beetle is
 * an easy target but is already eating.
 */

const BUG_SCALE = 0.82
/** Hit radius around a bug's centre, in metres, plus a little screen-space leniency. */
const HIT_RADIUS = 0.085
const HIT_LENIENCY_PX = 12
const SWAT_COOLDOWN = 0.24
const EAT_SECONDS = 1.35
/** When each beetle sets off, in seconds after the round starts. */
const SPAWN_TIMES = [0.25, 1.1, 1.9, 2.5, 3.3, 3.8, 4.6, 5.1]

type BugState = 'flying' | 'eating' | 'leaving' | 'splatted' | 'gone'

interface Bug {
  readonly kind: 'beetle' | 'ladybug'
  readonly object: THREE.Object3D
  readonly wings: THREE.Object3D[]
  readonly position: THREE.Vector3
  state: BugState
  age: number
  /** Flight: start, control and end of the approach curve. */
  readonly from: THREE.Vector3
  readonly via: THREE.Vector3
  readonly to: THREE.Vector3
  readonly flightSeconds: number
  /** The juke: where the sideways offset is heading, and where it is. */
  readonly juke: THREE.Vector3
  readonly jukeTarget: THREE.Vector3
  nextJuke: number
  berry: Berry | null
  eaten: number
  readonly spin: THREE.Vector3
  readonly velocity: THREE.Vector3
  readonly seed: number
}

interface Berry {
  readonly mesh: THREE.Mesh
  readonly home: THREE.Vector3
  readonly normal: THREE.Vector3
  eaten: boolean
  targeted: boolean
}

export function createSwatGame(context: CareGameContext): CareGameScene {
  const { stage, round, dom, sfx, bursts } = context
  const root = new THREE.Group()
  root.name = 'Swat game'
  stage.scene.add(root)
  const owned: Array<{ dispose(): void }> = []

  // Berries of its own, one per spot, so each can be eaten on its own. The
  // bush's merged berries are hidden for the round.
  const bushBerries = stage.group('BB_berries')
  if (bushBerries) bushBerries.visible = false
  const berryGeometry = new THREE.SphereGeometry(0.058, 16, 12)
  owned.push(berryGeometry)
  const berries: Berry[] = []
  const BERRY_SPOTS: Array<[number, number]> = [[-62, 0.36], [-40, 0.62], [-22, 0.3], [-6, 0.78], [12, 0.5], [30, 0.72], [46, 0.34], [64, 0.58]]
  for (const [degrees, height] of BERRY_SPOTS) {
    const angle = THREE.MathUtils.degToRad(degrees)
    // The canopy is a squashed dome; berries sit on its front face.
    const up = (height - 0.46) / 0.32
    const reach = 0.5 * Math.sqrt(Math.max(0.2, 1 - up * up * 0.6))
    const home = new THREE.Vector3(Math.sin(angle) * reach, height, Math.cos(angle) * reach).multiplyScalar(stage.bushScale)
    const normal = new THREE.Vector3(Math.sin(angle), up * 0.4, Math.cos(angle)).normalize()
    const mesh = new THREE.Mesh(berryGeometry, stage.berryMaterial)
    mesh.position.copy(home)
    root.add(mesh)
    berries.push({ mesh, home, normal, eaten: false, targeted: false })
  }

  // ---- the swatter, held in first person.
  const holder = new THREE.Group()
  holder.name = 'Swatter holder'
  stage.camera.add(holder)
  const swatter = cloneCritter('swatter')
  if (swatter) {
    swatter.scale.setScalar(0.62)
    // Paddle up and a little to the left, face toward the bugs.
    swatter.position.set(0, -0.2, 0)
    swatter.rotation.set(-0.2, 0, 0.35)
    holder.add(swatter)
  }
  holder.position.set(0.3, -0.3, -0.85)
  let swing = 1
  let cooldown = 0
  const aim = new THREE.Vector2(innerWidth / 2, innerHeight / 2)
  const aimCamera = new THREE.Vector3()

  // ---- bugs
  const bugs: Bug[] = []
  let beetlesSpawned = 0
  let time = 0
  let finished = false

  function makeBug(kind: Bug['kind'], from: THREE.Vector3, to: THREE.Vector3, flightSeconds: number, berry: Berry | null): Bug | null {
    const object = cloneCritter(kind)
    if (!object) return null
    object.scale.setScalar(BUG_SCALE)
    root.add(object)
    const wings = ['CRITTER_beetle_wing_L', 'CRITTER_beetle_wing_R'].map((name) => object.getObjectByName(name)).filter((wing): wing is THREE.Object3D => !!wing)
    const via = from.clone().lerp(to, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.2) * 0.5))
    const bug: Bug = {
      kind, object, wings, position: from.clone(), state: 'flying', age: 0, from, via, to, flightSeconds,
      juke: new THREE.Vector3(), jukeTarget: new THREE.Vector3(), nextJuke: 0.3 + Math.random() * 0.4,
      berry, eaten: 0, spin: new THREE.Vector3(), velocity: new THREE.Vector3(), seed: Math.random() * 100,
    }
    bugs.push(bug)
    return bug
  }

  function spawnBeetle(): void {
    const open = berries.filter((berry) => !berry.eaten && !berry.targeted)
    const pool = open.length ? open : berries.filter((berry) => !berry.eaten)
    const berry = pool[Math.floor(Math.random() * pool.length)] ?? null
    if (!berry) return
    berry.targeted = true
    const side = Math.random() < 0.5 ? -1 : 1
    const from = new THREE.Vector3(side * (2 + Math.random() * 0.5), 0.3 + Math.random() * 1.1, 0.4 + Math.random() * 0.6)
    const to = berry.home.clone().addScaledVector(berry.normal, 0.11)
    // Later beetles come in faster.
    const flight = Math.max(1.25, 2.4 - beetlesSpawned * 0.14) + Math.random() * 0.3
    makeBug('beetle', from, to, flight, berry)
  }

  function spawnLadybug(index: number): void {
    const from = new THREE.Vector3(index ? 2.4 : -2.4, 0.9, 0.7)
    makeBug('ladybug', from, new THREE.Vector3(0, 0.6, 0.8), 1, null)
  }
  spawnLadybug(0)
  spawnLadybug(1)

  const curve = (bug: Bug, t: number, target: THREE.Vector3): THREE.Vector3 => {
    const u = 1 - t
    return target.set(
      u * u * bug.from.x + 2 * u * t * bug.via.x + t * t * bug.to.x,
      u * u * bug.from.y + 2 * u * t * bug.via.y + t * t * bug.to.y,
      u * u * bug.from.z + 2 * u * t * bug.via.z + t * t * bug.to.z,
    )
  }

  function splat(bug: Bug): void {
    bug.state = 'splatted'
    bug.age = 0
    bug.velocity.set((Math.random() - 0.5) * 1.5, 1.4, 0.6)
    bug.spin.set(8 + Math.random() * 6, 0, 10)
    if (bug.berry && bug.kind === 'beetle') bug.berry.targeted = false
    bursts.add(createBurst(bug.position.clone(), {
      count: 14, colors: bug.kind === 'beetle' ? ['#ffe17a', '#fff1b3', '#ffffff'] : ['#ff8a6b', '#ffffff'],
      size: 0.05, speed: [0.9, 1.8], lift: 0.6, gravity: 2, seconds: 0.7, shape: 'star', onTop: true,
    }), root)
    bursts.add(createBurst(bug.position.clone(), {
      count: 10, colors: bug.kind === 'beetle' ? ['#7ccf6a', '#5aa257'] : ['#e0432f'],
      size: 0.025, speed: [1, 2.2], lift: 0.2, gravity: 6, seconds: 0.55,
    }), root)
  }

  function swatAt(x: number, y: number): void {
    if (cooldown > 0 || finished) return
    cooldown = SWAT_COOLDOWN
    swing = 0
    dom.fireReticle()
    let best: Bug | null = null
    let bestDistance = Infinity
    const screen = new THREE.Vector2()
    for (const bug of bugs) {
      if (bug.state === 'splatted' || bug.state === 'gone') continue
      stage.toScreen(bug.position, screen)
      const radius = HIT_RADIUS * BUG_SCALE * stage.pixelsPerUnit(bug.position) + HIT_LENIENCY_PX
      const distance = Math.hypot(screen.x - x, screen.y - y)
      if (distance <= radius && distance < bestDistance) {
        best = bug
        bestDistance = distance
      }
    }
    if (!best) {
      sfx.play('whiff')
      round.whiff()
      return
    }
    splat(best)
    sfx.play('swat')
    stage.shake(0.12)
    context.hitStop(0.06)
    if (best.kind === 'ladybug') {
      round.harm()
      sfx.play('harm')
      context.popAt(best.position, 'Not the ladybug!', 'bad')
      return
    }
    const streak = round.hit()
    context.popAt(best.position, streak >= 3 ? `SPLAT! x${streak}` : 'SPLAT!', 'good', streak >= 3)
  }

  function updateBug(bug: Bug, dt: number): void {
    bug.age += dt
    const flap = Math.sin((time + bug.seed) * 48)
    bug.wings.forEach((wing, index) => { wing.rotation.y = (index ? -1 : 1) * (0.25 + flap * 0.55) })
    if (bug.state === 'flying') {
      if (bug.kind === 'ladybug') {
        // Ladybugs drift lazily on a figure-eight in front of the bush, forever.
        const t = time * 0.55 + bug.seed
        const enter = Math.min(1, bug.age / 1.2)
        const loop = new THREE.Vector3(Math.sin(t) * 0.75, 0.55 + Math.sin(t * 2) * 0.22, 0.75 + Math.cos(t) * 0.12)
        bug.position.copy(bug.from).lerp(loop, enter * enter * (3 - 2 * enter))
      } else {
        const t = Math.min(1, bug.age / bug.flightSeconds)
        bug.nextJuke -= dt
        if (bug.nextJuke <= 0 && t < 0.88) {
          // A sudden dart sideways: the thing that makes them hard to hit.
          bug.jukeTarget.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.32, (Math.random() - 0.5) * 0.15)
          bug.nextJuke = 0.35 + Math.random() * 0.45
        }
        bug.juke.lerp(t > 0.85 ? bug.jukeTarget.set(0, 0, 0) : bug.jukeTarget, Math.min(1, dt * 9))
        curve(bug, t * t * (3 - 2 * t), bug.position).add(bug.juke)
        bug.position.y += Math.sin((time + bug.seed) * 7) * 0.025
        if (t >= 1) {
          bug.state = 'eating'
          bug.age = 0
        }
      }
    } else if (bug.state === 'eating') {
      bug.position.copy(bug.to)
      bug.position.y += Math.abs(Math.sin(bug.age * 14)) * 0.012
      const bites = Math.floor(bug.age / 0.3)
      if (bites > bug.eaten) {
        bug.eaten = bites
        sfx.play('chomp')
      }
      if (bug.berry) bug.berry.mesh.scale.setScalar(Math.max(0.25, 1 - bug.age / EAT_SECONDS * 0.7))
      if (bug.age >= EAT_SECONDS) {
        if (bug.berry) {
          bug.berry.eaten = true
          bug.berry.mesh.visible = false
          bursts.add(createBurst(bug.berry.home.clone(), { count: 12, colors: ['#3e4f9f', '#6a78c8', '#2a2b52'], size: 0.016, speed: [0.6, 1.4], lift: 0.4, gravity: 5, seconds: 0.6 }), root)
        }
        round.harm()
        sfx.play('harm')
        stage.shake(0.06)
        context.popAt(bug.position, 'CHOMP!', 'bad')
        bug.state = 'leaving'
        bug.age = 0
        bug.velocity.set(bug.position.x > 0 ? 1.6 : -1.6, 1.2, 0.3)
        round.release()
      }
    } else if (bug.state === 'leaving') {
      bug.position.addScaledVector(bug.velocity, dt)
      if (bug.age > 1.6) bug.state = 'gone'
    } else if (bug.state === 'splatted') {
      bug.velocity.y -= 5 * dt
      bug.position.addScaledVector(bug.velocity, dt)
      bug.object.rotation.x += bug.spin.x * dt
      bug.object.rotation.z += bug.spin.z * dt
      const squash = Math.max(0.25, 1 - bug.age * 4)
      bug.object.scale.set(BUG_SCALE * (1 + (1 - squash) * 0.6), BUG_SCALE * squash, BUG_SCALE * (1 + (1 - squash) * 0.6))
      if (bug.age > 1.2) bug.state = 'gone'
    }
    bug.object.position.copy(bug.position)
    if (bug.state === 'flying' || bug.state === 'leaving') {
      // Face where it is going; a beetle about to land turns to face the berry.
      const facing = bug.state === 'flying' && bug.kind === 'beetle' ? bug.to.clone().sub(bug.position) : bug.velocity.lengthSq() > 0 ? bug.velocity.clone() : new THREE.Vector3(0, 0, 1)
      if (bug.kind === 'ladybug') facing.set(Math.cos(time * 0.55 + bug.seed), 0, -Math.sin(time * 0.55 + bug.seed))
      if (facing.lengthSq() > 1e-6) bug.object.rotation.set(0, Math.atan2(-facing.x, -facing.z), Math.sin((time + bug.seed) * 9) * 0.25)
    } else if (bug.state === 'eating' && bug.berry) {
      bug.object.rotation.set(-0.3, Math.atan2(bug.berry.normal.x, bug.berry.normal.z), 0)
    }
    bug.object.visible = bug.state !== 'gone'
  }

  return {
    update(dt): void {
      time += dt
      cooldown = Math.max(0, cooldown - dt)
      if (!finished) {
        while (beetlesSpawned < CARE_GAME_RULES.swat.goal && time >= (SPAWN_TIMES[beetlesSpawned] ?? Infinity)) {
          spawnBeetle()
          beetlesSpawned += 1
        }
      }
      for (const bug of bugs) if (bug.state !== 'gone') updateBug(bug, dt)
      // The nearest beetle's buzz rises as it closes in.
      let buzz = 0
      for (const bug of bugs) if (bug.kind === 'beetle' && (bug.state === 'flying' || bug.state === 'eating')) buzz = Math.max(buzz, 1 - Math.min(1, bug.position.distanceTo(stage.camera.position) / 3.4))
      sfx.buzz(finished ? 0 : 0.35 + buzz)
      // Swatter: follow the aim, slam on a swing, recover.
      swing = Math.min(1, swing + dt / 0.22)
      const hit = swing < 0.3 ? swing / 0.3 : 1 - (swing - 0.3) / 0.7
      stage.screenToPlane(aim.x, aim.y, 0.7, aimCamera)
      stage.camera.worldToLocal(aimCamera)
      aimCamera.multiplyScalar(0.85 / Math.max(0.1, -aimCamera.z))
      holder.position.lerp(new THREE.Vector3(aimCamera.x + 0.06, aimCamera.y - 0.16, -0.85 - hit * 0.22), Math.min(1, dt * 18))
      holder.rotation.set(0.35 - hit * 1.15, -aimCamera.x * 0.4, -aimCamera.x * 0.3)
      dom.setReticle(aim.x, aim.y, !finished)
    },
    pointerDown(x, y): void {
      aim.set(x, y)
      swatAt(x, y)
    },
    pointerMove(x, y): void {
      aim.set(x, y)
      stage.setLook(x / innerWidth * 2 - 1, -(y / innerHeight * 2 - 1))
    },
    pointerUp(): void {},
    finish(won): void {
      finished = true
      sfx.buzz(0)
      for (const bug of bugs) {
        if (bug.state === 'flying' || bug.state === 'eating') {
          // Whoever is left scatters (or, on a loss, flies off fat and happy).
          bug.state = 'leaving'
          bug.age = 0
          bug.velocity.set(bug.position.x >= 0 ? 2.2 : -2.2, won ? 1.8 : 0.8, 0.2)
        }
      }
    },
    dispose(): void {
      sfx.buzz(0)
      if (bushBerries) bushBerries.visible = true
      holder.removeFromParent()
      root.removeFromParent()
      for (const part of owned) part.dispose()
    },
  }
}
