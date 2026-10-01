/**
 * The cinematic camera tour.
 *
 * Sequence and framing only, on purpose: this module never sees a Three.js
 * camera, a clock or the DOM. It decides what to look at, for how long, and
 * how tightly to orbit; the renderer owns the easing and the actual camera.
 * That split keeps the "screensaver" deterministic enough to unit test while
 * the scene around it is free to change.
 *
 * The tour alternates a wide farm vista with a close pass over one animal,
 * so it reads as a slow tour of the place rather than one endless zoom.
 */

export interface CameraTourSubject {
  readonly id: string
  /** Feet position, in world units. */
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface CameraTourShot {
  readonly view: 'vista' | 'subject'
  /** The animal a subject shot is tracking; null for a vista. */
  readonly subject: CameraTourSubject | null
  /** Absolute height the camera should look at, in world units. */
  readonly lookAtHeight: number
  /** Framing height the orthographic view should ease toward. */
  readonly viewHeight: number
  /** Current orbit angle around the look-at point, radians. */
  readonly orbitAngle: number
  /** Radians per second; negative orbits the other way. */
  readonly orbitSpeed: number
  /** Seconds this shot has been running. */
  readonly seconds: number
  /** Seconds this shot wants to last. */
  readonly duration: number
}

export interface CameraTour {
  /** Readable state, for the debug harness and for tests. */
  readonly view: 'vista' | 'subject'
  readonly subjectId: string | null
  tick(deltaSeconds: number, subjects: readonly CameraTourSubject[]): CameraTourShot
}

/** The farm's default framing: the whole fairground fits in one shot. */
export const CAMERA_TOUR_VISTA_HEIGHT = 39.5

const SUBJECT_VIEW_HEIGHT_MIN = 7.2
const SUBJECT_VIEW_HEIGHT_MAX = 10.4
const VISTA_SECONDS_MIN = 9
const VISTA_SECONDS_MAX = 15
const SUBJECT_SECONDS_MIN = 7
const SUBJECT_SECONDS_MAX = 12
const SUBJECT_LOOK_HEIGHT = 1.05
const VISTA_LOOK_HEIGHT = 1.25
const VISTA_ORBIT_SPEED_MIN = 0.042
const VISTA_ORBIT_SPEED_MAX = 0.068
const SUBJECT_ORBIT_SPEED_MIN = 0.085
const SUBJECT_ORBIT_SPEED_MAX = 0.152

/** A tiny deterministic PRNG, so a seed replays the same tour exactly. */
function createRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createCameraTour(seed: number): CameraTour {
  const random = createRandom(seed)
  const pick = (min: number, max: number): number => min + random() * (max - min)
  const direction = (): number => (random() < 0.5 ? -1 : 1)

  let view: 'vista' | 'subject' = 'vista'
  /** Kept even while on a vista, so the next animal is never the last one. */
  let subjectId: string | null = null
  let seconds = 0
  let duration = pick(VISTA_SECONDS_MIN, VISTA_SECONDS_MAX)
  // Start from wherever the seed lands; from then on the angle keeps
  // advancing, so a subject change never snaps the horizon around.
  let orbitAngle = random() * Math.PI * 2
  let orbitSpeed = direction() * pick(VISTA_ORBIT_SPEED_MIN, VISTA_ORBIT_SPEED_MAX)
  let viewHeight = CAMERA_TOUR_VISTA_HEIGHT

  function enterVista(): void {
    view = 'vista'
    seconds = 0
    duration = pick(VISTA_SECONDS_MIN, VISTA_SECONDS_MAX)
    orbitSpeed = direction() * pick(VISTA_ORBIT_SPEED_MIN, VISTA_ORBIT_SPEED_MAX)
    viewHeight = CAMERA_TOUR_VISTA_HEIGHT
  }

  function enterSubject(subject: CameraTourSubject): void {
    view = 'subject'
    subjectId = subject.id
    seconds = 0
    duration = pick(SUBJECT_SECONDS_MIN, SUBJECT_SECONDS_MAX)
    orbitSpeed = direction() * pick(SUBJECT_ORBIT_SPEED_MIN, SUBJECT_ORBIT_SPEED_MAX)
    viewHeight = pick(SUBJECT_VIEW_HEIGHT_MIN, SUBJECT_VIEW_HEIGHT_MAX)
  }

  function chooseSubject(subjects: readonly CameraTourSubject[]): CameraTourSubject | null {
    if (subjects.length === 0) return null
    // Never pin the same animal twice in a row while there is an alternative.
    const alternatives = subjects.filter((subject) => subject.id !== subjectId)
    const pool = alternatives.length > 0 ? alternatives : subjects
    return pool[Math.floor(random() * pool.length)]
  }

  function advance(subjects: readonly CameraTourSubject[]): void {
    if (view === 'subject') {
      enterVista()
      return
    }
    const subject = chooseSubject(subjects)
    if (subject) enterSubject(subject)
    else enterVista()
  }

  return {
    get view(): 'vista' | 'subject' { return view },
    get subjectId(): string | null { return subjectId },
    tick(deltaSeconds, subjects): CameraTourShot {
      if (view === 'subject') {
        // A sold animal must not drag the shot off the farm. Switch to another
        // one right away, or fall back to a vista when the farm is empty.
        const tracked = subjectId === null ? null : subjects.find((subject) => subject.id === subjectId) ?? null
        if (!tracked) {
          const replacement = chooseSubject(subjects)
          if (replacement) enterSubject(replacement)
          else enterVista()
        }
      }
      seconds += deltaSeconds
      if (seconds >= duration) advance(subjects)
      orbitAngle += orbitSpeed * deltaSeconds

      const subject = view === 'subject' && subjectId !== null
        ? subjects.find((entry) => entry.id === subjectId) ?? null
        : null
      // The tracked animal can still be removed by the tick above; if it is,
      // report the vista framing honestly rather than pointing at stale data.
      if (view === 'subject' && !subject) {
        enterVista()
      }
      return {
        view,
        subject,
        lookAtHeight: subject ? subject.y + SUBJECT_LOOK_HEIGHT : VISTA_LOOK_HEIGHT,
        viewHeight,
        orbitAngle,
        orbitSpeed,
        seconds,
        duration,
      }
    },
  }
}
