import * as THREE from 'three'
import { containsGardenPoint, GARDEN_LAWN_Y } from './fairground'
import type { GardenBounds } from '../game/farm-expansion'
import { createPlantSimulation, PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, plantSpacingExtent, type GardenPlant, type PlantCare, type PlantId, type PlantSimulation, type PlantSurface } from '../game/plants'
import type { GardenTerrain } from './garden-terrain'
import type { GardenWaterField } from '../game/garden-water'

export interface PlantPointerEvent {
  readonly clientX: number
  readonly clientY: number
  readonly button: number
}

export interface GardenPlants {
  readonly root: THREE.Group
  readonly simulation: PlantSimulation
  readonly selectedSpecies: PlantId | null
  readonly lastCareResolved: boolean
  readonly selectedPlant: GardenPlant | null
  readonly selectedPlantNumber: number | null
  readonly previewVisible: boolean
  selectSpecies(species: PlantId): void
  clearSelection(): void
  cancelPlacement(): void
  placementCursor(clientX: number, clientY: number): boolean
  pointerMove(event: PlantPointerEvent): void
  pointerLeave(): void
  pointerDown(event: PlantPointerEvent): boolean
  selectAt(clientX: number, clientY: number): GardenPlant | null
  removePlant(instanceId: number): GardenPlant | null
  markerKindAt(clientX: number, clientY: number): PlantCare | 'mature' | null
  update(deltaSeconds: number, allowGrowth: boolean): void
  dispose(): void
}

interface PlantVisual {
  readonly instanceId: number
  readonly species: PlantId
  readonly group: THREE.Group
  readonly marker: THREE.Sprite
  readonly celebration: THREE.Group
  readonly celebrationRing: THREE.Mesh
  readonly sparkles: readonly THREE.Mesh[]
  readonly completionBadge: THREE.Sprite
  readonly maturitySeal: THREE.Sprite
  maturityCelebrationRemaining: number
  maturitySealDismissed: boolean
  readonly plantNumber: number
  markerPosition: THREE.Vector3
}

const careTextureCache = new Map<PlantCare, THREE.CanvasTexture>()
let completionTexture: THREE.CanvasTexture | null = null
let completionCheckTexture: THREE.CanvasTexture | null = null
const CELEBRATION_SECONDS = 3.2

function plantCompletionCheckTexture(): THREE.CanvasTexture {
  if (completionCheckTexture) return completionCheckTexture
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for plant completion icon')
  context.fillStyle = '#fff4d2'
  context.strokeStyle = '#c49742'
  context.lineWidth = 6
  context.beginPath()
  context.arc(48, 48, 42, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.strokeStyle = '#688e4d'
  context.lineWidth = 10
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(25, 49)
  context.lineTo(41, 64)
  context.lineTo(70, 33)
  context.stroke()
  completionCheckTexture = new THREE.CanvasTexture(canvas)
  completionCheckTexture.colorSpace = THREE.SRGBColorSpace
  return completionCheckTexture
}

function plantCompletionTexture(): THREE.CanvasTexture {
  if (completionTexture) return completionTexture
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 112
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for plant completion banner')
  context.fillStyle = 'rgba(60, 40, 23, .22)'
  context.beginPath()
  context.roundRect(8, 10, 368, 94, 30)
  context.fill()
  context.fillStyle = '#fff4d2'
  context.strokeStyle = '#d9ad52'
  context.lineWidth = 7
  context.beginPath()
  context.roundRect(5, 4, 368, 94, 28)
  context.fill()
  context.stroke()
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#678b4b'
  context.font = 'bold 43px Georgia, "Times New Roman", serif'
  context.fillText('FULLY GROWN!', 190, 39)
  context.fillStyle = '#805d39'
  context.font = 'italic 21px Georgia, "Times New Roman", serif'
  context.fillText('No more care needed', 190, 73)
  context.fillStyle = '#e4b94f'
  for (const [x, y] of [[33, 24], [351, 77]] as const) {
    context.beginPath()
    context.moveTo(x, y - 10)
    context.lineTo(x + 3, y - 3)
    context.lineTo(x + 10, y)
    context.lineTo(x + 3, y + 3)
    context.lineTo(x, y + 10)
    context.lineTo(x - 3, y + 3)
    context.lineTo(x - 10, y)
    context.lineTo(x - 3, y - 3)
    context.closePath()
    context.fill()
  }
  completionTexture = new THREE.CanvasTexture(canvas)
  completionTexture.colorSpace = THREE.SRGBColorSpace
  return completionTexture
}

function careTexture(care: PlantCare): THREE.CanvasTexture {
  const existing = careTextureCache.get(care)
  if (existing) return existing
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for plant-care marker')
  context.fillStyle = '#fff5dc'
  context.beginPath()
  context.arc(64, 64, 57, 0, Math.PI * 2)
  context.fill()
  context.lineWidth = 7
  context.strokeStyle = care === 'water' ? '#6ca9b3' : '#ae7044'
  context.stroke()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = care === 'water' ? '#438e9c' : '#7d5639'
  context.lineWidth = 8
  if (care === 'water') {
    context.fillStyle = '#78c5d0'
    context.beginPath()
    context.moveTo(64, 24)
    context.bezierCurveTo(52, 43, 36, 58, 36, 75)
    context.arc(64, 75, 28, Math.PI, 0)
    context.bezierCurveTo(92, 58, 76, 43, 64, 24)
    context.fill()
    context.stroke()
    context.fillStyle = '#e9fbf8'
    context.beginPath()
    context.ellipse(55, 69, 5, 9, -0.4, 0, Math.PI * 2)
    context.fill()
  } else {
    context.beginPath()
    context.moveTo(39, 88)
    context.lineTo(86, 40)
    context.moveTo(50, 97)
    context.lineTo(96, 51)
    context.moveTo(33, 75)
    context.quadraticCurveTo(27, 57, 46, 56)
    context.lineTo(73, 83)
    context.quadraticCurveTo(70, 103, 52, 94)
    context.moveTo(79, 39)
    context.quadraticCurveTo(96, 30, 97, 47)
    context.moveTo(40, 94)
    context.lineTo(31, 103)
    context.moveTo(51, 103)
    context.lineTo(42, 112)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  careTextureCache.set(care, texture)
  return texture
}

/** Radius of a fully grown ground-cover patch, in metres. */
const PATCH_RADIUS = 0.95
let patchEdgeTexture: THREE.CanvasTexture | null = null

/** A soft round mat that fades into the lawn at its rim, so a patch has no hard edge. */
function patchTexture(): THREE.CanvasTexture {
  if (patchEdgeTexture) return patchEdgeTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for plant patch')
  const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.62, 'rgba(255,255,255,0.78)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  patchEdgeTexture = new THREE.CanvasTexture(canvas)
  patchEdgeTexture.colorSpace = THREE.SRGBColorSpace
  return patchEdgeTexture
}

const CLOVER_GREENS = ['#4f9a45', '#5ca84c', '#448c40', '#68b255']
const DANDELION_GREENS = ['#5a9a40', '#4c8a3a', '#68a64a']

/** A cheap repeatable 0..1 sequence, so a species always grows the same patch. */
function patchRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * Clover and dandelions are lawn alternatives, not garden beds: a round mat that
 * melts into the grass, thick with small leaves, with blooms standing just above
 * it. Everything is instanced, so a patch costs a handful of draws however
 * lush it looks.
 */
function makeGroundCover(species: PlantId): THREE.Group {
  const root = new THREE.Group()
  root.name = `Plant · ${species} patch`
  const clover = species === 'clover'
  const random = patchRandom(clover ? 311 : 523)
  const matMaterial = new THREE.MeshStandardMaterial({
    color: clover ? '#6fae55' : '#7ab356', roughness: 0.92,
    map: patchTexture(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  const mat = new THREE.Mesh(new THREE.CircleGeometry(PATCH_RADIUS, 40), matMaterial)
  mat.rotation.x = -Math.PI / 2
  mat.position.y = 0.03
  mat.receiveShadow = true
  mat.renderOrder = 1
  root.add(mat)

  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
  const bloomMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#5a9150', roughness: 0.85 })
  const leafGeometry = new THREE.SphereGeometry(1, 7, 5)
  const stemGeometry = new THREE.CylinderGeometry(0.012, 0.016, 1, 5)
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()

  const scatter = (count: number, minRadius = 0): Array<{ x: number; z: number; angle: number }> => Array.from({ length: count }, (_, index) => {
    const radius = Math.max(minRadius, PATCH_RADIUS * 0.94 * Math.sqrt((index + 0.5) / count))
    const angle = index * 2.399 + random() * 0.6
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, angle }
  })

  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.name = name
    mesh.castShadow = false
    mesh.receiveShadow = false
    root.add(mesh)
    return mesh
  }

  if (clover) {
    const spots = scatter(56)
    const leaves = instanced(leafGeometry, leafMaterial, spots.length * 3, 'Clover leaflets')
    spots.forEach((spot, index) => {
      const lift = 0.05 + random() * 0.05
      for (let lobe = 0; lobe < 3; lobe += 1) {
        const direction = spot.angle + lobe * Math.PI * 2 / 3
        dummy.position.set(spot.x + Math.cos(direction) * 0.06, lift, spot.z + Math.sin(direction) * 0.06)
        dummy.rotation.set(0, -direction, 0)
        dummy.scale.set(0.095, 0.018, 0.078)
        dummy.updateMatrix()
        leaves.setMatrixAt(index * 3 + lobe, dummy.matrix)
        leaves.setColorAt(index * 3 + lobe, tint.set(CLOVER_GREENS[Math.floor(random() * CLOVER_GREENS.length)]))
      }
    })
    const blooms = scatter(9, 0.18)
    const heads = instanced(leafGeometry, bloomMaterial, blooms.length, 'Clover blooms')
    blooms.forEach((spot, index) => {
      dummy.position.set(spot.x, 0.17 + random() * 0.05, spot.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(0.05)
      dummy.updateMatrix()
      heads.setMatrixAt(index, dummy.matrix)
      heads.setColorAt(index, tint.set(index % 3 === 0 ? '#f0c6d4' : '#f6f1e2'))
    })
    const stems = instanced(stemGeometry, stemMaterial, blooms.length, 'Clover bloom stems')
    blooms.forEach((spot, index) => {
      heads.getMatrixAt(index, dummy.matrix)
      const top = new THREE.Vector3().setFromMatrixPosition(dummy.matrix).y
      dummy.position.set(spot.x, top / 2, spot.z)
      dummy.scale.set(1, top, 1)
      dummy.updateMatrix()
      stems.setMatrixAt(index, dummy.matrix)
    })
  } else {
    const rosettes = scatter(26)
    const leaves = instanced(leafGeometry, leafMaterial, rosettes.length, 'Dandelion leaves')
    rosettes.forEach((spot, index) => {
      dummy.position.set(spot.x, 0.045 + random() * 0.03, spot.z)
      dummy.rotation.set(0, -spot.angle + random() * 1.2, 0)
      dummy.scale.set(0.15, 0.018, 0.04)
      dummy.updateMatrix()
      leaves.setMatrixAt(index, dummy.matrix)
      leaves.setColorAt(index, tint.set(DANDELION_GREENS[Math.floor(random() * DANDELION_GREENS.length)]))
    })
    const flowers = scatter(14, 0.12)
    const heads = instanced(leafGeometry, bloomMaterial, flowers.length, 'Dandelion blooms')
    const stems = instanced(stemGeometry, stemMaterial, flowers.length, 'Dandelion stems')
    flowers.forEach((spot, index) => {
      const puff = index % 5 === 4
      const height = 0.2 + random() * 0.14
      dummy.position.set(spot.x, height, spot.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(puff ? 0.062 : 0.074, puff ? 0.062 : 0.04, puff ? 0.062 : 0.074)
      dummy.updateMatrix()
      heads.setMatrixAt(index, dummy.matrix)
      heads.setColorAt(index, tint.set(puff ? '#eeeee6' : index % 2 ? '#f3c82f' : '#f8d848'))
      dummy.position.set(spot.x, height / 2, spot.z)
      dummy.scale.set(1, height, 1)
      dummy.updateMatrix()
      stems.setMatrixAt(index, dummy.matrix)
    })
  }
  root.userData.disposeMaterials = [matMaterial, leafMaterial, bloomMaterial, stemMaterial]
  root.userData.leafGeometry = leafGeometry
  root.userData.stemGeometry = stemGeometry
  root.userData.groundCover = true
  root.scale.setScalar(0.0001)
  return root
}

function makePlantModel(species: PlantId): THREE.Group {
  if (species === 'clover' || species === 'dandelion') return makeGroundCover(species)
  const root = new THREE.Group()
  root.name = `Plant · ${species}`
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#4f8750', roughness: 0.82 })
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#609a55', roughness: 0.78 })
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: species === 'water-lily' ? '#df9bcf' : '#e87965', roughness: 0.65 })
  const centerMaterial = new THREE.MeshStandardMaterial({ color: '#efc55d', roughness: 0.68 })
  const leafGeometry = new THREE.SphereGeometry(1, 10, 7)
  const stemGeometry = new THREE.CylinderGeometry(0.025, 0.04, 1, 7)
  const addLeaf = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0): void => {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial)
    leaf.position.set(x, y, z)
    leaf.scale.set(sx, sy, sz)
    leaf.rotation.z = rotation
    leaf.castShadow = true
    leaf.receiveShadow = true
    root.add(leaf)
  }
  const addStem = (x: number, height: number, z: number): void => {
    const stem = new THREE.Mesh(stemGeometry, stemMaterial)
    stem.position.set(x, height / 2, z)
    stem.scale.y = height
    stem.castShadow = true
    root.add(stem)
  }
  {
    const height = species === 'water-lily' ? 0.5 : 0.62
    addStem(0, height, 0)
    if (species === 'water-lily') {
      const padMaterial = new THREE.MeshStandardMaterial({ color: '#4f9e70', side: THREE.DoubleSide, roughness: 0.7 })
      root.userData.disposeMaterials = [stemMaterial, leafMaterial, flowerMaterial, centerMaterial, padMaterial]
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.46, 32), padMaterial)
      pad.rotation.x = -Math.PI / 2
      pad.position.y = 0.025
      pad.scale.set(1, 0.82, 1)
      pad.receiveShadow = true
      root.add(pad)
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), centerMaterial)
      center.position.set(0, height, 0)
      root.add(center)
      for (let petal = 0; petal < 8; petal += 1) {
        const angle = petal * Math.PI / 4
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), flowerMaterial)
        bloom.position.set(Math.cos(angle) * 0.12, height, Math.sin(angle) * 0.12)
        bloom.scale.set(0.15, 0.055, 0.07)
        bloom.rotation.y = -angle
        root.add(bloom)
      }
    } else {
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), centerMaterial)
      center.position.y = height
      root.add(center)
      for (let petal = 0; petal < 6; petal += 1) {
        const angle = petal * Math.PI / 3
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), flowerMaterial)
        bloom.position.set(Math.cos(angle) * 0.13, height, Math.sin(angle) * 0.13)
        bloom.scale.set(0.12, 0.05, 0.065)
        bloom.rotation.y = -angle
        root.add(bloom)
      }
      for (let leafIndex = 0; leafIndex < 3; leafIndex += 1) {
        const angle = leafIndex * Math.PI * 2 / 3
        addLeaf(Math.cos(angle) * 0.11, 0.13, Math.sin(angle) * 0.11, 0.16, 0.035, 0.09, -angle)
      }
    }
  }
  root.userData.disposeMaterials ??= [stemMaterial, leafMaterial, flowerMaterial, centerMaterial]
  root.userData.leafGeometry = leafGeometry
  root.userData.stemGeometry = stemGeometry
  root.scale.setScalar(0.0001)
  return root
}

function makePreview(): THREE.Group {
  const group = new THREE.Group()
  const shadow = new THREE.Mesh(new THREE.RingGeometry(0.78, 1.18, 48), new THREE.MeshBasicMaterial({ color: '#25382b', side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false, depthTest: false, toneMapped: false }))
  shadow.renderOrder = 898
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.085
  group.add(shadow)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.76, 1.1, 48), new THREE.MeshBasicMaterial({ color: '#8cff61', side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false, depthTest: false, toneMapped: false }))
  ring.renderOrder = 900
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.095
  group.add(ring)
  const center = new THREE.Mesh(new THREE.CircleGeometry(0.76, 48), new THREE.MeshBasicMaterial({ color: '#a6d96a', transparent: true, opacity: 0.28, depthWrite: false, depthTest: false, toneMapped: false }))
  center.renderOrder = 899
  center.rotation.x = -Math.PI / 2
  center.position.y = 0.09
  group.add(center)
  group.visible = false
  return group
}

export function createGardenPlants(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  lawn: THREE.Mesh,
  terrain: GardenTerrain,
  water: GardenWaterField,
  getBounds: () => GardenBounds,
  getSurface: (x: number, z: number) => PlantSurface,
): GardenPlants {
  const root = new THREE.Group()
  root.name = 'Garden plants'
  const simulation = createPlantSimulation()
  const visuals = new Map<number, PlantVisual>()
  const nextPlantNumber = new Map<PlantId, number>()
  const selectedPlantIds = new Set<number>()
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const preview = makePreview()
  preview.renderOrder = 900
  root.add(preview)
  let selectedSpecies: PlantId | null = null
  let previewVisible = false
  let previewPosition: THREE.Vector3 | null = null
  let invalidSeconds = 0
  const placementRing = preview.children[1] as THREE.Mesh
  const placementFill = preview.children[2] as THREE.Mesh
  const ringMaterial = placementRing.material as THREE.MeshBasicMaterial
  const fillMaterial = placementFill.material as THREE.MeshBasicMaterial
  const markerProjector = new THREE.Vector3()
  const surfaceProbe = new THREE.Vector3()
  const selectedTint = new THREE.Color('#d4a84f')
  let elapsed = 0
  let lastCareResolved = false

  function pointerRay(event: Pick<PlantPointerEvent, 'clientX' | 'clientY'>): boolean {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    return true
  }

  function groundAt(event: Pick<PlantPointerEvent, 'clientX' | 'clientY'>): THREE.Vector3 | null {
    if (!pointerRay(event)) return null
    const hit = raycaster.intersectObject(lawn, false)[0]
    if (!hit || !containsGardenPoint(hit.point.x, hit.point.z, getBounds())) return null
    return hit.point
  }

  function surfaceAt(point: THREE.Vector3): PlantSurface {
    return getSurface(point.x, point.z)
  }

  function plantsById(): Map<number, GardenPlant> {
    return new Map(simulation.plants.map((plant) => [plant.instanceId, plant]))
  }

  function plantNumberFor(plant: GardenPlant): number {
    const existing = visuals.get(plant.instanceId)
    if (existing) return existing.plantNumber
    const number = (nextPlantNumber.get(plant.species) ?? 0) + 1
    nextPlantNumber.set(plant.species, number)
    return number
  }

  function addVisual(plant: GardenPlant): void {
    const group = makePlantModel(plant.species)
    const celebration = new THREE.Group()
    celebration.name = `Plant maturity celebration · ${plant.instanceId}`
    celebration.visible = false
    const celebrationMaterial = new THREE.MeshBasicMaterial({ color: '#ffe17a', transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false })
    const celebrationRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 8, 48), celebrationMaterial)
    celebrationRing.renderOrder = 920
    celebrationRing.rotation.x = Math.PI / 2
    celebrationRing.position.y = 0.12
    celebration.add(celebrationRing)
    const sparkleMaterial = new THREE.MeshBasicMaterial({ color: '#fff1b3', transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false })
    const sparkles = Array.from({ length: 6 }, (_, index) => {
      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), sparkleMaterial)
      sparkle.renderOrder = 921
      const angle = index / 6 * Math.PI * 2
      sparkle.position.set(Math.cos(angle) * 0.62, 0.18 + (index % 2) * 0.08, Math.sin(angle) * 0.62)
      celebration.add(sparkle)
      return sparkle
    })
    const completionMaterial = new THREE.SpriteMaterial({ map: plantCompletionTexture(), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false })
    const completionBadge = new THREE.Sprite(completionMaterial)
    completionBadge.name = `Plant complete · ${plant.instanceId}`
    completionBadge.renderOrder = 1500
    completionBadge.visible = false
    const maturityMaterial = new THREE.SpriteMaterial({ map: plantCompletionCheckTexture(), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false })
    const maturitySeal = new THREE.Sprite(maturityMaterial)
    maturitySeal.name = `Plant fully grown · ${plant.instanceId}`
    maturitySeal.renderOrder = 1499
    maturitySeal.visible = false
    const markerMaterial = new THREE.SpriteMaterial({ map: careTexture('water'), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false })
    const marker = new THREE.Sprite(markerMaterial)
    marker.name = `Plant care marker · ${plant.instanceId}`
    marker.renderOrder = 2000
    marker.onBeforeRender = (renderer, _scene, activeCamera) => {
      marker.material.sizeAttenuation = false
      const pixelSize = THREE.MathUtils.clamp(renderer.domElement.clientHeight * 0.065, 42, 64)
      const worldUnitsPerPixel = activeCamera instanceof THREE.OrthographicCamera
        ? (activeCamera.top - activeCamera.bottom) / renderer.domElement.clientHeight
        : 1
      const worldSize = pixelSize * worldUnitsPerPixel
      marker.scale.set(worldSize, worldSize, 1)
    }
    marker.scale.set(52, 52, 1)
    marker.visible = false
    root.add(group, celebration, completionBadge, maturitySeal, marker)
    visuals.set(plant.instanceId, {
      instanceId: plant.instanceId,
      species: plant.species,
      group,
      marker,
      celebration,
      celebrationRing,
      sparkles,
      completionBadge,
      maturitySeal,
      maturityCelebrationRemaining: 0,
      maturitySealDismissed: false,
      plantNumber: plantNumberFor(plant),
      markerPosition: new THREE.Vector3(),
    })
  }

  function markerHit(clientX: number, clientY: number): { visual: PlantVisual; kind: 'care' | 'mature' } | null {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    let best: { visual: PlantVisual; kind: 'care' | 'mature' } | null = null
    let bestDistance = 34
    for (const visual of visuals.values()) {
      for (const [kind, visible, position] of [
        ['care', visual.marker.visible, visual.markerPosition],
        ['mature', visual.maturitySeal.visible && !visual.maturitySealDismissed, visual.maturitySeal.position],
      ] as const) {
        if (!visible) continue
        markerProjector.copy(position).project(camera)
        if (markerProjector.z < -1 || markerProjector.z > 1) continue
        const x = rect.left + (markerProjector.x + 1) * rect.width / 2
        const y = rect.top + (1 - markerProjector.y) * rect.height / 2
        const distance = Math.hypot(clientX - x, clientY - y)
        if (distance < bestDistance) {
          best = { visual, kind }
          bestDistance = distance
        }
      }
    }
    return best
  }

  function selectPlantAt(clientX: number, clientY: number): GardenPlant | null {
    const marker = markerHit(clientX, clientY)
    if (marker) {
      selectedPlantIds.clear()
      selectedPlantIds.add(marker.visual.instanceId)
      return plantsById().get(marker.visual.instanceId) ?? null
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || !pointerRay({ clientX, clientY })) return null
    const plantMeshes = [...visuals.values()].filter((visual) => visual.group.visible).flatMap((visual) => {
      const meshes: THREE.Mesh[] = []
      visual.group.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object) })
      return meshes
    })
    const hit = raycaster.intersectObjects(plantMeshes, false)[0]
    if (!hit) return null
    let selected: PlantVisual | null = null
    for (const visual of visuals.values()) {
      if (visual.group === hit.object || visual.group.children.some((child) => child === hit.object || child.getObjectById(hit.object.id))) {
        selected = visual
        break
      }
      if (hit.object.parent === visual.group || visual.group.children.some((child) => child === hit.object.parent)) {
        selected = visual
        break
      }
    }
    if (!selected) return null
    selectedPlantIds.clear()
    selectedPlantIds.add(selected.instanceId)
    return plantsById().get(selected.instanceId) ?? null
  }

  function syncVisuals(): void {
    const current = plantsById()
    for (const [id, visual] of visuals) {
      if (current.has(id)) continue
      selectedPlantIds.delete(id)
      root.remove(visual.group, visual.celebration, visual.completionBadge, visual.maturitySeal, visual.marker)
      visual.group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
      })
      for (const geometry of [visual.group.userData.leafGeometry, visual.group.userData.stemGeometry] as THREE.BufferGeometry[]) geometry.dispose()
      ;(visual.group.userData.disposeMaterials as THREE.Material[]).forEach((material) => material.dispose())
      ;(visual.marker.material as THREE.Material).dispose()
      visual.completionBadge.material.dispose()
      visual.maturitySeal.material.dispose()
      visual.celebration.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        ;(object.material as THREE.Material).dispose()
      })
      visuals.delete(id)
    }
    for (const plant of current.values()) {
      let visual = visuals.get(plant.instanceId)
      if (!visual) {
        addVisual(plant)
        visual = visuals.get(plant.instanceId)!
      }
      const groundY = terrain.heightAt(plant.x, plant.z)
      surfaceProbe.set(plant.x, groundY, plant.z)
      const surface = surfaceAt(surfaceProbe)
      const floating = plant.species === 'water-lily' && surface.waterDepth >= PLANT_WATER_MIN_DEPTH
      const y = floating ? water.surfaceAt(plant.x, plant.z) : groundY
      visual.group.position.set(plant.x, GARDEN_LAWN_Y + y + (floating ? 0.012 : 0.008), plant.z)
      const groundCover = visual.group.userData.groundCover === true
      // A patch grows from a small round seedling mat to the full circle; it
      // sits on the lawn and does not sway or bob the way a flower does.
      const scale = groundCover ? 0.3 + 0.7 * plant.growth : Math.max(0.16, plant.growth)
      visual.group.scale.setScalar(scale)
      if (!groundCover) {
        visual.group.rotation.y = Math.sin(elapsed * 1.3 + plant.instanceId) * 0.08
        visual.group.position.y += Math.sin(elapsed * 2 + plant.instanceId) * 0.018 * scale
      }
      visual.group.visible = true
      visual.group.userData.saleSelected = selectedPlantIds.has(plant.instanceId)
      visual.group.children.forEach((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const material = child.material
        const materials = Array.isArray(material) ? material : [material]
        for (const entry of materials) {
          if ('emissive' in entry && entry.emissive instanceof THREE.Color) {
            if (selectedPlantIds.has(plant.instanceId)) {
              entry.emissive.copy(selectedTint)
              if ('emissiveIntensity' in entry) entry.emissiveIntensity = 0.18
            } else if ('emissiveIntensity' in entry) {
              entry.emissiveIntensity = 0
            }
          }
        }
      })
      visual.celebration.position.set(plant.x, visual.group.position.y, plant.z)
      visual.celebration.scale.setScalar(Math.max(scale, 0.7))
      const worldUnitsPerPixel = camera instanceof THREE.OrthographicCamera
        ? (camera.top - camera.bottom) / Math.max(1, canvas.clientHeight)
        : 1
      visual.maturitySeal.visible = plant.mature && !visual.maturitySealDismissed
      visual.maturitySeal.position.set(plant.x + 0.34, visual.group.position.y + 1.02, plant.z)
      visual.maturitySeal.scale.set(38 * worldUnitsPerPixel, 38 * worldUnitsPerPixel, 1)
      visual.completionBadge.visible = visual.maturityCelebrationRemaining > 0
      if (visual.completionBadge.visible) {
        const progress = 1 - visual.maturityCelebrationRemaining / CELEBRATION_SECONDS
        const pop = 1 + Math.sin(Math.min(1, progress * 2) * Math.PI / 2) * 0.16
        visual.completionBadge.position.set(plant.x, visual.group.position.y + 1.25 + progress * 0.45, plant.z)
        visual.completionBadge.scale.set(210 * worldUnitsPerPixel * pop, 62 * worldUnitsPerPixel * pop, 1)
        ;(visual.completionBadge.material as THREE.SpriteMaterial).opacity = Math.min(1, visual.maturityCelebrationRemaining / 0.5)
      }
      if (visual.maturityCelebrationRemaining > 0) {
        const progress = 1 - visual.maturityCelebrationRemaining / CELEBRATION_SECONDS
        const ringMaterial = visual.celebrationRing.material as THREE.MeshBasicMaterial
        ringMaterial.opacity = Math.sin(Math.PI * progress) * 0.92
        visual.celebrationRing.scale.setScalar(0.65 + progress * 2.1)
        visual.celebrationRing.rotation.z = progress * Math.PI * 0.8
        for (const [index, sparkle] of visual.sparkles.entries()) {
          const angle = index / visual.sparkles.length * Math.PI * 2 + elapsed * 0.8
          const radius = 0.62 + progress * 0.6
          sparkle.position.set(Math.cos(angle) * radius, 0.18 + Math.sin(progress * Math.PI) * 0.65 + (index % 2) * 0.08, Math.sin(angle) * radius)
          ;(sparkle.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * progress) * 0.95
        }
        visual.celebration.visible = true
      } else {
        visual.celebration.visible = false
      }
      if (!plant.careNeeded) {
        visual.marker.visible = false
        continue
      }
      const markerY = visual.group.position.y + (groundCover ? 0.3 : 1) * scale + 0.44
      visual.marker.position.set(plant.x, markerY, plant.z)
      visual.markerPosition.set(plant.x, markerY, plant.z)
      const material = visual.marker.material as THREE.SpriteMaterial
      material.map = careTexture(plant.careNeeded)
      material.needsUpdate = true
      visual.marker.visible = true
    }
  }

  function updatePreview(point: THREE.Vector3 | null): void {
    previewPosition = point
    if (!selectedSpecies || !point) {
      preview.visible = false
      previewVisible = false
      return
    }
    const result = simulation.placementResult(selectedSpecies, point.x, point.z, surfaceAt(point))
    const color = invalidSeconds > 0 || !result.valid ? '#ff5148' : '#8cff61'
    ringMaterial.color.set(color)
    fillMaterial.color.set(color)
    const species = PLANT_CATALOG.find((entry) => entry.id === selectedSpecies)!
    const groundY = terrain.heightAt(point.x, point.z)
    const substrate = surfaceAt(point)
    const floating = substrate.waterDepth >= PLANT_WATER_MIN_DEPTH
    const y = floating ? water.surfaceAt(point.x, point.z) : groundY
    preview.position.set(point.x, GARDEN_LAWN_Y + y + 0.08, point.z)
    // Drawn at the plant's own claim, not the full keep-apart distance: the ring
    // is one plant's half of the gap, so neighbouring rings just touch when the
    // spacing rule starts to complain.
    preview.scale.setScalar(plantSpacingExtent(species.id))
    preview.visible = true
    previewVisible = true
  }

  function selectSpecies(species: PlantId): void {
    if (simulation.seedsFor(species) <= 0) {
      cancelPlacement()
      return
    }
    selectedSpecies = species
    invalidSeconds = 0
    if (previewPosition) updatePreview(previewPosition)
  }

  function cancelPlacement(): void {
    selectedSpecies = null
    preview.visible = false
    previewVisible = false
    previewPosition = null
  }

  function pointerDown(event: PlantPointerEvent): boolean {
    lastCareResolved = false
    if (event.button !== 0) return false
    const markerTarget = markerHit(event.clientX, event.clientY)
    if (markerTarget) {
      if (markerTarget.kind === 'mature') {
        markerTarget.visual.maturitySealDismissed = true
      } else {
        const plant = plantsById().get(markerTarget.visual.instanceId)
        if (plant?.careNeeded) lastCareResolved = simulation.resolveCare(plant.instanceId, plant.careNeeded)
      }
      syncVisuals()
      return true
    }
    if (!selectedSpecies) return false
    const point = groundAt(event)
    if (!point) {
      invalidSeconds = 0.65
      return true
    }
    const planted = simulation.plant(selectedSpecies, point.x, point.z, surfaceAt(point))
    if (!planted) {
      invalidSeconds = 0.65
      updatePreview(point)
      return true
    }
    addVisual(planted)
    if (simulation.seedsFor(selectedSpecies) <= 0) cancelPlacement()
    else updatePreview(point)
    return true
  }

  return {
    root,
    simulation,
    get selectedSpecies() { return selectedSpecies },
    get previewVisible() { return previewVisible },
    get lastCareResolved() { return lastCareResolved },
    selectSpecies,
    clearSelection(): void { selectedPlantIds.clear(); syncVisuals() },
    cancelPlacement,
    placementCursor(clientX, clientY): boolean {
      if (!selectedSpecies || !previewVisible) return false
      const point = groundAt({ clientX, clientY })
      if (!point) return false
      const result = simulation.placementResult(selectedSpecies, point.x, point.z, surfaceAt(point))
      return result.valid
    },
    pointerMove(event): void { if (selectedSpecies) updatePreview(groundAt(event)) },
    pointerLeave(): void { preview.visible = false; previewVisible = false; previewPosition = null },
    pointerDown,
    selectAt: selectPlantAt,
    removePlant(instanceId): GardenPlant | null {
      selectedPlantIds.delete(instanceId)
      const plant = simulation.remove(instanceId)
      if (plant) syncVisuals()
      return plant
    },
    get selectedPlant() {
      const id = selectedPlantIds.values().next().value as number | undefined
      return id === undefined ? null : plantsById().get(id) ?? null
    },
    get selectedPlantNumber() {
      const id = selectedPlantIds.values().next().value as number | undefined
      return id === undefined ? null : visuals.get(id)?.plantNumber ?? null
    },
    markerKindAt(clientX, clientY): PlantCare | 'mature' | null {
      const target = markerHit(clientX, clientY)
      if (!target) return null
      if (target.kind === 'mature') return 'mature'
      return plantsById().get(target.visual.instanceId)?.careNeeded ?? null
    },
    update(deltaSeconds, allowGrowth): void {
      const previousMaturity = new Set(simulation.plants.filter((plant) => plant.mature).map((plant) => plant.instanceId))
      elapsed += deltaSeconds
      invalidSeconds = Math.max(0, invalidSeconds - deltaSeconds)
      for (const visual of visuals.values()) {
        visual.maturityCelebrationRemaining = Math.max(0, visual.maturityCelebrationRemaining - deltaSeconds)
      }
      if (allowGrowth) simulation.tick(deltaSeconds)
      for (const plant of simulation.plants) {
        if (!plant.mature || previousMaturity.has(plant.instanceId)) continue
        const visual = visuals.get(plant.instanceId)
        if (visual) visual.maturityCelebrationRemaining = CELEBRATION_SECONDS
      }
      syncVisuals()
      if (selectedSpecies && previewPosition) updatePreview(previewPosition)
      if (!selectedSpecies) {
        preview.visible = false
        previewVisible = false
      }
    },
    dispose(): void {
      for (const visual of visuals.values()) {
        visual.group.traverse((object) => {
          if (object instanceof THREE.Mesh) object.geometry.dispose()
        })
        for (const geometry of [visual.group.userData.leafGeometry, visual.group.userData.stemGeometry] as THREE.BufferGeometry[]) geometry.dispose()
        ;(visual.group.userData.disposeMaterials as THREE.Material[]).forEach((material) => material.dispose())
        visual.marker.material.dispose()
        visual.completionBadge.material.dispose()
        visual.maturitySeal.material.dispose()
        visual.celebration.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          object.geometry.dispose()
          ;(object.material as THREE.Material).dispose()
        })
      }
      for (const child of preview.children) {
        if (!(child instanceof THREE.Mesh)) continue
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
      for (const care of ['water', 'prune'] as const) {
        careTextureCache.get(care)?.dispose()
        careTextureCache.delete(care)
      }
      completionTexture?.dispose()
      completionTexture = null
      completionCheckTexture?.dispose()
      completionCheckTexture = null
    },
  }
}
