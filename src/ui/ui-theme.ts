/**
 * LEGACY canvas toolkit: the proof-of-concept look (Georgia, gilt rims). New UI
 * is DOM, styled like `journal-dom.css`; do not extend or copy this. It stays
 * only for the canvas panels that have not been migrated yet.
 *
 * Colours, type and the handful of canvas primitives for those panels. Sizes are in
 * design units (see `ui-viewport.ts`); canvases are drawn at `TEXTURE_SCALE`
 * and then mapped down, so type stays crisp on high-DPI displays.
 */

export const UI_THEME = {
  cream: '#fbf0d6',
  paper: '#f4e7c9',
  paperShade: '#e6d1a8',
  leather: '#754832',
  leatherDeep: '#583724',
  gilt: '#d0a964',
  ink: '#4a3323',
  inkSoft: '#8a684a',
  barnRed: '#c4483c',
  barnRedDeep: '#9c3730',
  meadow: '#5c8f52',
  meadowDeep: '#3f6b39',
  gold: '#e8b657',
  sky: '#a7d5d3',
  shadow: 'rgba(38, 24, 16, .34)',
} as const

/** Type scale in design units. */
export const UI_TYPE = {
  display: 'bold 84px Georgia, "Times New Roman", serif',
  title: 'bold 46px Georgia, "Times New Roman", serif',
  heading: 'bold 30px Georgia, "Times New Roman", serif',
  body: '20px Georgia, "Times New Roman", serif',
  label: 'bold 15px Georgia, "Times New Roman", serif',
  eyebrow: 'bold 12px Georgia, "Times New Roman", serif',
  hint: 'italic 15px Georgia, "Times New Roman", serif',
} as const

/** Canvas backing-store multiplier. 2 keeps 12px eyebrow type legible when scaled. */
export const TEXTURE_SCALE = 2

export interface Surface {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  readonly width: number
  readonly height: number
}

/**
 * Creates a canvas texture surface of `width` x `height` design units whose
 * backing store is `TEXTURE_SCALE` times larger. The context is pre-scaled, so
 * all drawing code works in design units.
 */
export function createSurface(width: number, height: number): Surface {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * TEXTURE_SCALE))
  canvas.height = Math.max(1, Math.round(height * TEXTURE_SCALE))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for game UI')
  context.scale(TEXTURE_SCALE, TEXTURE_SCALE)
  return { canvas, context, width, height }
}

export function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2))
}

/** A soft drop shadow under a rounded box, matching the carved-wood lighting. */
export function withShadow<T>(
  context: CanvasRenderingContext2D,
  blur: number,
  offsetY: number,
  draw: () => T,
): T {
  context.save()
  context.shadowColor = UI_THEME.shadow
  context.shadowBlur = blur
  context.shadowOffsetY = offsetY
  try {
    return draw()
  } finally {
    context.restore()
  }
}

export function fillRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient,
): void {
  roundRectPath(context, x, y, width, height, radius)
  context.fillStyle = fill
  context.fill()
}

export function strokeRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string,
  lineWidth = 2,
): void {
  roundRectPath(context, x, y, width, height, radius)
  context.strokeStyle = stroke
  context.lineWidth = lineWidth
  context.stroke()
}

export function verticalGradient(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const gradient = context.createLinearGradient(x, y, x, y + height)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  return gradient
}

/** Runs `draw` with letter-spacing applied, restoring the previous value after. */
export function withTracking(
  context: CanvasRenderingContext2D,
  spacing: number,
  draw: () => void,
): void {
  const previous = context.letterSpacing
  context.letterSpacing = `${spacing}px`
  draw()
  context.letterSpacing = previous
}

/** Greedy word wrap. Returns the y just past the last line drawn. */
export function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  let line = ''
  let lineY = y
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, lineY)
      line = word
      lineY += lineHeight
    } else {
      line = candidate
    }
  }
  if (line) context.fillText(line, x, lineY)
  return lineY + lineHeight
}

/** A gently mottled paper/leather surface so flat fills do not read as plastic. */
export function grain(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  density = 240,
  strength = 0.09,
): void {
  let state = seed >>> 0
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  context.save()
  for (let index = 0; index < density; index += 1) {
    context.globalAlpha = strength * (0.3 + random() * 0.7)
    context.fillStyle = random() > 0.55 ? '#fff8df' : '#8e6845'
    const size = 0.4 + random() * 1.1
    context.fillRect(x + random() * width, y + random() * height, size, size)
  }
  context.restore()
}
