import * as THREE from 'three'
import type { DesignPoint, DesignRect } from './ui-viewport'
import { rectContains } from './ui-viewport'
import { requestUIProp } from './ui-props'
import {
  createSurface,
  fillRoundRect,
  grain,
  strokeRoundRect,
  UI_THEME,
  verticalGradient,
  withShadow,
  withTracking,
  type Surface,
} from './ui-theme'

/**
 * The one button every screen uses.
 *
 * A Blender-authored barn-board plaque carries the shape and the light; the
 * label is painted onto the cream face at runtime so one mesh serves the main
 * menu, the journal launcher and the garden tools. Before the plaque loads, a
 * canvas-drawn stand-in with the same silhouette and colours is shown, so a slow
 * network degrades to "flat" rather than to "hole".
 */

export type FarmButtonState = 'idle' | 'hover' | 'pressed' | 'disabled'

export interface FarmButtonOptions {
  readonly title: string
  readonly sublabel?: string
  /** Keyboard shortcut badge, e.g. "1" or "J". Omit for no badge. */
  readonly hotkey?: string
  /** Colour of the active bar and the badge, normally the tool's own accent. */
  readonly accent?: string
  /** Small caps line under the title, e.g. "GARDEN TOOL". */
  readonly caption?: string
  readonly width?: number
  readonly height?: number
  readonly onPress: () => void
}

export interface FarmButton {
  readonly object: THREE.Group
  readonly rect: DesignRect
  readonly state: FarmButtonState
  /** Places the button by its centre. */
  setCenter(x: number, y: number): void
  /**
   * Scales the button to fit its layout slot. This is the button's *base* size:
   * the hover and press animation is applied on top of it, so a layout scale can
   * never be clobbered by the per-frame animation, and the hit box always
   * matches what is drawn.
   */
  setBaseScale(scale: number): void
  setState(state: FarmButtonState): void
  setCaption(caption: string | undefined): void
  hitTest(point: DesignPoint): boolean
  update(delta: number): void
  dispose(): void
}

const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 193
/** The plaque's cream face, as fractions of the plaque, so labels land on it. */
const FACE_INSET_X = 0.075
const FACE_INSET_Y = 0.15

export function createFarmButton(options: FarmButtonOptions): FarmButton {
  const width = options.width ?? DEFAULT_WIDTH
  const height = options.height ?? DEFAULT_HEIGHT
  const accent = options.accent ?? UI_THEME.meadow
  // `null` = not resolved yet, `false` = unavailable, `true` = attached. The
  // per-frame `update` re-asks until it arrives, then stops for good.
  const plaqueState: { current: boolean | null } = { current: null }

  const surface = createSurface(width, height)
  const object = new THREE.Group()
  object.name = `Farm button · ${options.title}`

  const labelMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(surface.canvas),
    transparent: true,
    depthWrite: false,
  })
  labelMaterial.map!.colorSpace = THREE.SRGBColorSpace
  labelMaterial.map!.anisotropy = 4
  const label = new THREE.Mesh(new THREE.PlaneGeometry(width, height), labelMaterial)
  label.name = 'Farm button · painted label'
  label.position.z = 4
  label.renderOrder = 3
  object.add(label)

  let caption = options.caption
  let state: FarmButtonState = 'idle'
  let hoverAmount = 0
  let pressAmount = 0
  let baseScale = 1
  let centreX = 0
  let centreY = 0
  let rect: DesignRect = { x: 0, y: 0, width, height }

  function refreshRect(): void {
    const scaledWidth = width * baseScale
    const scaledHeight = height * baseScale
    rect = {
      x: centreX - scaledWidth / 2,
      y: centreY - scaledHeight / 2,
      width: scaledWidth,
      height: scaledHeight,
    }
  }

  function draw(): void {
    const context = surface.context
    context.clearRect(0, 0, width, height)
    // The 3D plaque carries the wood and the bevel; the canvas only supplies
    // one until it arrives.
    if (plaqueState.current !== true) drawFallbackPlaque(context, surface, hoverAmount)
    drawLabel(context, surface, accent, hoverAmount, pressAmount, options, caption)
    labelMaterial.map!.needsUpdate = true
  }

  draw()

  function attachPlaque(): void {
    if (plaqueState.current !== null) return
    // Fit the plaque to *this* button's slot. Asking for the shared default box
    // instead made a 300-wide tool card carry a 420-wide plaque, and the cards
    // visibly overlapped each other.
    const prop = requestUIProp('ui-button', { width, height, anchorBelow: 0.5 })
    if (!prop) return
    plaqueState.current = true
    prop.object.position.z = 0
    object.add(prop.object)
    // Sit the label just clear of the carved face, whatever depth it came out at.
    const depth = new THREE.Box3().setFromObject(prop.object)
    label.position.z = depth.max.z + 3
    draw()
  }

  const api: FarmButton = {
    object,
    get rect(): DesignRect {
      return rect
    },
    get state(): FarmButtonState {
      return state
    },
    setCenter(x: number, y: number): void {
      centreX = x
      centreY = y
      object.position.set(x, y, object.position.z)
      refreshRect()
    },
    setBaseScale(scale: number): void {
      if (scale === baseScale) return
      baseScale = scale
      refreshRect()
    },
    setState(next: FarmButtonState): void {
      if (state === next) return
      state = next
      draw()
    },
    setCaption(next: string | undefined): void {
      if (next === caption) return
      caption = next
      draw()
    },
    hitTest(point: DesignPoint): boolean {
      return state !== 'disabled' && rectContains(rect, point)
    },
    update(delta: number): void {
      attachPlaque()
      const hoverTarget = state === 'hover' ? 1 : 0
      const pressTarget = state === 'pressed' ? 1 : 0
      const blend = 1 - Math.exp(-delta * 16)
      const previousHover = hoverAmount
      hoverAmount += (hoverTarget - hoverAmount) * blend
      pressAmount += (pressTarget - pressAmount) * blend
      if (Math.abs(hoverAmount - hoverTarget) < 0.002) hoverAmount = hoverTarget
      if (Math.abs(pressAmount - pressTarget) < 0.002) pressAmount = pressTarget
      // Hover lifts the plaque and tips it toward the light; press pushes it in.
      const lift = hoverAmount * 9 - pressAmount * 7
      object.position.y = centreY + lift
      object.position.z = hoverAmount * 6 - pressAmount * 4
      const scale = baseScale * (1 + hoverAmount * 0.035 - pressAmount * 0.03)
      object.scale.set(scale, scale, 1)
      object.rotation.x = -hoverAmount * 0.045 + pressAmount * 0.03
      if (Math.abs(hoverAmount - previousHover) > 0.0005) draw()
    },
    dispose(): void {
      label.geometry.dispose()
      labelMaterial.map?.dispose()
      labelMaterial.dispose()
      object.clear()
    },
  }

  api.setCenter(0, 0)
  return api
}

/** A flat barn-board stand-in drawn to match the Blender plaque's silhouette. */
function drawFallbackPlaque(
  context: CanvasRenderingContext2D,
  surface: Surface,
  hoverAmount: number,
): void {
  const { width, height } = surface
  context.save()
  if (hoverAmount > 0) context.globalAlpha = 1 - hoverAmount * 0.35
  withShadow(context, 26, 12, () => {
    fillRoundRect(context, 2, 2, width - 4, height - 4, height * 0.22, verticalGradient(context, 0, 0, height, [
      [0, '#c08a5a'],
      [0.5, '#a9714a'],
      [1, '#8a5734'],
    ]))
  })
  fillRoundRect(context, width * 0.035, height * 0.075, width * 0.93, height * 0.85, height * 0.16, UI_THEME.barnRed)
  fillRoundRect(context, width * FACE_INSET_X, height * FACE_INSET_Y, width * (1 - FACE_INSET_X * 2), height * (1 - FACE_INSET_Y * 2), height * 0.1, verticalGradient(context, 0, 0, height, [
    [0, '#fdf6e4'],
    [1, UI_THEME.paper],
  ]))
  grain(context, width * FACE_INSET_X, height * FACE_INSET_Y, width * (1 - FACE_INSET_X * 2), height * (1 - FACE_INSET_Y * 2), 4211, 120, 0.05)
  strokeRoundRect(context, width * FACE_INSET_X, height * FACE_INSET_Y, width * (1 - FACE_INSET_X * 2), height * (1 - FACE_INSET_Y * 2), height * 0.1, 'rgba(120, 79, 52, .35)', 1.5)
  context.restore()
}

function drawLabel(
  context: CanvasRenderingContext2D,
  surface: Surface,
  accent: string,
  hoverAmount: number,
  pressAmount: number,
  options: FarmButtonOptions,
  caption: string | undefined,
): void {
  const { width, height } = surface
  const faceX = width * FACE_INSET_X
  const faceY = height * FACE_INSET_Y
  const faceWidth = width * (1 - FACE_INSET_X * 2)
  const faceHeight = height * (1 - FACE_INSET_Y * 2)
  const centreX = width / 2

  context.save()
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'

  if (caption) {
    context.fillStyle = 'rgba(122, 88, 58, .78)'
    context.font = `700 ${Math.round(height * 0.087)}px Georgia, "Times New Roman", serif`
    withTracking(context, 1.8, () => {
      context.fillText(caption, centreX, faceY + faceHeight * 0.26)
    })
  }

  // Type is sized from the button, not hard-coded, so shrinking a button in the
  // layout shrinks its lettering with it instead of spilling off the face.
  const titleSize = Math.round(height * 0.275 - pressAmount * height * 0.014)
  context.fillStyle = UI_THEME.ink
  context.font = `bold ${titleSize}px Georgia, "Times New Roman", serif`
  const titleBaseline = options.sublabel
    ? faceY + faceHeight * 0.62
    : faceY + faceHeight * 0.68
  // Long labels ("GRASS SEEDER") must not run off the face of a narrow button.
  context.font = `bold ${fitFontSize(context, options.title.toUpperCase(), faceWidth * 0.86, titleSize)}px Georgia, "Times New Roman", serif`
  context.fillText(options.title.toUpperCase(), centreX, titleBaseline)

  if (options.sublabel) {
    context.fillStyle = UI_THEME.inkSoft
    // Long sublabels ("A little green goes a long way") must not run off a
    // narrow button's face either.
    const subSize = Math.round(height * 0.116)
    context.font = `italic ${subSize}px Georgia, "Times New Roman", serif`
    let fitted = subSize
    for (let attempt = 0; attempt < 12; attempt += 1) {
      context.font = `italic ${fitted}px Georgia, "Times New Roman", serif`
      if (context.measureText(options.sublabel).width <= faceWidth * 0.92) break
      fitted = Math.max(8, Math.floor(fitted * 0.92))
    }
    context.fillText(options.sublabel, centreX, titleBaseline + height * 0.174)
  }

  // A short accent bar under the text: the "this one is live" tell.
  const barWidth = faceWidth * (0.34 + hoverAmount * 0.2)
  fillRoundRect(context, centreX - barWidth / 2, titleBaseline + (options.sublabel ? height * 0.26 : height * 0.13), barWidth, height * 0.03, height * 0.015, accent)

  if (options.hotkey) drawHotkeyBadge(context, options.hotkey, faceX + faceWidth - 6, faceY + 6, accent, height)
  context.restore()
}

/** Longest font size at which `text` still fits `maxWidth`, so nothing is ever cut off. */
function fitFontSize(context: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number): number {
  let size = startSize
  for (let attempt = 0; attempt < 12; attempt += 1) {
    context.font = `bold ${size}px Georgia, "Times New Roman", serif`
    if (context.measureText(text).width <= maxWidth) break
    size = Math.floor(size * 0.92)
  }
  return size
}

function drawHotkeyBadge(
  context: CanvasRenderingContext2D,
  hotkey: string,
  x: number,
  y: number,
  accent: string,
  height: number,
): void {
  const size = Math.round(height * 0.217)
  context.save()
  context.font = `bold ${Math.round(size * 0.63)}px ui-monospace, SFMono-Regular, Menlo, monospace`
  // A two- or three-letter shortcut ("Esc", "Tab") is wider than it is tall, so
  // the badge grows sideways instead of letting the letters spill off the plaque.
  const boxWidth = Math.max(size, Math.ceil(context.measureText(hotkey.toUpperCase()).width) + Math.round(size * 0.6))
  fillRoundRect(context, x - boxWidth, y, boxWidth, size, size * 0.27, accent)
  strokeRoundRect(context, x - boxWidth, y, boxWidth, size, size * 0.27, 'rgba(74, 51, 35, .45)', 1.5)
  context.fillStyle = '#fff8e6'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(hotkey.toUpperCase(), x - boxWidth / 2, y + size / 2 + 1)
  context.restore()
}
