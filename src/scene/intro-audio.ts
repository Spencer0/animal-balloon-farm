import { SOUND_CUES, type SoundCue } from '../game/intro-script'

/**
 * The intro's soundtrack, synthesised with Web Audio: no sound files.
 *
 * Every sound is a few oscillators and a noise buffer shaped to fit the
 * balloon world -- voices are rubbery squeaks, footsteps are little rubber
 * chirps, the morning has birdsong and an accordion waltz. What plays when
 * comes from `SOUND_CUES` in the pure script; this file only turns cues into
 * sound. Sounds are scheduled a moment ahead on the audio clock as the film's
 * time crosses them, so a dropped frame never delays a footstep.
 */

export interface IntroAudio {
  /** Call every frame with the film's time; schedules what is about to sound. */
  update(seconds: number): void
  /** Silence everything and pick up from a new time (seek or skip). */
  jump(seconds: number): void
  /** Browsers start audio suspended until a key or click; call on input. */
  resume(): void
  dispose(): void
}

const LOOKAHEAD = 0.15
const MASTER_VOLUME = 0.55

// A short musette waltz in C, three beats to the bar: [midi note, beats].
const WALTZ_TEMPO = 138
const WALTZ_MELODY: readonly (readonly [number, number])[] = [
  [76, 1], [79, 1], [84, 1], [83, 1], [81, 1], [79, 1], [81, 1], [77, 1], [74, 1], [79, 3],
  [77, 1], [76, 1], [74, 1], [76, 1], [79, 1], [84, 1], [83, 1], [79, 1], [74, 1], [72, 3],
]
const WALTZ_BARS: readonly (readonly [number, readonly number[]])[] = [
  [48, [60, 64, 67]], [43, [59, 62, 67]], [41, [57, 60, 65]], [43, [59, 62, 65]],
  [43, [59, 62, 65]], [48, [60, 64, 67]], [43, [59, 62, 67]], [48, [60, 64, 67]],
]

const midiHz = (note: number): number => 440 * 2 ** ((note - 69) / 12)

/** Deterministic noise, so a seek replays the same babble. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createIntroAudio(): IntroAudio | null {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  const context = new AudioContextClass()
  const master = context.createGain()
  master.gain.value = MASTER_VOLUME
  // A gentle bus compressor keeps the jingle and the cheer from clipping.
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -16
  compressor.ratio.value = 3
  master.connect(compressor).connect(context.destination)

  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  {
    const data = noise.getChannelData(0)
    const random = seeded(77)
    for (let index = 0; index < data.length; index += 1) data[index] = random() * 2 - 1
  }

  // Everything goes through a per-session bus, so a jump can fade it all out.
  let bus = context.createGain()
  bus.connect(master)
  let lastTime = 0
  /** The film's time as of this update; sounds are placed relative to it, so
   * the film's clock and the audio clock never drift apart. */
  let filmNow = 0

  const at = (filmSeconds: number): number => context.currentTime + Math.max(0, filmSeconds - filmNow)

  function envelope(gain: GainNode, start: number, attack: number, hold: number, release: number, peak: number): void {
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + attack)
    gain.gain.setValueAtTime(peak, start + attack + hold)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + release)
  }

  function tone(type: OscillatorType, frequency: number, start: number, length: number, peak: number, destination: AudioNode = bus): OscillatorNode {
    const osc = context.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, start)
    const gain = context.createGain()
    envelope(gain, start, Math.min(0.02, length * 0.2), Math.max(0, length * 0.5), Math.max(0.03, length * 0.5), peak)
    osc.connect(gain).connect(destination)
    osc.start(start)
    osc.stop(start + length + 0.1)
    return osc
  }

  function noiseBurst(start: number, length: number, peak: number, filter: BiquadFilterType, frequency: number, q = 0.8): BiquadFilterNode {
    const source = context.createBufferSource()
    source.buffer = noise
    source.loop = true
    const shaped = context.createBiquadFilter()
    shaped.type = filter
    shaped.frequency.setValueAtTime(frequency, start)
    shaped.Q.value = q
    const gain = context.createGain()
    envelope(gain, start, 0.01, length * 0.4, length * 0.6, peak)
    source.connect(shaped).connect(gain).connect(bus)
    source.start(start, Math.random() * 1.5)
    source.stop(start + length + 0.1)
    return shaped
  }

  /** One rubbery syllable: a pitch glide through a vowel-ish band. */
  function squeak(start: number, base: number, length: number, peak: number, rise: number): void {
    const osc = context.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(base, start)
    osc.frequency.exponentialRampToValueAtTime(base * rise, start + length * 0.6)
    osc.frequency.exponentialRampToValueAtTime(base * (rise > 1 ? 0.92 : 1.08), start + length)
    const vibrato = context.createOscillator()
    vibrato.frequency.value = 22
    const depth = context.createGain()
    depth.gain.value = base * 0.03
    vibrato.connect(depth).connect(osc.frequency)
    const formant = context.createBiquadFilter()
    formant.type = 'bandpass'
    formant.frequency.value = base * 3.2
    formant.Q.value = 1.4
    const gain = context.createGain()
    envelope(gain, start, 0.015, length * 0.55, length * 0.35, peak)
    osc.connect(formant).connect(gain).connect(bus)
    osc.connect(gain)
    osc.start(start)
    vibrato.start(start)
    osc.stop(start + length + 0.05)
    vibrato.stop(start + length + 0.05)
  }

  function voice(cue: SoundCue, base: number, syllable: number, seed: number): void {
    const random = seeded(seed + Math.round(cue.at * 100))
    let t = 0
    const duration = cue.duration ?? 1
    while (t < duration - 0.05) {
      const length = syllable * (0.7 + random() * 0.7)
      const start = cue.at + t
      if (start > lastTime - 0.02) squeak(at(start), base * (0.85 + random() * 0.4), Math.min(length, duration - t), 0.22, random() > 0.5 ? 1.25 : 0.82)
      t += length + (random() < 0.18 ? 0.12 : 0.025)
    }
  }

  function accordion(note: number, start: number, length: number, peak: number): void {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 2400
    const gain = context.createGain()
    envelope(gain, start, 0.04, length * 0.6, length * 0.4, peak)
    filter.connect(gain).connect(bus)
    for (const detune of [-7, 7]) {
      const osc = context.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = midiHz(note)
      osc.detune.value = detune
      osc.connect(filter)
      osc.start(start)
      osc.stop(start + length + 0.1)
    }
  }

  /** The waltz and the birds, as a list of timed events across the cue. */
  function morningEvents(cue: SoundCue): { time: number; play: (when: number) => void }[] {
    const events: { time: number; play: (when: number) => void }[] = []
    const beat = 60 / WALTZ_TEMPO
    const end = cue.at + (cue.duration ?? 0)
    const start = cue.at + 0.6
    const loopBeats = WALTZ_BARS.length * 3
    for (let loopStart = start; loopStart < end; loopStart += loopBeats * beat) {
      WALTZ_BARS.forEach(([bass, chord], bar) => {
        const barTime = loopStart + bar * 3 * beat
        events.push({ time: barTime, play: (when) => accordion(bass, when, beat * 0.9, 0.05) })
        for (const offbeat of [1, 2]) events.push({ time: barTime + offbeat * beat, play: (when) => chord.forEach((note) => accordion(note, when, beat * 0.55, 0.018)) })
      })
      let melodyTime = loopStart
      for (const [note, beats] of WALTZ_MELODY) {
        const time = melodyTime
        events.push({ time, play: (when) => accordion(note, when, beats * beat * 0.92, 0.045) })
        melodyTime += beats * beat
      }
    }
    const random = seeded(31)
    for (let time = cue.at + 0.3; time < end; time += 0.9 + random() * 2.2) {
      const pitch = 2400 + random() * 1600
      const chirps = 2 + Math.floor(random() * 3)
      events.push({ time, play: (when) => {
        for (let index = 0; index < chirps; index += 1) {
          const osc = context.createOscillator()
          osc.type = 'sine'
          const s = when + index * 0.09
          osc.frequency.setValueAtTime(pitch, s)
          osc.frequency.exponentialRampToValueAtTime(pitch * 1.35, s + 0.05)
          const gain = context.createGain()
          envelope(gain, s, 0.005, 0.02, 0.04, 0.025)
          osc.connect(gain).connect(bus)
          osc.start(s)
          osc.stop(s + 0.1)
        }
      } })
    }
    return events.filter((event) => event.time < end)
  }

  const scheduled = new Set<string>()
  const morning = SOUND_CUES.find((cue) => cue.sound === 'morning')
  const morningSchedule = morning ? morningEvents(morning) : []

  function play(cue: SoundCue): void {
    const when = at(cue.at)
    switch (cue.sound) {
      case 'static':
        noiseBurst(when, cue.duration ?? 0.9, 0.18, 'highpass', 1800)
        break
      case 'jingle':
        // The evening-news sting: a bright brassy arpeggio.
        ;[72, 76, 79, 84, 79, 84].forEach((note, index) => {
          tone('square', midiHz(note), when + index * 0.11, index === 5 ? 0.5 : 0.1, 0.05)
          tone('sawtooth', midiHz(note - 12), when + index * 0.11, index === 5 ? 0.5 : 0.1, 0.03)
        })
        break
      case 'president-voice':
        voice(cue, 210, 0.15, 11)
        break
      case 'boy-voice': {
        // "Pour-quoi?": two syllables, the second lifting into a question.
        squeak(when, 420, 0.24, 0.26, 0.9)
        squeak(when + 0.3, 400, 0.42, 0.28, 1.6)
        break
      }
      case 'boy-cheer':
        squeak(when, 430, 0.18, 0.26, 1.3)
        squeak(when + 0.22, 520, 0.5, 0.28, 1.5)
        break
      case 'flag':
        // A springy boing and a little bell.
        {
          const osc = tone('sine', 220, when, 0.4, 0.2)
          osc.frequency.exponentialRampToValueAtTime(520, when + 0.08)
          osc.frequency.exponentialRampToValueAtTime(330, when + 0.4)
          for (const [ratio, peak] of [[1, 0.09], [2.76, 0.03], [5.4, 0.015]] as const) tone('sine', 1320 * ratio, when + 0.06, 0.9, peak)
        }
        break
      case 'door': {
        const creak = context.createOscillator()
        creak.type = 'sawtooth'
        creak.frequency.setValueAtTime(140, when)
        creak.frequency.linearRampToValueAtTime(95, when + 0.55)
        creak.frequency.linearRampToValueAtTime(120, when + 0.75)
        const band = context.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = 900
        band.Q.value = 4
        const gain = context.createGain()
        envelope(gain, when, 0.05, 0.5, 0.25, 0.06)
        creak.connect(band).connect(gain).connect(bus)
        creak.start(when)
        creak.stop(when + 0.9)
        break
      }
      case 'footsteps': {
        const step = 0.29
        for (let t = 0; t < (cue.duration ?? 0); t += step) {
          if (cue.at + t < lastTime - 0.02) continue
          const s = at(cue.at + t)
          squeak(s, 700 + (Math.round(t / step) % 2) * 90, 0.06, 0.08, 1.4)
          noiseBurst(s, 0.05, 0.05, 'lowpass', 600)
        }
        break
      }
      case 'mailbox':
        noiseBurst(when, 0.12, 0.2, 'bandpass', 1400, 2)
        tone('sine', 180, when, 0.25, 0.18)
        tone('triangle', 640, when + 0.01, 0.35, 0.05)
        break
      case 'inflate':
        // Three balloons blowing up, one after another, and a squeaky tie-off.
        for (let index = 0; index < 3; index += 1) {
          const s = when + index * 0.28
          const osc = context.createOscillator()
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(180 + index * 40, s)
          osc.frequency.exponentialRampToValueAtTime(900 + index * 160, s + 0.5)
          const gain = context.createGain()
          envelope(gain, s, 0.03, 0.35, 0.15, 0.07)
          osc.connect(gain).connect(bus)
          osc.start(s)
          osc.stop(s + 0.6)
          noiseBurst(s, 0.5, 0.04, 'bandpass', 2600, 1.2)
        }
        break
      case 'sparkle':
        ;[84, 88, 91, 96, 91, 96].forEach((note, index) => tone('sine', midiHz(note), when + index * 0.07, 0.6, 0.05))
        break
      case 'whoosh': {
        const filter = noiseBurst(when, cue.duration ?? 1.2, 0.16, 'bandpass', 300, 1.5)
        filter.frequency.exponentialRampToValueAtTime(5000, when + (cue.duration ?? 1.2))
        break
      }
      case 'morning':
        break
    }
  }

  function update(seconds: number): void {
    if (context.state === 'closed') return
    filmNow = seconds
    const horizon = seconds + LOOKAHEAD
    SOUND_CUES.forEach((cue, index) => {
      const key = `cue-${index}`
      if (scheduled.has(key) || cue.at > horizon) return
      scheduled.add(key)
      // A cue long past (after a seek) stays silent; a voice or footsteps
      // already underway pick up from the current syllable.
      const lasting = cue.duration !== undefined && cue.at + cue.duration > seconds
      if (cue.at >= lastTime - 0.05 || lasting) play(cue)
    })
    morningSchedule.forEach((event, index) => {
      const key = `morning-${index}`
      if (scheduled.has(key) || event.time > horizon) return
      scheduled.add(key)
      if (event.time >= seconds - 0.05) event.play(at(event.time))
    })
    lastTime = seconds
  }

  return {
    update,
    jump(seconds: number): void {
      // Fade the old bus out and start a fresh one; scheduled nodes on the old
      // bus play into silence and are collected.
      const old = bus
      old.gain.setTargetAtTime(0, context.currentTime, 0.04)
      window.setTimeout(() => old.disconnect(), 400)
      bus = context.createGain()
      bus.connect(master)
      scheduled.clear()
      filmNow = seconds
      lastTime = seconds
      // Anything that starts before `seconds` is marked done, except lasting cues.
      SOUND_CUES.forEach((cue, index) => { if (cue.at < seconds && !(cue.duration && cue.at + cue.duration > seconds)) scheduled.add(`cue-${index}`) })
      morningSchedule.forEach((event, index) => { if (event.time < seconds) scheduled.add(`morning-${index}`) })
    },
    resume(): void {
      if (context.state === 'suspended') void context.resume()
    },
    dispose(): void {
      master.gain.setTargetAtTime(0, context.currentTime, 0.05)
      window.setTimeout(() => void context.close(), 300)
    },
  }
}
