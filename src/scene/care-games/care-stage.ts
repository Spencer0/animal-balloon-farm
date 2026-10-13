import * as THREE from 'three'
import type { PlantId, PlantType } from '../../game/plants'
import { plantSpecies } from '../../game/plants'
import { cloneBush, cloneCritter, ownBerryMaterial, berryColor, type BushGroup } from '../plant-models'
import { clonePlantModel, disposePlantModel } from '../garden-plants'

/**
 * The little set every close-up care minigame plays on: a storybook sky, a
 * lawn, a few balloon hills and drifting clouds behind, and the player's plant
 * in the middle at arm's length, from the same model the garden uses.
 *
 * What stands in the middle depends on the species' type:
 *   bush   the Blender blueberry bush, at its own scale (the original stage)
 *   flower the species' own grown model, fitted to about 0.9 units tall, on the lawn
 *   water  the same, floating on a still pond with a soft rim and a few reeds
 *
 * It renders with the farm's own renderer (like the cutscenes do), so it costs
 * no second GPU context and works on both the WebGPU and WebGL backends. Only
 * stock materials are used, so there is no shader to twin in TSL.
 */

export interface CareStage {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** The species' type: which set the plant stands in. */
  readonly type: PlantType
  /** The plant in the middle of the stage, or null if its model is not loaded. */
  readonly plant: THREE.Object3D | null
  /** How tall the plant stands on the stage, in world units (0 with no plant). */
  readonly plantHeight: number
  /** The bush on the stage (blueberry only), or null. Other plants have no bush. */
  readonly bush: THREE.Object3D | null
  readonly bushScale: number
  /** A named group of the bush (blueberry only), or undefined. */
  group(name: BushGroup): THREE.Object3D | undefined
  /** The berry material on the stage bush, for games that add berries of their own (a spare one otherwise). */
  readonly berryMaterial: THREE.MeshStandardMaterial
  /** The plant bounces: `amount` 0..1 sets how hard, and it settles on its own. */
  bounce(amount: number): void
  /** A little burst of sparkles around the plant (a hit, or the win). */
  sparkle(): void
  /** A world position to CSS pixels on screen. */
  toScreen(world: THREE.Vector3, target?: THREE.Vector2): THREE.Vector2
  /** World units per CSS pixel at a world position (for hit radii). */
  pixelsPerUnit(world: THREE.Vector3): number
  /** Where a screen point's ray meets the plane z = `planeZ`. */
  screenToPlane(clientX: number, clientY: number, planeZ: number, target?: THREE.Vector3): THREE.Vector3
  /** Lean the camera toward a screen point (-1..1 each way), like looking along your aim. */
  setLook(nx: number, ny: number): void
  /** Frame the stage from another spot (a side view, say); it holds until the stage is disposed. */
  setFraming(position: THREE.Vector3, lookAt: THREE.Vector3): void
  shake(amount: number): void
  update(deltaSeconds: number): void
  resize(cssWidth: number, cssHeight: number): void
  dispose(): void
}

const CAMERA_HOME = new THREE.Vector3(0, 0.95, 2.45)
const LOOK_AT = new THREE.Vector3(0, 0.5, 0)
/** How tall a fitted plant stands (world units); the bush keeps its own scale. */
const PLANT_TARGET_HEIGHT = 0.9
/** The pond's surface, a hair above the lawn, and the pond's radius. */
const POND_Y = 0.012
const POND_RADIUS = 1.05
const SPARKLES = 10
const SPARKLE_SECONDS = 0.7
const BOUNCE_DECAY = 4.5

function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for the care stage sky')
  const gradient = context.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, '#8fcfe3')
  gradient.addColorStop(0.55, '#cdebe6')
  gradient.addColorStop(1, '#fbeec9')
  context.fillStyle = gradient
  context.fillRect(0, 0, 4, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function softDisc(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for the care stage shadow')
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createCareStage(cssWidth: number, cssHeight: number, species: PlantId): CareStage {
  const scene = new THREE.Scene()
  scene.name = 'Care minigame stage'
  const sky = skyTexture()
  scene.background = sky
  scene.fog = new THREE.Fog('#d9efe6', 6, 14)

  const camera = new THREE.PerspectiveCamera(42, cssWidth / Math.max(1, cssHeight), 0.05, 40)
  camera.name = 'Care minigame camera'
  camera.position.copy(CAMERA_HOME)
  camera.lookAt(LOOK_AT)
  // The swatter hangs off the camera, so the camera has to be in the scene.
  scene.add(camera)

  scene.add(new THREE.HemisphereLight('#e8f6ff', '#8a7a52', 1.5))
  const sun = new THREE.DirectionalLight('#fff0d4', 2.3)
  sun.position.set(2.2, 4, 3)
  scene.add(sun)
  const rim = new THREE.DirectionalLight('#ffd9c2', 0.9)
  rim.position.set(-3, 2, -2)
  scene.add(rim)

  const owned: Array<{ dispose(): void }> = [sky]
  const lawnMaterial = new THREE.MeshLambertMaterial({ color: '#86b85c' })
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(12, 48), lawnMaterial)
  lawn.rotation.x = -Math.PI / 2
  lawn.name = 'Stage lawn'
  scene.add(lawn)
  owned.push(lawn.geometry, lawnMaterial)

  const shadowMap = softDisc()
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowMap, color: '#2f4a22', transparent: true, opacity: 0.4, depthWrite: false })
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.005
  scene.add(shadow)
  owned.push(shadowMap, shadowMaterial, shadow.geometry)

  // Balloon hills on the horizon, in a few greens.
  const hillGeometry = new THREE.SphereGeometry(1, 20, 12)
  owned.push(hillGeometry)
  const hillMaterials = ['#6fa955', '#7fb862', '#5e9a4d', '#94c46e'].map((color) => new THREE.MeshLambertMaterial({ color }))
  owned.push(...hillMaterials)
  const hills: Array<[number, number, number, number, number]> = [
    [-4.2, -0.6, -6, 2.4, 0], [-1.4, -0.9, -7.2, 2.8, 1], [1.9, -0.7, -6.4, 2.5, 2], [4.6, -0.5, -5.6, 2.1, 3], [0.2, -0.4, -4.8, 1.2, 0],
  ]
  for (const [x, y, z, radius, tone] of hills) {
    const hill = new THREE.Mesh(hillGeometry, hillMaterials[tone])
    hill.position.set(x, y, z)
    hill.scale.set(radius, radius * 0.75, radius)
    scene.add(hill)
  }

  // Clouds drift across the back.
  const clouds: THREE.Object3D[] = []
  for (const [x, y, z, s] of [[-2.6, 2.3, -5, 1.7], [1.6, 2.7, -6.5, 2.1], [3.6, 1.9, -4.6, 1.3]] as const) {
    const cloud = cloneCritter('cloud')
    if (!cloud) continue
    cloud.position.set(x, y, z)
    cloud.scale.setScalar(s)
    scene.add(cloud)
    clouds.push(cloud)
  }

  const type = plantSpecies(species).careType
  const bushScale = 1.15
  // The bush is the original stage: its own model, its own scale, no fitting.
  const bush = type === 'bush' ? cloneBush() : null
  let berryMaterial: THREE.MeshStandardMaterial | null = null
  if (bush) {
    bush.scale.setScalar(bushScale)
    berryMaterial = ownBerryMaterial(bush)
    berryMaterial?.color.copy(berryColor(1, new THREE.Color()))
    for (const name of ['BB_flowers', 'BB_shoots']) {
      const group = bush.getObjectByName(name)
      if (group) group.visible = false
    }
    scene.add(bush)
  }
  const berries = berryMaterial ?? new THREE.MeshStandardMaterial({ color: berryColor(1, new THREE.Color()), roughness: 0.45 })
  owned.push(berries)

  // Water plants float on a still pond; every other plant stands on the lawn.
  const baseY = type === 'water' ? POND_Y : 0
  if (type === 'water') {
    const pondMaterial = new THREE.MeshLambertMaterial({ color: '#5aaccc' })
    const pond = new THREE.Mesh(new THREE.CircleGeometry(POND_RADIUS, 48), pondMaterial)
    pond.rotation.x = -Math.PI / 2
    pond.position.y = POND_Y
    pond.name = 'Stage pond'
    scene.add(pond)
    const rimMaterial = new THREE.MeshLambertMaterial({ color: '#eadbaa' })
    const rim = new THREE.Mesh(new THREE.TorusGeometry(POND_RADIUS, 0.05, 8, 48), rimMaterial)
    rim.rotation.x = Math.PI / 2
    rim.position.y = POND_Y + 0.01
    rim.name = 'Stage pond rim'
    scene.add(rim)
    const reedMaterial = new THREE.MeshLambertMaterial({ color: '#6c9a4e' })
    const reedGeometry = new THREE.CylinderGeometry(0.016, 0.022, 1, 5)
    const cattailMaterial = new THREE.MeshLambertMaterial({ color: '#7a4f2e' })
    const cattailGeometry = new THREE.CylinderGeometry(0.036, 0.036, 0.14, 7)
    owned.push(pondMaterial, pond.geometry, rimMaterial, rim.geometry, reedMaterial, reedGeometry, cattailMaterial, cattailGeometry)
    for (const [degrees, height, cattail] of [[-150, 0.6, true], [-118, 0.5, false], [-62, 0.66, false], [-30, 0.52, true], [150, 0.56, false], [126, 0.44, false]] as const) {
      const angle = THREE.MathUtils.degToRad(degrees)
      const reed = new THREE.Mesh(reedGeometry, reedMaterial)
      reed.scale.y = height
      reed.position.set(Math.cos(angle) * (POND_RADIUS - 0.08), height / 2, Math.sin(angle) * (POND_RADIUS - 0.08))
      reed.name = 'Stage reed'
      scene.add(reed)
      if (cattail) {
        const head = new THREE.Mesh(cattailGeometry, cattailMaterial)
        head.position.set(reed.position.x, height * 0.82, reed.position.z)
        head.name = 'Stage cattail'
        scene.add(head)
      }
    }
  }

  // The plant itself: the bush above, or the species' own grown model, fitted and centred.
  let plant: THREE.Object3D | null = bush
  let plantHeight = 0
  let ownedPlantModel: THREE.Group | null = null
  if (bush) {
    plantHeight = new THREE.Box3().setFromObject(bush).getSize(new THREE.Vector3()).y
  } else if (type !== 'bush') {
    // A bush whose model is not loaded yet shows no plant, as before; only other types fall back to the procedural model.
    const model = clonePlantModel(species)
    ownedPlantModel = model
    // A wrapper holds the plant's pivot, so a bounce scales it from the ground up.
    const wrapper = new THREE.Group()
    wrapper.name = `Stage plant · ${species}`
    wrapper.add(model)
    model.updateMatrixWorld(true)
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
    // Ground cover is a flat patch: fit its width at half weight so it reads as a patch, not a sheet.
    const footprint = model.userData.groundCover === true ? Math.max(size.x, size.z) * 0.5 : Math.max(size.x, size.z)
    const span = Math.max(size.y, footprint, 1e-4)
    const fit = PLANT_TARGET_HEIGHT / span
    model.scale.setScalar(fit)
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const centre = box.getCenter(new THREE.Vector3())
    model.position.set(-centre.x, -box.min.y, -centre.z)
    plantHeight = box.getSize(new THREE.Vector3()).y
    // Stand on the lawn, or float on the pond's surface.
    wrapper.position.y = baseY
    scene.add(wrapper)
    plant = wrapper
  }
  const plantBaseScale = plant?.scale.x ?? 1
  // Keep the plant's own model in the owned list so the stage disposes it.
  const plantModel = ownedPlantModel

  const sparkleGeometry = new THREE.OctahedronGeometry(0.035, 0)
  const sparkleMaterial = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, depthWrite: false })
  owned.push(sparkleGeometry, sparkleMaterial)
  const sparkles: Array<{ mesh: THREE.Mesh; age: number; from: THREE.Vector3; drift: THREE.Vector3 }> = []
  for (let index = 0; index < SPARKLES; index += 1) {
    const mesh = new THREE.Mesh(sparkleGeometry, sparkleMaterial)
    mesh.name = 'Stage sparkle'
    mesh.visible = false
    scene.add(mesh)
    sparkles.push({ mesh, age: SPARKLE_SECONDS, from: new THREE.Vector3(), drift: new THREE.Vector3() })
  }
  let bounceAmount = 0
  let bounceTime = 0

  const look = new THREE.Vector2()
  const lookTarget = new THREE.Vector2()
  const home = CAMERA_HOME.clone()
  const target = LOOK_AT.clone()
  let shakeAmount = 0
  let time = 0
  const projector = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  let width = cssWidth
  let height = cssHeight

  const stage: CareStage = {
    scene,
    camera,
    type,
    plant,
    plantHeight,
    bush,
    bushScale,
    berryMaterial: berries,
    group: (name) => bush?.getObjectByName(name),
    bounce(amount): void {
      bounceAmount = Math.max(bounceAmount, THREE.MathUtils.clamp(amount, 0, 1))
      bounceTime = 0
    },
    sparkle(): void {
      if (!plant) return
      const top = plantHeight * 0.85
      for (const [index, spark] of sparkles.entries()) {
        const angle = (index / SPARKLES) * Math.PI * 2 + Math.random() * 0.4
        const radius = 0.14 + Math.random() * 0.18
        spark.from.set(Math.cos(angle) * radius, baseY + top * (0.45 + Math.random() * 0.5), Math.sin(angle) * radius)
        spark.drift.set(Math.cos(angle) * 0.25, 0.35 + Math.random() * 0.25, Math.sin(angle) * 0.25)
        spark.age = 0
        spark.mesh.visible = true
        spark.mesh.position.copy(spark.from)
      }
    },
    toScreen(world, target = new THREE.Vector2()): THREE.Vector2 {
      projector.copy(world).project(camera)
      return target.set((projector.x + 1) / 2 * width, (1 - projector.y) / 2 * height)
    },
    pixelsPerUnit(world): number {
      const distance = camera.position.distanceTo(world)
      const visible = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      return height / Math.max(0.0001, visible)
    },
    screenToPlane(clientX, clientY, planeZ, target = new THREE.Vector3()): THREE.Vector3 {
      ndc.set(clientX / width * 2 - 1, -(clientY / height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      plane.constant = -planeZ
      return raycaster.ray.intersectPlane(plane, target) ?? target.set(0, 0.5, planeZ)
    },
    setLook(nx, ny): void {
      lookTarget.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1))
    },
    setFraming(position, lookAt): void {
      home.copy(position)
      target.copy(lookAt)
    },
    shake(amount): void {
      shakeAmount = Math.max(shakeAmount, amount)
    },
    update(deltaSeconds): void {
      time += deltaSeconds
      look.lerp(lookTarget, Math.min(1, deltaSeconds * 6))
      shakeAmount = Math.max(0, shakeAmount - deltaSeconds * 0.5)
      const jitter = shakeAmount * shakeAmount
      camera.position.set(
        home.x + look.x * 0.14 + (Math.random() - 0.5) * jitter,
        home.y + look.y * 0.07 + Math.sin(time * 0.9) * 0.01 + (Math.random() - 0.5) * jitter,
        home.z,
      )
      camera.lookAt(target.x + look.x * 0.22, target.y + look.y * 0.12, target.z)
      for (const [index, cloud] of clouds.entries()) {
        cloud.position.x += deltaSeconds * (0.08 + index * 0.03)
        if (cloud.position.x > 6) cloud.position.x = -6
      }
      const canopy = bush?.getObjectByName('BB_canopy')
      if (canopy) canopy.rotation.z = Math.sin(time * 1.4) * 0.02
      if (plant) {
        if (bounceAmount > 0.001) {
          bounceTime += deltaSeconds
          const wobble = Math.sin(bounceTime * 22) * bounceAmount * 0.12
          plant.scale.set(plantBaseScale * (1 - wobble * 0.5), plantBaseScale * (1 + wobble), plantBaseScale * (1 - wobble * 0.5))
          bounceAmount = Math.max(0, bounceAmount - deltaSeconds * BOUNCE_DECAY * Math.max(0.2, bounceAmount))
        } else if (bounceAmount > 0) {
          bounceAmount = 0
          plant.scale.setScalar(plantBaseScale)
        }
      }
      for (const spark of sparkles) {
        if (!spark.mesh.visible) continue
        spark.age += deltaSeconds
        const progress = spark.age / SPARKLE_SECONDS
        if (progress >= 1) {
          spark.mesh.visible = false
          continue
        }
        spark.mesh.position.copy(spark.from).addScaledVector(spark.drift, spark.age)
        spark.mesh.scale.setScalar(Math.sin(Math.PI * progress) + 0.05)
        spark.mesh.rotation.y += deltaSeconds * 6
      }
    },
    resize(cssW, cssH): void {
      width = cssW
      height = cssH
      camera.aspect = cssW / Math.max(1, cssH)
      // Keep the bush in frame on a tall, narrow window.
      camera.fov = camera.aspect < 1.2 ? 42 * Math.min(1.6, 1.2 / camera.aspect) : 42
      camera.updateProjectionMatrix()
    },
    dispose(): void {
      for (const part of owned) part.dispose()
      if (plantModel) disposePlantModel(plantModel)
      scene.clear()
    },
  }
  stage.resize(cssWidth, cssHeight)
  return stage
}
