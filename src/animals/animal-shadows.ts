import * as THREE from 'three'
import type { BalloonAnimal } from './balloon-animal'

/**
 * Cheap contact shadows for every animal: one InstancedMesh of a soft radial
 * decal laid on the ground under each one, so the whole herd costs a single
 * draw call. The sun's shadow map deliberately does not include animals (they
 * move every frame, which would force a map redraw every frame), so this is
 * what stops them floating.
 *
 * Plain MeshBasicMaterial and a CanvasTexture: no shader, so WebGL and
 * WebGPURenderer both draw it without a TSL twin.
 */

/** Height above the ground (world units) at which a shadow has shrunk away. */
const SHADOW_FADE_HEIGHT = 3.2
/** Lift over the ground so the decal clears the lawn; polygonOffset does the rest. */
const GROUND_LIFT = 0.025
/** The decal is a little longer than wide: animals face +X and are longer than they are broad. */
const LENGTH_SCALE = 1.25
const WIDTH_SCALE = 0.85
/** Peak darkness of the decal's centre at noon. */
const DAY_OPACITY = 0.5
const NIGHT_OPACITY = 0.28

/**
 * How big a shadow is, as a fraction of its resting size, for an animal `height`
 * above the ground: full on the ground, easing to nothing as it rises (a flier
 * aloft, a captured balloon floating up).
 */
export function shadowSizeFactor(height: number): number {
  const lift = Math.min(Math.max(height / SHADOW_FADE_HEIGHT, 0), 1)
  const eased = 1 - lift * lift * (3 - 2 * lift)
  return eased
}

export interface AnimalShadows {
  readonly mesh: THREE.InstancedMesh
  /** Place a decal under each shown animal in every group (the herd, harness crowd fixtures). `daylight` is 0 (night) to 1 (day). */
  update(groups: readonly (readonly BalloonAnimal[])[], daylight: number): void
  dispose(): void
}

function createShadowTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(0,0,0,1)')
    gradient.addColorStop(0.35, 'rgba(0,0,0,0.75)')
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.22)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.name = 'Animal contact shadow · radial gradient'
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createAnimalShadows(parent: THREE.Object3D, capacity: number): AnimalShadows {
  const texture = createShadowTexture()
  const geometry = new THREE.PlaneGeometry(2, 2)
  geometry.rotateX(-Math.PI / 2)
  geometry.name = 'Animal contact shadow · unit decal'
  const material = new THREE.MeshBasicMaterial({
    name: 'Animal contact shadow',
    color: '#000000',
    map: texture,
    transparent: true,
    opacity: DAY_OPACITY,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.name = 'Animal contact shadows · one draw call'
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  parent.add(mesh)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)

  return {
    mesh,
    update(groups, daylight): void {
      material.opacity = NIGHT_OPACITY + (DAY_OPACITY - NIGHT_OPACITY) * THREE.MathUtils.clamp(daylight, 0, 1)
      let count = 0
      for (const animals of groups) for (const animal of animals) {
        if (count >= capacity) break
        const root = animal.root
        if (!root.visible || animal.isSold) continue
        const ground = animal.groundHeight
        const factor = shadowSizeFactor(root.position.y - ground)
        if (factor <= 0.01) continue
        const radius = animal.footprintRadius * factor
        position.set(root.position.x, ground + GROUND_LIFT, root.position.z)
        rotation.setFromAxisAngle(up, animal.currentHeading)
        scale.set(radius * LENGTH_SCALE, 1, radius * WIDTH_SCALE)
        matrix.compose(position, rotation, scale)
        mesh.setMatrixAt(count, matrix)
        count += 1
      }
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
      mesh.visible = count > 0
    },
    dispose(): void {
      parent.remove(mesh)
      mesh.dispose()
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
