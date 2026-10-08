import * as THREE from 'three'
import { GRASS_PACKS, type GrassPack } from '../game/tool-unlocks'

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
    id: 'grass', hotkey: '2', label: 'Grass Seeder', subtitle: 'Blue for a lawn, green for a meadow',
    description: 'A burlap sack of seed for turning bare soil into a soft patch of meadow.',
    note: 'Hold and drag to sow grass. Right-click to gently trim it back. Press E to swap packs once Pip sells you the tall one.',
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

export function createGardenToolModel(id: GardenToolId, pack: GrassPack = 'short'): THREE.Group {
  if (id === 'hand') return createHandModel()
  if (id === 'shovel') return createShovelModel()
  if (id === 'water') return createWaterBucketModel()
  if (id === 'camera') return createCameraModel()
  return createGrassSeederModel(pack)
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

/**
 * Recolour a seeder model's sack for the pack in hand: blue for short grass,
 * green for tall. Only the sack changes; the twine, sprout and spilled seed
 * keep their colours so the two packs read as one tool.
 */
export function tintSeedPack(model: THREE.Object3D, pack: GrassPack): void {
  const sack = model.userData.packMaterials as { body: THREE.MeshStandardMaterial; shade: THREE.MeshStandardMaterial; light: THREE.MeshStandardMaterial } | undefined
  if (!sack) return
  const definition = GRASS_PACKS[pack]
  sack.body.color.set(definition.sack)
  sack.shade.color.set(definition.sackShade)
  sack.light.color.set(definition.sackLight)
  model.userData.pack = pack
}

function createGrassSeederModel(pack: GrassPack): THREE.Group {
  const model = new THREE.Group()
  model.name = 'Grass seed bag'

  const burlap = new THREE.MeshStandardMaterial({ color: '#c9a06b', roughness: 0.92 })
  const burlapDark = new THREE.MeshStandardMaterial({ color: '#b58e5c', roughness: 0.94 })
  const burlapLight = new THREE.MeshStandardMaterial({ color: '#d4af75', roughness: 0.9 })
  model.userData.packMaterials = { body: burlap, shade: burlapDark, light: burlapLight }
  const twine = new THREE.MeshStandardMaterial({ color: '#8a6f3f', roughness: 0.85 })
  const sprout = new THREE.MeshStandardMaterial({ color: '#6fa055', roughness: 0.62 })
  const seedTan = new THREE.MeshStandardMaterial({ color: '#a5804e', roughness: 0.7 })
  const seedGreen = new THREE.MeshStandardMaterial({ color: '#7fae62', roughness: 0.7 })

  // Slouching sack body, flattened front-to-back like the other tool reliefs.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 22, 16), burlap)
  body.position.set(0, 0.32, 0)
  body.scale.set(1, 1.12, 0.62)
  body.castShadow = true
  body.receiveShadow = true
  model.add(body)

  // Cinched neck gathered under the tie.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.22, 16), burlapDark)
  neck.position.set(0, 0.76, 0)
  model.add(neck)
  const ruffle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), burlapLight)
  ruffle.position.set(0, 0.9, 0)
  ruffle.scale.set(1, 0.62, 0.7)
  model.add(ruffle)

  // Twine tie with a knot and two bow ends.
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 20), twine)
  tie.position.set(0, 0.8, 0)
  tie.rotation.x = Math.PI / 2
  model.add(tie)
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), twine)
  knot.position.set(0.15, 0.8, 0.05)
  model.add(knot)
  for (const side of [-1, 1] as const) {
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.16, 8), twine)
    bow.position.set(0.15 + side * 0.05, 0.71, 0.05)
    bow.rotation.z = side * 0.5
    model.add(bow)
  }

  // Stitched sprout emblem on the front of the sack.
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), burlapDark)
  patch.position.set(0, 0.34, 0.2)
  model.add(patch)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 8), sprout)
  stem.position.set(0, 0.33, 0.21)
  model.add(stem)
  for (const side of [-1, 1] as const) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), sprout)
    leaf.position.set(side * 0.07, 0.43, 0.21)
    leaf.scale.set(1.3, 0.5, 0.4)
    leaf.rotation.z = side * -0.5
    model.add(leaf)
  }

  // Spilled seeds scattered at the foot of the sack.
  const spillSpecs = [
    [-0.2, 0.02, 0.16, 0, 1],
    [-0.08, 0.0, 0.22, 1, 0.85],
    [0.06, 0.01, 0.18, 0, 0.9],
    [0.18, 0.03, 0.24, 1, 1],
    [0.28, 0.0, 0.14, 0, 0.8],
  ] as const
  for (const [x, y, z, colorIndex, scale] of spillSpecs) {
    const spill = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 * scale, 10, 8),
      colorIndex === 0 ? seedTan : seedGreen,
    )
    spill.position.set(x, y, z)
    spill.scale.set(1, 0.6, 0.9)
    model.add(spill)
  }

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  tintSeedPack(model, pack)
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
  model.name = 'Storybook garden shovel'

  const wood = new THREE.MeshStandardMaterial({ color: '#a8754c', roughness: 0.54 })
  const lightWood = new THREE.MeshStandardMaterial({ color: '#d7b47a', roughness: 0.48 })
  const brass = new THREE.MeshStandardMaterial({ color: '#d7b765', roughness: 0.3, metalness: 0.48 })
  const twine = new THREE.MeshStandardMaterial({ color: '#8a6f3f', roughness: 0.85 })
  const steel = new THREE.MeshStandardMaterial({ color: '#c3ccd6', roughness: 0.32, metalness: 0.6 })
  const steelDark = new THREE.MeshStandardMaterial({ color: '#98a1ac', roughness: 0.42, metalness: 0.55 })
  const sprout = new THREE.MeshStandardMaterial({ color: '#6fa055', roughness: 0.62 })

  // Shaft rises from the blade toward the cursor ring's grip corner.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.92, 12), wood)
  shaft.position.set(0.18, 0.52, 0)
  shaft.rotation.z = -0.5
  shaft.castShadow = true
  model.add(shaft)

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.016, 8, 18), brass)
  collar.position.set(0.3, 0.74, 0)
  collar.rotation.z = -0.5
  model.add(collar)

  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.028, 8, 18, Math.PI), lightWood)
  grip.position.set(0.4, 0.9, 0)
  grip.rotation.set(Math.PI / 2, 0, -0.5 + Math.PI)
  grip.castShadow = true
  model.add(grip)

  // Twine wrap where the shaft meets the blade, echoing the seed bag's tie.
  for (const index of [0, 1, 2] as const) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 8, 16), twine)
    wrap.position.set(0.055 - index * 0.028, 0.27 - index * 0.016, 0)
    wrap.rotation.z = -0.5
    model.add(wrap)
  }

  // Round, friendly blade: darker steel edge behind a dished face.
  const bladeEdge = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), steelDark)
  bladeEdge.position.set(-0.1, 0.08, -0.015)
  bladeEdge.scale.set(0.82, 1.08, 0.42)
  bladeEdge.rotation.z = 0.34
  bladeEdge.castShadow = true
  model.add(bladeEdge)

  const blade = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), steel)
  blade.position.set(-0.09, 0.1, 0.03)
  blade.scale.set(0.78, 1.05, 0.4)
  blade.rotation.z = 0.34
  blade.castShadow = true
  model.add(blade)

  // Sprout stamp on the blade face, matching the seed bag's emblem.
  const stampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.09, 8), sprout)
  stampStem.position.set(-0.09, 0.1, 0.12)
  model.add(stampStem)
  for (const side of [-1, 1] as const) {
    const stampLeaf = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), sprout)
    stampLeaf.position.set(-0.09 + side * 0.04, 0.16, 0.12)
    stampLeaf.scale.set(1.3, 0.5, 0.4)
    stampLeaf.rotation.z = side * -0.5
    model.add(stampLeaf)
  }

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return model
}
