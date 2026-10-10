import * as THREE from 'three'
import { GRASS_PACKS, type GrassPack } from '../game/tool-unlocks'

export type GardenToolId = 'grass' | 'shovel' | 'water' | 'snower'

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
    id: 'grass', hotkey: '1', label: 'Grass Seeder', subtitle: 'Blue for a lawn, green for a meadow',
    description: 'A burlap sack of seed for turning bare soil into a soft patch of meadow.',
    note: 'Hold and drag to sow grass. Right-click to gently trim it back. Press E to swap packs once Pip sells you the tall one.',
    tint: '#b7d97a', accent: '#f3d78a',
  },
  {
    id: 'shovel', hotkey: '2', label: 'Shovel', subtitle: 'Lift, turn, and tidy the soil',
    description: 'A sturdy garden shovel for digging up a planting spot and moving soil around.',
    note: 'Click the ground to dig a hole, then drop a seed or a friend right into it.',
    tint: '#d9a06b', accent: '#e8c78f',
  },
  {
    id: 'water', hotkey: '3', label: 'Water Bucket', subtitle: 'Pour a puddle, or bail it away',
    description: 'A little water goes where the garden dips, settling into a still, level pond.',
    note: 'Hold left-click to pour. Hold right-click to drain.',
    tint: '#77c9d5', accent: '#b3edf0',
  },
  {
    id: 'snower', hotkey: '4', label: 'Snower', subtitle: 'An icy balloon leaf blower for snow',
    description: 'A leaf blower that was left in the freezer and then handed to a balloon: it puffs snow instead of leaves.',
    note: 'Hold left-click to blow snow over the lawn. Hold right-click to melt it back to grass.',
    tint: '#cfeaff', accent: '#ffffff',
  },
]

export function createGardenToolModel(id: GardenToolId, pack: GrassPack = 'short'): THREE.Group {
  if (id === 'shovel') return createShovelModel()
  if (id === 'water') return createWaterBucketModel()
  if (id === 'snower') return createSnowerModel()
  return createGrassSeederModel(pack)
}

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

/**
 * The Snower: a leaf blower dressed as a party balloon left out in the cold.
 * A glossy pale-blue balloon is the motor housing, a stripy twisted nozzle
 * runs out of its knot toward the brush ring (-x, like the shovel's blade), and
 * a coral loop handle sits on top. Icicles hang from the mouth.
 */
function createSnowerModel(): THREE.Group {
  const model = new THREE.Group()
  model.name = 'Icy balloon snower'

  const balloon = new THREE.MeshStandardMaterial({ color: '#8fd0f0', roughness: 0.22, metalness: 0.04 })
  const balloonShade = new THREE.MeshStandardMaterial({ color: '#6fb6dc', roughness: 0.3 })
  const frost = new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.45 })
  const ice = new THREE.MeshStandardMaterial({ color: '#cdeeff', roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.9 })
  const coral = new THREE.MeshStandardMaterial({ color: '#f2796b', roughness: 0.3 })
  const string = new THREE.MeshStandardMaterial({ color: '#f6efe0', roughness: 0.8 })

  // The balloon itself: slightly egg-shaped, tipped over the nozzle.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), balloon)
  body.name = 'Snower balloon'
  body.position.set(0.28, 0.5, 0)
  body.scale.set(1, 1.18, 0.9)
  model.add(body)
  const gloss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), frost)
  gloss.position.set(0.37, 0.7, 0.16)
  gloss.scale.set(0.7, 1.3, 0.5)
  model.add(gloss)

  // Balloon knot where the nozzle leaves the body, with a curly string.
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.12, 12), balloonShade)
  knot.position.set(0.03, 0.34, 0)
  knot.rotation.z = Math.PI / 2 + 0.7
  model.add(knot)
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI * 1.5), string)
  curl.position.set(0.12, 0.2, 0.05)
  curl.rotation.set(0.4, 0.3, 0.8)
  model.add(curl)

  // Snowflake emblem on the balloon: three crossed bars.
  for (let index = 0; index < 3; index += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.026, 0.012), frost)
    bar.position.set(0.28, 0.5, 0.27)
    bar.rotation.z = (index / 3) * Math.PI
    model.add(bar)
  }

  // The nozzle: three striped balloon-twist segments stepping down to the ring.
  const segments = [
    { x: -0.06, y: 0.27, length: 0.2, radius: 0.062, material: ice },
    { x: -0.19, y: 0.19, length: 0.2, radius: 0.058, material: frost },
    { x: -0.31, y: 0.12, length: 0.2, radius: 0.054, material: ice },
  ] as const
  for (const segment of segments) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(segment.radius, segment.radius, segment.length, 14), segment.material)
    tube.position.set(segment.x, segment.y, 0)
    tube.rotation.z = Math.PI / 2 + 0.55
    model.add(tube)
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 18), coral)
  mouth.name = 'Snower mouth'
  mouth.position.set(-0.4, 0.07, 0)
  mouth.rotation.y = Math.PI / 2
  mouth.rotation.z = 0.55
  model.add(mouth)

  // Icicles under the mouth.
  for (const [x, z, height] of [[-0.38, 0.05, 0.11], [-0.43, -0.03, 0.15], [-0.34, -0.05, 0.08]] as const) {
    const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.018, height, 8), ice)
    icicle.position.set(x, 0.02 - height / 2 + 0.03, z)
    icicle.rotation.z = Math.PI
    model.add(icicle)
  }

  // Coral loop handle on top, plus a little trigger button.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 20, Math.PI), coral)
  handle.position.set(0.3, 0.88, 0)
  handle.rotation.set(0, 0, 0)
  model.add(handle)
  const trigger = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), frost)
  trigger.position.set(0.3, 0.8, 0)
  model.add(trigger)

  // A few flakes drifting off the mouth.
  for (const [x, y, z, size] of [[-0.5, 0.17, 0.04, 0.03], [-0.55, 0.05, -0.04, 0.022], [-0.47, 0.0, 0.07, 0.026]] as const) {
    const flake = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), frost)
    flake.position.set(x, y, z)
    model.add(flake)
  }

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return model
}
