import * as THREE from 'three'

export type GardenToolId = 'grass'

export interface GardenToolDefinition {
  readonly id: GardenToolId
  readonly hotkey: string
  readonly label: string
  readonly tint: string
  readonly accent: string
}

export const GARDEN_TOOLS: readonly GardenToolDefinition[] = [
  { id: 'grass', hotkey: '1', label: 'Grass Seeder', tint: '#b7d97a', accent: '#f3d78a' },
]

export function createGardenToolModel(): THREE.Group {
  const model = new THREE.Group()
  model.name = 'Handmade grass seeder'

  const wood = new THREE.MeshStandardMaterial({ color: '#a8754c', roughness: 0.54 })
  const lightWood = new THREE.MeshStandardMaterial({ color: '#d7b47a', roughness: 0.48 })
  const brass = new THREE.MeshStandardMaterial({ color: '#d7b765', roughness: 0.3, metalness: 0.48 })
  const jarMaterial = new THREE.MeshStandardMaterial({ color: '#d4b77e', roughness: 0.44 })
  const leafMaterials = ['#9fbe69', '#b9d47b', '#739f5b'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.62 }))

  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.3, 20), jarMaterial)
  jar.position.set(-0.05, 0.38, 0)
  jar.castShadow = true
  jar.receiveShadow = true
  model.add(jar)

  const jarFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.035, 20), brass)
  jarFoot.position.set(-0.05, 0.23, 0)
  model.add(jarFoot)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 24), brass)
  rim.position.set(-0.05, 0.53, 0)
  model.add(rim)
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), lightWood)
  lid.position.set(-0.05, 0.54, 0)
  lid.scale.y = 0.38
  model.add(lid)

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.72, 12), wood)
  handle.position.set(0.31, 0.76, 0)
  handle.rotation.z = -0.56
  handle.castShadow = true
  model.add(handle)
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), lightWood)
  grip.position.set(0.53, 1.06, 0)
  grip.scale.set(1.15, 0.76, 0.85)
  model.add(grip)
  const ferrule = new THREE.Mesh(new THREE.TorusGeometry(0.057, 0.014, 8, 18), brass)
  ferrule.position.set(0.11, 0.48, 0)
  ferrule.rotation.z = -0.56
  model.add(ferrule)

  for (const [x, z, colorIndex, scale] of [
    [-0.17, 0.04, 0, 1],
    [0.02, 0.12, 1, 0.82],
    [0.03, -0.12, 2, 0.76],
  ] as const) {
    const seed = new THREE.Mesh(new THREE.SphereGeometry(0.055 * scale, 10, 8), leafMaterials[colorIndex])
    seed.position.set(x, 0.59, z)
    seed.scale.set(1, 0.76, 0.86)
    model.add(seed)
  }

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return model
}
