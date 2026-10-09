import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { FARM_EXPANSION_CONFIG, type GardenBounds } from '../game/farm-expansion'
import { clampToFarm, containsFarmPoint } from '../game/farm-footprint'
import type { BalloonAnimalId } from './animal-catalog'
import { createCapturePresentation, type CapturePresentation } from './balloon-capture'
import { clearHeartEyes, heartEyeCount as countHeartEyes, setHeartEyes } from './animal-eyes'
import { lowestClipPoseY } from './animal-grounding'
import { stageHasHeartEyes, type AnimalStage } from '../game/animal-conditions'
import { canSellAnimal } from '../game/sales'
import { advanceAnimalTravel, canAnimalLeaveFarm, clearOfFarmBounds, createAnimalTravelRoute, type AnimalTravelRoute } from '../game/animal-travel'

/**
 * Near-extents of the carnival ring around the plot. The authored carnival pen
 * reaches 30 x 30 around the 14 x 9.5 starter plot, so the midway keeps exactly
 * that much meadow beyond the wall at every expansion level.
 */
const CARNIVAL_RING_OFFSET = { x: 16, z: 20.5 } as const

export type AnimalClip = 'IDLE' | 'WALK' | 'SLEEP'
export type AnimalAppearance = 'standard' | 'wild'
export type { BalloonAnimalId } from './animal-catalog'

type AnimalGLTF = GLTF & { readonly animations: THREE.AnimationClip[] }
type AnimalMaterial = THREE.Material & { color?: THREE.Color; roughness?: number; metalness?: number; clearcoat?: number; clearcoatRoughness?: number }

export interface BalloonAnimalOptions {
  readonly id: BalloonAnimalId
  readonly instanceId?: string
  readonly growthScale?: number
  readonly onDetailedModelReady?: () => void
  readonly assetUrl: string
  readonly appearance?: AnimalAppearance
  readonly name: string
  readonly spawn: readonly [number, number]
  readonly groundY: number
  readonly seed: number
  readonly size: number
  readonly speed: number
  readonly bounds: { readonly x: number; readonly z: number }
  /** Current expandable plot limits; stationary-wanderer games may omit it. */
  readonly getGardenBounds?: () => GardenBounds
  /** Ignore animal clicks when an in-game HUD panel is occupying the pointer. */
  readonly isPointerBlocked?: (clientX: number, clientY: number) => boolean
  readonly canvas: HTMLCanvasElement
  readonly camera: THREE.Camera
  readonly wandering?: boolean
  readonly captureOnClick?: boolean
  readonly replayCaptureOnClick?: boolean
  /** Accent tint for this species' non-heart cosmetics; hearts are always pink. */
  readonly eyeColor?: string
  /** Starting rung on the condition ladder. */
  readonly stage?: AnimalStage
  /**
   * How far the animal is allowed to wander, and whether it is loose at the
   * carnival or fenced into the plot. Stage 1 (up at the tents) is loose; from
   * stage 2 on it is clamped to the farm, which is what physically expresses
   * "visited the farm, inside the carnival".
   */
  readonly isLoose?: () => boolean
  /** Half-extents to roam when loose at the carnival. */
  readonly carnivalBounds?: { readonly x: number; readonly z: number }
  /** Terrain height at garden (x, z); enables walking over deformed ground. */
  readonly groundSampler?: (x: number, z: number) => number
  /**
   * A flier does not wander. The predator sim places it every frame through
   * `setFlightPose`, and it is only ever drawn as its full model.
   */
  readonly flier?: boolean
}

/** One frame of flight, as decided by `src/game/predator.ts`. */
export interface FlightPose {
  readonly visible: boolean
  readonly x: number
  readonly y: number
  readonly z: number
  /** Yaw about +Y for a +X-forward model. */
  readonly heading: number
  /** Nose-down angle in radians. */
  readonly pitch: number
  /** IDLE is the folded, perched pose; WALK is the wide-winged flight cycle. */
  readonly clip: AnimalClip
  /** Animation speed. A balloon barely flaps, so a patrol runs well under 1. */
  readonly rate: number
  /** How full of helium the balloon is, 0..1. A slack owl is visibly smaller. */
  readonly puff?: number
}

/** Where a night animal curls up for the day, and which way it faces (yaw about +Y, +X-forward model). */
export interface SleepSpot {
  readonly x: number
  readonly z: number
  readonly heading: number
}

export interface BalloonAnimal {
  readonly id: BalloonAnimalId
  readonly instanceId: string
  readonly root: THREE.Group
  readonly isSold: boolean
  readonly hasDetailedModel: boolean
  readonly currentPosition: THREE.Vector3
  readonly currentHeading: number
  readonly currentScale: number
  readonly renderPriority: number
  readonly isRomancing: boolean
  /** True for a species that is positioned by the predator sim instead of wandering. */
  readonly isFlier: boolean
  /** Whether the flier is currently in the world at all (it is away by day). */
  readonly flightVisible: boolean
  /** Place a flier for this frame. No-op for ground animals. */
  setFlightPose(pose: FlightPose): void
  /** Prey in a panic: runs faster in short dashes and beats its wings harder. */
  setAlarmed(alarmed: boolean): void
  readonly isAlarmed: boolean
  /**
   * Walk to `spot` and curl up there, or wake and wander again when null. There is no
   * sleep clip: the model keeps its `IDLE` pose, slowed, and is squashed into a crouch
   * with a slow breath, so a new species needs no extra animation.
   */
  setSleepSpot(spot: SleepSpot | null): void
  /** True once it has reached its spot and is curled up (not merely on its way there). */
  readonly isSleeping: boolean
  /**
   * Walk to a house door to go indoors, or carry on wandering when null. Takes
   * priority over sleeping. A flier ignores it: it is simply shown or hidden.
   * `speedScale` above 1 is a sprint, e.g. a mouse fleeing a snake.
   */
  setHomeTrip(door: { readonly x: number; readonly z: number } | null, speedScale?: number): void
  /** True once it has reached the door it was sent to. */
  readonly isAtDoor: boolean
  /** True while it walks to a house door. */
  readonly isGoingHome: boolean
  /**
   * Steer toward a point at `speedScale` times its walking speed, as a hunting
   * snake does; 0 holds it still. Null hands it back to its own wandering.
   * A house trip takes priority. A flier ignores it.
   */
  setPursuit(pursuit: { readonly x: number; readonly z: number; readonly speedScale: number } | null): void
  /** Shift it sideways on the ground, e.g. out of a house wall or a neighbour. Walking carries on. */
  nudge(dx: number, dz: number): void
  /** Stand at a point, e.g. a house door it has just stepped out of, and wander from there. */
  placeAt(x: number, z: number): void
  readonly isLoose: boolean
  /** The look currently worn; residency is gated on actually walking inside. */
  readonly appearance: AnimalAppearance
  readonly animationPhase: number
  /** Keep a chosen detailed instance during LOD swaps without losing state. */
  setDetailedVisible(visible: boolean): void
  readonly canSell: boolean
  sell(): boolean
  readonly gltf: AnimalGLTF | null
  setAnimation(name: AnimalClip, fadeSeconds?: number): void
  setAppearance(appearance: AnimalAppearance): void
  beginCapture(): boolean
  readonly isCaptured: boolean
  readonly isCapturing: boolean
  readonly captureProgress: number
  /** True once the router has carried this animal onto the farm side of the gate. */
  readonly isAtFarm: boolean
  /** Residency decided, but still waiting for the walk-in and browse time. */
  readonly isResidencyPending: boolean
  /**
   * Where this animal sits on the four-condition ladder. Drives appearance and
   * heart eyes, and is the single thing the progression engine pokes.
   */
  stage: AnimalStage
  /** Species accent colour, for debug readouts; heart eyes use the shared pink. */
  readonly eyeColor: string
  /** How many heart eyes are currently worn, for the debug report. */
  readonly heartEyeCount: number
  setGrowth(scale: number): void
  setRomancing(active: boolean, partnerPosition?: THREE.Vector3): void
  update(deltaSeconds: number): void
  dispose(): void
}

interface LoadedAnimal {
  readonly gltf: AnimalGLTF
  readonly root: THREE.Group
  readonly mixer: THREE.AnimationMixer
  readonly actions: Map<AnimalClip, THREE.AnimationAction>
  activeAnimation: AnimalClip | null
}

const BODY_MATERIALS: Record<BalloonAnimalId, THREE.MeshStandardMaterial> = {
  pig: new THREE.MeshStandardMaterial({ color: '#ed679d', roughness: 0.28, metalness: 0.02 }),
  sheep: new THREE.MeshStandardMaterial({ color: '#fff0d0', roughness: 0.62 }),
  cow: new THREE.MeshStandardMaterial({ color: '#fff0d0', roughness: 0.42 }),
  chicken: new THREE.MeshStandardMaterial({ color: '#f7c94f', roughness: 0.32, metalness: 0.01 }),
  duck: new THREE.MeshStandardMaterial({ color: '#a95c3a', roughness: 0.3, metalness: 0.01 }),
  goose: new THREE.MeshStandardMaterial({ color: '#fff0d0', roughness: 0.38 }),
  frog: new THREE.MeshStandardMaterial({ color: '#6ab84e', roughness: 0.3, metalness: 0.01 }),
  owl: new THREE.MeshStandardMaterial({ color: '#a9774b', roughness: 0.28, metalness: 0.01 }),
  raccoon: new THREE.MeshStandardMaterial({ color: '#8f949b', roughness: 0.3, metalness: 0.01 }),
  mouse: new THREE.MeshStandardMaterial({ color: '#c99a6b', roughness: 0.3, metalness: 0.01 }),
  rat: new THREE.MeshStandardMaterial({ color: '#7b7480', roughness: 0.3, metalness: 0.01 }),
  snake: new THREE.MeshStandardMaterial({ color: '#3f9e6e', roughness: 0.26, metalness: 0.01 }),
}
const HOOF_MATERIAL = new THREE.MeshStandardMaterial({ color: '#76505d', roughness: 0.31 })
const WILD_BALLOON_COLOR = new THREE.Color('#e53649')
const WILD_BALLOON_MATERIAL = new THREE.MeshPhysicalMaterial({
  name: 'Wild carnival balloon · uniform red mask',
  color: WILD_BALLOON_COLOR,
  roughness: 0.24,
  metalness: 0.015,
  clearcoat: 0.48,
  clearcoatRoughness: 0.17,
})

const STANDARD_MATERIALS = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>()
const WILD_MATERIALS = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>()
const TRANSITION_MATERIALS = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>()
const CAPTURE_MATERIAL_STATES = new WeakMap<THREE.Material, {
  readonly progress: { value: number }
  readonly bottom: { value: number }
  readonly top: { value: number }
}>()

interface CaptureVerticalRange {
  readonly bottom: number
  readonly top: number
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (Array.isArray(material)) material.forEach(disposeMaterial)
  else material?.dispose()
}

function disposeTemporaryMaterials(mesh: THREE.Mesh): void {
  // The wild mask is a process-wide immutable material shared by all meshes;
  // only per-animal transition materials are owned and disposed here.
  const transition = TRANSITION_MATERIALS.get(mesh)
  if (Array.isArray(transition)) transition.forEach((material) => CAPTURE_MATERIAL_STATES.delete(material))
  else if (transition) CAPTURE_MATERIAL_STATES.delete(transition)
  disposeMaterial(transition)
  WILD_MATERIALS.delete(mesh)
  TRANSITION_MATERIALS.delete(mesh)
}

function setAnimalAppearance(root: THREE.Object3D, appearance: AnimalAppearance): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (appearance === 'wild') {
      const currentWild = WILD_MATERIALS.get(object)
      if (currentWild && object.material === currentWild) return
      const originals = STANDARD_MATERIALS.get(object) ?? object.material
      STANDARD_MATERIALS.set(object, originals)
      disposeTemporaryMaterials(object)
      const wild = Array.isArray(originals) ? originals.map(() => WILD_BALLOON_MATERIAL) : WILD_BALLOON_MATERIAL
      WILD_MATERIALS.set(object, wild)
      object.material = wild
    } else {
      const originals = STANDARD_MATERIALS.get(object)
      if (originals) object.material = originals
      disposeTemporaryMaterials(object)
    }
  })
}

function createCaptureMaterial(source: THREE.Material, range: CaptureVerticalRange): THREE.MeshPhysicalMaterial {
  const standard = source as AnimalMaterial
  const material = source instanceof THREE.MeshPhysicalMaterial
    ? source.clone()
    : new THREE.MeshPhysicalMaterial().copy(source as THREE.MeshStandardMaterial)
  material.name = `${source.name || 'Animal material'} · paint-reveal transition`
  material.roughness = WILD_BALLOON_MATERIAL.roughness
  material.metalness = WILD_BALLOON_MATERIAL.metalness
  material.clearcoat = WILD_BALLOON_MATERIAL.clearcoat
  material.clearcoatRoughness = WILD_BALLOON_MATERIAL.clearcoatRoughness
  material.color.copy(standard.color ?? new THREE.Color('#ffffff'))
  const textured = source as THREE.MeshStandardMaterial
  material.map = textured.map ?? null
  material.alphaMap = textured.alphaMap ?? null

  const state = {
    progress: { value: 0 },
    bottom: { value: range.bottom },
    top: { value: Math.max(range.top, range.bottom + 0.001) },
  }
  const previousCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer)
    shader.uniforms.uCaptureProgress = state.progress
    shader.uniforms.uCaptureBottom = state.bottom
    shader.uniforms.uCaptureTop = state.top
    shader.uniforms.uCaptureWildColor = { value: WILD_BALLOON_COLOR }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying float vCaptureWorldY;
varying vec3 vCaptureWorldPosition;`)
      .replace('#include <project_vertex>', `vec4 captureWorldPosition = modelMatrix * vec4(transformed, 1.0);
vCaptureWorldY = captureWorldPosition.y;
vCaptureWorldPosition = captureWorldPosition.xyz;
#include <project_vertex>`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uCaptureProgress;
uniform float uCaptureBottom;
uniform float uCaptureTop;
uniform vec3 uCaptureWildColor;
varying float vCaptureWorldY;
varying vec3 vCaptureWorldPosition;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float captureHeight = clamp((vCaptureWorldY - uCaptureBottom) / max(uCaptureTop - uCaptureBottom, 0.001), 0.0, 1.0);
float captureEdge = 1.03 - uCaptureProgress * 1.06;
float captureNoise = (sin(vCaptureWorldPosition.x * 9.0 + vCaptureWorldPosition.z * 6.0) + sin(vCaptureWorldPosition.z * 13.0 - vCaptureWorldPosition.y * 5.0)) * 0.012;
float captureReveal = smoothstep(captureEdge - 0.035, captureEdge + 0.035, captureHeight + captureNoise);
float captureShimmer = 1.0 - smoothstep(0.012, 0.055, abs(captureHeight + captureNoise - captureEdge));
diffuseColor.rgb = mix(uCaptureWildColor, diffuseColor.rgb, captureReveal);
diffuseColor.rgb += vec3(0.055, 0.04, 0.025) * captureShimmer * (1.0 - uCaptureProgress);`)
  }
  material.customProgramCacheKey = () => 'balloon-paint-reveal-v1'
  CAPTURE_MATERIAL_STATES.set(material, state)
  return material
}

function setAnimalAppearanceProgress(root: THREE.Object3D, progress: number, range: CaptureVerticalRange): void {
  const amount = THREE.MathUtils.clamp(progress, 0, 1)
  if (amount >= 1) {
    setAnimalAppearance(root, 'standard')
    return
  }

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const originals = STANDARD_MATERIALS.get(object)
    if (!originals) return
    let transition = TRANSITION_MATERIALS.get(object)
    if (!transition) {
      transition = Array.isArray(originals)
        ? originals.map((material) => createCaptureMaterial(material, range))
        : createCaptureMaterial(originals, range)
      TRANSITION_MATERIALS.set(object, transition)
    }

    const sourceArray = Array.isArray(originals) ? originals : [originals]
    const transitionArray = Array.isArray(transition) ? transition : [transition]
    transitionArray.forEach((material, index) => {
      const state = CAPTURE_MATERIAL_STATES.get(material)
      if (state) {
        state.progress.value = amount
        state.bottom.value = range.bottom
        state.top.value = Math.max(range.top, range.bottom + 0.001)
      }
      const source = sourceArray[index] as AnimalMaterial
      const target = material as AnimalMaterial
      if (target.roughness !== undefined) {
        target.roughness = THREE.MathUtils.lerp(WILD_BALLOON_MATERIAL.roughness, source.roughness ?? 0.7, amount)
      }
      if (target.metalness !== undefined) {
        target.metalness = THREE.MathUtils.lerp(WILD_BALLOON_MATERIAL.metalness, source.metalness ?? 0.02, amount)
      }
      if (target.clearcoat !== undefined) {
        target.clearcoat = THREE.MathUtils.lerp(WILD_BALLOON_MATERIAL.clearcoat, source.clearcoat ?? 0, amount)
      }
      target.needsUpdate = true
    })
    object.material = transition
  })
}

function getLocalBounds(root: THREE.Group, object: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true)
  const inverseRoot = root.matrixWorld.clone().invert()
  const bounds = new THREE.Box3().makeEmpty()
  const localToRoot = new THREE.Matrix4()
  const point = new THREE.Vector3()

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
    const geometryBounds = child.geometry.boundingBox
    if (!geometryBounds) return
    localToRoot.multiplyMatrices(inverseRoot, child.matrixWorld)
    for (let mask = 0; mask < 8; mask += 1) {
      point.set(mask & 1 ? geometryBounds.max.x : geometryBounds.min.x, mask & 2 ? geometryBounds.max.y : geometryBounds.min.y, mask & 4 ? geometryBounds.max.z : geometryBounds.min.z)
        .applyMatrix4(localToRoot)
      bounds.expandByPoint(point)
    }
  })
  return bounds
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const animalAssetCache = new Map<string, Promise<AnimalGLTF>>()

function loadModel(url: string): Promise<AnimalGLTF> {
  const existing = animalAssetCache.get(url)
  if (existing) return existing
  const loading = new Promise<AnimalGLTF>((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => resolve(gltf as AnimalGLTF), undefined, reject)
  })
  animalAssetCache.set(url, loading)
  void loading.catch(() => {
    if (animalAssetCache.get(url) === loading) animalAssetCache.delete(url)
  })
  return loading
}

function makePlaceholder(parent: THREE.Group, id: BalloonAnimalId): void {
  const color = BODY_MATERIALS[id]
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 24), color)
  body.scale.set(1.3, 0.92, 0.82)
  body.position.set(0, 0.96, 0)
  body.castShadow = true
  parent.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 24), color)
  head.position.set(0.78, 1.42, 0)
  head.castShadow = true
  parent.add(head)
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), color)
  snout.position.set(1.12, 1.27, 0)
  parent.add(snout)
  for (const [x, z] of [[-0.56, -0.42], [0.48, -0.42], [-0.56, 0.42], [0.48, 0.42]]) {
    const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), HOOF_MATERIAL)
    hoof.position.set(x, 0.14, z)
    hoof.castShadow = true
    parent.add(hoof)
  }
}

export async function createBalloonAnimal(parent: THREE.Group, options: BalloonAnimalOptions): Promise<BalloonAnimal> {
  const wrapper = new THREE.Group()
  wrapper.name = `Balloon ${options.name} · wandering character`
  wrapper.scale.setScalar(options.growthScale ?? 1)
  const instanceId = options.instanceId ?? options.id
  wrapper.position.set(options.spawn[0], options.groundY, options.spawn[1])
  parent.add(wrapper)

  const posePivot = new THREE.Group()
  posePivot.name = `${options.name} · capture flourish pivot`
  wrapper.add(posePivot)

  // Eased ground height so stepping over dug mounds reads as a gentle bob.
  let groundYCurrent = options.groundY

  let loaded: LoadedAnimal | null = null
  let modelRoot: THREE.Group | null = null
  let gltf: AnimalGLTF | null = null
  let modelLoading: Promise<void> | null = null
  let placeholderLoaded = false
  let appearance = options.appearance ?? 'wild'
  let active: AnimalClip = options.wandering === false ? 'IDLE' : 'WALK'
  let romanceSeconds = 0
  let elapsed = 0
  let nextDecision = 0
  let paused = 0
  let captured = false
  let sold = false
  let romancing = false
  let focused = false
  let alarmed = false
  let flightRate = 1
  let sleepSpot: SleepSpot | null = null
  let homeTrip: { readonly x: number; readonly z: number } | null = null
  let homeTripSpeed = 1
  let pursuit: { readonly x: number; readonly z: number; readonly speedScale: number } | null = null
  let atDoor = false
  let sleepBlend = 0
  let asleep = false
  const sleepFacing = new THREE.Quaternion()
  const sleepYaw = new THREE.Vector3(0, 1, 0)
  let flightVisible = !options.flier
  const alarmScale = (): number => (alarmed ? 2.2 : 1)
  const hasSleepClip = (): boolean => Boolean(loaded?.actions.has('SLEEP'))
  /** Ease the crouch in or out and breathe; only the pivot is touched, never the wrapper. */
  const applySleepPose = (delta: number): void => {
    sleepBlend = THREE.MathUtils.clamp(sleepBlend + (asleep ? delta : -delta * 1.5) / 1.4, 0, 1)
    const eased = sleepBlend * sleepBlend * (3 - 2 * sleepBlend)
    // A species with a SLEEP clip lies down by itself; only the others are crouched in code.
    if (hasSleepClip()) return
    const breath = Math.sin(elapsed * 1.7) * 0.018 * eased
    const squash = 1 - 0.26 * eased + breath
    posePivot.scale.set(1 + 0.07 * eased, squash, 1 + 0.07 * eased)
    // Keep the paws on the grass: scaling about the pivot would otherwise lift the model.
    posePivot.position.set(pivotBasePosition.x, pivotBasePosition.y * squash, pivotBasePosition.z)
  }
  let detailActive = false
  let pendingCapture = false
  const stableAnimationPhase = seededRandom(options.seed ^ 0x51f15e)() * Math.PI * 2
  let capture: CapturePresentation | null = null
  let captureVerticalRange: CaptureVerticalRange | null = null
  let lastCaptureProgress = 0
  const pivotBasePosition = new THREE.Vector3()
  const pivotBaseRotation = new THREE.Euler()
  const target = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const romanceTarget = new THREE.Vector3()
  const romanceDirection = new THREE.Vector3()
  const modelForward = new THREE.Vector3(1, 0, 0)
  const random = seededRandom(options.seed)
  const upAxis = new THREE.Vector3(0, 1, 0)
  let stage: AnimalStage = options.stage ?? 1
  wrapper.userData.animalInstanceId = instanceId

  const ensureDetailedModel = (): Promise<void> => {
    if (loaded || placeholderLoaded) return Promise.resolve()
    if (modelLoading) return modelLoading
    modelLoading = (async () => {
      try {
        const asset = await loadModel(options.assetUrl)
        gltf = asset
        // Parsed geometry/textures are shared per species; only the hierarchy
        // and mixer are cloned when this particular animal enters close LOD.
        modelRoot = asset.scene.clone(true) as THREE.Group
        modelRoot.name = `Original balloon ${options.name} · Blender GLB clone`
        const dimensions = new THREE.Box3().setFromObject(modelRoot).getSize(new THREE.Vector3())
        const longestSide = Math.max(dimensions.x, dimensions.y, dimensions.z)
        if (!Number.isFinite(longestSide) || longestSide < 0.1) throw new Error('GLB has no measurable geometry')
        modelRoot.scale.setScalar(options.size / longestSide)
        modelRoot.position.set(0, 0, 0)
        modelRoot.rotation.set(0, 0, 0)
        modelRoot.updateMatrixWorld(true)
        const initialBounds = new THREE.Box3().setFromObject(modelRoot)
        const modelCenter = initialBounds.getCenter(new THREE.Vector3())
        modelRoot.position.set(-modelCenter.x, -initialBounds.min.y, -modelCenter.z)
        modelRoot.updateMatrixWorld(true)
        const mixer = new THREE.AnimationMixer(modelRoot)
        const actions = new Map<AnimalClip, THREE.AnimationAction>()
        for (const clip of asset.animations) {
          const normalizedName = clip.name.toUpperCase()
          const kind = normalizedName.includes('WALK') ? 'WALK' : normalizedName.includes('IDLE') ? 'IDLE' : normalizedName.includes('SLEEP') ? 'SLEEP' : null
          if (kind) actions.set(kind, mixer.clipAction(clip))
        }
        loaded = { gltf: asset, root: modelRoot, mixer, actions, activeAnimation: null }
        posePivot.add(modelRoot)
        wrapper.updateMatrixWorld(true)
        const animalBounds = getLocalBounds(wrapper, modelRoot)
        const center = animalBounds.getCenter(new THREE.Vector3())
        posePivot.position.copy(center)
        modelRoot.position.sub(center)
        wrapper.updateMatrixWorld(true)
        // Ground on the lowest point the clips reach, not the bind pose (see lowestClipPoseY).
        const detailRoot: THREE.Group = modelRoot
        posePivot.position.y -= lowestClipPoseY(detailRoot, mixer, asset.animations, () => getLocalBounds(wrapper, detailRoot).min.y)
        if (options.flier) {
          // A flier has to sit exactly on its perch, so ground the pose it will
          // actually wear: the clips lift the rig to its standing height, which the
          // static model does not show.
          const perched = actions.get('IDLE')
          if (perched) {
            perched.reset().play()
            mixer.update(0)
            wrapper.updateMatrixWorld(true)
            posePivot.position.y -= getLocalBounds(wrapper, modelRoot).min.y
            perched.stop()
          }
        }
        pivotBasePosition.copy(posePivot.position)
        pivotBaseRotation.copy(posePivot.rotation)
        modelRoot.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = false
            object.receiveShadow = false
          }
        })
        if (appearance === 'wild') setAnimalAppearance(modelRoot, 'wild')
        if (stage >= 4) setHeartEyes(modelRoot)
        if (active !== 'IDLE' || options.wandering === false) {
          const action = actions.get(active)
          if (action) action.play()
        }
        mixer.setTime(elapsed)
        if (!detailActive) posePivot.remove(modelRoot)
        console.info(`[Animal Balloon Farm] ${options.name} asset`, JSON.stringify({
          dimensions: dimensions.toArray().map((value) => Number(value.toFixed(2))),
          clips: asset.animations.map(({ name, duration }) => ({ name, duration: Number(duration.toFixed(2)) })),
        }))
      } catch (error) {
        console.error(`[Animal Balloon Farm] Could not load ${options.assetUrl}`, error)
        modelRoot = posePivot
        makePlaceholder(posePivot, options.id)
        const placeholderBounds = getLocalBounds(wrapper, posePivot)
        posePivot.position.copy(placeholderBounds.getCenter(new THREE.Vector3()))
        posePivot.children.forEach((child) => child.position.sub(posePivot.position))
        const groundedBounds = getLocalBounds(wrapper, posePivot)
        posePivot.position.y -= groundedBounds.min.y
        pivotBasePosition.copy(posePivot.position)
        placeholderLoaded = true
        setAnimalAppearance(posePivot, appearance)
      }
      if (detailActive) wrapper.visible = stage > 0 && !sold
      options.onDetailedModelReady?.()
      if (pendingCapture) {
        pendingCapture = false
        appearance = 'wild'
        beginCapture()
      }
    })().finally(() => { modelLoading = null })
    return modelLoading
  }
  let travelRoute: AnimalTravelRoute | null = null
  let travelDirection: 'enter' | 'leave' | null = null
  let travelCooldown = 0
  let travelSide: 'carnival' | 'farm' = stage >= 2 ? 'farm' : 'carnival'
  /**
   * A settle that arrives while the visitor is still out at the tents is a
   * promise, not yet a fact. The rung stays at 2 -- so the animal keeps its
   * visitor leash and walks in -- and the promotion is applied once it has
   * actually been browsing the plot for a while.
   */
  const RESIDENT_DWELL_SECONDS = 4
  const RESIDENT_INSIDE_MARGIN = 0.6
  let pendingResidentStage: AnimalStage | null = null
  let farmDwellSeconds = 0

  /** Inside the plot proper: not mid-route, and comfortably past the boundary. */
  function insideFarmPlot(): boolean {
    if (travelRoute !== null) return false
    const bounds = options.getGardenBounds?.() ?? FARM_EXPANSION_CONFIG.startBounds
    return containsFarmPoint(wrapper.position.x, wrapper.position.z, bounds, RESIDENT_INSIDE_MARGIN)
  }

  /**
   * How long a visitor stays on a side of the gate. A visitor pokes its head
   * into the plot and ambles back out, so its time inside is short; the time
   * out at the tents is longer so visits read as comings and goings.
   */
  function visitCooldown(side: 'carnival' | 'farm'): number {
    if (stage >= 3) return 28 + random() * 18
    return side === 'farm' ? 4.5 + random() * 3.5 : 9 + random() * 8
  }

  function beginTravel(direction: 'enter' | 'leave'): void {
    // Fliers cross the fence by air; there is no gate route for them.
    if (options.flier) {
      travelSide = direction === 'enter' ? 'farm' : 'carnival'
      return
    }
    const bounds = options.getGardenBounds?.() ?? FARM_EXPANSION_CONFIG.startBounds
    if (direction === 'enter' && containsFarmPoint(wrapper.position.x, wrapper.position.z, bounds)) {
      // A carnival wanderer may already have crossed the open ground before
      // its timed visit arrives; never send it back out just to re-enter.
      travelSide = 'farm'
      travelDirection = null
      travelRoute = null
      travelCooldown = visitCooldown('farm')
      return
    }
    if (direction === 'enter') travelSide = 'carnival'
    travelDirection = direction
    travelRoute = createAnimalTravelRoute(direction, bounds, { x: wrapper.position.x, z: wrapper.position.z })
    const first = travelRoute.waypoints[travelRoute.nextWaypoint]
    target.set(first.x, 0, first.z)
    nextDecision = 0
    paused = 0
    setAnimation('WALK', 0.22)
  }

  /** True while this animal lives out at the tents instead of inside the fence. */
  const isCarnivalSide = (): boolean => Boolean(options.isLoose?.())
    || travelSide === 'carnival' || travelDirection !== null

  /**
   * Where this animal is allowed to be right now.
   *
   * At the carnival it is loose and roams a wide ring around the tents. Once it
   * has visited the farm it is fenced to the plot, so "visiting the farm"
   * becomes something you can see happen rather than a flag flipping.
   */
  function leash(): { readonly x: number; readonly z: number } {
    const gardenBounds = options.getGardenBounds?.()
    if (isCarnivalSide()) {
      const carnival = options.carnivalBounds ?? { x: 30, z: 30 }
      // The carnival is a ring around the plot, not a fixed patch of meadow: as
      // the farm grows its props slide outward, and the pen they sit in has to
      // come with them or a grown plot would swallow the whole midway.
      return {
        x: Math.max(carnival.x, (gardenBounds?.halfWidth ?? FARM_EXPANSION_CONFIG.startBounds.halfWidth) + CARNIVAL_RING_OFFSET.x),
        z: Math.max(carnival.z, (gardenBounds?.halfDepth ?? FARM_EXPANSION_CONFIG.startBounds.halfDepth) + CARNIVAL_RING_OFFSET.z),
      }
    }
    const expansionX = Math.max(0, (gardenBounds?.halfWidth ?? FARM_EXPANSION_CONFIG.startBounds.halfWidth) - FARM_EXPANSION_CONFIG.startBounds.halfWidth)
    const expansionZ = Math.max(0, (gardenBounds?.halfDepth ?? FARM_EXPANSION_CONFIG.startBounds.halfDepth) - FARM_EXPANSION_CONFIG.startBounds.halfDepth)
    const halfWidth = Math.min(options.bounds.x + expansionX, Math.max(0, (gardenBounds?.halfWidth ?? options.bounds.x) - 1.2))
    const halfDepth = Math.min(options.bounds.z + expansionZ, Math.max(0, (gardenBounds?.halfDepth ?? options.bounds.z) - 1.2))
    return { x: halfWidth, z: halfDepth }
  }

  const chooseTarget = (): void => {
    const angle = random() * Math.PI * 2
    const radius = (alarmed ? 4.2 : 2.4) + random() * 5.8
    const limits = leash()
    let nextX = THREE.MathUtils.clamp(wrapper.position.x + Math.cos(angle) * radius, -limits.x, limits.x)
    let nextZ = THREE.MathUtils.clamp(wrapper.position.z + Math.sin(angle) * radius * 0.62, -limits.z, limits.z)
    if (isCarnivalSide()) {
      // Walk targets stay outside the fence too, so a carnival animal never
      // presses against the wall trying to reach a spot it cannot enter.
      const cleared = clearOfFarmBounds(
        { x: nextX, z: nextZ },
        options.getGardenBounds?.() ?? FARM_EXPANSION_CONFIG.startBounds,
      )
      nextX = cleared.x
      nextZ = cleared.z
    }
    if (!isCarnivalSide()) {
      const clamped = clampToFarm(nextX, nextZ, options.getGardenBounds?.() ?? FARM_EXPANSION_CONFIG.startBounds, 1.2)
      nextX = clamped.x
      nextZ = clamped.z
    }
    target.set(nextX, 0, nextZ)
    nextDecision = alarmed ? 0.7 + random() * 0.9 : 2 + random() * 2.4
  }

  const setAnimation = (name: AnimalClip, fadeSeconds = 0.22): void => {
    if (active === name && (!loaded || loaded.activeAnimation === name)) return
    active = name
    if (!loaded || !detailActive) return
    const next = loaded.actions.get(name)
    if (!next) return
    const previous = loaded.activeAnimation ? loaded.actions.get(loaded.activeAnimation) : undefined
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fadeSeconds).play()
    previous?.fadeOut(fadeSeconds)
    loaded.activeAnimation = name
  }

  chooseTarget()

  const pauseDurations = { min: 0.45, max: 1.25 }
  const beginCapture = (): boolean => {
    if (sold || capture || pendingCapture || appearance !== 'wild') return false
    if (!loaded && !placeholderLoaded) {
      pendingCapture = true
      focused = true
      void ensureDetailedModel()
      return true
    }
    captured = true
    appearance = 'standard'
    lastCaptureProgress = 0
    const bounds = getLocalBounds(posePivot, modelRoot ?? posePivot)
    const worldBounds = new THREE.Box3().setFromObject(modelRoot ?? posePivot)
    captureVerticalRange = { bottom: worldBounds.min.y, top: worldBounds.max.y }
    // Initialize at progress zero so the animal stays glossy red until paint reaches it.
    setAnimalAppearanceProgress(modelRoot ?? posePivot, 0, captureVerticalRange)
    capture = createCapturePresentation(posePivot, wrapper, modelRoot, options.id, bounds, options.seed)
    focused = true
    setAnimation('IDLE', 0.22)
    paused = 0
    nextDecision = 0
    console.info(`[Animal Balloon Farm] ${options.name} capture flourish started`)
    return true
  }
  const setAppearance = (nextAppearance: AnimalAppearance): void => {
    if (pendingCapture && nextAppearance === 'standard') return
    if (appearance === nextAppearance) return
    appearance = nextAppearance
    if (!modelRoot) return
    if (capture) {
      capture.dispose()
      capture = null
      captureVerticalRange = null
      posePivot.position.copy(pivotBasePosition)
      posePivot.rotation.copy(pivotBaseRotation)
    }
    setAnimalAppearance(modelRoot ?? posePivot, nextAppearance)
    appearance = nextAppearance
    if (nextAppearance === 'wild') {
      captured = false
      lastCaptureProgress = 0
    } else {
      captured = true
      lastCaptureProgress = 1
    }
  }

  /**
   * The heart-eyes half of the last condition. Kept separate from
   * `setAppearance` because it is keyed on the GLB's node names and has to be
   * reversible: the harness demotes a species to re-run the transition.
   */
  const applyHeartEyes = (wanted: boolean): void => {
    const root = modelRoot ?? posePivot
    if (wanted) {
      const converted = setHeartEyes(root)
      if (converted === 0) console.warn(`[Animal Balloon Farm] ${options.name} has no pupil nodes to convert to hearts`)
    } else {
      clearHeartEyes(root)
    }
  }

  /**
   * Move an animal to a rung of the condition ladder.
   *
   * The wild -> standard change reuses the existing 6.8s paint-reveal flourish
   * as its transition animation, because that flourish was already exactly
   * "this creature is committing to the farm" and rebuilding it would have
   * thrown away reviewed work. Reaching the final rung swaps the black pupils
   * for hearts, which is the only visual change in the game that is not a
   * material mask.
   */
  const setStage = (next: AnimalStage): void => {
    // A demotion cancels residency that was still waiting for the walk inside.
    if (next < 3) {
      pendingResidentStage = null
      farmDwellSeconds = 0
    }
    if (next === stage) return
    const previous = stage
    const becomingResident = next >= 3 && stage < 3
    const becomingWild = next <= 2 && stage >= 3
    if (previous < 2 && next === 2) beginTravel('enter')
    if (previous < 3 && next >= 3 && travelSide === 'carnival' && travelDirection !== 'enter') {
      beginTravel('enter')
    }
    if (previous >= 3 && next < 2) {
      travelRoute = null
      travelDirection = null
      travelSide = 'farm'
    }
    if (next >= 3 && stage < 3 && !insideFarmPlot()) {
      // The condition ladder has decided; only the arrival waits. Leaving the
      // rung at 2 is what keeps the animal walking in as a visitor instead of
      // donning residence while it is still out on the meadow.
      if (pendingResidentStage === null) farmDwellSeconds = 0
      pendingResidentStage = next
      return
    }
    if (becomingResident) {
      // Play the reveal. beginCapture refuses while another is running, which
      // is what we want: a second settle arriving mid-flourish should queue on
      // the next stage change rather than snap.
      if (beginCapture()) {
        stage = next
        applyHeartEyes(stageHasHeartEyes(next))
        return
      }
    }
    if (becomingWild) setAppearance('wild')
    else if (next >= 3) setAppearance('standard')
    stage = next
    applyHeartEyes(stageHasHeartEyes(next))
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (sold || options.captureOnClick === false || event.button !== 0 || event.detail >= 2
      || options.isPointerBlocked?.(event.clientX, event.clientY)
      || (captured && !options.replayCaptureOnClick)) return
    const bounds = options.canvas.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, options.camera)
    const hit = raycaster.intersectObjects([wrapper], true)[0]
    if (!hit) return
    if (captured && options.replayCaptureOnClick) setAppearance('wild')
    if (!beginCapture()) return
    event.preventDefault()
  }

  options.canvas.addEventListener('pointerdown', onPointerDown)

  return {
    id: options.id,
    instanceId,
    root: wrapper,
    get isSold(): boolean { return sold },
    get hasDetailedModel(): boolean { return Boolean(loaded || placeholderLoaded) },
    get currentPosition(): THREE.Vector3 { return wrapper.position },
    get currentHeading(): number { return wrapper.rotation.y },
    get currentScale(): number { return wrapper.scale.x },
    get renderPriority(): number {
      return (focused ? 100 : 0) + (capture ? 90 : 0) + (romancing ? 80 : 0) + (stage >= 3 ? 10 : 0)
    },
    get isRomancing(): boolean { return romancing },
    get isFlier(): boolean { return Boolean(options.flier) },
    get flightVisible(): boolean { return flightVisible },
    get isAlarmed(): boolean { return alarmed },
    get isSleeping(): boolean { return asleep },
    get isAtDoor(): boolean { return atDoor },
    get isGoingHome(): boolean { return homeTrip !== null },
    nudge(dx: number, dz: number): void {
      if (options.flier || sold) return
      wrapper.position.x += dx
      wrapper.position.z += dz
    },
    setHomeTrip(door, speedScale = 1): void {
      if (options.flier) return
      homeTrip = door
      homeTripSpeed = door && Number.isFinite(speedScale) && speedScale > 0 ? speedScale : 1
      atDoor = false
      if (loaded) loaded.mixer.timeScale = homeTripSpeed > 1 ? Math.min(3, homeTripSpeed) : alarmScale()
    },
    setPursuit(next): void {
      if (options.flier) return
      if (pursuit && !next) {
        // Back to wandering: pick a fresh spot rather than the one from before the chase.
        paused = 0
        nextDecision = 0
        if (loaded) loaded.mixer.timeScale = alarmScale()
      }
      pursuit = next
    },
    placeAt(x: number, z: number): void {
      if (options.flier) return
      travelRoute = null
      wrapper.position.x = x
      wrapper.position.z = z
      if (options.groundSampler) {
        groundYCurrent = options.groundY + options.groundSampler(x, z)
        wrapper.position.y = groundYCurrent
      }
      paused = 0
      nextDecision = 0
      wrapper.updateMatrixWorld(true)
    },
    setSleepSpot(spot: SleepSpot | null): void {
      if (options.flier) return
      sleepSpot = spot
      if (!spot) asleep = false
    },
    setAlarmed(next: boolean): void {
      if (options.flier || alarmed === next) return
      alarmed = next
      if (next) {
        paused = 0
        nextDecision = 0
      }
      if (loaded) loaded.mixer.timeScale = next ? 2.2 : 1
    },
    setFlightPose(pose: FlightPose): void {
      if (!options.flier || sold) return
      flightVisible = pose.visible
      wrapper.position.set(pose.x, pose.y, pose.z)
      wrapper.rotation.set(0, pose.heading, 0)
      if (!capture) posePivot.rotation.z = pivotBaseRotation.z - pose.pitch
      flightRate = pose.rate
      if (!capture) posePivot.scale.setScalar(Math.max(0.35, pose.puff ?? 1))
      if (loaded) loaded.mixer.timeScale = flightRate
      setAnimation(pose.clip, 0.3)
    },
    get isLoose(): boolean { return Boolean(options.isLoose?.()) },
    get animationPhase(): number { return stableAnimationPhase },
    setDetailedVisible(visible: boolean): void {
      detailActive = visible && !sold && stage > 0
      if (detailActive) {
        if (loaded && modelRoot && modelRoot.parent !== posePivot) posePivot.add(modelRoot)
        void ensureDetailedModel()
        if (loaded) {
          const action = loaded.actions.get(active)
          if (action && loaded.activeAnimation !== active) {
            action.reset().play()
            loaded.activeAnimation = active
            loaded.mixer.setTime(elapsed)
          }
        }
      } else if (loaded && modelRoot?.parent === posePivot && !capture) {
        posePivot.remove(modelRoot)
      }
      wrapper.visible = detailActive && Boolean(loaded || placeholderLoaded)
    },
    get canSell(): boolean {
      return canSellAnimal({ sold, captured, capturing: capture !== null || pendingCapture, stage, appearance })
    },
    sell(): boolean {
      if (!canSellAnimal({ sold, captured, capturing: capture !== null, stage, appearance })) return false
      sold = true
      focused = false
      wrapper.visible = false
      return true
    },
    get gltf(): AnimalGLTF | null { return gltf },
    eyeColor: options.eyeColor ?? BODY_MATERIALS[options.id].color.getHexString(),
    get heartEyeCount(): number { return countHeartEyes(modelRoot ?? posePivot) },
    setGrowth(scale: number): void { wrapper.scale.setScalar(Math.max(0.1, Math.min(1, scale))) },
    setRomancing(active: boolean, partnerPosition?: THREE.Vector3): void {
      if (active) {
        if (partnerPosition) romanceTarget.copy(partnerPosition)
        if (romancing) return
        romancing = true
        focused = true
        romanceSeconds = 0
        setAnimation('IDLE', 0.16)
        paused = Number.POSITIVE_INFINITY
        nextDecision = Number.POSITIVE_INFINITY
        return
      }
      if (!romancing) return
      romancing = false
      focused = capture !== null
      paused = 0
      posePivot.position.copy(pivotBasePosition)
      posePivot.rotation.copy(pivotBaseRotation)
      nextDecision = 0
      chooseTarget()
    },
    setAnimation,
    setAppearance,
    beginCapture,
    get isCaptured(): boolean { return captured },
    get isCapturing(): boolean { return pendingCapture || Boolean(capture && !capture.finished) },
    get captureProgress(): number { return lastCaptureProgress },
    get appearance(): AnimalAppearance { return appearance },
    get isAtFarm(): boolean { return travelSide === 'farm' && travelRoute === null },
    get isResidencyPending(): boolean { return pendingResidentStage !== null },
    get stage(): AnimalStage { return stage },
    set stage(next: AnimalStage) { setStage(next) },
    update(deltaSeconds): void {
      if (sold) return
      const delta = Math.min(deltaSeconds, 0.05)
      elapsed += delta
      if (pendingResidentStage !== null) {
        if (insideFarmPlot()) {
          farmDwellSeconds += delta
          if (farmDwellSeconds >= RESIDENT_DWELL_SECONDS) {
            const next = pendingResidentStage
            pendingResidentStage = null
            farmDwellSeconds = 0
            setStage(next)
          }
        } else {
          // Still out on the meadow: the clock restarts, so the animal has to
          // spend the dwell time actually inside before residence sticks.
          farmDwellSeconds = 0
        }
      }
      if (capture) {
        if (!loaded && !placeholderLoaded && !modelLoading) void ensureDetailedModel()
        if (detailActive) loaded?.mixer.update(delta)
        const pose = capture.update(delta)
        posePivot.rotation.set(
          pivotBaseRotation.x + pose.roll,
          pivotBaseRotation.y + pose.yaw,
          pivotBaseRotation.z + pose.pitch,
        )
        posePivot.position.set(pivotBasePosition.x, pivotBasePosition.y + pose.lift, pivotBasePosition.z)
        lastCaptureProgress = pose.fill
        if (captureVerticalRange) setAnimalAppearanceProgress(modelRoot ?? posePivot, pose.fill, captureVerticalRange)
        if (capture.finished) {
          capture.dispose()
          capture = null
          captureVerticalRange = null
          lastCaptureProgress = 1
          focused = romancing
          posePivot.position.copy(pivotBasePosition)
          posePivot.rotation.copy(pivotBaseRotation)
        }
        return
      }

      if (options.flier) {
        // The predator sim owns the position; all that is left is the wing cycle.
        if (loaded) loaded.mixer.timeScale = flightRate
        if (detailActive) loaded?.mixer.update(delta)
        return
      }

      if (romancing) {
        romanceSeconds += delta
        romanceDirection.set(romanceTarget.x - wrapper.position.x, 0, romanceTarget.z - wrapper.position.z)
        const distance = romanceDirection.length()
        if (distance > 1.35) {
          romanceDirection.normalize()
          wrapper.position.addScaledVector(romanceDirection, Math.min(options.speed * 0.45 * delta, distance - 1.35))
        }
        if (romanceDirection.lengthSq() > 1e-8) {
          const facing = new THREE.Quaternion().setFromUnitVectors(modelForward, romanceDirection.normalize())
          wrapper.quaternion.slerp(facing, 1 - Math.exp(-4 * delta))
        }
        if (options.groundSampler) {
          const targetY = options.groundY + options.groundSampler(wrapper.position.x, wrapper.position.z)
          groundYCurrent += (targetY - groundYCurrent) * (1 - Math.exp(-8 * delta))
          wrapper.position.y = groundYCurrent
        }
        posePivot.rotation.y = pivotBaseRotation.y + Math.sin(romanceSeconds * 7.5) * 0.3
        posePivot.position.y = pivotBasePosition.y + Math.sin(romanceSeconds * 15) * 0.11
        if (detailActive) loaded?.mixer.update(delta)
        return
      }
      if (homeTrip) {
        direction.set(homeTrip.x - wrapper.position.x, 0, homeTrip.z - wrapper.position.z)
        const distance = direction.length()
        if (distance > 0.25) {
          direction.normalize()
          const facing = new THREE.Quaternion().setFromUnitVectors(modelForward, direction)
          wrapper.quaternion.slerp(facing, 1 - Math.exp(-4.5 * delta))
          wrapper.position.addScaledVector(direction, Math.min(options.speed * homeTripSpeed * delta, distance))
          setAnimation('WALK', 0.24)
        } else {
          atDoor = true
          setAnimation('IDLE', 0.3)
        }
        if (detailActive) loaded?.mixer.update(delta)
        if (options.groundSampler) {
          const targetY = options.groundY + options.groundSampler(wrapper.position.x, wrapper.position.z)
          groundYCurrent += (targetY - groundYCurrent) * (1 - Math.exp(-8 * delta))
          wrapper.position.y = groundYCurrent
        }
        wrapper.updateMatrixWorld(true)
        return
      }
      if (pursuit) {
        direction.set(pursuit.x - wrapper.position.x, 0, pursuit.z - wrapper.position.z)
        const distance = direction.length()
        const speed = options.speed * pursuit.speedScale
        if (speed > 0 && distance > 0.05) {
          direction.normalize()
          const facing = new THREE.Quaternion().setFromUnitVectors(modelForward, direction)
          // A lunge snaps round to face the prey; a stalk turns smoothly.
          wrapper.quaternion.slerp(facing, 1 - Math.exp(-(pursuit.speedScale > 3 ? 14 : 5) * delta))
          wrapper.position.addScaledVector(direction, Math.min(speed * delta, distance))
          setAnimation('WALK', 0.18)
          // Creeping is a slow ripple; a lunge whips the body through it.
          if (loaded) loaded.mixer.timeScale = Math.max(0.6, pursuit.speedScale * 0.55)
        } else {
          setAnimation('IDLE', 0.3)
          if (loaded) loaded.mixer.timeScale = 0.6
        }
        if (detailActive) loaded?.mixer.update(delta)
        if (options.groundSampler) {
          const targetY = options.groundY + options.groundSampler(wrapper.position.x, wrapper.position.z)
          groundYCurrent += (targetY - groundYCurrent) * (1 - Math.exp(-8 * delta))
          wrapper.position.y = groundYCurrent
        }
        wrapper.updateMatrixWorld(true)
        return
      }
      if (sleepSpot) {
        direction.set(sleepSpot.x - wrapper.position.x, 0, sleepSpot.z - wrapper.position.z)
        const distance = direction.length()
        if (distance > 0.12) {
          // Walk to the bed. A sleeper that was nudged away gets up and goes back.
          asleep = false
          direction.normalize()
          sleepFacing.setFromUnitVectors(modelForward, direction)
          wrapper.quaternion.slerp(sleepFacing, 1 - Math.exp(-4.5 * delta))
          wrapper.position.addScaledVector(direction, Math.min(options.speed * 0.8 * delta, distance))
          setAnimation('WALK', 0.24)
        } else {
          asleep = true
          sleepFacing.setFromAxisAngle(sleepYaw, sleepSpot.heading)
          wrapper.quaternion.slerp(sleepFacing, 1 - Math.exp(-3 * delta))
          setAnimation(hasSleepClip() ? 'SLEEP' : 'IDLE', 0.6)
        }
        if (loaded) loaded.mixer.timeScale = asleep ? (hasSleepClip() ? 0.5 : 0.3) : 1
        applySleepPose(delta)
        if (detailActive) loaded?.mixer.update(delta)
        if (options.groundSampler) {
          const targetY = options.groundY + options.groundSampler(wrapper.position.x, wrapper.position.z)
          groundYCurrent += (targetY - groundYCurrent) * (1 - Math.exp(-8 * delta))
          wrapper.position.y = groundYCurrent
        }
        wrapper.updateMatrixWorld(true)
        return
      }
      if (sleepBlend > 0) {
        // Waking: stand back up before wandering off.
        if (loaded) loaded.mixer.timeScale = alarmed ? 2.2 : 1
        applySleepPose(delta)
      }

      if (options.wandering === false) {
        if (detailActive) loaded?.mixer.update(delta)
        return
      }

      if (paused > 0 && Number.isFinite(paused)) {
        paused = Math.max(0, paused - delta)
        if (paused === 0) nextDecision = 0
      } else {
        nextDecision -= delta
      }

      if (travelRoute) {
        const previousPosition = wrapper.position.clone()
        const step = advanceAnimalTravel(
          { x: wrapper.position.x, z: wrapper.position.z },
          travelRoute,
          options.speed * alarmScale() * delta,
        )
        wrapper.position.set(step.position.x, wrapper.position.y, step.position.z)
        direction.set(step.position.x - previousPosition.x, 0, step.position.z - previousPosition.z)
        if (direction.lengthSq() > 1e-8) {
          direction.normalize()
          const targetFacing = new THREE.Quaternion().setFromUnitVectors(modelForward, direction)
          wrapper.quaternion.slerp(targetFacing, 1 - Math.exp(-4.5 * delta))
          setAnimation('WALK', 0.24)
        }
        travelRoute = step.route
        if (step.completed) {
          const completedDirection = travelDirection
          travelSide = completedDirection === 'leave' ? 'carnival' : 'farm'
          travelDirection = null
          travelCooldown = canAnimalLeaveFarm(stage) ? visitCooldown(travelSide) : 0
          target.set(wrapper.position.x, 0, wrapper.position.z)
          setAnimation('IDLE', 0.22)
        }
      } else {
        // Only stage-two visitors browse both sides of the gate. Settled
        // residents stay inside; the visitor's bounds change only after a
        // route has carried it through the entrance.
        if (canAnimalLeaveFarm(stage) && travelCooldown > 0) {
          travelCooldown = Math.max(0, travelCooldown - delta)
          if (travelCooldown === 0) beginTravel(travelSide === 'farm' ? 'leave' : 'enter')
        }
        const limits = leash()
        wrapper.position.x = THREE.MathUtils.clamp(wrapper.position.x, -limits.x, limits.x)
        wrapper.position.z = THREE.MathUtils.clamp(wrapper.position.z, -limits.z, limits.z)
        if (!isCarnivalSide()) {
          const clamped = clampToFarm(wrapper.position.x, wrapper.position.z, options.getGardenBounds?.() ?? FARM_EXPANSION_CONFIG.startBounds, 1.2)
          wrapper.position.x = clamped.x
          wrapper.position.z = clamped.z
        }
        if (isCarnivalSide()) {
          // The farm can grow over a carnival animal's footing, and the fence is
          // not a door: step back onto the meadow rather than stand inside the
          // walls waiting for a visit that has not been earned.
          const cleared = clearOfFarmBounds(
            { x: wrapper.position.x, z: wrapper.position.z },
            options.getGardenBounds?.() ?? FARM_EXPANSION_CONFIG.startBounds,
          )
          wrapper.position.x = cleared.x
          wrapper.position.z = cleared.z
        }
        direction.subVectors(target, wrapper.position)
        direction.y = 0
        const distance = direction.length()
        if (paused <= 0) {
          if (distance < 0.48 || nextDecision <= 0) {
            if (active !== 'IDLE' && !alarmed) {
              setAnimation('IDLE', 0.28)
              paused = pauseDurations.min + random() * (pauseDurations.max - pauseDurations.min)
              nextDecision = 0
            } else {
              chooseTarget()
            }
          } else {
            direction.normalize()
            const targetFacing = new THREE.Quaternion().setFromUnitVectors(modelForward, direction)
            wrapper.quaternion.slerp(targetFacing, 1 - Math.exp(-4.5 * delta))
            wrapper.position.addScaledVector(direction, Math.min(options.speed * alarmScale() * delta, distance))
            setAnimation('WALK', 0.24)
          }
        }
      }

      if (detailActive) loaded?.mixer.update(delta)
      // Ride the deformed garden: ease toward the sampled terrain height so
      // both walking and idling animals follow digs and deposits.
      if (options.groundSampler) {
        const targetY = options.groundY + options.groundSampler(wrapper.position.x, wrapper.position.z)
        groundYCurrent += (targetY - groundYCurrent) * (1 - Math.exp(-8 * delta))
        wrapper.position.y = groundYCurrent + (loaded ? 0 : Math.abs(Math.sin(elapsed * 5.8)) * 0.035)
      } else if (!loaded) {
        wrapper.position.y = options.groundY + Math.abs(Math.sin(elapsed * 5.8)) * 0.035
        wrapper.quaternion.setFromAxisAngle(upAxis, Math.sin(elapsed * 2.7) * 0.04)
      }
      wrapper.updateMatrixWorld(true)
    },
    dispose(): void {
      capture?.dispose()
      capture = null
      captureVerticalRange = null
      clearHeartEyes(modelRoot ?? posePivot)
      options.canvas.removeEventListener('pointerdown', onPointerDown)
      wrapper.parent?.remove(wrapper)
      wrapper.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        disposeTemporaryMaterials(object)
      })
      loaded?.mixer.stopAllAction()
    },
  }
}
