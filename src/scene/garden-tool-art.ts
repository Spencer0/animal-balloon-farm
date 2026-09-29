import * as THREE from 'three'

export type GardenToolId = 'grass' | 'shovel'

export interface GardenToolDefinition {
  readonly id: GardenToolId
  readonly hotkey: string
  readonly label: string
  readonly tint: string
  readonly accent: string
}

export const GARDEN_TOOLS: readonly GardenToolDefinition[] = [
  { id: 'grass', hotkey: '1', label: 'Grass Seeder', tint: '#b7d97a', accent: '#f3d78a' },
  { id: 'shovel', hotkey: '2', label: 'Shovel', tint: '#d9a06b', accent: '#e8c78f' },
]

export function createGardenToolModel(id: GardenToolId): THREE.Group {
  return id === 'shovel' ? createShovelModel() : createGrassSeederModel()
}

function createGrassSeederModel(): THREE.Group {
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

function createShovelModel(): THREE.Group {
  const model = new THREE.Group()
  model.name = 'Handmade garden shovel'

  const wood = new THREE.MeshStandardMaterial({ color: '#9c6b45', roughness: 0.52 })
  const lightWood = new THREE.MeshStandardMaterial({ color: '#d7b47a', roughness: 0.46 })
  const brass = new THREE.MeshStandardMaterial({ color: '#d7b765', roughness: 0.3, metalness: 0.48 })
  const steel = new THREE.MeshStandardMaterial({ color: '#c8cdd4', roughness: 0.34, metalness: 0.62 })
  const steelDark = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.42, metalness: 0.55 })
  const dirt = new THREE.MeshStandardMaterial({ color: '#8a6a49', roughness: 0.95 })

  // Shaft rises from the blade toward the cursor ring's grip corner.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.92, 10), wood)
  shaft.position.set(0.18, 0.52, 0)
  shaft.rotation.z = -0.5
  shaft.castShadow = true
  model.add(shaft)

  const ferrule = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 8, 16), brass)
  ferrule.position.set(0.06, 0.29, 0)
  ferrule.rotation.z = -0.5
  model.add(ferrule)

  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.026, 8, 18, Math.PI), lightWood)
  grip.position.set(0.4, 0.9, 0)
  grip.rotation.set(Math.PI / 2, 0, -0.5 + Math.PI)
  grip.castShadow = true
  model.add(grip)

  // Dished blade: flattened sphere socketed into the shaft foot.
  const blade = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), steel)
  blade.position.set(-0.09, 0.1, 0)
  blade.scale.set(0.78, 1.05, 0.5)
  blade.rotation.z = 0.34
  blade.castShadow = true
  model.add(blade)

  const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), steelDark)
  bladeTip.position.set(-0.17, -0.04, 0)
  bladeTip.scale.set(1.15, 1, 0.55)
  bladeTip.rotation.set(0, Math.PI / 4, 0.5)
  model.add(bladeTip)

  // A little carried dirt inside the scoop.
  const load = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), dirt)
  load.position.set(-0.1, 0.17, 0)
  load.scale.set(1, 0.55, 0.9)
  load.visible = false
  load.name = 'Shovel dirt load'
  model.add(load)

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return model
}
