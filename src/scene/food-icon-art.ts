/**
 * Small 2D art for the food web's world cues. The real icons are 128px PNGs
 * under `assets/goods/`; every one is optional, so each has a hand-drawn canvas
 * fallback and the PNG is painted over it once (if ever) it loads.
 */
const PAPER = '#faf3e2'
const BORDER = '#6b4a33'
const TERRACOTTA = '#c65a3a'

/** Start loading an icon. `onReady` runs once if it loads; a missing file is silently ignored. */
export function loadIconImage(url: string, onReady: (image: HTMLImageElement) => void): void {
  if (typeof Image === 'undefined') return
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => onReady(image)
  image.onerror = () => { /* the fallback art stays */ }
  image.src = url
}

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** A cream thought bubble with a tail, the shape both hunger icons fall back to. */
export function drawBubbleFallback(ctx: CanvasRenderingContext2D, size: number, kind: 'hunger' | 'starving'): void {
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2
  const cy = size * 0.45
  const r = size * 0.36
  ctx.fillStyle = PAPER
  ctx.strokeStyle = kind === 'starving' ? TERRACOTTA : BORDER
  ctx.lineWidth = size * 0.045
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // Thought tail: two shrinking dots down and to the left.
  for (const [dx, dy, dr] of [[-0.2, 0.34, 0.07], [-0.3, 0.44, 0.04]] as const) {
    ctx.beginPath()
    ctx.arc(cx + dx * size, cy + dy * size, dr * size, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = kind === 'starving' ? TERRACOTTA : BORDER
  if (kind === 'starving') {
    ctx.font = `bold ${size * 0.5}px "Trebuchet MS", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', cx, cy + size * 0.02)
  } else {
    // A little empty plate: ring and a fork-less hint of a rumble.
    ctx.lineWidth = size * 0.04
    ctx.beginPath()
    ctx.ellipse(cx, cy + size * 0.03, size * 0.2, size * 0.13, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(cx, cy + size * 0.03, size * 0.1, size * 0.06, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

const GOOD_FALLBACK_COLOR: Readonly<Record<string, string>> = {
  milk: '#f4f1ea',
  wool: '#efe6d2',
  egg: '#f1dcc0',
  'duck-egg': '#cfe6dc',
  down: '#e8eef5',
  truffle: '#6a4a38',
  trinket: '#e0b84a',
  gem: '#b78cf0',
}

/** A coloured token standing in for a good whose icon has not loaded. */
export function drawGoodFallback(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, good: string): void {
  ctx.fillStyle = GOOD_FALLBACK_COLOR[good] ?? '#d8c9a8'
  ctx.strokeStyle = BORDER
  ctx.lineWidth = Math.max(2, size * 0.06)
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

export const FOOD_ART_COLORS = { paper: PAPER, border: BORDER, terracotta: TERRACOTTA } as const
