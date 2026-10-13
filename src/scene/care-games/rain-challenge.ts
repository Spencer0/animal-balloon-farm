import * as THREE from 'three'
import { CARE_GAME_COPY, createCareRound, lossLine, type CareRound } from '../../game/care-minigames'
import type { CareGameDom } from '../../ui/care-game-dom'
import { cloneCritter } from '../plant-models'
import { createBurst, createBurstPool, createRainShower, springOut, type RainShower } from '../garden-bursts'
import { createCareSfx } from './care-sfx'

/**
 * The watering minigame, played right on the farm: a little rain cloud puffs
 * up over the thirsty plant, and you tap it before it drifts off. Every tap
 * wrings a shower out of it, and it hops somewhere else nearby, a little
 * quicker each time. Enough taps in time and it lets go a downpour (with a
 * rainbow); too slow and it sails away, and the plant is still thirsty.
 *
 * While the cloud is up it owns the left click (`pointerDown` returns true),
 * so a miss never plants a seed or opens a card underneath.
 */

export interface RainChallengeFrame {
  readonly position: THREE.Vector3
  readonly height: number
}

export interface RainChallenge {
  readonly active: boolean
  start(frame: RainChallengeFrame, onWin: () => void, onEnd: (won: boolean) => void): void
  /** A left press while the cloud is up; true when it was taken. */
  pointerDown(clientX: number, clientY: number): boolean
  /** True while the pointer is over the cloud (for the cursor). */
  isOverCloud(clientX: number, clientY: number): boolean
  update(deltaSeconds: number): void
  /** Debug harness: settle the round now. */
  settle(won: boolean): void
  cancel(): void
  dispose(): void
}

const CLOUD_SCALE = 1.7
const RAINBOW_COLORS = ['#e8564a', '#f29a3d', '#f6d34f', '#7cc35c', '#4fa7d8', '#7a62c4']
type Phase = 'idle' | 'rising' | 'play' | 'downpour' | 'drift'

export function createRainChallenge(parent: THREE.Object3D, camera: THREE.Camera, canvas: HTMLCanvasElement, dom: CareGameDom): RainChallenge {
  const root = new THREE.Group()
  root.name = 'Rain cloud challenge'
  root.visible = false
  parent.add(root)
  const sfx = createCareSfx()
  const bursts = createBurstPool()

  let cloud: THREE.Object3D | null = null
  let shower: RainShower | null = null
  let rainbow: THREE.Group | null = null
  const rainbowParts: Array<{ dispose(): void }> = []
  let round: CareRound = createCareRound('rain')
  let phase: Phase = 'idle'
  let phaseTime = 0
  let frame: RainChallengeFrame | null = null
  let winHandler: (() => void) | null = null
  let endHandler: ((won: boolean) => void) | null = null
  const spot = new THREE.Vector3()
  const target = new THREE.Vector3()
  let squash = 0
  let burstRain = 0
  let time = 0
  const projected = new THREE.Vector3()
  const edge = new THREE.Vector3()

  function ensureParts(): boolean {
    if (!cloud) {
      cloud = cloneCritter('cloud')
      if (!cloud) return false
      root.add(cloud)
    }
    if (!shower) {
      shower = createRainShower(0.7, 1.6, 56)
      root.add(shower.root)
    }
    if (!rainbow) {
      rainbow = new THREE.Group()
      rainbow.name = 'Rainbow'
      RAINBOW_COLORS.forEach((color, index) => {
        const geometry = new THREE.TorusGeometry(0.95 - index * 0.06, 0.03, 6, 40, Math.PI)
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
        const band = new THREE.Mesh(geometry, material)
        band.renderOrder = 930
        rainbow?.add(band)
        rainbowParts.push(geometry, material)
      })
      root.add(rainbow)
    }
    return true
  }

  /** Where the cloud hops next: somewhere over and around the plant, never too close to where it was. */
  function hop(): void {
    if (!frame) return
    const hits = round.snapshot.hits
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = Math.random() * Math.PI * 2
      const reach = 0.35 + Math.random() * (0.55 + hits * 0.08)
      target.set(Math.cos(angle) * reach, frame.height + 0.75 + Math.random() * 0.5, Math.sin(angle) * reach)
      if (target.distanceTo(spot) > 0.45) break
    }
  }

  function screenOf(world: THREE.Vector3): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    projected.copy(world).project(camera)
    return { x: rect.left + (projected.x + 1) / 2 * rect.width, y: rect.top + (1 - projected.y) / 2 * rect.height }
  }

  function cloudWorld(target3 = new THREE.Vector3()): THREE.Vector3 {
    return cloud ? cloud.getWorldPosition(target3) : target3.copy(root.position)
  }

  function cloudHit(clientX: number, clientY: number): boolean {
    if (!cloud || phase !== 'play') return false
    const centre = cloudWorld()
    const at = screenOf(centre)
    // The cloud's on-screen radius: project a point half its width to the side.
    edge.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.36 * CLOUD_SCALE).add(centre)
    const side = screenOf(edge)
    const radius = Math.hypot(side.x - at.x, side.y - at.y) + 12
    return Math.hypot(clientX - at.x, clientY - at.y) <= radius
  }

  function finish(won: boolean): void {
    phase = won ? 'downpour' : 'drift'
    phaseTime = 0
    dom.hideTap()
    const at = screenOf(cloudWorld())
    if (won) {
      sfx.play('win')
      sfx.play('downpour')
      dom.pop(CARE_GAME_COPY.rain.winLine, at.x, at.y - 30, 'good', true)
      winHandler?.()
    } else {
      sfx.play('lose')
      dom.pop(lossLine('rain', round.snapshot.lossReason), at.x, at.y - 30, 'bad')
    }
  }

  function end(won: boolean): void {
    phase = 'idle'
    root.visible = false
    dom.hideTap()
    const handler = endHandler
    endHandler = null
    winHandler = null
    handler?.(won)
  }

  const challenge: RainChallenge = {
    get active() { return phase !== 'idle' },
    start(next, onWin, onEnd): void {
      if (!ensureParts() || !cloud) {
        onEnd(false)
        return
      }
      frame = next
      winHandler = onWin
      endHandler = onEnd
      round = createCareRound('rain')
      root.position.copy(next.position)
      root.visible = true
      spot.set(0, next.height + 0.95, 0)
      target.copy(spot)
      cloud.position.copy(spot)
      cloud.scale.setScalar(0.0001)
      if (rainbow) {
        rainbow.visible = false
        rainbow.position.set(0, 0, -0.4)
      }
      phase = 'rising'
      phaseTime = 0
      sfx.play('pop')
    },
    pointerDown(clientX, clientY): boolean {
      if (phase === 'idle') return false
      if (phase !== 'play') return true
      if (!cloudHit(clientX, clientY)) {
        round.whiff()
        sfx.play('whiff')
        return true
      }
      const streak = round.hit()
      squash = 1
      burstRain = 0.4
      sfx.play('tap', 1 + streak * 0.08)
      if (frame) {
        bursts.add(createBurst(new THREE.Vector3(spot.x * 0.6, frame.height * 0.6, spot.z * 0.6), {
          count: 10, colors: ['#8fd0ea', '#bfe8f5'], size: 0.03, speed: [0.6, 1.2], lift: 0.8, gravity: 7, seconds: 0.5,
        }), root)
      }
      if (round.snapshot.state === 'won') finish(true)
      else hop()
      return true
    },
    isOverCloud(clientX, clientY): boolean {
      return cloudHit(clientX, clientY)
    },
    update(deltaSeconds): void {
      bursts.update(deltaSeconds)
      if (phase === 'idle' || !cloud || !shower || !frame) return
      time += deltaSeconds
      phaseTime += deltaSeconds
      squash = Math.max(0, squash - deltaSeconds * 5)
      burstRain = Math.max(0, burstRain - deltaSeconds)
      let size = CLOUD_SCALE
      if (phase === 'rising') {
        size *= springOut(Math.min(1, phaseTime / 0.5))
        if (phaseTime >= 0.5) {
          phase = 'play'
          phaseTime = 0
          hop()
        }
      } else if (phase === 'play') {
        round.tick(deltaSeconds)
        if (round.snapshot.state === 'lost') finish(false)
        // The cloud slides to its next spot, quicker with every tap, and keeps bobbing there.
        const speed = 3 + round.snapshot.hits * 1.1
        spot.lerp(target, Math.min(1, deltaSeconds * speed))
      } else if (phase === 'downpour') {
        size *= 1 + Math.min(0.25, phaseTime * 0.4)
        spot.lerp(new THREE.Vector3(0, frame.height + 0.9, 0), Math.min(1, deltaSeconds * 4))
        if (phaseTime > 1.9) {
          size *= Math.max(0.0001, 1 - (phaseTime - 1.9) / 0.35)
          if (phaseTime > 2.25) {
            bursts.add(createBurst(cloudWorld().sub(root.position), { count: 14, colors: ['#ffffff', '#e6eef7'], size: 0.09, speed: [0.6, 1.3], gravity: 0.5, seconds: 0.6 }), root)
            end(true)
            return
          }
        }
      } else if (phase === 'drift') {
        spot.add(new THREE.Vector3(deltaSeconds * 1.4, deltaSeconds * 0.9, 0))
        size *= Math.max(0.0001, 1 - phaseTime / 1.1)
        if (phaseTime > 1.1) {
          end(false)
          return
        }
      }
      const wobble = Math.sin(time * 3) * 0.05
      cloud.position.set(spot.x, spot.y + wobble, spot.z)
      cloud.scale.set(size * (1 + squash * 0.22), size * (1 - squash * 0.3), size * (1 + squash * 0.22))
      cloud.rotation.z = Math.sin(time * 2.2) * 0.06
      shower.root.position.set(spot.x, spot.y - 0.18 * size, spot.z)
      const downpour = phase === 'downpour' ? Math.min(1, phaseTime * 3) * (phaseTime > 1.8 ? Math.max(0, 1 - (phaseTime - 1.8) / 0.4) : 1) : 0
      shower.intensity = Math.max(burstRain > 0 ? 0.55 : 0.06, downpour)
      shower.root.scale.set(1, Math.max(0.2, (spot.y - 0.1) / 1.6), 1)
      shower.update(deltaSeconds)
      if (rainbow) {
        rainbow.visible = phase === 'downpour' && phaseTime > 0.5
        const glow = phase === 'downpour' ? Math.min(1, (phaseTime - 0.5) / 0.5) * Math.max(0, 1 - Math.max(0, phaseTime - 1.9) / 0.35) : 0
        rainbow.children.forEach((band) => { ((band as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = glow * 0.85 })
        rainbow.scale.setScalar(0.6 + glow * 0.5)
      }
      if (phase === 'play' || phase === 'rising') {
        const at = screenOf(cloudWorld())
        dom.showTap(at.x, at.y, round.snapshot)
      }
    },
    settle(won): void {
      if (phase === 'rising') {
        phase = 'play'
        hop()
      }
      if (phase !== 'play') return
      if (won) {
        while (round.snapshot.state === 'playing') round.hit()
        finish(true)
      } else {
        round.forfeit()
        finish(false)
      }
    },
    cancel(): void {
      if (phase === 'idle') return
      endHandler = null
      winHandler = null
      phase = 'idle'
      root.visible = false
      dom.hideTap()
    },
    dispose(): void {
      challenge.cancel()
      bursts.dispose()
      shower?.dispose()
      for (const part of rainbowParts) part.dispose()
      root.removeFromParent()
    },
  }
  return challenge
}
