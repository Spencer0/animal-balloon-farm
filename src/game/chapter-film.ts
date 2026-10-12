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
 * ("Chapter N", the title, the tagline) in the middle, and one short line of
 * Pip's near the end. `chapter-film-player.ts` plays it on a camera and
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
  /** Vertical field of view, degrees. */
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

/** Camera keys over the farm, one shot per chapter, expressed in farm radii. */
type Shot = (radius: number) => readonly CameraKey[]

/** Keys on a circle around the farm centre, one every second, so the arc reads as a smooth orbit. */
function arc(
  radius: number,
  options: { readonly distance: number; readonly height: number; readonly from: number; readonly to: number; readonly fov: number; readonly lookHeight?: number },
): CameraKey[] {
  const steps = CHAPTER_FILM_DURATION
  const keys: CameraKey[] = []
  for (let index = 0; index <= steps; index += 1) {
    const u = index / steps
    const angle = options.from + (options.to - options.from) * u
    const distance = options.distance * radius
    keys.push({
      t: u * CHAPTER_FILM_DURATION,
      position: [Math.sin(angle) * distance, options.height * radius, Math.cos(angle) * distance],
      target: [0, (options.lookHeight ?? 0) * radius, 0],
      fov: options.fov,
      ease: 'linear',
    })
  }
  return keys
}

const SHOTS: Readonly<Record<ChapterId, Shot>> = {
  // A slow, high orbit: the whole garden laid out below.
  garden: (r) => arc(r, { distance: 1.5, height: 0.95, from: 0.3, to: 1.0, fov: 40 }),
  // A low sweep across the lawn, from one side of the farm to the other.
  land: (r) => [
    { t: 0, position: [-1.1 * r, 0.1 * r, 0.7 * r], target: [-0.4 * r, 0.06 * r, 0], fov: 36, ease: 'inOut' },
    { t: 3.5, position: [0, 0.1 * r, 0.75 * r], target: [0, 0.06 * r, 0], fov: 36, ease: 'inOut' },
    { t: CHAPTER_FILM_DURATION, position: [1.1 * r, 0.1 * r, 0.7 * r], target: [0.4 * r, 0.06 * r, 0], fov: 36, ease: 'inOut' },
  ],
  // A push-in toward the houses, the middle of the farm.
  care: (r) => [
    { t: 0, position: [0, 0.5 * r, 1.4 * r], target: [0, 0.1 * r, 0], fov: 38, ease: 'inOut' },
    { t: CHAPTER_FILM_DURATION, position: [0, 0.5 * r, 0.75 * r], target: [0, 0.1 * r, 0], fov: 38, ease: 'inOut' },
  ],
  // A dusk pull-back: start close to the animals, end wide on the whole farm.
  husbandry: (r) => [
    { t: 0, position: [0.25 * r, 0.25 * r, 0.6 * r], target: [0, 0.05 * r, 0], fov: 44, ease: 'inOut' },
    { t: CHAPTER_FILM_DURATION, position: [0.9 * r, 0.7 * r, 1.7 * r], target: [0, 0.05 * r, 0], fov: 44, ease: 'inOut' },
  ],
  // A wide, golden-hour circle round the whole farm.
  harmony: (r) => arc(r, { distance: 1.35, height: 0.55, from: 0, to: 2.2, fov: 42 }),
  // A night-sky tilt-up: low by the fence, the view rising to the stars.
  mythical: (r) => [
    { t: 0, position: [0, 0.12 * r, 0.9 * r], target: [0, 0.3 * r, 0], fov: 52, ease: 'inOut' },
    { t: CHAPTER_FILM_DURATION, position: [0, 0.12 * r, 0.9 * r], target: [0, 2.5 * r, 0], fov: 52, ease: 'inOut' },
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
