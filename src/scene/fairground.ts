import * as THREE from 'three'
import { createFarmExpansion, FARM_EXPANSION_CONFIG, GARDEN_MAX_BOUNDS, type FarmExpansion, type GardenBounds } from '../game/farm-expansion'

export const GARDEN_BOUNDS = FARM_EXPANSION_CONFIG.startBounds
export { FARM_EXPANSION_CONFIG, GARDEN_MAX_BOUNDS }
const PLOT_CORNER_RADIUS = 0.9
const PLOT_EDGE_INSET = 0.08

export function containsGardenPoint(x: number, z: number, bounds: GardenBounds, inset = PLOT_EDGE_INSET): boolean {
  const halfWidth = bounds.halfWidth - inset
  const halfDepth = bounds.halfDepth - inset
  const absX = Math.abs(x)
  const absZ = Math.abs(z)
  if (absX > halfWidth || absZ > halfDepth) return false
  const cornerX = halfWidth - PLOT_CORNER_RADIUS
  const cornerZ = halfDepth - PLOT_CORNER_RADIUS
  if (absX <= cornerX || absZ <= cornerZ) return true
  return Math.hypot(absX - cornerX, absZ - cornerZ) <= PLOT_CORNER_RADIUS
}

export const GARDEN_LAWN_Y = 0.03

export interface Fairground {
  readonly root: THREE.Group
  readonly gardenSurface?: THREE.Mesh
  readonly gardenSoil?: THREE.Mesh
  readonly farmExpansion?: FarmExpansion
  /** Apply the visible expanding plot transform to newly-sized surface geometry. */
  updateSurfaceGeometry?(geometry: THREE.BufferGeometry): void
  update(deltaSeconds: number): void
}

interface SlidingProp {
  readonly group: THREE.Group
  readonly originX: number
  readonly originZ: number
  readonly radius: number
}

function trackSlidingProp(group: THREE.Group, radius: number): SlidingProp {
  return { group, originX: group.position.x, originZ: group.position.z, radius }
}

function updateSlidingProp(prop: SlidingProp, bounds: GardenBounds, deltaSeconds: number): void {
  const requiredX = Math.max(0, bounds.halfWidth + prop.radius + 1.5 - Math.abs(prop.originX))
  const requiredZ = Math.max(0, bounds.halfDepth + prop.radius + 1.5 - Math.abs(prop.originZ))
  const moveAlongX = requiredX > 0 && (requiredZ <= 0 || requiredX <= requiredZ)
  const moveAlongZ = requiredZ > 0 && (requiredX <= 0 || requiredZ < requiredX)
  const targetX = prop.originX + Math.sign(prop.originX || 1) * (moveAlongX ? requiredX : 0)
  const targetZ = prop.originZ + Math.sign(prop.originZ || 1) * (moveAlongZ ? requiredZ : 0)
  const smoothing = 1 - Math.exp(-2.6 * Math.max(0, deltaSeconds))
  prop.group.position.x = THREE.MathUtils.lerp(prop.group.position.x, targetX, smoothing)
  prop.group.position.z = THREE.MathUtils.lerp(prop.group.position.z, targetZ, smoothing)
}

const COLORS = {
  grass: ['#72b85f', '#8bc96c', '#5b9f57', '#9dce71'],
  petals: ['#fff4c8', '#f6c85e', '#f28a86', '#d997d2', '#edf5dc'],
  tent: ['#ed5d66', '#fff0c7', '#40a9a2', '#f3bf4f', '#6488c5', '#e88eb7'],
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function standard(color: THREE.ColorRepresentation, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 })
}

export function makeGardenLawnGeometry(bounds: GardenBounds = GARDEN_MAX_BOUNDS): THREE.BufferGeometry {
  const width = bounds.halfWidth * 2 + 0.16
  const depth = bounds.halfDepth * 2 + 0.16
  const radius = 0.9
  const geometry = new THREE.PlaneGeometry(width, depth,
    Math.min(480, Math.max(96, Math.ceil(width / 0.42))),
    Math.min(360, Math.max(66, Math.ceil(depth / 0.42))),
  )
  const positions = geometry.getAttribute('position')
  // RGBA vertex colors: rgb is the painted grass tint, alpha is how much of the
  // paint layer shows (0 = bare soil below, 1 = full grass). The grass seeder
  // writes alpha; the soil plane underneath is the untouched garden ground.
  const colors = new Float32Array(positions.count * 4)
  for (let index = 0; index < positions.count; index += 1) {
    let x = positions.getX(index)
    let y = positions.getY(index)
    const centerX = Math.sign(x) * (bounds.halfWidth + 0.08 - radius)
    const centerY = Math.sign(y) * (bounds.halfDepth + 0.08 - radius)
    if (Math.abs(x) > Math.abs(centerX) && Math.abs(y) > Math.abs(centerY)) {
      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.hypot(dx, dy)
      if (distance > radius) {
        x = centerX + dx / distance * radius
        y = centerY + dy / distance * radius
        positions.setXY(index, x, y)
      }
    }
    colors[index * 4] = 1
    colors[index * 4 + 1] = 1
    colors[index * 4 + 2] = 1
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  geometry.computeVertexNormals()
  return geometry
}

/** Axis-aligned rectangle with the buildable garden cut out as a hole. */
function rectangleWithGardenHole(width: number, depth: number, outset: number): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2, -depth / 2)
  shape.lineTo(width / 2, -depth / 2)
  shape.lineTo(width / 2, depth / 2)
  shape.lineTo(-width / 2, depth / 2)
  shape.closePath()
  shape.holes.push(gardenHolePath(outset))
  return shape
}

function makeSoilTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable for the soil texture')
  const random = seededRandom(seed)
  context.fillStyle = '#96744e'
  context.fillRect(0, 0, canvas.width, canvas.height)
  // Tilled-earth blotches and light pebble speckles, no grass marks.
  for (let index = 0; index < 1400; index += 1) {
    const x = random() * canvas.width
    const y = random() * canvas.height
    context.globalAlpha = 0.05 + random() * 0.12
    context.fillStyle = random() > 0.5 ? '#7a5c3d' : '#a8835c'
    context.beginPath()
    context.ellipse(x, y, 4 + random() * 11, 2 + random() * 5, random() * Math.PI, 0, Math.PI * 2)
    context.fill()
  }
  for (let index = 0; index < 900; index += 1) {
    const x = random() * canvas.width
    const y = random() * canvas.height
    context.globalAlpha = 0.1 + random() * 0.16
    context.fillStyle = random() > 0.4 ? '#b59067' : '#c9b192'
    context.beginPath()
    context.arc(x, y, 0.6 + random() * 1.4, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function makeGrassTexture(seed: number, base: string, mark: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable for the grass texture')
  const random = seededRandom(seed)
  context.fillStyle = base
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < 32000; index += 1) {
    const x = random() * canvas.width
    const y = random() * canvas.height
    context.globalAlpha = 0.06 + random() * 0.18
    context.strokeStyle = random() > 0.5 ? mark : '#e5d889'
    context.lineWidth = 0.55 + random() * 0.55
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + (random() - 0.5) * 2, y - 1 - random() * 4)
    context.stroke()
  }
  context.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function roundedRectangle(width: number, depth: number, radius: number): THREE.Shape {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const r = Math.min(radius, halfWidth, halfDepth)
  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth + r, -halfDepth)
  shape.lineTo(halfWidth - r, -halfDepth)
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + r)
  shape.lineTo(halfWidth, halfDepth - r)
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - r, halfDepth)
  shape.lineTo(-halfWidth + r, halfDepth)
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - r)
  shape.lineTo(-halfWidth, -halfDepth + r)
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + r, -halfDepth)
  return shape
}

function roundedRectangleCurve(width: number, depth: number, radius: number, y: number): THREE.CatmullRomCurve3 {
  const points = roundedRectangle(width, depth, radius).getPoints(10)
    .map((point) => new THREE.Vector3(point.x, y, -point.y))
  return new THREE.CatmullRomCurve3(points, true, 'centripetal')
}

/** The buildable garden footprint as a path, outset outward by `outset`. */
function gardenHolePath(outset: number): THREE.Path {
  const halfWidth = GARDEN_BOUNDS.halfWidth + outset
  const halfDepth = GARDEN_BOUNDS.halfDepth + outset
  const hole = new THREE.Path()
  hole.moveTo(-halfWidth, -halfDepth)
  hole.lineTo(-halfWidth, halfDepth)
  hole.lineTo(halfWidth, halfDepth)
  hole.lineTo(halfWidth, -halfDepth)
  hole.closePath()
  return hole
}

function roundedRectangleDistance(x: number, z: number, bounds: GardenBounds): number {
  const radius = Math.min(PLOT_CORNER_RADIUS, bounds.halfWidth, bounds.halfDepth)
  const cornerX = bounds.halfWidth - radius
  const cornerZ = bounds.halfDepth - radius
  const qx = Math.abs(x) - cornerX
  const qz = Math.abs(z) - cornerZ
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius
}

function addTufts(parent: THREE.Group, random: () => number, count: number, insideGarden: boolean, material: THREE.MeshStandardMaterial): void {
  const geometry = new THREE.BufferGeometry()
  const positions: number[] = []
  const indices: number[] = []
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = blade * Math.PI / 3
    const halfWidth = 0.045
    const height = 0.16 + blade * 0.025
    const dx = Math.cos(angle) * halfWidth
    const dz = Math.sin(angle) * halfWidth
    const offset = positions.length / 3
    positions.push(-dx, 0, -dz, dx, 0, dz, Math.sin(angle) * .035, height, Math.cos(angle) * .035)
    indices.push(offset, offset + 1, offset + 2)
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const instances = new THREE.InstancedMesh(geometry, material, count)
  instances.name = insideGarden ? 'Garden grass tufts' : 'Carnival meadow grass tufts'
  const dummy = new THREE.Object3D()
  const instanceColor = new THREE.Color()
  const palette = COLORS.grass.map((hex) => new THREE.Color(hex))
  let placed = 0
  let attempts = 0
  while (placed < count && attempts < count * 5) {
    attempts += 1
    const x = insideGarden ? (random() * 2 - 1) * (GARDEN_BOUNDS.halfWidth - .5) : (random() * 2 - 1) * 72
    const z = insideGarden ? (random() * 2 - 1) * (GARDEN_BOUNDS.halfDepth - .5) : (random() * 2 - 1) * 65
    if (!insideGarden && Math.abs(x) < GARDEN_MAX_BOUNDS.halfWidth + 1 && Math.abs(z) < GARDEN_MAX_BOUNDS.halfDepth + 1) continue
    if (!insideGarden && Math.abs(x) > 65 && Math.abs(z) > 58) continue
    dummy.position.set(x, insideGarden ? .045 : -.07, z)
    dummy.rotation.y = random() * Math.PI * 2
    const scale = .55 + random() * 1.25
    dummy.scale.set(scale, scale * (.65 + random() * .65), scale)
    dummy.updateMatrix()
    instances.setMatrixAt(placed, dummy.matrix)
    instanceColor.copy(palette[Math.floor(random() * palette.length)]).multiplyScalar(.85 + random() * .3)
    instances.setColorAt(placed, instanceColor)
    placed += 1
  }
  instances.count = placed
  instances.receiveShadow = true
  instances.computeBoundingSphere()
  parent.add(instances)
}

function addFlowerPatches(parent: THREE.Group, random: () => number): void {
  const count = 190
  const stemGeometry = new THREE.CylinderGeometry(.018, .026, .3, 5)
  const centerGeometry = new THREE.SphereGeometry(.055, 8, 6)
  const petalGeometry = new THREE.SphereGeometry(1, 8, 6)
  const stems = new THREE.InstancedMesh(stemGeometry, standard('#4e8b4f'), count)
  const centers = new THREE.InstancedMesh(centerGeometry, standard('#e7ad3d'), count)
  const petalMaterials = COLORS.petals.map((color) => standard(color, .68))
  const petals = petalMaterials.map((material) => new THREE.InstancedMesh(petalGeometry, material, count * 5))
  const indices = petalMaterials.map(() => 0)
  const dummy = new THREE.Object3D()
  for (let index = 0; index < count; index += 1) {
    let x = 0
    let z = 0
    let tries = 0
    do {
      x = (random() * 2 - 1) * 61
      z = (random() * 2 - 1) * 53
      tries += 1
    } while (tries < 30 && Math.abs(x) < GARDEN_MAX_BOUNDS.halfWidth + 1 && Math.abs(z) < GARDEN_MAX_BOUNDS.halfDepth + 1)
    const scale = .55 + random() * .8
    const y = .32 * scale
    dummy.position.set(x, .15 * scale, z)
    dummy.rotation.set(0, random() * Math.PI * 2, 0)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    stems.setMatrixAt(index, dummy.matrix)
    dummy.position.set(x, y, z)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    centers.setMatrixAt(index, dummy.matrix)
    const colorIndex = Math.floor(random() * petalMaterials.length)
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal / 5 * Math.PI * 2
      dummy.position.set(x + Math.cos(angle) * .09 * scale, y, z + Math.sin(angle) * .09 * scale)
      dummy.scale.set(.085 * scale, .035 * scale, .052 * scale)
      dummy.rotation.set(0, -angle, 0)
      dummy.updateMatrix()
      petals[colorIndex].setMatrixAt(indices[colorIndex], dummy.matrix)
      indices[colorIndex] += 1
    }
  }
  stems.receiveShadow = true
  centers.castShadow = true
  // Each petal bucket is allocated the full count*5 capacity but only receives
  // the flowers that happened to pick its color, so trim `count` to what was
  // actually written. Leftover instances keep the identity matrix three.js
  // seeds them with, which stacks hundreds of unit-radius spheres at the world
  // origin — a white boulder sitting in the middle of the garden, shadow and all.
  petals.forEach((mesh, i) => { mesh.count = indices[i]; mesh.castShadow = true; parent.add(mesh) })
  parent.add(stems, centers)
}

function addBeam(parent: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number, mat: THREE.Material, radialSegments = 10): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments), mat)
  mesh.position.copy(start).add(end).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

function addTent(parent: THREE.Group, x: number, z: number, scale: number, variant: number): THREE.Group {
  const tent = new THREE.Group()
  tent.name = 'Striped carnival tent'
  tent.position.set(x, -.08, z)
  tent.scale.setScalar(scale)
  const palette = COLORS.tent.map((_, i) => standard(COLORS.tent[(i + variant) % COLORS.tent.length], .72))
  const sides = 20
  const radius = 3.6
  const wallHeight = 3.1
  const roofHeight = 4.1
  const wallPositions: number[] = []
  const roofPositions: number[] = []
  const wallIndices: number[] = []
  const roofIndices: number[] = []
  const wallGroups: number[] = []
  const roofGroups: number[] = []
  for (let i = 0; i < sides; i += 1) {
    const a0 = i / sides * Math.PI * 2
    const a1 = (i + 1) / sides * Math.PI * 2
    const start = wallPositions.length / 3
    const lo0 = [radius * Math.cos(a0),0,radius * Math.sin(a0)]
    const lo1 = [radius * Math.cos(a1),0,radius * Math.sin(a1)]
    const hi0 = [lo0[0],wallHeight,lo0[2]]
    const hi1 = [lo1[0],wallHeight,lo1[2]]
    wallPositions.push(...lo0,...lo1,...hi1,...hi0)
    wallIndices.push(start,start+1,start+2,start,start+2,start+3)
    wallGroups.push(i % 2)
    const rstart = roofPositions.length / 3
    roofPositions.push(...hi0,...hi1,0,wallHeight+roofHeight,0)
    roofIndices.push(rstart,rstart+1,rstart+2)
    roofGroups.push(i % 2 ? (variant+3)%palette.length : (variant+1)%palette.length)
  }
  const walls = new THREE.BufferGeometry()
  walls.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions,3))
  walls.setIndex(wallIndices)
  wallGroups.forEach((index,i) => walls.addGroup(i*6,6,index))
  walls.computeVertexNormals()
  const wallMesh = new THREE.Mesh(walls,[palette[0],palette[1]])
  wallMesh.material.forEach((mat) => { mat.side = THREE.DoubleSide })
  wallMesh.castShadow = wallMesh.receiveShadow = true
  tent.add(wallMesh)
  const roof = new THREE.BufferGeometry()
  roof.setAttribute('position',new THREE.Float32BufferAttribute(roofPositions,3))
  roof.setIndex(roofIndices)
  roofGroups.forEach((index,i) => roof.addGroup(i*3,3,index))
  roof.computeVertexNormals()
  const roofMesh = new THREE.Mesh(roof,palette)
  roofMesh.material.forEach((mat) => { mat.side = THREE.DoubleSide })
  roofMesh.castShadow = true
  tent.add(roofMesh)
  for (const y of [.11,wallHeight]) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(radius,.08,8,64),standard('#f2d78b',.6))
    trim.rotation.x = Math.PI / 2
    trim.position.y = y
    tent.add(trim)
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08,.10,roofHeight+.4,12),standard('#c9954b',.38))
  pole.position.y = wallHeight + roofHeight/2
  tent.add(pole)
  const finial = new THREE.Mesh(new THREE.SphereGeometry(.22,16,10),standard('#ffe08a',.3))
  finial.position.y = wallHeight + roofHeight + .08
  tent.add(finial)
  tent.traverse((object) => { if (object instanceof THREE.Mesh) object.receiveShadow = true })
  parent.add(tent)
  return tent
}

function createFerrisWheel(parent: THREE.Group): { group: THREE.Group; rotor: THREE.Group; cabins: THREE.Group[]; radius: number; centerY: number; angle: number } {
  const group = new THREE.Group()
  group.name = 'Painted carnival Ferris wheel'
  group.position.set(-25.5,-.04,-13.5)
  const frame = standard('#dfca94',.48)
  const gold = standard('#f2c75c',.36)
  const radius = 6.2
  const centerY = 7
  for (const z of [-.48,.48]) {
    addBeam(group,new THREE.Vector3(-1.65,.2,z),new THREE.Vector3(0,centerY,z),.22,frame,12)
    addBeam(group,new THREE.Vector3(1.65,.2,z),new THREE.Vector3(0,centerY,z),.22,frame,12)
    addBeam(group,new THREE.Vector3(-1.3,.3,z),new THREE.Vector3(1.3,.3,z),.17,frame,10)
  }
  for (const x of [-1.65,1.65]) addBeam(group,new THREE.Vector3(x,.2,-.48),new THREE.Vector3(x,.2,.48),.20,gold,10)
  const rotor = new THREE.Group()
  rotor.position.y = centerY
  group.add(rotor)
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(radius,.15,12,96),standard('#51aaa4',.38)))
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(radius-.43,.065,8,80),gold))
  const spokes = [standard('#ed6970',.47),standard('#f5cd61',.42),standard('#fff0c9',.44)]
  for (let i = 0; i < 12; i += 1) {
    const angle = i / 12 * Math.PI * 2
    addBeam(rotor,new THREE.Vector3(),new THREE.Vector3(Math.cos(angle)*(radius-.2),Math.sin(angle)*(radius-.2),0),.075,spokes[i%3],8)
    const light = new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),new THREE.MeshStandardMaterial({color:COLORS.tent[i%6],emissive:COLORS.tent[i%6],emissiveIntensity:.45,roughness:.35}))
    light.position.set(Math.cos(angle)*radius,Math.sin(angle)*radius,.02)
    rotor.add(light)
  }
  rotor.add(new THREE.Mesh(new THREE.SphereGeometry(.6,24,18),standard('#fff0c9',.35)))
  const cabins: THREE.Group[] = []
  const cabinColors = ['#ed6970','#f2bf52','#4ca49d','#6f8fca','#de85b2','#fff0c9']
  for (let i = 0; i < 10; i += 1) {
    const cabin = new THREE.Group()
    const basket = new THREE.Mesh(new THREE.BoxGeometry(.82,.66,.62),standard(cabinColors[i%6],.55))
    basket.position.y = -.35
    const rim = new THREE.Mesh(new THREE.BoxGeometry(.98,.11,.76),standard('#fff0c9',.52))
    rim.position.y = -.08
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(.62,.42,4),standard(i%2?'#fff0c9':cabinColors[i%6],.58))
    canopy.rotation.y = Math.PI/4
    canopy.position.y = .18
    cabin.add(basket,rim,canopy)
    group.add(cabin)
    cabins.push(cabin)
  }
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),new THREE.MeshStandardMaterial({color:'#ffe48a',emissive:'#ffbf55',emissiveIntensity:.75,roughness:.25}))
  const instances = new THREE.InstancedMesh(bulb.geometry,bulb.material,48)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 48; i += 1) {
    const angle = i / 48 * Math.PI * 2
    dummy.position.set(Math.cos(angle)*(radius+.03),Math.sin(angle)*(radius+.03),.12)
    dummy.updateMatrix()
    instances.setMatrixAt(i,dummy.matrix)
  }
  rotor.add(instances)
  parent.add(group)
  return {group,rotor,cabins,radius,centerY,angle:0}
}

function addBalloonBunch(parent: THREE.Group,x:number,z:number,scale:number,seed:number):THREE.Group {
  const random = seededRandom(seed)
  const group = new THREE.Group()
  group.position.set(x,-.05,z)
  const colors = ['#f26d83','#ffd15c','#65c4bd','#9b8cdb','#f2f0d2']
  for (let i=0;i<5;i+=1) {
    const angle=i/5*Math.PI*2
    const bx=Math.cos(angle)*(.36+random()*.2)
    const bz=Math.sin(angle)*(.36+random()*.2)
    const height=3+random()
    const balloon=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),new THREE.MeshPhysicalMaterial({color:colors[i],roughness:.23,metalness:.015,clearcoat:.8,clearcoatRoughness:.15}))
    balloon.scale.set(.38*scale,.53*scale,.36*scale)
    balloon.position.set(bx*scale,height*scale,bz*scale)
    group.add(balloon)
    const line=new THREE.LineCurve3(new THREE.Vector3(0,.2*scale,0),new THREE.Vector3(bx*scale,(height-.48)*scale,bz*scale))
    group.add(new THREE.Mesh(new THREE.TubeGeometry(line,8,.012*scale,5,false),standard('#e4d4ad',.58)))
  }
  parent.add(group)
  return group
}

function addHill(parent:THREE.Group,x:number,z:number,sx:number,sy:number,sz:number,hue:string,seed:number):void {
  const hill=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshStandardMaterial({color:hue,roughness:1,flatShading:true}))
  hill.position.set(x,sy*.25,z)
  hill.scale.set(sx,sy,sz)
  hill.rotation.y=seed*.37
  parent.add(hill)
}

export function createFairground(): Fairground {
  const root=new THREE.Group()
  root.name='Animal Balloon Farm carnival grounds and expandable garden'
  const random=seededRandom(20260927)
  const farmExpansion=createFarmExpansion()
  const slidingProps:SlidingProp[]=[]
  const apron=new THREE.Group()
  apron.name='Expandable gravel apron'
  root.add(apron)
  const activeBoundary=new THREE.Group()
  activeBoundary.name='Growing farm frontier'
  root.add(activeBoundary)
  const boundaryStakes=new THREE.Group()
  boundaryStakes.name='Boundary stakes · follow the new acres'
  root.add(boundaryStakes)
  const borderMaterial=new THREE.MeshStandardMaterial({color:'#fff5d5',roughness:.48,emissive:'#d7ca9a',emissiveIntensity:.14})
  const frontierGlow=new THREE.MeshStandardMaterial({color:'#dcb965',roughness:.42,metalness:.1,emissive:'#efc95d',emissiveIntensity:.13})
  const propRadius=(object:THREE.Object3D,fallback:number):number=>{
    const bounds=new THREE.Box3().setFromObject(object)
    if(bounds.isEmpty())return fallback
    const size=bounds.getSize(new THREE.Vector3())
    return Math.max(fallback,Math.hypot(size.x,size.z)*.5)
  }
  function trackProp(group:THREE.Group,fallbackRadius:number):void{
    slidingProps.push(trackSlidingProp(group,propRadius(group,fallbackRadius)))
  }

  const far=makeGrassTexture(37,'#7ba95d','#466f49')
  far.repeat.set(90,90)
  // Meadow and outer lawn are ring planes with the garden cut out, so deep
  // digs (future ponds) stay visible instead of being capped by a grass plane.
  // Insets are NEGATIVE: the cutouts must extend BEYOND the deformable region
  // (edits reach ±13.1/±8.6 through the edge fade), or edge/corner pits dip
  // below these flat planes and they occlude the hole (green-through).
  const meadowGeo=new THREE.ShapeGeometry(rectangleWithGardenHole(520,520,-2),2)
  meadowGeo.rotateX(-Math.PI/2)
  const meadow=new THREE.Mesh(meadowGeo,new THREE.MeshStandardMaterial({color:'#a7ba6d',map:far,roughness:1,side:THREE.DoubleSide}))
  meadow.position.y=-.22
  meadow.receiveShadow=true
  root.add(meadow)
  const outerTexture=makeGrassTexture(73,'#88bb69','#578e53')
  outerTexture.repeat.set(18,14)
  const outerGeo=new THREE.ShapeGeometry(rectangleWithGardenHole(115,82,-1.8),2)
  outerGeo.rotateX(-Math.PI/2)
  const outer=new THREE.Mesh(outerGeo,new THREE.MeshStandardMaterial({color:'#7bb766',map:outerTexture,roughness:1,side:THREE.DoubleSide}))
  outer.position.y=-.13
  outer.receiveShadow=true
  root.add(outer)

  // The gravel apron is the only paved ground outside the plot, and it hugs the
  // buildable bounds. The old cutaway plinth that ringed it is gone, so the step
  // out of the apron lands on meadow grass rather than a slab of bare dirt.

  const pathMat=standard('#d4bb83',.92)
  // The ivory boundary is the level-one build limit. The revealed gravel apron is outside it.
  const apronShape=roundedRectangle(GARDEN_BOUNDS.halfWidth*2+2.35,GARDEN_BOUNDS.halfDepth*2+2.5,1.05)
  apronShape.holes.push(gardenHolePath(0))
  const gravel=new THREE.Mesh(new THREE.ShapeGeometry(apronShape,12),pathMat)
  gravel.rotation.x=-Math.PI/2
  gravel.position.y=.018
  gravel.receiveShadow=true
  apron.add(gravel)

  // Pit backstop well below the deepest diggable surface (grid min −2.6 →
  // soil world ≈ −2.61), so a max-depth pond bed never bottoms out against
  // an under-garden plane. A plain slab: everything above it is opaque.
  const underSoil=new THREE.Mesh(new THREE.PlaneGeometry(34,26),standard('#6e4c33',.95))
  underSoil.rotation.x=-Math.PI/2
  underSoil.position.y=-2.85
  underSoil.receiveShadow=true
  root.add(underSoil)

  // Bare tilled soil is the untouched garden ground; the growable lawn above it
  // is a transparent paint layer that only turns green where the seeder works.
  const soil=new THREE.Mesh(makeGardenLawnGeometry(GARDEN_MAX_BOUNDS),new THREE.MeshStandardMaterial({map:makeSoilTexture(211),vertexColors:true,transparent:true,depthWrite:false,roughness:1}))
  soil.material.map!.repeat.set(6,4)
  soil.rotation.x=-Math.PI/2
  soil.position.y=.012
  soil.name='Starter garden soil'
  soil.receiveShadow=true
  root.add(soil)

  const lawn=new THREE.Mesh(makeGardenLawnGeometry(GARDEN_MAX_BOUNDS),new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,transparent:true,map:makeGrassTexture(119,'#ffffff','#dcedc0'),roughness:.96}))
  lawn.material.map!.repeat.set(7,5)
  lawn.rotation.x=-Math.PI/2
  lawn.position.y=GARDEN_LAWN_Y
  lawn.name='Starter garden · growable level-one footprint'
  lawn.receiveShadow=true
  root.add(lawn)

  // No parade lane: the rides stand straight on the meadow, so the clipped
  // parcel is the only paved thing in view and the ring no longer reads as a
  // track the farm happens to sit inside.

  const boundaryCurve=roundedRectangleCurve(GARDEN_BOUNDS.halfWidth*2+.20,GARDEN_BOUNDS.halfDepth*2+.20,.92,.14)
  const boundary=new THREE.Mesh(new THREE.TubeGeometry(boundaryCurve,180,.075,8,true),borderMaterial)
  boundary.name='Ivory starter garden expansion limit'
  activeBoundary.add(boundary)
  const goldFrontier=new THREE.Mesh(new THREE.TubeGeometry(roundedRectangleCurve(GARDEN_BOUNDS.halfWidth*2+.44,GARDEN_BOUNDS.halfDepth*2+.44,1,.075),180,.034,6,true),frontierGlow)
  goldFrontier.name='Gilded edge · growing garden frontier'
  activeBoundary.add(goldFrontier)

  const stakeColors=['#ed6970','#f5d16a','#61aaa3'].map((color)=>standard(color,.54))
  const stakePositions:[number,number][]=[[-13.8,-9.1],[0,-9.55],[13.8,-9.1],[13.9,0],[13.8,9.1],[0,9.55],[-13.8,9.1],[-13.9,0]]
  stakePositions.forEach(([x,z],i)=>{
    const stake=new THREE.Group()
    stake.position.set(x,0,z)
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,.85,9),standard('#f8eed5',.63))
    pole.position.y=.35
    stake.add(pole)
    for(let band=0;band<3;band+=1){const ring=new THREE.Mesh(new THREE.TorusGeometry(.072,.027,6,12),stakeColors[(i+band)%3]);ring.position.y=.16+band*.17;ring.rotation.x=Math.PI/2;stake.add(ring)}
    const pennant=new THREE.Mesh(new THREE.ConeGeometry(.24,.52,3),stakeColors[i%3])
    pennant.position.set(.18,.92,0)
    pennant.rotation.z=-Math.PI/2
    stake.add(pennant)
    boundaryStakes.add(stake)
  })

  const hills:[number,number,number,number,number,string][]=[[-67,-69,31,18,25,'#83a768'],[-25,-82,37,23,29,'#99b66c'],[25,-88,42,20,34,'#83a666'],[72,-68,34,18,27,'#a6bb70'],[-82,-4,28,17,23,'#8eae65'],[88,8,30,18,26,'#92ad63'],[-65,66,33,21,29,'#92ae67'],[0,84,45,22,30,'#9bb66d'],[69,68,35,20,27,'#84a566']]
  hills.forEach(([x,z,sx,sy,sz,hue],i)=>addHill(root,x,z,sx,sy,sz,hue,i))
  const tufts=new THREE.MeshStandardMaterial({color:'#a1c66b',roughness:.9,side:THREE.DoubleSide})
  addTufts(root,random,2700,false,tufts)
  addFlowerPatches(root,random)

  trackProp(addTent(root,21.5,-17.5,1.02,0),4.5)
  trackProp(addTent(root,29,3,.82,2),4)
  trackProp(addTent(root,-31.5,6.5,.88,4),4.2)
  trackProp(addTent(root,23.5,17.5,.66,1),3.2)
  trackProp(addTent(root,-28.5,-30,.62,3),3.2)
  for(const [x,z,scale,seed] of [[-18.5,-12.5,1.05,30],[17.5,-12.8,1,33],[-23.5,11.8,1.12,37],[22.7,11.2,.9,42]] as const)trackProp(addBalloonBunch(root,x,z,scale,seed),1)
  const wheel=createFerrisWheel(root)
  trackProp(wheel.group,6.8)

  const skyPuffs=new THREE.Group()
  const cloudMat=new THREE.MeshStandardMaterial({color:'#fff3d9',roughness:.94,transparent:true,opacity:.76})
  for(const [x,y,z,size] of [[-44,32,-77,1],[16,41,-103,1.2],[63,35,-70,.9],[-75,38,2,.8],[72,43,44,1.1]] as const){
    const cloud=new THREE.Group();cloud.position.set(x,y,z)
    for(let p=0;p<5;p+=1){const puff=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),cloudMat);puff.position.set((p-2)*1.3*size,Math.sin(p*1.8)*.55*size,Math.cos(p)*.52*size);puff.scale.set(1.45*size,.72*size,.86*size);cloud.add(puff)}
    skyPuffs.add(cloud)
  }
  root.add(skyPuffs)

  let lastRevealWidth = -1
  let lastRevealDepth = -1
  function updateLandReveal(bounds: GardenBounds): void {
    if (bounds.halfWidth === lastRevealWidth && bounds.halfDepth === lastRevealDepth) return
    lastRevealWidth = bounds.halfWidth
    lastRevealDepth = bounds.halfDepth
    const positions = soil.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = soil.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let index = 0; index < positions.count; index += 1) {
      const distance = roundedRectangleDistance(positions.getX(index), -positions.getY(index), bounds)
      const alpha = 1 - THREE.MathUtils.smoothstep(distance, 0, 0.38)
      colors.setXYZW(index, 1, 1, 1, alpha)
    }
    colors.needsUpdate = true
  }
  updateLandReveal(farmExpansion.state.bounds)

  return {
    root,
    gardenSurface:lawn,
    gardenSoil:soil,
    farmExpansion,
    updateSurfaceGeometry(geometry): void {
      const previousSoilGeometry = soil.geometry
      const previousLawnGeometry = lawn.geometry
      soil.geometry = geometry.clone()
      lawn.geometry = geometry
      previousSoilGeometry.dispose()
      previousLawnGeometry.dispose()
      soil.scale.set(1, 1, 1)
      lawn.scale.set(1, 1, 1)
      lastRevealWidth = -1
      updateLandReveal(farmExpansion.state.bounds)
    },
    update(delta):void{
      wheel.angle=(wheel.angle+delta*.10)%(Math.PI*2)
      wheel.rotor.rotation.z=wheel.angle
      wheel.cabins.forEach((c,i)=>{
        const angle=i/wheel.cabins.length*Math.PI*2+wheel.angle
        c.position.set(Math.cos(angle)*wheel.radius,wheel.centerY+Math.sin(angle)*wheel.radius,0)
        c.rotation.z=-wheel.angle
      })
      farmExpansion.update(delta)
      const state=farmExpansion.state
      const scaleX=state.bounds.halfWidth/GARDEN_BOUNDS.halfWidth
      const scaleZ=state.bounds.halfDepth/GARDEN_BOUNDS.halfDepth
      // The apron, boundary tubes and their stakes share the plot's scale so the
      // gravel path stays glued to the edge of the revealed soil.
      apron.scale.set(scaleX,1,scaleZ)
      soil.scale.set(1, 1, 1)
      lawn.scale.set(1, 1, 1)
      activeBoundary.scale.set(scaleX,1,scaleZ)
      boundaryStakes.scale.set(scaleX,1,scaleZ)
      slidingProps.forEach((prop)=>updateSlidingProp(prop,state.bounds,delta))
      updateLandReveal(state.bounds)
      borderMaterial.emissiveIntensity=.14+(state.isAnimating?Math.sin(state.progress*Math.PI)*.58:0)
      frontierGlow.emissiveIntensity=.13+(state.isAnimating?Math.sin(state.progress*Math.PI)*.78:0)
    },
  }
}

export function createSkyDome():THREE.Mesh {
  const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{horizonColor:{value:new THREE.Color('#f6c98c')},middleColor:{value:new THREE.Color('#92cfce')},zenithColor:{value:new THREE.Color('#63a8c5')}},vertexShader:`varying vec3 vWorldPosition; void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorldPosition=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`uniform vec3 horizonColor;uniform vec3 middleColor;uniform vec3 zenithColor;varying vec3 vWorldPosition;void main(){vec3 d=normalize(vWorldPosition-cameraPosition);float h=clamp(d.y,-.12,1.);float a=smoothstep(-.12,.18,h);float b=smoothstep(.12,.92,h);vec3 c=mix(horizonColor,middleColor,a);c=mix(c,zenithColor,b);gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`})
  const sky=new THREE.Mesh(new THREE.SphereGeometry(450,32,20),mat)
  sky.name='Carnival fairground pastel sky'
  sky.frustumCulled=false
  sky.renderOrder=-1000
  return sky
}
