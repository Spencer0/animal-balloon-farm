import * as THREE from 'three'
import { containsGardenPoint, GARDEN_LAWN_Y } from './fairground'
import type { GardenBounds } from '../game/farm-expansion'
import { createPlantSimulation, PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, plantSpacingExtent, plantSpecies, type GardenPlant, type PlantCare, type PlantId, type PlantSimulation, type PlantSurface } from '../game/plants'
import type { GardenTerrain } from './garden-terrain'
import type { GardenWaterField } from '../game/garden-water'
import { BLUEBERRY_GROWN_SCALE, createBlueberryVisual, type BlueberryVisual } from './blueberry-visual'
import { createHelperFx, type HelperFx } from './care-helper-fx'
import { createBurst, createBurstPool, springOut } from './garden-bursts'
import { BANNER_HEIGHT, BANNER_WIDTH, CARE_MARKER_HEIGHT, CARE_MARKER_WIDTH, careMarkerTexture, disposePlantCareArt, maturityBannerTexture, maturitySealTexture } from './plant-care-art'
import { createPlacementArt, type GhostModel } from './plant-placement-art'
import { cloneBush, loadGardenModels, loadPoppyModel } from './plant-models'
import { cloneGrownPoppy, createPoppyVisual, POPPY_GROWN_SCALE, poppyHeight } from './poppy-visual'

export interface PlantPointerEvent {
  readonly clientX: number
  readonly clientY: number
  readonly button: number
}

/**
 * How the garden asks the rest of the game about care it cannot answer with a
 * tap: species that care through minigames hand the marker press to
 * `startGame`, and skip it entirely once `helperHired` says a helper does the
 * chore for that species.
 */
export interface PlantCareHandlers {
  startGame(plant: GardenPlant, care: PlantCare): void
  helperHired(species: PlantId, care: PlantCare): boolean
  /** A hired helper just finished a chore on a plant. */
  helperDone?(plant: GardenPlant, care: PlantCare): void
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
  /** The plant whose body is under the pointer, with where its footprint sits. */
  plantAt(clientX: number, clientY: number): HoverPlant | null
  /** The plant the pointer is over; it grows a little while hovered. */
  setHoveredPlant(instanceId: number | null): void
  /** Per-frame visuals: sway, celebrations, previews. Growth runs in `tick`. */
  update(deltaSeconds: number): void
  /** One fixed simulation step: growth, and the celebration when a plant first matures. */
  tick(stepSeconds: number, allowGrowth: boolean): void
  setCareHandlers(handlers: PlantCareHandlers | null): void
  /** Mark the plant whose care a minigame is answering (its need stops showing), or none. */
  setAnswering(instanceId: number | null): void
  /** Where a plant stands and how tall it is right now, in world units. */
  plantFrame(instanceId: number): { readonly position: THREE.Vector3; readonly height: number } | null
  /** A finished chore's flourish on the plant itself: a splash, a puff of stars, leaf confetti. */
  celebrateCare(instanceId: number, care: PlantCare): void
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
  /** 0 hidden .. 1 shown, eased so the marker springs in and tucks away instead of flicking. */
  markerGrow: number
  /** The chore the marker last showed; it keeps its icon while it tucks away. */
  markerCare: PlantCare | null
  /** The marker is asking now (not tucking away), so a press on it counts. */
  markerWanted: boolean
  /** How far above its anchor (the tail's tip) the badge's centre sits, in CSS pixels. */
  markerLiftPx: number
  /** 0 hidden .. 1 shown, for the fully grown seal. */
  sealGrow: number
  readonly plantNumber: number
  markerPosition: THREE.Vector3
  /** The Blender model that grows itself, for species that have one (blueberry, poppy). */
  readonly modeled: BlueberryVisual | null
  /**
   * An invisible column over the plant's footprint that clicks and hovers test
   * instead of its meshes, so a thin flower is as easy to hit as a bush.
   */
  readonly hitArea: THREE.Mesh
  /** Seconds since planted, for the springy pop; Infinity for plants loaded from a save. */
  plantedAge: number
  /** A hired helper doing a chore here, and whether its chore has been counted yet. */
  helper: HelperFx | null
  helperResolved: boolean
}

const CELEBRATION_SECONDS = 3.2
/** How long a care marker or seal takes to spring in; tucking away is twice as quick. */
const MARKER_POP_SECONDS = 0.42
/** The fully grown banner's spring in, at the start of the celebration. */
const BANNER_POP_SECONDS = 0.5
/** Care marker art, in texture pixels: where the tail's tip and the badge's centre sit. */
const MARKER_TIP_Y = 284
const MARKER_BADGE_Y = 124
const MARKER_TIP_FROM_BOTTOM = 1 - MARKER_TIP_Y / CARE_MARKER_HEIGHT
/** On-screen sizes, in CSS pixels at a 720px-tall canvas; they scale with the canvas within limits. */
const MARKER_WIDTH_PX = 58
const SEAL_PX = 46
const BANNER_WIDTH_PX = 236
/** How long a fresh plant takes to spring out of the soil. */
const PLANT_POP_SECONDS = 0.7
/** How much bigger a plant stands while the pointer rests on it. */
const HOVER_GROW = 1.12

/** Ease a 0..1 show amount toward shown or hidden; hiding runs twice as fast. */
function stepGrow(grow: number, wanted: boolean, deltaSeconds: number): number {
  return wanted ? Math.min(1, grow + deltaSeconds / MARKER_POP_SECONDS) : Math.max(0, grow - deltaSeconds * 2 / MARKER_POP_SECONDS)
}

/** Scale for a show amount: a springy overshoot on the way in, a quick shrink on the way out. */
function growScale(grow: number, wanted: boolean): number {
  return wanted ? Math.max(0.001, springOut(grow)) : Math.max(0.001, grow * grow)
}

export interface HoverPlant {
  readonly instanceId: number
  readonly x: number
  readonly y: number
  readonly z: number
  readonly radius: number
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
  const matMaterial = new THREE.MeshLambertMaterial({
    color: clover ? '#6fae55' : '#7ab356',
    map: patchTexture(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  const mat = new THREE.Mesh(new THREE.CircleGeometry(PATCH_RADIUS, 40), matMaterial)
  mat.rotation.x = -Math.PI / 2
  mat.position.y = 0.03
  mat.receiveShadow = true
  mat.renderOrder = 1
  root.add(mat)

  const leafMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' })
  const bloomMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' })
  const stemMaterial = new THREE.MeshLambertMaterial({ color: '#5a9150' })
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
  const stemMaterial = new THREE.MeshLambertMaterial({ color: '#4f8750' })
  const leafMaterial = new THREE.MeshLambertMaterial({ color: '#609a55' })
  const flowerMaterial = new THREE.MeshLambertMaterial({ color: species === 'water-lily' ? '#df9bcf' : '#e87965' })
  const centerMaterial = new THREE.MeshLambertMaterial({ color: '#efc55d' })
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
      const padMaterial = new THREE.MeshLambertMaterial({ color: '#4f9e70', side: THREE.DoubleSide })
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

/**
 * A fully grown plant model of any species, unscaled (the garden scales it as it
 * grows). The care stage clones these, so the minigame shows the player's own plant.
 * Free it with `disposePlantModel`.
 */
export function clonePlantModel(species: PlantId): THREE.Group {
  const poppy = species === 'poppy' ? cloneGrownPoppy() : null
  if (poppy) {
    const model = new THREE.Group()
    model.name = 'Plant · poppy'
    model.add(poppy)
    // The clone shares the loaded template's geometry and materials.
    model.userData.sharedModel = true
    return model
  }
  const model = makePlantModel(species)
  model.scale.setScalar(1)
  return model
}

/** Free what a procedural plant model owns: its geometry and its materials. */
export function disposePlantModel(group: THREE.Object3D): void {
  if (group.userData.sharedModel === true) return
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose()
  })
  for (const geometry of [group.userData.leafGeometry, group.userData.stemGeometry] as Array<THREE.BufferGeometry | undefined>) geometry?.dispose()
  ;((group.userData.disposeMaterials ?? []) as THREE.Material[]).forEach((material) => material.dispose())
}

function disposePlantVisual(visual: PlantVisual): void {
  visual.helper?.dispose()
  visual.helper = null
  // A Blender model shares the loaded geometry and materials; it frees only its own.
  if (visual.modeled) visual.modeled.dispose()
  else disposePlantModel(visual.group)
}

/**
 * Species drawn from a Blender model that grows itself from inside. Every other
 * species is a procedural model the garden scales as it grows.
 */
const MODELED_PLANTS: Partial<Record<PlantId, { readonly create: () => BlueberryVisual; readonly grownScale: number }>> = {
  blueberry: { create: createBlueberryVisual, grownScale: BLUEBERRY_GROWN_SCALE },
  poppy: { create: createPoppyVisual, grownScale: POPPY_GROWN_SCALE },
}

/** A Blender model in a plant group; the model grows itself, the group only places it. */
function makeModeledGroup(species: PlantId, modeled: BlueberryVisual, grownScale: number): THREE.Group {
  const group = new THREE.Group()
  group.name = `Plant · ${species}`
  modeled.root.scale.setScalar(grownScale)
  group.add(modeled.root)
  group.scale.setScalar(0.0001)
  return group
}

/** Shared by every plant's hit area: a unit column standing on its base, never drawn. */
const HIT_AREA_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
const HIT_AREA_MATERIAL = new THREE.MeshBasicMaterial({ visible: false })

/**
 * How far from its centre a plant answers a click: most of the room it claims
 * (its spacing ring), so a small flower is caught by its whole bed and not just
 * its stem. Neighbours' areas never overlap, as their spacing rings don't.
 */
function hitRadius(species: PlantId, groundCover: boolean, growth: number): number {
  if (groundCover) return PATCH_RADIUS * (0.3 + 0.7 * growth)
  return Math.max(0.3, plantSpecies(species).spacingRadius * 0.78)
}

/** A grown plant to ghost under the cursor while placing its seed. */
function makeGhostModel(species: PlantId): GhostModel | null {
  if (species === 'poppy') {
    const poppy = cloneGrownPoppy()
    return poppy ? { object: poppy, dispose: () => {} } : null
  }
  if (species === 'blueberry') {
    const bush = cloneBush()
    if (!bush) return null
    bush.scale.setScalar(BLUEBERRY_GROWN_SCALE)
    for (const hidden of ['BB_shoots', 'BB_flowers']) {
      const group = bush.getObjectByName(hidden)
      if (group) group.visible = false
    }
    return { object: bush, dispose: () => {} }
  }
  const model = makePlantModel(species)
  model.scale.setScalar(1)
  return { object: model, dispose: () => disposePlantModel(model) }
}

/** How tall a plant stands, for markers and helpers: a bush by its growth, others by their scale. */
function plantHeight(plant: GardenPlant, groundCover: boolean, scale: number): number {
  if (plant.species === 'blueberry') return 0.92 * BLUEBERRY_GROWN_SCALE * (0.32 + 0.68 * plant.growth)
  if (plant.species === 'poppy') return POPPY_GROWN_SCALE * poppyHeight(plant.growth)
  return (groundCover ? 0.3 : 1) * scale
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
  const placementArt = createPlacementArt(makeGhostModel)
  root.add(placementArt.root)
  const bursts = createBurstPool()
  let careHandlers: PlantCareHandlers | null = null
  let answeringId: number | null = null
  // The bush, the poppy and the minigame cast load early, so a plant is never planted invisible.
  void loadGardenModels().catch(() => {})
  void loadPoppyModel().catch(() => {})
  let selectedSpecies: PlantId | null = null
  let previewVisible = false
  let hoveredPlantId: number | null = null
  let previewPosition: THREE.Vector3 | null = null
  let invalidSeconds = 0
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

  function addVisual(plant: GardenPlant, plantedNow = false): void {
    const spec = MODELED_PLANTS[plant.species]
    const modeled = spec ? spec.create() : null
    const group = spec && modeled ? makeModeledGroup(plant.species, modeled, spec.grownScale) : makePlantModel(plant.species)
    const hitArea = new THREE.Mesh(HIT_AREA_GEOMETRY, HIT_AREA_MATERIAL)
    hitArea.name = `Plant hit area · ${plant.instanceId}`
    hitArea.userData.instanceId = plant.instanceId
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
    const completionMaterial = new THREE.SpriteMaterial({ map: maturityBannerTexture(), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false })
    const completionBadge = new THREE.Sprite(completionMaterial)
    completionBadge.name = `Plant complete · ${plant.instanceId}`
    completionBadge.renderOrder = 1500
    completionBadge.scale.set(0, 0, 1)
    completionBadge.visible = false
    const maturityMaterial = new THREE.SpriteMaterial({ map: maturitySealTexture(), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false })
    const maturitySeal = new THREE.Sprite(maturityMaterial)
    maturitySeal.name = `Plant fully grown · ${plant.instanceId}`
    maturitySeal.renderOrder = 1499
    maturitySeal.scale.set(0, 0, 1)
    // Anchored at the rosette's middle rather than the canvas's, which includes the ribbon tails.
    maturitySeal.center.set(0.5, 0.6)
    maturitySeal.visible = false
    const markerMaterial = new THREE.SpriteMaterial({ map: careMarkerTexture('water'), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false })
    const marker = new THREE.Sprite(markerMaterial)
    marker.name = `Plant care marker · ${plant.instanceId}`
    marker.renderOrder = 2000
    // Sized every frame in syncVisuals, before the frame's matrices are built;
    // zero until then so a marker never flashes in at the wrong size.
    marker.scale.set(0, 0, 1)
    // Anchored at the tail's tip, so the pin always points down at the plant.
    marker.center.set(0.5, MARKER_TIP_FROM_BOTTOM)
    marker.visible = false
    root.add(group, celebration, completionBadge, maturitySeal, marker, hitArea)
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
      markerGrow: 0,
      markerCare: null,
      markerWanted: false,
      markerLiftPx: 0,
      sealGrow: 0,
      plantNumber: plantNumberFor(plant),
      markerPosition: new THREE.Vector3(),
      modeled,
      hitArea,
      plantedAge: plantedNow ? 0 : Number.POSITIVE_INFINITY,
      helper: null,
      helperResolved: false,
    })
  }

  function markerHit(clientX: number, clientY: number): { visual: PlantVisual; kind: 'care' | 'mature' } | null {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    let best: { visual: PlantVisual; kind: 'care' | 'mature' } | null = null
    let bestDistance = 34
    for (const visual of visuals.values()) {
      for (const [kind, visible, position] of [
        ['care', visual.marker.visible && visual.markerWanted, visual.markerPosition],
        ['mature', visual.maturitySeal.visible && !visual.maturitySealDismissed, visual.maturitySeal.position],
      ] as const) {
        if (!visible) continue
        markerProjector.copy(position).project(camera)
        if (markerProjector.z < -1 || markerProjector.z > 1) continue
        const x = rect.left + (markerProjector.x + 1) * rect.width / 2
        const y = rect.top + (1 - markerProjector.y) * rect.height / 2 - (kind === 'care' ? visual.markerLiftPx : 0)
        const distance = Math.hypot(clientX - x, clientY - y)
        if (distance < bestDistance) {
          best = { visual, kind }
          bestDistance = distance
        }
      }
    }
    return best
  }

  /** The plant whose hit area the pointer ray (already cast) meets first. */
  function hitAreaAt(): PlantVisual | null {
    const areas = [...visuals.values()].filter((visual) => visual.group.visible).map((visual) => visual.hitArea)
    const hit = raycaster.intersectObjects(areas, false)[0]
    return hit ? visuals.get(hit.object.userData.instanceId as number) ?? null : null
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
    const selected = hitAreaAt()
    if (!selected) return null
    selectedPlantIds.clear()
    selectedPlantIds.add(selected.instanceId)
    return plantsById().get(selected.instanceId) ?? null
  }

  function syncVisuals(deltaSeconds = 0): void {
    const current = plantsById()
    for (const [id, visual] of visuals) {
      if (current.has(id)) continue
      selectedPlantIds.delete(id)
      root.remove(visual.group, visual.celebration, visual.completionBadge, visual.maturitySeal, visual.marker, visual.hitArea)
      disposePlantVisual(visual)
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
      // A Blender model grows itself from inside (blueberry-visual.ts, poppy-visual.ts); the group only places it.
      const scale = visual.modeled ? 1 : groundCover ? 0.3 + 0.7 * plant.growth : Math.max(0.16, plant.growth)
      // A fresh plant springs out of the soil with a little overshoot.
      const pop = visual.plantedAge < PLANT_POP_SECONDS ? Math.max(0.02, springOut(visual.plantedAge / PLANT_POP_SECONDS)) : 1
      visual.group.scale.setScalar((plant.instanceId === hoveredPlantId ? scale * HOVER_GROW : scale) * pop)
      if (!groundCover && !visual.modeled) {
        visual.group.rotation.y = Math.sin(elapsed * 1.3 + plant.instanceId) * 0.08
        visual.group.position.y += Math.sin(elapsed * 2 + plant.instanceId) * 0.018 * scale
      }
      visual.group.visible = true
      const reach = hitRadius(plant.species, groundCover, plant.growth)
      visual.hitArea.position.set(plant.x, visual.group.position.y, plant.z)
      visual.hitArea.scale.set(reach, Math.max(0.3, plantHeight(plant, groundCover, scale) + 0.1), reach)
      visual.hitArea.updateMatrixWorld()
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
        ? (camera.top - camera.bottom) / camera.zoom / Math.max(1, canvas.clientHeight)
        : 1
      // Cues grow a little on big screens and shrink a little on small ones.
      const uiScale = THREE.MathUtils.clamp(canvas.clientHeight / 720, 0.8, 1.25)
      const celebrating = visual.maturityCelebrationRemaining > 0
      // The seal waits for the banner to finish, then springs in where it stood.
      const sealWanted = plant.mature && !visual.maturitySealDismissed && visual.maturityCelebrationRemaining < 0.35
      visual.sealGrow = stepGrow(visual.sealGrow, sealWanted, deltaSeconds)
      visual.maturitySeal.visible = visual.sealGrow > 0
      if (visual.maturitySeal.visible) {
        const size = SEAL_PX * uiScale * worldUnitsPerPixel * growScale(visual.sealGrow, sealWanted)
        visual.maturitySeal.position.set(plant.x + 0.34, visual.group.position.y + 1.02, plant.z)
        visual.maturitySeal.scale.set(size, size, 1)
        visual.maturitySeal.material.opacity = Math.min(1, visual.sealGrow * 2)
      }
      visual.completionBadge.visible = celebrating
      if (celebrating) {
        const age = CELEBRATION_SECONDS - visual.maturityCelebrationRemaining
        const progress = age / CELEBRATION_SECONDS
        const pop = springOut(Math.min(1, age / BANNER_POP_SECONDS))
        const width = BANNER_WIDTH_PX * uiScale * worldUnitsPerPixel * pop
        visual.completionBadge.position.set(plant.x, visual.group.position.y + 1.3 + progress * 0.35, plant.z)
        visual.completionBadge.scale.set(width, width * BANNER_HEIGHT / BANNER_WIDTH, 1)
        visual.completionBadge.material.rotation = Math.sin(age * 5) * 0.035 * (1 - progress)
        visual.completionBadge.material.opacity = Math.min(1, visual.maturityCelebrationRemaining / 0.45)
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
      // No marker while a helper or a minigame is answering, or once a helper is hired for it.
      const handled = plant.careNeeded !== null && (
        visual.helper !== null
        || plant.instanceId === answeringId
        || (plantSpecies(plant.species).minigames === true && careHandlers?.helperHired(plant.species, plant.careNeeded) === true)
      )
      const wanted = plant.careNeeded !== null && !handled
      // A new chore while the old one is still tucking away waits for it to finish.
      const swapping = wanted && visual.markerCare !== null && visual.markerCare !== plant.careNeeded
      visual.markerWanted = wanted && !swapping
      visual.markerGrow = stepGrow(visual.markerGrow, visual.markerWanted, deltaSeconds)
      if (visual.markerWanted) visual.markerCare = plant.careNeeded
      if (visual.markerGrow <= 0) {
        visual.markerCare = null
        visual.marker.visible = false
        continue
      }
      const care = visual.markerCare ?? plant.careNeeded ?? 'water'
      const material = visual.marker.material
      const map = careMarkerTexture(care)
      if (material.map !== map) {
        material.map = map
        material.needsUpdate = true
      }
      const width = MARKER_WIDTH_PX * uiScale * growScale(visual.markerGrow, visual.markerWanted)
      const height = width * CARE_MARKER_HEIGHT / CARE_MARKER_WIDTH
      visual.markerLiftPx = height * (MARKER_TIP_Y - MARKER_BADGE_Y) / CARE_MARKER_HEIGHT
      visual.marker.scale.set(width * worldUnitsPerPixel, height * worldUnitsPerPixel, 1)
      // A gentle bob, and every few seconds a little wiggle to catch the eye.
      const bob = Math.sin(elapsed * 2.6 + plant.instanceId) * 0.035
      const nudge = (elapsed * 0.32 + plant.instanceId * 0.37) % 1
      material.rotation = nudge < 0.16 ? Math.sin(nudge / 0.16 * Math.PI * 4) * 0.16 * (1 - nudge / 0.16) : 0
      material.opacity = Math.min(1, visual.markerGrow * 2.5)
      const markerY = visual.group.position.y + plantHeight(plant, groundCover, scale) + 0.12 + bob
      visual.marker.position.set(plant.x, markerY, plant.z)
      visual.markerPosition.set(plant.x, markerY, plant.z)
      visual.marker.visible = true
    }
  }

  /**
   * Hired helpers answer their chore on their own: start one on any plant that
   * needs it, count the chore done when the helper gets to it, and let the
   * helper leave in its own time.
   */
  function runHelpers(deltaSeconds: number): void {
    const current = plantsById()
    for (const visual of visuals.values()) {
      const plant = current.get(visual.instanceId)
      if (!plant) continue
      const care = plant.careNeeded
      if (!visual.helper && care && plant.instanceId !== answeringId && plantSpecies(plant.species).minigames && careHandlers?.helperHired(plant.species, care)) {
        visual.helper = createHelperFx(care, plantHeight(plant, false, 1), bursts)
        visual.helperResolved = false
        visual.helper.root.position.set(plant.x, visual.group.position.y, plant.z)
        root.add(visual.helper.root)
      }
      const helper = visual.helper
      if (!helper) continue
      const alive = helper.update(deltaSeconds)
      if (!visual.helperResolved && helper.age >= helper.resolveAt) {
        visual.helperResolved = true
        if (simulation.resolveCare(plant.instanceId, helper.care)) careHandlers?.helperDone?.(plant, helper.care)
      }
      if (!alive) visual.helper = null
    }
  }

  function updatePreview(point: THREE.Vector3 | null): void {
    previewPosition = point
    if (!selectedSpecies || !point) {
      placementArt.hide()
      previewVisible = false
      return
    }
    const result = simulation.placementResult(selectedSpecies, point.x, point.z, surfaceAt(point))
    const species = PLANT_CATALOG.find((entry) => entry.id === selectedSpecies)!
    const groundY = terrain.heightAt(point.x, point.z)
    const substrate = surfaceAt(point)
    const floating = substrate.waterDepth >= PLANT_WATER_MIN_DEPTH
    const y = floating ? water.surfaceAt(point.x, point.z) : groundY
    placementArt.root.position.set(point.x, GARDEN_LAWN_Y + y + 0.02, point.z)
    // Drawn at the plant's own claim, not the full keep-apart distance: the ring
    // is one plant's half of the gap, so neighbouring rings just touch when the
    // spacing rule starts to complain.
    const wanted = floating ? 'water' : plantSpecies(species.id).substrate
    placementArt.show(species.id, wanted, plantSpacingExtent(species.id), result.valid && invalidSeconds <= 0, invalidSeconds > 0)
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
    placementArt.hide()
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
        if (plant?.careNeeded && plantSpecies(plant.species).minigames) {
          // Earned care: the marker opens the chore's minigame instead of answering it.
          if (careHandlers && !careHandlers.helperHired(plant.species, plant.careNeeded)) careHandlers.startGame(plant, plant.careNeeded)
        } else if (plant?.careNeeded) {
          lastCareResolved = simulation.resolveCare(plant.instanceId, plant.careNeeded)
        }
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
    addVisual(planted, true)
    const groundCover = plantSpecies(planted.species).groundCover !== undefined
    bursts.add(createBurst(new THREE.Vector3(planted.x, point.y + GARDEN_LAWN_Y + 0.05, planted.z), {
      count: 18, colors: groundCover ? ['#6a9e4a', '#4f8a3c', '#8a6040'] : ['#7a5236', '#5e3d27', '#9a7049'],
      size: 0.045, speed: [1.1, 2.2], lift: 1.6, gravity: 9, seconds: 0.75, cone: 1.1,
    }), root)
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
    pointerLeave(): void { placementArt.hide(); previewVisible = false; previewPosition = null },
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
    plantAt(clientX, clientY): HoverPlant | null {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const best = hitAreaAt()
      if (!best) return null
      const group = best.group
      return {
        instanceId: best.instanceId,
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
        radius: Math.max(0.2, 0.42 * group.scale.x),
      }
    },
    setHoveredPlant(instanceId): void {
      hoveredPlantId = instanceId
    },
    markerKindAt(clientX, clientY): PlantCare | 'mature' | null {
      const target = markerHit(clientX, clientY)
      if (!target) return null
      if (target.kind === 'mature') return 'mature'
      return plantsById().get(target.visual.instanceId)?.careNeeded ?? null
    },
    tick(stepSeconds, allowGrowth): void {
      const previousMaturity = new Set(simulation.plants.filter((plant) => plant.mature).map((plant) => plant.instanceId))
      if (allowGrowth) simulation.tick(stepSeconds)
      for (const plant of simulation.plants) {
        if (!plant.mature || previousMaturity.has(plant.instanceId)) continue
        const visual = visuals.get(plant.instanceId)
        if (visual) visual.maturityCelebrationRemaining = CELEBRATION_SECONDS
      }
    },
    setCareHandlers(handlers): void {
      careHandlers = handlers
    },
    setAnswering(instanceId): void {
      answeringId = instanceId
    },
    plantFrame(instanceId) {
      const plant = plantsById().get(instanceId)
      const visual = visuals.get(instanceId)
      if (!plant || !visual) return null
      const groundCover = visual.group.userData.groundCover === true
      return {
        position: new THREE.Vector3(plant.x, visual.group.position.y, plant.z),
        height: plantHeight(plant, groundCover, visual.modeled ? 1 : visual.group.scale.x),
      }
    },
    celebrateCare(instanceId, care): void {
      const plant = plantsById().get(instanceId)
      const visual = visuals.get(instanceId)
      if (!plant || !visual) return
      const height = plantHeight(plant, visual.group.userData.groundCover === true, 1)
      const at = new THREE.Vector3(plant.x, visual.group.position.y + height * 0.65, plant.z)
      if (care === 'prune') bursts.add(createBurst(at, { count: 26, colors: ['#9bc85b', '#7fb64f', '#b9db7a'], size: 0.05, speed: [1.4, 2.8], lift: 1.4, gravity: 6, seconds: 1.1, shape: 'leaf' }), root)
      else if (care === 'pest') bursts.add(createBurst(at, { count: 14, colors: ['#ffe17a', '#fff1b3', '#ffffff'], size: 0.07, speed: [1, 2], lift: 1.2, gravity: 2.5, seconds: 1, shape: 'star' }), root)
      else bursts.add(createBurst(new THREE.Vector3(plant.x, visual.group.position.y + 0.08, plant.z), { count: 22, colors: ['#8fd0ea', '#bfe8f5', '#ffffff'], size: 0.04, speed: [1, 1.9], lift: 1.4, gravity: 8, seconds: 0.8 }), root)
      // The same springy pop as planting, smaller: the bush shakes itself off.
      visual.plantedAge = PLANT_POP_SECONDS * 0.45
    },
    update(deltaSeconds): void {
      elapsed += deltaSeconds
      invalidSeconds = Math.max(0, invalidSeconds - deltaSeconds)
      for (const visual of visuals.values()) {
        visual.maturityCelebrationRemaining = Math.max(0, visual.maturityCelebrationRemaining - deltaSeconds)
        visual.plantedAge += deltaSeconds
      }
      runHelpers(deltaSeconds)
      syncVisuals(deltaSeconds)
      for (const plant of simulation.plants) {
        const visual = visuals.get(plant.instanceId)
        visual?.modeled?.update({ growth: plant.growth, care: plant.careNeeded, answering: plant.instanceId === answeringId }, elapsed + plant.instanceId * 1.7, deltaSeconds, plant.fruitTimers)
      }
      bursts.update(deltaSeconds)
      placementArt.update(deltaSeconds)
      if (selectedSpecies && previewPosition) updatePreview(previewPosition)
      if (!selectedSpecies) {
        placementArt.hide()
        previewVisible = false
      }
    },
    dispose(): void {
      for (const visual of visuals.values()) {
        disposePlantVisual(visual)
        visual.marker.material.dispose()
        visual.completionBadge.material.dispose()
        visual.maturitySeal.material.dispose()
        visual.celebration.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          object.geometry.dispose()
          ;(object.material as THREE.Material).dispose()
        })
      }
      placementArt.dispose()
      bursts.dispose()
      disposePlantCareArt()
    },
  }
}
