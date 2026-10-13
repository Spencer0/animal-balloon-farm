import * as THREE from 'three'
import { cloneBush, cloneCritter, ownBerryMaterial, berryColor, type BushGroup } from '../plant-models'

/**
 * The little set every close-up care minigame plays on: a storybook sky, a
 * lawn, a few balloon hills and drifting clouds behind, and the plant itself
 * in the middle at arm's length, from the same Blender model the garden uses.
 *
 * It renders with the farm's own renderer (like the cutscenes do), so it costs
 * no second GPU context and works on both the WebGPU and WebGL backends. Only
 * stock materials are used, so there is no shader to twin in TSL.
 */

export interface CareStage {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** The bush on the stage, or null if the model is not loaded. */
  readonly bush: THREE.Object3D | null
  readonly bushScale: number
  group(name: BushGroup): THREE.Object3D | undefined
  /** The berry material on the stage bush, for games that add berries of their own. */
  readonly berryMaterial: THREE.MeshStandardMaterial
  /** A world position to CSS pixels on screen. */
  toScreen(world: THREE.Vector3, target?: THREE.Vector2): THREE.Vector2
  /** World units per CSS pixel at a world position (for hit radii). */
  pixelsPerUnit(world: THREE.Vector3): number
  /** Where a screen point's ray meets the plane z = `planeZ`. */
  screenToPlane(clientX: number, clientY: number, planeZ: number, target?: THREE.Vector3): THREE.Vector3
  /** Lean the camera toward a screen point (-1..1 each way), like looking along your aim. */
  setLook(nx: number, ny: number): void
  shake(amount: number): void
  update(deltaSeconds: number): void
  resize(cssWidth: number, cssHeight: number): void
  dispose(): void
}

const CAMERA_HOME = new THREE.Vector3(0, 0.95, 2.45)
const LOOK_AT = new THREE.Vector3(0, 0.5, 0)

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

export function createCareStage(cssWidth: number, cssHeight: number): CareStage {
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

  const bushScale = 1.15
  const bush = cloneBush()
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

  const look = new THREE.Vector2()
  const lookTarget = new THREE.Vector2()
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
    bush,
    bushScale,
    berryMaterial: berries,
    group: (name) => bush?.getObjectByName(name),
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
    shake(amount): void {
      shakeAmount = Math.max(shakeAmount, amount)
    },
    update(deltaSeconds): void {
      time += deltaSeconds
      look.lerp(lookTarget, Math.min(1, deltaSeconds * 6))
      shakeAmount = Math.max(0, shakeAmount - deltaSeconds * 0.5)
      const jitter = shakeAmount * shakeAmount
      camera.position.set(
        CAMERA_HOME.x + look.x * 0.14 + (Math.random() - 0.5) * jitter,
        CAMERA_HOME.y + look.y * 0.07 + Math.sin(time * 0.9) * 0.01 + (Math.random() - 0.5) * jitter,
        CAMERA_HOME.z,
      )
      camera.lookAt(LOOK_AT.x + look.x * 0.22, LOOK_AT.y + look.y * 0.12, LOOK_AT.z)
      for (const [index, cloud] of clouds.entries()) {
        cloud.position.x += deltaSeconds * (0.08 + index * 0.03)
        if (cloud.position.x > 6) cloud.position.x = -6
      }
      const canopy = bush?.getObjectByName('BB_canopy')
      if (canopy) canopy.rotation.z = Math.sin(time * 1.4) * 0.02
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
      scene.clear()
    },
  }
  stage.resize(cssWidth, cssHeight)
  return stage
}
