import * as THREE from 'three'
import type { BalloonAnimal, FlightPose } from '../animals/balloon-animal'
import {
  createOwlFlight,
  owlVisible,
  stepOwl,
  type OwlFlight,
  type OwlPhase,
  type OwlWorld,
  type Point3,
  type PreyView,
} from '../game/predator'

/**
 * Drives every owl each frame: gathers who is prey, steps the pure flight sim in
 * `src/game/predator.ts`, and applies the result to the balloon animal. It also
 * panics the chicken being stalked, and hands a catch back to the caller, who
 * owns removing the chicken from the farm.
 */
export interface HuntOwl {
  readonly animal: BalloonAnimal
  /** Where the owl first turns up, out at the tents. */
  readonly carnivalSpawn: readonly [number, number]
  readonly stage: number
  /** The perch assigned to this owl, if the farm has an oak. */
  readonly roost: (Point3 & { readonly rotationY: number }) | null
  /** A resident with no oak to roost on: it stays aloft and slowly loses helium. */
  readonly stranded: boolean
}

export interface HuntContext {
  readonly night: boolean
  readonly owls: readonly HuntOwl[]
  /** Adult resident chickens: the whole flock, targetable or not. */
  readonly prey: readonly { readonly animal: BalloonAnimal; readonly targetable: boolean }[]
  /** Half-extents of the farm plot, which the patrol loop stays inside. */
  readonly farm: { readonly halfWidth: number; readonly halfDepth: number }
}

export interface HuntCatch {
  readonly owl: BalloonAnimal
  readonly prey: BalloonAnimal
}

export interface HuntResult {
  readonly catches: readonly HuntCatch[]
  /** Owls whose helium ran out this frame. They pop; the caller removes them. */
  readonly deflated: readonly BalloonAnimal[]
}

export interface HuntReport {
  readonly owls: readonly { readonly id: string; readonly phase: OwlPhase; readonly x: number; readonly y: number; readonly z: number; readonly preyId: string | null; readonly cooldown: number; readonly helium: number; readonly visible: boolean }[]
}

export interface OwlHunt {
  update(deltaSeconds: number, context: HuntContext): HuntResult
  /** Chickens an owl is stalking right now; the scene keeps these in full detail. */
  huntedIds(): ReadonlySet<string>
  /** Debug: make an owl hunt as soon as it can. */
  hurry(): void
  /** Debug: set every owl's helium (0..1). */
  setHelium(level: number): void
  /** Forget every owl's flight and calm every chicken, as when the farm is reset. */
  reset(): void
  report(): HuntReport
  dispose(): void
}

/**
 * A perched owl turns to face the camera, which looks in from the south-east
 * (+x, +z), so its face is the first thing you see on the oak.
 */
const PERCH_HEADING = Math.atan2(-94, 70)

/** How the clip and playback speed follow the flight phase. A balloon barely flaps. */
function poseFor(flight: OwlFlight, roostRotation: number | null): Pick<FlightPose, 'clip' | 'rate' | 'heading' | 'pitch'> {
  const folded = flight.phase === 'roost' || flight.phase === 'dive'
  const heading = flight.phase === 'roost' && roostRotation !== null ? roostRotation : flight.heading
  const rate = folded ? 1 : Math.max(0.35, 0.3 + flight.flap * 1.1)
  // A flying balloon leans back a touch; a stooping one points its beak at the ground.
  const pitch = flight.phase === 'patrol' ? 0.08 + flight.pitch * 0.5 : flight.pitch
  return { clip: folded ? 'IDLE' : 'WALK', rate, heading, pitch }
}

export function createOwlHunt(parent: THREE.Object3D, groundY: number): OwlHunt {
  const flights = new Map<string, OwlFlight>()
  const alarmed = new Map<string, BalloonAnimal>()
  const hunted = new Set<string>()
  /** Debug: helium handed to any owl whose flight has not started yet. */
  let startingHelium: number | null = null
  /** The heading each owl is actually wearing, eased toward what the sim wants. */
  const shownHeading = new Map<string, number>()
  const shadows = new Map<string, THREE.Mesh>()
  const shadowGeometry = new THREE.CircleGeometry(1, 28)
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#16202a', transparent: true, opacity: 0.0, depthWrite: false })

  const shadowFor = (id: string): THREE.Mesh => {
    let shadow = shadows.get(id)
    if (!shadow) {
      // Each owl fades its own shadow, so each needs its own material.
      shadow = new THREE.Mesh(shadowGeometry, shadowMaterial.clone())
      shadow.name = 'Owl flight shadow'
      shadow.rotation.x = -Math.PI / 2
      shadow.renderOrder = 4
      parent.add(shadow)
      shadows.set(id, shadow)
    }
    return shadow
  }

  function flightFor(owl: HuntOwl): OwlFlight {
    let flight = flights.get(owl.animal.instanceId)
    if (!flight) {
      flight = createOwlFlight()
      // Start the loop somewhere different for each owl so a pair never overlap.
      flight.orbit = flights.size * 2.4
      if (startingHelium !== null) flight.helium = startingHelium
      flights.set(owl.animal.instanceId, flight)
    }
    return flight
  }

  function calm(preyId: string): void {
    const animal = alarmed.get(preyId)
    animal?.setAlarmed(false)
    alarmed.delete(preyId)
    hunted.delete(preyId)
  }

  return {
    update(deltaSeconds, context) {
      const catches: HuntCatch[] = []
      const deflated: BalloonAnimal[] = []
      const preyViews: PreyView[] = context.prey.map(({ animal, targetable }) => ({
        id: animal.instanceId,
        x: animal.currentPosition.x,
        z: animal.currentPosition.z,
        targetable,
      }))
      const preyById = new Map(context.prey.map(({ animal }) => [animal.instanceId, animal]))

      for (const owl of context.owls) {
        const flight = flightFor(owl)
        const visitor = owl.stage <= 1
        const center = visitor
          ? { x: owl.carnivalSpawn[0], z: owl.carnivalSpawn[1] }
          : { x: 0, z: 0 }
        const radius = visitor
          ? { x: 7, z: 5 }
          : { x: Math.max(4, context.farm.halfWidth * 0.62), z: Math.max(3, context.farm.halfDepth * 0.62) }
        const world: OwlWorld = {
          night: context.night,
          // Only a resident has a perch of its own; a visitor leaves at dawn.
          roost: owl.stage >= 3 && owl.roost ? { x: owl.roost.x, y: owl.roost.y, z: owl.roost.z } : null,
          center,
          radius,
          huntAllowed: owl.stage >= 2,
          prey: preyViews,
          present: owl.stage > 0 && !owl.animal.isSold,
          stranded: owl.stranded,
        }
        const events = stepOwl(flight, world, deltaSeconds)
        for (const event of events) {
          if (event.kind === 'stalk') {
            const prey = preyById.get(event.preyId)
            if (prey) {
              prey.setAlarmed(true)
              alarmed.set(event.preyId, prey)
              hunted.add(event.preyId)
            }
          } else if (event.kind === 'deflated') {
            deflated.push(owl.animal)
          } else if (event.kind === 'abandon') {
            calm(event.preyId)
          } else if (event.kind === 'catch') {
            const prey = preyById.get(event.preyId)
            calm(event.preyId)
            if (prey) catches.push({ owl: owl.animal, prey })
          }
        }

        const visible = owlVisible(flight)
        const roostRotation = owl.roost ? PERCH_HEADING : null
        const pose = poseFor(flight, roostRotation)
        // Ease the facing so settling onto a perch turns the owl instead of snapping it.
        const previous = shownHeading.get(owl.animal.instanceId) ?? pose.heading
        let turn = pose.heading - previous
        while (turn > Math.PI) turn -= Math.PI * 2
        while (turn < -Math.PI) turn += Math.PI * 2
        const heading = visible ? previous + turn * (1 - Math.exp(-10 * Math.min(0.1, deltaSeconds))) : pose.heading
        shownHeading.set(owl.animal.instanceId, heading)
        // A slack balloon sags: it loses height as well as size.
        const sag = (1 - flight.helium) * 1.6
        owl.animal.setFlightPose({ visible, x: flight.x, y: flight.y + groundY - sag, z: flight.z, ...pose, heading, puff: 0.55 + 0.45 * flight.helium })

        const shadow = shadowFor(owl.animal.instanceId)
        shadow.visible = visible
        if (visible) {
          const height = Math.max(0, flight.y)
          shadow.position.set(flight.x, groundY + 0.05, flight.z)
          const spread = 0.9 + height * 0.06
          shadow.scale.set(spread * 1.25, spread * 0.9, 1)
          shadow.rotation.z = -flight.heading
          ;(shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.34 - height * 0.03)
        }
      }

      // Release any chicken whose hunter has gone (sold, or no longer present).
      for (const id of [...alarmed.keys()]) if (!preyById.has(id)) calm(id)
      return { catches, deflated }
    },
    huntedIds: () => hunted,
    hurry() {
      for (const flight of flights.values()) flight.cooldown = 0
    },
    setHelium(level) {
      startingHelium = Math.min(1, Math.max(0, level))
      for (const flight of flights.values()) flight.helium = Math.min(1, Math.max(0, level))
    },
    reset() {
      for (const id of [...alarmed.keys()]) calm(id)
      flights.clear()
      startingHelium = null
      shownHeading.clear()
      for (const shadow of shadows.values()) shadow.visible = false
    },
    report() {
      return {
        owls: [...flights.entries()].map(([id, flight]) => ({
          id, phase: flight.phase, x: flight.x, y: flight.y, z: flight.z, preyId: flight.preyId, cooldown: flight.cooldown, helium: flight.helium, visible: owlVisible(flight),
        })),
      }
    },
    dispose() {
      for (const shadow of shadows.values()) {
        shadow.parent?.remove(shadow)
        ;(shadow.material as THREE.Material).dispose()
      }
      shadows.clear()
      shadowGeometry.dispose()
      shadowMaterial.dispose()
      for (const id of [...alarmed.keys()]) calm(id)
    },
  }
}
