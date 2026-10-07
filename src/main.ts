import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { createAnimalCrowdRenderer, type AnimalCrowdEntry, type AnimalCrowdStats } from './animals/animal-crowd-renderer'
import { getAnimalSceneOptions, ANIMAL_CATALOG, VIEWER_CAST } from './animals/animal-catalog'
import { chooseDetailedAnimals, type AnimalRenderCandidate } from './game/animal-render-policy'
import { containsGardenPoint, createFairground, createSkyDome, GARDEN_BOUNDS } from './scene/fairground'
import { ANIMAL_LIFE_CONFIG, createAnimalLife, type AnimalRecord, type AnimalLifeEvent } from './game/animal-life'
import { FARM_EXPANSION_CONFIG } from './game/farm-expansion'
import { clearOfFarmBounds } from './game/animal-travel'
import { createProgressLedger } from './game/farm-progression'
import { buildAccomplishmentCatalog, createAccomplishmentTracker, type AccomplishmentDef, type AccomplishmentStage } from './game/accomplishments'
import { startNextEarnedExpansion } from './game/progression-rewards'
import { type FarmSnapshot } from './game/animal-progress'
import { measureFarmState, type FarmState, type LawnSample, type TerrainSample, type WaterSample } from './game/farm-state'
import { conditionMetricUnit, stageDefinition, stageTitle } from './game/animal-conditions'
import { createCaptureShowcaseStage, GARDEN_LAWN_Y, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createGardenTools, type GardenTools } from './scene/garden-tools'
import { createGardenTerrain } from './scene/garden-terrain'
import { createGardenWaterField } from './game/garden-water'
import { createGardenWaterMesh } from './scene/garden-water-mesh'
import { createGardenPlants, type GardenPlants } from './scene/garden-plants'
import { createGardenProps, type GardenProps } from './scene/garden-props'
import { PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, type PlantId, type PlantSubstrate } from './game/plants'
import { PROP_CATALOG, purchaseProp, type PropId } from './game/farm-props'
import { animalSaleValue, createWallet, generateAnimalNames, plantSaleValue } from './game/sales'
import { GARDEN_TOOLS, type GardenToolId } from './scene/garden-tool-art'
import { createCameraTour, type CameraTour, type CameraTourSubject } from './game/camera-tour'
import { cameraPanStep } from './game/camera-rig'
import { createUILayer, routePointer, type UIPanel } from './ui/ui-layer'
import { createJournalPanel, type JournalConditionSource } from './ui/journal-panel'
import { createJournalDomPanel, type JournalDomPanel } from './ui/journal-dom'
import { createMenuPanel, type MenuChoice } from './ui/menu-panel'
import { createToolsHud } from './ui/tools-hud'
import { createBalloonPanel } from './ui/balloon-panel'
import { createPlayerDomPanel, playerLevelCards } from './ui/player-dom'
import { createSalePanel } from './ui/sale-panel'
import { createShedPanel } from './ui/shed-panel'
import { createShedDomPanel, type ShedDomPanel } from './ui/shed-dom'
import { createShopDomPanel, type ShopDomPanel } from './ui/shop-dom'
import { setCursor } from './ui/ui-cursor'
import type { DesignPoint } from './ui/ui-viewport'
import { createViewerPanel } from './ui/viewer-panel'
import { createNotificationPanel } from './ui/notification-panel'
import { createNotificationDomPanel } from './ui/notification-dom'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('Missing game canvas')
const gameCanvas = canvas

const renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true, powerPreference: 'high-performance' })
// Cap the drawing buffer below the display pixel ratio: at devicePixelRatio the
// canvas raster gets enormous (and so do any screenshots of it). 1.25 keeps
// edges acceptably smooth while keeping captures far under attachment limits.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.info.autoReset = false // reset manually each frame so stats survive the HUD pass

const scene = new THREE.Scene()
scene.background = new THREE.Color('#c2d8cf')
scene.fog = new THREE.Fog('#c2d8cf', 185, 345)
scene.add(createSkyDome())

/**
 * Substituted at build time by scripts/build.mjs and scripts/dev.mjs. It has to
 * appear directly in each gate below, not behind a shared const: esbuild only
 * removes the harness, frame timing and FPS overlay when it can constant-fold
 * the literal at the `if` itself. With `GARDEN_DEBUG=0` (the default for a
 * production build) none of that code reaches the bundle at all.
 */
declare const __GARDEN_DEBUG__: boolean

const pageParams = new URLSearchParams(window.location.search)
const gardenDebugMode = __GARDEN_DEBUG__ && pageParams.has('gardenDebug')
const normalViewHeight = 43
/**
 * The viewer looks at a small stage, so it zooms right in. The farm keeps its
 * own wide framing because the whole fairground has to fit on screen.
 */
const viewerViewHeight = 26
/**
 * Close-up framing for the solo review booth (a single-species VIEWER_CAST):
 * the whole point is judging one model, so it fills the frame.
 */
const singleModelViewHeight = 6.5
/**
 * How far below the stage the viewer's look-at point sits, in world units.
 * Lowering it lifts the stage up the screen so the animal tray along the
 * bottom does not cover the animals' feet.
 */
const viewerTargetY = -4.7

const cameraTarget = new THREE.Vector3(0, 1.25, 0)
const aspect = window.innerWidth / Math.max(1, window.innerHeight)
const viewHeight = normalViewHeight
const camera = new THREE.OrthographicCamera(
  -(viewHeight * aspect) / 2,
  (viewHeight * aspect) / 2,
  viewHeight / 2,
  -viewHeight / 2,
  0.1,
  720,
)
// Orthographic distance does not change framing. Keep the eye far enough back
// that the bottom rays stay above ground at maximum zoom and shallow tilt.
const initialOffset = new THREE.Vector3(35, 34, 47).multiplyScalar(2)
camera.position.copy(cameraTarget).add(initialOffset)
camera.lookAt(cameraTarget)

const ambient = new THREE.HemisphereLight('#fff0ce', '#70975c', 1.85)
scene.add(ambient)

const sunlight = new THREE.DirectionalLight('#fff0d6', 3.0)
sunlight.position.set(-22, 42, 17)
sunlight.castShadow = true
sunlight.shadow.mapSize.set(2048, 2048)
sunlight.shadow.camera.left = -52
sunlight.shadow.camera.right = 52
sunlight.shadow.camera.top = 52
sunlight.shadow.camera.bottom = -52
sunlight.shadow.camera.near = 0.5
sunlight.shadow.camera.far = 145
sunlight.shadow.bias = -0.00028
sunlight.shadow.normalBias = 0.025
sunlight.shadow.radius = 5
sunlight.target.position.set(0, 0, 0)
scene.add(sunlight, sunlight.target)

const fill = new THREE.DirectionalLight('#c1edec', 0.82)
fill.position.set(27, 22, 28)
scene.add(fill)

const rim = new THREE.DirectionalLight('#ffbf9a', 1.15)
rim.position.set(1, 24, -32)
scene.add(rim)

const fairground = createFairground()
scene.add(fairground.root)
// The height field is the terrain source of truth; the soil sits 12 mm below
// the lawn paint layer so the two displaced planes never z-fight.
// Expanding the farm opens new ground. The tools and the terrain both need to
// know how big the plot is *now*, not how big it was when the scene was built,
// so they read it through a callback rather than a captured constant.
let currentGardenBounds: typeof GARDEN_BOUNDS = GARDEN_BOUNDS
const activeGardenBounds = (): typeof GARDEN_BOUNDS => currentGardenBounds
const gardenTerrain = fairground.gardenSurface && fairground.gardenSoil
  ? createGardenTerrain([
      { mesh: fairground.gardenSoil, offset: -0.012, soilRings: true },
      { mesh: fairground.gardenSurface },
    ], activeGardenBounds)
  : null
gardenTerrain?.applyToMeshes(true)
// Water shares the terrain grid so it sees the flat parcel edge and every sculpt.
const gardenWater = gardenTerrain
  ? createGardenWaterField({
      cellSize: gardenTerrain.cellSize,
      gridCols: gardenTerrain.gridCols,
      gridRows: gardenTerrain.gridRows,
      cellHeight: (gx, gz) => gardenTerrain.cellHeightAt(gx, gz),
    })
  : null
const gardenWaterMesh = gardenTerrain && gardenWater  ? createGardenWaterMesh(gardenTerrain, gardenWater, activeGardenBounds)
  : null
if (gardenWaterMesh) {
  scene.add(gardenWaterMesh.mesh)
  gardenWaterMesh.update(0)
}
const gardenTools: GardenTools | null = fairground.gardenSurface && fairground.gardenSoil && gardenTerrain
  ? createGardenTools(
      gameCanvas,
      camera,
      fairground.gardenSurface,
      gardenTerrain,
      activeGardenBounds,
      gardenWater ?? undefined,
      () => gardenWaterMesh?.markDirty(),
    )
  : null
if (gardenTools) scene.add(gardenTools.root)
const worldRaycaster = new THREE.Raycaster()
const worldPointer = new THREE.Vector2()
function pickAnimal(clientX: number, clientY: number): BalloonAnimal | null {
  const rect = gameCanvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  worldPointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  worldRaycaster.setFromCamera(worldPointer, camera)
  const detailedMeshes = animals.filter((animal) => !animal.isSold && animal.root.visible).flatMap((animal) => {
    const meshes: THREE.Mesh[] = []
    animal.root.traverse((object) => { if (object instanceof THREE.Mesh && object.visible) meshes.push(object) })
    return meshes
  })
  const detailedHit = worldRaycaster.intersectObjects(detailedMeshes, false)[0]
  if (detailedHit) return animals.find((animal) => animal.root === detailedHit.object || animal.root.getObjectById(detailedHit.object.id) !== undefined) ?? null
  const crowdId = animalCrowd.pick(worldRaycaster)
  return crowdId ? animalById.get(crowdId) ?? null : null
}

function refreshAnimalCrowd(nowSeconds: number, force = false): void {
  if (!force && nowSeconds - lastCrowdRefreshAt < 1 / 15) return
  lastCrowdRefreshAt = nowSeconds
  const viewportHeight = Math.max(1, gameCanvas.clientHeight)
  const worldToPixels = viewportHeight / Math.max(0.001, viewHalfHeight * 2)
  camera.updateMatrixWorld()
  const candidates: AnimalRenderCandidate[] = []
  const visibleAnimals: BalloonAnimal[] = []
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  const activeInViewer = new Set(getViewerCastAnimals().map((animal) => animal.instanceId))
  for (const animal of animals) {
    const record = progress.animal(animal.instanceId)
    if (!record || record.stage <= 0 || animal.isSold) continue
    if (mode === 'viewer' && !activeInViewer.has(animal.instanceId)) {
      animal.setDetailedVisible(false)
      continue
    }
    const size = ANIMAL_CATALOG.find((entry) => entry.id === animal.id)?.size ?? 2
    const projectedHeight = size * animal.currentScale * worldToPixels
    const renderPosition = animal.currentPosition.clone()
    renderPosition.y += 0.4 * size * animal.currentScale
    const sphere = new THREE.Sphere(renderPosition, Math.max(1.2, size * animal.currentScale * 0.9))
    if (!frustum.intersectsSphere(sphere)) {
      animal.setDetailedVisible(false)
      continue
    }
    visibleAnimals.push(animal)
    candidates.push({
      id: animal.instanceId,
      projectedHeight,
      distance: camera.position.distanceTo(animal.currentPosition),
      priority: animal.renderPriority + (animal.instanceId === focusedAnimalId ? 200 : 0),
      interactive: animal.isCapturing || animal.isRomancing || animal.instanceId === focusedAnimalId,
    })
  }
  const detailedIds = new Set(mode === 'farm'
    ? chooseDetailedAnimals(candidates)
    : animals.filter((animal) => activeInViewer.has(animal.instanceId)).map((animal) => animal.instanceId))
  const visibleAnimalIds = new Set(visibleAnimals.map((animal) => animal.instanceId))
  const entries: AnimalCrowdEntry[] = []
  const actuallyDetailedIds = new Set<string>()
  for (const animal of animals) {
    const record = progress.animal(animal.instanceId)
    const desiredDetailed = detailedIds.has(animal.instanceId)
      && (mode === 'viewer' ? activeInViewer.has(animal.instanceId) : visibleAnimalIds.has(animal.instanceId))
    const detailed = desiredDetailed && animal.hasDetailedModel
    animal.setDetailedVisible(desiredDetailed)
    if (!record || record.stage <= 0 || animal.isSold || !visibleAnimalIds.has(animal.instanceId)) continue
    if (detailed) actuallyDetailedIds.add(animal.instanceId)
    entries.push({
      id: animal.instanceId,
      species: animal.id,
      x: animal.currentPosition.x,
      y: animal.currentPosition.y,
      z: animal.currentPosition.z,
      heading: animal.currentHeading,
      scale: animal.currentScale,
      // Read the look off the model, not the ladder record: residency is gated
      // on the animal having walked in, so a pending settle is still wild here.
      wild: animal.appearance === 'wild',
      phase: animal.animationPhase,
    })
  }
  for (const fixture of crowdFixtureEntries) entries.push(fixture)
  animalCrowd.setVisible(mode === 'farm')
  animalCrowd.update(entries, actuallyDetailedIds, nowSeconds)
  crowdStats = animalCrowd.stats()
}


let gardenPlants: GardenPlants | null = null
let coverageLookup: ((x: number, z: number) => number) | null = null
/** Egg meshes can be clicked independently from animals to hatch when ready. */
function createEggVisual(egg: { readonly id: number; readonly x: number; readonly z: number; readonly ready: boolean; readonly incubationProgress: number }): void {
  removeEggVisual(egg.id)
  const group = new THREE.Group()
  group.name = `Incubating egg ${egg.id}`
  group.position.set(egg.x, GARDEN_LAWN_Y + (gardenTerrain?.heightAt(egg.x, egg.z) ?? 0) + 0.14, egg.z)
  group.renderOrder = 5
  group.userData.eggId = egg.id
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 18, 14),
    new THREE.MeshStandardMaterial({ color: egg.ready ? '#fff2cf' : '#e7d9bc', roughness: 0.42 }),
  )
  shell.scale.set(0.78, 1.12, 0.78)
  shell.castShadow = true
  shell.userData.eggId = egg.id
  group.add(shell)
  const progressRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.025, 7, 32),
    new THREE.MeshBasicMaterial({ color: egg.ready ? '#f3c85b' : '#91c8a0', transparent: true, opacity: 0.9, depthWrite: false }),
  )
  progressRing.rotation.x = Math.PI / 2
  progressRing.position.y = -0.11
  progressRing.scale.setScalar(0.45 + 0.55 * egg.incubationProgress)
  group.add(progressRing)
  const sparkle = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#fff7d4', transparent: true, opacity: egg.ready ? 0.95 : 0.25, depthWrite: false }),
  )
  sparkle.position.set(0.11, 0.26, 0.02)
  sparkle.userData.eggId = egg.id
  progressRing.userData.eggId = egg.id
  group.add(sparkle)
  fairground.root.add(group)
  eggVisuals.set(egg.id, group)
}

function updateEggVisual(egg: { readonly id: number; readonly x: number; readonly z: number; readonly ready: boolean; readonly incubationProgress: number }): void {
  const group = eggVisuals.get(egg.id)
  if (!group) {
    createEggVisual(egg)
    return
  }
  group.position.set(egg.x, GARDEN_LAWN_Y + (gardenTerrain?.heightAt(egg.x, egg.z) ?? 0) + 0.14 + (egg.ready ? 0.035 : 0), egg.z)
  const shell = group.children[0] as THREE.Mesh
  const ring = group.children[1] as THREE.Mesh
  const sparkle = group.children[2] as THREE.Mesh
  ;(shell.material as THREE.MeshStandardMaterial).color.set(egg.ready ? '#fff2cf' : '#e7d9bc')
  ;(ring.material as THREE.MeshBasicMaterial).color.set(egg.ready ? '#f3c85b' : '#91c8a0')
  ring.scale.setScalar(0.45 + 0.55 * egg.incubationProgress)
  ;(sparkle.material as THREE.MeshBasicMaterial).opacity = egg.ready ? 0.95 : 0.25
}

function removeEggVisual(eggId: number): void {
  const group = eggVisuals.get(eggId)
  if (!group) return
  group.parent?.remove(group)
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
  eggVisuals.delete(eggId)
}

function pickEgg(clientX: number, clientY: number): { id: number; x: number; z: number; ready: boolean } | null {
  const rect = gameCanvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0 || !containsGardenPoint(0, 0, currentGardenBounds)) return null
  worldPointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  worldRaycaster.setFromCamera(worldPointer, camera)
  const hits = worldRaycaster.intersectObjects([...eggVisuals.values()], true)
  let object: THREE.Object3D | null = hits[0]?.object ?? null
  let id: number | undefined
  while (object && id === undefined) {
    id = object.userData.eggId as number | undefined
    object = object.parent
  }
  if (id === undefined) return null
  const egg = progress.eggs().find((entry) => entry.id === id)
  return egg ? { id: egg.id, x: egg.x, z: egg.z, ready: egg.ready } : null
}

/**
 * What the ground is like at a world position, for the plant rules.
 *
 * Shared with the debug harness on purpose: a test then plants a seed through
 * exactly the rules the seedbox uses, instead of a second implementation that
 * can quietly disagree about what counts as a pond.
 */
function plantSurfaceAt(x: number, z: number) {
  const waterDepth = gardenWater?.depthAt(x, z) ?? 0
  let substrate: PlantSubstrate = 'soil'
  if (waterDepth >= PLANT_WATER_MIN_DEPTH) substrate = 'water'
  else if ((coverageLookup?.(x, z) ?? 0) > 0.18) substrate = 'grass'
  return {
    substrate,
    waterDepth,
    inBounds: containsGardenPoint(x, z, currentGardenBounds),
  }
}
if (fairground.gardenSurface && gardenTerrain && gardenWater) {
  const coverageCellSize = 0.58
  const coverageCells = new Map<string, number[]>()
  let positions = fairground.gardenSurface.geometry.getAttribute('position') as THREE.BufferAttribute
  let colors = fairground.gardenSurface.geometry.getAttribute('color') as THREE.BufferAttribute
  const rebuildCoverageLookup = (): void => {
    positions = fairground.gardenSurface!.geometry.getAttribute('position') as THREE.BufferAttribute
    colors = fairground.gardenSurface!.geometry.getAttribute('color') as THREE.BufferAttribute
    coverageCells.clear()
    for (let index = 0; index < positions.count; index += 1) {
      const cellX = Math.floor(positions.getX(index) / coverageCellSize)
      const cellZ = Math.floor(-positions.getY(index) / coverageCellSize)
      const key = `${cellX},${cellZ}`
      const cell = coverageCells.get(key) ?? []
      cell.push(index)
      coverageCells.set(key, cell)
    }
    coverageLookup = (x, z) => {
      const cellX = Math.floor(x / coverageCellSize)
      const cellZ = Math.floor(z / coverageCellSize)
      let nearest = -1
      let best = Infinity
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
          for (const index of coverageCells.get(`${cellX + offsetX},${cellZ + offsetZ}`) ?? []) {
            const dx = positions.getX(index) - x
            const dz = -positions.getY(index) - z
            const distance = dx * dx + dz * dz
            if (distance < best) { nearest = index; best = distance }
          }
        }
      }
      return nearest >= 0 ? colors.getW(nearest) : 0
    }
  }
  rebuildCoverageLookup()
  gardenPlants = createGardenPlants(
    gameCanvas,
    camera,
    fairground.gardenSurface,
    gardenTerrain,
    gardenWater,
    activeGardenBounds,
    plantSurfaceAt,
  )
  scene.add(gardenPlants.root)
}

/**
 * The shop stands on the apron beyond the plot, outside even the fully expanded
 * bounds, so no amount of farm growth can swallow it. The model is authored
 * facing +Z; the half-turn here swings its storefront around to face the farm
 * plot (-Z), so the hatch, sign and porch greet the farm rather than the meadow.
 */
let gardenProps: GardenProps | null = null
if (fairground.gardenSurface && gardenTerrain && gardenWater) {
  gardenProps = createGardenProps({
    canvas: gameCanvas,
    camera,
    lawn: fairground.gardenSurface,
    terrain: gardenTerrain,
    water: gardenWater,
    getBounds: activeGardenBounds,
    shop: { x: 2.5, z: 18, rotationY: Math.PI + 0.08, url: 'assets/buildings/farm-shop.glb', size: 6.4 },
    onChange: () => refreshShopUi(),
  })
  scene.add(gardenProps.root)
}

let lastExpansionLevel = fairground.farmExpansion?.state.level ?? 0

// Animals arrive in wild balloon red. Capturing changes their materials in place, then restores
// each animal's palette through a shared 6.8-second paint-bucket reveal. Scene options come from
// the single ANIMAL_CATALOG source; groundSampler lets them follow the garden terrain height.
//
// The condition ladder is what now drives that transition. `progress` is the
// pure state machine; this file is only responsible for reading the farm,
// feeding it in, and acting on the events it returns.
const speciesIds = getAnimalSceneOptions(false, gameCanvas, camera).map((options) => options.id)
const progress = createAnimalLife(speciesIds)
const progression = createProgressLedger()
const accomplishments = createAccomplishmentTracker(buildAccomplishmentCatalog(
  ANIMAL_CATALOG.map((entry) => ({ id: entry.id, name: entry.name })),
  PLANT_CATALOG.map((entry) => ({ id: entry.id, name: entry.name })),
))
/** Stages 0 and 1 live at the carnival; 2 and up are inside the fence. */
const isLoose = (animalId: string): boolean => progress.animal(animalId)?.stage === 1

/**
 * Where a species first turns up.
 *
 * Carnival spawns were authored around the starter tents. Those tents slide
 * outward as the farm grows, so the spawn has to come with them: otherwise a
 * species would turn up inside the walls of a garden that has already swallowed
 * the spot it was authored at.
 */
function carnivalSpawnFor(species: string): readonly [number, number] {
  const bounds = activeGardenBounds()
  const authored = ANIMAL_CATALOG.find((entry) => entry.id === species)?.carnivalSpawn
  const base = authored ?? [bounds.halfWidth + 8, 0]
  const cleared = clearOfFarmBounds({ x: base[0], z: base[1] }, bounds)
  return [cleared.x, cleared.z]
}

const generatedAnimalNames = generateAnimalNames(48)
const animalNames = new Map<string, string>()
const animalById = new Map<string, BalloonAnimal>()
const animals: BalloonAnimal[] = []
const animalPopulationLimit = ANIMAL_LIFE_CONFIG.maximumPopulation
const animalCrowd = createAnimalCrowdRenderer(fairground.root)
let focusedAnimalId: string | null = null
let crowdStats = animalCrowd.stats()
/**
 * Live crowd fixtures for sustained load ramps. Empty in normal play; the
 * debug harness fills it via setCrowd and every reset path drains it, so a
 * fixture can never leak into a shipped session.
 */
let crowdFixtureEntries: AnimalCrowdEntry[] = []
function makeCrowdFixtures(requestedCount: number): AnimalCrowdEntry[] {
  const count = Math.max(0, Math.min(animalPopulationLimit, Math.floor(requestedCount)))
  return Array.from({ length: count }, (_, index) => {
    const catalog = ANIMAL_CATALOG[index % ANIMAL_CATALOG.length]
    const column = index % 40
    const row = Math.floor(index / 40)
    return {
      id: `crowd-stress-${index}`,
      species: catalog.id,
      x: (column - 19.5) * 1.15,
      y: GARDEN_LAWN_Y,
      z: (row - 12.5) * 1.15,
      heading: (index % 16) * Math.PI / 8,
      scale: 0.85 + (index % 5) * 0.04,
      wild: index % 3 === 0,
      phase: (index * 0.61803398875) % (Math.PI * 2),
    }
  })
}
let lastCrowdRefreshAt = 0
const eggVisuals = new Map<number, THREE.Group>()
const farmHomes = new Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>()
const viewerStands = new Map<string, THREE.Vector3>()
const animalCreations = new Map<string, Promise<BalloonAnimal>>()
function createAnimalInstance(record: AnimalRecord, position?: { x: number; z: number }): Promise<BalloonAnimal> {
  const existing = animalById.get(record.id)
  if (existing) return Promise.resolve(existing)
  const pending = animalCreations.get(record.id)
  if (pending) return pending
  const creation = loadAnimalInstance(record, position)
  animalCreations.set(record.id, creation)
  void creation.then(
    () => { if (animalCreations.get(record.id) === creation) animalCreations.delete(record.id) },
    () => { if (animalCreations.get(record.id) === creation) animalCreations.delete(record.id) },
  )
  return creation
}

async function loadAnimalInstance(record: AnimalRecord, position?: { x: number; z: number }): Promise<BalloonAnimal> {
  if (animals.length + animalCreations.size >= animalPopulationLimit && !animalById.has(record.id)) return Promise.reject(new Error(`The farm is at its ${animalPopulationLimit}-animal limit`))
  const options = getAnimalSceneOptions(false, gameCanvas, camera, gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined)
    .find((entry) => entry.id === record.species)
  if (!options) throw new Error(`Missing scene options for animal ${record.species}`)
  const name = animalNames.get(record.id) ?? generatedAnimalNames[animalNames.size] ?? `${options.name} ${animalNames.size + 1}`
  animalNames.set(record.id, name)
  const animal = await createBalloonAnimal(fairground.root, {
    ...options,
    name,
    onDetailedModelReady: () => refreshAnimalCrowd(performance.now() / 1000, true),
    instanceId: record.id,
    growthScale: record.growth,
    stage: 0,
    captureOnClick: false,
    spawn: position ? [position.x, position.z] : carnivalSpawnFor(record.species),
    isLoose: () => isLoose(record.id),
    getGardenBounds: activeGardenBounds,
  })
  animal.stage = record.stage
  animal.setGrowth(record.growth * record.adultScale)
  if (record.romancing && !record.baby) animal.setRomancing(true)
  else animal.setDetailedVisible(false)
  animalById.set(record.id, animal)
  animals.push(animal)
  farmHomes.set(record.id, { parent: animal.root.parent ?? fairground.root, position: animal.root.position.clone() })
  if (VIEWER_CAST.includes(animal.id)) {
    const [x, z] = SHOWCASE_ANIMALS[animal.id].spawn
    viewerStands.set(record.id, new THREE.Vector3(x, GARDEN_LAWN_Y + 0.1, z))
  }
  const latest = progress.animal(record.id)
  if (!latest) {
    animal.dispose()
    return animal
  }
  if (latest) {
    animal.stage = latest.stage
    animal.setGrowth(latest.growth * latest.adultScale)
    if (latest.romancing && !latest.baby) animal.setRomancing(true)
    else animal.setDetailedVisible(false)
  }
  return animal
}
await Promise.all(progress.all().map((record) => createAnimalInstance(record)))
  const wallet = createWallet()

// Individual residents and visitors are spawned from the pure animal-life records below.

// Farm homes and viewer plinths are assigned as each independently tracked animal is created.
/**
 * The viewer is the review booth for new models: VIEWER_CAST decides which
 * species it stages, so a model being tuned stands there alone instead of
 * sharing the stage with the whole catalog. The rest of the farm carries on
 * without them and is untouched when the booth closes.
 */
const getViewerCastAnimals = (): BalloonAnimal[] => animals.filter((animal) => VIEWER_CAST.includes(animal.id))
const viewerFocusStand = VIEWER_CAST.length === 1
  ? new THREE.Vector3(SHOWCASE_ANIMALS[VIEWER_CAST[0]].spawn[0], GARDEN_LAWN_Y + 0.1, SHOWCASE_ANIMALS[VIEWER_CAST[0]].spawn[1])
  : null

// ------------------------------------------------------- farm measurement --

/**
 * The lawn's own vertex grids, read straight out of the tool that maintains
 * them. This is the seam between the renderer and the simulation: the pure
 * condition code never sees a Three.js object, it only ever sees these arrays.
 */
function currentLawnSample(): LawnSample | null {
  const lawn = fairground.gardenSurface
  if (!lawn) return null
  const positions = lawn.geometry.getAttribute('position') as THREE.BufferAttribute
  const colors = lawn.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  if (!colors) return null
  const count = positions.count
  const xs = new Float32Array(count)
  const zs = new Float32Array(count)
  const coverage = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    xs[index] = positions.getX(index)
    // The lawn geometry is authored in the XZ plane with +Y mapping to -Z.
    zs[index] = -positions.getY(index)
    coverage[index] = colors.getW(index)
  }
  return { count, xs, zs, coverage }
}

function currentTerrainSample(): TerrainSample | null {
  if (!gardenTerrain) return null
  // The height field's own grid; `cellSize`/`cols`/`rows` describe it exactly.
  const cols = gardenTerrain.gridCols
  const rows = gardenTerrain.gridRows
  const cellSize = gardenTerrain.cellSize
  const originX = gardenTerrain.originX
  const originZ = gardenTerrain.originZ
  const heights = new Float32Array(cols * rows)
  for (let gz = 0; gz < rows; gz += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      heights[gz * cols + gx] = gardenTerrain.heightAt(
        originX + gx * cellSize,
        originZ + gz * cellSize,
      )
    }
  }
  return { heights, cols, rows, cellSize, originX, originZ }
}

/** The last measured farm, kept so the journal and harness can read it. */
let lastFarmState: FarmState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }

function currentWaterSample(): WaterSample | null {
  if (!gardenWater) return null
  const summary = gardenWater.summary()
  return { visibleWetCells: summary.visibleWetCells, cellSize: gardenWater.cellSize }
}

/**
 * Grown-up plants per species, which is what a `plantCount` condition reads.
 *
 * Only mature ones count, so an animal cannot be satisfied by seeds that have
 * been dropped in the water and forgotten. The plant simulation owns the truth
 * about growth; this only tallies it.
 */
function maturePlantCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const plant of gardenPlants?.simulation.plants ?? []) {
    if (!plant.mature) continue
    counts[plant.species] = (counts[plant.species] ?? 0) + 1
  }
  return counts
}

function measureFarm(): FarmState {
  const lawn = currentLawnSample()
  const terrain = currentTerrainSample()
  if (!lawn || !terrain) return lastFarmState
  lastFarmState = measureFarmState(lawn, terrain, currentWaterSample(), maturePlantCounts())
  return lastFarmState
}

/**
 * Advance every animal one step and play whatever transition it earned.
 *
 * This is the only place the scene learns that a condition was met, and it
 * does so by setting `animal.stage` -- the animal then runs its own reveal.
 * Keeping the event handling here means `balloon-animal.ts` never has to know
 * that a condition system exists. */
function progressionHudState() {
  const eggs = progress.eggs()

  return {
    points: progression.points,
    level: progression.level,
    pointsToNextLevel: progression.pointsToNextLevel,
    population: progress.all().filter((animal) => animal.stage > 0).length + eggs.length,
    capacity: progress.capacity(fairground.farmExpansion?.state.level ?? 0),
    eggs: eggs.length,
    readyEggs: eggs.filter((egg) => egg.ready).length,
  }
}

function currentFarmSnapshot(): FarmSnapshot {
  const residentSpecies = new Set(progress.all()
    .filter((entry) => entry.stage >= 3 && !entry.baby && !animalById.get(entry.id)?.isSold)
    .map((entry) => entry.species))
  return { state: measureFarm(), residentSpecies }
}

function accomplishmentStageForKind(kind: AnimalLifeEvent['kind']): AccomplishmentStage | null {
  if (kind === 'arriveCarnival') return 'appear'
  if (kind === 'enterFarm') return 'visit'
  if (kind === 'settle') return 'live'
  if (kind === 'fallInLove') return 'breed'
  return null
}

function unlockAccomplishment(def: AccomplishmentDef): void {
  progression.awardPoints(def.id, def.points)
  notificationPanel.notifyAccomplishment(def.title + ' · +' + def.points + ' pts', def.detail)
}

function ownedSeedSpecies(): ReadonlySet<string> {
  const owned = new Set<string>()
  for (const entry of PLANT_CATALOG) {
    if ((gardenPlants?.simulation.seedsFor(entry.id) ?? 0) > 0) owned.add(entry.id)
  }
  for (const plant of gardenPlants?.simulation.plants ?? []) owned.add(plant.species)
  return owned
}

function handleAnimalLifeEvents(events: readonly AnimalLifeEvent[]): void {
  for (const event of events) {
    const animal = event.animalId ? animalById.get(event.animalId) : undefined
    const stage = accomplishmentStageForKind(event.kind)
    if (stage) {
      const earned = accomplishments.discoverAnimalStage(event.species, stage)
      if (earned) unlockAccomplishment(earned)
    }
    if (event.stage !== undefined && animal) {
      animal.stage = event.stage
      animal.setDetailedVisible(animal.instanceId === focusedAnimalId || animal.isCapturing || animal.isRomancing)
      if (event.kind === 'arriveCarnival') {
        const spawn = carnivalSpawnFor(event.species)
        animal.root.position.set(spawn[0], GARDEN_LAWN_Y, spawn[1])
      }
      if (event.kind === 'settle' || event.kind === 'fallInLove') {
        // Logged here rather than beside the tick so the debug setStage reports
        // the same thing a live promotion does.
        console.info(`[Animal Balloon Farm] ${event.species} -> stage ${event.stage}`)
      }
    }
    if (event.kind === 'arriveCarnival' && event.animalId && !animal) {
      const record = progress.animal(event.animalId)
      if (record) void createAnimalInstance(record).then((created) => {
        farmHomes.set(created.instanceId, { parent: created.root.parent ?? fairground.root, position: created.root.position.clone() })
        if (VIEWER_CAST.includes(created.id)) {
          const [x, z] = SHOWCASE_ANIMALS[created.id].spawn
          viewerStands.set(created.instanceId, new THREE.Vector3(x, GARDEN_LAWN_Y + 0.1, z))
        }
      })
    }
    if (event.kind === 'courtship') {
      const partner = event.partnerId ? animalById.get(event.partnerId) : undefined
      if (animal && partner) {
        const separation = new THREE.Vector3(animal.root.position.x - partner.root.position.x, 0, animal.root.position.z - partner.root.position.z)
        if (separation.lengthSq() < 1e-6) separation.set(1, 0, 0)
        separation.setLength(0.9)
        animal.setRomancing(true, partner.root.position.clone().add(separation))
        partner.setRomancing(true, animal.root.position.clone().sub(separation))
      }
    }
    if (event.kind === 'courtshipEnd' || event.kind === 'layEgg') {
      animal?.setRomancing(false)
      const partner = event.partnerId ? animalById.get(event.partnerId) : undefined
      partner?.setRomancing(false)
    }
    if (event.kind === 'layEgg') {
      const egg = progress.eggs().find((entry) => entry.id === event.eggId)
      if (egg) createEggVisual(egg)
      notificationPanel.notifyMilestone('egg', animalDisplayName(event.species))
      console.info(`[Animal Balloon Farm] ${event.species} laid an egg`)
    }
    if (event.kind === 'hatch' && event.eggId !== undefined) removeEggVisual(event.eggId)
    if (event.kind === 'growUp' && animal) animal.setGrowth(1)
  }
}

function updateAnimalProgress(deltaSeconds: number): void {
  if (mode === 'viewer' || menu.isOpen || salePanel.isOpen) return
  const positions = Object.fromEntries(animals.map((animal) => [animal.instanceId, { x: animal.root.position.x, z: animal.root.position.z }]))
  const events = progress.tick({ farm: currentFarmSnapshot(), expansionLevel: fairground.farmExpansion?.state.level ?? 0, positions }, deltaSeconds)
  handleAnimalLifeEvents(events)
  const records = progress.all()
  const recordsById = new Map(records.map((record) => [record.id, record]))
  for (const record of records) {
    const animal = animalById.get(record.id)
    if (!animal || animal.isSold) continue
    animal.setGrowth(record.growth * record.adultScale)
    const partner = record.partnerId ? animalById.get(record.partnerId) : undefined
    const partnerRecord = record.partnerId ? recordsById.get(record.partnerId) : undefined
    if (record.romancing && partner && partnerRecord) {
      const separation = new THREE.Vector3(animal.root.position.x - partner.root.position.x, 0, animal.root.position.z - partner.root.position.z)
      if (separation.lengthSq() < 1e-6) separation.set(record.id.localeCompare(partnerRecord.id) < 0 ? -1 : 1, 0, 0)
      separation.setLength(0.9)
      animal.setRomancing(true, partner.root.position.clone().add(separation))
    } else if (!record.paired) {
      animal.setRomancing(false)
    }
  }
  const eggs = progress.eggs()
  for (const egg of eggs) updateEggVisual(egg)
  const liveEggIds = new Set(eggs.map((egg) => egg.id))
  for (const eggId of [...eggVisuals.keys()]) if (!liveEggIds.has(eggId)) removeEggVisual(eggId)
  // No appearance is applied from the event list here: `animal.stage = event.stage`
  // already routes the promotion through the model's residency gate, which keeps
  // a settle that arrives out at the tents waiting until the walk-in is done.
  refreshAnimalCrowd(performance.now() / 1000)
  const targetLevel = progression.level
  if (fairground.farmExpansion && startNextEarnedExpansion({
    get level() { return fairground.farmExpansion!.state.level },
    get isAnimating() { return fairground.farmExpansion!.state.isAnimating },
    expand: () => fairground.farmExpansion!.expand(),
  }, targetLevel)) {
    console.info(`[Animal Balloon Farm] earned expansion parcel ${fairground.farmExpansion.state.level}`)
  }
}

// ---------------------------------------------------------------- game modes --
// The farm and the animal viewer are the same scene with different staging, so
// switching modes swaps the fairground rather than reloading the page. That is
// what lets the main menu hand off to either one without a navigation.

type GameMode = 'farm' | 'viewer'
let mode: GameMode = 'farm'
let viewerStage: ReturnType<typeof createCaptureShowcaseStage> | null = null

const targetOffset = new THREE.Vector3()
const viewDirection = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize()
let cameraDistance = initialOffset.length()
let viewHalfHeight = viewHeight / 2
let dragPointer: number | null = null
let toolPointer: number | null = null
let previousPointer = { x: 0, y: 0 }
let dragMode: 'orbit' | 'pan' | null = null
const pressedKeys = new Set<string>()
let pointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
let pointerWasSeen = false
const CAMERA_EDGE_MARGIN = 34
const CAMERA_BASE_SPEED = 12
const CAMERA_MAX_SPEED = 27
const CAMERA_MIN_ZOOM = 1.25
const CAMERA_MAX_ZOOM = 34

const cameraShakeOffset = new THREE.Vector3()
const CAMERA_SHAKE_DURATION = 0.82
const CAMERA_SHAKE_AMPLITUDE = 0.38
let expansionFeedbackSeconds = 0
let expansionFeedbackStrength = 0

// ------------------------------------------------------------------- UI layer --

const ui = createUILayer()
const performanceOverlay = __GARDEN_DEBUG__ && gardenDebugMode ? createPerformanceOverlay() : null
ui.resize(window.innerWidth, window.innerHeight)

const journal = createJournalPanel(window.innerWidth, window.innerHeight, (isJournalOpen) => {
  syncFarmChrome()
  journalDom.setOpen(isJournalOpen)
})
const journalDom: JournalDomPanel = createJournalDomPanel({
  onClose: () => journal.close(),
})
journal.setSpreadSuppressed(true)
const notificationPanel = createNotificationPanel(window.innerWidth, window.innerHeight)
notificationPanel.setMailboxVisible(false)
const notificationDom = createNotificationDomPanel({
  onClose: () => {
    notificationDom.setOpen(false)
    syncFarmChrome()
    refreshCursor()
  },
})
const knownMaturePlants = new Set<number>()

function animalDisplayName(species: string): string {
  return ANIMAL_CATALOG.find((entry) => entry.id === species)?.name ?? species
}

function plantDisplayName(species: string): string {
  return PLANT_CATALOG.find((entry) => entry.id === species)?.name ?? species
}
const toolsHud = createToolsHud(
  gardenTools?.selectedTool ?? 'hand',
  (id: GardenToolId) => selectGardenTool(id),
  window.innerWidth,
  window.innerHeight,
)
const menu = createMenuPanel(handleMenuChoice, window.innerWidth, window.innerHeight, () => {
  syncFarmChrome()
})
const viewer = createViewerPanel({
  getAnimals: () => animals.filter((animal) => !animal.isSold && VIEWER_CAST.includes(animal.id)),
  getAnimalName: (id) => animalNames.get(animals.find((animal) => animal.id === id)?.instanceId ?? id) ?? id,
  playAll: () => {
    for (const animal of getViewerCastAnimals()) {
      if (animal.isCaptured) animal.setAppearance('wild')
      animal.beginCapture()
    }
  },
  resetAll: () => getViewerCastAnimals().forEach((animal) => animal.setAppearance('wild')),
  exit: () => setMode('farm'),
  replay: (id) => {
    const animal = animals.find((entry) => entry.id === id)
    if (!animal || animal.isSold) return
    if (animal.isCaptured) animal.setAppearance('wild')
    animal.beginCapture()
  },
}, window.innerWidth, window.innerHeight, VIEWER_CAST)

const salePanel = createSalePanel((target) => {
  if (target.kind === 'animal') {
    const animal = animalById.get(target.id)
    if (!animal || !animal.canSell || !animal.sell()) return null
    progress.remove(animal.instanceId)
    animalById.delete(animal.instanceId)
    const animalIndex = animals.indexOf(animal)
    if (animalIndex >= 0) animals.splice(animalIndex, 1)
    if (focusedAnimalId === animal.instanceId) focusedAnimalId = null
    animal.dispose()
    refreshAnimalCrowd(performance.now() / 1000, true)
    farmHomes.delete(animal.instanceId)
    viewerStands.delete(animal.instanceId)
    const balance = wallet.credit(target.price)
    salePanel.setWallet(balance)
    return balance
  }
  const plantId = Number(target.id)
  const plant = gardenPlants?.simulation.plants.find((entry) => entry.instanceId === plantId)
  if (!plant || !gardenPlants?.removePlant(plantId)) return null
  shedDom.refresh()
  const balance = wallet.credit(plantSaleValue(plant.species, plant.growth))
  salePanel.setWallet(balance)
  return balance
}, window.innerWidth, window.innerHeight, (isOpen) => {
  if (typeof toolsHud !== 'undefined') {
    if (isOpen) {
      gardenPlants?.cancelPlacement()
      gardenTools?.setPlantingMode(false)
      shed.setPlacementActive(false)
    } else {
      gardenPlants?.clearSelection()
    }
    toolsHud.setVisible(mode === 'farm' && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !isOpen)
    refreshCursor()
  }
})
salePanel.setWallet(wallet.balance)
salePanel.setWalletVisible(false)

const shed = createShedPanel(window.innerWidth, window.innerHeight, (isShedOpen) => {
  shedDom.setOpen(isShedOpen)
  syncFarmChrome()
  refreshCursor()
})
const shedDom: ShedDomPanel = createShedDomPanel({
  onClose: () => shed.close(),
  onPlant: (species: PlantId) => {
    if (!gardenPlants) return
    shed.close()
    gardenTools?.setPlantingMode(true)
    gardenPlants.selectSpecies(species)
    shed.setPlacementActive(true)
    syncFarmChrome()
    shedDom.refresh()
    refreshCursor()
  },
  onPlace: (id: PropId) => {
    if (!gardenProps) return
    shed.close()
    gardenProps.beginPlacement(id)
    gardenPlants?.cancelPlacement()
    gardenTools?.setPlantingMode(false)
    shed.setPlacementActive(true)
    syncFarmChrome()
    refreshCursor()
  },
  seedsFor: (species) => gardenPlants?.simulation.seedsFor(species) ?? 0,
  countsFor: (id) => gardenProps?.inventory.count(id) ?? 0,
  balance: () => wallet.balance,
})

/* Keep the shed and the shop showing the same counts the world does. */
function refreshShopUi(): void {
  shedDom.refresh()
  shop.refresh()
}

const shop: ShopDomPanel = createShopDomPanel({
  onClose: () => {
    shop.setOpen(false)
    syncFarmChrome()
    refreshCursor()
  },
  onBuy: (id: PropId) => {
    if (!gardenProps) return { ok: false, text: 'The shopkeeper is still unpacking.' }
    const result = purchaseProp(wallet, gardenProps.inventory, id)
    if (result.ok) {
      salePanel.setWallet(wallet.balance)
      shedDom.refresh()
      shop.refresh()
    }
    return {
      ok: result.ok,
      text: result.ok
        ? 'Shed stock updated -- Pip slides it across the counter.'
        : `Not enough coins for the ${PROP_CATALOG[id].name} -- it costs ${PROP_CATALOG[id].price}.`,
    }
  },
  countsFor: (id) => gardenProps?.inventory.count(id) ?? 0,
  seedsFor: (species) => gardenPlants?.simulation.seedsFor(species) ?? 0,
  balance: () => wallet.balance,
})

function playerDomStats() {
  const base = progressionHudState()
  const parcel = (fairground.farmExpansion?.state.level ?? 0) + 1
  return {
    points: base.points,
    level: base.level,
    pointsToNext: base.pointsToNextLevel,
    parcel,
    population: base.population,
    capacity: base.capacity,
    eggs: base.eggs,
    readyEggs: base.readyEggs,
    accomplishments: accomplishments.list(ownedSeedSpecies()),
    recentAccomplishments: accomplishments.recent(),
    levels: playerLevelCards(base.points, base.level),
  }
}

const playerDom = createPlayerDomPanel({
  onClose: () => {
    playerDom.setOpen(false)
    syncFarmChrome()
    refreshCursor()
  },
})

const balloon = createBalloonPanel(window.innerWidth, window.innerHeight, (quadrant) => {
  if (quadrant === 'journal') {
    shed.close()
    shop.setOpen(false)
    playerDom.setOpen(false)
    journal.open()
  } else if (quadrant === 'shed') {
    journal.close()
    shop.setOpen(false)
    playerDom.setOpen(false)
    shed.open()
  } else if (quadrant === 'player') {
    journal.close()
    shed.close()
    shop.setOpen(false)
    playerDom.refresh(playerDomStats())
    playerDom.setOpen(true)
  } else {
    journal.close()
    shed.close()
    shop.setOpen(false)
    playerDom.setOpen(false)
    if (notificationDom.isOpen) {
      notificationDom.setOpen(false)
    } else {
      notificationPanel.markAllRead()
      notificationDom.refresh(notificationPanel.getLetters(), notificationPanel.nowSeconds())
      notificationDom.setOpen(true, balloonInboxAnchor())
      balloon.setPostBadge('')
    }
  }
  syncFarmChrome()
  refreshCursor()
})

function balloonInboxAnchor(): { x: number; y: number } {
  const vw = ui.viewport.width
  const vh = ui.viewport.height
  const described = balloon.describe?.() as { center?: { x: number; y: number }; radius?: number } | undefined
  const cx = described?.center?.x ?? vw / 2 - 150
  const cy = described?.center?.y ?? 195 - vh / 2
  const top = cy + (described?.radius ?? 108) + 10
  return {
    x: ((cx + vw / 2) / vw) * window.innerWidth,
    y: ((vh / 2 - top) / vh) * window.innerHeight,
  }
}

const panels: UIPanel[] = [balloon, notificationPanel, toolsHud, shed, menu, viewer, journal, salePanel]

/**
 * Hand the journal a live view of the condition ladder.
 *
 * The translation lives here rather than in the journal so the UI keeps no
 * knowledge of the progression model -- it draws rows, and the model decides
 * what a row says and whether it is sealed yet.
 */
const journalConditionsSource: JournalConditionSource = {
  get: (species) => {
    const animal = animals.find((entry) => entry.id === species || entry.instanceId === species)
    if (!animal) return null
    const conditions = progress.statusOf(animal.instanceId)
    const rows = conditions.map((definition, index) => ({
      ...definition,
      revealed: index <= (progress.animal(animal.instanceId)?.stage ?? 0),
      current: definition.requirement && definition.requirement.kind !== 'residentSpecies'
        ? definition.requirement.kind === 'grassArea' ? measureFarm().tallGrassArea
          : definition.requirement.kind === 'waterArea' ? measureFarm().waterArea
            : definition.requirement.kind === 'flatArea' ? measureFarm().flatGrassArea
              : measureFarm().plantCounts[definition.requirement.species ?? ''] ?? 0
        : null,
      target: definition.requirement?.amount ?? null,
      met: index < (progress.animal(animal.instanceId)?.stage ?? 0),
      metricLabel: definition.requirement?.kind === 'plantCount' ? 'Plants in the ground' : null,
    }))
    if (!rows.length) return null
    return {
      stage: progress.animal(animal.instanceId)?.stage ?? 0,
      rows: rows.map((row) => {
        const definition = stageDefinition(animal.id, row.stage as 0 | 1 | 2 | 3 | 4)
        // A social condition has no area to meter, so name the friend instead.
        const wantsSpecies = row.requirement?.kind === 'residentSpecies' ? row.requirement.species : undefined
        return {
          stage: row.stage,
          title: row.title,
          revealed: row.revealed,
          current: row.current,
          target: row.target,
          met: row.met,
          result: row.result,
          hint: definition?.hint ?? '',
          ...(row.metricLabel ? { metricLabel: row.metricLabel } : {}),
          ...(row.metricLabel ? { metricUnit: conditionMetricUnit(definition?.requirement ?? null) } : {}),
          ...(wantsSpecies ? {
            waitingOn: {
              species: wantsSpecies,
              name: ANIMAL_CATALOG.find((animal) => animal.id === wantsSpecies)?.name ?? wantsSpecies,
              resident: progress.all().some((entry) => entry.species === wantsSpecies && entry.stage >= 3),
            },
          } : {}),
        }
      }),
    }
  },
};
journal.setConditionsSource(journalConditionsSource)
journalDom.setConditionsSource(journalConditionsSource)

/** Where the pointer was last seen, so the cursor can be re-resolved on a
 * mode or visibility change without waiting for the mouse to move again. */
const lastPointerClient = { x: -1, y: -1 }
for (const panel of panels) ui.add(panel)

function selectGardenTool(id: GardenToolId): void {
  // Space toggles the camera: pressing it again hands the farm back to the
  // Hand tool rather than leaving the framing mode armed. The tool bar has
  // already updated its own selection by the time it calls back here, so the
  // genuinely-before tool is the one the garden tools still hold.
  if (id === 'camera' && gardenTools?.selectedTool === 'camera') {
    selectGardenTool('hand')
    return
  }
  if (id !== 'camera') endCameraTour(true)
  gardenPlants?.cancelPlacement()
  gardenProps?.cancelPlacement()
  shed.setPlacementActive(false)
  gardenTools?.setPlantingMode(false)
  if (gardenTools) {
    // Tapping the active tool's hotkey again cycles its brush size rather than
    // re-selecting what is already selected. Hand has no brush size to cycle.
    if (gardenTools.selectedTool === id && id !== 'hand' && id !== 'camera') gardenTools.cycleBrushSize()
    else if (gardenTools.selectedTool !== id) gardenTools.selectTool(id)
  }
  toolsHud.setSelectedTool(id)
  shed.setInteractEnabled(id === 'hand')
  syncFarmChrome()
}

function handleMenuChoice(choice: MenuChoice): void {
  if (choice === 'options') {
    // Options is a placeholder destination for now; it must not look like a
    // dead end, so bounce back to the menu and leave the farm running.
    console.info('[menu] Options is not built yet.')
    return
  }
  setMode(choice === 'viewer' ? 'viewer' : 'farm')
}

function setMode(next: GameMode): void {
  // Neither destination wants a tour running: the viewer stages its own camera
  // and the farm restores its opening framing below.
  endCameraTour(false)
  if (next !== 'farm') {
    salePanel.close()
    shed.close()
    shed.setPlacementActive(false)
    shop.setOpen(false)
    gardenPlants?.cancelPlacement()
    gardenProps?.cancelPlacement()
    gardenTools?.setPlantingMode(false)
  }
  if (next === mode) {
    menu.close()
    return
  }
  mode = next
  if (next === 'viewer') {
    menu.close()
    viewer.open()
    journal.close()
    // Swap in the showcase staging so the animals stand together on a stage.
    if (!viewerStage) {
      viewerStage = createCaptureShowcaseStage(VIEWER_CAST)
      scene.add(viewerStage.root)
    }
    // Only the cast travels to the stage; the rest of the farm stays in the
    // fairground, which is simply removed from the scene while the booth is up.
    for (const animal of getViewerCastAnimals()) {
      viewerStage.root.add(animal.root)
      animal.root.position.copy(viewerStands.get(animal.instanceId)!)
      animal.setDetailedVisible(animal.stage > 0)
    }
    refreshAnimalCrowd(performance.now() / 1000, true)
    scene.remove(fairground.root)
    focusCamera()
  } else {
    viewer.close()
    scene.remove(viewerStage?.root ?? fairground.root)
    // Return only the cast; everyone else never left the fairground and keeps
    // whatever wander they were in the middle of.
    for (const animal of getViewerCastAnimals()) {
      const home = farmHomes.get(animal.instanceId)
      if (!home) continue
      home.parent.add(animal.root)
      animal.root.position.copy(home.position)
    }
    scene.add(fairground.root)
    refreshAnimalCrowd(performance.now() / 1000, true)
    focusCamera()
  }
  syncFarmChrome()
  updateCameraProjection()
}

function focusCamera(): void {
  targetOffset.set(0, 0, 0)
  if (mode === 'viewer' && viewerFocusStand) {
    // Solo review booth: frame just the staged plinth so the model under
    // review fills the frame. The look-at point sits below the plinth for the
    // same reason as the wide shot — the tray along the bottom must clear the
    // model's feet.
    cameraTarget.set(viewerFocusStand.x, viewerFocusStand.y - 0.8, viewerFocusStand.z)
    viewHalfHeight = singleModelViewHeight / 2
  } else {
    // The viewer's UI is a tray along the bottom, so the stage is framed a little
    // high: look at a point under it and the animals ride above the tray.
    cameraTarget.set(0, mode === 'viewer' ? viewerTargetY : 1.25, 0)
    viewHalfHeight = (mode === 'viewer' ? viewerViewHeight : normalViewHeight) / 2
  }
  camera.position.copy(cameraTarget).add(initialOffset)
  viewDirection.copy(initialOffset).normalize()
  cameraDistance = initialOffset.length()
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
  updateCameraProjection()
  refreshAnimalCrowd(performance.now() / 1000, true)
}

/**
 * The tool bar and the journal launcher belong to the farm. While the main menu
 * is up they used to stay on screen underneath it, so the menu's button row was
 * drawn straight through the tool bar and both sets of lettering overlapped.
 */
function syncFarmChrome(): void {
  const farmOnly = mode === 'farm' && !menu.isOpen
  if (menu.isOpen && shop.isOpen) shop.setOpen(false)
  const shopOpen = shop.isOpen
  const shedOpen = shed.isOpen
  const playerOpen = playerDom.isOpen
  toolsHud.setVisible(farmOnly && !journal.isOpen && !shedOpen && !salePanel.isOpen && !shopOpen && !gardenProps?.placingId && !playerOpen)
  shed.setVisible(false)
  shed.setInteractEnabled(toolsHud.selectedTool === 'hand')
  journal.setLauncherVisible(false)
  balloon.setVisible(farmOnly)
  balloon.setInteractEnabled(true)
  if (!farmOnly && notificationDom.isOpen) notificationDom.setOpen(false)
  if (gardenPlants) gardenPlants.root.visible = mode === 'farm'
  refreshCursor()
}

menu.open()
syncFarmChrome()
if (lastPointerClient.x < 0) {
  // No pointer has entered the window yet, so nothing to place. Once it does,
  // the first move resolves the cursor.
  setCursor('hand', gameCanvas)
}

// ------------------------------------------------------------- camera tool --
// The farm's own moves (edge pan, WASD, wheel zoom) are always available. The
// camera tool adds an explicit framing mode on top:
//   left-drag    orbits the view around whatever it is looking at,
//   right-click  runs a cinematic tour over the farm,
//   middle-click returns to the opening shot.
// The tour saves the view it replaced, so leaving it puts the player back
// exactly where they were rather than somewhere along the tour route.

interface SavedCameraView {
  readonly target: THREE.Vector3
  readonly position: THREE.Vector3
  readonly direction: THREE.Vector3
  readonly halfHeight: number
  readonly distance: number
}

let cameraTour: CameraTour | null = null
let cameraTourSeed = 0
let savedCameraView: SavedCameraView | null = null
/** The tour's live orbit, eased onto the sequencer's angle so a tour glides. */
let tourAngle = 0
let tourPhi = 1
const tourLookAt = new THREE.Vector3()
const tourDesiredLookAt = new THREE.Vector3()
const tourOffset = new THREE.Vector3()

/** Is the camera tool the one in hand, i.e. are its gestures armed? */
function cameraToolSelected(): boolean {
  return toolsHud.selectedTool === 'camera'
}

/** The tools that edit the farm. Hand selects, camera frames; neither digs. */
function isWorldToolActive(): boolean {
  const tool = toolsHud.selectedTool
  return tool === 'grass' || tool === 'shovel' || tool === 'water'
}

function beginCameraTour(seed = Math.floor(Math.random() * 0xffffffff)): boolean {
  if (mode !== 'farm' || menu.isOpen || journal.isOpen || salePanel.isOpen || shed.isOpen || shop.isOpen) return false
  savedCameraView = {
    target: cameraTarget.clone(),
    position: camera.position.clone(),
    direction: viewDirection.clone(),
    halfHeight: viewHalfHeight,
    distance: cameraDistance,
  }
  cameraTourSeed = seed >>> 0
  cameraTour = createCameraTour(cameraTourSeed)
  tourLookAt.copy(cameraTarget)
  // Start the orbit where the player is already looking, so the tour swings
  // into place instead of cutting to a fresh angle.
  const openingOffset = new THREE.Vector3().subVectors(camera.position, cameraTarget)
  const openingRadius = Math.max(1e-6, openingOffset.length())
  tourAngle = Math.atan2(openingOffset.x, openingOffset.z)
  tourPhi = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(openingOffset.y / openingRadius, -1, 1)), 0.36, 1.17)
  // A tour owns the camera outright, so a half-finished drag must not fight it.
  dragPointer = null
  dragMode = null
  return true
}

/** Leave the tour. `restore` puts back the framing the tour interrupted. */
function endCameraTour(restore: boolean): void {
  if (!cameraTour) return
  cameraTour = null
  if (restore && savedCameraView) {
    cameraTarget.copy(savedCameraView.target)
    camera.position.copy(savedCameraView.position)
    viewDirection.copy(savedCameraView.direction)
    viewHalfHeight = savedCameraView.halfHeight
    cameraDistance = savedCameraView.distance
    camera.lookAt(cameraTarget)
    camera.updateMatrixWorld()
    updateCameraProjection()
  }
  savedCameraView = null
}

/** Snap back to the opening shot: the framing the farm starts the game with. */
function resetCameraToStart(): void {
  endCameraTour(false)
  focusCamera()
}

/** Who the tour could pin to: every animal still living at the farm. */
function tourSubjects(): CameraTourSubject[] {
  return animals
    .filter((animal) => !animal.isSold && animal.root.visible)
    .map((animal) => ({
      id: animal.id,
      x: +animal.root.position.x.toFixed(3),
      y: +animal.root.position.y.toFixed(3),
      z: +animal.root.position.z.toFixed(3),
    }))
}

function updateCameraTour(deltaSeconds: number): void {
  if (!cameraTour) return
  if (mode !== 'farm' || menu.isOpen || journal.isOpen || salePanel.isOpen || shed.isOpen || shop.isOpen) {
    endCameraTour(true)
    return
  }
  const shot = cameraTour.tick(deltaSeconds, tourSubjects())
  if (shot.subject) tourDesiredLookAt.set(shot.subject.x, shot.lookAtHeight, shot.subject.z)
  else tourDesiredLookAt.set(0, shot.lookAtHeight, 0)
  // Exponential easing: fast enough to keep up with a walking animal, slow
  // enough that a shot change reads as a glide instead of a cut.
  const blend = 1 - Math.exp(-deltaSeconds * 2.1)
  tourLookAt.lerp(tourDesiredLookAt, blend)
  viewHalfHeight += (shot.viewHeight / 2 - viewHalfHeight) * blend
  // Ease along the short way round the circle, so a tour opening from the
  // player's angle and a shot swap both read as a swing, not a cut.
  const angleDelta = Math.atan2(Math.sin(shot.orbitAngle - tourAngle), Math.cos(shot.orbitAngle - tourAngle))
  tourAngle += angleDelta * blend
  // A breath of vertical drift, so the orbit reads as hand-held rather than
  // turntable-exact.
  const targetPhi = THREE.MathUtils.clamp(0.92 + Math.sin(performance.now() * 0.00021) * 0.045, 0.36, 1.17)
  tourPhi += (targetPhi - tourPhi) * blend
  tourOffset.setFromSphericalCoords(cameraDistance, tourPhi, tourAngle)
  // Keep the shared look-at in sync: the expansion shake and the debug
  // harness both read `cameraTarget`, so a tour that only aimed the camera
  // would have been yanked back to the old target by either of them.
  cameraTarget.copy(tourLookAt)
  camera.position.copy(cameraTarget).add(tourOffset)
  viewDirection.copy(tourOffset).normalize()
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
  updateCameraProjection()
}

// -------------------------------------------------------------------- input --

function pointerDesign(event: PointerEvent) {
  return ui.viewport.toDesign(event.clientX, event.clientY, gameCanvas.getBoundingClientRect())
}

/**
 * Decide what the pointer looks like.
 *
 * The farm's brush ring is drawn in the world and hides the OS pointer, so it
 * wins outright. Otherwise the topmost panel under the pointer gets to choose,
 * and anything that has not asked for something specific -- including the
 * Blender-authored props, which have no cursor to give -- gets the hand.
 */
function updateCursor(point: DesignPoint | null): void {
  if (!point) {
    setCursor('hand', gameCanvas)
    return
  }
  if (gardenPlants?.selectedSpecies && mode === 'farm' && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen) {
    setCursor('plant', gameCanvas)
    return
  }
  for (const panel of [...panels].sort((a, b) => b.order - a.order)) {
    const kind = panel.cursor?.(point as DesignPoint)
    if (kind) {
      setCursor(kind, gameCanvas)
      return
    }
  }
  // The camera tool turns the pointer into a camera wherever it is over the
  // farm itself; the panels above still get to keep their own pointer.
  if (cameraToolSelected() && mode === 'farm' && !isOverGameHUD(lastPointerClient.x, lastPointerClient.y)) {
    setCursor('camera', gameCanvas)
    return
  }
  if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen) {
    const markerKind = gardenPlants?.markerKindAt(lastPointerClient.x, lastPointerClient.y)
    if (markerKind) {
      setCursor(toolsHud.selectedTool === 'hand'
        ? markerKind === 'water' ? 'water' : markerKind === 'prune' ? 'prune' : 'point'
        : 'hand', gameCanvas)
      return
    }

    if (gardenPlants?.selectedSpecies && gardenPlants.previewVisible) {
      setCursor('plant', gameCanvas)
      return
    }
  }
  if (toolsHud.selectedTool !== 'hand' && !cameraToolSelected() && !gardenPlants?.selectedSpecies && gardenTools?.cursorVisible && mode === 'farm' && !menu.isOpen && !journal.isOpen && !isOverGameHUD(lastPointerClient.x, lastPointerClient.y)) {
    // A tool stroke lags the pointer by design (drag speed cap), so the OS
    // pointer stays visible mid-stroke: it marks the real mouse while the
    // ring marks where the tool actually works. Without it the mouse goes
    // invisible mid-drag and flies off the screen.
    if (gardenTools?.strokeHeld) {
      setCursor('point', gameCanvas)
      return
    }
    setCursor('hidden', gameCanvas)
    return
  }
  setCursor('hand', gameCanvas)
}

function uiPointerDown(event: PointerEvent): boolean {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
  const point = pointerDesign(event)
  updateCursor(point)
  if (!point) return false
  const claimed = routePointer(panels, point, event, 'down')
  updateCursor(point)
  return claimed
}

function uiPointerMove(event: PointerEvent): boolean {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
  const point = pointerDesign(event)
  updateCursor(point)
  if (!point) return false
  return routePointer(panels, point, event, 'move')
}

function uiPointerUp(event: PointerEvent): boolean {
  const point = pointerDesign(event)
  if (!point) return false
  return routePointer(panels, point, event, 'up')
}

/** The brush ring only exists in the farm, so the pointer has to be re-checked
 * whenever the mode or a panel's visibility changes, not just on pointer move. */
function refreshCursor(): void {
  if (lastPointerClient.x < 0) return
  const rect = gameCanvas.getBoundingClientRect()
  const point = ui.viewport.toDesign(lastPointerClient.x, lastPointerClient.y, rect)
  updateCursor(point)
}

/**
 * Whether the pointer is over the interface rather than over the farm.
 *
 * Edge-panning and the garden brush both have to get out of the way here, or
 * dragging the camera fights the tool bar. Full-screen panels (the menu, the
 * journal, the viewer) always count as the interface; the tool bar asks its own
 * slots, and the expansion card still lives in its own 1280x720 scene so its
 * rectangle is measured in device pixels.
 */
function isOverGameHUD(clientX: number, clientY: number): boolean {
  if (menu.isOpen || journal.isOpen || shed.isOpen || shop.isOpen || mode === 'viewer') return true
  const point = ui.viewport.toDesign(clientX, clientY, gameCanvas.getBoundingClientRect())
  return Boolean(point && (
    (toolsHud.isVisible && toolsHud.hitTest?.(point))
    || shed.contains(point)
    || salePanel.hitTest?.(point)
  ))
}

function updateCameraPan(deltaSeconds: number): void {
  if (mode !== 'farm' || menu.isOpen || deltaSeconds <= 0) return
  let horizontal = Number(pressedKeys.has('d') || pressedKeys.has('arrowright'))
    - Number(pressedKeys.has('a') || pressedKeys.has('arrowleft'))
  let vertical = Number(pressedKeys.has('w') || pressedKeys.has('arrowup'))
    - Number(pressedKeys.has('s') || pressedKeys.has('arrowdown'))
  let edgeStrength = 0

  if (cameraTour) {
    // A key takes the camera back from the tour; a mouse resting near the edge
    // does not, or the tour would end the moment the pointer drifted.
    if (Math.abs(horizontal) + Math.abs(vertical) < 0.001) return
    endCameraTour(true)
  }

  if (pointerWasSeen && dragPointer === null && toolPointer === null
    && !isOverGameHUD(pointerPosition.x, pointerPosition.y)) {
    if (pointerPosition.x < CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((CAMERA_EDGE_MARGIN - pointerPosition.x) / CAMERA_EDGE_MARGIN, 0, 1)
      horizontal -= strength
      edgeStrength = Math.max(edgeStrength, strength)
    } else if (pointerPosition.x > window.innerWidth - CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((pointerPosition.x - (window.innerWidth - CAMERA_EDGE_MARGIN)) / CAMERA_EDGE_MARGIN, 0, 1)
      horizontal += strength
      edgeStrength = Math.max(edgeStrength, strength)
    }
    if (pointerPosition.y < CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((CAMERA_EDGE_MARGIN - pointerPosition.y) / CAMERA_EDGE_MARGIN, 0, 1)
      vertical += strength
      edgeStrength = Math.max(edgeStrength, strength)
    } else if (pointerPosition.y > window.innerHeight - CAMERA_EDGE_MARGIN) {
      const strength = THREE.MathUtils.clamp((pointerPosition.y - (window.innerHeight - CAMERA_EDGE_MARGIN)) / CAMERA_EDGE_MARGIN, 0, 1)
      vertical -= strength
      edgeStrength = Math.max(edgeStrength, strength)
    }
  }

  const inputLength = Math.hypot(horizontal, vertical)
  if (inputLength < 0.001) return
  if (inputLength > 1) {
    horizontal /= inputLength
    vertical /= inputLength
  }

  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  cameraRight.y = 0
  cameraRight.normalize()
  const cameraForward = new THREE.Vector3().subVectors(cameraTarget, camera.position)
  cameraForward.y = 0
  cameraForward.normalize()
  const direction = cameraRight.multiplyScalar(horizontal).addScaledVector(cameraForward, vertical)
  if (direction.lengthSq() < 0.0001) return
  direction.normalize()
  const zoomScale = viewHalfHeight / (normalViewHeight / 2)
  const speed = THREE.MathUtils.lerp(CAMERA_BASE_SPEED, CAMERA_MAX_SPEED, edgeStrength) * zoomScale
  const movement = direction.multiplyScalar(speed * deltaSeconds)
  cameraTarget.add(movement)
  camera.position.add(movement)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

function removePreviousCameraShake(): void {
  if (cameraShakeOffset.lengthSq() === 0) return
  camera.position.sub(cameraShakeOffset)
  cameraTarget.sub(cameraShakeOffset)
  cameraShakeOffset.set(0, 0, 0)
}

function applyExpansionCameraShake(deltaSeconds: number, elapsedSeconds: number): void {
  if (expansionFeedbackSeconds <= 0) {
    expansionFeedbackSeconds = 0
    expansionFeedbackStrength = 0
    return
  }
  expansionFeedbackSeconds = Math.max(0, expansionFeedbackSeconds - deltaSeconds)
  const envelope = expansionFeedbackSeconds / CAMERA_SHAKE_DURATION
  const amplitude = CAMERA_SHAKE_AMPLITUDE * expansionFeedbackStrength * envelope * envelope
  cameraShakeOffset.set(
    (Math.sin(elapsedSeconds * 51) + Math.sin(elapsedSeconds * 31 + 1.7) * 0.45) * amplitude,
    Math.sin(elapsedSeconds * 43 + 0.6) * amplitude * 0.16,
    (Math.cos(elapsedSeconds * 47 + 0.3) + Math.sin(elapsedSeconds * 29) * 0.35) * amplitude,
  )
  camera.position.add(cameraShakeOffset)
  cameraTarget.add(cameraShakeOffset)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

function orbitPointerDown(event: PointerEvent): void {
  if (uiPointerDown(event)) return
  if (menu.isOpen || mode === 'viewer') return
  const selectedTool = gardenTools?.selectedTool ?? 'hand'
  // The camera tool owns every button it can reach; no farm tool sees these.
  if (cameraToolSelected() && !isOverGameHUD(event.clientX, event.clientY)) {
    if (event.button === 0) {
      event.preventDefault()
      // A drag takes the camera over from a tour at the pose the tour reached.
      endCameraTour(false)
      dragPointer = event.pointerId
      dragMode = 'orbit'
      previousPointer = { x: event.clientX, y: event.clientY }
      if (event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
      return
    }
    if (event.button === 1) {
      event.preventDefault()
      resetCameraToStart()
      return
    }
    if (event.button === 2) {
      event.preventDefault()
      if (cameraTour) endCameraTour(true)
      else beginCameraTour()
      return
    }
  }
  if (event.button === 0 && selectedTool === 'hand' && !isOverGameHUD(event.clientX, event.clientY)) {
    // Placement owns the click outright while a prop is on the ghost.
    if (gardenProps?.placingId) {
      event.preventDefault()
      gardenProps.pointerMove(event)
      gardenProps.pointerDown(event)
      gardenProps.update(0)
      shedDom.refresh()
      syncFarmChrome()
      return
    }
    if (!journal.isOpen && !shed.isOpen && !shop.isOpen) {
      const egg = pickEgg(event.clientX, event.clientY)
      if (egg) {
        const hatched = egg.ready ? progress.hatch(egg.id) : null
        if (hatched?.animalId) {
          removeEggVisual(egg.id)
          const record = progress.animal(hatched.animalId)
          if (record) void createAnimalInstance(record, { x: egg.x, z: egg.z }).then((created) => {
          created.root.visible = true
          created.stage = record.stage
          farmHomes.set(created.instanceId, { parent: created.root.parent ?? fairground.root, position: created.root.position.clone() })
        })
        } else {
          console.info(egg.ready ? 'The garden is at capacity; earn another expansion before hatching.' : 'This egg is still incubating.')
        }
        return
      }
      // Hand-tool pick-up first, then the shop door. Both are the same grab the
      // sale panel already trained the player to make.
      if (gardenProps?.pickUpAt(event.clientX, event.clientY)) {
        shedDom.refresh()
        syncFarmChrome()
        return
      }
      if (gardenProps?.pickShop(event.clientX, event.clientY)) {
        salePanel.close()
        gardenProps?.cancelPlacement()
        gardenPlants?.cancelPlacement()
        gardenTools?.setPlantingMode(false)
        shed.setPlacementActive(false)
        shop.setOpen(true)
        syncFarmChrome()
        refreshCursor()
        return
      }
    }
    const markerKind = gardenPlants?.markerKindAt(event.clientX, event.clientY)
    if (markerKind) {
      gardenPlants?.pointerDown(event)
      syncFarmChrome()
      return
    }
    const animal = pickAnimal(event.clientX, event.clientY)
    if (animal) {
      focusedAnimalId = animal.instanceId
      refreshAnimalCrowd(performance.now() / 1000, true)
      gardenPlants?.clearSelection()
      const species = ANIMAL_CATALOG.find((entry) => entry.id === animal.id)
      salePanel.open({
        id: animal.instanceId,
        kind: 'animal',
        name: animalNames.get(animal.instanceId) ?? species?.name ?? animal.id,
        detail: animal.canSell
          ? `${stageTitle(animal.id, animal.stage)} · ${species?.subtitle ?? 'A farm friend'}`
          : 'Needs to settle at the farm before selling',
        price: animal.canSell ? animalSaleValue(animal.id, animal.stage) : 0,
        sellable: animal.canSell,
      })
      syncFarmChrome()
      return
    }
    const plant = gardenPlants?.selectAt(event.clientX, event.clientY)
    if (plant) {
      const species = PLANT_CATALOG.find((entry) => entry.id === plant.species)
      salePanel.open({
        id: String(plant.instanceId),
        kind: 'plant',
        name: `${species?.name ?? 'Plant'} ${gardenPlants?.selectedPlantNumber ?? 1}`,
        detail: plant.mature ? 'Fully grown' : `${Math.round(plant.growth * 100)}% grown`,
        price: plantSaleValue(plant.species, plant.growth),
      })
      syncFarmChrome()
      return
    }
  }
  if (salePanel.isOpen) salePanel.close()
  if (event.button === 0 && selectedTool === 'hand' && !journal.isOpen && !shed.isOpen && !shop.isOpen && mode === 'farm' && gardenPlants?.pointerDown(event)) {
    event.preventDefault()
    if (!gardenPlants.selectedSpecies) {
      shed.setPlacementActive(false)
      gardenTools?.setPlantingMode(false)
    }
    syncFarmChrome()
    shedDom.refresh()
    return
  }
  if (event.button === 0 && event.detail >= 2) return
  // Middle click levels with the shovel. With the Hand tool, left-drag orbits
  // the farm and right-drag pans it; the farm tools keep their own buttons.
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
  if (event.button === 2 && isWorldToolActive() && !isOverGameHUD(event.clientX, event.clientY) && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  // Tool selections are handled by the shared HUD above. Right-click belongs
  // to the active garden tool inside the plot; outside the plot it remains a pan.

  if (isOverGameHUD(event.clientX, event.clientY)) {
    event.preventDefault()
    return
  }
  if (event.button === 0 && isWorldToolActive() && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  if (event.button === 1 && isWorldToolActive() && gardenTools?.pointerDown(event)) {
    event.preventDefault()
    toolPointer = event.pointerId
    if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
    return
  }
  // In the debug harness, synthetic drags (the garden-drag script) must not
  // move the camera; a real player's drag in a debug build still should.
  if (gardenDebugMode && !event.isTrusted) return
  dragPointer = event.pointerId
  dragMode = event.button === 2 ? 'pan' : 'orbit'
  previousPointer = { x: event.clientX, y: event.clientY }
  gameCanvas.setPointerCapture(event.pointerId)
}

function orbitPointerMove(event: PointerEvent): void {
  if (uiPointerMove(event)) return
  if (gardenProps?.placingId) gardenProps.pointerMove(event)
  if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && toolsHud.selectedTool === 'hand') gardenPlants?.pointerMove(event)
  if (isWorldToolActive()) gardenTools?.pointerMove(event)
  updateCursor(pointerDesign(event))
  if (toolPointer === event.pointerId || dragPointer !== event.pointerId) return
  const dx = event.clientX - previousPointer.x
  const dy = event.clientY - previousPointer.y
  previousPointer = { x: event.clientX, y: event.clientY }
  if (dragMode === 'pan') {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const panScale = viewHalfHeight / Math.max(1, window.innerHeight)
    // Per-move delta only: `cameraPanStep` is deliberately stateless. The old
    // version accumulated into a shared offset, so every pan move re-applied
    // all the previous ones and the camera accelerated away.
    const step = cameraPanStep(cameraRight, cameraUp, dx, dy, panScale)
    targetOffset.set(step.x, step.y, step.z)
    cameraTarget.add(targetOffset)
    camera.position.copy(cameraTarget).addScaledVector(viewDirection, cameraDistance)
    camera.lookAt(cameraTarget)
    camera.updateMatrixWorld()
    return
  }

  const offset = new THREE.Vector3().subVectors(camera.position, cameraTarget)
  const spherical = new THREE.Spherical().setFromVector3(offset)
  spherical.theta -= dx * 0.0048
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * 0.0032, 0.36, 1.17)
  offset.setFromSpherical(spherical)
  viewDirection.copy(offset).normalize()
  camera.position.copy(cameraTarget).add(offset)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

function orbitPointerUp(event: PointerEvent): void {
  uiPointerUp(event)
  if (gardenProps?.placingId) {
    gardenProps.pointerUp()
    shedDom.refresh()
    syncFarmChrome()
  }
  if (toolPointer === event.pointerId) {
    gardenTools?.pointerUp()
    toolPointer = null
    if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
    return
  }
  if (dragPointer !== event.pointerId) return
  dragPointer = null
  dragMode = null
  if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
}

function preventCanvasMenu(event: MouseEvent): void {
  event.preventDefault()
}

function handleZoom(event: WheelEvent): void {
  const point = pointerDesign(event as unknown as PointerEvent)
  if (point) {
    for (let index = panels.length - 1; index >= 0; index -= 1) {
      if (panels[index].wheel?.(point, event)) {
        event.preventDefault()
        return
      }
    }
  }
  event.preventDefault()
  // Zooming takes the camera back from a running tour at its current pose.
  if (cameraTour) endCameraTour(false)
  viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(event.deltaY * 0.001), CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
  updateCameraProjection()
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
}

/**
 * The key a tool definition would name, with one wrinkle: the camera tool's
 * hotkey is the space bar, whose `event.key` is the character " ".
 */
function toolHotkey(event: KeyboardEvent): string {
  return event.code === 'Space' ? 'space' : event.key.toLowerCase()
}

const PAN_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']

function handleKeyDown(event: KeyboardEvent): void {
  if (gardenPlants?.selectedSpecies && mode === 'farm' && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !event.altKey && !event.ctrlKey && !event.metaKey && !isTextInputTarget(event.target)) {
    const tool = GARDEN_TOOLS.find((entry) => entry.hotkey === toolHotkey(event))
    if (tool) {
      event.preventDefault()
      selectGardenTool(tool.id)
      return
    }
  }
  // Topmost panel first, so a key never reaches the farm while a screen owns it.
  for (let index = panels.length - 1; index >= 0; index -= 1) {
    if (panels[index].keyDown?.(event)) return
  }
  // A prop on the ghost answers R (rotate) and Escape (cancel) before anything else.
  if (gardenProps?.placingId && !menu.isOpen && !journal.isOpen) {
    if (event.key.toLowerCase() === 'r' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      gardenProps.rotate()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      gardenProps.cancelPlacement()
      shed.setPlacementActive(false)
      refreshShopUi()
      syncFarmChrome()
      return
    }
  }
  if (event.altKey || event.ctrlKey || event.metaKey || isTextInputTarget(event.target)) return
  if (event.code === 'Space') {
    // The tool bar claims Space while it is on screen; this only keeps the page
    // itself from scrolling when a screen owns the keys instead.
    event.preventDefault()
    return
  }
  const key = event.key.toLowerCase()
  if (key === '1') {
    event.preventDefault()
    selectGardenTool('hand')
    return
  }
  if (event.key === 'Escape' && cameraTour) {
    // Escape leaves the tour before it means anything else, so a tour ends
    // where it started instead of dropping the player into the menu.
    event.preventDefault()
    endCameraTour(true)
    return
  }
  if (PAN_KEYS.includes(key)) {
    pressedKeys.add(key)
    event.preventDefault()
    return
  }
  if (event.key === 'Escape' && salePanel.isOpen) {
    salePanel.close()
    syncFarmChrome()
    event.preventDefault()
    return
  }
  if (event.key === 'Escape' && !menu.isOpen && mode === 'farm' && !journal.isOpen) {
    if (gardenPlants?.selectedSpecies) {
      gardenPlants.cancelPlacement()
      shed.setPlacementActive(false)
      gardenTools?.setPlantingMode(false)
      if (lastPointerClient.x >= 0) gardenTools?.pointerMove({ clientX: lastPointerClient.x, clientY: lastPointerClient.y })
      syncFarmChrome()
      event.preventDefault()
      return
    }
    menu.open()
    event.preventDefault()
  }
}

function handleKeyUp(event: KeyboardEvent): void {
  pressedKeys.delete(event.key.toLowerCase())
  if (menu.isOpen || journal.isOpen) return
  if (!isTextInputTarget(event.target) && ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(event.key.toLowerCase())) {
    event.preventDefault()
  }
}

/**
 * The garden brush follows the pointer from a window-level listener, not from
 * the canvas's, so a drag that runs off the edge of the window keeps painting
 * instead of stopping dead at the border.
 */
function handleWindowPointerMove(event: PointerEvent): void {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
  pointerPosition = { x: event.clientX, y: event.clientY }
  pointerWasSeen = event.clientX >= 0 && event.clientY >= 0
    && event.clientX <= window.innerWidth && event.clientY <= window.innerHeight
    && !isOverGameHUD(event.clientX, event.clientY)
}

function handleWindowBlur(): void {
  pressedKeys.clear()
  pointerWasSeen = false
}

function handleWindowPointerUp(event: PointerEvent): void {
  // Canvas pointer capture normally delivers the release to orbitPointerUp.
  // Keep a window fallback for releases outside the canvas, but only let the
  // pointer that started a tool stroke terminate it.
  if (toolPointer !== event.pointerId) return
  gardenTools?.pointerUp()
  toolPointer = null
}

function handleCanvasLeave(): void {
  // Keep painting when the pointer merely slips off the canvas edge mid-hold.
  if (!toolPointer) gardenTools?.pointerLeave()
  gardenPlants?.pointerLeave()
}

function updateCameraProjection(): void {
  const width = window.innerWidth
  const height = window.innerHeight
  const currentAspect = width / Math.max(1, height)
  camera.left = -(viewHalfHeight * currentAspect)
  camera.right = viewHalfHeight * currentAspect
  camera.top = viewHalfHeight
  camera.bottom = -viewHalfHeight
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

/**
 * Point the camera at a spot and hold it there. Shared by the harness verbs:
 * framing a species and framing a pond are the same camera move, and one copy
 * keeps the two from drifting apart.
 */
function frameAt(target: THREE.Vector3, height: number): void {
  cameraTarget.copy(target)
  viewHalfHeight = height / 2
  camera.position.copy(cameraTarget).add(initialOffset)
  viewDirection.copy(initialOffset).normalize()
  cameraDistance = initialOffset.length()
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
  updateCameraProjection()
}

gameCanvas.addEventListener('pointerdown', orbitPointerDown)
gameCanvas.addEventListener('pointermove', orbitPointerMove)
gameCanvas.addEventListener('pointerup', orbitPointerUp)
gameCanvas.addEventListener('pointercancel', orbitPointerUp)
gameCanvas.addEventListener('pointerleave', () => {
  // Keep painting when the pointer merely slips off the canvas edge mid-hold
  // (it can return without a new press); only the true garden bounds hide the
  // cursor, which garden-tools handles itself.
  if (!toolPointer) gardenTools?.pointerLeave()
  gardenPlants?.pointerLeave()
})
gameCanvas.addEventListener('contextmenu', preventCanvasMenu)
gameCanvas.addEventListener('wheel', handleZoom, { passive: false })
window.addEventListener('keydown', handleKeyDown)
window.addEventListener('pointermove', handleWindowPointerMove)
window.addEventListener('pointerup', handleWindowPointerUp)
window.addEventListener('keyup', handleKeyUp)
window.addEventListener('blur', handleWindowBlur)
window.addEventListener('mouseleave', handleWindowBlur)
gameCanvas.addEventListener('pointerleave', handleCanvasLeave)
shed.resize(window.innerWidth, window.innerHeight)
salePanel.resize(window.innerWidth, window.innerHeight)
window.addEventListener('resize', () => {
  updateCameraProjection()
  ui.resize(window.innerWidth, window.innerHeight)
  shed.resize(window.innerWidth, window.innerHeight)
  salePanel.resize(window.innerWidth, window.innerHeight)
  balloon.resize(window.innerWidth, window.innerHeight)
})

// ------------------------------------------------------------- garden debug --

declare global {
  interface Window {
    __gardenDebug?: GardenDebugHarness
  }
}

interface GardenDebugHarness {
  readonly enabled: true
  state(): unknown
  focusGarden(): void
  openMenu(): void
  openJournal(): void
  closeMenu(): void
  openViewer(): void
  /** Direct water/terrain controls for repeatable visual checks, compiled out in production. */
  digAt(x: number, z: number, radius: number, amount: number): number
  pourAt(x: number, z: number, radius: number, amount: number): unknown
  clearGarden(): void
  waterSummary(): unknown
  /** Select a garden tool for repeatable input tests. */
  selectTool(tool: GardenToolId): void
  /** Project a world point into the game canvas for real pointer-event tests. */
  projectGardenPoint(x: number, z: number): { readonly x: number; readonly y: number } | null

  /** Live scene graph, for poking at a panel that is not drawing. */
  readonly scene: THREE.Scene
  readonly uiScene: THREE.Scene
  /** Frame-by-frame performance samples for scripted stress tests. */
  performanceSamples(): readonly GardenFrameTiming[]
  layout(): Record<string, unknown>
  /** Fire a ticket on demand, for visual checks without playing to the milestone. */
  notify(kind: 'carnival' | 'farm' | 'resident' | 'egg' | 'plant', subject: string): void
  /** Animal conditions: every rung, whether it is revealed, and live numbers. */
  conditions(): AnimalConditionReport
  /** What the farm currently measures, in square meters. */
  farmState(): FarmState
  /**
   * Force a species onto a rung of the ladder and play whatever transition it
   * earns. This is how a specific condition gets exercised on demand.
   */
  setStage(species: string, stage: number): AnimalConditionReport
  /** Sow a disc of grass, in the same units the cow's 15 m2 is measured in. */
  sowGrass(x: number, z: number, radius: number): FarmState
  /** Dig a pond of the given radius, which is what the water conditions want. */
  digPond(x: number, z: number, radius: number): FarmState
  /**
   * Plant one seed, through the same rules the shed uses, and report the
   * placement failure rather than doing nothing silently. A lily pad needs
   * visible pond water, so this is normally `digPond` then `pourAt` first.
   */
  plant(species: string, x: number, z: number): PlantHarnessResult
  /**
   * Grow what has been planted, answering each care marker on the way. A lily
   * pauses for a drink and a pinch, so time alone will not mature it.
   */
  growPlants(steps?: number, secondsPerStep?: number): PlantHarnessResult
  /** Run the progression tick `steps` times, optionally with a time jump. */
  advance(steps?: number, secondsPerStep?: number): AnimalConditionReport
  /** Forget everything: no grass, no pond, every animal back to the carnival. */
  resetConditions(): void
  /** Where each animal is, and what it looks like right now. */
  animalReport(): Record<string, unknown>[]
  /** Frame a species closely, for inspecting eyes and other small details. */
  focusSpecies(species: string, height?: number): void
  /** Current earned progression and next expansion milestone. */
  progression(): { readonly points: number; readonly level: number; readonly pointsToNextLevel: number }
  rendering(): { readonly animalCount: number; readonly populationLimit: number; readonly crowd: { readonly animalCount: number; readonly instancedAnimals: number; readonly detailedAnimals: number; readonly batches: number; readonly lowPolyTriangles: number } }
  /** Hatch a ready egg and return the new baby event. */
  hatch(eggId: number): AnimalLifeEvent | null
  /** Advance the herd and garden progression without simulating browser time. */
  simulate(seconds: number, steps?: number): AnimalConditionReport
  /** Build deterministic render-load fixtures without changing shipped farm progression. */
  crowdStressTest(count?: number): { readonly count: number; readonly renderCalls: number; readonly triangles: number; readonly crowd: AnimalCrowdStats }
  /** One-line usage for every harness command, so agents stop rediscovering this surface. */
  help(): Record<string, string>
  /**
   * Fill the live crowd with deterministic fixtures that stay up until cleared.
   * Unlike crowdStressTest (one render, then restore), this keeps the load on
   * screen so scripted ramps can sample sustained frame times.
   */
  setCrowd(count?: number): { readonly count: number; readonly crowd: AnimalCrowdStats }
  /** Remove live crowd fixtures and restore the real herd. */
  clearCrowd(): { readonly count: number; readonly crowd: AnimalCrowdStats }

  /** Snapshot the current terrain, water and active parcel dimensions. */
  gardenReport(): { readonly bounds: { readonly halfWidth: number; readonly halfDepth: number }; readonly terrain: { readonly cols: number; readonly rows: number; readonly originX: number; readonly originZ: number }; readonly water: { readonly cols: number; readonly rows: number; readonly originX: number; readonly originZ: number } }
  /** Reveal parcels on demand so expansion-only visuals can be reviewed. */
  expandFarm(level: number): number
  /** Begin a real-time packing/reveal sequence rather than fast-forwarding it. */
  expandOnce(): unknown
  carnivalReport(): unknown
  /** What the topmost visible surfaces at a garden point are, for finding stray planes. */
  probeGround(x: number, z: number): readonly { readonly name: string; readonly y: number; readonly color: string | null }[]
  /**
   * Every surface a screen pixel looks through, nearest first. Where
   * `probeGround` answers "what is under this point", this answers "what am I
   * actually looking at" for a declared-fine visual bug.
   */
  probeView(screenX: number, screenY: number): readonly { readonly distance: number; readonly name: string; readonly y: number; readonly color: string | null }[]
  /**
   * Frame a spot on the ground, for inspecting a habitat rather than an animal
   * — a pond and the lily pads planted in it, say.
   */
  focusPoint(x: number, z: number, height?: number): void
  /** Camera pose and tour state, for verifying framing without screenshots. */
  camera(): CameraDebugReport
  /** Advance the cinematic tour by `seconds` of simulated time, no waiting. */
  advanceTour(seconds: number): CameraDebugReport
  /** Start the cinematic tour on a fixed seed so a review pass is repeatable. */
  startTour(seed?: number): boolean
  /** Leave the tour; `restore` puts back the framing it interrupted. */
  endTour(restore?: boolean): void
  /** Snap the farm camera back to its opening shot. */
  resetCamera(): void
  /** Put coins in the wallet without farming for them, so the shop can be driven. */
  grantCoins(amount: number): number
  /** Open the storefront screen without walking up to the building. */
  shop(): void
  /** Open the shed inventory without clicking the 3D shed. */
  shed(): void
  /** Open the farm-post inbox without clicking the balloon. */
  inbox(): unknown
  /** Balloon radial nav state, for verifying quadrants without pointer math. */
  balloon(): unknown
  /** Open the player panel without clicking the balloon. */
  player(): unknown
  /** Buy one prop from the shared wallet, exactly as the Buy button does. */
  buy(id: string): unknown
  propCounts(): Record<string, number>
  placeProp(id: string, cellX: number, cellZ: number, rotation?: number): unknown
  placeFence(fromX: number, fromZ: number, toX: number, toZ: number): unknown
  propReport(): unknown
  /** Hand-tool pick-up at a client point; returns the prop returned to the box. */
  pickUpProp(clientX: number, clientY: number): string | null
}

/** Where the farm camera is pointing, and what the tour is doing with it. */
interface CameraDebugReport {
  readonly mode: GameMode
  readonly target: { readonly x: number; readonly y: number; readonly z: number }
  readonly position: { readonly x: number; readonly y: number; readonly z: number }
  readonly viewHeight: number
  readonly tour: {
    readonly active: boolean
    readonly seed: number
    readonly view: 'vista' | 'subject' | null
    readonly subject: string | null
  }
}

/** What a harness planting attempt did, and what the farm now counts. */
interface PlantHarnessResult {
  readonly ok: boolean
  readonly failure: string | null
  /** Mature plants per species, i.e. what a `plantCount` condition reads. */
  readonly mature: Readonly<Record<string, number>>
}

interface AnimalConditionReport {
  readonly farm: FarmState
  readonly species: Record<string, {
    readonly stage: number
    readonly appearance: string
    readonly heartEyes: boolean
    readonly isCaptured: boolean
    readonly invited: boolean
    readonly position: { x: number; z: number }
    readonly conditions: ReturnType<typeof progress.statusOf>
  }>
}

/** Everything the condition harness and the journal both need to draw. */
function reportConditions(): AnimalConditionReport {
  // Measuring here (rather than reusing the last frame's) means a harness
  // caller sees the farm as it is at the moment it asked.
  const farm = measureFarm()
  const species: AnimalConditionReport['species'] = {}
  for (const animal of animals) {
    const record = progress.animal(animal.instanceId)
    if (!record) continue
    species[animal.instanceId] = {
      stage: record.stage,
      appearance: record.appearance,
      heartEyes: animal.heartEyeCount > 0,
      isCaptured: animal.isCaptured,
      invited: record.invited,
      position: { x: +animal.root.position.x.toFixed(2), z: +animal.root.position.z.toFixed(2) },
      conditions: progress.statusOf(animal.instanceId),
    }
  }
  return { farm, species }
}

interface GardenFrameTiming {
  readonly frameNumber: number
  readonly intervalMs: number
  readonly workMs: number
  readonly fairgroundMs: number
  readonly expansionBoundsMs: number
  readonly animalsMs: number
  readonly toolsMs: number
  readonly otherUpdateMs: number
  readonly sceneRenderMs: number
  readonly overlayRenderMs: number
}

interface GardenPerformanceSummary {
  readonly samples: number
  readonly fps: number
  readonly cadenceMs: number
  readonly droppedFrames: number
  readonly zoom: number
  readonly bufferWidth: number
  readonly bufferHeight: number
  readonly renderCalls: number
  readonly triangles: number
  readonly intervalMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly workMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly updateMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly fairgroundMs: { readonly p95: number; readonly max: number }
  readonly expansionBoundsMs: { readonly p95: number; readonly max: number }
  readonly animalsMs: { readonly p95: number; readonly max: number }
  readonly toolsMs: { readonly p95: number; readonly max: number }
  readonly otherUpdateMs: { readonly p95: number; readonly max: number }
  readonly sceneRenderMs: { readonly p95: number; readonly max: number }
  readonly overlayRenderMs: { readonly p95: number; readonly max: number }
}

interface PerformanceOverlay {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  update(now: number, summarize: () => GardenPerformanceSummary | null): void
  resize(width: number, height: number): void
  dispose(): void
}

const frameTimingSamples: GardenFrameTiming[] = []
let performanceFrameNumber = 0
const FRAME_TIMING_SAMPLE_LIMIT = 180
const PERF_OVERLAY_REFRESH_MS = 400
const PERF_LOG_INTERVAL_MS = 2000

function createPerformanceOverlay(): PerformanceOverlay {
  const scene = new THREE.Scene()
  scene.name = 'Debug performance HUD'
  const camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 100)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = 760
  canvas.height = 240
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for performance HUD')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(380, 120), material)
  panel.position.z = 2
  scene.add(panel)
  let viewportWidth = 1280
  let viewportHeight = 720
  let lastDrawAt = -PERF_OVERLAY_REFRESH_MS

  function resize(width: number, height: number): void {
    viewportWidth = width
    viewportHeight = height
    camera.left = -width / 2
    camera.right = width / 2
    camera.top = height / 2
    camera.bottom = -height / 2
    camera.updateProjectionMatrix()
    panel.position.set(-width / 2 + 205, height / 2 - 80, 2)
  }

  resize(viewportWidth, viewportHeight)
  return {
    scene,
    camera,
    resize,
    update(now, summarize): void {
      if (now - lastDrawAt < PERF_OVERLAY_REFRESH_MS) return
      lastDrawAt = now
      const summary = summarize()
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'rgba(18, 35, 33, 0.88)'
      context.strokeStyle = 'rgba(248, 225, 174, 0.78)'
      context.lineWidth = 3
      context.beginPath()
      context.roundRect(3, 3, canvas.width - 6, canvas.height - 6, 24)
      context.fill()
      context.stroke()
      context.textBaseline = 'middle'
      context.textAlign = 'left'
      context.font = 'bold 48px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillStyle = !summary || summary.fps >= 50 ? '#c9f29b' : summary.fps >= 30 ? '#ffd27a' : '#ff9988'
      context.fillText(`${summary?.fps.toFixed(0) ?? '--'} FPS`, 26, 48)
      context.font = '26px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillStyle = '#fff3d7'
      context.fillText(
        `frame p95 ${summary?.intervalMs.p95.toFixed(1) ?? '--'}ms · drops ${summary?.droppedFrames ?? '--'} @ ${summary?.cadenceMs.toFixed(1) ?? '--'}ms`,
        26,
        104,
      )
      context.fillText(
        `CPU p95 ${summary?.workMs.p95.toFixed(1) ?? '--'}ms · render ${summary?.sceneRenderMs.p95.toFixed(1) ?? '--'}ms`,
        26,
        154,
      )
      context.font = '23px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillText(
        `zoom ${summary?.zoom.toFixed(1) ?? '--'}x · buffer ${summary?.bufferWidth ?? '--'}×${summary?.bufferHeight ?? '--'} · ${summary?.renderCalls ?? '--'} calls`,
        26,
        207,
      )
      texture.needsUpdate = true
    },
    dispose(): void {
      panel.geometry.dispose()
      texture.dispose()
      material.dispose()
      scene.clear()
    },
  }
}

function summarizeFrameTimings(): GardenPerformanceSummary | null {
  if (!frameTimingSamples.length) return null
  const percentile = (values: readonly number[], fraction: number): number => {
    const sorted = [...values].sort((a, b) => a - b)
    return +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(2)
  }
  const max = (values: readonly number[]): number => +Math.max(...values).toFixed(2)
  const get = (key: keyof GardenFrameTiming): number[] => frameTimingSamples.map((sample) => sample[key])
  const update = frameTimingSamples.map((sample) => sample.fairgroundMs + sample.animalsMs + sample.toolsMs + sample.otherUpdateMs)
  const intervals = get('intervalMs').filter((value) => value > 0)
  if (intervals.length === 0) return null
  const averageInterval = intervals.reduce((total, value) => total + value, 0) / intervals.length
  // Adapt to the browser/display's actual rAF cadence (e.g. 30 Hz remote browser
  // previews) so ordinary 33 ms frames are not mislabeled as missed 60 Hz frames.
  const cadenceMs = percentile(intervals, 0.1)
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2())
  const summarize = (values: readonly number[]) => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: max(values) })
  const summarizeTail = (values: readonly number[]) => ({ p95: percentile(values, 0.95), max: max(values) })
  return {
    samples: intervals.length,
    fps: +(1000 / averageInterval).toFixed(1),
    cadenceMs,
    droppedFrames: intervals.filter((value) => value > cadenceMs * 1.5).length,
    zoom: +(normalViewHeight / (viewHalfHeight * 2)).toFixed(2),
    bufferWidth: drawingBuffer.x,
    bufferHeight: drawingBuffer.y,
    renderCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    intervalMs: summarize(intervals),
    workMs: summarize(get('workMs')),
    updateMs: summarize(update),
    fairgroundMs: summarizeTail(get('fairgroundMs')),
    expansionBoundsMs: summarizeTail(get('expansionBoundsMs')),
    animalsMs: summarizeTail(get('animalsMs')),
    toolsMs: summarizeTail(get('toolsMs')),
    otherUpdateMs: summarizeTail(get('otherUpdateMs')),
    sceneRenderMs: summarizeTail(get('sceneRenderMs')),
    overlayRenderMs: summarizeTail(get('overlayRenderMs')),
  }
}

if (__GARDEN_DEBUG__ && gardenDebugMode) {
  const cameraReport = (): CameraDebugReport => ({
    mode,
    target: { x: +cameraTarget.x.toFixed(3), y: +cameraTarget.y.toFixed(3), z: +cameraTarget.z.toFixed(3) },
    position: { x: +camera.position.x.toFixed(3), y: +camera.position.y.toFixed(3), z: +camera.position.z.toFixed(3) },
    viewHeight: +(viewHalfHeight * 2).toFixed(3),
    tour: {
      active: cameraTour !== null,
      seed: cameraTourSeed,
      view: cameraTour?.view ?? null,
      subject: cameraTour?.subjectId ?? null,
    },
  })
  const debugHarness: GardenDebugHarness = {
    enabled: true,
    state: () => ({
      mode,
      menuOpen: menu.isOpen,
      journalOpen: journal.isOpen,
      viewerOpen: viewer.isOpen,
      shopOpen: shop.isOpen,
      shedOpen: shed.isOpen,
      placing: gardenProps?.placingId ?? null,
      performance: summarizeFrameTimings(),
      tools: gardenTools?.debugState() ?? null,
    }),
    focusGarden: focusCamera,
    openMenu: () => menu.open(),
    closeMenu: () => menu.close(),
    openJournal: () => journal.open(),
    openViewer: () => setMode('viewer'),
    digAt: (x, z, radius, amount) => {
      if (!gardenTerrain || !gardenWater) return 0
      const changed = gardenTerrain.splat(x, z, radius, amount)
      gardenTerrain.applyToMeshes()
      gardenWater.markTerrainChanged()
      for (let pass = 0; pass < 40 && gardenWater.dirty; pass += 1) gardenWater.settle()
      gardenWaterMesh?.markDirty()
      gardenWaterMesh?.update(performance.now() * 0.001)
      return changed
    },
    pourAt: (x, z, radius, amount) => {
      if (!gardenWater) return null
      gardenWater.pour(x, z, radius, amount)
      for (let pass = 0; pass < 40 && gardenWater.dirty; pass += 1) gardenWater.settle()
      gardenWaterMesh?.markDirty()
      gardenWaterMesh?.update(performance.now() * 0.001)
      return gardenWater.summary()
    },
    clearGarden: () => {
      gardenTerrain?.clear()
      gardenTerrain?.applyToMeshes()
      gardenWater?.clear()
      gardenWater?.settle()
      gardenWaterMesh?.markDirty()
      gardenWaterMesh?.update(performance.now() * 0.001)
      crowdFixtureEntries = []
      refreshAnimalCrowd(performance.now() / 1000, true)
    },
    waterSummary: () => gardenWater?.summary() ?? null,
    selectTool: (tool) => selectGardenTool(tool),
    projectGardenPoint: (x, z) => {
      if (!gardenTerrain) return null
      const rect = gameCanvas.getBoundingClientRect()
      const projected = new THREE.Vector3(x, GARDEN_LAWN_Y + gardenTerrain.heightAt(x, z), z).project(camera)
      return {
        x: rect.left + (projected.x + 1) * rect.width / 2,
        y: rect.top + (1 - projected.y) * rect.height / 2,
      }
    },
    farmState: () => measureFarm(),
    conditions: () => reportConditions(),
    setStage: (species, stage) => {
      const target = Math.max(0, Math.min(4, Math.floor(stage))) as 0 | 1 | 2 | 3 | 4
      const animal = animals.find((entry) => entry.id === species || entry.instanceId === species)
      if (!animal) return reportConditions()
      focusedAnimalId = animal.instanceId
  // Resetting the stage still replays the model's capture transition.
      const id = animal.instanceId
      const lifeRecord = progress.animal(id)
      if (lifeRecord?.paired && lifeRecord.partnerId) {
        progress.setStage(lifeRecord.partnerId, 0)
        const partnerModel = animalById.get(lifeRecord.partnerId)
        if (partnerModel) partnerModel.stage = 0
      }
      if (target < 4) animal.setRomancing(false)
      handleAnimalLifeEvents(progress.setStage(id, target))
      animal.stage = target
      animal.setDetailedVisible(target > 0)
      // One more tick so a settled animal is reflected in the resident set the
      // next species is judged against.
      refreshAnimalCrowd(performance.now() / 1000, true)
      return reportConditions()
    },
    sowGrass: (x, z, radius) => {
      gardenTools?.sowGrassDisc(x, z, radius)
      return measureFarm()
    },
    digPond: (x, z, radius) => {
      gardenTools?.digBasin(x, z, radius, -1.1)
      return measureFarm()
    },
    plant: (species, x, z) => {
      const simulation = gardenPlants?.simulation
      if (!simulation) return { ok: false, failure: 'no-plant-system', mature: {} }
      const id = species as PlantId
      const surface = plantSurfaceAt(x, z)
      const result = simulation.placementResult(id, x, z, surface)
      // Report the reason rather than planting nothing: a rejected seed is the
      // single hardest thing to debug through a screenshot.
      if (!result.valid) return { ok: false, failure: result.failure, mature: maturePlantCounts() }
      const planted = simulation.plant(id, x, z, surface)
      return { ok: planted !== null, failure: planted ? null : 'rejected', mature: maturePlantCounts() }
    },
    growPlants: (steps = 90, secondsPerStep = 1) => {
      const simulation = gardenPlants?.simulation
      if (!simulation) return { ok: false, failure: 'no-plant-system', mature: {} }
      for (let step = 0; step < steps; step += 1) {
        simulation.tick(secondsPerStep)
        for (const plant of simulation.plants) {
          if (plant.careNeeded) simulation.resolveCare(plant.instanceId, plant.careNeeded)
        }
      }
      return { ok: true, failure: null, mature: maturePlantCounts() }
    },
    advance: (steps = 1, secondsPerStep = 1 / 30) => {
      for (let step = 0; step < steps; step += 1) {
        const events = progress.tick({ farm: currentFarmSnapshot(), expansionLevel: fairground.farmExpansion?.state.level ?? 0 }, secondsPerStep)
        handleAnimalLifeEvents(events)
      }
      return reportConditions()
    },
    resetConditions: () => {
      gardenTools?.clearGrass()
      progress.reset()
      progression.reset()
      accomplishments.reset()
      knownMaturePlants.clear()
      for (const animal of animals) animal.dispose()
      animals.length = 0
      for (const eggId of [...eggVisuals.keys()]) removeEggVisual(eggId)
      animalById.clear()
      crowdFixtureEntries = []
      focusedAnimalId = null
      animalCrowd.update([], new Set(), performance.now() / 1000)
      crowdStats = animalCrowd.stats()
      lastCrowdRefreshAt = 0
      animalNames.clear()
      farmHomes.clear()
      viewerStands.clear()
      void Promise.all(progress.all().map((record) => createAnimalInstance(record))).then((created) => {
        for (const animal of created) {
          farmHomes.set(animal.instanceId, { parent: animal.root.parent ?? fairground.root, position: animal.root.position.clone() })
          if (VIEWER_CAST.includes(animal.id)) {
            const [x, z] = SHOWCASE_ANIMALS[animal.id].spawn
            viewerStands.set(animal.instanceId, new THREE.Vector3(x, GARDEN_LAWN_Y + 0.1, z))
          }
        }
      })
      measureFarm()
      reportConditions()
    },
    animalReport: () => animals.filter((animal) => !animal.isSold).map((animal) => ({
      id: animal.instanceId,
      species: animal.id,
      name: animalNames.get(animal.instanceId),
      stage: animal.stage,
      appearance: animal.appearance,
      heartEyes: animal.heartEyeCount > 0,
      heartCount: animal.heartEyeCount,
      x: +animal.root.position.x.toFixed(2),
      z: +animal.root.position.z.toFixed(2),
      loose: isLoose(animal.instanceId),
      atFarm: animal.isAtFarm,
      residencyPending: animal.isResidencyPending,
    })),
    focusSpecies: (species, height = 4.5) => {
      const animal = animals.find((entry) => entry.id === species || entry.instanceId === species)
      if (!animal) return
      frameAt(animal.root.position.clone().setY(GARDEN_LAWN_Y + 1.1), height)
    },
    focusPoint: (x, z, height = 14) => {
      frameAt(new THREE.Vector3(x, GARDEN_LAWN_Y + 1.1, z), height)
    },
    progression: () => ({ points: progression.points, level: progression.level, pointsToNextLevel: progression.pointsToNextLevel }),
    rendering: () => ({ animalCount: animals.filter((animal) => !animal.isSold).length, populationLimit: animalPopulationLimit, crowd: { ...crowdStats } }),
    crowdStressTest: (requestedCount = animalPopulationLimit) => {
      const fixtures = makeCrowdFixtures(requestedCount)
      const count = fixtures.length
      const nowSeconds = performance.now() / 1000
      if (mode !== 'farm') throw new Error('Crowd stress tests can run only while the farm scene is active')
      const savedHalfHeight = viewHalfHeight
      const savedTarget = cameraTarget.clone()
      const savedPosition = camera.position.clone()
      const savedQuaternion = camera.quaternion.clone()
      const savedProjection = camera.projectionMatrix.clone()
      const savedProjectionInverse = camera.projectionMatrixInverse.clone()
      const previousAutoReset = renderer.info.autoReset
      try {
        renderer.info.autoReset = true
        renderer.info.reset()
        viewHalfHeight = Math.max(viewHalfHeight, 35)
        updateCameraProjection()
        cameraTarget.set(0, GARDEN_LAWN_Y + 0.6, 0)
        camera.position.set(35, 34, 47)
        camera.lookAt(cameraTarget)
        camera.updateMatrixWorld(true)
        animalCrowd.setVisible(true)
        animalCrowd.update(fixtures, new Set(), nowSeconds)
        renderer.render(scene, camera)
        return {
          count,
          renderCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          crowd: animalCrowd.stats(),
        }
      } finally {
        viewHalfHeight = savedHalfHeight
        cameraTarget.copy(savedTarget)
        camera.position.copy(savedPosition)
        camera.quaternion.copy(savedQuaternion)
        camera.projectionMatrix.copy(savedProjection)
        camera.projectionMatrixInverse.copy(savedProjectionInverse)
        camera.updateMatrixWorld(true)
        renderer.info.autoReset = previousAutoReset
        animalCrowd.setVisible(mode === 'farm')
        refreshAnimalCrowd(nowSeconds, true)
        renderer.info.reset()
      }
    },
    setCrowd: (requestedCount = animalPopulationLimit) => {
      if (mode !== 'farm') throw new Error('Crowd fixtures can run only while the farm scene is active')
      crowdFixtureEntries = makeCrowdFixtures(requestedCount)
      focusCamera()
      refreshAnimalCrowd(performance.now() / 1000, true)
      crowdStats = animalCrowd.stats()
      return { count: crowdFixtureEntries.length, crowd: { ...crowdStats } }
    },
    clearCrowd: () => {
      crowdFixtureEntries = []
      refreshAnimalCrowd(performance.now() / 1000, true)
      crowdStats = animalCrowd.stats()
      return { count: 0, crowd: { ...crowdStats } }
    },
    help: () => ({
      state: 'Snapshot: mode, menu, camera, tools, water, herd summary.',
      help: 'This table: one-line usage for every harness command.',
      focusGarden: 'Frame the whole garden. Run before pointer scenarios.',
      focusPoint: 'focusPoint(x, z, height?) — frame a habitat, e.g. a pond.',
      focusSpecies: 'focusSpecies(species, height?) — close-up for model review.',
      resetCamera: 'Back to the opening shot.',
      'openMenu / closeMenu / openJournal / openViewer': 'Drive the menu without clicks.',
      layout: 'Every UI panel rect — use instead of screenshots for layout checks.',
      camera: 'Camera pose + tour state. advanceTour(seconds) steps the cinematic.',
      'startTour / endTour': 'Deterministic tour on a fixed seed for review passes.',
      farmState: 'Measured m2: tall grass, water, flat grass, plant counts.',
      conditions: 'Every species ladder rung + live numbers.',
      setStage: 'setStage(species, 0-4) — force a rung and play its transition.',
      'advance / simulate': 'Tick progression without waiting (advance) or without browser time (simulate).',
      resetConditions: 'Forget everything: clears garden, herd, fixtures, progression.',
      'sowGrass / digPond / digAt / pourAt / clearGarden': 'Terrain + water fixtures in garden meters.',
      'plant / growPlants': 'plant(species, x, z) then growPlants() to mature.',
      'waterSummary / gardenReport / probeGround / probeView': 'Water, terrain/parcel dims, surface inspector.',
      expandFarm: 'expandFarm(level) — reveal parcels without earning them.',
      expandOnce: 'expandOnce() — watch one real-time carnival pack-up and land reveal.',
      carnivalReport: 'carnivalReport() — inspect close attraction identities and migration phases.',
      progression: 'Points, level, next expansion milestone.',
      'selectTool / projectGardenPoint': 'Arm a tool; project garden meters to canvas pixels for pointer tests.',
      'animalReport / rendering': 'Herd list; live counts + crowd stats.',
      hatch: 'Hatch a ready egg by id.',
      'grantCoins / shop / buy / placeProp / placeFence / propCounts': 'Wallet + prop placement without UI clicks.',
      crowdStressTest: 'crowdStressTest(n) — one render of n fixtures; returns calls/tris. Restores after.',
      'setCrowd / clearCrowd': 'setCrowd(n) keeps n fixtures live for sustained ramps; clearCrowd restores.',
      performanceSamples: 'Per-frame work/interval splits. Basis for every perf scenario; see TESTING.md.',
    }),
    simulate: (seconds, steps = Math.max(1, Math.ceil(seconds * 4))) => {
      if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(steps) || steps < 1) return reportConditions()
      const dt = seconds / Math.floor(steps)
      for (let step = 0; step < Math.floor(steps); step += 1) {
        const events = progress.tick({
          farm: currentFarmSnapshot(),
          expansionLevel: fairground.farmExpansion?.state.level ?? 0,
          positions: Object.fromEntries(animals.map((animal) => [animal.instanceId, { x: animal.root.position.x, z: animal.root.position.z }])),
        }, dt)
        handleAnimalLifeEvents(events)
      }
      return reportConditions()
    },
    gardenReport: () => ({
      bounds: { ...currentGardenBounds },
      terrain: { cols: gardenTerrain?.gridCols ?? 0, rows: gardenTerrain?.gridRows ?? 0, originX: gardenTerrain?.originX ?? 0, originZ: gardenTerrain?.originZ ?? 0 },
      water: { cols: gardenWater?.gridCols ?? 0, rows: gardenWater?.gridRows ?? 0, originX: gardenWater?.originX ?? 0, originZ: gardenWater?.originZ ?? 0 },
    }),
    expandOnce: () => fairground.farmExpansion?.expand() ?? null,
    carnivalReport: () => fairground.carnivalReport?.() ?? [],
    expandFarm: (level) => {
      const expansion = fairground.farmExpansion
      if (!expansion) return 0
      const target = Math.max(0, Math.min(FARM_EXPANSION_CONFIG.maximumLevel, Math.floor(level)))
      let guard = 0
      while (expansion.state.level < target && guard < FARM_EXPANSION_CONFIG.maximumLevel * 3 + 10) {
        expansion.expand()
        for (let step = 0; step < 160; step += 1) fairground.update(.5)
        guard += 1
      }
      currentGardenBounds = expansion.state.bounds
      gardenTerrain?.syncBounds()
      gardenTerrain?.applyToMeshes()
      gardenWater?.resize(gardenTerrain?.gridCols ?? 0, gardenTerrain?.gridRows ?? 0)
      gardenWater?.markTerrainChanged()
      gardenWaterMesh?.markDirty()
      gardenTools?.syncSurfaceGeometry()
      // Attribute update ranges describe pending GPU uploads, not just CPU
      // writes. Fast-forwarding many steps without a render must commit the
      // whole final mask, otherwise the GPU keeps the original starter patch.
      fairground.refreshLandReveal?.()
      return expansion.state.level
    },
    probeGround: (x, z) => {
      const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0))
      // Sprites need a camera to raycast against; the probe only wants meshes
      // anyway, but the raycaster walks the whole scene to find them.
      raycaster.camera = camera
      const surfaces: { name: string; y: number; color: string | null }[] = []
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (surfaces.length >= 6) break
        const object = hit.object
        if (!object.visible || !(object instanceof THREE.Mesh)) continue
        const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial
        surfaces.push({ name: object.name || '(unnamed)', y: +hit.point.y.toFixed(3), color: material?.color ? `#${material.color.getHexString()}` : null })
      }
      return surfaces
    },
    probeView: (screenX, screenY) => {
      const rect = gameCanvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return []
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(
        ((screenX - rect.left) / rect.width) * 2 - 1,
        -((screenY - rect.top) / rect.height) * 2 + 1,
      ), camera)
      raycaster.camera = camera
      const surfaces: { distance: number; name: string; y: number; color: string | null }[] = []
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (surfaces.length >= 6) break
        const object = hit.object
        if (!object.visible || !(object instanceof THREE.Mesh)) continue
        const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshStandardMaterial
        surfaces.push({
          distance: +hit.distance.toFixed(2),
          name: object.name || `unnamed ${material?.color ? `#${material.color.getHexString()}` : ''}`,
          y: +hit.point.y.toFixed(3),
          color: material?.color ? `#${material.color.getHexString()}` : null,
        })
      }
      return surfaces
    },
    hatch: (eggId) => {
      const egg = progress.eggs().find((entry) => entry.id === eggId)
      if (!egg) return null
      const event = progress.hatch(eggId)
      if (event) removeEggVisual(eggId)
      const record = event?.animalId ? progress.animal(event.animalId) : undefined
      if (record) void createAnimalInstance(record, { x: egg.x, z: egg.z }).then((created) => {
        created.stage = record.stage
        created.setDetailedVisible(true)
        farmHomes.set(created.instanceId, { parent: created.root.parent ?? fairground.root, position: created.root.position.clone() })
      })
      return event
    },
    camera: () => cameraReport(),
    advanceTour: (seconds) => {
      // Fixed steps so a review pass replays identically; the cap keeps a typo
      // from locking the tab up.
      const step = 1 / 60
      const steps = Math.max(0, Math.min(60 * 120, Math.round(seconds / step)))
      for (let index = 0; index < steps; index += 1) updateCameraTour(step)
      return cameraReport()
    },
    startTour: (seed) => beginCameraTour(seed),
    endTour: (restore = true) => { endCameraTour(restore) },
    resetCamera: () => { resetCameraToStart() },
    grantCoins: (amount) => {
      const balance = wallet.credit(amount)
      salePanel.setWallet(balance)
      shedDom.refresh()
      shop.refresh()
      return balance
    },
    shop: () => {
      shop.setOpen(true)
      syncFarmChrome()
      return { open: shop.isOpen }
    },
    shed: () => {
      shed.open()
      return shed.describe?.() ?? null
    },
    balloon: () => balloon.describe?.() ?? null,
    player: () => {
      playerDom.refresh(playerDomStats())
      playerDom.setOpen(true)
      syncFarmChrome()
      return { open: playerDom.isOpen }
    },
    inbox: () => {
      notificationPanel.markAllRead()
      notificationDom.refresh(notificationPanel.getLetters(), notificationPanel.nowSeconds())
      notificationDom.setOpen(true, balloonInboxAnchor())
      syncFarmChrome()
      return { open: notificationDom.isOpen }
    },
    buy: (id) => {
      if (!gardenProps) return null
      const result = purchaseProp(wallet, gardenProps.inventory, id as PropId)
      salePanel.setWallet(wallet.balance)
      shedDom.refresh()
      shop.refresh()
      return result
    },
    propCounts: () => (gardenProps ? { ...gardenProps.inventory.counts } : {}),
    placeProp: (id, cellX, cellZ, rotation = 0) => gardenProps?.placeProp(id as PropId, cellX, cellZ, rotation) ?? null,
    placeFence: (fromX, fromZ, toX, toZ) => gardenProps?.placeFence(fromX, fromZ, toX, toZ) ?? null,
    propReport: () => gardenProps?.report() ?? null,
    notify: (kind, subject) => {
      if (kind === 'plant') notificationPanel.notifyPlantGrown(String(subject ?? 'Clover'))
      else notificationPanel.notifyMilestone(kind, String(subject ?? 'Pig'))
    },
    pickUpProp: (clientX, clientY) => gardenProps?.pickUpAt(clientX, clientY) ?? null,
    scene,
    uiScene: ui.scene,
    performanceSamples: () => frameTimingSamples,
    // Reports where every surface actually landed, so layout can be checked at
    // any window size without eyeballing a screenshot.
    layout: () => {
      const described: Record<string, unknown> = {}
      for (const panel of panels) described[panel.name] = panel.describe?.() ?? null
      return {
        window: { width: window.innerWidth, height: window.innerHeight },
        design: { width: ui.viewport.width, height: ui.viewport.height },
        panels: described,
      }
    },
  }
  Object.defineProperty(window, '__gardenDebug', { value: debugHarness, configurable: true })
  window.dispatchEvent(new CustomEvent('garden-debug-ready'))
}

/**
 * A slow drift around the farm while the main menu is up.
 *
 * A still camera makes the menu read as a screenshot of the game with buttons
 * on it. Easing the orbit in and out makes the diorama feel like a place you
 * are standing in front of, which is the whole point of drawing the menu over
 * the live farm rather than replacing it.
 */
let menuDrift = 0
const menuDriftBase = new THREE.Vector3()
const menuDriftOffset = new THREE.Vector3()
const worldUp = new THREE.Vector3(0, 1, 0)

function updateMenuDrift(delta: number, elapsed: number): void {
  const target = menu.isOpen && mode === 'farm' ? 1 : 0
  const previous = menuDrift
  menuDrift += (target - menuDrift) * (1 - Math.exp(-delta * 1.1))
  if (Math.abs(target - menuDrift) < 0.001) menuDrift = target
  if (menuDrift === 0 && previous === 0) return
  if (previous === 0) menuDriftBase.copy(camera.position).sub(cameraTarget)
  if (menuDrift === 0) return
  const angle = Math.sin(elapsed * 0.085) * 0.075 * menuDrift
  menuDriftOffset.copy(menuDriftBase).applyAxisAngle(worldUp, angle)
  camera.position.copy(cameraTarget).add(menuDriftOffset)
  camera.lookAt(cameraTarget)
  camera.updateMatrixWorld()
}

// --------------------------------------------------------------- render loop --

updateCameraProjection()

let previousTime = performance.now()
let lastPerformanceLogAt = previousTime
let previousFrameTimestamp: number | null = null
window.addEventListener('resize', () => {
  performanceOverlay?.resize(window.innerWidth, window.innerHeight)
})
performanceOverlay?.resize(window.innerWidth, window.innerHeight)

function frame(now: number): void {
  const intervalMs = previousFrameTimestamp === null ? 0 : now - previousFrameTimestamp
  previousFrameTimestamp = now
  const timingEnabled = __GARDEN_DEBUG__ && gardenDebugMode
  const workStartedAt = timingEnabled ? performance.now() : 0
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  let stageStartedAt = workStartedAt
  removePreviousCameraShake()
  fairground.update(delta)
  const fairgroundMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  // Avoid the much heavier state snapshot on the animation hot path; retain
  // the exact final bounds as the animation settles.
  let expansionLevel = 0
  let expansionIsAnimating = false
  if (fairground.farmExpansion) {
    expansionLevel = fairground.farmExpansion.level
    expansionIsAnimating = fairground.farmExpansion.isAnimating
    currentGardenBounds = fairground.farmExpansion.bounds
  } else {
    currentGardenBounds = GARDEN_BOUNDS
  }
  const expansionBoundsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  viewerStage?.update(delta)
  updateMenuDrift(delta, now / 1000)
  updateCameraTour(delta)
  animals.forEach((animal) => animal.update(delta))
  // The condition ladder runs after the animals have moved, so a settle
  // triggered this frame is applied against the farm as it is right now.
  updateAnimalProgress(delta)
  // The animals keep walking and following garden terrain on their own, so in
  // the viewer we pin them back onto their plinths after the update.
  if (mode === 'viewer') {
    for (const animal of getViewerCastAnimals()) {
      const stand = viewerStands.get(animal.instanceId)
      if (stand) animal.root.position.copy(stand)
    }
  }
  refreshAnimalCrowd(now / 1000)
  const animalsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  // A farm expansion moves the editable parcel edge; re-solve ponds only when
  // bounds actually change, never on every frame.
  if (gardenTerrain?.syncBounds()) {
    // Smooth bounds animation reveals already-flat rows; the parcel's full
    // mesh transition is handled once when its integer level first advances.
    if (gardenTerrain.dirty) gardenTerrain.applyToMeshes()
    if (!expansionIsAnimating) {
      gardenWater?.resize(gardenTerrain.gridCols, gardenTerrain.gridRows)
      gardenWater?.markTerrainChanged()
      gardenWaterMesh?.markDirty()
    }
  }
  gardenTools?.update(delta)
  if (gardenWaterMesh && (gardenWater?.dirty || gardenWaterMesh.dirty)) {
    gardenWaterMesh.update(now * 0.001)
  }
  if (fairground.farmExpansion) {
    if (expansionLevel > lastExpansionLevel) {
      lastExpansionLevel = expansionLevel
      expansionFeedbackSeconds = CAMERA_SHAKE_DURATION
      expansionFeedbackStrength = 1
    }
  }
  gardenPlants?.update(delta, mode === 'farm' && !menu.isOpen && !journal.isOpen && !viewer.isOpen && !salePanel.isOpen)
  gardenProps?.update(delta)
  const matureIds = new Set<number>()
  for (const plant of gardenPlants?.simulation.plants ?? []) {
    if (!plant.mature) continue
    matureIds.add(plant.instanceId)
    if (!knownMaturePlants.has(plant.instanceId)) {
      knownMaturePlants.add(plant.instanceId)
      const earned = accomplishments.discoverPlantGrown(plant.species)
      if (earned) unlockAccomplishment(earned)
      else notificationPanel.notifyPlantGrown(plantDisplayName(plant.species))
    }
  }
  for (const knownId of [...knownMaturePlants]) if (!matureIds.has(knownId)) knownMaturePlants.delete(knownId)
  if (playerDom.isOpen) playerDom.refresh(playerDomStats())
  if (notificationDom.isOpen) notificationDom.refresh(notificationPanel.getLetters(), notificationPanel.nowSeconds())
  {
    const unread = notificationPanel.getUnreadCount()
    balloon.setPostBadge(unread > 9 ? '9+' : unread > 0 ? String(unread) : '')
  }
  notificationPanel.setVisible(mode === 'farm' && !menu.isOpen && !journal.isOpen && !salePanel.isOpen && !shop.isOpen && !shed.isOpen && !playerDom.isOpen)
  if (!gardenPlants?.selectedSpecies && !shed.isOpen) gardenTools?.setPlantingMode(false)
  if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !shop.isOpen && !shed.isOpen) refreshShopUi()
  shedDom.refresh()
  const toolsMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  updateCameraPan(delta)
  applyExpansionCameraShake(delta, now / 1000)
  if (pointerWasSeen && !isOverGameHUD(pointerPosition.x, pointerPosition.y)) {
    if (mode === 'farm' && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && toolsHud.selectedTool === 'hand') gardenPlants?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y, button: 0 })
    gardenProps?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
    if (isWorldToolActive()) gardenTools?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
  } else {
    gardenPlants?.pointerLeave()
    gardenProps?.pointerLeave()
    gardenTools?.pointerLeave()
  }
  const otherUpdateMs = timingEnabled ? performance.now() - stageStartedAt : 0
  renderer.info.reset()
  stageStartedAt = timingEnabled ? performance.now() : 0
  renderer.render(scene, camera)
  const sceneRenderMs = timingEnabled ? performance.now() - stageStartedAt : 0
  stageStartedAt = timingEnabled ? performance.now() : 0
  ui.update(delta)
  ui.render(renderer)
  let overlayRenderMs = 0
  if (__GARDEN_DEBUG__ && performanceOverlay) {
    performanceOverlay.update(now, summarizeFrameTimings)
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(performanceOverlay.scene, performanceOverlay.camera)
    renderer.autoClear = true
  }
  if (__GARDEN_DEBUG__ && timingEnabled) {
    const finishedAt = performance.now()
    overlayRenderMs = finishedAt - stageStartedAt
    frameTimingSamples.push({
      frameNumber: ++performanceFrameNumber,
      intervalMs,
      workMs: finishedAt - workStartedAt,
      fairgroundMs,
      expansionBoundsMs,
      animalsMs,
      toolsMs,
      otherUpdateMs,
      sceneRenderMs,
      overlayRenderMs,
    })
    if (frameTimingSamples.length > FRAME_TIMING_SAMPLE_LIMIT) frameTimingSamples.shift()
    if (now - lastPerformanceLogAt >= PERF_LOG_INTERVAL_MS) {
      lastPerformanceLogAt = now
      const summary = summarizeFrameTimings()
      if (summary) {
        console.info(`[Frame Performance] ${JSON.stringify(summary)}`)
      }
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
