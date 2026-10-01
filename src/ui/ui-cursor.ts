/**
 * The game's pointers. The farm tools may draw their own in-world cursor; small
 * task-specific cursors are used for planting, watering, and pruning.
 */

export type UiCursorKind = 'hand' | 'point' | 'grab' | 'hidden' | 'default' | 'plant' | 'prune' | 'water' | 'select' | 'camera'

const FRAMES: Record<'hand' | 'point', string> = {
  hand: 'assets/cursors/bee-idle.png',
  point: 'assets/cursors/bee-excited.png',
}

const HOTSPOTS: Record<'hand' | 'point', { x: number; y: number }> = {
  hand: { x: 0.5, y: 0.92 },
  point: { x: 0.5, y: 0.9 },
}
const CURSOR_SIZE = 64
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
  if (kind === 'select') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path d="M8 5v25l7-7 5 11 5-2-5-11h10L8 5Z" fill="#fff4d5" stroke="#654b34" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 8v17l5-5 5 11 2-1-5-11h7L10 8Z" fill="#d6ae71"/></svg>'
    canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 5, pointer`
    return
  }
  if (kind === 'hand' || kind === 'default') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="44" viewBox="0 0 40 44"><path d="M8 20a3 3 0 0 1 6 0v-9a3 3 0 0 1 6 0v7-11a3 3 0 0 1 6 0v11-7a3 3 0 0 1 6 0v11-4a3 3 0 0 1 6 0v10c0 8-5 13-12 13h-3c-5 0-8-2-11-7l-5-8a3 3 0 0 1 5-3l2 3Z" fill="#fff4d5" stroke="#654b34" stroke-width="2.5" stroke-linejoin="round"/><path d="M11 20v6m6-15v13m6-16v15m6-11v11m6-4v5" fill="none" stroke="#d6ae71" stroke-width="1.5" stroke-linecap="round"/></svg>'
    canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 11 10, pointer`
    return
  }
  if (kind === 'camera') {
    // The camera tool turns the pointer into the camera itself; the hotspot is
    // the lens, so aiming the cursor aims the shot.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="40" viewBox="0 0 44 40"><path d="M5 13a4 4 0 0 1 4-4h3l2.4-4h15.2L32 9h3a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V13Z" fill="#fff4d5" stroke="#654b34" stroke-width="2.5" stroke-linejoin="round"/><circle cx="22" cy="21" r="8.5" fill="#8fd3de" stroke="#654b34" stroke-width="2.5"/><circle cx="22" cy="21" r="3.2" fill="#fff4d5" stroke="#654b34" stroke-width="1.6"/><circle cx="33" cy="14" r="2.2" fill="#e8b45c" stroke="#654b34" stroke-width="1.4"/></svg>'
    canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 22 21, crosshair`
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
  if (kind === 'grab') {
    apply('point', canvas)
    return
  }
  apply(kind, canvas)
}

function apply(kind: 'hand' | 'point', canvas: HTMLCanvasElement): void {
  let url = cache.get(kind)
  if (url === undefined) {
    url = FRAMES[kind]
    cache.set(kind, url)
  }
  const hotspot = HOTSPOTS[kind]
  canvas.style.cursor = `url(${url}) ${Math.round(hotspot.x * CURSOR_SIZE)} ${Math.round(hotspot.y * CURSOR_SIZE)}, auto`
}
