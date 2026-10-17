import * as THREE from 'three'
import { cloneCastCritter, type CareCritterName } from '../plant-models'

/**
 * The root vegetable games' shared bits: their cast critters fitted to a size,
 * and a soft glow for targets. The cast is loaded before a root game is built
 * (the player waits for it), so a missing critter means the GLB failed to load
 * and the game draws a plain stand-in instead.
 */

/** Fit a model so its longest side is `size`, standing on y = 0 and centred on x and z. */
export function fitCritter(object: THREE.Object3D, size: number): THREE.Group {
  const wrapper = new THREE.Group()
  wrapper.add(object)
  object.updateMatrixWorld(true)
  const extent = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  object.scale.setScalar(size / Math.max(1e-4, extent.x, extent.y, extent.z))
  object.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(object)
  const centre = fitted.getCenter(new THREE.Vector3())
  object.position.set(-centre.x, -fitted.min.y, -centre.z)
  return wrapper
}

/**
 * A root cast critter fitted to `size` (its longest side), or a plain stand-in
 * of that size when the cast is missing. `centred` puts its middle on the origin
 * instead of its feet (for balls and rolling barrels).
 */
export function rootCritter(name: CareCritterName<'root'>, size: number, standIn: () => THREE.Object3D, centred = false): THREE.Group {
  const model = cloneCastCritter('root', name)
  const fitted = fitCritter(model ?? standIn(), size)
  if (centred) {
    const inner = fitted.children[0]
    fitted.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(inner)
    inner.position.y -= box.getCenter(new THREE.Vector3()).y
  }
  fitted.name = `Root cast · ${name}`
  return fitted
}

/** A soft round glow, drawn once per game, for halos behind targets. */
export function glowTexture(inner = 'rgba(255,250,210,0.95)', outer = 'rgba(255,236,150,0)'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for a root game glow')
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31)
  gradient.addColorStop(0, inner)
  gradient.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.45)'))
  gradient.addColorStop(1, outer)
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A plain coloured stand-in mesh, for a critter whose model is missing. Its parts go on `owned`. */
export function standInMesh(geometry: THREE.BufferGeometry, color: string, owned: Array<{ dispose(): void }>): () => THREE.Mesh {
  return () => {
    const material = new THREE.MeshLambertMaterial({ color })
    owned.push(geometry, material)
    return new THREE.Mesh(geometry, material)
  }
}
