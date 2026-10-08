import * as THREE from 'three'
import type { BalloonAnimalId } from './balloon-animal'

export const CAPTURE_DURATION_SECONDS = 6.8

const PAINT_PALETTES: Record<BalloonAnimalId, readonly [string, string]> = {
  pig: ['#ed679d', '#ffb0c2'],
  sheep: ['#fff0d0', '#c69473'],
  cow: ['#292735', '#fff4df'],
  chicken: ['#f6c94d', '#e97836'],
  duck: ['#45a36c', '#d6a34d'],
  goose: ['#fff2df', '#ed8543'],
  frog: ['#6ab84e', '#f3ecc9'],
  owl: ['#a9774b', '#fdeecf'],
}

export interface CapturePose {
  readonly fill: number
  readonly lift: number
  readonly pitch: number
  readonly roll: number
  readonly yaw: number
}

export interface CapturePresentation {
  readonly finished: boolean
  update(deltaSeconds: number): CapturePose
  dispose(): void
}

interface PaintBucket {
  readonly anchor: THREE.Group
  readonly tilt: THREE.Group
  readonly paint: THREE.Mesh
  readonly streamMaterial: THREE.MeshPhysicalMaterial
  readonly streamSegments: readonly THREE.Mesh[]
  readonly side: number
  readonly colorIndex: number
  emitTimer: number
}

interface PaintDrop {
  readonly mesh: THREE.Mesh
  readonly velocity: THREE.Vector3
  active: boolean
  hitY: number
  age: number
  paintIndex: number
  splash: boolean
}

interface PaintSplat {
  readonly mesh: THREE.Mesh
  readonly material: THREE.MeshBasicMaterial
  active: boolean
  age: number
  lifetime: number
  size: number
}

interface CaptureSparkle {
  readonly mesh: THREE.Mesh
  readonly phase: number
  readonly radius: number
  readonly height: number
  readonly speed: number
}

interface RigPoseNode {
  readonly object: THREE.Object3D
  readonly base: THREE.Euler
  readonly kind: 'pig-head' | 'pig-leg' | 'wing' | 'goose-neck' | 'goose-head' | 'duck-head' | 'sheep-tail' | 'cow-head' | 'frog-bulge'
  readonly side: number
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smoothstep(from: number, to: number, value: number): number {
  const amount = clamp01((value - from) / (to - from))
  return amount * amount * (3 - 2 * amount)
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function makePaintBucket(
  color: string,
  side: number,
  colorIndex: number,
  streamGeometry: THREE.BufferGeometry,
): PaintBucket {
  const anchor = new THREE.Group()
  const tilt = new THREE.Group()
  anchor.add(tilt)

  const pailMaterial = new THREE.MeshStandardMaterial({ color: '#b77a50', roughness: 0.42, metalness: 0.12 })
  const brassMaterial = new THREE.MeshStandardMaterial({ color: '#eac577', roughness: 0.3, metalness: 0.52 })
  const badgeMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.29, metalness: 0.04 })
  const paintMaterial = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.1 })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.275, 0.42, 18, 1, true), pailMaterial)
  body.castShadow = true
  body.receiveShadow = true
  tilt.add(body)

  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.035, 18), pailMaterial)
  bottom.position.y = -0.21
  tilt.add(bottom)

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.022, 7, 24), brassMaterial)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.205
  tilt.add(rim)
  const baseBand = new THREE.Mesh(new THREE.TorusGeometry(0.267, 0.018, 7, 24), brassMaterial)
  baseBand.rotation.x = Math.PI / 2
  baseBand.position.y = -0.17
  tilt.add(baseBand)
  const colorBand = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 7, 24), badgeMaterial)
  colorBand.rotation.x = Math.PI / 2
  colorBand.position.y = -0.045
  tilt.add(colorBand)

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.016, 7, 20, Math.PI), brassMaterial)
  handle.position.y = 0.19
  handle.scale.z = 0.82
  tilt.add(handle)

  const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.018, 18), paintMaterial)
  paint.position.y = 0.11
  tilt.add(paint)

  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), badgeMaterial)
  badge.position.set(0, 0.04, 0.22)
  tilt.add(badge)

  const streamMaterial = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.16,
    metalness: 0.015,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const streamSegments = Array.from({ length: 4 }, () => {
    const mesh = new THREE.Mesh(streamGeometry, streamMaterial)
    mesh.visible = false
    return mesh
  })

  anchor.scale.setScalar(0.001)
  return { anchor, tilt, paint, streamMaterial, streamSegments, side, colorIndex, emitTimer: 0 }
}

function captureGesture(id: BalloonAnimalId, time: number, duration: number): CapturePose {
  const fill = smoothstep(0.92, duration - 0.86, time)
  const active = smoothstep(0.12, 0.62, time) * (1 - smoothstep(duration - 0.8, duration, time))
  const bounce = Math.max(0, Math.sin((time - 0.28) * Math.PI * 3.1))
  const fade = 1 - smoothstep(duration - 0.8, duration, time)

  switch (id) {
    case 'pig':
      return {
        fill,
        lift: active * Math.max(0, Math.sin(time * 4.8)) * 0.035,
        pitch: active * (0.08 + Math.sin(time * 3.2) * 0.14),
        roll: active * Math.sin(time * 2.4) * 0.065,
        yaw: Math.sin(time * 1.7) * 0.035 * active,
      }
    case 'sheep':
      return { fill, lift: active * (0.035 + bounce * 0.22), pitch: Math.sin(time * 3.6) * 0.055 * active, roll: Math.sin(time * 2.1) * 0.07 * active, yaw: 0 }
    case 'cow':
      return {
        fill,
        lift: active * Math.sin((time / duration) * Math.PI) * 0.13,
        pitch: active * Math.sin((time / duration) * Math.PI) * 0.1,
        roll: Math.sin((time / (duration - 0.6)) * Math.PI) * 0.67 * fade,
        yaw: Math.sin(time * 1.3) * 0.035 * active,
      }
    case 'chicken':
      return { fill, lift: active * (0.08 + Math.abs(Math.sin(time * 5.3)) * 0.24), pitch: Math.sin(time * 4.2) * 0.075 * active, roll: Math.sin(time * 5.3) * 0.08 * active, yaw: 0 }
    case 'duck':
      return {
        fill,
        lift: active * (0.035 + bounce * 0.14),
        pitch: Math.sin(time * 3.1) * 0.05 * active,
        roll: Math.sin(time * 3.2 + Math.PI / 2) * 0.09 * active,
        yaw: Math.sin(time * 2.1) * 0.1 * active,
      }
    case 'goose':
      return {
        fill,
        lift: active * (0.02 + bounce * 0.08),
        pitch: active * (0.12 + Math.sin(time * 2.6) * 0.07),
        roll: Math.sin(time * 2.2) * 0.05 * active,
        yaw: Math.sin(time * 1.5) * 0.06 * active,
      }
    case 'frog':
      // A delighted little hop on the spot, the way it moves everywhere else.
      return {
        fill,
        lift: active * (0.02 + Math.max(0, Math.sin(time * 7.2)) * 0.2),
        pitch: Math.sin(time * 3.4) * 0.06 * active,
        roll: Math.sin(time * 4.6) * 0.075 * active,
        yaw: Math.sin(time * 2.4) * 0.09 * active,
      }
    case 'owl':
      // A slow, airy bob: the balloon lifts a little and the head tilts.
      return {
        fill,
        lift: active * (0.08 + Math.sin(time * 2.2) * 0.07),
        pitch: Math.sin(time * 1.7) * 0.05 * active,
        roll: Math.sin(time * 1.9 + 0.8) * 0.06 * active,
        yaw: Math.sin(time * 1.3) * 0.12 * active,
      }
  }
}

function buildRigPose(actor: THREE.Object3D | null, id: BalloonAnimalId): RigPoseNode[] {
  if (!actor) return []
  const nodes: RigPoseNode[] = []
  actor.traverse((object) => {
    const name = object.name.toLowerCase()
    let kind: RigPoseNode['kind'] | null = null
    if (id === 'pig') {
      if (name.includes('rig') && name.includes('curious head')) kind = 'pig-head'
      else if (name.includes('rig') && name.includes('front') && name.includes('leg')) kind = 'pig-leg'
    } else if (id === 'chicken' || id === 'duck' || id === 'goose' || id === 'owl') {
      if (name.includes('rig') && name.includes('wing')) kind = 'wing'
      else if (id === 'goose' && name.includes('rig') && name.includes('tall swanlike neck')) kind = 'goose-neck'
      else if (id === 'goose' && name.includes('rig') && name.includes('proud little head')) kind = 'goose-head'
      else if (id === 'duck' && name.includes('rig') && name.includes('bright emerald head')) kind = 'duck-head'
    } else if (id === 'frog') {
      if (name.includes('rig') && name.includes('eye bulge')) kind = 'frog-bulge'
    } else if (id === 'sheep' && name.includes('rig') && name.includes('bobbing wool tail')) {
      kind = 'sheep-tail'
    } else if (id === 'cow' && name.includes('rig') && name.includes('friendly head')) {
      kind = 'cow-head'
    }
    if (kind) nodes.push({ object, base: object.rotation.clone(), kind, side: name.includes('near') ? -1 : 1 })
  })
  return nodes
}

function animateSignaturePose(nodes: readonly RigPoseNode[], id: BalloonAnimalId, time: number, duration: number): void {
  const active = smoothstep(0.12, 0.62, time) * (1 - smoothstep(duration - 0.7, duration, time))
  for (const { object, base, kind, side } of nodes) {
    let x = 0
    let y = 0
    let z = 0
    switch (kind) {
      case 'pig-head':
        y = Math.sin(time * 8.4) * 0.22 * active
        break
      case 'pig-leg':
        y = Math.max(0, Math.sin(time * 9)) * 0.32 * active
        break
      case 'wing': {
        const flapSpeed = id === 'chicken' ? 15 : id === 'duck' ? 12 : id === 'owl' ? 5 : 9
        const flapSize = id === 'chicken' ? 0.9 : id === 'duck' ? 0.72 : id === 'owl' ? 0.55 : 0.46
        x = side * Math.sin(time * flapSpeed) * flapSize * active
        break
      }
      case 'goose-neck':
        z = Math.sin(time * 2.7) * 0.1 * active
        break
      case 'goose-head':
        z = Math.sin(time * 3.2 + 0.6) * 0.075 * active
        break
      case 'duck-head':
        y = Math.sin(time * 5) * 0.09 * active
        break
      case 'sheep-tail':
        x = Math.sin(time * 7) * 0.28 * active
        break
      case 'cow-head':
        y = Math.sin(time * 4) * 0.08 * active
        break
      case 'frog-bulge':
        // The googly-eyed pop: each eye mound rocks outward as the paint lands.
        z = side * Math.sin(time * 5.6) * 0.12 * active
        y = Math.sin(time * 4.4 + side) * 0.05 * active
        break
    }
    object.rotation.set(base.x + x, base.y + y, base.z + z)
  }
}

function setSegmentBetween(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, radius: number): void {
  const direction = end.clone().sub(start)
  const length = direction.length()
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  mesh.scale.set(radius, Math.max(length, 0.001), radius)
}

export function createCapturePresentation(
  actorParent: THREE.Object3D,
  physicsParent: THREE.Object3D,
  actor: THREE.Object3D | null,
  animalId: BalloonAnimalId,
  bounds: THREE.Box3,
  seed: number,
): CapturePresentation {
  const palette = PAINT_PALETTES[animalId]
  const random = seededRandom(seed)
  const size = bounds.getSize(new THREE.Vector3())
  const top = bounds.max.y
  const bottom = bounds.min.y
  const height = Math.max(size.y, 0.9)
  const width = Math.max(size.x, 0.85)
  const depth = Math.max(size.z, 0.55)
  const gravity = 5.8
  const rigPose = buildRigPose(actor, animalId)
  const upAxis = new THREE.Vector3(0, 1, 0)

  const effects = new THREE.Group()
  effects.name = `${animalId} · floating paint buckets and evolution sparkles`
  actorParent.add(effects)
  const physicsEffects = new THREE.Group()
  physicsEffects.name = `${animalId} · gravity-driven paint and ground ring`
  physicsParent.add(physicsEffects)

  const streamGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false)
  const buckets = [
    makePaintBucket(palette[0], -1, 0, streamGeometry),
    makePaintBucket(palette[1], 1, 1, streamGeometry),
  ]
  buckets.forEach((bucket) => {
    effects.add(bucket.anchor)
    bucket.streamSegments.forEach((segment) => physicsEffects.add(segment))
  })

  const dropGeometry = new THREE.SphereGeometry(1, 12, 8)
  const dropMaterials = palette.map((color) => new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.18,
    metalness: 0.01,
    clearcoat: 0.62,
    clearcoatRoughness: 0.11,
  }))
  const drops: PaintDrop[] = Array.from({ length: 112 }, () => {
    const mesh = new THREE.Mesh(dropGeometry, dropMaterials[0])
    mesh.visible = false
    physicsEffects.add(mesh)
    return { mesh, velocity: new THREE.Vector3(), active: false, hitY: bottom, age: 0, paintIndex: 0, splash: false }
  })

  const splatGeometry = new THREE.SphereGeometry(1, 12, 8)
  const splats: PaintSplat[] = Array.from({ length: 36 }, () => {
    const material = new THREE.MeshBasicMaterial({ color: palette[0], transparent: true, opacity: 0, depthWrite: false })
    const mesh = new THREE.Mesh(splatGeometry, material)
    mesh.visible = false
    physicsEffects.add(mesh)
    return { mesh, material, active: false, age: 0, lifetime: 0.45, size: 0.1 }
  })

  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#fff0bf', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.91, 48), ringMaterial)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.055
  ring.scale.setScalar(0.45)
  physicsEffects.add(ring)

  const sparkleGeometry = new THREE.OctahedronGeometry(0.075, 0)
  const sparkles: CaptureSparkle[] = Array.from({ length: 16 }, () => {
    const color = random() > 0.5 ? '#fff2b5' : palette[Math.floor(random() * palette.length)]
    const mesh = new THREE.Mesh(sparkleGeometry, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    mesh.visible = false
    effects.add(mesh)
    return {
      mesh,
      phase: random() * Math.PI * 2,
      radius: Math.max(width, depth) * (0.42 + random() * 0.22),
      height: height * (0.35 + random() * 0.52),
      speed: 0.55 + random() * 0.65,
    }
  })

  let time = 0
  let disposed = false

  const nozzleInActorSpace = (bucket: PaintBucket): THREE.Vector3 => {
    // Spill from the lip on the side the bucket tips toward (not through its closed base).
    const point = new THREE.Vector3(-bucket.side * 0.19, 0.19, 0)
    bucket.tilt.localToWorld(point)
    return actorParent.worldToLocal(point)
  }

  const toPhysicsSpace = (point: THREE.Vector3): THREE.Vector3 => {
    actorParent.localToWorld(point)
    return physicsEffects.worldToLocal(point)
  }

  const spawnSplat = (position: THREE.Vector3, paintIndex: number): void => {
    const splat = splats.find((candidate) => !candidate.active)
    if (!splat) return
    splat.material.color.set(palette[paintIndex])
    splat.material.opacity = 0.78
    splat.mesh.position.copy(position)
    splat.size = 0.07 + random() * 0.1
    splat.mesh.scale.set(splat.size, splat.size * 0.72, splat.size)
    splat.mesh.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI)
    splat.age = 0
    splat.lifetime = 0.32 + random() * 0.18
    splat.mesh.visible = true
    splat.active = true
  }

  const spawnDrop = (bucket: PaintBucket, splash: boolean, origin?: THREE.Vector3): void => {
    const drop = drops.find((candidate) => !candidate.active)
    if (!drop) return

    const angle = random() * Math.PI * 2
    const dropSize = splash ? 0.027 + random() * 0.032 : 0.047 + random() * 0.042
    let start: THREE.Vector3
    let target: THREE.Vector3
    if (origin) {
      start = origin.clone()
      target = start.clone().add(new THREE.Vector3(0, -0.015, 0))
    } else {
      start = toPhysicsSpace(nozzleInActorSpace(bucket))
      target = toPhysicsSpace(new THREE.Vector3(
        (random() - 0.5) * width * 0.55,
        bottom + height * (0.2 + random() * 0.62),
        (random() - 0.5) * depth * 0.44,
      ))
    }
    drop.mesh.material = dropMaterials[bucket.colorIndex]
    drop.mesh.position.set(start.x + (random() - 0.5) * 0.045, start.y - random() * 0.025, start.z + (random() - 0.5) * 0.045)
    drop.mesh.scale.set(dropSize * 0.78, dropSize * (splash ? 1.4 : 1.9), dropSize * 0.78)
    if (splash) {
      drop.velocity.set(-bucket.side * (0.38 + random() * 0.7) + Math.cos(angle) * 0.36, 0.9 + random() * 0.82, Math.sin(angle) * 0.55)
      drop.hitY = drop.mesh.position.y - 0.015
    } else {
      const flightTime = 0.48 + random() * 0.22
      drop.velocity.set(
        (target.x - drop.mesh.position.x) / flightTime,
        (target.y - drop.mesh.position.y + 0.5 * gravity * flightTime * flightTime) / flightTime,
        (target.z - drop.mesh.position.z) / flightTime,
      )
      drop.hitY = target.y
    }
    drop.age = 0
    drop.paintIndex = bucket.colorIndex
    drop.splash = splash
    drop.active = true
    drop.mesh.visible = true
  }

  const updateStream = (bucket: PaintBucket, pourAmount: number): void => {
    const visible = pourAmount > 0.08
    bucket.streamMaterial.opacity = visible ? 0.76 * pourAmount : 0
    bucket.streamSegments.forEach((segment) => { segment.visible = visible })
    if (!visible) return

    const start = toPhysicsSpace(nozzleInActorSpace(bucket))
    const sway = Math.sin(time * 15 + bucket.side) * 0.055
    const target = toPhysicsSpace(new THREE.Vector3(
      -bucket.side * width * 0.08 + sway,
      bottom + height * (0.42 + Math.sin(time * 2.4 + bucket.side) * 0.09),
      Math.sin(time * 1.8 + bucket.side) * depth * 0.12,
    ))
    const control = start.clone().lerp(target, 0.48)
    control.x -= bucket.side * 0.11
    control.y += Math.max(0.06, (start.y - target.y) * 0.08)
    const curve = new THREE.QuadraticBezierCurve3(start, control, target)
    const points = curve.getPoints(bucket.streamSegments.length)
    const pulse = 0.78 + Math.sin(time * 19 + bucket.side) * 0.16
    for (let index = 0; index < bucket.streamSegments.length; index += 1) {
      setSegmentBetween(bucket.streamSegments[index], points[index], points[index + 1], 0.045 * pulse)
    }
  }

  const updatePaint = (delta: number): void => {
    const pouring = time >= 0.84 && time <= 5.35
    const pourProgress = smoothstep(0.95, 5.35, time)
    const tiltProgress = smoothstep(0.62, 1.12, time) * (1 - smoothstep(4.9, 5.55, time))
    const bucketFade = 1 - smoothstep(5.75, 6.35, time)

    for (const bucket of buckets) {
      const pop = smoothstep(0.05, 0.48, time) * bucketFade
      bucket.anchor.scale.setScalar(pop * 0.96)
      bucket.anchor.position.set(
        bucket.side * (width * 0.38 + 0.34),
        top + 0.67 + (1 - pop) * 0.34 + Math.sin(time * 2.8 + bucket.side) * 0.035 * pop,
        bucket.side * depth * 0.16,
      )
      bucket.anchor.rotation.y = Math.sin(time * 1.7 + bucket.side) * 0.055 * pop
      bucket.tilt.rotation.z = bucket.side * (0.82 + Math.sin(time * 3.4 + bucket.side) * 0.035) * tiltProgress
      bucket.paint.position.y = 0.11 - pourProgress * 0.13
      bucket.paint.visible = time < 5.65
      updateStream(bucket, pouring ? tiltProgress * pop : 0)

      if (pouring && pop > 0.8) {
        bucket.emitTimer += delta
        while (bucket.emitTimer >= 0.055) {
          bucket.emitTimer -= 0.055
          spawnDrop(bucket, false)
        }
      }
    }

    for (const drop of drops) {
      if (!drop.active) continue
      drop.age += delta
      drop.velocity.y -= gravity * delta
      drop.mesh.position.addScaledVector(drop.velocity, delta)
      drop.mesh.quaternion.setFromUnitVectors(upAxis, drop.velocity.clone().normalize())
      if (drop.splash && drop.velocity.y >= 0 && drop.age < 0.4) continue
      if (drop.mesh.position.y <= drop.hitY && drop.velocity.y < 0) {
        const impact = drop.mesh.position.clone()
        const paintIndex = drop.paintIndex
        const bucket = buckets[paintIndex]
        drop.active = false
        drop.mesh.visible = false
        spawnSplat(impact, paintIndex)
        if (bucket && !drop.splash && time < 5.55) {
          spawnDrop(bucket, true, impact)
          spawnDrop(bucket, true, impact)
        }
      } else if (drop.age > 1.3) {
        drop.active = false
        drop.mesh.visible = false
      }
    }

    for (const splat of splats) {
      if (!splat.active) continue
      splat.age += delta
      const progress = clamp01(splat.age / splat.lifetime)
      const scale = 1 + progress * 1.3
      splat.mesh.scale.set(splat.size * scale, splat.size * 0.72 * scale, splat.size * scale)
      splat.material.opacity = 0.78 * (1 - progress) ** 1.5
      if (progress >= 1) {
        splat.active = false
        splat.mesh.visible = false
      }
    }
  }

  return {
    get finished(): boolean { return time >= CAPTURE_DURATION_SECONDS },
    update(deltaSeconds): CapturePose {
      if (disposed) return { fill: 1, lift: 0, pitch: 0, roll: 0, yaw: 0 }
      const delta = Math.min(deltaSeconds, 0.05)
      time = Math.min(CAPTURE_DURATION_SECONDS, time + delta)
      const ringFade = 1 - smoothstep(0.15, 1.9, time)
      ring.visible = ringFade > 0.01
      ringMaterial.opacity = 0.62 * ringFade
      ring.scale.setScalar(0.45 + smoothstep(0.1, 1.8, time) * 1.7)
      ring.rotation.z += delta * 0.32
      updatePaint(delta)
      animateSignaturePose(rigPose, animalId, time, CAPTURE_DURATION_SECONDS)

      const sparklePulse = smoothstep(5.15, 5.8, time) * (1 - smoothstep(6.45, 6.8, time))
      sparkles.forEach(({ mesh, phase, radius, height, speed }, index) => {
        mesh.visible = sparklePulse > 0.01
        ;(mesh.material as THREE.MeshBasicMaterial).opacity = sparklePulse * (0.7 + 0.3 * Math.sin(time * 8 + phase))
        const angle = phase + time * speed
        mesh.position.set(Math.cos(angle) * radius, height + Math.sin(time * 5 + phase) * 0.1, Math.sin(angle) * radius)
        mesh.rotation.set(time * speed, time * speed * 1.4 + phase, phase)
        const scale = 0.45 + 0.6 * (0.5 + 0.5 * Math.sin(time * 7 + phase))
        mesh.scale.setScalar(index % 2 === 0 ? scale * 1.35 : scale)
      })
      return captureGesture(animalId, time, CAPTURE_DURATION_SECONDS)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      actorParent.remove(effects)
        physicsParent.remove(physicsEffects)
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>(dropMaterials)
      for (const root of [effects, physicsEffects]) {
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          geometries.add(object.geometry)
          if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material))
          else materials.add(object.material)
        })
      }
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      rigPose.forEach(({ object, base }) => object.rotation.copy(base))
    },
  }
}
