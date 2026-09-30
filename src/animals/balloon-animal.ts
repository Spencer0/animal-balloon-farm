import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { FARM_EXPANSION_CONFIG } from '../game/farm-expansion'
import { createCapturePresentation, type CapturePresentation } from './balloon-capture'

export type AnimalClip = 'IDLE' | 'WALK'
export type AnimalAppearance = 'standard' | 'wild'
export type BalloonAnimalId = 'pig' | 'sheep' | 'cow' | 'chicken' | 'duck' | 'goose'

type AnimalGLTF = GLTF & { readonly animations: THREE.AnimationClip[] }
type AnimalMaterial = THREE.Material & { color?: THREE.Color; roughness?: number; metalness?: number; clearcoat?: number; clearcoatRoughness?: number }

export interface BalloonAnimalOptions {
  readonly id: BalloonAnimalId
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
  readonly getGardenBounds?: () => { readonly halfWidth: number; readonly halfDepth: number }
  /** Ignore animal clicks when an in-game HUD panel is occupying the pointer. */
  readonly isPointerBlocked?: (clientX: number, clientY: number) => boolean
  readonly canvas: HTMLCanvasElement
  readonly camera: THREE.Camera
  readonly wandering?: boolean
  readonly captureOnClick?: boolean
  readonly replayCaptureOnClick?: boolean
  /** Terrain height at garden (x, z); enables walking over deformed ground. */
  readonly groundSampler?: (x: number, z: number) => number
}

export interface BalloonAnimal {
  readonly id: BalloonAnimalId
  readonly root: THREE.Group
  readonly gltf: AnimalGLTF | null
  setAnimation(name: AnimalClip, fadeSeconds?: number): void
  setAppearance(appearance: AnimalAppearance): void
  beginCapture(): boolean
  readonly isCaptured: boolean
  readonly isCapturing: boolean
  readonly captureProgress: number
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
  disposeMaterial(WILD_MATERIALS.get(mesh))
  const transition = TRANSITION_MATERIALS.get(mesh)
  if (Array.isArray(transition)) transition.forEach((material) => CAPTURE_MATERIAL_STATES.delete(material))
  else if (transition) CAPTURE_MATERIAL_STATES.delete(transition)
  disposeMaterial(transition)
  WILD_MATERIALS.delete(mesh)
  TRANSITION_MATERIALS.delete(mesh)
}

function maskMaterial(material: THREE.Material): THREE.Material {
  const masked = material.clone() as AnimalMaterial
  masked.name = WILD_BALLOON_MATERIAL.name
  if (masked.color) masked.color.copy(WILD_BALLOON_COLOR)
  if ('map' in masked) masked.map = null
  if ('alphaMap' in masked) masked.alphaMap = null
  masked.transparent = false
  masked.opacity = 1
  masked.depthWrite = true
  if (masked.roughness !== undefined) masked.roughness = WILD_BALLOON_MATERIAL.roughness
  if (masked.metalness !== undefined) masked.metalness = WILD_BALLOON_MATERIAL.metalness
  if (masked.clearcoat !== undefined) masked.clearcoat = WILD_BALLOON_MATERIAL.clearcoat
  if (masked.clearcoatRoughness !== undefined) masked.clearcoatRoughness = WILD_BALLOON_MATERIAL.clearcoatRoughness
  masked.needsUpdate = true
  return masked
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
      const wild = Array.isArray(originals) ? originals.map(maskMaterial) : maskMaterial(originals)
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

function loadModel(url: string): Promise<AnimalGLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => resolve(gltf as AnimalGLTF), undefined, reject)
  })
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
  let appearance = options.appearance ?? 'wild'
  try {
    const asset = await loadModel(options.assetUrl)
    gltf = asset
    modelRoot = asset.scene
    modelRoot.name = `Original balloon ${options.name} · Blender GLB`
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
    posePivot.add(modelRoot)
    if (appearance === 'wild') setAnimalAppearance(modelRoot, 'wild')

    modelRoot.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })

    const mixer = new THREE.AnimationMixer(modelRoot)
    const actions = new Map<AnimalClip, THREE.AnimationAction>()
    for (const clip of asset.animations) {
      const normalizedName = clip.name.toUpperCase()
      const kind = normalizedName.includes('WALK') ? 'WALK' : normalizedName.includes('IDLE') ? 'IDLE' : null
      if (kind) actions.set(kind, mixer.clipAction(clip))
    }
    loaded = { gltf: asset, root: modelRoot, mixer, actions, activeAnimation: null }
    console.info(`[Animal Balloon Farm] ${options.name} asset`, JSON.stringify({
      dimensions: dimensions.toArray().map((value) => Number(value.toFixed(2))),
      clips: asset.animations.map(({ name, duration }) => ({ name, duration: Number(duration.toFixed(2)) })),
    }))
  } catch (error) {
    console.error(`[Animal Balloon Farm] Could not load ${options.assetUrl}`, error)
    if (modelRoot) posePivot.remove(modelRoot)
    modelRoot = null
    makePlaceholder(posePivot, options.id)
    setAnimalAppearance(posePivot, appearance)
  }

  let active: AnimalClip = 'IDLE'
  let elapsed = 0
  let nextDecision = 0
  let paused = 0
  let captured = false
  let capture: CapturePresentation | null = null
  let captureVerticalRange: CaptureVerticalRange | null = null
  let lastCaptureProgress = 0
  const pivotBasePosition = new THREE.Vector3()
  const pivotBaseRotation = new THREE.Euler()
  const target = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const modelForward = new THREE.Vector3(1, 0, 0)
  const random = seededRandom(options.seed)
  const upAxis = new THREE.Vector3(0, 1, 0)

  const chooseTarget = (): void => {
    const angle = random() * Math.PI * 2
    const radius = 2.4 + random() * 5.8
    const gardenBounds = options.getGardenBounds?.()
    const expansionX = Math.max(0, (gardenBounds?.halfWidth ?? FARM_EXPANSION_CONFIG.startBounds.halfWidth) - FARM_EXPANSION_CONFIG.startBounds.halfWidth)
    const expansionZ = Math.max(0, (gardenBounds?.halfDepth ?? FARM_EXPANSION_CONFIG.startBounds.halfDepth) - FARM_EXPANSION_CONFIG.startBounds.halfDepth)
    const halfWidth = Math.min(options.bounds.x + expansionX, Math.max(0, (gardenBounds?.halfWidth ?? options.bounds.x) - 1.2))
    const halfDepth = Math.min(options.bounds.z + expansionZ, Math.max(0, (gardenBounds?.halfDepth ?? options.bounds.z) - 1.2))
    target.set(
      THREE.MathUtils.clamp(wrapper.position.x + Math.cos(angle) * radius, -halfWidth, halfWidth),
      0,
      THREE.MathUtils.clamp(wrapper.position.z + Math.sin(angle) * radius * 0.62, -halfDepth, halfDepth),
    )
    nextDecision = 2 + random() * 2.4
  }

  const setAnimation = (name: AnimalClip, fadeSeconds = 0.22): void => {
    if (!loaded) {
      active = name
      return
    }
    if (active === name && loaded.activeAnimation === name) return
    const next = loaded.actions.get(name)
    if (!next) return
    const previous = loaded.activeAnimation ? loaded.actions.get(loaded.activeAnimation) : undefined
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fadeSeconds).play()
    previous?.fadeOut(fadeSeconds)
    loaded.activeAnimation = name
    active = name
  }

  chooseTarget()
  setAnimation(options.wandering === false ? 'IDLE' : 'WALK', 0)
  if (loaded) {
    loaded.mixer.update(0)
    wrapper.updateMatrixWorld(true)
    const animalBounds = getLocalBounds(wrapper, loaded.root)
    const center = animalBounds.getCenter(new THREE.Vector3())
    posePivot.position.copy(center)
    loaded.root.position.sub(center)
    wrapper.updateMatrixWorld(true)

    // Keep the model's original placement while centering the new parent pivot, then align
    // that pivot once to the lawn. Moving both parent and child would double the offset.
    const groundedBounds = getLocalBounds(wrapper, loaded.root)
    posePivot.position.y -= groundedBounds.min.y
    pivotBasePosition.copy(posePivot.position)
    wrapper.updateMatrixWorld(true)
    const finalBounds = getLocalBounds(wrapper, loaded.root)
    console.info(`[Animal Balloon Farm] ${options.name} ground clearance`, finalBounds.min.y.toFixed(4))
  } else {
    const placeholderBounds = getLocalBounds(wrapper, posePivot)
    posePivot.position.copy(placeholderBounds.getCenter(new THREE.Vector3()))
    posePivot.children.forEach((child) => child.position.sub(posePivot.position))
    const groundedBounds = getLocalBounds(wrapper, posePivot)
    posePivot.position.y -= groundedBounds.min.y
    pivotBasePosition.copy(posePivot.position)
  }
  pivotBaseRotation.copy(posePivot.rotation)

  const pauseDurations = { min: 0.45, max: 1.25 }
  const beginCapture = (): boolean => {
    if (capture || appearance !== 'wild') return false
    captured = true
    appearance = 'standard'
    lastCaptureProgress = 0
    const bounds = getLocalBounds(posePivot, modelRoot ?? posePivot)
    const worldBounds = new THREE.Box3().setFromObject(modelRoot ?? posePivot)
    captureVerticalRange = { bottom: worldBounds.min.y, top: worldBounds.max.y }
    // Initialize at progress zero so the animal stays glossy red until paint reaches it.
    setAnimalAppearanceProgress(modelRoot ?? posePivot, 0, captureVerticalRange)
    capture = createCapturePresentation(posePivot, wrapper, modelRoot, options.id, bounds, options.seed)
    setAnimation('IDLE', 0.22)
    paused = 0
    nextDecision = 0
    console.info(`[Animal Balloon Farm] ${options.name} capture flourish started`)
    return true
  }
  const setAppearance = (nextAppearance: AnimalAppearance): void => {
    if (appearance === nextAppearance) return
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

  const onPointerDown = (event: PointerEvent): void => {
    if (options.captureOnClick === false || event.button !== 0 || event.detail >= 2
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
    root: wrapper,
    get gltf(): AnimalGLTF | null { return gltf },
    setAnimation,
    setAppearance,
    beginCapture,
    get isCaptured(): boolean { return captured },
    get isCapturing(): boolean { return Boolean(capture && !capture.finished) },
    get captureProgress(): number { return lastCaptureProgress },
    update(deltaSeconds): void {
      const delta = Math.min(deltaSeconds, 0.05)
      elapsed += delta
      if (capture) {
        loaded?.mixer.update(delta)
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
          posePivot.position.copy(pivotBasePosition)
          posePivot.rotation.copy(pivotBaseRotation)
        }
        return
      }

      if (options.wandering === false) {
        loaded?.mixer.update(delta)
        return
      }

      if (paused > 0) {
        paused = Math.max(0, paused - delta)
        if (paused === 0) nextDecision = 0
      } else {
        nextDecision -= delta
      }

      const gardenBounds = options.getGardenBounds?.()
      if (gardenBounds) {
        const expansionX = Math.max(0, gardenBounds.halfWidth - FARM_EXPANSION_CONFIG.startBounds.halfWidth)
        const expansionZ = Math.max(0, gardenBounds.halfDepth - FARM_EXPANSION_CONFIG.startBounds.halfDepth)
        const maxX = Math.min(options.bounds.x + expansionX, Math.max(0, gardenBounds.halfWidth - 1.2))
        const maxZ = Math.min(options.bounds.z + expansionZ, Math.max(0, gardenBounds.halfDepth - 1.2))
        wrapper.position.x = THREE.MathUtils.clamp(wrapper.position.x, -maxX, maxX)
        wrapper.position.z = THREE.MathUtils.clamp(wrapper.position.z, -maxZ, maxZ)
      }
      direction.subVectors(target, wrapper.position)
      direction.y = 0
      const distance = direction.length()
      if (paused <= 0) {
        if (distance < 0.48 || nextDecision <= 0) {
          if (active !== 'IDLE') {
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
          wrapper.position.addScaledVector(direction, Math.min(options.speed * delta, distance))
          setAnimation('WALK', 0.24)
        }
      }

      loaded?.mixer.update(delta)
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
    },
    dispose(): void {
      capture?.dispose()
      capture = null
      captureVerticalRange = null
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
