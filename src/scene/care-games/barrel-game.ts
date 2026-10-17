import * as THREE from 'three'
import {
  BARREL_FLOORS, BARREL_GOPHER_X, BARREL_HERO_HEIGHT, BARREL_LADDERS, BARREL_RADIUS, BARREL_RAIN_X,
  BARREL_TOP_FLOOR, barrelSteer, createBarrelCourse, floorBeneath, floorY, ladderSpan, type Barrel, type BarrelEvent, type BarrelInput,
} from '../../game/care-barrel'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'
import { rootCritter, standInMesh } from './root-cast'

/**
 * CLIMB! The barrel climb, in a side view: a stack of sloping planks joined by
 * ladders, a grumpy gopher at the top rolling barrels down them, and the farm's
 * stolen rain barrel on a ledge above him. A little watering can starts at the
 * bottom beside the thirsty vegetable and climbs to the rain barrel, jumping the
 * barrels on the way. Every new floor is a hit; the ledge wins.
 *
 * Keys: arrows or WASD walk and climb, Space jumps. Pointer: hold to walk
 * toward your finger (it finds the ladder to the floor you point at); a quick
 * tap jumps, toward the tap if it is off to one side.
 *
 * The rules live in `src/game/care-barrel.ts`; this scene draws them.
 */

/**
 * The view: a fixed camera distance; the view height grows on narrow windows so
 * the whole stack fits, the vegetable and the compost heap included. The top
 * tenth is left clear for the HUD bar.
 */
const CAMERA_DISTANCE = 8
const VIEW_CENTRE_Y = 3.2
const MIN_VIEW_HEIGHT = 7.4
const MIN_VIEW_WIDTH = 8.6
/** The stack stands this high above the stage's lawn, so the bottom plank's low end clears the grass. */
const LEVEL_Y = 0.3
/** Depths: planks span the middle, barrels roll on them, the can and ladders stand in front. */
const PLANK_DEPTH = 0.42
const LADDER_Z = 0.24
const HERO_Z = 0.3
const PLANK_THICKNESS = 0.11
const RUNG_GAP = 0.2
const HERO_SIZE = 0.52
const BARREL_SIZE = BARREL_RADIUS * 2.1
const PLANT_HEIGHT = 1.25
/** A press shorter than this, that barely moves, is a tap (a jump). */
const TAP_SECONDS = 0.2
const TAP_PIXELS = 14

interface BarrelView {
  readonly group: THREE.Group
  readonly spin: THREE.Group
}

export function createBarrelGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts } = context
  const owned = context.owned
  const root = new THREE.Group()
  root.name = 'Barrel game'
  root.position.y = LEVEL_Y
  stage.scene.add(root)
  /** A point in the stack's space to the world, for pop-up words. */
  const toWorld = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y + LEVEL_Y, z)

  // ---- the framing: straight on, the whole stack in view whatever the window's shape.
  const frame = { position: new THREE.Vector3(0, VIEW_CENTRE_Y, CAMERA_DISTANCE), look: new THREE.Vector3(0, VIEW_CENTRE_Y, 0), fov: 45 }
  stage.setFraming((aspect) => {
    const height = Math.max(MIN_VIEW_HEIGHT, MIN_VIEW_WIDTH / Math.max(0.2, aspect))
    frame.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / CAMERA_DISTANCE))
    return frame
  })

  // ---- the planks and their ladders.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const plankMaterial = new THREE.MeshLambertMaterial({ color: '#c58a4f' })
  const plankEdge = new THREE.MeshLambertMaterial({ color: '#8e5a33' })
  const boltMaterial = new THREE.MeshLambertMaterial({ color: '#5a5560' })
  const ladderMaterial = new THREE.MeshLambertMaterial({ color: '#e0b878' })
  const ledgeMaterial = new THREE.MeshLambertMaterial({ color: '#d39c5c' })
  const boltGeometry = new THREE.SphereGeometry(0.03, 6, 4)
  owned.push(boxGeometry, plankMaterial, plankEdge, boltMaterial, ladderMaterial, ledgeMaterial, boltGeometry)
  for (const floor of BARREL_FLOORS) {
    const length = floor.x1 - floor.x0
    const midX = (floor.x0 + floor.x1) / 2
    const angle = Math.atan(floor.slope)
    const plank = new THREE.Group()
    plank.name = `Barrel plank ${floor.index}`
    plank.position.set(midX, floorY(floor, midX), 0)
    plank.rotation.z = angle
    const top = new THREE.Mesh(boxGeometry, floor.index === BARREL_TOP_FLOOR ? ledgeMaterial : plankMaterial)
    top.scale.set(length / Math.cos(angle), PLANK_THICKNESS, PLANK_DEPTH)
    top.position.y = -PLANK_THICKNESS / 2
    const under = new THREE.Mesh(boxGeometry, plankEdge)
    under.scale.set(length / Math.cos(angle), 0.05, PLANK_DEPTH * 0.9)
    under.position.y = -PLANK_THICKNESS - 0.025
    plank.add(top, under)
    // Bolts along the front edge, so a plank reads as a built beam.
    const bolts = Math.max(2, Math.floor(length / 0.55))
    for (let index = 0; index <= bolts; index += 1) {
      const bolt = new THREE.Mesh(boltGeometry, boltMaterial)
      bolt.position.set(-length / 2 + (length * index) / bolts, -PLANK_THICKNESS / 2, PLANK_DEPTH / 2 + 0.005)
      plank.add(bolt)
    }
    root.add(plank)
  }
  for (const ladder of BARREL_LADDERS) {
    const { bottomY, topY } = ladderSpan(ladder)
    const group = new THREE.Group()
    group.name = `Barrel ladder ${ladder.id}`
    group.position.set(ladder.x, bottomY, LADDER_Z)
    const height = topY - bottomY + 0.18
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(boxGeometry, ladderMaterial)
      rail.scale.set(0.04, height, 0.04)
      rail.position.set(side * 0.13, height / 2, 0)
      group.add(rail)
    }
    for (let y = RUNG_GAP * 0.6; y < height - 0.05; y += RUNG_GAP) {
      const rung = new THREE.Mesh(boxGeometry, ladderMaterial)
      rung.scale.set(0.26, 0.03, 0.03)
      rung.position.y = y
      group.add(rung)
    }
    root.add(group)
  }

  // ---- the compost heap the barrels roll into, bottom left.
  const compostMaterials = ['#5e3c26', '#6f4a30', '#7a9a48'].map((color) => new THREE.MeshLambertMaterial({ color }))
  const lumpGeometry = new THREE.SphereGeometry(1, 10, 7)
  owned.push(...compostMaterials, lumpGeometry)
  for (const [x, y, r, tone] of [[-3.35, 0, 0.5, 0], [-3.0, -0.05, 0.34, 1], [-3.7, -0.05, 0.34, 1], [-3.3, 0.36, 0.14, 2], [-3.08, 0.26, 0.11, 2]] as const) {
    const lump = new THREE.Mesh(lumpGeometry, compostMaterials[tone])
    lump.position.set(x, y - LEVEL_Y, -0.1)
    lump.scale.set(r * 1.3, r, r)
    root.add(lump)
  }

  // ---- the vegetable, thirsty on the lawn at the bottom right, past the end of the bottom plank.
  const plantHolder = new THREE.Group()
  plantHolder.name = 'Barrel vegetable'
  const PLANT_X = 3.55
  plantHolder.position.set(PLANT_X, -LEVEL_Y, -0.2)
  root.add(plantHolder)
  if (stage.plant) {
    plantHolder.add(stage.plant)
    plantHolder.scale.setScalar(PLANT_HEIGHT / Math.max(0.01, stage.plantHeight))
  }

  // ---- the rain barrel on its ledge, and the gopher with his stack of barrels.
  const barrelStandIn = standInMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 12).rotateX(Math.PI / 2), '#b57a43', owned)
  const rainBarrel = rootCritter('rainbarrel', 0.72, standInMesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 12).translate(0, 0.5, 0), '#b57a43', owned))
  rainBarrel.position.set(BARREL_RAIN_X, floorY(BARREL_FLOORS[BARREL_TOP_FLOOR], BARREL_RAIN_X), -0.05)
  root.add(rainBarrel)
  const topPlank = BARREL_FLOORS[BARREL_TOP_FLOOR - 1]
  const gopher = rootCritter('gopher', 0.78, standInMesh(new THREE.SphereGeometry(0.5, 12, 8).translate(0, 0.5, 0), '#9a6a43', owned))
  gopher.position.set(BARREL_GOPHER_X + 0.1, floorY(topPlank, BARREL_GOPHER_X + 0.1), -0.02)
  root.add(gopher)
  const arms = ['arm_L', 'arm_R'].map((name) => gopher.getObjectByName(name)).filter((arm): arm is THREE.Object3D => Boolean(arm))
  const armRest = arms.map((arm) => arm.quaternion.clone())
  // His stack: two barrels on end and one on top, behind him.
  for (const [dx, dy, upright] of [[-0.18, 0, true], [0.18, 0, true], [0, BARREL_SIZE * 1.05, false]] as const) {
    const pile = rootCritter('barrel', BARREL_SIZE, barrelStandIn, true)
    pile.position.set(BARREL_GOPHER_X + 0.3 + dx, floorY(topPlank, BARREL_GOPHER_X) + BARREL_SIZE * 0.5 + dy, -0.32)
    if (upright) pile.rotation.x = Math.PI / 2
    root.add(pile)
  }

  // ---- the can, our hero.
  const hero = new THREE.Group()
  hero.name = 'Barrel can'
  const heroBody = new THREE.Group()
  hero.add(heroBody)
  const heroModel = rootCritter('can', HERO_SIZE, standInMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12).translate(0, 0.3, 0), '#3fa59a', owned))
  heroBody.add(heroModel)
  const legs = ['leg_L', 'leg_R'].map((name) => heroModel.getObjectByName(name)).filter((leg): leg is THREE.Object3D => Boolean(leg))
  root.add(hero)
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#2f2216', transparent: true, opacity: 0.3, depthWrite: false })
  const shadowGeometry = new THREE.CircleGeometry(0.16, 16)
  owned.push(shadowMaterial, shadowGeometry)
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  root.add(shadow)

  // ---- a bobbing arrow over the next ladder up, so the way is never a puzzle.
  const arrowMaterial = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.9, depthWrite: false })
  const arrowGeometry = new THREE.ConeGeometry(0.09, 0.18, 4).rotateX(Math.PI)
  owned.push(arrowMaterial, arrowGeometry)
  const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
  arrow.name = 'Barrel next ladder'
  root.add(arrow)

  // ---- the rolling barrels, one view per barrel in play.
  const course = createBarrelCourse()
  const barrelViews = new Map<number, BarrelView>()
  function barrelView(barrel: Barrel): BarrelView {
    const existing = barrelViews.get(barrel.id)
    if (existing) return existing
    const group = new THREE.Group()
    group.name = `Barrel ${barrel.id}`
    const spin = rootCritter('barrel', BARREL_SIZE, barrelStandIn, true)
    group.add(spin)
    root.add(group)
    const view = { group, spin }
    barrelViews.set(barrel.id, view)
    return view
  }
  function dropBarrel(id: number): void {
    const view = barrelViews.get(id)
    if (!view) return
    view.group.removeFromParent()
    barrelViews.delete(id)
  }

  // ---- input.
  const keys = new Set<string>()
  const press = { down: false, at: 0, startX: 0, startY: 0, x: 0, y: 0, moved: false }
  const target = new THREE.Vector3()
  const onKeyDown = (event: KeyboardEvent): void => {
    const key = keyName(event.code)
    if (!key) return
    event.preventDefault()
    if (key === 'jump') {
      if (!event.repeat) jump(0)
      return
    }
    keys.add(key)
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const key = keyName(event.code)
    if (key) keys.delete(key)
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  function keyName(code: string): 'left' | 'right' | 'up' | 'down' | 'jump' | null {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': return 'left'
      case 'ArrowRight': case 'KeyD': return 'right'
      case 'ArrowUp': case 'KeyW': return 'up'
      case 'ArrowDown': case 'KeyS': return 'down'
      case 'Space': return 'jump'
      default: return null
    }
  }

  function jump(direction: number): void {
    if (finished) return
    if (direction !== 0) course.setInput({ move: direction, climb: 0 })
    if (course.jump()) {
      sfx.play('hopJump')
      stretch = 1
    }
  }

  function currentInput(): BarrelInput {
    const move = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)
    const climb = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0)
    if (move !== 0 || climb !== 0) return { move, climb }
    // A held finger (past a tap's length) steers toward itself.
    if (press.down && (press.moved || time - press.at > TAP_SECONDS)) {
      stage.screenToPlane(press.x, press.y, HERO_Z, target)
      return barrelSteer(course.hero, target.x, target.y - LEVEL_Y)
    }
    return { move: 0, climb: 0 }
  }

  // ---- the state of the round.
  let time = 0
  let finished = false
  let won = false
  let stretch = 0
  let squash = 0
  let walkPhase = 0
  let windup = 0
  let throwing = 0
  let tumble = 0
  let pourAge = -1
  let climbClock = 0
  const at = new THREE.Vector3()

  function handle(events: BarrelEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case 'windup':
          windup = 1
          sfx.play('grunt')
          break
        case 'spawn':
          windup = 0
          throwing = 1
          sfx.play('thud', 1.4)
          barrelView(event.barrel)
          break
        case 'land':
          sfx.play('thud', 0.9 + Math.random() * 0.3)
          at.set(event.barrel.x, event.barrel.y - BARREL_RADIUS, 0.1)
          bursts.add(createBurst(at, { count: 5, colors: ['#d8b98a', '#a07a4e'], size: 0.03, speed: [0.3, 0.9], lift: 0.4, gravity: 4, seconds: 0.4 }), root)
          break
        case 'gone':
          at.set(event.barrel.x, Math.max(0.1, event.barrel.y), 0)
          bursts.add(createBurst(at, { count: 10, colors: ['#5e3c26', '#7a9a48', '#b57a43'], size: 0.04, speed: [0.5, 1.3], lift: 0.6, gravity: 4, seconds: 0.5 }), root)
          dropBarrel(event.barrel.id)
          break
        case 'hero-land':
          sfx.play('hopLand')
          squash = 1
          break
        case 'vault': {
          const heroState = course.hero
          context.popAt(toWorld(heroState.x, heroState.y + BARREL_HERO_HEIGHT + 0.25, HERO_Z), 'HOP!', 'good')
          sfx.play('chime', 1.2)
          break
        }
        case 'bonk':
          round.harm()
          sfx.play('bonk')
          stage.shake(0.14)
          context.hitStop(0.08)
          at.set(event.barrel.x, event.barrel.y, HERO_Z)
          bursts.add(createBurst(at, { count: 16, colors: ['#b57a43', '#7f522c', '#4a4a52'], size: 0.045, speed: [0.8, 2], lift: 0.8, gravity: 5, seconds: 0.6, onTop: true }), root)
          context.popAt(toWorld(at.x, at.y, at.z), 'BONK!', 'bad')
          dropBarrel(event.barrel.id)
          break
        case 'floor': {
          round.hit()
          sfx.play('ding', 1 + event.floor * 0.06)
          const heroState = course.hero
          context.popAt(toWorld(heroState.x, heroState.y + BARREL_HERO_HEIGHT + 0.3, HERO_Z), event.floor === BARREL_TOP_FLOOR ? 'MADE IT!' : `FLOOR ${event.floor}!`, 'good', event.floor === BARREL_TOP_FLOOR)
          stage.bounce(0.2)
          break
        }
      }
      if (round.snapshot.state !== 'playing') return
    }
  }

  /** The nearest ladder up from the can's floor. */
  function nextLadder(): (typeof BARREL_LADDERS)[number] | null {
    const state = course.hero
    if (state.state === 'ladder') return null
    const ups = BARREL_LADDERS.filter((ladder) => ladder.bottom === state.floor)
    return ups.reduce<(typeof BARREL_LADDERS)[number] | null>((best, ladder) => (!best || Math.abs(ladder.x - state.x) < Math.abs(best.x - state.x) ? ladder : best), null)
  }

  /** Debug harness: the can, the barrels and the ladders, for scripted play. */
  function debugState(): unknown {
    const heroState = course.hero
    const screen = stage.toScreen(toWorld(heroState.x, heroState.y + 0.2, HERO_Z))
    const next = nextLadder()
    return {
      hero: { ...heroState, ladder: heroState.ladder?.id ?? null, screenX: screen.x, screenY: screen.y },
      barrels: course.barrels,
      next: next ? { id: next.id, x: next.x, screen: stage.toScreen(toWorld(next.x, ladderSpan(next).topY + 0.3, HERO_Z)) } : null,
      finished,
    }
  }

  return {
    get outroSeconds(): number {
      return won ? 2.2 : 1.2
    },
    update(dt): void {
      time += dt
      if (!finished && dt > 0) {
        course.setInput(currentInput())
        handle(course.step(dt))
        if (round.snapshot.state !== 'playing') return
      } else if (dt > 0) {
        // The barrels keep rolling out while the stamp comes down, and the gopher stops.
        course.setInput({ move: 0, climb: 0 })
        for (const event of course.step(dt)) if (event.kind === 'gone' || event.kind === 'bonk') dropBarrel(event.barrel.id)
      }

      // The barrels.
      const live = new Set<number>()
      for (const barrel of course.barrels) {
        live.add(barrel.id)
        const view = barrelView(barrel)
        view.group.position.set(barrel.x, barrel.y, 0.02)
        view.spin.rotation.z = -barrel.rolled / BARREL_RADIUS * barrel.dir
      }
      for (const id of [...barrelViews.keys()]) if (!live.has(id)) dropBarrel(id)

      // The can: walks, climbs, jumps, blinks after a bonk, tumbles on a loss.
      const state = course.hero
      const moving = state.state === 'ground' && Math.abs(currentInput().move) > 0 && !finished
      if (moving) walkPhase += dt * 11
      stretch = Math.max(0, stretch - dt * 6)
      squash = Math.max(0, squash - dt * 7)
      hero.position.set(state.x, state.y, HERO_Z)
      const climbing = state.state === 'ladder'
      if (climbing && Math.abs(currentInput().climb) > 0 && !finished) {
        walkPhase += dt * 9
        climbClock -= dt
        if (climbClock <= 0) {
          climbClock = 0.22
          sfx.play('climb', 0.9 + Math.random() * 0.2)
        }
      }
      // Facing: spout first while walking (mirrored to walk left), square on while climbing.
      heroBody.scale.set(
        (climbing ? 1 : state.facing) * (1 - stretch * 0.1 + squash * 0.18),
        1 + stretch * 0.2 - squash * 0.22,
        1 - stretch * 0.1 + squash * 0.18,
      )
      heroBody.position.x = climbing ? Math.sin(walkPhase) * 0.03 : 0
      heroBody.position.y = moving ? Math.abs(Math.sin(walkPhase)) * 0.03 : 0
      heroBody.rotation.z = finished && !won ? tumble * Math.PI * 0.5 * state.facing : moving ? Math.sin(walkPhase) * 0.06 : 0
      legs.forEach((leg, index) => {
        leg.rotation.z = (moving || climbing ? Math.sin(walkPhase + index * Math.PI) * 0.6 : 0)
      })
      hero.visible = finished || state.blink <= 0 || Math.floor(time * 12) % 2 === 0
      const under = floorBeneath(state.x, state.y + 0.01)
      const footing = under ? floorY(under, state.x) : -1
      shadow.visible = footing > -1 && !climbing
      shadow.position.set(state.x, footing + 0.006, HERO_Z - 0.05)
      shadow.scale.setScalar(Math.max(0.4, 1 - (state.y - footing) * 1.2))
      if (finished && !won) tumble = Math.min(1, tumble + dt * 3)

      // The next ladder's arrow.
      const next = finished ? null : nextLadder()
      arrow.visible = Boolean(next)
      if (next) arrow.position.set(next.x, ladderSpan(next).bottomY + 0.75 + Math.sin(time * 5) * 0.06, LADDER_Z + 0.05)

      // The gopher: winds up, throws, and stomps about; he topples off when the can wins.
      windup = Math.max(0, windup - dt * 0.5)
      throwing = Math.max(0, throwing - dt * 4)
      const lift = windup > 0 ? 1.2 : 0
      arms.forEach((arm, index) => {
        const side = index === 0 ? 1 : -1
        arm.quaternion.copy(armRest[index]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-lift + throwing * 1.6, 0, side * (lift * 0.4 + Math.sin(time * 3 + index) * 0.08))))
      })
      if (finished && won) {
        gopher.rotation.z = Math.min(1.4, gopher.rotation.z + dt * 2.2)
        gopher.position.y -= dt * 0.4
      } else {
        gopher.rotation.z = Math.sin(time * 2) * 0.05
        gopher.position.y = floorY(topPlank, BARREL_GOPHER_X + 0.1) + (windup > 0 ? Math.abs(Math.sin(time * 14)) * 0.03 : 0)
      }

      // The win: the rain barrel tips water down the stack onto the vegetable.
      if (pourAge >= 0) {
        pourAge += dt
        rainBarrel.rotation.z = Math.min(0.5, pourAge * 1.5)
        if (Math.floor((pourAge - dt) * 10) !== Math.floor(pourAge * 10) && pourAge < 2.2) {
          const fall = Math.min(1, pourAge / 1.2)
          at.set(THREE.MathUtils.lerp(BARREL_RAIN_X + 0.4, PLANT_X, fall), THREE.MathUtils.lerp(5.1, 1.2, fall), 0.2)
          bursts.add(createBurst(at, { count: 8, colors: ['#5ab4e0', '#a8dcf2', '#ffffff'], size: 0.05, speed: [0.3, 0.9], lift: 0.1, gravity: 6, seconds: 0.7, onTop: true }), root)
          if (fall >= 1) stage.bounce(0.5)
        }
      }
    },
    pointerDown(x, y): void {
      press.down = true
      press.at = time
      press.startX = x
      press.startY = y
      press.x = x
      press.y = y
      press.moved = false
    },
    pointerMove(x, y): void {
      if (!press.down) return
      press.x = x
      press.y = y
      if (Math.hypot(x - press.startX, y - press.startY) > TAP_PIXELS) press.moved = true
    },
    pointerUp(): void {
      if (!press.down) return
      press.down = false
      if (press.moved || time - press.at > TAP_SECONDS) return
      // A tap jumps: straight up over a barrel, or toward a tap well off to one side.
      stage.screenToPlane(press.x, press.y, HERO_Z, target)
      const dx = target.x - course.hero.x
      jump(Math.abs(dx) > 0.45 ? Math.sign(dx) : 0)
    },
    finish(didWin): void {
      finished = true
      won = didWin
      keys.clear()
      press.down = false
      course.stopBarrels()
      if (didWin) {
        pourAge = 0
        sfx.play('pour')
        const top = new THREE.Vector3(BARREL_RAIN_X, floorY(BARREL_FLOORS[BARREL_TOP_FLOOR], BARREL_RAIN_X) + 0.8, 0.3)
        bursts.add(createBurst(top, { count: 22, colors: ['#fff3b0', '#ffd24a', '#a8dcf2'], size: 0.05, speed: [0.8, 2], lift: 0.8, gravity: 2.5, seconds: 1, shape: 'star', onTop: true }), root)
      } else {
        sfx.play('harm')
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
