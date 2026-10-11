import * as THREE from 'three'
import type { BalloonAnimal, FlightPose } from '../animals/balloon-animal'
import { owlVisible, type OwlFlight } from '../game/predator'
import type { OwlSim } from '../game/animal-hunt'

/**
 * Shows every owl each frame. Where the owl is and what it is doing is decided
 * on the sim tick (`src/game/animal-hunt.ts`); this reads the last two ticks of
 * its flight, blends them by the clock's alpha, and hands the pose to the balloon
 * animal. It also draws the owl's ground shadow and eases its facing, which are
 * pictures, not facts.
 */
export interface PresentedOwl {
  readonly animal: BalloonAnimal
  /** True when the farm gave this owl a perch to face the camera from. */
  readonly hasRoost: boolean
}

export interface OwlPresenter {
  present(alpha: number, deltaSeconds: number, owls: readonly PresentedOwl[]): void
  /** Hide every shadow and forget every shown heading, as when the farm is reset. */
  reset(): void
  dispose(): void
}

/**
 * A perched owl turns to face the camera, which looks in from the south-east
 * (+x, +z), so its face is the first thing you see on the oak.
 */
const PERCH_HEADING = Math.atan2(-94, 70)

/** How the clip and playback speed follow the flight phase. A balloon barely flaps. */
function poseFor(flight: OwlFlight, pitch: number, heading: number, roostRotation: number | null): Pick<FlightPose, 'clip' | 'rate' | 'heading' | 'pitch'> {
  const folded = flight.phase === 'roost' || flight.phase === 'dive'
  const facing = flight.phase === 'roost' && roostRotation !== null ? roostRotation : heading
  const rate = folded ? 1 : Math.max(0.35, 0.3 + flight.flap * 1.1)
  // A flying balloon leans back a touch; a stooping one points its beak at the ground.
  const lean = flight.phase === 'patrol' ? 0.08 + pitch * 0.5 : pitch
  return { clip: folded ? 'IDLE' : 'WALK', rate, heading: facing, pitch: lean }
}

function wrapAngle(turn: number): number {
  let wrapped = turn
  while (wrapped > Math.PI) wrapped -= Math.PI * 2
  while (wrapped < -Math.PI) wrapped += Math.PI * 2
  return wrapped
}

export function createOwlPresenter(parent: THREE.Object3D, groundY: number, sim: OwlSim): OwlPresenter {
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

  return {
    present(alpha, deltaSeconds, owls) {
      for (const owl of owls) {
        const id = owl.animal.instanceId
        const track = sim.track(id)
        if (!track) continue
        const { flight, prev } = track
        const visible = owlVisible(flight)
        // Blend from the last tick, except across an arrival: it appears where it is.
        const t = !visible || !prev.visible ? 1 : Math.min(1, Math.max(0, alpha))
        const x = prev.x + (flight.x - prev.x) * t
        const y = prev.y + (flight.y - prev.y) * t
        const z = prev.z + (flight.z - prev.z) * t
        const flightHeading = prev.heading + wrapAngle(flight.heading - prev.heading) * t
        const pitch = prev.pitch + (flight.pitch - prev.pitch) * t
        const helium = prev.helium + (flight.helium - prev.helium) * t
        const pose = poseFor(flight, pitch, flightHeading, owl.hasRoost ? PERCH_HEADING : null)
        // Ease the facing so settling onto a perch turns the owl instead of snapping it.
        const previous = shownHeading.get(id) ?? pose.heading
        const turn = wrapAngle(pose.heading - previous)
        const heading = visible ? previous + turn * (1 - Math.exp(-10 * Math.min(0.1, deltaSeconds))) : pose.heading
        shownHeading.set(id, heading)
        // A slack balloon sags: it loses height as well as size.
        const sag = (1 - helium) * 1.6
        owl.animal.setFlightPose({ visible, x, y: y + groundY - sag, z, ...pose, heading, puff: 0.55 + 0.45 * helium })

        const shadow = shadowFor(id)
        shadow.visible = visible
        if (visible) {
          const height = Math.max(0, y)
          shadow.position.set(x, groundY + 0.05, z)
          const spread = 0.9 + height * 0.06
          shadow.scale.set(spread * 1.25, spread * 0.9, 1)
          shadow.rotation.z = -flightHeading
          ;(shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.34 - height * 0.03)
        }
      }
    },
    reset() {
      shownHeading.clear()
      for (const shadow of shadows.values()) shadow.visible = false
    },
    dispose() {
      for (const shadow of shadows.values()) {
        shadow.parent?.remove(shadow)
        ;(shadow.material as THREE.Material).dispose()
      }
      shadows.clear()
      shadowGeometry.dispose()
      shadowMaterial.dispose()
    },
  }
}
