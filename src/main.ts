import './style.css'
import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './animals/balloon-animal'
import { createFairground, createSkyDome, GARDEN_LAWN_Y } from './scene/fairground'
import { createCaptureShowcaseStage, SHOWCASE_ANIMALS } from './scene/capture-showcase'
import { createCaptureShowcaseUI, createShowcaseLaunchButton } from './ui/capture-showcase-ui'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('Missing game canvas')
const gameCanvas = canvas

const renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.info.autoReset = true

const scene = new THREE.Scene()
scene.background = new THREE.Color('#a7d5d3')
scene.add(createSkyDome())

const showcaseMode = new URLSearchParams(window.location.search).has('showcase')
const normalViewHeight = 39.5
const showcaseViewHeight = 22

const cameraTarget = new THREE.Vector3(0, 1.25, 0)
const aspect = window.innerWidth / Math.max(1, window.innerHeight)
const viewHeight = showcaseMode ? showcaseViewHeight : normalViewHeight
const camera = new THREE.OrthographicCamera(
  -(viewHeight * aspect) / 2,
  (viewHeight * aspect) / 2,
  viewHeight / 2,
  -viewHeight / 2,
  0.1,
  720,
)
const initialOffset = showcaseMode ? new THREE.Vector3(20, 24, 28) : new THREE.Vector3(35, 34, 47)
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

const fairground = showcaseMode ? createCaptureShowcaseStage() : createFairground()
scene.add(fairground.root)

// Animals arrive in wild balloon red. Capturing changes their materials in place, then restores
// each animal's palette through a shared 6.8-second paint-bucket reveal.
const animalSceneOptions = { canvas: gameCanvas, camera } as const
const animalDefinitions = [
  {
    id: 'pig', assetUrl: '/assets/animals/balloon-pig.glb', name: 'pig', spawn: showcaseMode ? SHOWCASE_ANIMALS.pig.spawn : [-7, -3.8] as const,
    groundY: GARDEN_LAWN_Y, seed: 5104, size: 2.05, speed: 1.25, bounds: { x: 11.2, z: 6.5 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'sheep', assetUrl: '/assets/animals/balloon-sheep.glb', name: 'sheep', spawn: showcaseMode ? SHOWCASE_ANIMALS.sheep.spawn : [-3.2, 2.1] as const,
    groundY: GARDEN_LAWN_Y, seed: 861, size: 2.1, speed: 0.88, bounds: { x: 10.9, z: 6.2 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'cow', assetUrl: '/assets/animals/balloon-cow.glb', name: 'cow', spawn: showcaseMode ? SHOWCASE_ANIMALS.cow.spawn : [4.4, 2.8] as const,
    groundY: GARDEN_LAWN_Y, seed: 1402, size: 2.7, speed: 0.72, bounds: { x: 10.7, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'chicken', assetUrl: '/assets/animals/balloon-chicken.glb', name: 'chicken', spawn: showcaseMode ? SHOWCASE_ANIMALS.chicken.spawn : [7.4, -1.1] as const,
    groundY: GARDEN_LAWN_Y, seed: 2406, size: 1.85, speed: 1.02, bounds: { x: 10.5, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'duck', assetUrl: '/assets/animals/balloon-duck.glb', name: 'duck', spawn: showcaseMode ? SHOWCASE_ANIMALS.duck.spawn : [-8.0, 3.5] as const,
    groundY: GARDEN_LAWN_Y, seed: 3128, size: 2.0, speed: 0.92, bounds: { x: 10.5, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
  {
    id: 'goose', assetUrl: '/assets/animals/balloon-goose.glb', name: 'goose', spawn: showcaseMode ? SHOWCASE_ANIMALS.goose.spawn : [0.4, -5.0] as const,
    groundY: GARDEN_LAWN_Y, seed: 4801, size: 2.35, speed: 0.8, bounds: { x: 10.5, z: 6.1 }, wandering: !showcaseMode, captureOnClick: !showcaseMode, replayCaptureOnClick: showcaseMode,
  },
] as const
const animals: BalloonAnimal[] = await Promise.all(animalDefinitions.map((definition) =>
  createBalloonAnimal(fairground.root, { ...animalSceneOptions, ...definition }),
))

const animalById = new Map(animals.map((animal) => [animal.id, animal]))
if (!showcaseMode) {
  createShowcaseLaunchButton(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('showcase', '1')
    window.location.assign(url)
  })
}
const showcaseUI = showcaseMode
  ? createCaptureShowcaseUI({
      onPlayAll: () => {
        for (const animal of animals) {
          if (animal.isCaptured) animal.setAppearance('wild')
          animal.beginCapture()
        }
      },
      onResetAll: () => animals.forEach((animal) => animal.setAppearance('wild')),
      onExit: () => {
        const url = new URL(window.location.href)
        url.searchParams.delete('showcase')
        window.location.assign(url)
      },
      onReplay: (animalId) => {
        const animal = animalById.get(animalId)
        if (!animal) return
        if (animal.isCaptured) animal.setAppearance('wild')
        animal.beginCapture()
      },
    })
  : null
if (showcaseMode) document.title = 'Capture Showcase · Animal Balloon Farm'

const targetOffset = new THREE.Vector3()
const viewDirection = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize()
let cameraDistance = initialOffset.length()
let viewHalfHeight = viewHeight / 2
let dragPointer: number | null = null
let previousPointer = { x: 0, y: 0 }
let pointerButton = 0

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

function orbitPointerDown(event: PointerEvent): void {
  if (event.button === 0 && event.detail >= 2) return
  if (event.button !== 0 && event.button !== 2) return
  dragPointer = event.pointerId
  pointerButton = event.button
  previousPointer = { x: event.clientX, y: event.clientY }
  gameCanvas.setPointerCapture(event.pointerId)
}

function orbitPointerMove(event: PointerEvent): void {
  if (dragPointer !== event.pointerId) return
  const dx = event.clientX - previousPointer.x
  const dy = event.clientY - previousPointer.y
  previousPointer = { x: event.clientX, y: event.clientY }
  if (pointerButton === 2) {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const panScale = viewHalfHeight / Math.max(1, window.innerHeight)
    targetOffset.addScaledVector(cameraRight, -dx * panScale)
    targetOffset.addScaledVector(cameraUp, dy * panScale)
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
  if (dragPointer !== event.pointerId) return
  dragPointer = null
  if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
}

function preventCanvasMenu(event: MouseEvent): void {
  event.preventDefault()
}

function handleZoom(event: WheelEvent): void {
  event.preventDefault()
  viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(event.deltaY * 0.001), 1.25, 34)
  updateCameraProjection()
}

gameCanvas.addEventListener('pointerdown', orbitPointerDown)
gameCanvas.addEventListener('pointermove', orbitPointerMove)
gameCanvas.addEventListener('pointerup', orbitPointerUp)
gameCanvas.addEventListener('pointercancel', orbitPointerUp)
gameCanvas.addEventListener('contextmenu', preventCanvasMenu)
gameCanvas.addEventListener('wheel', handleZoom, { passive: false })
window.addEventListener('resize', updateCameraProjection)
updateCameraProjection()

let previousTime = performance.now()
function frame(now: number): void {
  const delta = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
  previousTime = now
  fairground.update(delta)
  animals.forEach((animal) => animal.update(delta))
  showcaseUI?.update(animals)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
