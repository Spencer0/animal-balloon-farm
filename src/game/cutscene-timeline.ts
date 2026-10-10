/**
 * The shared grammar of the game's cutscenes, as data and pure maths.
 *
 * A cutscene is a function of one number, seconds since it started. Shots
 * hold camera keys, characters hold clip cues and pose keys, captions hold
 * their own windows. Nothing here touches Three.js or the DOM, so every film
 * built on it can be seeked, skipped and unit-tested the same way. See
 * `intro-script.ts` and `tool-unlock-script.ts`.
 *
 * Positions are Three.js world units (Y up).
 */

export type Vec3 = readonly [number, number, number]

export type Ease = 'linear' | 'inOut' | 'out' | 'in'

export interface CameraKey {
  /** Absolute seconds. */
  readonly t: number
  readonly position: Vec3
  readonly target: Vec3
  /** Vertical field of view, degrees. */
  readonly fov: number
  /** How this key is approached from the previous one. */
  readonly ease?: Ease
}

export interface ClipCue {
  readonly at: number
  readonly clip: string
  readonly loop: boolean
  /** Playback rate; 1 is the authored 24 fps. */
  readonly speed?: number
  /** Seconds to crossfade in from the previous cue. */
  readonly fade?: number
}

export interface Caption {
  readonly start: number
  readonly end: number
  /** The English line, shown large. */
  readonly text: string
  /** The French line as spoken, shown small above it. */
  readonly spoken?: string
  /** 'speech' sits in the lower letterbox bar; 'card' is a centred title card. */
  readonly style: 'speech' | 'card'
  readonly speaker?: string
}

export interface PoseKey {
  readonly t: number
  readonly position: Vec3
  /** Radians about +Y; 0 faces +Z. */
  readonly yaw: number
  readonly ease?: Ease
}

export interface CameraFrame {
  readonly position: Vec3
  readonly target: Vec3
  readonly fov: number
}

export interface ClipState {
  readonly clip: string
  /** Seconds into the clip, before any loop wrap; the renderer wraps or clamps. */
  readonly time: number
  readonly loop: boolean
  readonly weight: number
}

/** The caption showing at `t`, if any. */
export function captionIn(captions: readonly Caption[], t: number): Caption | null {
  return captions.find((caption) => t >= caption.start && t < caption.end) ?? null
}

/** 0..1 caption opacity: a short fade in and a slightly longer fade out. */
export function captionOpacityAt(caption: Caption | null, t: number): number {
  return caption ? Math.min(clamp01((t - caption.start) / 0.3), clamp01((caption.end - t) / 0.35)) : 0
}

export function cameraAt(keys: readonly CameraKey[], t: number): CameraFrame {
  if (t <= keys[0].t) return keys[0]
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index]
    if (t > next.t) continue
    const previous = keys[index - 1]
    const u = ease(next.ease ?? 'inOut', (t - previous.t) / Math.max(1e-6, next.t - previous.t))
    return {
      position: lerp3(previous.position, next.position, u),
      target: lerp3(previous.target, next.target, u),
      fov: previous.fov + (next.fov - previous.fov) * u,
    }
  }
  return keys[keys.length - 1]
}

export function poseAt(keys: readonly PoseKey[], t: number): { position: Vec3; yaw: number } {
  if (t <= keys[0].t) return keys[0]
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index]
    if (t > next.t) continue
    const previous = keys[index - 1]
    const u = ease(next.ease ?? 'inOut', (t - previous.t) / Math.max(1e-6, next.t - previous.t))
    return { position: lerp3(previous.position, next.position, u), yaw: previous.yaw + (next.yaw - previous.yaw) * u }
  }
  return keys[keys.length - 1]
}

/**
 * The clip a character is playing at `t`, plus the one it is fading out of.
 * Weights always sum to 1, and a cue's clip time starts at zero on its `at`.
 */
export function clipStatesAt(cues: readonly ClipCue[], t: number): ClipState[] {
  let current = 0
  for (let index = 0; index < cues.length; index += 1) if (t >= cues[index].at) current = index
  const cue = cues[current]
  const local = (cue: ClipCue): number => Math.max(0, t - cue.at) * (cue.speed ?? 1)
  const fade = cue.fade ?? 0
  const blend = current === 0 || fade <= 0 ? 1 : clamp01((t - cue.at) / fade)
  const states: ClipState[] = [{ clip: cue.clip, time: local(cue), loop: cue.loop, weight: blend }]
  if (blend < 1) {
    const previous = cues[current - 1]
    states.push({ clip: previous.clip, time: local(previous), loop: previous.loop, weight: 1 - blend })
  }
  return states
}

// ------------------------------------------------------------------- maths --

export function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value
}

export function easeInOut(u: number): number {
  const x = clamp01(u)
  return x * x * (3 - 2 * x)
}


export function ease(kind: Ease, u: number): number {
  const x = clamp01(u)
  if (kind === 'linear') return x
  if (kind === 'out') return 1 - (1 - x) ** 3
  if (kind === 'in') return x * x * x
  return easeInOut(x)
}

export function lerp3(a: Vec3, b: Vec3, u: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}
