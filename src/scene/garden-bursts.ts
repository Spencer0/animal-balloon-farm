import * as THREE from 'three'

/**
 * Little one-shot particle effects for the garden and the care minigames: dirt
 * kicked up by a planted seed, leaf confetti from a snip, berry juice, rain.
 * Each effect is one InstancedMesh (one draw call) that owns its geometry and
 * material and frees them when it finishes.
 */

export interface GardenBurst {
  readonly root: THREE.Object3D
  /** Advance; false once the effect has finished (it has then freed itself). */
  update(deltaSeconds: number): boolean
  dispose(): void
}

export interface BurstOptions {
  readonly count: number
  readonly colors: readonly string[]
  /** Particle size in metres. */
  readonly size: number
  /** Launch speed range, metres per second. */
  readonly speed: readonly [number, number]
  /** Extra upward push, metres per second. */
  readonly lift?: number
  readonly gravity?: number
  readonly seconds?: number
  /** 'blob' is a round crumb; 'leaf' is a flat spinning leaf. */
  readonly shape?: 'blob' | 'leaf' | 'star'
  /** Launch only within this many radians of straight up (default: a full sphere). */
  readonly cone?: number
  readonly drag?: number
  readonly renderOrder?: number
  /** Draw over everything (minigame confetti), not depth-tested into the scene. */
  readonly onTop?: boolean
}

interface Particle {
  readonly position: THREE.Vector3
  readonly velocity: THREE.Vector3
  readonly spin: THREE.Vector3
  readonly rotation: THREE.Euler
  readonly scale: number
}

function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? 1 : 0.45
    const angle = point / 10 * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (point === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

export function createBurst(origin: THREE.Vector3, options: BurstOptions): GardenBurst {
  const seconds = options.seconds ?? 0.9
  const gravity = options.gravity ?? 9
  const drag = options.drag ?? 0.6
  const geometry = options.shape === 'leaf'
    ? new THREE.SphereGeometry(1, 6, 4).scale(1, 0.18, 0.55)
    : options.shape === 'star'
      ? starGeometry()
      : new THREE.SphereGeometry(1, 6, 4)
  const material = new THREE.MeshLambertMaterial({
    color: '#ffffff', transparent: true, depthWrite: false,
    side: options.shape === 'star' ? THREE.DoubleSide : THREE.FrontSide,
    depthTest: !options.onTop,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, options.count)
  mesh.name = `Garden burst (${options.shape ?? 'blob'})`
  mesh.frustumCulled = false
  mesh.renderOrder = options.renderOrder ?? 950
  const colour = new THREE.Color()
  const particles: Particle[] = []
  for (let index = 0; index < options.count; index += 1) {
    const cone = options.cone ?? Math.PI
    const polar = Math.random() * cone
    const azimuth = Math.random() * Math.PI * 2
    const speed = options.speed[0] + Math.random() * (options.speed[1] - options.speed[0])
    const velocity = new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)).multiplyScalar(speed)
    velocity.y += options.lift ?? 0
    particles.push({
      position: origin.clone(),
      velocity,
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      rotation: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      scale: options.size * (0.65 + Math.random() * 0.7),
    })
    mesh.setColorAt(index, colour.set(options.colors[index % options.colors.length] ?? '#ffffff'))
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  const dummy = new THREE.Object3D()
  let age = 0
  let disposed = false

  function write(): void {
    const fade = 1 - Math.max(0, (age - seconds * 0.6) / (seconds * 0.4))
    material.opacity = Math.max(0, fade)
    particles.forEach((particle, index) => {
      dummy.position.copy(particle.position)
      dummy.rotation.copy(particle.rotation)
      const grow = Math.min(1, age / 0.08)
      dummy.scale.setScalar(particle.scale * grow * (0.4 + 0.6 * fade))
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  write()

  const burst: GardenBurst = {
    root: mesh,
    update(deltaSeconds): boolean {
      if (disposed) return false
      age += deltaSeconds
      if (age >= seconds) {
        burst.dispose()
        return false
      }
      const damping = Math.exp(-drag * deltaSeconds)
      for (const particle of particles) {
        particle.velocity.y -= gravity * deltaSeconds
        particle.velocity.multiplyScalar(damping)
        particle.position.addScaledVector(particle.velocity, deltaSeconds)
        particle.rotation.x += particle.spin.x * deltaSeconds
        particle.rotation.y += particle.spin.y * deltaSeconds
        particle.rotation.z += particle.spin.z * deltaSeconds
      }
      write()
      return true
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
  return burst
}

/** A set of live bursts that ticks and prunes itself. */
export interface BurstPool {
  add(burst: GardenBurst, parent: THREE.Object3D): void
  update(deltaSeconds: number): void
  dispose(): void
}

export function createBurstPool(): BurstPool {
  const live: GardenBurst[] = []
  return {
    add(burst, parent): void {
      parent.add(burst.root)
      live.push(burst)
    },
    update(deltaSeconds): void {
      for (let index = live.length - 1; index >= 0; index -= 1) {
        if (!live[index].update(deltaSeconds)) live.splice(index, 1)
      }
    },
    dispose(): void {
      for (const burst of live) burst.dispose()
      live.length = 0
    },
  }
}

/**
 * Falling rain under a cloud: thin streaks that loop from the cloud's belly to
 * the ground. `intensity` (0..1) sets how many fall; a shower can be turned up
 * for a downpour and down again without rebuilding anything.
 */
export interface RainShower {
  readonly root: THREE.Object3D
  intensity: number
  update(deltaSeconds: number): void
  dispose(): void
}

export function createRainShower(width: number, height: number, drops = 48): RainShower {
  const geometry = new THREE.CylinderGeometry(0.008, 0.008, 1, 4)
  const material = new THREE.MeshBasicMaterial({ color: '#8fd0ea', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
  const mesh = new THREE.InstancedMesh(geometry, material, drops)
  mesh.name = 'Rain shower'
  mesh.frustumCulled = false
  mesh.renderOrder = 940
  const offsets = Array.from({ length: drops }, () => ({
    x: (Math.random() - 0.5) * width,
    z: (Math.random() - 0.5) * width * 0.6,
    phase: Math.random(),
    speed: 0.9 + Math.random() * 0.5,
  }))
  const dummy = new THREE.Object3D()
  let time = 0
  const shower: RainShower = {
    root: mesh,
    intensity: 1,
    update(deltaSeconds): void {
      time += deltaSeconds
      const shown = Math.round(drops * THREE.MathUtils.clamp(shower.intensity, 0, 1))
      offsets.forEach((drop, index) => {
        const fall = (drop.phase + time * drop.speed * 2.2) % 1
        dummy.position.set(drop.x, -fall * height, drop.z)
        dummy.scale.set(1, index < shown ? 0.16 : 0.0001, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    },
    dispose(): void {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
  shower.update(0)
  return shower
}

/** Elastic overshoot: 0 -> 1 with a springy settle, for things that pop into place. */
export function springOut(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return 1 + Math.pow(2, -9 * t) * Math.sin((t * 9 - 0.75) * (2 * Math.PI) / 3)
}
