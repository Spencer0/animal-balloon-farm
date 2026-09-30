import * as THREE from 'three'
import type { UiCursorKind } from './ui-cursor'
import { createUIViewport, type DesignPoint, type UIViewport } from './ui-viewport'
import { UI_THEME } from './ui-theme'

/**
 * The centralized UI layer.
 *
 * One scene, one orthographic camera, one set of lights, one input router --
 * shared by the main menu, the journal, the tool HUD and the viewer. Before
 * this existed each surface built its own overlay scene, its own camera and its
 * own scaling rule, which is why the journal looked one way locally and another
 * way on the deployed build.
 *
 * Panels register in z order (later = on top). Input is routed top-down and the
 * first panel that claims a pointer stops the search, so a click on the journal
 * page can never fall through and paint the garden underneath it.
 */

export interface UIPanel {
  readonly name: string
  readonly object: THREE.Object3D
  /** Higher renders on top and gets pointer events first. */
  readonly order: number
  /** Return true to consume the event. */
  pointerDown(point: DesignPoint, event: PointerEvent): boolean
  pointerMove(point: DesignPoint, event: PointerEvent): boolean
  pointerUp(point: DesignPoint, event: PointerEvent): boolean
  wheel?(point: DesignPoint, event: WheelEvent): boolean
  keyDown?(event: KeyboardEvent): boolean
  /**
   * What the pointer should look like over this panel. Return `undefined` to
   * pass the pointer along to whatever is underneath. Panels that do not
   * implement this get the friendly default hand, which is also what the
   * Blender-authored props get, since a plank or a mailbox has no cursor of
   * its own to ask for.
   */
  cursor?(point: DesignPoint): UiCursorKind | undefined
  /**
   * Whether this panel owns the space under the pointer, for callers outside
   * the layer -- the farm's edge-panning and its brush both have to keep clear
   * of the interface instead of fighting it for the same click.
   */
  hitTest?(point: DesignPoint): boolean
  update(delta: number): void
  /** Called after the layer's viewport changes, so panels can re-lay-out. */
  resize(cssWidth: number, cssHeight: number): void
  /**
   * Where this panel actually laid itself out, in design units. Read through
   * the `?gardenDebug` harness so layout can be checked at any window size
   * without relying on a screenshot.
   */
  describe?(): unknown
  dispose(): void
}

export interface UILayer {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly viewport: UIViewport
  add(panel: UIPanel): void
  remove(panel: UIPanel): void
  resize(cssWidth: number, cssHeight: number): void
  update(delta: number): void
  /** Renders the UI over the game. The caller owns the renderer and depth clear. */
  render(renderer: THREE.WebGLRenderer): void
  dispose(): void
}

export function createUILayer(): UILayer {
  const viewport = createUIViewport()
  const scene = new THREE.Scene()
  scene.name = 'Centralized game UI'

  const camera = new THREE.OrthographicCamera(-800, 800, 450, -450, 0.1, 4000)
  camera.position.set(0, 0, 1000)
  camera.lookAt(0, 0, 0)

  // Shared lighting so the carved props read the same on the menu, the journal
  // launcher and the tool bar. Directional, to match the farm's key light.
  scene.add(new THREE.AmbientLight('#fff3dd', 1.9))
  const key = new THREE.DirectionalLight('#fff6e4', 2.5)
  key.position.set(-320, 420, 700)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#cfe4ea', 1.1)
  fill.position.set(420, -260, 520)
  scene.add(fill)
  const rim = new THREE.DirectionalLight('#ffd9a8', 0.9)
  rim.position.set(0, -520, 260)
  scene.add(rim)

  const panels = new Set<UIPanel>()

  function ordered(): UIPanel[] {
    return [...panels].sort((a, b) => a.order - b.order)
  }

  const layer: UILayer = {
    scene,
    camera,
    viewport,
    add(panel: UIPanel): void {
      panels.add(panel)
      scene.add(panel.object)
      // Later registrations draw on top, so keep render order aligned with the
      // declared stacking instead of relying on add order.
      panel.object.renderOrder = panel.order
      panel.object.position.z = panel.order
    },
    remove(panel: UIPanel): void {
      panels.delete(panel)
      scene.remove(panel.object)
    },
    resize(cssWidth: number, cssHeight: number): void {
      viewport.resize(cssWidth, cssHeight)
      camera.left = viewport.left
      camera.right = viewport.right
      camera.top = viewport.top
      camera.bottom = viewport.bottom
      camera.updateProjectionMatrix()
      for (const panel of panels) panel.resize(cssWidth, cssHeight)
    },
    update(delta: number): void {
      for (const panel of ordered()) panel.update(delta)
    },
    render(renderer: THREE.WebGLRenderer): void {
      renderer.autoClear = false
      renderer.clearDepth()
      renderer.render(scene, camera)
      renderer.autoClear = true
    },
    dispose(): void {
      for (const panel of [...panels]) {
        panels.delete(panel)
        panel.dispose()
      }
      scene.clear()
    },
  }

  return layer
}

/** Top-down pointer routing helper shared by the panels. */
export function routePointer(
  panels: readonly UIPanel[],
  point: DesignPoint,
  event: PointerEvent,
  phase: 'down' | 'move' | 'up',
): boolean {
  // Reverse order: topmost panel first, and the first claim wins.
  for (let index = panels.length - 1; index >= 0; index -= 1) {
    const panel = panels[index]
    const handled = phase === 'down'
      ? panel.pointerDown(point, event)
      : phase === 'move'
        ? panel.pointerMove(point, event)
        : panel.pointerUp(point, event)
    if (handled) return true
  }
  return false
}

/** A full-bleed tinted scrim, used behind the menu and the viewer. */
export function createScrim(opacity: number, color = '#12211f'): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.name = 'UI scrim'
  mesh.renderOrder = 0
  return mesh
}

/** Fits a scrim to the current design space; call on every resize. */
export function fitScrim(scrim: THREE.Mesh, viewport: UIViewport): void {
  scrim.scale.set(viewport.width, viewport.height, 1)
  scrim.position.set(0, 0, -1)
}

export { UI_THEME }
