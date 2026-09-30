/**
 * The game's pointers.
 *
 * The garden tools draw their own brush ring inside the 3D world and hide the OS
 * pointer over the whole canvas to make room for it. That was fine when the
 * canvas only ever showed the farm, but the menu, the journal and the viewer are
 * drawn over the same canvas -- so on those screens there was no pointer at all.
 *
 * The cursor therefore belongs to the UI layer: the farm's brush ring takes
 * priority, and whatever the UI is under the pointer gets to say what it wants.
 * `hand` is the fallback for any surface that has not asked for something
 * specific, which is most of the Blender-authored props -- a plank, a sign, a
 * mailbox. They have no cursor of their own, so they get the friendly hand.
 *
 * A cursor has to be an image the compositor owns, so this is the one piece of
 * the interface that is legitimately not Three.js geometry. Everything it draws
 * is still ours: no system arrow, no stock icon.
 */

export type UiCursorKind = 'hand' | 'point' | 'grab' | 'hidden' | 'default'

/**
 * The balloon bumblebee, baked by `art/blender/balloon_cursor.py`.
 *
 * The frames are authored and rendered in Blender rather than drawn here: the
 * bee is the same handmade balloon latex as the animals in the garden, so the
 * pointer belongs to the same workshop as everything else the player looks at.
 * Baking two PNGs also means there is nothing to load or render at startup.
 */
const FRAMES: Record<'hand' | 'point', string> = {
  hand: 'assets/cursors/bee-idle.png',
  point: 'assets/cursors/bee-excited.png',
}

/**
 * The hotspot, as a fraction of the frame. It sits on the bee's feet, low and
 * centred, so the pointer reads as a little character standing on the spot you
 * are pointing at rather than as an arrowhead hovering above it.
 */
const HOTSPOTS: Record<'hand' | 'point', { x: number; y: number }> = {
  hand: { x: 0.5, y: 0.92 },
  point: { x: 0.5, y: 0.9 },
}

/**
 * The frame size, in CSS pixels. It has to match the PNG exactly: CSS cannot
 * scale a cursor image, and the three-number `url(x y size)` form that *would*
 * let it is not supported in Chrome, so a mismatch here means the whole
 * declaration is dropped and the player gets no pointer at all.
 */
const CURSOR_SIZE = 64

const cache = new Map<UiCursorKind, string>()
let current: UiCursorKind | null = null
let target: HTMLCanvasElement | null = null

/**
 * Points `canvas` at one of the bee's frames. The URLs are built lazily and the
 * style is only written when the kind actually changes, so this is cheap enough
 * to call on every pointer move -- and it is, because a cursor that flickers
 * while you cross a signpost is worse than no cursor at all.
 */
export function setCursor(kind: UiCursorKind, canvas: HTMLCanvasElement): void {
  if (kind === current && canvas === target) return
  current = kind
  target = canvas
  if (kind === 'hidden') {
    canvas.style.cursor = 'none'
    return
  }
  if (kind === 'default' || kind === 'grab') {
    // `grab` is the same bee as `point`; the journal has no dragging surface
    // yet, so it is not a distinct frame.
    const frame = kind === 'default' ? 'hand' : 'point'
    apply(frame, canvas)
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
  // The `auto` tail is the real fallback: if the bee has not finished loading,
  // or fails to, the player gets the system arrow rather than nothing at all.
  canvas.style.cursor =
    `url(${url}) ${Math.round(hotspot.x * CURSOR_SIZE)} ${Math.round(hotspot.y * CURSOR_SIZE)}, auto`
}
