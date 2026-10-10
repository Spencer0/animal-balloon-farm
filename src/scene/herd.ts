import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from '../animals/balloon-animal'
import { getAnimalSceneOptions, ANIMAL_CATALOG, VIEWER_CAST } from '../animals/animal-catalog'
import { SHOWCASE_ANIMALS } from './capture-showcase'
import { clearOfFarmBounds } from '../game/animal-travel'
import { GARDEN_LAWN_Y } from './fairground'
import type { GardenTerrain } from './garden-terrain'
import type { AnimalRecord, createAnimalLife } from '../game/animal-life'
import type { GardenBounds } from '../game/farm-expansion'

export interface HerdDeps {
  readonly camera: THREE.OrthographicCamera
  readonly gameCanvas: HTMLCanvasElement
  readonly fairgroundRoot: THREE.Group
  readonly gardenTerrain: GardenTerrain | null
  readonly activeGardenBounds: () => GardenBounds
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly isLoose: (animalId: string) => boolean
  readonly animals: BalloonAnimal[]
  readonly animalById: Map<string, BalloonAnimal>
  readonly animalNames: Map<string, string>
  readonly generatedAnimalNames: readonly string[]
  readonly animalPopulationLimit: number
  readonly animalCreations: Map<string, Promise<BalloonAnimal>>
  readonly farmHomes: Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>
  readonly viewerStands: Map<string, THREE.Vector3>
  readonly crowdFixtures: BalloonAnimal[]
  readonly mode: () => 'farm' | 'viewer'
  readonly getViewerCastAnimals: () => BalloonAnimal[]
}

export function createHerd(deps: HerdDeps) {
  const { camera, gameCanvas, fairgroundRoot, gardenTerrain, activeGardenBounds, progress, isLoose, animals, animalById, animalNames, generatedAnimalNames, animalPopulationLimit, animalCreations, farmHomes, viewerStands, crowdFixtures, mode, getViewerCastAnimals } = deps
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
    if (!detailedHit) return null
    return animals.find((animal) => animal.root === detailedHit.object || animal.root.getObjectById(detailedHit.object.id) !== undefined) ?? null
  }

  /**
   * Show every animal that is out on the farm and in view, and hide the rest.
   *
   * Animals indoors have no model in the scene at all (see `updateHousing`), so
   * at most `OUTDOOR_LIMITS.total` are ever drawn and each one gets its full
   * model. Off-screen animals are hidden too, which also stops their mixers.
   */
  function refreshAnimalVisibility(nowSeconds: number, force = false): void {
    if (!force && nowSeconds - lastVisibilityRefreshAt < 1 / 15) return
    lastVisibilityRefreshAt = nowSeconds
    camera.updateMatrixWorld()
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const activeInViewer = new Set(getViewerCastAnimals().map((animal) => animal.instanceId))
    let shown = 0
    for (const animal of animals) {
      const record = progress.animal(animal.instanceId)
      if (!record || record.stage <= 0 || animal.isSold) {
        animal.setDetailedVisible(false)
        continue
      }
      // A flier is away by day.
      if (animal.isFlier && !animal.flightVisible) {
        animal.setDetailedVisible(false)
        continue
      }
      if (mode() === 'viewer') {
        const cast = activeInViewer.has(animal.instanceId)
        animal.setDetailedVisible(cast)
        if (cast) shown += 1
        continue
      }
      const size = ANIMAL_CATALOG.find((entry) => entry.id === animal.id)?.size ?? 2
      const renderPosition = animal.currentPosition.clone()
      renderPosition.y += 0.4 * size * animal.currentScale
      const sphere = new THREE.Sphere(renderPosition, Math.max(1.2, size * animal.currentScale * 0.9))
      const inView = frustum.intersectsSphere(sphere)
      animal.setDetailedVisible(inView)
      if (inView) shown += 1
    }
    shownAnimalCount = shown
  }

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

  /** How many animal models were drawn at the last visibility refresh. */
  let shownAnimalCount = 0

  const CROWD_FIXTURE_LIMIT = 60

  function clearCrowdFixtures(): void {
    for (const fixture of crowdFixtures) fixture.dispose()
    crowdFixtures.length = 0
  }

  async function setCrowdFixtures(requestedCount: number): Promise<number> {
    const count = Math.max(0, Math.min(CROWD_FIXTURE_LIMIT, Math.floor(requestedCount)))
    if (crowdFixtures.length === count) return count
    clearCrowdFixtures()
    const walkers = getAnimalSceneOptions(false, gameCanvas, camera, gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined)
      .filter((entry) => !entry.flier)
    const created = await Promise.all(Array.from({ length: count }, (_, index) => {
      const options = walkers[index % walkers.length]
      const column = index % 10
      const row = Math.floor(index / 10)
      return createBalloonAnimal(fairgroundRoot, {
        ...options,
        name: `Crowd ${index}`,
        instanceId: `crowd-stress-${index}`,
        stage: 3,
        appearance: index % 3 === 0 ? 'wild' : 'standard',
        captureOnClick: false,
        spawn: [(column - 4.5) * 1.6, (row - 2.5) * 1.6],
        getGardenBounds: activeGardenBounds,
      })
    }))
    for (const fixture of created) {
      fixture.setDetailedVisible(true)
      crowdFixtures.push(fixture)
    }
    return count
  }

  let lastVisibilityRefreshAt = 0

  /**
   * Build the model for a tracked animal. `emerging` is for an animal stepping out
   * of its house: it is already a resident, so it appears in its own colours at
   * the door instead of replaying the capture reveal.
   */
  function createAnimalInstance(record: AnimalRecord, position?: { x: number; z: number }, emerging = false): Promise<BalloonAnimal> {
    const existing = animalById.get(record.id)
    if (existing) return Promise.resolve(existing)
    const pending = animalCreations.get(record.id)
    if (pending) return pending
    const creation = loadAnimalInstance(record, position, emerging)
    animalCreations.set(record.id, creation)
    void creation.then(
      () => { if (animalCreations.get(record.id) === creation) animalCreations.delete(record.id) },
      () => { if (animalCreations.get(record.id) === creation) animalCreations.delete(record.id) },
    )
    return creation
  }

  async function loadAnimalInstance(record: AnimalRecord, position?: { x: number; z: number }, emerging = false): Promise<BalloonAnimal> {
    if (animals.length + animalCreations.size >= animalPopulationLimit && !animalById.has(record.id)) return Promise.reject(new Error(`The farm is at its ${animalPopulationLimit}-animal limit`))
    const options = getAnimalSceneOptions(false, gameCanvas, camera, gardenTerrain ? (x: number, z: number) => gardenTerrain.heightAt(x, z) : undefined)
      .find((entry) => entry.id === record.species)
    if (!options) throw new Error(`Missing scene options for animal ${record.species}`)
    const takenNames = new Set(animalNames.values())
    const name = animalNames.get(record.id) ?? generatedAnimalNames.find((candidate) => !takenNames.has(candidate)) ?? `${options.name} ${animalNames.size + 1}`
    animalNames.set(record.id, name)
    const animal = await createBalloonAnimal(fairgroundRoot, {
      ...options,
      name,
      onDetailedModelReady: () => refreshAnimalVisibility(performance.now() / 1000, true),
      instanceId: record.id,
      growthScale: record.growth,
      stage: emerging ? record.stage : 0,
      ...(emerging && record.stage >= 3 ? { appearance: 'standard' as const } : {}),
      captureOnClick: false,
      spawn: position ? [position.x, position.z] : carnivalSpawnFor(record.species),
      isLoose: () => isLoose(record.id),
      getGardenBounds: activeGardenBounds,
    })
    animal.stage = record.stage
    animal.setGrowth(record.growth * record.adultScale)
    animal.setDetailedVisible(false)
    animalById.set(record.id, animal)
    animals.push(animal)
    farmHomes.set(record.id, { parent: animal.root.parent ?? fairgroundRoot, position: animal.root.position.clone() })
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
      animal.setDetailedVisible(false)
    }
    return animal
  }
  function shownCount(): number { return shownAnimalCount }
  function resetVisibilityClock(): void { lastVisibilityRefreshAt = 0 }

  return {
    pickAnimal,
    refreshAnimalVisibility,
    carnivalSpawnFor,
    clearCrowdFixtures,
    setCrowdFixtures,
    createAnimalInstance,
    shownCount,
    resetVisibilityClock,
  }
}
