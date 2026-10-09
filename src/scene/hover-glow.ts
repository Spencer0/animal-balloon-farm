/**
 * The hover glow: a soft pool of light on the lawn under whatever the pointer
 * can pick. It sits on the ground rather than on the model, so it reads the
 * same for a detailed animal, a distant one drawn by the crowd, a placed prop,
 * or a plant, and it never has to touch a material the model shares.
 */
import * as THREE from 'three'

export interface HoverGlowTarget {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Half the footprint of the thing under the pointer, in garden metres. */
  readonly radius: number
}

export interface HoverGlow {
  readonly root: THREE.Group
  show(target: HoverGlowTarget): void
  hide(): void
  update(deltaSeconds: number, timeSeconds: number): void
  dispose(): void
}

/** The glow spreads a little past the footprint so it reads as light, not an outline. */
const SPREAD = 2.6
/** How quickly the glow fades in and out, in damping units. */
const FADE_RATE = 14
const PEAK_OPACITY = 0.7

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255, 248, 214, 1)')
    gradient.addColorStop(0.42, 'rgba(255, 226, 140, 0.6)')
    gradient.addColorStop(1, 'rgba(255, 214, 120, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createHoverGlow(): HoverGlow {
  const root = new THREE.Group()
  root.name = 'Hover glow'
  root.visible = false

  const texture = createGlowTexture()
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: PEAK_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 3
  root.add(mesh)

  const geometry = mesh.geometry
  let wanted: HoverGlowTarget | null = null
  let fade = 0

  return {
    root,
    show(target): void {
      wanted = target
      mesh.position.set(target.x, target.y + 0.03, target.z)
    },
    hide(): void {
      wanted = null
    },
    update(deltaSeconds, timeSeconds): void {
      const dt = Math.max(0, deltaSeconds)
      fade = THREE.MathUtils.damp(fade, wanted ? 1 : 0, FADE_RATE, dt)
      if (!wanted && fade < 0.01) {
        root.visible = false
        fade = 0
        return
      }
      // A slow breath, so the glow reads as alive rather than a fixed stamp.
      const breath = 0.5 + 0.5 * Math.sin(timeSeconds * 3.2)
      if (wanted) {
        const size = wanted.radius * SPREAD * (1 + breath * 0.05)
        mesh.scale.set(size, size, 1)
      }
      material.opacity = PEAK_OPACITY * fade * (0.85 + 0.15 * breath)
      root.visible = true
    },
    dispose(): void {
      geometry.dispose()
      material.dispose()
      texture.dispose()
      root.removeFromParent()
    },
  }
}
