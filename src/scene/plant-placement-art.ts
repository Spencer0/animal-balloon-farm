import * as THREE from 'three'
import type { PlantId, PlantSubstrate } from '../game/plants'

/**
 * What the player sees while holding a seed over the garden:
 *
 * - a see-through ghost of the grown plant itself, bobbing gently, so you
 *   place a bush and not a circle;
 * - under it, a soft patch of the ground the plant wants (dug earth, turf or
 *   pond), fading into the lawn, sized to the room the plant claims;
 * - round that, a cream dashed ring that slowly turns, in the Farm Journal
 *   palette rather than a neon ring.
 *
 * A spot the plant refuses turns the ring terracotta, blushes the ghost and
 * gives it a little "no" shake.
 */

export interface PlacementArt {
  readonly root: THREE.Group
  /** Show `species` at its claim radius; builds the ghost the first time a species is shown. */
  show(species: PlantId, substrate: PlantSubstrate, radius: number, valid: boolean, shaking: boolean): void
  hide(): void
  update(deltaSeconds: number): void
  dispose(): void
}

const VALID_RING = new THREE.Color('#fff2cf')
const INVALID_RING = new THREE.Color('#e0603f')
const PATCH_TINT: Readonly<Record<PlantSubstrate, string>> = {
  soil: '#7a5236',
  grass: '#5f9a48',
  water: '#6fb7c9',
  unknown: '#7a5236',
}
const GHOST_OPACITY = 0.58

function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for plant placement art')
  draw(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A soft round patch, darker in the middle, with a few clods for texture. */
function patchTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (context) => {
    const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 126)
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.75)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
    context.fillStyle = 'rgba(0,0,0,0.16)'
    for (let index = 0; index < 34; index += 1) {
      const angle = index * 2.399
      const radius = 18 + (index * 37 % 80)
      context.beginPath()
      context.ellipse(128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius, 5 + (index % 3) * 2, 3 + (index % 2) * 2, angle, 0, Math.PI * 2)
      context.fill()
    }
  })
}

/** Rounded dashes round a circle, white so the material colour tints them. */
function ringTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (context) => {
    context.lineCap = 'round'
    const dashes = 22
    for (const [width, style] of [[15, 'rgba(70,45,28,0.45)'], [9, 'rgba(255,255,255,1)']] as const) {
      context.lineWidth = width
      context.strokeStyle = style
      for (let dash = 0; dash < dashes; dash += 1) {
        const start = dash / dashes * Math.PI * 2
        context.beginPath()
        context.arc(128, 128, 112, start, start + Math.PI * 2 / dashes * 0.55)
        context.stroke()
      }
    }
  })
}

/** A model to ghost, and how to free what it owns once the ghost is gone. */
export interface GhostModel {
  readonly object: THREE.Object3D
  dispose(): void
}

interface Ghost {
  readonly model: GhostModel
  readonly object: THREE.Object3D
  readonly materials: THREE.Material[]
  readonly baseColors: THREE.Color[]
}

export function createPlacementArt(buildGhostModel: (species: PlantId) => GhostModel | null): PlacementArt {
  const root = new THREE.Group()
  root.name = 'Plant placement preview'
  root.visible = false

  const patchMap = patchTexture()
  const ringMap = ringTexture()
  const patchMaterial = new THREE.MeshBasicMaterial({ map: patchMap, color: PATCH_TINT.soil, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  const ringMaterial = new THREE.MeshBasicMaterial({ map: ringMap, color: VALID_RING, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
  const plane = new THREE.PlaneGeometry(2, 2)
  const patch = new THREE.Mesh(plane, patchMaterial)
  patch.name = 'Placement soil patch'
  patch.rotation.x = -Math.PI / 2
  patch.position.y = 0.02
  patch.renderOrder = 890
  const ring = new THREE.Mesh(plane, ringMaterial)
  ring.name = 'Placement dashed ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.04
  ring.renderOrder = 899
  root.add(patch, ring)

  const ghosts = new Map<PlantId, Ghost | null>()
  let current: Ghost | null = null
  let currentSpecies: PlantId | null = null
  let valid = true
  let shaking = false
  let time = 0
  let ringRadius = 1
  const ringColor = VALID_RING.clone()

  function ghostFor(species: PlantId): Ghost | null {
    if (ghosts.has(species) && ghosts.get(species)) return ghosts.get(species) ?? null
    const built = buildGhostModel(species)
    if (!built) return null
    const model = built.object
    const materials: THREE.Material[] = []
    const swaps = new Map<THREE.Material, THREE.Material>()
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = false
      object.receiveShadow = false
      object.renderOrder = 895
      const swap = (material: THREE.Material): THREE.Material => {
        let clone = swaps.get(material)
        if (!clone) {
          clone = material.clone()
          clone.transparent = true
          clone.opacity = GHOST_OPACITY * (material.opacity ?? 1)
          clone.depthWrite = false
          swaps.set(material, clone)
          materials.push(clone)
        }
        return clone
      }
      object.material = Array.isArray(object.material) ? object.material.map(swap) : swap(object.material)
    })
    const baseColors = materials.map((material) => ('color' in material && material.color instanceof THREE.Color ? material.color.clone() : new THREE.Color('#ffffff')))
    const ghost = { model: built, object: model, materials, baseColors }
    ghosts.set(species, ghost)
    return ghost
  }

  function tintGhost(ghost: Ghost, refused: boolean): void {
    const blush = new THREE.Color('#ff7a5c')
    ghost.materials.forEach((material, index) => {
      if (!('color' in material) || !(material.color instanceof THREE.Color)) return
      material.color.copy(ghost.baseColors[index] ?? blush)
      if (refused) material.color.lerp(blush, 0.55)
    })
  }

  return {
    root,
    show(species, substrate, radius, isValid, isShaking): void {
      root.visible = true
      if (species !== currentSpecies || !current) {
        if (current) root.remove(current.object)
        current = ghostFor(species)
        currentSpecies = species
        if (current) {
          root.add(current.object)
          tintGhost(current, !isValid)
        }
      }
      if (current && isValid !== valid) tintGhost(current, !isValid)
      valid = isValid
      shaking = isShaking
      patchMaterial.color.set(PATCH_TINT[substrate])
      patch.scale.setScalar(radius * 1.05)
      ringRadius = radius * 1.08
    },
    hide(): void {
      root.visible = false
    },
    update(deltaSeconds): void {
      if (!root.visible) return
      time += deltaSeconds
      ringColor.lerp(valid ? VALID_RING : INVALID_RING, Math.min(1, deltaSeconds * 14))
      ringMaterial.color.copy(ringColor)
      ring.rotation.z = time * 0.35
      ring.scale.setScalar(ringRadius * (1 + Math.sin(time * 4) * 0.025))
      ringMaterial.opacity = valid ? 0.95 : 0.85 + Math.sin(time * 18) * 0.15
      if (current) {
        const shake = shaking ? Math.sin(time * 48) * 0.06 : 0
        current.object.position.set(shake, 0.06 + Math.sin(time * 2.4) * 0.03, 0)
        current.object.rotation.y = Math.sin(time * 0.9) * 0.18
      }
    },
    dispose(): void {
      for (const ghost of ghosts.values()) {
        if (!ghost) continue
        for (const material of ghost.materials) material.dispose()
        ghost.object.removeFromParent()
        ghost.model.dispose()
      }
      ghosts.clear()
      plane.dispose()
      patchMaterial.dispose()
      ringMaterial.dispose()
      patchMap.dispose()
      ringMap.dispose()
    },
  }
}
