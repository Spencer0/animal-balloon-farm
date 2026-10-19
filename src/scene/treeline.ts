import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  createTreelinePlan, TREELINE_PROPS,
  type BiomeId, type TreelinePlan, type TreelinePropId, type WaterBody, type WaterKind,
} from '../game/treeline-plan'

/** Where the biome props live: one file, one mesh per prop, authored by art/blender/treeline_props.py. */
const PROPS_URL = 'assets/props/treeline.glb'

const BANK_COLOR: Record<WaterKind, string> = { ocean: '#e6d6a0', lake: '#cdd199', swamp: '#6f6a3f' }
const SHALLOW_COLOR: Record<WaterKind, string> = { ocean: '#78c4d4', lake: '#82c8d2', swamp: '#6b8c4e' }
const DEEP_COLOR: Record<WaterKind, string> = { ocean: '#4b95bb', lake: '#5aa9c2', swamp: '#546f3d' }

/** Two-tone ground patches per biome: gravel, mud, clover, beach grass. */
const PATCH_TONES: Record<BiomeId, readonly [string, string]> = {
  meadow: ['#9fc45d', '#bcd47a'], woods: ['#6f9a4f', '#8aaf5b'], rocky: ['#9c9688', '#b6ac9a'],
  lake: ['#8dbb68', '#adcb7e'], swamp: ['#5e7b44', '#6f6c3f'], ocean: ['#d6c98f', '#e5d9a8'],
}

/** Sun-glints on a mid-grey, scrolled slowly so open water is never perfectly still. */
function makeRippleTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  context.fillStyle = '#dbe8ec'
  context.fillRect(0, 0, size, size)
  context.strokeStyle = 'rgba(255,255,255,.7)'
  context.lineCap = 'round'
  let seed = 7
  const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < 70; i += 1) {
    const x = next() * size
    const y = next() * size
    const length = 8 + next() * 22
    context.lineWidth = 1 + next() * 2.2
    // Drawn at every wrap offset so the tile has no seam.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        context.beginPath()
        context.moveTo(x + ox - length / 2, y + oy)
        context.quadraticCurveTo(x + ox, y + oy - 3, x + ox + length / 2, y + oy)
        context.stroke()
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.name = 'Treeline water ripples'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeSoftDiscTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,.95)')
  gradient.addColorStop(.6, 'rgba(255,255,255,.6)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.name = 'Treeline soft ground patch'
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A flat, vertex-coloured polygon on the ground. Shapes are authored in XY, so z flips on the way to XZ. */
function flatPolygon(points: readonly (readonly [number, number])[], y: number, color: string, uvScale: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, y, 0)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale)
  const tint = new THREE.Color(color)
  const colors = new Float32Array(geometry.getAttribute('position').count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([tint.r, tint.g, tint.b], i)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** Every body's bank, shallows and deep water, merged into three draws (a draw per polygon was 24). */
function buildWater(bodies: readonly WaterBody[], ripple: THREE.Texture): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Treeline water · ocean, lakes and swamp pools'
  const layers = [
    { name: 'banks', y: -.075, pick: (body: WaterBody) => ({ points: body.bank, color: BANK_COLOR[body.kind] }), map: null },
    { name: 'shallows', y: -.05, pick: (body: WaterBody) => ({ points: body.water, color: SHALLOW_COLOR[body.kind] }), map: ripple },
    { name: 'deep water', y: -.03, pick: (body: WaterBody) => ({ points: body.deep, color: DEEP_COLOR[body.kind] }), map: ripple },
  ]
  for (const layer of layers) {
    const pieces = bodies.map((body) => {
      const { points, color } = layer.pick(body)
      return flatPolygon(points, layer.y, color, 1 / 14)
    })
    const geometry = mergeGeometries(pieces)
    pieces.forEach((piece) => piece.dispose())
    if (!geometry) throw new Error('Treeline water merge failed')
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, map: layer.map }))
    mesh.name = `Treeline ${layer.name}`
    mesh.matrixAutoUpdate = false
    group.add(mesh)
  }
  return group
}

function buildPatches(plan: TreelinePlan): THREE.InstancedMesh | null {
  if (plan.patches.length === 0) return null
  const geometry = new THREE.PlaneGeometry(2, 2)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshLambertMaterial({
    map: makeSoftDiscTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, plan.patches.length)
  mesh.name = 'Treeline biome ground patches'
  const dummy = new THREE.Object3D()
  const low = new THREE.Color()
  const high = new THREE.Color()
  plan.patches.forEach((patch, i) => {
    dummy.position.set(patch.x, -.1, patch.z)
    dummy.rotation.set(0, patch.tone * 6.28, 0)
    dummy.scale.set(patch.radius, 1, patch.radius * (.7 + patch.tone * .3))
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    const [a, b] = PATCH_TONES[patch.biome]
    mesh.setColorAt(i, low.set(a).lerp(high.set(b), patch.tone))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.renderOrder = 1
  return mesh
}

/** Bakes a node's world transform into its geometry so the prop can be drawn in one instanced call. */
function bakedGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const geometry = mesh.geometry.clone()
  geometry.applyMatrix4(mesh.matrixWorld)
  return geometry
}

/**
 * The biome ring around the farm: mountain meadow, rocky mountain, lake, swamp and
 * ocean, each with its own props, laid out by `createTreelinePlan`.
 */
export function createTreeline() {
  const plan = createTreelinePlan()
  const root = new THREE.Group()
  root.name = 'Treeline · biome ring'

  const ripple = makeRippleTexture()
  root.add(buildWater(plan.water, ripple))
  const patches = buildPatches(plan)
  if (patches) root.add(patches)

  let boats: { mesh: THREE.InstancedMesh; bases: readonly { x: number; z: number; rotation: number; scale: number }[] } | null = null
  const propsGroup = new THREE.Group()
  propsGroup.name = 'Treeline props · instanced'
  root.add(propsGroup)

  new GLTFLoader().load(PROPS_URL, (gltf) => {
    gltf.scene.updateMatrixWorld(true)
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    material.name = 'Treeline vertex colour'
    const byProp = new Map<TreelinePropId, typeof plan.placements[number][]>()
    for (const placement of plan.placements) {
      const list = byProp.get(placement.prop)
      if (list) list.push(placement)
      else byProp.set(placement.prop, [placement])
    }
    const dummy = new THREE.Object3D()
    const tint = new THREE.Color()
    for (const prop of TREELINE_PROPS) {
      const list = byProp.get(prop)
      if (!list?.length) continue
      const source = gltf.scene.getObjectByName(prop)
      if (!(source instanceof THREE.Mesh)) { console.error(`[treeline] ${PROPS_URL} has no mesh named ${prop}`); continue }
      const geometry = bakedGeometry(source)
      geometry.computeBoundingSphere()
      if (prop === 'sailboat') {
        // Boats bob, so their matrices are rewritten each frame; one instanced draw covers them all.
        const mesh = new THREE.InstancedMesh(geometry, material, list.length)
        mesh.name = `Treeline sailboat × ${list.length}`
        mesh.frustumCulled = false
        propsGroup.add(mesh)
        boats = { mesh, bases: list.map(({ x, z, rotation, scale }) => ({ x, z, rotation, scale })) }
        poseBoats(0)
        continue
      }
      const mesh = new THREE.InstancedMesh(geometry, material, list.length)
      mesh.name = `Treeline ${prop} × ${list.length}`
      list.forEach((placement, i) => {
        dummy.position.set(placement.x, prop === 'lily_pads' ? -.03 : 0, placement.z)
        dummy.rotation.set(0, placement.rotation, 0)
        dummy.scale.setScalar(placement.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        // A little brightness and warm/cool drift, so a stand of one tree is never a stamp.
        const value = .84 + placement.shade * .2
        mesh.setColorAt(i, tint.setRGB(value * (1 + (placement.shade - .5) * .08), value, value * (1 - (placement.shade - .5) * .1)))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      propsGroup.add(mesh)
    }
    gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
  }, undefined, (error) => console.error('[treeline] Could not load the biome props', error))

  const boatDummy = new THREE.Object3D()
  function poseBoats(time: number): void {
    if (!boats) return
    boats.bases.forEach((base, i) => {
      const phase = i * 2.1
      boatDummy.position.set(base.x, -.02 + Math.sin(time * .9 + phase) * .07, base.z)
      boatDummy.rotation.set(0, base.rotation, Math.sin(time * .7 + phase) * .035)
      boatDummy.scale.setScalar(base.scale)
      boatDummy.updateMatrix()
      boats!.mesh.setMatrixAt(i, boatDummy.matrix)
    })
    boats.mesh.instanceMatrix.needsUpdate = true
  }

  let elapsed = 0
  return {
    root,
    plan,
    update(delta: number): void {
      elapsed += Math.max(0, delta)
      ripple.offset.set(elapsed * .006, elapsed * .003)
      poseBoats(elapsed)
    },
  }
}
