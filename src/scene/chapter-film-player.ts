import * as THREE from 'three'
import type { ChapterId } from '../game/farm-chapters'
import {
  CHAPTER_FILM_DURATION,
  chapterFilmAt,
  type ChapterFilmFrame,
} from '../game/chapter-film'
import { createChapterCard, type ChapterCard, type ChapterCardState } from '../ui/chapter-card-dom'
import type { CutscenePlayer } from './cutscene-kit'

/**
 * Plays a chapter's opening film on a camera the farm already owns.
 *
 * The film is a camera move plus the card, nothing else: the farm itself is
 * drawn by the game's normal render path, through `camera`. So `render()` is
 * a no-op, and the caller must skip its own camera updates while the film
 * plays (see CUTSCENE_PIPELINE.md, "Chapter films"). The camera's pose, fov
 * or frustum is saved on `start` and handed back exactly when the film ends or
 * is skipped.
 */

export interface ChapterFilmPlayerOptions {
  /** The camera the farm is drawn with: perspective or orthographic. */
  readonly camera: THREE.Camera
  /** Half the farm's width, in world units. Sets how far out each shot stands. */
  readonly farmRadius: number
}

export interface ChapterFilmPlayer extends CutscenePlayer {
  readonly id: ChapterId | null
  /** Seconds into the current film. */
  readonly time: number
  readonly duration: number
  /** Begin a chapter's film, restarting it if one is already playing. */
  start(id: ChapterId): void
  /** Advance the film and move the camera. Returns false once the film is done and the camera is back. */
  update(deltaSeconds: number): boolean
  /** Jump to the end and hand the camera back now. */
  skip(): void
  /** Hold the film at a moment (debug harness). `seconds` undefined resumes. */
  seek(seconds: number): void
  /** The frame currently on screen, for tests and the harness. */
  describe(): { id: ChapterId | null; time: number; caption: string | null; position: THREE.Vector3Tuple }
  dispose(): void
}

interface SavedPose {
  readonly position: THREE.Vector3
  readonly quaternion: THREE.Quaternion
  readonly fov: number | null
  /** An orthographic lens's frustum and zoom, so the farm's own framing comes back exactly. */
  readonly frustum: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number; readonly zoom: number } | null
}

export function createChapterFilmPlayer(options: ChapterFilmPlayerOptions): ChapterFilmPlayer {
  const { camera, farmRadius } = options
  const card: ChapterCard = createChapterCard()

  let id: ChapterId | null = null
  let time = 0
  let paused = false
  let finished = true
  let saved: SavedPose | null = null
  let lastFrame: ChapterFilmFrame | null = null

  function savePose(): void {
    saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : null,
      frustum: camera instanceof THREE.OrthographicCamera
        ? { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, zoom: camera.zoom }
        : null,
    }
  }

  function restorePose(): void {
    if (!saved) return
    camera.position.copy(saved.position)
    camera.quaternion.copy(saved.quaternion)
    if (camera instanceof THREE.PerspectiveCamera && saved.fov !== null) {
      camera.fov = saved.fov
      camera.updateProjectionMatrix()
    }
    if (camera instanceof THREE.OrthographicCamera && saved.frustum) {
      const { left, right, top, bottom, zoom } = saved.frustum
      Object.assign(camera, { left, right, top, bottom, zoom })
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
    saved = null
  }

  function applyFrame(frame: ChapterFilmFrame): void {
    lastFrame = frame
    camera.position.set(...frame.position)
    camera.lookAt(...frame.target)
    if (camera instanceof THREE.PerspectiveCamera) {
      if (camera.fov !== frame.fov) {
        camera.fov = frame.fov
        camera.updateProjectionMatrix()
      }
    } else if (camera instanceof THREE.OrthographicCamera) {
      // An orthographic lens has no perspective to dolly with, so the frame is
      // set from the shot: its height is distance * tan(fov / 2), the same frame
      // a perspective lens at this fov would show. A push-in shrinks it.
      const distance = camera.position.distanceTo(new THREE.Vector3(...frame.target))
      const halfHeight = Math.max(1e-3, distance * Math.tan(THREE.MathUtils.degToRad(frame.fov) / 2))
      const aspect = window.innerWidth / Math.max(1, window.innerHeight)
      Object.assign(camera, { top: halfHeight, bottom: -halfHeight, left: -halfHeight * aspect, right: halfHeight * aspect, zoom: 1 })
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
    card.setState(cardState(frame))
  }

  function cardState(frame: ChapterFilmFrame): ChapterCardState {
    const caption = frame.caption
    return {
      title: caption?.kind === 'title' ? { label: caption.label, title: caption.title, tagline: caption.tagline } : null,
      titleOpacity: caption?.kind === 'title' ? frame.captionOpacity : 0,
      line: caption?.kind === 'line' ? caption.text : null,
      lineOpacity: caption?.kind === 'line' ? frame.captionOpacity : 0,
      letterbox: frame.letterbox,
    }
  }

  function finish(): void {
    if (finished) return
    finished = true
    restorePose()
    card.setState({ title: null, titleOpacity: 0, line: null, lineOpacity: 0, letterbox: 0 })
  }

  return {
    get id() {
      return id
    },
    get time() {
      return time
    },
    duration: CHAPTER_FILM_DURATION,
    get done() {
      return finished
    },
    get loaded() {
      return true
    },
    start(next: ChapterId): void {
      if (finished) savePose()
      id = next
      time = 0
      paused = false
      finished = false
      applyFrame(chapterFilmAt(next, 0, farmRadius))
    },
    update(deltaSeconds: number): boolean {
      if (finished || id === null) return false
      card.update(deltaSeconds)
      if (!paused) time = Math.min(CHAPTER_FILM_DURATION, time + Math.max(0, deltaSeconds))
      applyFrame(chapterFilmAt(id, time, farmRadius))
      if (time >= CHAPTER_FILM_DURATION) {
        finish()
        return false
      }
      return true
    },
    seek(seconds: number): void {
      if (finished || id === null) return
      time = THREE.MathUtils.clamp(seconds, 0, CHAPTER_FILM_DURATION)
      paused = true
      applyFrame(chapterFilmAt(id, time, farmRadius))
    },
    load: async () => undefined,
    render(): void {
      // The farm is drawn by the game's own render path, through `camera`.
    },
    skip(): void {
      if (finished) return
      time = CHAPTER_FILM_DURATION
      finish()
    },
    flashSkipHint(): void {
      card.flashSkipHint()
    },
    resumeAudio(): void {
      // Chapter films are silent for now; the card is the whole story.
    },
    resize(): void {
      // The card is CSS-sized; the camera's aspect is the caller's to keep.
    },
    describe() {
      return {
        id,
        time,
        caption: lastFrame?.caption ? (lastFrame.caption.kind === 'title' ? lastFrame.caption.title : lastFrame.caption.text) : null,
        position: [camera.position.x, camera.position.y, camera.position.z],
      }
    },
    dispose(): void {
      finish()
      card.dispose()
    },
  }
}
