import * as THREE from 'three'
import {
  SKIM_TUNING,
  cattailHeight,
  cattailRise,
  dewPatterns,
  dragonTilt,
  fishLift,
  hazardGap,
  hazardKind,
  scrollSpeed,
  stepDragon,
  touchesCattail,
  touchesCircle,
  wingBeatRate,
  type DewPattern,
  type HazardKind,
} from '../../game/care-skim'
import { cloneCastCritter } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * SKIM! A dragonfly hovers over the pond. Hold to climb, let go to sink: the
 * world scrolls past, and it speeds up as the round goes on. Dewdrops hang in
 * lines, waves and arcs; fly through them, and a whole pattern collected pops
 * a bonus. Cattails rise out of the water, fish leap in an arc (the splash
 * shows where), and drifting fluff clumps float across: any of them bonks the
 * dragonfly, which blinks, unhurt, for a moment.
 *
 * The water lily sits low in the foreground pond and catches the dew: the win
 * sends the dragonfly swooping down to shake the dewdrops over it.
 *
 * The camera is the stage's own, a side view over the pond. The dragonfly
 * keeps its place on the left of the frame whatever the window's shape, and
 * the scroll is scaled to the frame's width so a narrow phone plays at the
 * same pace as the desktop.
 */

const PLAY_Z = 0
/** Half the desktop frame's width at the play plane: the scroll is tuned to it. */
const DESKTOP_HALF_WIDTH = 1.67
const WATER_Y = 0.02
const LILY_AT = { x: 0.62, z: 0.4 }
const LILY_SCALE = 1.0
const DRAGON_SCALE = 1.75
const CATTAIL_SCALE = 0.85
/** Foreground reeds: decoration in the water below the lane, scrolling faster for parallax. */
const FOREGROUND_REEDS: ReadonlyArray<readonly [number, number]> = [[-1.5, 0.5], [-0.6, 0.62], [0.2, 0.45], [1.1, 0.7]]
/** Hazards show their splash this far ahead of the dragonfly (in desktop frame widths) ... */
const SPLASH_AHEAD = 1.9
/** ... and a cattail rises, or a fish leaps, once it is this close. */
const CATTAIL_RISE_AHEAD = 1.1
const LEAP_AHEAD = 0.9
const CATTAIL_SPLASH_SECONDS = 0.6
const FISH_SPLASH_SECONDS = 0.6
const SPLASH_EVERY = 0.35
const SPLASH_LIFE = 0.9
const GLINT_EVERY = 0.04
const GLINT_LIFE = 0.45
const SPARK_LIFE = 0.7
/** A dew drop this far behind the dragonfly has been let go by. */
const DEW_BEHIND = 0.25
const WIN_SWOOP_SECONDS = 1.1
const WIN_SHAKE_DROPS = 8
const WIN_SHAKE_EVERY = 0.11

interface Ripple {
  readonly mesh: THREE.Mesh
  readonly material: THREE.MeshBasicMaterial
  age: number
  active: boolean
}

interface Hazard {
  readonly kind: HazardKind
  readonly object: THREE.Object3D
  x: number
  /** Where it is hit: a cattail's live height, a fish's or fluff's height. */
  y: number
  timer: number
  phase: 'waiting' | 'splash' | 'rising' | 'up' | 'sinking' | 'leap' | 'drift' | 'done'
  nextSplash: number
  hurt: boolean
  readonly seed: number
}

interface PatternState {
  readonly plan: DewPattern
  readonly drops: Dew[]
  picked: number
  missed: boolean
  spawned: boolean
}

interface Dew {
  readonly object: THREE.Object3D
  readonly pattern: PatternState
  x: number
  y: number
  picked: boolean
  gone: boolean
}

interface Glint {
  readonly mesh: THREE.Mesh
  x: number
  y: number
  age: number
  active: boolean
}

interface Spark {
  readonly mesh: THREE.Mesh
  readonly from: THREE.Vector3
  readonly drift: THREE.Vector3
  age: number
  active: boolean
}

interface FallingDrop {
  readonly object: THREE.Object3D
  vy: number
  landed: boolean
}

export function createSkimGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const root = new THREE.Group()
  root.name = 'Skim game'
  stage.scene.add(root)
  const owned: Array<{ dispose(): void }> = []

  // ---- the frame: a wide sheet of water under the stage, and the lily in the foreground.
  // The stage's own pond, rim and reeds would read as hazards in this lane, so they step aside for the round.
  const stageWater: THREE.Object3D[] = []
  stage.scene.traverse((object) => {
    if (/^Stage (pond|reed|cattail)/.test(object.name) && object.visible) stageWater.push(object)
  })
  for (const object of stageWater) object.visible = false
  const waterGeometry = new THREE.PlaneGeometry(14, 1.8)
  const waterMaterial = new THREE.MeshLambertMaterial({ color: '#5aaccc' })
  const water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, WATER_Y, 0.5)
  water.name = 'Skim water'
  root.add(water)
  owned.push(waterGeometry, waterMaterial)

  const lilyHome = new THREE.Group()
  lilyHome.name = 'Skim lily'
  lilyHome.position.set(LILY_AT.x, WATER_Y + 0.005, LILY_AT.z)
  lilyHome.scale.setScalar(LILY_SCALE)
  root.add(lilyHome)
  const lily = stage.plant
  if (lily) lilyHome.add(lily)
  // Foreground reeds: they sit in the water in front of the lane and drift past faster than the hazards.
  const reeds: Array<{ object: THREE.Object3D; x: number }> = []
  for (const [x, z] of FOREGROUND_REEDS) {
    const object = cloneCastCritter('water', 'cattail')
    if (!object) break
    object.scale.setScalar(1.3)
    object.position.set(x, WATER_Y, z)
    root.add(object)
    reeds.push({ object, x })
  }
  /** The lily's top, in world units, for the dew to land on. */
  const lilyTop = WATER_Y + stage.plantHeight * LILY_SCALE

  // ---- the dragonfly: a cast critter; its wings are pivots we flap by name.
  const dragonHolder = new THREE.Group()
  dragonHolder.name = 'Skim dragonfly'
  root.add(dragonHolder)
  const dragon = cloneCastCritter('water', 'dragonfly')
  if (dragon) {
    dragon.scale.setScalar(DRAGON_SCALE)
    dragonHolder.add(dragon)
  }
  const wingL = dragon?.getObjectByName('wing_L') ?? null
  const wingR = dragon?.getObjectByName('wing_R') ?? null

  // ---- shared geometry and materials for what the scene makes itself.
  const dewBodyGeometry = new THREE.SphereGeometry(SKIM_TUNING.dewRadius, 16, 12)
  const dewShineGeometry = new THREE.SphereGeometry(0.022, 8, 6)
  const dewMaterial = new THREE.MeshStandardMaterial({ color: '#a9e6ff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.86, emissive: '#1f6f9a', emissiveIntensity: 0.25 })
  const dewShineMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  owned.push(dewBodyGeometry, dewShineGeometry, dewMaterial, dewShineMaterial)
  const dewTemplate = new THREE.Group()
  dewTemplate.name = 'Skim dewdrop'
  const dewBody = new THREE.Mesh(dewBodyGeometry, dewMaterial)
  dewBody.scale.set(1, 1.2, 1)
  const dewShine = new THREE.Mesh(dewShineGeometry, dewShineMaterial)
  dewShine.position.set(-0.028, 0.03, 0.05)
  dewTemplate.add(dewBody, dewShine)

  const fluffGeometry = new THREE.SphereGeometry(0.06, 10, 8)
  const fluffMaterial = new THREE.MeshStandardMaterial({ color: '#fffbf2', roughness: 1, metalness: 0 })
  owned.push(fluffGeometry, fluffMaterial)
  const fluffTemplate = new THREE.Group()
  fluffTemplate.name = 'Skim fluff'
  for (const [x, y, z, s] of [[0, 0, 0, 1], [0.07, 0.03, 0.02, 0.8], [-0.07, 0.02, -0.01, 0.85], [0.03, 0.08, -0.03, 0.75], [-0.04, -0.05, 0.03, 0.7], [0.05, -0.04, -0.04, 0.6], [-0.02, 0.09, 0.02, 0.6]] as const) {
    const puff = new THREE.Mesh(fluffGeometry, fluffMaterial)
    puff.position.set(x, y, z)
    puff.scale.setScalar(s)
    fluffTemplate.add(puff)
  }

  const glintGeometry = new THREE.OctahedronGeometry(0.02, 0)
  const glintMaterial = new THREE.MeshBasicMaterial({ color: '#e9fff6', transparent: true, depthWrite: false })
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, depthWrite: false })
  const rippleGeometry = new THREE.RingGeometry(0.05, 0.065, 28)
  owned.push(glintGeometry, glintMaterial, sparkMaterial, rippleGeometry)

  const glints: Glint[] = Array.from({ length: 26 }, () => {
    const mesh = new THREE.Mesh(glintGeometry, glintMaterial)
    mesh.visible = false
    root.add(mesh)
    return { mesh, x: 0, y: 0, age: 0, active: false }
  })
  const sparks: Spark[] = Array.from({ length: 16 }, () => {
    const mesh = new THREE.Mesh(glintGeometry, sparkMaterial)
    mesh.visible = false
    root.add(mesh)
    return { mesh, from: new THREE.Vector3(), drift: new THREE.Vector3(), age: 0, active: false }
  })
  const ripples: Ripple[] = Array.from({ length: 10 }, () => {
    const material = new THREE.MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: 0.9, depthWrite: false })
    owned.push(material)
    const mesh = new THREE.Mesh(rippleGeometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = false
    root.add(mesh)
    return { mesh, material, age: 0, active: false }
  })

  // ---- the round's state. The frame's width sets `k` and the dragonfly's place.
  let k = 1
  let dragonX = -0.55
  let spawnX = SKIM_TUNING.spawnX
  let dragonY = 0.7
  let dragonVy = 0
  let held = false
  let invulnerable = 0
  let spin = 0
  let flap = 0
  let glintTimer = 0
  let playTime = 0
  let time = 0
  let nextHazardAt = SKIM_TUNING.hazardGrace
  let planned = false
  let finished = false
  let won = false
  let finishedFor = 0
  const swoopFrom = new THREE.Vector3()
  const swoopTo = new THREE.Vector3()
  let shaken = 0
  let winSparked = false
  const patterns: PatternState[] = []
  const dews: Dew[] = []
  const hazards: Hazard[] = []
  const falling: FallingDrop[] = []

  // Space is a bonus for the hold: the pointer does the same job.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space') return
    event.preventDefault()
    held = true
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') held = false
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  function frame(): void {
    // The dragonfly holds the left third of the frame; the scroll and the spawn edge follow its width.
    const camera = stage.camera
    const distance = camera.position.distanceTo(new THREE.Vector3(0, 0.5, PLAY_Z))
    const half = Math.max(0.8, Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance * camera.aspect)
    k = Math.min(1.4, half / DESKTOP_HALF_WIDTH)
    dragonX = -half * 0.33
    spawnX = half + 0.45
  }
  frame()

  function ripple(x: number): void {
    const ring = ripples.find((entry) => !entry.active)
    if (!ring) return
    ring.active = true
    ring.age = 0
    ring.mesh.visible = true
    ring.mesh.position.set(x, WATER_Y + 0.01, PLAY_Z)
    ring.mesh.scale.setScalar(0.4)
  }

  function glint(): void {
    const item = glints.find((entry) => !entry.active)
    if (!item) return
    item.active = true
    item.age = 0
    item.x = dragonX - 0.1 - Math.random() * 0.05
    item.y = dragonY + (Math.random() - 0.5) * 0.05
    item.mesh.visible = true
  }

  function sparkle(at: THREE.Vector3, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const item = sparks.find((entry) => !entry.active)
      if (!item) return
      const angle = Math.random() * Math.PI * 2
      const radius = 0.05 + Math.random() * 0.16
      item.active = true
      item.age = 0
      item.from.set(at.x + Math.cos(angle) * radius, at.y + Math.random() * 0.2, at.z + Math.sin(angle) * radius)
      item.drift.set(Math.cos(angle) * 0.2, 0.35 + Math.random() * 0.3, Math.sin(angle) * 0.2)
      item.mesh.visible = true
      item.mesh.position.copy(item.from)
    }
  }

  function spawnPattern(state: PatternState): void {
    state.spawned = true
    for (const drop of state.plan.drops) {
      const object = dewTemplate.clone(true)
      root.add(object)
      const dew: Dew = { object, pattern: state, x: spawnX + drop.dx, y: drop.y, picked: false, gone: false }
      state.drops.push(dew)
      dews.push(dew)
    }
  }

  function spawnHazard(): void {
    const kind = hazardKind(Math.random())
    let object: THREE.Object3D | null
    if (kind === 'cattail') object = cloneCastCritter('water', 'cattail')
    else if (kind === 'fish') object = cloneCastCritter('water', 'fish')
    else object = fluffTemplate.clone(true)
    if (!object) return
    if (kind === 'cattail') object.scale.setScalar(CATTAIL_SCALE)
    if (kind === 'fish') object.scale.setScalar(1.1)
    root.add(object)
    hazards.push({
      kind,
      object,
      x: spawnX,
      y: kind === 'fluff' ? 0.6 + Math.random() * 0.5 : WATER_Y,
      timer: 0,
      phase: kind === 'fluff' ? 'drift' : 'waiting',
      nextSplash: 0,
      hurt: false,
      seed: Math.random() * 10,
    })
  }

  function bonk(at: THREE.Vector3): void {
    round.harm()
    invulnerable = SKIM_TUNING.bonkSeconds
    spin = 3
    sfx.play('harm')
    stage.shake(0.12)
    context.hitStop(0.07)
    context.popAt(at, 'BONK!', 'bad', true)
    bursts.add(createBurst(at.clone(), {
      count: 16, colors: ['#ffffff', '#c9d6dc', '#8fa3ad'], size: 0.03, speed: [1, 2], lift: 0.4, gravity: 4, seconds: 0.6, shape: 'star', onTop: true,
    }), root)
  }

  function collect(dew: Dew): void {
    dew.picked = true
    dew.object.visible = false
    dew.pattern.picked += 1
    const streak = round.hit()
    sfx.play('dew', 1 + Math.min(1.2, streak * 0.06))
    const at = new THREE.Vector3(dew.x, dew.y, PLAY_Z)
    context.hitStop(0.03)
    stage.bounce(0.15)
    context.popAt(at, streak >= 3 ? `DEW x${streak}` : 'DEW!', 'good', streak >= 3)
    bursts.add(createBurst(at, {
      count: 10, colors: ['#a9e6ff', '#ffffff', '#6fbcf0'], size: 0.022, speed: [0.8, 1.6], lift: 0.4, gravity: 4, seconds: 0.5, shape: 'star', onTop: true,
    }), root)
    if (dew.pattern.picked === dew.pattern.drops.length && !dew.pattern.missed) {
      const middle = dew.pattern.drops[Math.floor(dew.pattern.drops.length / 2)]
      const centre = new THREE.Vector3(middle.x, middle.y + 0.14, PLAY_Z)
      sfx.play('bonus')
      context.popAt(centre, 'PATTERN!', 'good', true)
      bursts.add(createBurst(centre, {
        count: 26, colors: ['#ffe17a', '#a9e6ff', '#ffffff', '#f7b6d8'], size: 0.035, speed: [1.2, 2.4], lift: 0.8, gravity: 3, seconds: 0.9, shape: 'star', onTop: true,
      }), root)
    }
  }

  /** Does the dragonfly touch this hazard right now? Once per hazard. */
  function touches(hazard: Hazard): boolean {
    if (hazard.hurt || hazard.phase === 'done') return false
    const r = SKIM_TUNING.dragonRadius
    if (hazard.kind === 'cattail') return touchesCattail(dragonX, dragonY, r, hazard.x, hazard.y)
    if (hazard.kind === 'fish') return hazard.phase === 'leap' && touchesCircle(dragonX, dragonY, r, hazard.x, hazard.y, SKIM_TUNING.fishRadius)
    return touchesCircle(dragonX, dragonY, r, hazard.x, hazard.y, SKIM_TUNING.fluffRadius)
  }

  /** Move one hazard on its own clock: its splash, its rise or leap, and where it is. */
  function updateHazard(hazard: Hazard, dt: number, speed: number): void {
    hazard.x -= speed * dt
    const distance = hazard.x - dragonX
    if (hazard.kind === 'cattail') {
      if (hazard.phase === 'waiting' && distance <= SPLASH_AHEAD * k) {
        hazard.phase = 'splash'
        hazard.timer = 0
      }
      if (hazard.phase === 'splash') {
        hazard.timer += dt
        hazard.nextSplash -= dt
        if (hazard.nextSplash <= 0) { ripple(hazard.x); hazard.nextSplash = SPLASH_EVERY }
        if (hazard.timer >= CATTAIL_SPLASH_SECONDS && distance <= CATTAIL_RISE_AHEAD * k) {
          hazard.phase = 'rising'
          hazard.timer = 0
          sfx.play('splash', 0.8)
        }
      } else if (hazard.phase === 'rising') {
        hazard.timer += dt
        if (cattailRise(hazard.timer) >= 1) { hazard.phase = 'up'; hazard.timer = 0 }
      } else if (hazard.phase === 'up') {
        hazard.timer += dt
        if (distance < -1.4 * k) { hazard.phase = 'sinking'; hazard.timer = 0 }
      } else if (hazard.phase === 'sinking') {
        hazard.timer += dt
        if (cattailRise(hazard.timer, 0.35) >= 1) hazard.phase = 'done'
      }
      // How far it stands out of the water: it rises from under the surface and sinks back.
      const rise = hazard.phase === 'rising' ? cattailRise(hazard.timer)
        : hazard.phase === 'up' ? 1
          : hazard.phase === 'sinking' ? 1 - cattailRise(hazard.timer, 0.35)
            : 0
      hazard.y = cattailHeight(rise)
      hazard.object.position.set(hazard.x, WATER_Y + hazard.y - SKIM_TUNING.cattailTop, PLAY_Z)
      hazard.object.rotation.z = Math.sin(time * 1.6 + hazard.seed) * 0.03 * rise
    } else if (hazard.kind === 'fish') {
      if (hazard.phase === 'waiting' && distance <= SPLASH_AHEAD * k) {
        hazard.phase = 'splash'
        hazard.timer = 0
      }
      if (hazard.phase === 'splash') {
        hazard.timer += dt
        hazard.nextSplash -= dt
        if (hazard.nextSplash <= 0) { ripple(hazard.x); hazard.nextSplash = SPLASH_EVERY }
        if (hazard.timer >= FISH_SPLASH_SECONDS && distance <= LEAP_AHEAD * k) {
          hazard.phase = 'leap'
          hazard.timer = 0
          sfx.play('splash')
        }
      } else if (hazard.phase === 'leap') {
        hazard.timer += dt
        const progress = Math.min(1, hazard.timer / SKIM_TUNING.fishLeapSeconds)
        hazard.y = WATER_Y + fishLift(progress)
        const slope = (4 * SKIM_TUNING.fishPeak * (1 - 2 * progress)) / SKIM_TUNING.fishLeapSeconds
        hazard.object.rotation.z = Math.max(-0.9, Math.min(0.9, slope * 0.22))
        if (progress >= 1) hazard.phase = 'done'
      }
      hazard.object.position.set(hazard.x, hazard.phase === 'leap' ? hazard.y : WATER_Y - 0.3, PLAY_Z)
    } else {
      hazard.timer += dt
      hazard.x -= 0.18 * dt
      hazard.y = 0.6 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.3 + hazard.seed)) + 0.04 * Math.sin(time * 2.1 + hazard.seed)
      hazard.object.position.set(hazard.x, hazard.y, PLAY_Z)
      hazard.object.rotation.set(Math.sin(time * 0.9 + hazard.seed) * 0.2, time * 0.4, 0)
    }
    if (hazard.x < -2.6 * k - 0.5) hazard.phase = 'done'
    if (hazard.phase === 'done') hazard.object.visible = false
  }

  function updateDragon(dt: number): void {
    const next = stepDragon({ y: dragonY, vy: dragonVy }, held, dt)
    dragonY = next.y
    dragonVy = next.vy
    flap += dt * wingBeatRate(dragonVy) * Math.PI * 2 / 6
    const beat = Math.sin(flap * 6)
    if (wingL) wingL.rotation.x = 0.1 + beat * 0.55
    if (wingR) wingR.rotation.x = -0.1 - beat * 0.55
    spin = Math.max(0, spin - dt * 5)
    dragonHolder.position.set(dragonX, dragonY, PLAY_Z)
    dragonHolder.rotation.z = dragonTilt(dragonVy) + spin * 0.6
    dragonHolder.visible = invulnerable <= 0 || Math.floor(time * 12) % 2 === 0
  }

  function updatePlaying(dt: number): number {
    playTime += dt
    const speed = scrollSpeed(playTime) * k
    if (!planned) {
      planned = true
      for (const plan of dewPatterns(Math.random)) patterns.push({ plan, drops: [], picked: 0, missed: false, spawned: false })
    }
    for (const state of patterns) if (!state.spawned && playTime >= state.plan.at) spawnPattern(state)
    if (playTime >= nextHazardAt) {
      spawnHazard()
      nextHazardAt = playTime + hazardGap(playTime) * (0.85 + 0.3 * Math.random())
    }
    updateDragon(dt)
    invulnerable = Math.max(0, invulnerable - dt)

    for (const dew of dews) {
      if (dew.picked || dew.gone) continue
      dew.x -= speed * dt
      if (touchesCircle(dragonX, dragonY, SKIM_TUNING.pickupReach - SKIM_TUNING.dewRadius, dew.x, dew.y, SKIM_TUNING.dewRadius)) {
        collect(dew)
        continue
      }
      if (dew.x < dragonX - DEW_BEHIND) {
        dew.gone = true
        dew.pattern.missed = true
        dew.object.visible = false
      } else {
        dew.object.position.set(dew.x, dew.y + Math.sin(time * 5 + dew.x * 6) * 0.01, PLAY_Z)
      }
    }

    for (const hazard of hazards) {
      if (hazard.phase === 'done') continue
      updateHazard(hazard, dt, speed)
      if (invulnerable <= 0 && touches(hazard)) {
        hazard.hurt = true
        bonk(new THREE.Vector3(dragonX, dragonY, PLAY_Z))
      }
    }

    if (held) {
      glintTimer -= dt
      if (glintTimer <= 0) {
        glintTimer = GLINT_EVERY
        glint()
      }
    }
    return speed
  }

  /** Glints, ripples and sparks: their own clocks, carried by the scroll. */
  function updateEffects(dt: number, scroll: number): void {
    for (const reed of reeds) {
      reed.x -= scroll * 1.5 * dt
      if (reed.x < -2.6) reed.x += 5.2
      reed.object.position.x = reed.x
    }
    for (const item of glints) {
      if (!item.active) continue
      item.age += dt
      item.x -= scroll * dt
      if (item.age >= GLINT_LIFE) {
        item.active = false
        item.mesh.visible = false
        continue
      }
      const life = 1 - item.age / GLINT_LIFE
      item.mesh.position.set(item.x, item.y, PLAY_Z)
      item.mesh.scale.setScalar(0.4 + life * 0.9)
      item.mesh.rotation.y += dt * 6
    }
    for (const item of ripples) {
      if (!item.active) continue
      item.age += dt
      const progress = item.age / SPLASH_LIFE
      if (progress >= 1) {
        item.active = false
        item.mesh.visible = false
        continue
      }
      item.mesh.position.x -= scroll * dt
      item.mesh.scale.setScalar(0.4 + progress * 2.2)
      item.material.opacity = 0.9 * (1 - progress)
    }
    for (const item of sparks) {
      if (!item.active) continue
      item.age += dt
      const progress = item.age / SPARK_LIFE
      if (progress >= 1) {
        item.active = false
        item.mesh.visible = false
        continue
      }
      item.mesh.position.copy(item.from).addScaledVector(item.drift, item.age)
      item.mesh.scale.setScalar(Math.sin(Math.PI * progress) + 0.05)
      item.mesh.rotation.y += dt * 6
    }
  }

  /** The win beat: swoop to the lily, hover, and shake the dew over it. */
  function updateWin(dt: number): void {
    if (finishedFor < WIN_SWOOP_SECONDS) {
      const p = Math.min(1, finishedFor / WIN_SWOOP_SECONDS)
      const eased = p * p * (3 - 2 * p)
      dragonHolder.position.lerpVectors(swoopFrom, swoopTo, eased)
      dragonHolder.position.y += Math.sin(p * Math.PI) * 0.2
      dragonHolder.rotation.z = -0.4 * Math.sin(p * Math.PI)
      dragonHolder.visible = true
    } else {
      const hover = finishedFor - WIN_SWOOP_SECONDS
      dragonHolder.position.set(LILY_AT.x + Math.sin(hover * 2) * 0.04, swoopTo.y + Math.sin(hover * 5) * 0.02, LILY_AT.z)
      dragonHolder.rotation.z = Math.sin(hover * 9) * 0.12
      dragonHolder.visible = true
      if (shaken < WIN_SHAKE_DROPS && hover >= shaken * WIN_SHAKE_EVERY) {
        shaken += 1
        const object = dewTemplate.clone(true)
        object.position.set(LILY_AT.x + (Math.random() - 0.5) * 0.24, swoopTo.y - 0.08, LILY_AT.z)
        root.add(object)
        falling.push({ object, vy: 0.2, landed: false })
      }
    }
    if (wingL) wingL.rotation.x = 0.1 + Math.sin(time * 40) * 0.5
    if (wingR) wingR.rotation.x = -0.1 - Math.sin(time * 40) * 0.5
    for (const drop of falling) {
      if (drop.landed) continue
      drop.vy -= 4.5 * dt
      drop.object.position.y += drop.vy * dt
      if (drop.object.position.y <= lilyTop) {
        drop.landed = true
        drop.object.visible = false
        const at = new THREE.Vector3(drop.object.position.x, lilyTop, drop.object.position.z)
        stage.bounce(0.7)
        sfx.play('dew', 1.3)
        sparkle(at, 4)
        bursts.add(createBurst(at, {
          count: 8, colors: ['#a9e6ff', '#ffffff'], size: 0.02, speed: [0.6, 1.2], lift: 0.5, gravity: 4, seconds: 0.5, onTop: true,
        }), root)
      }
    }
    // The last drop landing makes the lily bounce and sparkle for the win.
    if (!winSparked && shaken === WIN_SHAKE_DROPS && falling.every((drop) => drop.landed)) {
      winSparked = true
      stage.bounce(1)
      sparkle(new THREE.Vector3(LILY_AT.x, lilyTop, LILY_AT.z), 14)
    }
  }

  return {
    // Dewdrops and fluff are cloned as they spawn; warm their shaders first.
    warm: [dewTemplate, fluffTemplate],
    update(dt): void {
      time += dt
      frame()
      if (!finished) {
        const scroll = updatePlaying(dt)
        updateEffects(dt, scroll)
        return
      }
      finishedFor += dt
      if (won) {
        // The world slows to a stop behind the swoop, and the dew left on the frame stays put.
        const drift = Math.max(0, 1 - finishedFor * 0.9) * scrollSpeed(playTime) * k
        for (const dew of dews) if (!dew.picked && !dew.gone) dew.x -= drift * dt
        for (const hazard of hazards) if (hazard.phase !== 'done') hazard.x -= drift * dt
        updateWin(dt)
      } else {
        // A miss: the dragonfly sinks out of the air, spinning, and drifts off the right.
        dragonY = Math.max(SKIM_TUNING.floorY - 0.02, dragonY - 0.9 * dt)
        spin = Math.min(4, spin + dt * 2)
        dragonHolder.position.set(dragonX + finishedFor * 0.6, dragonY, PLAY_Z)
        dragonHolder.rotation.z = spin * 0.8
        dragonHolder.visible = finishedFor < 0.4 || Math.floor(finishedFor * 12) % 2 === 0
      }
      updateEffects(dt, 0)
    },
    pointerDown(): void {
      held = true
    },
    pointerMove(): void {},
    pointerUp(): void {
      held = false
    },
    finish(didWin): void {
      finished = true
      won = didWin
      held = false
      finishedFor = 0
      swoopFrom.copy(dragonHolder.position)
      swoopTo.set(LILY_AT.x, lilyTop + 0.28, LILY_AT.z)
      // A fish caught mid-leap drops back into the pond.
      for (const hazard of hazards) {
        if (hazard.phase === 'leap') {
          hazard.phase = 'done'
          hazard.object.visible = false
        }
      }
    },
    /** Debug harness: where everything is, in world units, for a bot to steer by. */
    debug(): unknown {
      return {
        dragon: { x: dragonX, y: dragonY, vy: dragonVy, held, invulnerable: Math.round(invulnerable * 100) / 100 },
        scroll: scrollSpeed(playTime) * k,
        playTime,
        dew: dews.filter((dew) => !dew.picked && !dew.gone).map((dew) => ({ x: dew.x, y: dew.y })),
        hazards: hazards.filter((hazard) => hazard.phase !== 'done').map((hazard) => ({ kind: hazard.kind, phase: hazard.phase, x: hazard.x, y: hazard.y })),
        patterns: patterns.map((pattern) => ({ shape: pattern.plan.shape, picked: pattern.picked, of: pattern.plan.drops.length, missed: pattern.missed })),
        lilyTop,
      }
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      root.removeFromParent()
      if (lily) stage.scene.add(lily)
      for (const object of stageWater) object.visible = true
      for (const part of owned) part.dispose()
    },
  }
}
