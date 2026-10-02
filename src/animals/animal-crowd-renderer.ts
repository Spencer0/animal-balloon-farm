import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ANIMAL_CATALOG, type BalloonAnimalId } from './animal-catalog'

export interface AnimalCrowdEntry {
  readonly id: string
  readonly species: BalloonAnimalId
  readonly x: number
  readonly y: number
  readonly z: number
  readonly heading: number
  readonly scale: number
  readonly wild: boolean
  readonly phase: number
}

export interface AnimalCrowdStats {
  readonly animalCount: number
  readonly instancedAnimals: number
  readonly detailedAnimals: number
  readonly batches: number
  readonly lowPolyTriangles: number
}

export interface AnimalCrowdRenderer {
  update(entries: readonly AnimalCrowdEntry[], detailedIds: ReadonlySet<string>, timeSeconds: number): void
  setVisible(visible: boolean): void
  pick(raycaster: THREE.Raycaster): string | null
  stats(): AnimalCrowdStats
  dispose(): void
}

export const ANIMAL_CROWD_CAPACITY = 50
const CROWD_CAPACITY = ANIMAL_CROWD_CAPACITY
const WILD_COLOR = new THREE.Color('#e53649')
const crowdTime = { value: 0 }
const temporaryObject = new THREE.Object3D()
const temporaryScale = new THREE.Vector3()
const temporaryCenter = new THREE.Vector3()
const temporaryMatrix = new THREE.Matrix4()

interface SpeciesBatch {
  readonly species: BalloonAnimalId
  readonly mesh: THREE.InstancedMesh
  readonly idByInstanceIndex: string[]
  readonly baseColor: THREE.Color
  readonly phases: THREE.InstancedBufferAttribute
  readonly trianglesPerAnimal: number
}

function appendPart(parts: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, scale: readonly [number, number, number], position: readonly [number, number, number]): void {
  const part = geometry.clone()
  temporaryScale.set(scale[0], scale[1], scale[2])
  temporaryCenter.set(position[0], position[1], position[2])
  temporaryMatrix.compose(temporaryCenter, new THREE.Quaternion(), temporaryScale)
  part.applyMatrix4(temporaryMatrix)
  parts.push(part)
}

function makeSpeciesGeometry(species: BalloonAnimalId): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const sphere = new THREE.SphereGeometry(1, 8, 6)
  const smallSphere = new THREE.SphereGeometry(1, 6, 5)
  const cone = new THREE.ConeGeometry(0.14, 0.38, 6)
  const body: readonly [number, number, number] = species === 'frog' ? [0.5, 0.32, 0.42]
    : species === 'chicken' ? [0.4, 0.43, 0.34]
      : species === 'goose' ? [0.42, 0.36, 0.3] : [0.53, 0.43, 0.38]
  appendPart(parts, sphere, body, [-0.04, 0.51, 0])

  const headSize: readonly [number, number, number] = species === 'cow' ? [0.27, 0.29, 0.27]
    : species === 'frog' ? [0.31, 0.24, 0.31]
      : species === 'goose' ? [0.2, 0.22, 0.2] : [0.25, 0.27, 0.25]
  const headX = species === 'goose' ? 0.42 : 0.38
  const headY = species === 'goose' ? 0.84 : 0.79
  appendPart(parts, sphere, headSize, [headX, headY, 0])

  if (species === 'pig') {
    appendPart(parts, smallSphere, [0.2, 0.13, 0.22], [0.62, 0.7, 0])
    appendPart(parts, smallSphere, [0.12, 0.17, 0.08], [0.28, 1.03, -0.14])
    appendPart(parts, smallSphere, [0.12, 0.17, 0.08], [0.28, 1.03, 0.14])
  } else if (species === 'cow') {
    appendPart(parts, smallSphere, [0.09, 0.17, 0.09], [0.35, 1.1, -0.16])
    appendPart(parts, smallSphere, [0.09, 0.17, 0.09], [0.35, 1.1, 0.16])
  } else if (species === 'chicken') {
    appendPart(parts, smallSphere, [0.14, 0.09, 0.13], [0.38, 1.12, 0])
    appendPart(parts, cone, [0.62, 0.52, 0.62], [0.63, 0.77, 0])
  } else if (species === 'duck') {
    appendPart(parts, cone, [0.7, 0.34, 0.7], [0.62, 0.75, 0])
  } else if (species === 'goose') {
    appendPart(parts, sphere, [0.13, 0.38, 0.14], [0.36, 0.7, 0])
    appendPart(parts, cone, [0.72, 0.34, 0.72], [0.57, 0.9, 0])
  } else if (species === 'frog') {
    appendPart(parts, smallSphere, [0.12, 0.14, 0.12], [0.38, 1.01, -0.18])
    appendPart(parts, smallSphere, [0.12, 0.14, 0.12], [0.38, 1.01, 0.18])
  } else {
    // A scalloped wool outline remains legible when a sheep is only a few pixels tall.
    for (const [x, y, z] of [[-0.38, 0.72, 0], [-0.08, 0.85, -0.2], [-0.08, 0.85, 0.2], [0.19, 0.75, -0.24], [0.19, 0.75, 0.24]] as const) {
      appendPart(parts, smallSphere, [0.24, 0.23, 0.22], [x, y, z])
    }
  }

  const leg = new THREE.CylinderGeometry(0.075, 0.09, 0.38, 5)
  for (const x of [-0.35, 0.27]) {
    for (const z of [-0.23, 0.23]) appendPart(parts, leg, [1, 1.35, 1], [x, 0.23, z])
  }
  sphere.dispose()
  smallSphere.dispose()
  cone.dispose()
  leg.dispose()
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error(`Could not build ${species} instanced crowd geometry`)
  merged.computeBoundingSphere()
  return merged
}

function crowdMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.76, metalness: 0 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCrowdTime = crowdTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCrowdPhase;\nuniform float uCrowdTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(uCrowdTime * 4.2 + aCrowdPhase) * 0.035;')
  }
  material.customProgramCacheKey = () => 'animal-crowd-gpu-bob-v1'
  return material
}

/**
 * Instanced 3D representations are used for the broad herd. The simulation
 * continues to own stable animal IDs; this renderer only maps those IDs to the
 * current instance index for picking. A bounded set of nearby/active animals
 * can be removed from the crowd and shown as their full GLB instead.
 */
export function createAnimalCrowdRenderer(parent: THREE.Object3D): AnimalCrowdRenderer {
  const root = new THREE.Group()
  root.name = 'Instanced animal crowd · zoom-aware low-detail representation'
  parent.add(root)
  const material = crowdMaterial()
  const raycaster = new THREE.Raycaster()
  const interactionGeometry = new THREE.SphereGeometry(1, 8, 6)
  const interactionMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  interactionMaterial.colorWrite = false
  interactionMaterial.depthWrite = false
  interactionMaterial.depthTest = false
  const interactionProxy = new THREE.InstancedMesh(interactionGeometry, interactionMaterial, CROWD_CAPACITY)
  interactionProxy.name = 'Animal selection proxy · one instance per visible herd member'
  interactionProxy.count = 0
  interactionProxy.frustumCulled = false
  root.add(interactionProxy)
  const idByInteractionIndex: string[] = []
  const batches: SpeciesBatch[] = ANIMAL_CATALOG.map((animal) => {
    const geometry = makeSpeciesGeometry(animal.id)
    const phases = new THREE.InstancedBufferAttribute(new Float32Array(CROWD_CAPACITY), 1)
    phases.setUsage(THREE.StaticDrawUsage)
    geometry.setAttribute('aCrowdPhase', phases)
    const mesh = new THREE.InstancedMesh(geometry, material, CROWD_CAPACITY)
    mesh.name = `Instanced ${animal.name} crowd`
    mesh.count = 0
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    root.add(mesh)
    const trianglesPerAnimal = geometry.index?.count
      ? geometry.index.count / 3
      : geometry.getAttribute('position').count / 3
    return { species: animal.id, mesh, idByInstanceIndex: [], baseColor: new THREE.Color(animal.color), phases, trianglesPerAnimal }
  })
  const batchBySpecies = new Map(batches.map((batch) => [batch.species, batch]))
  let animalCount = 0
  let detailedCount = 0
  let lowPolyTriangles = 0

  return {
    setVisible(visible): void {
      root.visible = visible
    },
    update(entries, detailedIds, timeSeconds): void {
      animalCount = 0
      detailedCount = 0
      lowPolyTriangles = 0
      crowdTime.value = timeSeconds
      for (const batch of batches) {
        batch.mesh.count = 0
        batch.idByInstanceIndex.length = 0
      }
      interactionProxy.count = 0
      idByInteractionIndex.length = 0
      for (const entry of entries) {
        if (animalCount + detailedCount >= CROWD_CAPACITY) break
        if (detailedIds.has(entry.id)) {
          detailedCount += 1
          continue
        }
        const batch = batchBySpecies.get(entry.species)
        if (!batch) continue
        const index = batch.mesh.count++
        animalCount += 1
        batch.idByInstanceIndex[index] = entry.id
        const catalog = ANIMAL_CATALOG.find((animal) => animal.id === entry.species)!
        const size = catalog.size * Math.max(0.1, entry.scale)
        temporaryObject.position.set(entry.x, entry.y, entry.z)
        temporaryObject.rotation.set(0, entry.heading, 0)
        temporaryObject.scale.set(size, size, size)
        temporaryObject.updateMatrix()
        batch.mesh.setMatrixAt(index, temporaryObject.matrix)
        batch.mesh.setColorAt(index, entry.wild ? WILD_COLOR : batch.baseColor)
        batch.phases.setX(index, entry.phase)
        const pickIndex = interactionProxy.count++
        idByInteractionIndex[pickIndex] = entry.id
        temporaryObject.position.set(entry.x, entry.y + size * 0.48, entry.z)
        temporaryObject.rotation.set(0, entry.heading, 0)
        temporaryObject.scale.set(size * 0.74, size * 0.78, size * 0.7)
        temporaryObject.updateMatrix()
        interactionProxy.setMatrixAt(pickIndex, temporaryObject.matrix)
        lowPolyTriangles += batch.trianglesPerAnimal
      }
      for (const batch of batches) {
        batch.mesh.instanceMatrix.needsUpdate = true
        batch.phases.needsUpdate = true
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true
      }
      interactionProxy.instanceMatrix.needsUpdate = true
    },
    pick(incomingRaycaster): string | null {
      raycaster.ray.copy(incomingRaycaster.ray)
      raycaster.near = incomingRaycaster.near
      raycaster.far = incomingRaycaster.far
      const hit = raycaster.intersectObject(interactionProxy, false)[0]
      return hit?.instanceId === undefined ? null : idByInteractionIndex[hit.instanceId] ?? null
    },
    stats(): AnimalCrowdStats {
      return {
        animalCount: animalCount + detailedCount,
        instancedAnimals: batches.reduce((sum, batch) => sum + batch.mesh.count, 0),
        detailedAnimals: detailedCount,
        batches: batches.filter((batch) => batch.mesh.count > 0).length,
        lowPolyTriangles,
      }
    },
    dispose(): void {
      root.parent?.remove(root)
      for (const batch of batches) batch.mesh.geometry.dispose()
      interactionGeometry.dispose()
      interactionMaterial.dispose()
      material.dispose()
    },
  }
}
