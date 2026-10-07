import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GardenBounds } from '../game/farm-expansion'
import type { CarnivalKind } from '../game/carnival-migration'

const PALETTE = ['#c78385', '#d9bd83', '#73aaa6', '#99a2bd', '#c19aaa', '#e2d4b1']
const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })
const distantMaterials = PALETTE.map(material)
const cream = material('#e2d4b1')
const wood = material('#a89275')
const leaf = material('#83a77e')
const trunk = material('#9b8b70')
const skylineMaterial = material('#b8b8ac')

function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const object = new THREE.Mesh(geometry, mat)
  object.position.set(x, y, z)
  parent.add(object)
  return object
}

/** Cheap recognizable stand-in, never a clone of the expensive close model. */
export function createDistantAttraction(parent: THREE.Group, kind: CarnivalKind, x: number, z: number, seed: number, sourceName = ''): THREE.Group {
  const group = new THREE.Group()
  group.name = `Far carnival · ${kind}`
  group.userData.worldLayer = 'far'
  group.userData.removable = false
  group.position.set(x, -0.08, z)
  group.rotation.y = seed * 1.73
  const color = distantMaterials[seed % PALETTE.length]
  if (kind === 'ride' && sourceName.includes('carousel')) {
    mesh(group, new THREE.CylinderGeometry(3.3,3.6,.4,12), cream,0,.2,0)
    mesh(group, new THREE.ConeGeometry(3.6,2.3,12), color,0,4.1,0)
    for (let i=0;i<8;i+=1) {
      const angle=i/8*Math.PI*2
      mesh(group,new THREE.CylinderGeometry(.05,.05,2.8,5),wood,Math.cos(angle)*2.6,1.8,Math.sin(angle)*2.6)
      mesh(group,new THREE.SphereGeometry(.38,6,4),distantMaterials[i%6],Math.cos(angle)*2.6,1.4,Math.sin(angle)*2.6).scale.set(1.6,.8,.7)
    }
  } else if (kind === 'decoration' && sourceName.includes('Balloon')) {
    for (let i=0;i<4;i+=1) {
      mesh(group,new THREE.CylinderGeometry(.015,.015,2.8,4),wood,(i-1.5)*.3,1.4,0)
      mesh(group,new THREE.SphereGeometry(.35,7,5),distantMaterials[(seed+i)%6],(i-1.5)*.3,2.8+Math.sin(i)*.3,0).scale.y=1.3
    }
  } else if (kind === 'decoration') {
    mesh(group,new THREE.BoxGeometry(1.8,.18,.6),wood,0,.55,0)
    for (const side of [-.6,.6]) mesh(group,new THREE.BoxGeometry(.12,.6,.45),cream,side,.25,0)
    mesh(group,new THREE.BoxGeometry(1.8,.6,.1),color,0,.95,-.3)
  } else if (kind === 'stall' && sourceName.includes('Popcorn')) {
    mesh(group,new THREE.BoxGeometry(1.6,1.2,1),color,0,1,0)
    mesh(group,new THREE.ConeGeometry(1.3,.7,4),cream,0,2,0).rotation.y=Math.PI/4
    for (const x of [-.6,.6]) mesh(group,new THREE.CylinderGeometry(.3,.3,.12,8),wood,x,.3,.5).rotation.x=Math.PI/2
  } else if (kind === 'ride') {
    mesh(group, new THREE.CylinderGeometry(.25, .4, 5, 5), wood, -1.3, 2.4, 0).rotation.z = -.26
    mesh(group, new THREE.CylinderGeometry(.25, .4, 5, 5), wood, 1.3, 2.4, 0).rotation.z = .26
    const rotor = new THREE.Group()
    rotor.name = 'Distant wheel rotor'
    rotor.position.y = 5
    group.add(rotor)
    mesh(rotor, new THREE.TorusGeometry(4, .18, 4, 32), color, 0, 0, 0)
    for (let i = 0; i < 8; i += 1) {
      const angle = i / 8 * Math.PI * 2
      mesh(rotor, new THREE.BoxGeometry(.1, 8, .1), cream, 0, 0, 0).rotation.z = angle
      mesh(rotor, new THREE.BoxGeometry(.8, .75, .6), distantMaterials[(seed + i) % PALETTE.length], Math.cos(angle) * 4, Math.sin(angle) * 4, 0)
    }
  } else if (kind === 'tent') {
    mesh(group, new THREE.CylinderGeometry(3.2, 3.5, 2.4, 10), cream, 0, 1.2, 0)
    const canopy = new THREE.ConeGeometry(3.7, 3.3, 10)
    // Two materials grouped by face give a striped silhouette for two draw calls.
    const stripes = canopy.toNonIndexed()
    stripes.clearGroups()
    for (let i = 0; i < stripes.getAttribute('position').count; i += 3) stripes.addGroup(i, 3, Math.floor(i / 6) % 2)
    mesh(group, stripes, color, 0, 4.05, 0).material = [color, cream]
    canopy.dispose()
    mesh(group, new THREE.CylinderGeometry(.045, .045, 1.1, 4), wood, 0, 6.1, 0)
    mesh(group, new THREE.ConeGeometry(.32, .9, 3), color, .3, 6.6, 0).rotation.z = -Math.PI / 2
  } else {
    mesh(group, new THREE.BoxGeometry(2.6, 1.5, 1.8), cream, 0, .75, 0)
    mesh(group, new THREE.ConeGeometry(2.1, 1.3, 4), color, 0, 2.1, 0).rotation.y = Math.PI / 4
    mesh(group, new THREE.BoxGeometry(2.7, .25, .45), wood, 0, 1.05, 1)
  }
  parent.add(group)
  return group
}

/** Merge static skyline parts by material: distant scale should not cost distant draw calls. */
function bakeStatic(group: THREE.Group): void {
  group.updateMatrixWorld(true)
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const inverse = group.matrixWorld.clone().invert()
  const originals = new Set<THREE.BufferGeometry>()
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry
    originals.add(geometry)
    const transform = inverse.clone().multiply(object.matrixWorld)
    const source = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    source.applyMatrix4(transform)
    source.deleteAttribute('uv')
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    const ranges = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: source.getAttribute('position').count, materialIndex: 0 }]
    for (const range of ranges) {
      const mat = mats[range.materialIndex ?? 0]
      const part = new THREE.BufferGeometry()
      for (const name of ['position', 'normal']) {
        const attribute = source.getAttribute(name)
        part.setAttribute(name, new THREE.Float32BufferAttribute(attribute.array.slice(range.start * 3, (range.start + range.count) * 3), 3))
      }
      const bucket = buckets.get(mat) ?? []
      bucket.push(part)
      buckets.set(mat, bucket)
    }
    source.dispose()
  })
  group.clear()
  for (const [mat, pieces] of buckets) {
    const geometry = mergeGeometries(pieces)
    if (!geometry) throw new Error('Carnival skyline merge failed')
    const object = new THREE.Mesh(geometry, mat)
    object.name = 'Batched skyline silhouettes'
    group.add(object)
    pieces.forEach((piece) => piece.dispose())
  }
  originals.forEach((geometry) => geometry.dispose())
}

export function createCarnivalBackdrop() {
  const root = new THREE.Group()
  root.name = 'Panoramic carnival world'
  const far = new THREE.Group()
  far.name = 'Layer 2 · permanent quiet carnival'
  const horizon = new THREE.Group()
  horizon.name = 'Layer 3 · 360 degree hills and carnival horizon'
  root.add(far, horizon)
  // Distant tents, wheels and balloons are the carnival itself, so they come and go
  // with the Sunday set-up. Hills and the tree grove stay as permanent scenery.
  const distantCarnival = new THREE.Group()
  distantCarnival.name = 'Distant carnival · tents, wheels and balloons · sundays only'
  far.add(distantCarnival)
  const staticFar = new THREE.Group()
  distantCarnival.add(staticFar)
  for (let i = 0; i < 72; i += 1) {
    const angle = i / 72 * Math.PI * 2 + Math.sin(i * 7) * .025
    const radius = 52 + (i % 4) * 9 + Math.sin(i * 3.1) * 3
    const attraction = createDistantAttraction(staticFar, i % 5 === 0 ? 'stall' : 'tent', Math.cos(angle) * radius, Math.sin(angle) * radius, i)
    attraction.scale.setScalar(.65 + (i % 5) * .15)
  }
  bakeStatic(staticFar)
  const rides: THREE.Object3D[] = []
  for (let i = 0; i < 5; i += 1) {
    const angle = i / 5 * Math.PI * 2 - 1.1
    const ride = createDistantAttraction(distantCarnival, 'ride', Math.cos(angle) * 64, Math.sin(angle) * 64, i)
    ride.scale.setScalar(1.2 + i % 2 * .35)
    const rotor = ride.getObjectByName('Distant wheel rotor')
    if (rotor) rides.push(rotor)
  }
  // Real depth in all directions, not screen-aligned cards. Panning/orbiting is free.
  const hills = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material('#a5bca0'), 36)
  hills.name = 'Atmospheric rolling hills'
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 36; i += 1) {
    const angle = i / 36 * Math.PI * 2
    const radius = 160 + i % 3 * 26
    dummy.position.set(Math.cos(angle) * radius, 1, Math.sin(angle) * radius)
    dummy.scale.set(30 + i % 4 * 8, 12 + i % 5 * 3, 26 + i % 3 * 8)
    dummy.rotation.y = i * 1.7
    dummy.updateMatrix()
    hills.setMatrixAt(i, dummy.matrix)
  }
  hills.computeBoundingSphere()
  horizon.add(hills)
  const silhouettes = new THREE.Group()
  distantCarnival.add(silhouettes)
  for (let i = 0; i < 24; i += 1) {
    const angle = i / 24 * Math.PI * 2 + .08
    const tent = createDistantAttraction(silhouettes, 'tent', Math.cos(angle) * 117, Math.sin(angle) * 117, i + 3)
    tent.scale.setScalar(1.3 + i % 3 * .4)
    tent.traverse((object) => { if (object instanceof THREE.Mesh) object.material = skylineMaterial })
  }
  bakeStatic(silhouettes)
  // A soft forest separates attractions into districts instead of a uniform asset ring.
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaf, 160)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.15, .24, 2, 5), trunk, 160)
  crowns.name = 'Batched carnival grove canopy'
  for (let i = 0; i < 160; i += 1) {
    const angle = i * 2.39996
    const radius = 43 + i % 7 * 6.5
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    dummy.position.set(x, .8, z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, i, 0); dummy.updateMatrix()
    trunks.setMatrixAt(i, dummy.matrix)
    dummy.position.y = 3.3; dummy.scale.set(1.7 + i % 3 * .3, 2.2 + i % 4 * .2, 1.6); dummy.updateMatrix()
    crowns.setMatrixAt(i, dummy.matrix)
  }
  crowns.computeBoundingSphere(); trunks.computeBoundingSphere()
  far.add(crowns, trunks)
  const balloons: THREE.Group[] = []
  for (let i = 0; i < 6; i += 1) {
    const balloon = new THREE.Group()
    const angle = i / 6 * Math.PI * 2
    balloon.position.set(Math.cos(angle) * 103, 27 + i % 3 * 5, Math.sin(angle) * 103)
    mesh(balloon, new THREE.SphereGeometry(2.4, 10, 8), distantMaterials[i], 0, 0, 0).scale.set(1, 1.35, 1)
    mesh(balloon, new THREE.BoxGeometry(1.2, .7, 1), wood, 0, -4.3, 0)
    for (const x of [-.45, .45]) mesh(balloon, new THREE.CylinderGeometry(.035, .035, 1.6, 4), wood, x, -3.4, 0)
    distantCarnival.add(balloon); balloons.push(balloon)
  }
  let elapsed = 0
  return {
    root, far, horizon, distantCarnival,
    update(delta: number, _bounds: GardenBounds): void {
      elapsed += Math.max(0, delta)
      rides.forEach((rotor, i) => { rotor.rotation.z += delta * (.035 + i * .004) })
      balloons.forEach((balloon, i) => { balloon.position.y = 27 + i % 3 * 5 + Math.sin(elapsed * .18 + i) * 1.2 })
    },
  }
}
