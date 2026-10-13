/**
 * The short film that opens each chapter (GAME_VISION.md, "3. Introduce").
 *
 * Pure data and maths, like the other films' scripts: no Three.js, no DOM.
 * Every frame is a pure function of seconds since the film started
 * (`chapterFilmAt`), so a film can be skipped, seeked and tested the same way
 * as the intro and the tool unlock. The camera looks over the player's own
 * farm, so every shot is built from the farm's radius, in world units.
 *
 * Each film is seven seconds: a camera move over the farm, a title card
 * ("Chapter N", the title, the tagline) in the lower third, and one short line
 * of Pip's near the end. `chapter-film-player.ts` plays it on a camera and
 * `ui/chapter-card-dom.ts` draws the card.
 */

import { CHAPTERS, type ChapterId } from './farm-chapters'
import { cameraAt, clamp01, type CameraKey, type Vec3 } from './cutscene-timeline'

export const CHAPTER_FILM_DURATION = 7
/** The moment the title card sits fully on screen. Tests and the harness hold here. */
export const CHAPTER_TITLE_AT = 2.2
/** Letterbox bar height as a fraction of the screen height, at full frame. */
export const CHAPTER_LETTERBOX = 0.11

export interface ChapterTitleCaption {
  readonly kind: 'title'
  readonly start: number
  readonly end: number
  /** "Chapter 2". */
  readonly label: string
  readonly title: string
  readonly tagline: string
}

export interface ChapterLineCaption {
  readonly kind: 'line'
  readonly start: number
  readonly end: number
  readonly text: string
}

export type ChapterFilmCaption = ChapterTitleCaption | ChapterLineCaption

export interface ChapterFilmFrame {
  readonly position: Vec3
  readonly target: Vec3
  /**
   * Vertical field of view, degrees. An orthographic camera reads the same
   * number as its frame: half the height is distance * tan(fov / 2).
   */
  readonly fov: number
  readonly letterbox: number
  readonly caption: ChapterFilmCaption | null
  /** 0..1 opacity of the caption. */
  readonly captionOpacity: number
  readonly done: boolean
}

/** Pip's one line per chapter. Original text, written for this game. */
const CHAPTER_LINES: Readonly<Record<ChapterId, string>> = {
  garden: 'Water it, wait a while, and see what comes up.',
  land: 'Green from fence to fence. Who will come to graze?',
  care: 'A full belly makes a generous neighbour.',
  husbandry: 'Keep the hungry ones fed, and keep an eye on the hedge.',
  harmony: 'Every creature has a part in the tune.',
  mythical: 'Look up. Something bright is answering.',
}

const TITLE_START = 0.3
const TITLE_END = 4.2
const LINE_START = 4.6
const LINE_END = 6.8
const FADE_IN = 0.35
const FADE_OUT = 0.4
const LETTERBOX_FADE = 0.5

/** A chapter's shot: its camera keys over a farm of the given radius. */
type Shot = (radius: number) => readonly CameraKey[]

/**
 * Every shot looks down on the plot from the same side the gameplay camera
 * uses, at a steep pitch (40 to 60 degrees), so the frame stays over the
 * farm's grass and never reaches the edge of the world or the ground under it.
 * A shallow pitch is what showed the slab's side and the void beyond it.
 */

/** The eye's distance from its look-at point, in farm radii. Sets the lens with `height`. */
const EYE_DISTANCE = 3

/** Degrees to radians. */
const DEG = Math.PI / 180

/** One view: where the eye orbits from, how steeply it looks down, how much of the farm the frame holds. */
interface Look {
  /** Degrees round the farm, from +z toward +x. The gameplay camera sits near 37 degrees. */
  readonly azimuth: number
  /** Degrees above the ground, looking down. Gameplay is about 30; films stay at 40 to 60. */
  readonly pitch: number
  /** Half the frame's height, in farm radii. About 1.1 fills a farm; 2 is the gameplay view. */
  readonly height: number
  /** The point looked at, in farm radii. */
  readonly target: readonly [number, number, number]
  /** The eye's distance from the point, in farm radii. A push-in shortens it. Defaults to EYE_DISTANCE. */
  readonly distance?: number
}

/** The camera key for a look at time `t`. The lens is set so the frame is `height` radii tall. */
function lookKey(r: number, t: number, look: Look, ease: CameraKey['ease'] = 'inOut'): CameraKey {
  const azimuth = DEG * look.azimuth
  const pitch = DEG * look.pitch
  const reach = look.distance ?? EYE_DISTANCE
  const distance = reach * r
  const flat = Math.cos(pitch) * distance
  const target: Vec3 = [look.target[0] * r, look.target[1] * r, look.target[2] * r]
  return {
    t,
    position: [target[0] + Math.sin(azimuth) * flat, target[1] + Math.sin(pitch) * distance, target[2] + Math.cos(azimuth) * flat],
    target,
    fov: 2 * Math.atan(look.height / reach) / DEG,
    ease,
  }
}

/** A slow orbit: a key every second, so the arc reads as a smooth turn. */
function orbit(r: number, from: Look, to: Look): CameraKey[] {
  const keys: CameraKey[] = []
  for (let index = 0; index <= CHAPTER_FILM_DURATION; index += 1) {
    const u = index / CHAPTER_FILM_DURATION
    keys.push(lookKey(r, index, {
      azimuth: from.azimuth + (to.azimuth - from.azimuth) * u,
      pitch: from.pitch + (to.pitch - from.pitch) * u,
      height: from.height + (to.height - from.height) * u,
      target: from.target,
    }, 'linear'))
  }
  return keys
}

const SHOTS: Readonly<Record<ChapterId, Shot>> = {
  // A slow, high turn: the whole garden laid out below.
  garden: (r) => orbit(r,
    { azimuth: 18, pitch: 50, height: 1.1, target: [0, 0.05, 0] },
    { azimuth: 78, pitch: 50, height: 1.1, target: [0, 0.05, 0] }),
  // A sweep across the lawn, from one side of the plot to the other.
  land: (r) => [
    lookKey(r, 0, { azimuth: -26, pitch: 44, height: 1.15, target: [-0.25, 0.05, 0] }),
    lookKey(r, 3.5, { azimuth: 0, pitch: 44, height: 1.15, target: [0, 0.05, 0] }),
    lookKey(r, CHAPTER_FILM_DURATION, { azimuth: 26, pitch: 44, height: 1.15, target: [0.25, 0.05, 0] }),
  ],
  // A push-in on the middle of the farm, steadily closer.
  care: (r) => [
    lookKey(r, 0, { azimuth: 30, pitch: 48, height: 1.4, target: [0, 0.05, 0] }),
    lookKey(r, CHAPTER_FILM_DURATION, { azimuth: 30, pitch: 48, height: 0.95, target: [0, 0.05, 0], distance: 2.2 }),
  ],
  // A dusk pull-back: start close to the animals, end wide on the whole farm.
  husbandry: (r) => [
    lookKey(r, 0, { azimuth: 60, pitch: 42, height: 0.85, target: [0.1, 0.05, 0.05] }),
    lookKey(r, CHAPTER_FILM_DURATION, { azimuth: 15, pitch: 46, height: 1.45, target: [0, 0.05, 0], distance: 3.2 }),
  ],
  // A wide, golden-hour turn round the whole farm.
  harmony: (r) => orbit(r,
    { azimuth: 0, pitch: 52, height: 1.3, target: [0, 0.05, 0] },
    { azimuth: 150, pitch: 52, height: 1.3, target: [0, 0.05, 0] }),
  // A night-sky tilt: the view lowers toward the far side of the farm, and the
  // frame rises to the stars above it.
  mythical: (r) => [
    lookKey(r, 0, { azimuth: 30, pitch: 58, height: 1.2, target: [0, 0.05, 0] }),
    lookKey(r, CHAPTER_FILM_DURATION, { azimuth: 30, pitch: 40, height: 1.2, target: [0, 0.25, -0.3] }),
  ],
}

/** The captions of a chapter's film. Independent of the farm's size. */
export function chapterFilmCaptions(id: ChapterId): readonly ChapterFilmCaption[] {
  const chapter = CHAPTERS[id]
  return [
    { kind: 'title', start: TITLE_START, end: TITLE_END, label: `Chapter ${chapter.number}`, title: chapter.title, tagline: chapter.tagline },
    { kind: 'line', start: LINE_START, end: LINE_END, text: CHAPTER_LINES[id] },
  ]
}

/** The camera keys of a chapter's film, over a farm of the given radius (world units). */
export function chapterFilmCamera(id: ChapterId, farmRadius: number): readonly CameraKey[] {
  return SHOTS[id](Math.max(1, farmRadius))
}

const memo = new Map<string, readonly CameraKey[]>()

/**
 * The camera pose, letterbox and caption at `seconds` into a chapter's film.
 * Seconds below zero hold the first frame; past the end the film is done and
 * holds its last frame.
 */
export function chapterFilmAt(id: ChapterId, seconds: number, farmRadius: number): ChapterFilmFrame {
  const t = Math.max(0, Math.min(CHAPTER_FILM_DURATION, seconds))
  const key = `${id}:${farmRadius}`
  let keys = memo.get(key)
  if (!keys) {
    keys = chapterFilmCamera(id, farmRadius)
    memo.set(key, keys)
  }
  const pose = cameraAt(keys, t)
  const caption = chapterFilmCaptions(id).find((entry) => t >= entry.start && t < entry.end) ?? null
  const captionOpacity = caption
    ? Math.min(clamp01((t - caption.start) / FADE_IN), clamp01((caption.end - t) / FADE_OUT))
    : 0
  const letterbox = CHAPTER_LETTERBOX * Math.min(clamp01(t / LETTERBOX_FADE), clamp01((CHAPTER_FILM_DURATION - t) / LETTERBOX_FADE))
  return {
    position: pose.position,
    target: pose.target,
    fov: pose.fov,
    letterbox,
    caption,
    captionOpacity,
    done: seconds >= CHAPTER_FILM_DURATION,
  }
}
