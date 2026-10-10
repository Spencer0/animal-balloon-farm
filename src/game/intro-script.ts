/**
 * The new-farm intro, as data.
 *
 * Everything the cutscene shows is a pure function of one number: seconds
 * since it started. Shots, camera moves, which clip each character is playing,
 * where the boy is standing, captions, fades and the broadcast camera inside
 * the TV all come out of `introFrameAt(t)`. No Three.js, no DOM, no clock.
 *
 * That is deliberate. The player can skip, the debug harness can seek, the
 * renderer can drop frames, and none of it can leave a limb mid-gesture or the
 * mailbox half open, because nothing accumulates. It also keeps the whole
 * cutscene testable in `tests/intro-script.test.mjs`.
 *
 * Positions are Three.js world units (Y up). The living room and the cottage
 * garden are built at the same origin and shown one at a time.
 */

export type Vec3 = readonly [number, number, number]

export type IntroSet = 'room' | 'exterior'

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

export interface IntroShot {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly set: IntroSet
  readonly camera: readonly CameraKey[]
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

// ------------------------------------------------------------------ layout --

/** Where the TV's screen is in the living room, and which way it faces (+Z). */
export const TV_SCREEN_CENTER: Vec3 = [-0.13, 0.8, -1.815]
/** The boy on the rug, facing the TV. */
export const BOY_ON_RUG: Vec3 = [0.05, 0, 0.45]
/** The mailbox post in the cottage garden, and the mouth its door opens on. */
export const MAILBOX_POST: Vec3 = [0.95, 0, 1.25]
export const MAILBOX_MOUTH: Vec3 = [0.69, 1.12, 1.25]
/** Where the boy stops to open the mailbox, facing +X. */
export const BOY_AT_MAILBOX: Vec3 = [0.4, 0, 1.08]

const screen = TV_SCREEN_CENTER
const boyHead: Vec3 = [BOY_ON_RUG[0], 0.74, BOY_ON_RUG[2]]

// ------------------------------------------------------------------- shots --

export const INTRO_SHOTS: readonly IntroShot[] = [
  {
    // Open on the broadcast filling the frame, hold, then pull back past the
    // boy's shoulder to reveal the dark living room lit by the set.
    id: 'broadcast',
    start: 0,
    end: 9.8,
    set: 'room',
    camera: [
      { t: 0, position: [screen[0], screen[1], screen[2] + 0.43], target: screen, fov: 50 },
      { t: 5.6, position: [screen[0] + 0.015, screen[1] + 0.006, screen[2] + 0.39], target: screen, fov: 50, ease: 'linear' },
      { t: 9.8, position: [0.78, 1.12, 1.95], target: [-0.14, 0.72, -1.6], fov: 36, ease: 'inOut' },
    ],
  },
  {
    // Reverse angle from the TV side: the boy's face in the glow of the set.
    id: 'why',
    start: 9.8,
    end: 14.4,
    set: 'room',
    camera: [
      { t: 9.8, position: [-0.72, 0.7, -0.6], target: [boyHead[0], boyHead[1] + 0.03, boyHead[2]], fov: 32 },
      { t: 14.4, position: [-0.58, 0.72, -0.42], target: [boyHead[0], boyHead[1] + 0.04, boyHead[2]], fov: 30, ease: 'inOut' },
    ],
  },
  {
    // The next morning. The mailbox flag pops up.
    id: 'mailbox-flag',
    start: 14.4,
    end: 17.4,
    set: 'exterior',
    camera: [
      { t: 14.4, position: [2.75, 1.42, 3.3], target: [0.95, 1.18, 1.25], fov: 32 },
      { t: 17.4, position: [2.35, 1.34, 2.8], target: [0.95, 1.2, 1.25], fov: 32, ease: 'out' },
    ],
  },
  {
    // Wide and low: the cottage door opens and the boy runs down the path.
    id: 'walk-out',
    start: 17.4,
    end: 22.6,
    set: 'exterior',
    camera: [
      { t: 17.4, position: [-2.3, 1.05, 1.15], target: [0, 1.0, -2.0], fov: 44 },
      { t: 22.6, position: [-1.55, 0.95, 1.55], target: [0.35, 0.85, 0.85], fov: 40, ease: 'inOut' },
    ],
  },
  {
    // Over the mailbox: the boy reaches for the door.
    id: 'open-mailbox',
    start: 22.6,
    end: 26.4,
    set: 'exterior',
    camera: [
      { t: 22.6, position: [1.8, 1.18, 0.5], target: [0.62, 0.98, 1.22], fov: 38 },
      { t: 26.4, position: [1.68, 1.14, 0.62], target: [0.62, 1.0, 1.22], fov: 36, ease: 'inOut' },
    ],
  },
  {
    // A two-shot over the fence: boy, kit and mailbox, as the kit floats out on its balloons.
    id: 'kit-reveal',
    start: 26.4,
    end: 32.4,
    set: 'exterior',
    camera: [
      { t: 26.4, position: [0.76, 1.55, 3.45], target: [0.62, 1.18, 1.05], fov: 38 },
      { t: 32.4, position: [0.64, 1.5, 3.2], target: [0.58, 1.22, 1.0], fov: 36, ease: 'inOut' },
    ],
  },
  {
    // Crane up into the morning sky, then white out into the game.
    id: 'send-off',
    start: 32.4,
    end: 35.6,
    set: 'exterior',
    camera: [
      { t: 32.4, position: [1.1, 1.3, 2.7], target: [0.5, 1.35, 1.0], fov: 40 },
      { t: 35.6, position: [1.2, 3.3, 4.6], target: [0.1, 3.4, -4.0], fov: 46, ease: 'inOut' },
    ],
  },
]

export const INTRO_DURATION = INTRO_SHOTS[INTRO_SHOTS.length - 1].end

/** The camera inside the TV studio. The broadcast only shows during 'broadcast'. */
export const BROADCAST_CAMERA: readonly CameraKey[] = [
  { t: 0, position: [0, 1.66, 4.3], target: [0, 1.5, 0], fov: 30 },
  { t: 3.8, position: [0, 1.66, 3.95], target: [0, 1.51, 0], fov: 30, ease: 'linear' },
  // The news-desk "punch in" as the decree lands.
  { t: 4.15, position: [0.08, 1.7, 3.0], target: [0, 1.6, 0], fov: 30, ease: 'out' },
  { t: 9.8, position: [0.12, 1.7, 2.8], target: [0, 1.61, 0], fov: 30, ease: 'linear' },
]

// -------------------------------------------------------------- performance --

export const PRESIDENT_CUES: readonly ClipCue[] = [
  { at: 0, clip: 'SPEECH', loop: true },
  { at: 3.85, clip: 'DECREE', loop: false, fade: 0.18 },
  { at: 7.6, clip: 'SPEECH', loop: true, fade: 0.5 },
]

export const BOY_CUES: readonly ClipCue[] = [
  { at: 0, clip: 'SIT', loop: true },
  { at: 10.5, clip: 'WHY', loop: false, fade: 0.2 },
  { at: 17.9, clip: 'WALK', loop: true, speed: 1.7, fade: 0 },
  { at: 22.3, clip: 'IDLE', loop: true, fade: 0.3 },
  { at: 22.75, clip: 'REACH', loop: false, fade: 0.25 },
  { at: 27.9, clip: 'WOW', loop: true, fade: 0.3 },
]

/** One-shot prop clips, each holding its first frame until it fires. */
export const PROP_CUES: readonly ClipCue[] = [
  { at: 15.55, clip: 'FLAG', loop: false },
  { at: 17.6, clip: 'DOOR_OPEN', loop: false },
  { at: 23.45, clip: 'MAIL_OPEN', loop: false },
]

/** Where the boy is. Before the walk he sits on the rug; in the garden he follows the path. */
export const BOY_PATH: readonly PoseKey[] = [
  { t: 0, position: BOY_ON_RUG, yaw: Math.PI },
  { t: 14.39, position: BOY_ON_RUG, yaw: Math.PI },
  // In the garden: just inside the cottage door until it opens.
  { t: 14.4, position: [0, 0, -2.86], yaw: 0, ease: 'linear' },
  { t: 17.9, position: [0, 0, -2.86], yaw: 0, ease: 'linear' },
  { t: 20.6, position: [0.06, 0, -0.1], yaw: 0, ease: 'linear' },
  { t: 21.9, position: [0.22, 0, 0.95], yaw: 0.35, ease: 'linear' },
  { t: 22.5, position: BOY_AT_MAILBOX, yaw: Math.PI / 2, ease: 'out' },
  // He turns to share the moment with the camera as the kit rises.
  { t: 27.9, position: BOY_AT_MAILBOX, yaw: Math.PI / 2 },
  { t: 28.6, position: BOY_AT_MAILBOX, yaw: 0.65 },
  { t: INTRO_DURATION, position: BOY_AT_MAILBOX, yaw: 0.65 },
]

/** The boy is out of sight indoors until the cottage door has swung open. */
export const BOY_HIDDEN: readonly (readonly [number, number])[] = [[14.4, 17.95]]

// ---------------------------------------------------------- the starter kit --

export interface KitState {
  readonly visible: boolean
  readonly position: Vec3
  /** Uniform scale of the crate and its balloons. */
  readonly scale: number
  /** 0 = flat, 1 = fully blown up, with a little overshoot on the way. */
  readonly balloonInflation: number
  /** Gentle sway, radians about the vertical. */
  readonly sway: number
}

const KIT_OUT_AT = 26.55
const KIT_INFLATE_SECONDS = 1.1
const KIT_RISE_AT = 27.4
const KIT_RISE_SECONDS = 2.2
const KIT_START: Vec3 = [MAILBOX_POST[0] - 0.05, 1.02, MAILBOX_POST[2]]
const KIT_OUT: Vec3 = [MAILBOX_MOUTH[0] - 0.12, 1.08, MAILBOX_MOUTH[2]]
const KIT_HOVER: Vec3 = [0.6, 1.24, 0.88]

export function kitStateAt(t: number): KitState {
  if (t < KIT_OUT_AT) return { visible: false, position: KIT_START, scale: 0.34, balloonInflation: 0, sway: 0 }
  const inflate = clamp01((t - KIT_OUT_AT) / KIT_INFLATE_SECONDS)
  const balloonInflation = easeOutBack(inflate)
  let position: Vec3 = lerp3(KIT_START, KIT_OUT, easeInOut(inflate))
  let scale = 0.34
  if (t > KIT_RISE_AT) {
    const rise = easeInOut(clamp01((t - KIT_RISE_AT) / KIT_RISE_SECONDS))
    position = lerp3(KIT_OUT, KIT_HOVER, rise)
    scale = 0.34 + (0.5 - 0.34) * rise
  }
  const bob = Math.sin((t - KIT_OUT_AT) * 2.1) * 0.025 * clamp01(t - KIT_RISE_AT)
  return {
    visible: true,
    position: [position[0], position[1] + bob, position[2]],
    scale,
    balloonInflation,
    sway: Math.sin((t - KIT_OUT_AT) * 1.3) * 0.12,
  }
}

// ---------------------------------------------------------------- captions --

export const INTRO_CAPTIONS: readonly Caption[] = [
  { start: 1.0, end: 3.7, style: 'speech', speaker: 'Le Président', spoken: 'Mes chers compatriotes…', text: 'My dear fellow citizens…' },
  { start: 3.9, end: 8.6, style: 'speech', speaker: 'Le Président', spoken: 'Tous les Ballonnais doivent désormais cultiver !', text: 'All balloon people must now farm!' },
  { start: 11.0, end: 14.2, style: 'speech', speaker: 'Le garçon', spoken: 'Pourquoi… ?', text: 'Why?' },
  { start: 14.6, end: 17.0, style: 'card', text: 'The next morning…', spoken: 'Le lendemain matin…' },
  { start: 28.8, end: 32.2, style: 'card', text: 'Garden Starter Kit', spoken: 'Kit de démarrage du jardin' },
]

// ------------------------------------------------------------------- sound --

export type IntroSound =
  | 'static' | 'jingle' | 'president-voice' | 'boy-voice' | 'boy-cheer'
  | 'morning' | 'flag' | 'door' | 'footsteps' | 'mailbox' | 'inflate' | 'sparkle' | 'whoosh'

export interface SoundCue {
  readonly at: number
  readonly sound: IntroSound
  /** Seconds the sound lasts, for voices, footsteps and ambience. */
  readonly duration?: number
}

/**
 * What you hear, and when. Voices line up with the captions, effects with the
 * prop clips that cause them; `tests/intro-script.test.mjs` holds them to it.
 */
export const SOUND_CUES: readonly SoundCue[] = [
  { at: 0, sound: 'static', duration: 0.95 },
  { at: 0.5, sound: 'jingle' },
  { at: 1.05, sound: 'president-voice', duration: 2.45 },
  { at: 3.95, sound: 'president-voice', duration: 4.2 },
  { at: 11.05, sound: 'boy-voice', duration: 0.75 },
  { at: 14.4, sound: 'morning', duration: INTRO_SHOTS[INTRO_SHOTS.length - 1].end - 14.4 },
  { at: 15.55, sound: 'flag' },
  { at: 17.6, sound: 'door' },
  { at: 18.05, sound: 'footsteps', duration: 4.3 },
  { at: 23.45, sound: 'mailbox' },
  { at: 26.55, sound: 'inflate', duration: 1.1 },
  { at: 27.95, sound: 'boy-cheer' },
  { at: 28.8, sound: 'sparkle' },
  { at: 34.3, sound: 'whoosh', duration: 1.3 },
]

/** Broadcast "lower third" lines drawn over the TV picture. */
export const BROADCAST_BANNER = {
  badge: 'EN DIRECT',
  title: 'ALLOCUTION DU PRÉSIDENT',
  ticker: 'ANNONCE OFFICIELLE  •  TOUS AU JARDIN  •  LES GRAINES SONT GRATUITES  •  ARROSEZ VOS PLANTES  •  ',
} as const

// ------------------------------------------------------------------ frames --

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

export interface IntroFrame {
  readonly t: number
  readonly shot: IntroShot
  readonly shotIndex: number
  readonly set: IntroSet
  readonly camera: CameraFrame
  readonly broadcast: CameraFrame
  /** 1 = full TV static, 0 = clean picture. */
  readonly broadcastStatic: number
  readonly president: readonly ClipState[]
  readonly boy: readonly ClipState[]
  readonly boyVisible: boolean
  readonly boyPosition: Vec3
  readonly boyYaw: number
  readonly props: readonly ClipState[]
  readonly kit: KitState
  readonly caption: Caption | null
  /** 0..1 caption opacity, for fades in and out. */
  readonly captionOpacity: number
  /** Letterbox bar height as a fraction of the screen height, per bar. */
  readonly letterbox: number
  /** Black over the picture: 1 at the very start. */
  readonly fadeBlack: number
  /** White over the picture: 1 at the very end, as the game takes over. */
  readonly fadeWhite: number
  readonly done: boolean
}

export function introFrameAt(rawT: number): IntroFrame {
  const t = Math.max(0, Math.min(INTRO_DURATION, rawT))
  const shotIndex = shotIndexAt(t)
  const shot = INTRO_SHOTS[shotIndex]
  const caption = captionAt(t)
  const pose = poseAt(BOY_PATH, t)
  return {
    t,
    shot,
    shotIndex,
    set: shot.set,
    camera: cameraAt(shot.camera, t),
    broadcast: cameraAt(BROADCAST_CAMERA, t),
    broadcastStatic: t < 0.45 ? 1 : 1 - clamp01((t - 0.45) / 0.5),
    president: clipStatesAt(PRESIDENT_CUES, t),
    boy: clipStatesAt(BOY_CUES, t),
    boyVisible: !BOY_HIDDEN.some(([from, to]) => t >= from && t < to),
    boyPosition: pose.position,
    boyYaw: pose.yaw,
    props: PROP_CUES.map((cue) => ({ clip: cue.clip, time: Math.max(0, t - cue.at) * (cue.speed ?? 1), loop: false, weight: 1 })),
    kit: kitStateAt(t),
    caption,
    captionOpacity: caption ? Math.min(clamp01((t - caption.start) / 0.3), clamp01((caption.end - t) / 0.35)) : 0,
    letterbox: 0.11 * easeInOut(clamp01(t / 1.2)),
    fadeBlack: 1 - clamp01((t - 0.15) / 0.9),
    fadeWhite: clamp01((t - (INTRO_DURATION - 1.15)) / 1.0),
    done: rawT >= INTRO_DURATION,
  }
}

export function shotIndexAt(t: number): number {
  for (let index = INTRO_SHOTS.length - 1; index >= 0; index -= 1) {
    if (t >= INTRO_SHOTS[index].start) return index
  }
  return 0
}

export function captionAt(t: number): Caption | null {
  return INTRO_CAPTIONS.find((caption) => t >= caption.start && t < caption.end) ?? null
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

function easeOutBack(u: number): number {
  const x = clamp01(u)
  const c = 1.9
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
}

function ease(kind: Ease, u: number): number {
  const x = clamp01(u)
  if (kind === 'linear') return x
  if (kind === 'out') return 1 - (1 - x) ** 3
  if (kind === 'in') return x * x * x
  return easeInOut(x)
}

function lerp3(a: Vec3, b: Vec3, u: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}
