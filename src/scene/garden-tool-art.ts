import * as THREE from 'three'

export type GardenToolId = 'hand' | 'grass' | 'shovel' | 'water' | 'camera'

export interface GardenToolDefinition {
  readonly id: GardenToolId
  readonly hotkey: string
  readonly label: string
  readonly subtitle: string
  readonly description: string
  readonly note: string
  readonly tint: string
  readonly accent: string
}

export const GARDEN_TOOLS: readonly GardenToolDefinition[] = [
  {
    id: 'hand', hotkey: '1', label: 'Hand', subtitle: 'Select and interact',
    description: 'A gentle hand for meeting the garden and its animals.',
    note: 'Click a plant or animal to learn about it. Care for plants and choose seeds with this tool.',
    tint: '#e9c58e', accent: '#f3dfb0',
  },
  {
    id: 'grass', hotkey: '2', label: 'Grass Seeder', subtitle: 'A little green goes a long way',
    description: 'A trusty hand tool for turning bare soil into a soft patch of meadow.',
    note: 'Hold and drag to sow grass. Right-click to gently trim it back.',
    tint: '#b7d97a', accent: '#f3d78a',
  },
  {
    id: 'shovel', hotkey: '3', label: 'Shovel', subtitle: 'Lift, turn, and tidy the soil',
    description: 'A sturdy garden shovel for digging up a planting spot and moving soil around.',
    note: 'Click the ground to dig a hole, then drop a seed or a friend right into it.',
    tint: '#d9a06b', accent: '#e8c78f',
  },
  {
    id: 'water', hotkey: '4', label: 'Water Bucket', subtitle: 'Pour a puddle, or bail it away',
    description: 'A little water goes where the garden dips, settling into a still, level pond.',
    note: 'Hold left-click to pour. Hold right-click to drain.',
    tint: '#77c9d5', accent: '#b3edf0',
  },
  {
    id: 'camera', hotkey: 'space', label: 'Camera', subtitle: 'Compose the farm',
    description: 'A little field camera for framing the farm and the friends in it.',
    note: 'Drag to orbit the view. Right-click for a gentle cinematic tour. Middle-click to return to the opening shot.',
    tint: '#a9b8d6', accent: '#f0e2b8',
  },
]

export function createGardenToolModel(id: GardenToolId): THREE.Group {
  if (id === 'hand') return createHandModel()
  if (id === 'shovel') return createShovelModel()
  if (id === 'water') return createWaterBucketModel()
  if (id === 'camera') return createCameraModel()
  return createGrassSeederModel()
}

function createHandModel(): THREE.Group {
  const model = new THREE.Group()
  model.name = 'Hand interact tool'
  const skin = new THREE.MeshStandardMaterial({ color: '#efc894', roughness: 0.56 })
  const cuff = new THREE.MeshStandardMaterial({ color: '#7eaa78', roughness: 0.62 })
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), skin)
  palm.scale.set(0.86, 1.08, 0.38)
  palm.position.set(0, 0.05, 0)
  model.add(palm)
  const fingerSpecs = [
    { x: -0.23, y: 0.43, length: 0.39, tilt: -0.17 },
    { x: -0.08, y: 0.48, length: 0.47, tilt: -0.05 },
    { x: 0.08, y: 0.47, length: 0.44, tilt: 0.05 },
    { x: 0.23, y: 0.39, length: 0.35, tilt: 0.16 },
  ]
  for (const finger of fingerSpecs) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, finger.length, 4, 8), skin)
    mesh.position.set(finger.x, finger.y, 0)
    mesh.rotation.z = finger.tilt
    model.add(mesh)
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.22, 4, 8), skin)
  thumb.position.set(-0.31, 0.04, 0.015)
  thumb.rotation.z = -0.88
  model.add(thumb)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.25, 20), cuff)
  sleeve.position.set(0, -0.31, 0)
  model.add(sleeve)
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return model
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

function createWaterBucketModel(): THREE.Group {
  const model = new THREE.Group()
  model.name = 'Handmade garden water bucket'

  const copper = new THREE.MeshStandardMaterial({ color: '#ba8257', roughness: 0.4, metalness: 0.42 })
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#e0bd85', roughness: 0.34, metalness: 0.38 })
  const water = new THREE.MeshStandardMaterial({ color: '#62c5d5', roughness: 0.2, metalness: 0.08 })

  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.27, 18, 1, true), copper)
  bucket.position.set(-0.05, 0.19, 0)
  model.add(bucket)

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.035, 18), rimMaterial)
  base.position.set(-0.05, 0.055, 0)
  model.add(base)

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 22), rimMaterial)
  rim.position.set(-0.05, 0.325, 0)
  model.add(rim)

  const waterSurface = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), water)
  waterSurface.rotation.x = -Math.PI / 2
  waterSurface.position.set(-0.05, 0.29, 0)
  model.add(waterSurface)

  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.014, 7, 20, Math.PI), rimMaterial)
  bail.position.set(-0.05, 0.3, 0)
  bail.rotation.set(Math.PI / 2, 0, 0)
  model.add(bail)

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return model
}

/**
 * A little field camera: leather body, brass lens barrel, glass eye. Built as
 * a relief in the XY plane like the other tools, because the tool bar tips
 * every model toward the camera rather than showing its back.
 */
function createCameraModel(): THREE.Group {
  const model = new THREE.Group()
  model.name = 'Handmade field camera'

  const leather = new THREE.MeshStandardMaterial({ color: '#5d4736', roughness: 0.68 })
  const leatherLight = new THREE.MeshStandardMaterial({ color: '#7c6047', roughness: 0.6 })
  const brass = new THREE.MeshStandardMaterial({ color: '#d7b765', roughness: 0.3, metalness: 0.48 })
  const dark = new THREE.MeshStandardMaterial({ color: '#2f2a26', roughness: 0.44, metalness: 0.35 })
  const glass = new THREE.MeshStandardMaterial({
    color: '#8fd0dc', roughness: 0.16, metalness: 0.12,
    emissive: '#1d4b52', emissiveIntensity: 0.35,
  })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.56, 0.26), leather)
  body.position.set(0, 0.34, 0)
  body.castShadow = true
  body.receiveShadow = true
  model.add(body)

  const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.09, 0.28), leatherLight)
  topPlate.position.set(0, 0.66, 0)
  model.add(topPlate)

  const lensHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.14, 24), dark)
  lensHousing.rotation.x = Math.PI / 2
  lensHousing.position.set(-0.16, 0.33, 0.19)
  model.add(lensHousing)

  const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.16, 24), brass)
  lensBarrel.rotation.x = Math.PI / 2
  lensBarrel.position.set(-0.16, 0.33, 0.3)
  model.add(lensBarrel)

  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), glass)
  lensGlass.position.set(-0.16, 0.33, 0.385)
  model.add(lensGlass)

  const viewfinder = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.18), dark)
  viewfinder.position.set(0.24, 0.74, 0)
  model.add(viewfinder)

  const finderGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.08), glass)
  finderGlass.position.set(0.24, 0.74, 0.1)
  model.add(finderGlass)

  const winder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 18), brass)
  winder.rotation.x = Math.PI / 2
  winder.position.set(0.34, 0.52, 0.18)
  model.add(winder)

  const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 14), brass)
  shutter.position.set(0.34, 0.72, 0)
  model.add(shutter)

  for (const side of [-1, 1] as const) {
    const lug = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 14), brass)
    lug.position.set(side * 0.45, 0.62, 0)
    model.add(lug)
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

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return model
}
