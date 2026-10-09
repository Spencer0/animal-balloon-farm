/**
 * The game's pointers. The farm tools may draw their own in-world cursor; small
 * task-specific cursors are used for planting, watering, and pruning.
 */

/**
 * Two balloon mouse cursors carry every state of "where can I click":
 *   idle   the resting red balloon arrow, over the world and over anything inert,
 *   point  the same balloon, lit up, over anything that answers a click.
 * 'hidden' gives the pointer to the farm tool's brush ring, and the three
 * action cursors (plant, prune, water) say what a click on a plant will do.
 */
export type UiCursorKind = 'idle' | 'point' | 'hidden' | 'plant' | 'prune' | 'water'

type BalloonCursor = 'idle' | 'point'

const FRAMES: Record<BalloonCursor, string> = {
  idle: 'assets/cursors/balloon-mouse-idle.png',
  point: 'assets/cursors/balloon-mouse-point.png',
}

// Pixel hotspot: the arrow's tip, as printed by art/blender/balloon_mouse_cursor.py.
const HOTSPOT = { x: 16, y: 6 }

const cache = new Map<UiCursorKind, string>()
let current: UiCursorKind | null = null
let target: HTMLCanvasElement | null = null

export function setCursor(kind: UiCursorKind, canvas: HTMLCanvasElement): void {
  if (kind === current && canvas === target) return
  current = kind
  target = canvas
  if (kind === 'hidden') {
    canvas.style.cursor = 'none'
    return
  }
  if (kind === 'plant') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="19" r="17" fill="#fff5dc" stroke="#63894d" stroke-width="3"/><path d="M20 27V17m0 4c-7 0-10-4-10-9 6 0 10 3 10 9Zm0-2c0-7 4-11 10-11 0 6-3 10-10 11Z" fill="#79ad58" stroke="#426b3d" stroke-width="1.5" stroke-linejoin="round"/><path d="M11 29h18" stroke="#9a7049" stroke-width="3" stroke-linecap="round"/></svg>'
    canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 20 30, crosshair`
    return
  }
  if (kind === 'prune' || kind === 'water') {
    const glyph = kind === 'prune' ? '✂' : '💧'
    canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="#fff5dc" stroke="${kind === 'prune' ? '#ae7044' : '#438e9c'}" stroke-width="3"/><text x="18" y="25" text-anchor="middle" font-size="21">${glyph}</text></svg>`)}") 18 18, pointer`
    return
  }
  apply(kind, canvas)
}

function apply(kind: BalloonCursor, canvas: HTMLCanvasElement): void {
  let url = cache.get(kind)
  if (url === undefined) {
    url = FRAMES[kind]
    cache.set(kind, url)
  }
  canvas.style.cursor = `url(${url}) ${HOTSPOT.x} ${HOTSPOT.y}, auto`
}
