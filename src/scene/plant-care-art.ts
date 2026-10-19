import * as THREE from 'three'
import type { PlantCare } from '../game/plants'

/**
 * The garden's plant-care cues, drawn once onto canvases in the Farm Journal
 * look (cream paper, walnut rims, dashed tan rings, terracotta accents):
 *
 * - a care marker per chore: a paper pin badge with a little tail pointing at
 *   the plant, its inner disc tinted for the chore (water drop, beetle, shears);
 * - the fully grown seal: a gold rosette with ribbon tails and a leafy tick;
 * - the fully grown banner: a ribbon that pops up over the plant the moment it
 *   matures;
 * - the withered badge: a paper disc with a drooping brown plant on a dirt
 *   mound, over a plant raiders ate bare. Clicking it clears the plant.
 *
 * Textures are authored at twice their on-screen size so they stay crisp on
 * high-density screens, and cached: every plant shares one per kind.
 */

const PAPER = '#faf3e2'
const BORDER = '#6b4a33'
const DASH = '#b08c5e'
const TERRACOTTA = '#c65a3a'
const TERRACOTTA_DARK = '#9c4029'
const GOLD = '#e4b94f'
const GOLD_DARK = '#b0832c'
const LEAF = '#5f8f45'
const FONT = '"Trebuchet MS", "Segoe UI", sans-serif'

/** Care marker canvas, in texture pixels; the badge circle sits in the top square. */
export const CARE_MARKER_WIDTH = 256
export const CARE_MARKER_HEIGHT = 304
export const SEAL_SIZE = 192
export const BANNER_WIDTH = 768
export const BANNER_HEIGHT = 240

const careCache = new Map<PlantCare, THREE.CanvasTexture>()
let sealCache: THREE.CanvasTexture | null = null
let bannerCache: THREE.CanvasTexture | null = null
let witheredCache: THREE.CanvasTexture | null = null

function canvas2d(width: number, height: number, what: string): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error(`2D canvas context unavailable for ${what}`)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  return context
}

function finish(context: CanvasRenderingContext2D, name: string): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(context.canvas)
  texture.name = name
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

const CARE_TINT: Readonly<Record<PlantCare, { readonly disc: string; readonly ring: string }>> = {
  water: { disc: '#dcf0f1', ring: '#6ca9b3' },
  pest: { disc: '#efe6f6', ring: '#8a6bb5' },
  prune: { disc: '#e6f0d6', ring: '#7f9f58' },
}

/** The pin badge outline: a circle whose bottom draws out into a soft point. */
function badgePath(context: CanvasRenderingContext2D, cx: number, cy: number, r: number, tip: number): void {
  const spread = 0.42
  context.beginPath()
  context.arc(cx, cy, r, Math.PI / 2 + spread, Math.PI / 2 - spread)
  const rx = cx + Math.cos(Math.PI / 2 - spread) * r
  const ry = cy + Math.sin(Math.PI / 2 - spread) * r
  context.quadraticCurveTo(cx + r * 0.16, cy + r + tip * 0.45, cx, cy + r + tip)
  context.quadraticCurveTo(cx - r * 0.16, cy + r + tip * 0.45, cx - (rx - cx), ry)
  context.closePath()
}

/** A plant's care marker: the chore's icon on a paper pin. */
export function careMarkerTexture(care: PlantCare): THREE.CanvasTexture {
  const cached = careCache.get(care)
  if (cached) return cached
  const context = canvas2d(CARE_MARKER_WIDTH, CARE_MARKER_HEIGHT, 'plant-care marker')
  const cx = CARE_MARKER_WIDTH / 2
  const cy = 124
  const r = 104
  const tip = 56
  const tint = CARE_TINT[care]

  // Soft drop shadow, offset down so the badge seems to float above the plant.
  context.save()
  context.translate(0, 9)
  badgePath(context, cx, cy, r, tip)
  context.fillStyle = 'rgba(58, 36, 20, .28)'
  context.fill()
  context.restore()

  // Paper body and walnut rim.
  badgePath(context, cx, cy, r, tip)
  const paper = context.createLinearGradient(0, cy - r, 0, cy + r + tip)
  paper.addColorStop(0, '#fffaf0')
  paper.addColorStop(1, PAPER)
  context.fillStyle = paper
  context.fill()
  context.lineWidth = 11
  context.strokeStyle = BORDER
  context.stroke()

  // The chore's tinted disc inside a dashed ring, like the journal's dividers.
  context.beginPath()
  context.arc(cx, cy, r - 22, 0, Math.PI * 2)
  context.fillStyle = tint.disc
  context.fill()
  context.save()
  context.setLineDash([11, 9])
  context.lineWidth = 5
  context.strokeStyle = DASH
  context.beginPath()
  context.arc(cx, cy, r - 13, 0, Math.PI * 2)
  context.stroke()
  context.restore()
  context.lineWidth = 4
  context.strokeStyle = tint.ring
  context.beginPath()
  context.arc(cx, cy, r - 22, 0, Math.PI * 2)
  context.stroke()

  // A top gloss across the disc.
  context.save()
  context.beginPath()
  context.arc(cx, cy, r - 24, 0, Math.PI * 2)
  context.clip()
  const gloss = context.createLinearGradient(0, cy - r, 0, cy)
  gloss.addColorStop(0, 'rgba(255,255,255,.55)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gloss
  context.fillRect(cx - r, cy - r, r * 2, r)
  context.restore()

  context.save()
  context.translate(cx, cy)
  if (care === 'water') drawDrop(context)
  else if (care === 'pest') drawBeetle(context)
  else drawShears(context)
  context.restore()

  const texture = finish(context, `Plant care marker · ${care}`)
  careCache.set(care, texture)
  return texture
}

/** A plump water drop with a splash of shine, centred on the origin. */
function drawDrop(context: CanvasRenderingContext2D): void {
  const top = -58
  const r = 40
  const by = 14
  const path = (): void => {
    context.beginPath()
    context.moveTo(0, top)
    context.bezierCurveTo(14, top + 26, r, by - 20, r, by)
    context.arc(0, by, r, 0, Math.PI)
    context.bezierCurveTo(-r, by - 20, -14, top + 26, 0, top)
    context.closePath()
  }
  context.save()
  context.translate(4, 6)
  path()
  context.fillStyle = 'rgba(47, 111, 134, .22)'
  context.fill()
  context.restore()
  path()
  const fill = context.createLinearGradient(-r, top, r, by + r)
  fill.addColorStop(0, '#a9e2ee')
  fill.addColorStop(0.55, '#5fb3cf')
  fill.addColorStop(1, '#3a86a8')
  context.fillStyle = fill
  context.fill()
  context.lineWidth = 6
  context.strokeStyle = '#2f6f86'
  context.stroke()
  context.fillStyle = 'rgba(255,255,255,.9)'
  context.beginPath()
  context.ellipse(-15, 6, 8, 16, -0.35, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.arc(-7, 30, 4.5, 0, Math.PI * 2)
  context.fill()
}

/** A round jewel beetle, head up, with spotted wing cases. */
function drawBeetle(context: CanvasRenderingContext2D): void {
  const ink = '#2d2433'
  context.strokeStyle = ink
  context.lineWidth = 6
  for (const [y, reach] of [[-6, -14], [14, 0], [34, 14]] as const) {
    for (const side of [-1, 1]) {
      context.beginPath()
      context.moveTo(side * 26, y)
      context.lineTo(side * 46, y + reach * 0.4)
      context.lineTo(side * 52, y + reach * 0.4 + 10)
      context.stroke()
    }
  }
  // Antennae.
  context.lineWidth = 4.5
  for (const side of [-1, 1]) {
    context.beginPath()
    context.moveTo(side * 6, -44)
    context.quadraticCurveTo(side * 14, -62, side * 24, -62)
    context.stroke()
    context.fillStyle = ink
    context.beginPath()
    context.arc(side * 25, -62, 4.5, 0, Math.PI * 2)
    context.fill()
  }
  // Head.
  context.fillStyle = ink
  context.beginPath()
  context.arc(0, -34, 17, 0, Math.PI * 2)
  context.fill()
  // Shell.
  const shell = context.createRadialGradient(-12, -2, 4, 0, 12, 46)
  shell.addColorStop(0, '#a37ee0')
  shell.addColorStop(0.6, '#6c47ad')
  shell.addColorStop(1, '#4a2f80')
  context.fillStyle = shell
  context.beginPath()
  context.ellipse(0, 14, 34, 40, 0, 0, Math.PI * 2)
  context.fill()
  context.lineWidth = 5
  context.strokeStyle = '#33215c'
  context.stroke()
  context.beginPath()
  context.moveTo(0, -24)
  context.lineTo(0, 53)
  context.stroke()
  // Spots and a shine.
  context.fillStyle = '#4fbf98'
  for (const [x, y, s] of [[-16, 4, 7], [15, 0, 6], [-13, 30, 6], [16, 28, 7]] as const) {
    context.beginPath()
    context.arc(x, y, s, 0, Math.PI * 2)
    context.fill()
  }
  context.fillStyle = 'rgba(255,255,255,.55)'
  context.beginPath()
  context.ellipse(-17, -8, 5, 10, -0.5, 0, Math.PI * 2)
  context.fill()
  // Eyes.
  for (const side of [-1, 1]) {
    context.fillStyle = '#fffaf0'
    context.beginPath()
    context.arc(side * 7, -38, 5.5, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = ink
    context.beginPath()
    context.arc(side * 7, -39.5, 2.6, 0, Math.PI * 2)
    context.fill()
  }
}

/** Garden shears, open, blades up and to the right, terracotta loop handles. */
function drawShears(context: CanvasRenderingContext2D): void {
  context.rotate(-Math.PI / 4)
  const steelFill = (flip: number): CanvasGradient => {
    const gradient = context.createLinearGradient(flip * -10, 0, flip * 10, 0)
    gradient.addColorStop(0, '#f3f5f4')
    gradient.addColorStop(1, '#9aa7ab')
    return gradient
  }
  // Each half: a blade above the pivot, a looped handle below, opened a little.
  for (const side of [-1, 1]) {
    context.save()
    context.rotate(side * 0.2)
    // Blade.
    context.beginPath()
    context.moveTo(side * 1, 4)
    context.quadraticCurveTo(side * 15, -24, side * 3, -66)
    context.quadraticCurveTo(side * -4, -30, side * -7, 4)
    context.closePath()
    context.fillStyle = steelFill(side)
    context.fill()
    context.lineWidth = 5
    context.strokeStyle = '#4d5a60'
    context.stroke()
    // Shank.
    context.lineWidth = 9
    context.strokeStyle = '#4d5a60'
    context.beginPath()
    context.moveTo(side * -2, 4)
    context.lineTo(side * 10, 22)
    context.stroke()
    // Loop handle.
    context.beginPath()
    context.ellipse(side * 18, 40, 13, 19, side * -0.35, 0, Math.PI * 2)
    context.lineWidth = 11
    context.strokeStyle = TERRACOTTA_DARK
    context.stroke()
    context.lineWidth = 6.5
    context.strokeStyle = TERRACOTTA
    context.stroke()
    context.restore()
  }
  // Pivot screw.
  context.fillStyle = GOLD
  context.strokeStyle = GOLD_DARK
  context.lineWidth = 3.5
  context.beginPath()
  context.arc(0, 4, 7.5, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  // A snipped leaf flying off the tips.
  context.rotate(Math.PI / 4)
  context.save()
  context.translate(40, -42)
  context.rotate(0.6)
  context.fillStyle = '#8cc35c'
  context.strokeStyle = LEAF
  context.lineWidth = 3.5
  context.beginPath()
  context.moveTo(0, -14)
  context.quadraticCurveTo(11, 0, 0, 14)
  context.quadraticCurveTo(-11, 0, 0, -14)
  context.fill()
  context.stroke()
  context.restore()
}

/** Gold scalloped rosette points around a circle. */
function rosettePath(context: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number): void {
  context.beginPath()
  for (let index = 0; index <= points * 2; index += 1) {
    const angle = index / (points * 2) * Math.PI * 2 - Math.PI / 2
    const radius = index % 2 === 0 ? outer : inner
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
}

/** The lasting fully grown seal: a gold rosette with ribbon tails and a leafy tick. */
export function maturitySealTexture(): THREE.CanvasTexture {
  if (sealCache) return sealCache
  const size = SEAL_SIZE
  const context = canvas2d(size, size, 'plant fully grown seal')
  const cx = size / 2
  const cy = size * 0.4
  // Ribbon tails, forked, behind the rosette.
  for (const side of [-1, 1]) {
    context.beginPath()
    context.moveTo(cx + side * 10, cy + 20)
    context.lineTo(cx + side * 44, cy + 98)
    context.lineTo(cx + side * 30, cy + 90)
    context.lineTo(cx + side * 22, cy + 106)
    context.lineTo(cx + side * -8, cy + 30)
    context.closePath()
    context.fillStyle = side < 0 ? TERRACOTTA : TERRACOTTA_DARK
    context.fill()
    context.lineWidth = 5
    context.strokeStyle = BORDER
    context.stroke()
  }
  context.save()
  context.translate(0, 6)
  rosettePath(context, cx, cy, 64, 54, 14)
  context.fillStyle = 'rgba(58, 36, 20, .25)'
  context.fill()
  context.restore()
  rosettePath(context, cx, cy, 64, 54, 14)
  const gold = context.createRadialGradient(cx - 18, cy - 20, 6, cx, cy, 66)
  gold.addColorStop(0, '#fbe39a')
  gold.addColorStop(1, GOLD)
  context.fillStyle = gold
  context.fill()
  context.lineWidth = 6
  context.strokeStyle = BORDER
  context.stroke()
  // Paper centre.
  context.beginPath()
  context.arc(cx, cy, 42, 0, Math.PI * 2)
  context.fillStyle = PAPER
  context.fill()
  context.lineWidth = 4
  context.strokeStyle = GOLD_DARK
  context.stroke()
  context.save()
  context.setLineDash([7, 6])
  context.lineWidth = 3
  context.strokeStyle = DASH
  context.beginPath()
  context.arc(cx, cy, 34, 0, Math.PI * 2)
  context.stroke()
  context.restore()
  // The tick, with a little leaf on its long stroke.
  context.lineWidth = 12
  context.strokeStyle = LEAF
  context.beginPath()
  context.moveTo(cx - 20, cy + 1)
  context.lineTo(cx - 5, cy + 16)
  context.lineTo(cx + 21, cy - 14)
  context.stroke()
  context.fillStyle = '#8cc35c'
  context.strokeStyle = LEAF
  context.lineWidth = 3
  context.save()
  context.translate(cx + 25, cy - 20)
  context.rotate(0.9)
  context.beginPath()
  context.moveTo(0, -11)
  context.quadraticCurveTo(9, 0, 0, 11)
  context.quadraticCurveTo(-9, 0, 0, -11)
  context.fill()
  context.stroke()
  context.restore()
  sealCache = finish(context, 'Plant fully grown seal')
  return sealCache
}

/** A four-point twinkle. */
function twinkle(context: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  context.beginPath()
  context.moveTo(x, y - r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.quadraticCurveTo(x, y, x, y + r)
  context.quadraticCurveTo(x, y, x - r, y)
  context.quadraticCurveTo(x, y, x, y - r)
  context.fill()
}

/** The ribbon banner that pops over a plant the moment it matures. */
export function maturityBannerTexture(): THREE.CanvasTexture {
  if (bannerCache) return bannerCache
  const w = BANNER_WIDTH
  const h = BANNER_HEIGHT
  const context = canvas2d(w, h, 'plant fully grown banner')
  const bandTop = 54
  const bandBottom = 190
  const bandLeft = 90
  const bandRight = w - 90

  // Forked ribbon ends, folded behind the band.
  for (const side of [-1, 1]) {
    const edge = side < 0 ? bandLeft : bandRight
    const out = edge + side * 78
    context.beginPath()
    context.moveTo(edge + side * -10, bandTop + 26)
    context.lineTo(out, bandTop + 26)
    context.lineTo(out - side * 30, (bandTop + bandBottom) / 2 + 13)
    context.lineTo(out, bandBottom + 26)
    context.lineTo(edge + side * -10, bandBottom + 26)
    context.closePath()
    context.fillStyle = TERRACOTTA_DARK
    context.fill()
    context.lineWidth = 7
    context.strokeStyle = BORDER
    context.stroke()
    // The fold's shadow triangle.
    context.beginPath()
    context.moveTo(edge, bandBottom)
    context.lineTo(edge + side * 24, bandBottom + 26)
    context.lineTo(edge, bandBottom + 26)
    context.closePath()
    context.fillStyle = '#5a2a1c'
    context.fill()
  }

  // Band shadow, band, rim.
  context.fillStyle = 'rgba(58, 36, 20, .25)'
  context.beginPath()
  context.roundRect(bandLeft, bandTop + 10, bandRight - bandLeft, bandBottom - bandTop, 22)
  context.fill()
  context.beginPath()
  context.roundRect(bandLeft, bandTop, bandRight - bandLeft, bandBottom - bandTop, 22)
  const paper = context.createLinearGradient(0, bandTop, 0, bandBottom)
  paper.addColorStop(0, '#fffaf0')
  paper.addColorStop(1, PAPER)
  context.fillStyle = paper
  context.fill()
  context.lineWidth = 8
  context.strokeStyle = BORDER
  context.stroke()
  context.save()
  context.setLineDash([14, 10])
  context.lineWidth = 4
  context.strokeStyle = DASH
  context.beginPath()
  context.roundRect(bandLeft + 14, bandTop + 14, bandRight - bandLeft - 28, bandBottom - bandTop - 28, 12)
  context.stroke()
  context.restore()

  // Lettering.
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `bold 64px ${FONT}`
  context.lineWidth = 10
  context.strokeStyle = PAPER
  context.strokeText('Fully grown!', w / 2, bandTop + 56)
  context.fillStyle = TERRACOTTA
  context.fillText('Fully grown!', w / 2, bandTop + 56)
  context.font = `italic 30px ${FONT}`
  context.fillStyle = BORDER
  context.fillText('No more care needed', w / 2, bandTop + 104)

  // Gold twinkles off the corners.
  context.fillStyle = GOLD
  context.strokeStyle = GOLD_DARK
  for (const [x, y, r] of [[bandLeft + 6, bandTop - 18, 20], [bandLeft + 46, bandTop - 34, 11], [bandRight - 10, bandBottom + 8, 18], [bandRight + 22, bandTop + 4, 12]] as const) {
    twinkle(context, x, y, r)
  }

  bannerCache = finish(context, 'Plant fully grown banner')
  return bannerCache
}

/** Free every cached cue texture; the next request redraws it. */
/** The withered badge: a dead plant slumped over its mound, on a paper disc with a walnut rim. */
export function witheredBadgeTexture(): THREE.CanvasTexture {
  if (witheredCache) return witheredCache
  const size = SEAL_SIZE
  const context = canvas2d(size, size, 'plant withered badge')
  const cx = size / 2
  const cy = size / 2
  context.beginPath()
  context.arc(cx, cy + 6, 74, 0, Math.PI * 2)
  context.fillStyle = 'rgba(58, 36, 20, .25)'
  context.fill()
  context.beginPath()
  context.arc(cx, cy, 74, 0, Math.PI * 2)
  context.fillStyle = PAPER
  context.fill()
  context.lineWidth = 7
  context.strokeStyle = BORDER
  context.stroke()
  context.save()
  context.setLineDash([8, 7])
  context.lineWidth = 3
  context.strokeStyle = DASH
  context.beginPath()
  context.arc(cx, cy, 60, 0, Math.PI * 2)
  context.stroke()
  context.restore()
  // The dirt mound it stands in.
  context.beginPath()
  context.ellipse(cx, cy + 40, 46, 15, 0, Math.PI, 0)
  context.closePath()
  context.fillStyle = '#8a6040'
  context.fill()
  context.lineWidth = 4
  context.strokeStyle = BORDER
  context.stroke()
  // The stem, bent over until its head hangs at the ground.
  context.lineWidth = 9
  context.strokeStyle = '#7d6235'
  context.beginPath()
  context.moveTo(cx - 6, cy + 34)
  context.bezierCurveTo(cx - 10, cy - 30, cx + 40, cy - 40, cx + 34, cy + 6)
  context.stroke()
  // Its dead head, hanging off the end.
  context.beginPath()
  context.ellipse(cx + 34, cy + 14, 9, 13, 0.2, 0, Math.PI * 2)
  context.fillStyle = '#a0784a'
  context.fill()
  context.lineWidth = 4
  context.strokeStyle = BORDER
  context.stroke()
  // Two curled, drooping leaves.
  const leaf = (x: number, y: number, angle: number): void => {
    context.save()
    context.translate(x, y)
    context.rotate(angle)
    context.beginPath()
    context.moveTo(0, 0)
    context.quadraticCurveTo(14, -12, 30, 4)
    context.quadraticCurveTo(14, 8, 0, 0)
    context.fillStyle = '#b08c5e'
    context.fill()
    context.lineWidth = 3
    context.strokeStyle = BORDER
    context.stroke()
    context.restore()
  }
  leaf(cx - 8, cy + 6, Math.PI * 0.8)
  leaf(cx + 2, cy - 14, Math.PI * 0.15)
  witheredCache = finish(context, 'Plant withered badge')
  return witheredCache
}

export function disposePlantCareArt(): void {
  for (const texture of careCache.values()) texture.dispose()
  careCache.clear()
  sealCache?.dispose()
  sealCache = null
  bannerCache?.dispose()
  bannerCache = null
  witheredCache?.dispose()
  witheredCache = null
}
