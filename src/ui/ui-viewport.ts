/**
 * The single coordinate system for every screen in Animal Balloon Farm.
 *
 * The bug this replaces: the journal squashed a fixed 1280x720 logical space to
 * fill the window (`root.scale.set(width / 1280, height / 720)`) while the tool
 * HUD worked in raw device pixels with its own clamp. Two models, so the two
 * surfaces looked nothing alike and both changed shape with the window.
 *
 * The rule now: UI is authored in a design space that is always
 * `DESIGN_HEIGHT` units tall and exactly as wide as the real window is tall-
 * wide. One uniform scale, no stretching, no letterboxing, and edges stay
 * anchored to real screen edges. A 16:9 window is 1600x900 design units, so
 * that is the size to art in.
 */

export const DESIGN_HEIGHT = 900
/** Design width of a 16:9 window -- the size to author art at. */
export const DESIGN_WIDTH = 1600
/** Below/above this the space letterboxes, which only happens at absurd aspects. */
const MIN_DESIGN_WIDTH = 1120
const MAX_DESIGN_WIDTH = 2800

export interface DesignPoint {
  readonly x: number
  readonly y: number
}

/** Axis-aligned box in design units, origin at the centre of the design space. */
export interface DesignRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface UIViewport {
  readonly width: number
  readonly height: number
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  resize(cssWidth: number, cssHeight: number): void
  /** Maps a client-space pointer position into design units, or null if unmeasurable. */
  toDesign(clientX: number, clientY: number, bounds: DOMRectReadOnly): DesignPoint | null
}

export function createUIViewport(): UIViewport {
  let width = DESIGN_WIDTH
  let height = DESIGN_HEIGHT

  return {
    get width(): number {
      return width
    },
    get height(): number {
      return height
    },
    get left(): number {
      return -width / 2
    },
    get right(): number {
      return width / 2
    },
    get top(): number {
      return height / 2
    },
    get bottom(): number {
      return -height / 2
    },
    resize(cssWidth: number, cssHeight: number): void {
      height = DESIGN_HEIGHT
      const aspect = cssWidth / Math.max(1, cssHeight)
      width = Math.min(MAX_DESIGN_WIDTH, Math.max(MIN_DESIGN_WIDTH, height * aspect))
    },
    toDesign(clientX: number, clientY: number, bounds: DOMRectReadOnly): DesignPoint | null {
      if (bounds.width <= 0 || bounds.height <= 0) return null
      // Client space -> CSS pixels in the canvas -> design units.
      const px = (clientX - bounds.left) / bounds.width
      const py = (clientY - bounds.top) / bounds.height
      return {
        x: -width / 2 + px * width,
        // Pointer y grows downward; design y grows upward.
        y: height / 2 - py * height,
      }
    },
  }
}

export function rectContains(rect: DesignRect, point: DesignPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height
}

/** The full design space, i.e. the rect a full-bleed backdrop should fill. */
export function fullViewportRect(viewport: UIViewport): DesignRect {
  return { x: viewport.left, y: viewport.bottom, width: viewport.width, height: viewport.height }
}

/**
 * The largest rect of a given aspect ratio that fits the design space.
 *
 * The journal and the menu are both authored at 16:9 and must keep that shape
 * exactly, so they are laid out inside one of these instead of being stretched
 * to the window.
 */
export function fitAspectRect(
  viewport: UIViewport,
  aspect: number,
  margin = 0,
): DesignRect {
  const available = {
    width: Math.max(1, viewport.width - margin * 2),
    height: Math.max(1, viewport.height - margin * 2),
  }
  const width = Math.min(available.width, available.height * aspect)
  const height = width / aspect
  return {
    x: -width / 2,
    y: -height / 2,
    width,
    height,
  }
}
