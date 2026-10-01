import * as THREE from 'three'
import { SHOWCASE_ANIMALS } from '../animals/balloon-catalog'
import type { BalloonAnimalId } from '../animals/animal-catalog'
import type { Fairground } from './fairground'
import { GARDEN_LAWN_Y } from './fairground'

export { GARDEN_LAWN_Y }

export { SHOWCASE_ANIMALS } from '../animals/balloon-catalog'

function standard(color: THREE.ColorRepresentation, roughness = 0.62): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.025 })
}

/**
 * Builds the capture-viewer stage. `cast` limits which species get plinths —
 * the review booth stages one model at a time, so an empty stage never
 * advertises species that are not part of the current cast.
 */
export function createCaptureShowcaseStage(cast?: readonly BalloonAnimalId[]): Fairground {
  const root = new THREE.Group()
  root.name = 'Balloon animal capture showcase stage'

  // A finite disc, not an endless plane: the orthographic camera sees far past
  // the stage, and an infinite ground filled the whole screen with flat green
  // so the viewer never showed the sky behind the set.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(44, 96),
    new THREE.MeshStandardMaterial({ color: '#77b96a', roughness: 0.96 }),
  )
  ground.name = 'Soft green showcase ground'
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.38
  ground.receiveShadow = true
  root.add(ground)

  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(12.4, 12.75, 0.44, 96),
    standard('#b98258', 0.76),
  )
  stage.name = 'Rounded-edge carnival color reveal stage'
  stage.position.y = GARDEN_LAWN_Y - 0.23
  stage.castShadow = true
  stage.receiveShadow = true
  root.add(stage)

  const stageTop = new THREE.Mesh(
    new THREE.CylinderGeometry(12.15, 12.3, 0.08, 96),
    standard('#e6ca91', 0.69),
  )
  stageTop.position.y = GARDEN_LAWN_Y + 0.015
  stageTop.receiveShadow = true
  root.add(stageTop)

  for (const [radius, tube, color, y] of [
    [12.42, 0.075, '#fff0c5', GARDEN_LAWN_Y - 0.02],
    [11.96, 0.035, '#65b0a0', GARDEN_LAWN_Y + 0.065],
  ] as const) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 96), standard(color, 0.42))
    trim.rotation.x = Math.PI / 2
    trim.position.y = y
    root.add(trim)
  }

  const staged = Object.entries(SHOWCASE_ANIMALS) as [BalloonAnimalId, typeof SHOWCASE_ANIMALS[BalloonAnimalId]][]
  for (const [id, { spawn, color, accent }] of cast ? staged.filter(([id]) => cast.includes(id)) : staged) {
    const [x, z] = spawn
    const pedestal = new THREE.Group()
    pedestal.name = `${id} · palette display plinth`
    pedestal.position.set(x, 0, z)

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.16, 0.24, 48), standard('#9f684b', 0.68))
    foot.position.y = GARDEN_LAWN_Y - 0.12
    foot.castShadow = true
    foot.receiveShadow = true
    pedestal.add(foot)

    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.96, 2.04, 0.1, 48), standard('#f8e7bb', 0.56))
    top.position.y = GARDEN_LAWN_Y + 0.05
    top.castShadow = true
    top.receiveShadow = true
    pedestal.add(top)

    const paletteRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.88, 0.055, 8, 48),
      new THREE.MeshStandardMaterial({ color, emissive: accent, emissiveIntensity: 0.12, roughness: 0.34 }),
    )
    paletteRing.rotation.x = Math.PI / 2
    paletteRing.position.y = GARDEN_LAWN_Y + 0.115
    pedestal.add(paletteRing)

    const center = new THREE.Mesh(new THREE.CircleGeometry(1.75, 48), standard('#9ac879', 0.94))
    center.rotation.x = -Math.PI / 2
    center.position.y = GARDEN_LAWN_Y + 0.105
    center.receiveShadow = true
    pedestal.add(center)
    root.add(pedestal)
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.035, 8, 48),
    new THREE.MeshStandardMaterial({ color: '#fff1c6', emissive: '#ffe18c', emissiveIntensity: 0.3, roughness: 0.3 }),
  )
  halo.rotation.x = Math.PI / 2
  halo.position.set(0, GARDEN_LAWN_Y + 0.16, 0)
  root.add(halo)

  return { root, update(): void {} }
}
