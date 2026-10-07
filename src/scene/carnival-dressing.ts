import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { farmEdgeDistance } from '../game/farm-footprint'
import type { GardenBounds } from '../game/farm-expansion'
import type { CarnivalKind } from '../game/carnival-migration'

export interface DressingProp { readonly group: THREE.Group; readonly radius: number; readonly kind: CarnivalKind }
const standard = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .9 })

/** Merge a static Blender prop by material while keeping each prop independently removable. */
function compactModel(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true)
  const inverse = source.matrixWorld.clone().invert()
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
    geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld))
    // glTF parts have matching POSITION/NORMAL but not every part has UVs.
    geometry.deleteAttribute('uv')
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const groups = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: geometry.getAttribute('position').count, materialIndex: 0 }]
    for (const group of groups) {
      const mat = materials[group.materialIndex ?? 0]
      mat.side = THREE.DoubleSide
      const part = new THREE.BufferGeometry()
      for (const name of ['position', 'normal']) {
        const attribute = geometry.getAttribute(name)
        part.setAttribute(name, new THREE.Float32BufferAttribute(attribute.array.slice(group.start * 3, (group.start + group.count) * 3), 3))
      }
      const bucket = buckets.get(mat) ?? []
      bucket.push(part); buckets.set(mat, bucket)
    }
    geometry.dispose()
  })
  const result = new THREE.Group()
  for (const [mat, parts] of buckets) {
    const geometry = mergeGeometries(parts)
    if (!geometry) throw new Error(`Could not batch carnival prop ${source.name}`)
    const object = new THREE.Mesh(geometry, mat)
    object.castShadow = true; object.receiveShadow = true
    result.add(object)
    parts.forEach((part) => part.dispose())
  }
  return result
}

function pathGeometry(points: THREE.Vector3[], width: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points)
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= 160; i += 1) {
    const t = i / 160
    const point = curve.getPoint(t)
    const tangent = curve.getTangent(t)
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2)
    positions.push(point.x - normal.x, -.07, point.z - normal.z, point.x + normal.x, -.07, point.z + normal.z)
    if (i < 160) { const v = i * 2; indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3) }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}

export function createCarnivalDressing(parent: THREE.Group): { props: readonly DressingProp[]; update(delta: number, bounds: GardenBounds): void } {
  const props: DressingProp[] = []
  const holders: { holder: THREE.Group; model: string }[] = []
  const paths = new THREE.Group()
  paths.name = 'Winding midway promenades · outside cultivated soil'
  parent.add(paths)
  const pathMat = standard('#bcb38e')
  pathMat.side = THREE.DoubleSide
  // Asymmetric loops, not a square apron. Soil sits above paths when land is claimed.
  for (const radius of [19, 35, 60]) {
    const points = Array.from({ length: 25 }, (_, i) => {
      const angle = i / 24 * Math.PI * 2
      const wobble = Math.sin(angle * 3 + .6) * 1.3
      return new THREE.Vector3(Math.cos(angle) * (radius + wobble), 0, Math.sin(angle) * (radius * .84 + wobble))
    })
    const path = new THREE.Mesh(pathGeometry(points, radius === 19 ? 2.3 : 3.1), pathMat)
    path.receiveShadow = true; paths.add(path)
  }
  for (let i = 0; i < 5; i += 1) {
    const angle = i / 5 * Math.PI * 2 + .4
    const points = [16, 27, 42, 70].map((r, j) => new THREE.Vector3(Math.cos(angle + Math.sin(j * 1.2) * .055) * r, 0, Math.sin(angle + Math.sin(j * 1.2) * .055) * r * .84))
    paths.add(new THREE.Mesh(pathGeometry(points, 2), pathMat))
  }
  // Stock props are authored in districts: food street, picnic corner, ride queues.
  const layout: readonly [string, number, number, number, CarnivalKind, number][] = [
    ['LemonadeStall', -2, -12.8, 0, 'stall', 2],
    ['PopcornCart', 9, -10.4, -.5, 'stall', 1.2],
    ['LemonadeStall', 13.6, 1.5, -1.35, 'stall', 2],
    ['PopcornCart', -12.4, 1.6, 1.1, 'stall', 1.2],
    ['PopcornCart', -7.8, 10.8, .2, 'stall', 1.2],
    ['LemonadeStall', 5.8, 13.8, 2.9, 'stall', 2],
    ['GardenBench', -6.1, -11.7, 0, 'decoration', 1.1],
    ['GardenBench', 11.3, -6.6, -1, 'decoration', 1.1],
    ['GardenBench', -13, -7, 1, 'decoration', 1.1],
    ['GardenBench', 9, 8.9, -2.1, 'decoration', 1.1],
    ['GardenBench', -1, 11.6, Math.PI, 'decoration', 1.1],
    ['MidwaySign', 10.7, 0, -1, 'decoration', .7],
    ['MidwaySign', 3.3, -10.7, 0, 'decoration', .7],
    ['MidwaySign', -10.6, 6.6, .6, 'decoration', .7],
    ['MidwaySign', 14.1, 6.2, -1.1, 'decoration', .7],
    ['LemonadeStall', -20, -8.3, .8, 'stall', 2],
    ['PopcornCart', 21, 10, -1, 'stall', 1.2],
    ['GardenBench', -23, 1, .5, 'decoration', 1.1],
    ['GardenBench', -23, 4, .5, 'decoration', 1.1],
    ['LemonadeStall', 4, -26, 0, 'stall', 2],
    ['LemonadeStall', -10, -25, .1, 'stall', 2],
    ['PopcornCart', -4, -25, -.2, 'stall', 1.2],
    ['PopcornCart', 26, -9, -1.4, 'stall', 1.2],
  ]
  function place(model: string, x: number, z: number, rotation: number, kind: CarnivalKind, radius: number): void {
    const holder = new THREE.Group()
    holder.name = `Midway ${model}`
    holder.position.set(x, -.04, z); holder.rotation.y = rotation
    // A tiny fallback makes late-loading art safe; ownership exists before assets do.
    const placeholder = new THREE.Mesh(new THREE.BoxGeometry(radius, .45, radius * .7), standard('#d9b976'))
    placeholder.position.y = .22; holder.add(placeholder)
    parent.add(holder); holders.push({ holder, model }); props.push({ group: holder, radius, kind })
  }
  for (const [model, x, z, rotation, kind, radius] of layout) place(model, x, z, rotation, kind, radius)
  for (const [x, z] of [[-3.8,-12.9],[.1,-12.9],[12,3.4],[12,-.9],[4,13.8],[7.8,13.8],[-12.5,3.3],[-10.4,6.6],[-20,-6],[-19,-10.3],[19,9],[23,12]] as const) {
    place('FlowerPlanter', x, z, 0, 'decoration', .5)
  }
  const loader = new GLTFLoader()
  loader.load('assets/props/carnival-dressing.glb', (gltf) => {
    const templates = new Map<string, THREE.Group>()
    for (const model of new Set(holders.map((entry) => entry.model))) {
      const source = gltf.scene.getObjectByName(model)
      if (!source) throw new Error(`Carnival kit is missing ${model}`)
      templates.set(model, compactModel(source))
    }
    for (const { holder, model } of holders) {
      holder.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose() }
      })
      holder.clear(); holder.add(templates.get(model)!.clone(true))
    }
    const geometries = new Set<THREE.BufferGeometry>()
    gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry) })
    geometries.forEach((geometry) => geometry.dispose())
  }, undefined, (error) => console.error('[carnival] Could not load carnival dressing kit', error))

  // Contextual queue ropes are part of a stand, so nothing floats after packing.
  const ropeMat = standard('#d3b276')
  for (const { holder, model } of holders) {
    if (model !== 'LemonadeStall') continue
    const queue = new THREE.Group()
    queue.name = 'Stall queue ropes'
    // Added after model load below to preserve ropes when the placeholder clears.
    for (const x of [-1.2, 1.2]) {
      for (const z of [1.6, 3.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.05, .065, .7, 6), ropeMat)
        post.position.set(x, .35, z); queue.add(post)
      }
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.9, 5), ropeMat)
      rope.rotation.x = Math.PI / 2; rope.position.set(x, .62, 2.55); queue.add(rope)
    }
    // Keep queue separate from the replaced art children.
    holder.userData.queue = queue
  }

  const count = 90
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.19, 7, 5), standard('#e5c4a3'), count)
  const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(.17, .23, .6, 6), new THREE.MeshStandardMaterial({ roughness: 1 }), count)
  heads.name = 'Midway visitors · instanced heads'; bodies.name = 'Midway visitors · instanced coats'
  parent.add(heads, bodies)
  const dummy = new THREE.Object3D()
  const colors = ['#ce7f87', '#689c9a', '#b9a379', '#9698b1', '#d7c6a1']
  for (let i = 0; i < count; i += 1) bodies.setColorAt(i, new THREE.Color(colors[i % colors.length]))
  // Wide conservative bounds: visitors roam several lanes as the farm expands.
  heads.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 95)
  bodies.boundingSphere = heads.boundingSphere.clone()
  let elapsed = 0
  return {
    props,
    update(delta, bounds): void {
      elapsed += Math.max(0, delta)
      for (const { holder } of holders) {
        const queue = holder.userData.queue as THREE.Group | undefined
        if (queue && holder.children.length === 1 && holder.children[0] instanceof THREE.Group) holder.add(queue)
      }
      for (let i = 0; i < count; i += 1) {
        const direction = i % 2 ? 1 : -1
        const angle = i * 2.39996 + elapsed * .019 * direction
        const radius = 19 + i % 4 * 7 + Math.sin(i * 3.7) * 1.2
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius * .84
        const visible = farmEdgeDistance(x, z, bounds) > 1.6
        const bob = Math.sin(elapsed * 5 + i) * .035
        dummy.rotation.set(0, -angle, 0); dummy.scale.setScalar(visible ? .85 + i % 3 * .08 : 0)
        dummy.position.set(x, .44 + bob, z); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix)
        dummy.position.y = .9 + bob; dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix)
      }
      heads.instanceMatrix.needsUpdate = true; bodies.instanceMatrix.needsUpdate = true
    },
  }
}
