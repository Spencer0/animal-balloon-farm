/**
 * The tool-unlock cutscene, as data.
 *
 * One film plays whenever Pip sells the player a tool: the boy from the intro
 * walks up to the counter, Pip ducks under it and comes up with the tool, the
 * boy takes it, turns it over in his hands, and cheers. Only the tool, its
 * name and the boy's last line change from tool to tool, so each new tool is
 * one entry in `TOOL_UNLOCK_FILMS`. CUTSCENE_PIPELINE.md walks through adding
 * one.
 *
 * Like the intro, every frame is a pure function of seconds since the start
 * (`toolUnlockFrameAt`). No Three.js, no DOM, tested in
 * `tests/tool-unlock-script.test.mjs`.
 *
 * Positions are Three.js world units (Y up). The shop counter runs along X at
 * z = -0.6. Pip stands behind it and the boy in front, facing each other.
 */

import type { GardenToolId } from '../scene/garden-tool-art'
import {
  cameraAt,
  captionIn,
  captionOpacityAt,
  clamp01,
  clipStatesAt,
  easeInOut,
  poseAt,
  type CameraFrame,
  type CameraKey,
  type Caption,
  type ClipCue,
  type ClipState,
  type PoseKey,
  type Vec3,
} from './cutscene-timeline'
import type { SoundCue } from './intro-script'
import type { GrassPack, UpgradeId } from './tool-unlocks'

// ------------------------------------------------------------ the tool table --

/** Shop upgrades that are not tools, and so get no film. */
export type NonToolUpgrade = 'land-deed'

/**
 * Every tool upgrade must have a film: adding an id to `UpgradeId` without an
 * entry here (or in `NonToolUpgrade`) is a compile error.
 */
export type ToolUnlockId = Exclude<UpgradeId, NonToolUpgrade>

/**
 * How the tool sits in a fist. Applied in the hand's frame, where -Y runs
 * down the forearm to the knuckles and -Z is the way the palm faces.
 */
export interface ToolGrip {
  readonly offset: Vec3
  /** Euler XYZ, radians. */
  readonly rotation: Vec3
  readonly scale: number
}

export interface ToolUnlockFilm {
  readonly id: ToolUnlockId
  /** The game's own tool model, built by `createGardenToolModel`. */
  readonly tool: GardenToolId
  readonly pack?: GrassPack
  /** The title card, in English, and as it is spoken in French. */
  readonly title: string
  readonly titleSpoken: string
  /** The boy's cheer at the end. */
  readonly cheer: string
  readonly cheerSpoken: string
  readonly grip: ToolGrip
}

export const TOOL_UNLOCK_FILMS: Readonly<Record<ToolUnlockId, ToolUnlockFilm>> = {
  shovel: {
    id: 'shovel',
    tool: 'shovel',
    title: 'The Shovel',
    titleSpoken: 'La Pelle',
    cheer: 'Time to dig in!',
    cheerSpoken: 'Au travail, on creuse !',
    grip: { offset: [0, -0.09, 0], rotation: [Math.PI / 2, 0, 0], scale: 0.44 },
  },
  'water-bucket': {
    id: 'water-bucket',
    tool: 'water',
    title: 'The Water Bucket',
    titleSpoken: 'Le Seau d’eau',
    cheer: 'A pond of my very own!',
    cheerSpoken: 'Une mare rien qu’à moi !',
    grip: { offset: [0, -0.09, 0], rotation: [Math.PI, 0, 0], scale: 0.44 },
  },
  'tall-grass': {
    id: 'tall-grass',
    tool: 'grass',
    pack: 'tall',
    title: 'Tall Grass Seed Pack',
    titleSpoken: 'Graines d’herbe haute',
    cheer: 'A meadow up to my knees!',
    cheerSpoken: 'Une prairie jusqu’aux genoux !',
    grip: { offset: [0, -0.09, 0], rotation: [Math.PI, 0, 0], scale: 0.44 },
  },
  snower: {
    id: 'snower',
    tool: 'snower',
    title: 'The Snower',
    titleSpoken: 'La Souffleuse à neige',
    cheer: 'Snow in the garden!',
    cheerSpoken: 'De la neige au jardin !',
    grip: { offset: [0, -0.09, 0], rotation: [Math.PI / 2, 0, 0], scale: 0.44 },
  },
}

/** The film for a shop purchase, or null when the upgrade is not a tool. */
export function toolUnlockFilmFor(id: UpgradeId): ToolUnlockFilm | null {
  return id in TOOL_UNLOCK_FILMS ? TOOL_UNLOCK_FILMS[id as ToolUnlockId] : null
}

// ------------------------------------------------------------------ layout --

export const COUNTER_Z = -0.6
/** Pip behind the counter, facing the shop floor (+Z). */
export const PIP_SPOT: Vec3 = [0.05, 0, -1.2]
/** The boy in front of the counter, facing Pip (-Z). */
export const BOY_AT_COUNTER: Vec3 = [0.05, 0, 0]
/** Where the boy comes in, at the front left of the shop. */
export const BOY_ENTERS: Vec3 = [-1.65, 0, 2.6]
/** Turned round to face the shop floor for the cheer. */
export const BOY_CHEERS: Vec3 = [0.05, 0, 0.12]
export const BOY_CHEER_YAW = 0.3

const boyHead: Vec3 = [BOY_AT_COUNTER[0], 1.0, BOY_AT_COUNTER[2]]

// ------------------------------------------------------------------- shots --

export interface ToolUnlockShot {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly camera: readonly CameraKey[]
}

export const TOOL_UNLOCK_SHOTS: readonly ToolUnlockShot[] = [
  {
    // Wide from the front right: the boy crosses the shop to the counter while
    // Pip waves him over.
    id: 'enter',
    start: 0,
    end: 3.4,
    camera: [
      { t: 0, position: [2.3, 1.55, 3.3], target: [-0.35, 0.85, 0.2], fov: 40 },
      { t: 3.4, position: [1.85, 1.38, 2.6], target: [0.05, 0.92, -0.55], fov: 37, ease: 'inOut' },
    ],
  },
  {
    // In profile along the counter: Pip comes up with the tool and hands it over.
    id: 'handover',
    start: 3.4,
    end: 6.4,
    camera: [
      { t: 3.4, position: [3.0, 1.42, -0.3], target: [0.05, 1.06, -0.6], fov: 34 },
      { t: 6.4, position: [2.75, 1.36, -0.32], target: [0.05, 1.06, -0.58], fov: 32, ease: 'inOut' },
    ],
  },
  {
    // From behind the counter, past Pip: the boy turns his new tool over.
    id: 'inspect',
    start: 6.4,
    end: 9.6,
    camera: [
      { t: 6.4, position: [-0.8, 1.2, -1.55], target: [boyHead[0], 0.98, boyHead[2] - 0.1], fov: 36 },
      { t: 9.6, position: [-0.68, 1.16, -1.38], target: [boyHead[0], 1.0, boyHead[2] - 0.1], fov: 34, ease: 'inOut' },
    ],
  },
  {
    // Low and in front: he turns to us, throws it up over his head, and Pip claps.
    id: 'cheer',
    start: 9.6,
    end: 12.8,
    camera: [
      { t: 9.6, position: [1.0, 0.95, 2.3], target: [0.05, 1.22, -0.2], fov: 44 },
      { t: 12.8, position: [0.82, 0.92, 2.0], target: [0.05, 1.26, -0.25], fov: 42, ease: 'inOut' },
    ],
  },
]

export const TOOL_UNLOCK_DURATION = TOOL_UNLOCK_SHOTS[TOOL_UNLOCK_SHOTS.length - 1].end

// -------------------------------------------------------------- performance --

export const TOOL_BOY_CUES: readonly ClipCue[] = [
  { at: 0, clip: 'IDLE', loop: true },
  { at: 0.3, clip: 'WALK', loop: true, speed: 1.7, fade: 0.2 },
  { at: 3.0, clip: 'IDLE', loop: true, fade: 0.3 },
  { at: 4.3, clip: 'TAKE', loop: false, fade: 0.2 },
  { at: 5.8, clip: 'INSPECT', loop: true, fade: 0.25 },
  { at: 9.65, clip: 'CHEER', loop: true, fade: 0.2 },
]

export const PIP_CUES: readonly ClipCue[] = [
  { at: 0, clip: 'IDLE', loop: true },
  { at: 0.9, clip: 'WAVE', loop: true, fade: 0.25 },
  { at: 2.6, clip: 'IDLE', loop: true, fade: 0.35 },
  { at: 3.3, clip: 'OFFER', loop: false, fade: 0.2 },
  { at: 5.3, clip: 'IDLE', loop: true, fade: 0.45 },
  { at: 9.8, clip: 'CLAP', loop: true, fade: 0.2 },
]

/** The boy's walk from the door to the counter. */
export const TOOL_BOY_PATH: readonly PoseKey[] = [
  { t: 0, position: BOY_ENTERS, yaw: Math.atan2(BOY_AT_COUNTER[0] - BOY_ENTERS[0], BOY_AT_COUNTER[2] - BOY_ENTERS[2]) },
  { t: 0.3, position: BOY_ENTERS, yaw: Math.atan2(BOY_AT_COUNTER[0] - BOY_ENTERS[0], BOY_AT_COUNTER[2] - BOY_ENTERS[2]) },
  { t: 2.75, position: [BOY_AT_COUNTER[0] - 0.05, 0, BOY_AT_COUNTER[2] + 0.12], yaw: 2.9, ease: 'linear' },
  { t: 3.15, position: BOY_AT_COUNTER, yaw: Math.PI, ease: 'out' },
  // He turns round to show it off, a half step from the counter.
  { t: 9.45, position: BOY_AT_COUNTER, yaw: Math.PI },
  { t: 9.95, position: BOY_CHEERS, yaw: BOY_CHEER_YAW, ease: 'out' },
  { t: TOOL_UNLOCK_DURATION, position: BOY_CHEERS, yaw: BOY_CHEER_YAW },
]

// ------------------------------------------------------------------ the tool --

export interface ToolState {
  readonly visible: boolean
  /** 0 = in Pip's fist, 1 = in the boy's; in between it is passed across. */
  readonly handoff: number
  /** Radians the boy has turned it about its own up axis. */
  readonly spin: number
  /** Grows in as Pip lifts it from under the counter. */
  readonly scale: number
}

/** Pip has it under the counter by now, out of sight. */
const TOOL_APPEARS = 3.55
const HANDOFF_START = 4.75
const HANDOFF_SECONDS = 0.4
const SPIN_START = 6.3
const SPIN_END = 9.4

export function toolStateAt(t: number): ToolState {
  const spinU = easeInOut(clamp01((t - SPIN_START) / (SPIN_END - SPIN_START)))
  return {
    visible: t >= TOOL_APPEARS,
    handoff: easeInOut(clamp01((t - HANDOFF_START) / HANDOFF_SECONDS)),
    // Once round and a bit back, so it ends showing its best side.
    spin: spinU * Math.PI * 2 + Math.sin(spinU * Math.PI) * 0.6,
    scale: easeInOut(clamp01((t - TOOL_APPEARS) / 0.25)),
  }
}

// ---------------------------------------------------------------- captions --

export function toolUnlockCaptions(film: ToolUnlockFilm): readonly Caption[] {
  return [
    { start: 1.2, end: 3.3, style: 'speech', speaker: 'Pip', spoken: 'Ah, te voilà ! J’ai quelque chose pour toi.', text: 'There you are! I’ve got something for you.' },
    { start: 6.7, end: 9.3, style: 'card', text: film.title, spoken: film.titleSpoken },
    { start: 9.9, end: 12.1, style: 'speech', speaker: 'Le garçon', spoken: film.cheerSpoken, text: film.cheer },
  ]
}

// ------------------------------------------------------------------- sound --

export const TOOL_UNLOCK_SOUND_CUES: readonly SoundCue[] = [
  { at: 0, sound: 'morning', duration: TOOL_UNLOCK_DURATION },
  { at: 0.15, sound: 'shop-bell' },
  { at: 0.35, sound: 'footsteps', duration: 2.6 },
  { at: 1.25, sound: 'pip-voice', duration: 1.9 },
  { at: 6.75, sound: 'sparkle' },
  { at: 9.75, sound: 'boy-cheer' },
  { at: 11.8, sound: 'whoosh', duration: 1.0 },
]

// ------------------------------------------------------------------ frames --

export interface ToolUnlockFrame {
  readonly t: number
  readonly shot: ToolUnlockShot
  readonly shotIndex: number
  readonly camera: CameraFrame
  readonly boy: readonly ClipState[]
  readonly boyPosition: Vec3
  readonly boyYaw: number
  readonly pip: readonly ClipState[]
  readonly pipPosition: Vec3
  readonly pipYaw: number
  readonly tool: ToolState
  readonly caption: Caption | null
  readonly captionOpacity: number
  /** Letterbox bar height as a fraction of the screen height, per bar. */
  readonly letterbox: number
  readonly fadeBlack: number
  readonly fadeWhite: number
  readonly done: boolean
}

export function toolUnlockFrameAt(film: ToolUnlockFilm, rawT: number): ToolUnlockFrame {
  const t = Math.max(0, Math.min(TOOL_UNLOCK_DURATION, rawT))
  const shotIndex = toolUnlockShotIndexAt(t)
  const shot = TOOL_UNLOCK_SHOTS[shotIndex]
  const caption = captionIn(toolUnlockCaptions(film), t)
  const pose = poseAt(TOOL_BOY_PATH, t)
  return {
    t,
    shot,
    shotIndex,
    camera: cameraAt(shot.camera, t),
    boy: clipStatesAt(TOOL_BOY_CUES, t),
    boyPosition: pose.position,
    boyYaw: pose.yaw,
    pip: clipStatesAt(PIP_CUES, t),
    pipPosition: PIP_SPOT,
    pipYaw: 0,
    tool: toolStateAt(t),
    caption,
    captionOpacity: captionOpacityAt(caption, t),
    letterbox: 0.11 * easeInOut(clamp01(t / 0.8)),
    fadeBlack: 1 - clamp01((t - 0.05) / 0.6),
    fadeWhite: clamp01((t - (TOOL_UNLOCK_DURATION - 1.05)) / 0.95),
    done: rawT >= TOOL_UNLOCK_DURATION,
  }
}

export function toolUnlockShotIndexAt(t: number): number {
  for (let index = TOOL_UNLOCK_SHOTS.length - 1; index >= 0; index -= 1) {
    if (t >= TOOL_UNLOCK_SHOTS[index].start) return index
  }
  return 0
}
