import * as THREE from 'three'
import { createCameraTour, type CameraTour, type CameraTourSubject } from '../game/camera-tour'
import { cameraPanStep } from '../game/camera-rig'

/** The farm's opening framing, in world units of view height. */
export const NORMAL_VIEW_HEIGHT = 43
/**
 * The viewer looks at a small stage, so it zooms right in. The farm keeps its
 * own wide framing because the whole fairground has to fit on screen.
 */
const VIEWER_VIEW_HEIGHT = 26
/**
 * Close-up framing for the solo review booth (a single-species VIEWER_CAST):
 * the whole point is judging one model, so it fills the frame.
 */
const SINGLE_MODEL_VIEW_HEIGHT = 6.5
/**
 * How far below the stage the viewer's look-at point sits, in world units.
 * Lowering it lifts the stage up the screen so the animal tray along the
 * bottom does not cover the animals' feet.
 */
const VIEWER_TARGET_Y = -4.7
const CAMERA_BASE_SPEED = 12
const CAMERA_MAX_SPEED = 27
const CAMERA_MIN_ZOOM = 1.25
const CAMERA_MAX_ZOOM = 34
const CAMERA_SHAKE_DURATION = 0.82
const CAMERA_SHAKE_AMPLITUDE = 0.38

export interface FarmCameraContext {
  readonly renderer: THREE.WebGLRenderer
  /** Whether the viewer booth is up rather than the farm. */
  readonly inViewer: () => boolean
  /** The main menu is over the farm, so the camera drifts. */
  readonly menuDrifting: () => boolean
  /** Something is on screen that a cinematic tour must not run under. */
  readonly tourBlocked: () => boolean
  /** The solo review booth's plinth, when VIEWER_CAST stages a single species. */
  readonly viewerFocusStand: () => THREE.Vector3 | null
  /** Who the tour could pin to. */
  readonly tourSubjects: () => CameraTourSubject[]
  /** The framing jumped, so the herd's on-screen set needs a fresh look. */
  readonly onReframed: () => void
  /** A tour owns the camera outright, so a half-finished drag must not fight it. */
  readonly onTourStart: () => void
}

/**
 * The farm's orthographic camera and every way it moves: the player's drags,
 * keys and wheel, the cinematic tour, the menu drift and the expansion shake.
 */
export interface FarmCamera {
  readonly camera: THREE.OrthographicCamera
  /** What the camera looks at. The expansion shake and the tour both move it. */
  readonly target: THREE.Vector3
  readonly viewHalfHeight: number
  /** How far in from the opening shot, 1 at the start. */
  readonly zoom: number
  readonly tour: CameraTour | null
  readonly tourSeed: number
  updateProjection(): void
  /** Frame the current mode's opening shot. */
  focus(): void
  /** Point the camera at a spot from the opening angle and hold it there. */
  frameAt(target: THREE.Vector3, height: number): void
  /** Frame a spot from any side: `offset` is the direction and distance back to the eye. */
  frameFrom(target: THREE.Vector3, height: number, offset: THREE.Vector3): void
  /** The opening shot's eye distance. */
  readonly openingDistance: number
  beginTour(seed?: number): boolean
  /** Leave the tour. `restore` puts back the framing the tour interrupted. */
  endTour(restore: boolean): void
  /** Snap back to the opening shot: the framing the farm starts the game with. */
  resetToStart(): void
  updateTour(deltaSeconds: number): void
  /** Right-drag: slide the view by a pointer move in pixels. */
  dragPan(dx: number, dy: number): void
  /** Left-drag: orbit round the look-at point by a pointer move in pixels. */
  dragOrbit(dx: number, dy: number): void
  /** Keys and screen edges: glide along the ground. Inputs are unit-ish screen directions. */
  moveAlongGround(horizontal: number, vertical: number, edgeStrength: number, deltaSeconds: number): void
  zoomBy(deltaY: number): void
  /** The farm just grew: give the view a thump. */
  shakeForExpansion(): void
  removeShake(): void
  applyShake(deltaSeconds: number, elapsedSeconds: number): void
  updateMenuDrift(delta: number, elapsed: number): void
}

export function createFarmCamera(context: FarmCameraContext): FarmCamera {
  const { renderer } = context
  const cameraTarget = new THREE.Vector3(0, 1.25, 0)
  const aspect = window.innerWidth / Math.max(1, window.innerHeight)
  const viewHeight = NORMAL_VIEW_HEIGHT
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

  const targetOffset = new THREE.Vector3()
  const viewDirection = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize()
  let cameraDistance = initialOffset.length()
  let viewHalfHeight = viewHeight / 2

  const cameraShakeOffset = new THREE.Vector3()
  let expansionFeedbackSeconds = 0
  let expansionFeedbackStrength = 0

  // ----------------------------------------------------------- camera tool --
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

  function focusCamera(): void {
    targetOffset.set(0, 0, 0)
    const viewer = context.inViewer()
    const stand = context.viewerFocusStand()
    if (viewer && stand) {
      // Solo review booth: frame just the staged plinth so the model under
      // review fills the frame. The look-at point sits below the plinth for the
      // same reason as the wide shot — the tray along the bottom must clear the
      // model's feet.
      cameraTarget.set(stand.x, stand.y - 0.8, stand.z)
      viewHalfHeight = SINGLE_MODEL_VIEW_HEIGHT / 2
    } else {
      // The viewer's UI is a tray along the bottom, so the stage is framed a little
      // high: look at a point under it and the animals ride above the tray.
      cameraTarget.set(0, viewer ? VIEWER_TARGET_Y : 1.25, 0)
      viewHalfHeight = (viewer ? VIEWER_VIEW_HEIGHT : NORMAL_VIEW_HEIGHT) / 2
    }
    camera.position.copy(cameraTarget).add(initialOffset)
    viewDirection.copy(initialOffset).normalize()
    cameraDistance = initialOffset.length()
    camera.lookAt(cameraTarget)
    camera.updateMatrixWorld()
    updateCameraProjection()
    context.onReframed()
  }

  function frameFrom(target: THREE.Vector3, height: number, offset: THREE.Vector3): void {
    cameraTarget.copy(target)
    viewHalfHeight = height / 2
    camera.position.copy(cameraTarget).add(offset)
    viewDirection.copy(offset).normalize()
    cameraDistance = offset.length()
    camera.lookAt(cameraTarget)
    camera.updateMatrixWorld()
    updateCameraProjection()
  }

  function beginCameraTour(seed = Math.floor(Math.random() * 0xffffffff)): boolean {
    if (context.tourBlocked()) return false
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
    context.onTourStart()
    return true
  }

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

  function updateCameraTour(deltaSeconds: number): void {
    if (!cameraTour) return
    if (context.tourBlocked()) {
      endCameraTour(true)
      return
    }
    const shot = cameraTour.tick(deltaSeconds, context.tourSubjects())
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

  return {
    camera,
    target: cameraTarget,
    get viewHalfHeight() { return viewHalfHeight },
    get zoom() { return NORMAL_VIEW_HEIGHT / (viewHalfHeight * 2) },
    get tour() { return cameraTour },
    get tourSeed() { return cameraTourSeed },
    openingDistance: initialOffset.length(),
    updateProjection: updateCameraProjection,
    focus: focusCamera,
    frameAt: (target, height) => frameFrom(target, height, initialOffset),
    frameFrom,
    beginTour: beginCameraTour,
    endTour: endCameraTour,
    resetToStart(): void {
      endCameraTour(false)
      focusCamera()
    },
    updateTour: updateCameraTour,
    dragPan(dx, dy): void {
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
    },
    dragOrbit(dx, dy): void {
      const offset = new THREE.Vector3().subVectors(camera.position, cameraTarget)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      spherical.theta -= dx * 0.0048
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * 0.0032, 0.36, 1.17)
      offset.setFromSpherical(spherical)
      viewDirection.copy(offset).normalize()
      camera.position.copy(cameraTarget).add(offset)
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld()
    },
    moveAlongGround(horizontal, vertical, edgeStrength, deltaSeconds): void {
      const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      cameraRight.y = 0
      cameraRight.normalize()
      const cameraForward = new THREE.Vector3().subVectors(cameraTarget, camera.position)
      cameraForward.y = 0
      cameraForward.normalize()
      const direction = cameraRight.multiplyScalar(horizontal).addScaledVector(cameraForward, vertical)
      if (direction.lengthSq() < 0.0001) return
      direction.normalize()
      const zoomScale = viewHalfHeight / (NORMAL_VIEW_HEIGHT / 2)
      const speed = THREE.MathUtils.lerp(CAMERA_BASE_SPEED, CAMERA_MAX_SPEED, edgeStrength) * zoomScale
      const movement = direction.multiplyScalar(speed * deltaSeconds)
      cameraTarget.add(movement)
      camera.position.add(movement)
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld()
    },
    zoomBy(deltaY): void {
      // Zooming takes the camera back from a running tour at its current pose.
      if (cameraTour) endCameraTour(false)
      viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * Math.exp(deltaY * 0.001), CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
      updateCameraProjection()
    },
    shakeForExpansion(): void {
      expansionFeedbackSeconds = CAMERA_SHAKE_DURATION
      expansionFeedbackStrength = 1
    },
    removeShake(): void {
      if (cameraShakeOffset.lengthSq() === 0) return
      camera.position.sub(cameraShakeOffset)
      cameraTarget.sub(cameraShakeOffset)
      cameraShakeOffset.set(0, 0, 0)
    },
    applyShake(deltaSeconds, elapsedSeconds): void {
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
    },
    updateMenuDrift(delta, elapsed): void {
      const target = context.menuDrifting() ? 1 : 0
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
    },
  }
}
