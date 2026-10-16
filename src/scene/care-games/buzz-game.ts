import * as THREE from 'three'
import { CARE_GAME_RULES } from '../../game/care-minigames'
import {
  BUZZ, beeX as viewBeeX, chimePitch, createBuzzRun, flapBee, flapTilt, stepBee, stepBuzz,
  type BeeState, type BuzzRun, type BuzzView,
} from '../../game/care-buzz'
import { cloneCastCritter } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * BUZZ! A bumblebee carrying a fat dewdrop flies right through the stem gaps
 * toward the player's flower, which stands at the right edge of the course and
 * grows nearer as gaps are cleared. Tap (or Space) to flap: each tap sets the
 * bee's climb at once and gravity brings it back down. Fly a gap clean and the
 * pair scores; bonk a stem or the lawn and you lose a heart and blink for a
 * second.
 *
 * The flight is pure (`src/game/care-buzz.ts`, tested without a browser). This
 * scene draws it on the stage's z = 0 plane: stems in front, a meadow of tufts
 * behind that scrolls slower. It also plays the two finish beats: the bee
 * delivers the dewdrop onto the flower (a win), or tumbles onto the lawn (a loss).
 */

/** The bee is in front of the stems; the flower stands behind them and steps forward as it grows. */
const BEE_Z = 0.45
const FLOWER_Z_FAR = -0.5
const FLOWER_Z_NEAR = 0.1
const FLOWER_GROWTH_FAR = 0.8
/** The flower's place on the course: this share of the view from its left edge. */
const FLOWER_AT = 0.84
/** The bee's drawn length, in world units (its model is about 0.18 m). */
const BEE_LENGTH = 0.27
/** The view height the course is designed for (world units at 1280x720); other aspects zoom to match it. */
const REFERENCE_VIEW_HEIGHT = 1.88
const FOREGROUND_PERIOD = 5.4
const FOREGROUND_SPACING = 0.3
const FOREGROUND_ROWS = Math.round(FOREGROUND_PERIOD / FOREGROUND_SPACING)
/** The dewdrop hangs this far under the bee's centre (in model units, before the bee's scale). */
const BEE_DROP_HANG = 0.11
/** Stem pairs drawn at once: the course holds at most about four on screen. */
const STEM_SLOTS = 6
const BONK_SPIN_SECONDS = 0.45
const DELIVER_SECONDS = 0.8
const DROP_AT = 0.85
const LOOP_SECONDS = 0.6
const DEW_GRAVITY = 3.5
const HEART_SECONDS = 1.1
const FAR_PERIOD = 8.4
const FAR_SPACING = 0.6
const FAR_SPEED = 0.4
const TUFT_ROWS = Math.round(FAR_PERIOD / FAR_SPACING)
const SUBSTEP = 1 / 60
const MAX_FRAME = 0.25

type Mode = 'play' | 'win' | 'lose'

interface StemSlot {
  readonly root: THREE.Group
  readonly low: THREE.Mesh
  readonly lowHead: THREE.Mesh
  readonly high: THREE.Mesh
  readonly highHead: THREE.Mesh
  /** The run's stem index on this slot, or null when the slot is free. */
  index: number | null
}

interface Heart {
  readonly mesh: THREE.Mesh
  readonly material: THREE.MeshBasicMaterial
  age: number
  readonly velocity: THREE.Vector3
}

/** What the browser debug harness reads (only with ?gardenDebug=1). */
export interface BuzzDebug {
  readonly mode: Mode
  readonly beeX: number
  readonly beeY: number
  readonly beeVy: number
  readonly bonks: number
  readonly cleared: number
  readonly invulnerable: number
  readonly stems: ReadonlyArray<{ index: number; x: number; bottom: number; top: number; touched: boolean; cleared: boolean }>
}

// Set by the build: false in production, so the debug accessor below is folded away.
declare const __GARDEN_DEBUG__: boolean

declare global {
  interface Window {
    __buzzGame?: { read(): BuzzDebug | null }
  }
}

export function createBuzzGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const goal = CARE_GAME_RULES.buzz.goal
  const root = new THREE.Group()
  root.name = 'Buzz game'
  stage.scene.add(root)
  // GPU parts go on the player's shelf; it frees them once the next round is ready.
  const owned: Array<{ dispose(): void }> = context.owned

  // ---- stems: a pool of pairs. A poppy stalk stands up from the lawn, a grass blade hangs down from the top.
  const stemMaterial = new THREE.MeshLambertMaterial({ color: '#2d5a2a' })
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: '#4f8a3a' })
  const poppyMaterial = new THREE.MeshLambertMaterial({ color: '#e4572e' })
  // Unit-height cylinders: lower ones grow up from y = 0, upper ones hang down from their pivot.
  const lowStemGeometry = new THREE.CylinderGeometry(0.075, 0.09, 1, 10).translate(0, 0.5, 0)
  const highStemGeometry = new THREE.CylinderGeometry(0.075, 0.065, 1, 10).translate(0, -0.5, 0)
  const poppyGeometry = new THREE.SphereGeometry(0.095, 14, 10)
  const bladeGeometry = new THREE.SphereGeometry(0.07, 12, 9)
  owned.push(stemMaterial, bladeMaterial, poppyMaterial, lowStemGeometry, highStemGeometry, poppyGeometry, bladeGeometry)
  const slots: StemSlot[] = []
  for (let index = 0; index < STEM_SLOTS; index += 1) {
    const slotRoot = new THREE.Group()
    slotRoot.name = 'Buzz stem pair'
    slotRoot.visible = false
    const low = new THREE.Mesh(lowStemGeometry, stemMaterial)
    low.name = 'Buzz stem'
    const lowHead = new THREE.Mesh(poppyGeometry, poppyMaterial)
    lowHead.name = 'Buzz poppy head'
    const high = new THREE.Mesh(highStemGeometry, bladeMaterial)
    high.name = 'Buzz grass stem'
    const highHead = new THREE.Mesh(bladeGeometry, bladeMaterial)
    highHead.name = 'Buzz grass blade'
    slotRoot.add(low, lowHead, high, highHead)
    root.add(slotRoot)
    slots.push({ root: slotRoot, low, lowHead, high, highHead, index: null })
  }

  // ---- the meadow behind: a row of tufts that scrolls slower than the stems.
  const tuftGeometry = new THREE.SphereGeometry(1, 12, 8)
  const tuftMaterials = ['#7fb862', '#94c46e'].map((color) => new THREE.MeshLambertMaterial({ color }))
  owned.push(tuftGeometry, ...tuftMaterials)
  const tufts: Array<{ mesh: THREE.Mesh; row: number }> = []
  for (let row = 0; row < TUFT_ROWS; row += 1) {
    const mesh = new THREE.Mesh(tuftGeometry, tuftMaterials[row % 2])
    mesh.name = 'Buzz meadow tuft'
    mesh.scale.set(0.34 + (row % 3) * 0.06, 0.22 + (row % 4) * 0.05, 0.16)
    mesh.position.z = -2.3
    root.add(mesh)
    tufts.push({ mesh, row })
  }
  let meadowScroll = 0
  // Foreground grass in front of the stems: it fills the lawn band below the course and moves faster than the stems.
  const grassGeometry = new THREE.SphereGeometry(1, 10, 6)
  const grassMaterial = new THREE.MeshLambertMaterial({ color: '#3f7a35' })
  owned.push(grassGeometry, grassMaterial)
  const grass: Array<{ mesh: THREE.Mesh; row: number }> = []
  for (let row = 0; row < FOREGROUND_ROWS; row += 1) {
    const mesh = new THREE.Mesh(grassGeometry, grassMaterial)
    mesh.name = 'Buzz foreground grass'
    mesh.scale.set(0.22 + (row % 2) * 0.06, 0.3 + (row % 3) * 0.08, 0.12)
    mesh.position.set(0, -0.4, 0.9)
    root.add(mesh)
    grass.push({ mesh, row })
  }
  let grassScroll = 0

  // ---- the bee: a rig for its place, a tilt-and-loop group, and a spin group for the bonk roll.
  const rig = new THREE.Group()
  rig.name = 'Buzz bee'
  const aero = new THREE.Group()
  const spin = new THREE.Group()
  rig.add(aero)
  aero.add(spin)
  root.add(rig)
  const bee = cloneCastCritter('flower', 'bee')
  const wings = bee ? ['wing_L', 'wing_R'].map((name) => bee.getObjectByName(name)).filter((wing): wing is THREE.Object3D => !!wing) : []
  // The bee's own dewdrop is part of its model; it is hidden when the drop leaves the bee.
  const ownDrops: THREE.Object3D[] = []
  let beeScale = 1
  if (bee) {
    spin.add(bee)
    const size = new THREE.Box3().setFromObject(bee).getSize(new THREE.Vector3())
    beeScale = BEE_LENGTH / Math.max(0.01, size.x)
    bee.scale.setScalar(beeScale)
    bee.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const material = object.material as THREE.Material
      if (material.name.toLowerCase().includes('dewdrop')) ownDrops.push(object)
    })
  }
  const dewdrop = cloneCastCritter('flower', 'dewdrop')
  if (dewdrop) {
    dewdrop.scale.setScalar(beeScale * 1.35)
    dewdrop.visible = false
    root.add(dewdrop)
  }

  // ---- hearts: a berry-blue heart drops from the bee on each bonk, and fades.
  const heartShape = new THREE.Shape()
  heartShape.moveTo(0, -0.5)
  heartShape.bezierCurveTo(-0.6, -0.05, -0.45, 0.6, 0, 0.25)
  heartShape.bezierCurveTo(0.45, 0.6, 0.6, -0.05, 0, -0.5)
  const heartGeometry = new THREE.ShapeGeometry(heartShape).scale(0.1, 0.1, 0.1)
  owned.push(heartGeometry)
  const hearts: Heart[] = [0, 1].map(() => {
    const material = new THREE.MeshBasicMaterial({ color: '#e0557a', transparent: true, depthWrite: false })
    const mesh = new THREE.Mesh(heartGeometry, material)
    mesh.name = 'Buzz heart'
    mesh.visible = false
    root.add(mesh)
    return { mesh, material, age: HEART_SECONDS, velocity: new THREE.Vector3() }
  })

  // ---- the flower: the player's plant, moved to the course's right edge and grown as the course clears.
  const plant = stage.plant
  const plantModel = plant?.children[0] ?? null
  const plantBase = { x: plant?.position.x ?? 0, z: plant?.position.z ?? 0, scale: plantModel?.scale.x ?? 1 }
  let growth = FLOWER_GROWTH_FAR
  let flowerX = 0
  let flowerTop = 0

  // ---- the run: the flight, stems and bonks, from the pure module.
  const run: BuzzRun = createBuzzRun()
  let mode: Mode = 'play'
  let modeTime = 0
  let started = false
  let view: BuzzView = { left: -1, width: 2, top: 1 }
  // The course is drawn at this zoom (its physics stay in fixed units): tall phones zoom in to the same playfield.
  let zoom = 1
  let spinTime = -1
  let wingPhase = 0
  let wingBoost = 0
  let heartIndex = 0
  // The delivery: where the bee started its approach, whether the drop is off, and when the splash landed.
  let deliverFrom = new THREE.Vector3()
  let dropped = false
  let splashTime = -1
  // The dewdrop on its own fall (after a delivery or a loss).
  const dew = { falling: false, x: 0, y: 0, z: 0, velocity: 0 }
  // The loss: the bee's fall, once it has landed.
  let beeFall: BeeState = { y: BUZZ.floor, vy: 0 }
  let landed = false

  function measure(): void {
    const width = innerWidth
    const height = innerHeight
    const left = stage.screenToPlane(0, height / 2, 0).x
    const right = stage.screenToPlane(width, height / 2, 0).x
    const top = stage.screenToPlane(width / 2, 0, 0).y
    const bottom = stage.screenToPlane(width / 2, height, 0).y
    zoom = Math.min(2.4, Math.max(0.6, (top - bottom) / REFERENCE_VIEW_HEIGHT))
    // Physics view in fixed units: the screen divided by the zoom.
    view = { left: left / zoom, width: (right - left) / zoom, top: top / zoom }
    flowerX = view.left + view.width * FLOWER_AT
    flowerTop = stage.plantHeight * growth
    root.scale.setScalar(zoom)
  }

  /** A physics point as a world point (for text, and anything outside the zoomed root). */
  function toWorld(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x * zoom, y * zoom, z * zoom)
  }

  /** The flower's place and size: it stands at the right edge and steps nearer as it grows. */
  function placeFlower(): void {
    if (!plant) return
    const progress = Math.min(1, Math.max(0, (growth - FLOWER_GROWTH_FAR) / (1 - FLOWER_GROWTH_FAR)))
    plant.position.x = flowerX * zoom
    plant.position.z = (FLOWER_Z_FAR + (FLOWER_Z_NEAR - FLOWER_Z_FAR) * progress) * zoom
    if (plantModel) plantModel.scale.setScalar(plantBase.scale * growth * zoom)
  }

  function dropCentre(): THREE.Vector3 {
    return rig.position.clone().add(new THREE.Vector3(0, -BEE_DROP_HANG * beeScale, 0))
  }

  /** The bee's own drop comes off: the falling dewdrop takes its place. */
  function releaseDrop(x: number, y: number, z: number): void {
    for (const drop of ownDrops) drop.visible = false
    if (!dewdrop) return
    dew.falling = true
    dew.velocity = 0
    dew.x = x
    dew.y = y
    dew.z = z
    dewdrop.position.set(x, y, z)
    dewdrop.visible = true
  }

  function burst(position: THREE.Vector3, colors: string[], count: number, scale: number, shape: 'blob' | 'star' = 'blob'): void {
    bursts.add(createBurst(position.clone(), {
      count, colors, size: 0.04 * scale, speed: [0.8 * scale, 1.9 * scale], lift: 0.5, gravity: 4, seconds: 0.8, shape, onTop: true,
    }), root)
  }

  function bonk(kind: 'stem' | 'floor'): void {
    round.harm()
    sfx.play('bonk')
    stage.shake(0.22)
    context.hitStop(0.07)
    context.popAt(toWorld(rig.position.x, rig.position.y + 0.2, rig.position.z), kind === 'floor' ? 'OUCH!' : 'BONK!', 'bad', true)
    spinTime = 0
    wingBoost = 0
    const heart = hearts[Math.min(heartIndex, hearts.length - 1)]
    heartIndex += 1
    heart.age = 0
    heart.material.opacity = 1
    heart.mesh.visible = true
    heart.mesh.position.copy(rig.position).add(new THREE.Vector3(0, 0.12, 0.1))
    heart.velocity.set(kind === 'floor' ? 0 : 0.35, 0.6, 0)
  }

  function cleared(stemX: number, gapCentre: number, streak: number): void {
    sfx.play('chime', chimePitch(streak))
    context.popAt(toWorld(stemX, gapCentre, 0.25), '+1', 'good', streak >= 3)
    burst(new THREE.Vector3(stemX, gapCentre, 0.2), ['#fff3b0', '#ffd166', '#ffffff'], 10, 0.5, 'star')
    context.hitStop(0.03)
    stage.bounce(0.25)
    stage.sparkle()
  }

  /** Keep one pooled pair for each stem the run holds, and free the rest. */
  function syncStems(): void {
    for (const slot of slots) {
      if (slot.index !== null && !run.stems.some((stem) => stem.index === slot.index)) {
        slot.index = null
        slot.root.visible = false
      }
    }
    const above = view.top + 0.3
    for (const stem of run.stems) {
      let slot = slots.find((candidate) => candidate.index === stem.index)
      if (!slot) slot = slots.find((candidate) => candidate.index === null)
      if (!slot) continue
      slot.index = stem.index
      const { gap } = stem
      slot.root.visible = true
      slot.root.position.set(stem.x, 0, 0)
      slot.low.scale.set(1, Math.max(0.01, gap.bottom), 1)
      slot.lowHead.position.set(0, gap.bottom + 0.01, 0)
      slot.lowHead.scale.set(1.15, 0.7, 0.55)
      slot.high.position.set(0, above, 0)
      slot.high.scale.set(1, Math.max(0.01, above - gap.top), 1)
      slot.highHead.position.set(0, gap.top + 0.02, 0)
      slot.highHead.scale.set(0.45, 1.7, 0.3)
    }
  }

  /** The wings beat fast, faster on a flap; the bonk spin and the blink are set here too. */
  function updateBee(dt: number, beating: boolean): void {
    wingBoost = Math.max(0, wingBoost - dt)
    if (beating) wingPhase += dt * (34 + wingBoost * 110)
    const flap = 0.55 + 0.38 * Math.sin(wingPhase)
    wings.forEach((wing, index) => { wing.rotation.x = (index ? -1 : 1) * flap })
    if (spinTime >= 0) {
      spinTime += dt
      spin.rotation.x = Math.min(1, spinTime / BONK_SPIN_SECONDS) * Math.PI * 2
      if (spinTime >= BONK_SPIN_SECONDS) {
        spinTime = -1
        spin.rotation.x = 0
      }
    }
    const blinking = mode === 'play' && run.invulnerable > 0 && Math.floor(run.invulnerable / 0.08) % 2 === 1
    rig.visible = !blinking
  }

  function updatePlay(dt: number): void {
    let remaining = dt
    while (remaining > 1e-6 && mode === 'play') {
      const step = Math.min(remaining, SUBSTEP)
      remaining -= step
      const result = stepBuzz(run, step, view, false, Math.random, goal)
      if (result.bonk) bonk(result.bonk)
      for (const stem of result.cleared) cleared(stem.x, stem.gap.centre, round.hit())
      if (round.snapshot.state !== 'playing') break
    }
    rig.position.set(viewBeeX(view), run.bee.y, BEE_Z)
    aero.rotation.z = flapTilt(run.bee.vy)
    // The flower grows nearer with each clear.
    const target = FLOWER_GROWTH_FAR + (1 - FLOWER_GROWTH_FAR) * (round.snapshot.hits / goal)
    growth += (target - growth) * Math.min(1, dt * 6)
  }

  function updateWin(dt: number): void {
    if (modeTime < DELIVER_SECONDS) {
      const u = modeTime / DELIVER_SECONDS
      const ease = u * u * (3 - 2 * u)
      const target = new THREE.Vector3(flowerX, flowerTop + 0.28, FLOWER_Z_NEAR + 0.3)
      rig.position.lerpVectors(deliverFrom, target, ease)
      rig.position.y += Math.sin(Math.PI * u) * 0.12
      aero.rotation.z = flapTilt(0)
    }
    if (!dropped && modeTime >= DROP_AT) {
      dropped = true
      const drop = dropCentre()
      releaseDrop(flowerX, drop.y, FLOWER_Z_NEAR + 0.3)
    }
    if (dew.falling && dewdrop) {
      dew.velocity += DEW_GRAVITY * dt
      dew.y -= dew.velocity * dt
      dewdrop.position.set(dew.x, dew.y, dew.z)
      if (dew.y <= flowerTop) {
        dew.falling = false
        dewdrop.visible = false
        const landing = new THREE.Vector3(flowerX, flowerTop, FLOWER_Z_NEAR + 0.1)
        burst(landing, ['#bfe9ff', '#ffffff', '#7cc7ff'], 28, 1.1)
        sfx.play('splash')
        stage.bounce(1)
        stage.sparkle()
        context.popAt(toWorld(landing.x, landing.y + 0.1, landing.z), 'SPLASH!', 'good', true)
        splashTime = modeTime
      }
    }
    if (splashTime >= 0 && modeTime - splashTime < LOOP_SECONDS) {
      // A loop-the-loop of joy after the splash.
      aero.rotation.z = -((modeTime - splashTime) / LOOP_SECONDS) * Math.PI * 2
    } else if (splashTime >= 0) {
      aero.rotation.z = 0
      rig.position.y = flowerTop + 0.28 + Math.sin(modeTime * 3) * 0.03
    }
    wingBoost = Math.max(wingBoost, 0.05)
    updateBee(dt, true)
  }

  function updateLose(dt: number): void {
    if (!landed) {
      beeFall = stepBee(beeFall, dt)
      if (beeFall.y <= BUZZ.floor) {
        beeFall = { y: BUZZ.floor, vy: 0 }
        landed = true
        sfx.play('squish')
        stage.shake(0.12)
      }
      rig.position.set(viewBeeX(view), beeFall.y, BEE_Z)
      spin.rotation.x += dt * 9
      aero.rotation.z = -Math.min(1.1, modeTime * 1.5)
    } else {
      spin.rotation.x = 0
      aero.rotation.z = -1.1
    }
    if (dew.falling && dewdrop) {
      dew.velocity += DEW_GRAVITY * dt
      dew.y -= dew.velocity * dt
      if (dew.y <= 0) {
        dew.falling = false
        dewdrop.visible = true
        dewdrop.position.set(dew.x, 0, dew.z)
        burst(new THREE.Vector3(dew.x, 0.02, dew.z), ['#bfe9ff', '#ffffff'], 10, 0.6)
        sfx.play('splash')
      } else {
        dewdrop.position.set(dew.x, dew.y, dew.z)
      }
    }
    updateBee(dt, !landed)
  }

  /** A flap: the next step climbs the bee at once. Only while the bee is flying. */
  function flap(): boolean {
    if (!started || mode !== 'play') return false
    // The climb is set at once, so the tap is not held for a frame.
    run.bee = flapBee(run.bee)
    wingBoost = 0.3
    burst(new THREE.Vector3(rig.position.x, rig.position.y - 0.05, BEE_Z), ['#ffffff', '#fff3c4'], 6, 0.35, 'blob')
    sfx.play('flap')
    return true
  }

  // Space and Up flap too; a held key repeats nothing.
  const onKey = (event: KeyboardEvent): void => {
    if (event.repeat || (event.key !== ' ' && event.key !== 'ArrowUp')) return
    if (!flap()) return
    event.preventDefault()
  }
  window.addEventListener('keydown', onKey)

  // The debug harness reads the flight from here (only in a ?gardenDebug=1 dev build).
  const debugOn = __GARDEN_DEBUG__ && new URLSearchParams(window.location.search).has('gardenDebug')
  const debugRead = (): BuzzDebug => ({
    mode,
    beeX: viewBeeX(view),
    beeY: run.bee.y,
    beeVy: run.bee.vy,
    bonks: run.bonks,
    cleared: run.cleared,
    invulnerable: run.invulnerable,
    stems: run.stems.map((stem) => ({ index: stem.index, x: stem.x, bottom: stem.gap.bottom, top: stem.gap.top, touched: stem.touched, cleared: stem.cleared })),
  })
  if (debugOn) window.__buzzGame = { read: debugRead }

  return {
    update(rawDt): void {
      const dt = Math.min(rawDt, MAX_FRAME)
      started = true
      measure()
      modeTime += dt
      meadowScroll += dt * (view.width / BUZZ.crossSeconds) * FAR_SPEED
      for (const tuft of tufts) {
        const offset = tuft.row * FAR_SPACING - meadowScroll
        const wrapped = ((offset % FAR_PERIOD) + FAR_PERIOD) % FAR_PERIOD
        tuft.mesh.position.x = view.left - FAR_SPACING + wrapped
      }
      grassScroll += dt * (view.width / BUZZ.crossSeconds) * 1.3
      for (const blade of grass) {
        const offset = blade.row * FOREGROUND_SPACING - grassScroll
        const wrapped = ((offset % FOREGROUND_PERIOD) + FOREGROUND_PERIOD) % FOREGROUND_PERIOD
        blade.mesh.position.x = view.left - FOREGROUND_SPACING + wrapped
      }

      if (mode === 'play') {
        updatePlay(dt)
        updateBee(dt, true)
      } else if (mode === 'win') {
        updateWin(dt)
      } else {
        updateLose(dt)
      }
      placeFlower()
      syncStems()

      for (const heart of hearts) {
        if (!heart.mesh.visible) continue
        heart.age += dt
        heart.velocity.y -= 2.2 * dt
        heart.mesh.position.addScaledVector(heart.velocity, dt)
        heart.mesh.rotation.z += dt * 2
        heart.material.opacity = Math.max(0, 1 - heart.age / HEART_SECONDS)
        if (heart.age >= HEART_SECONDS) heart.mesh.visible = false
      }
    },
    pointerDown(): void {
      flap()
    },
    pointerMove(): void {},
    pointerUp(): void {},
    finish(won): void {
      if (mode !== 'play') return
      modeTime = 0
      if (won) {
        mode = 'win'
        deliverFrom = rig.position.clone()
      } else {
        mode = 'lose'
        beeFall = { y: run.bee.y, vy: 0 }
        releaseDrop(rig.position.x, dropCentre().y, rig.position.z)
      }
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey)
      if (debugOn) delete window.__buzzGame
      root.removeFromParent()
      if (plant) {
        plant.position.x = plantBase.x
        plant.position.z = plantBase.z
      }
      if (plantModel) plantModel.scale.setScalar(plantBase.scale)
      for (const heart of hearts) heart.material.dispose()
    },
  }
}
