/**
 * Sounds for the plant-care minigames, synthesised with Web Audio like the
 * intro's (no sound files): rubbery, short and a little silly. One context,
 * made on first use, which is always inside a click, so browsers let it play.
 */

export type CareSound =
  | 'sting' | 'swat' | 'whiff' | 'chomp' | 'harm' | 'snip' | 'squish'
  | 'tap' | 'downpour' | 'win' | 'lose' | 'pop'
  // chop
  | 'chopSnap' | 'chopPerfect' | 'chopGood' | 'chopMiss' | 'chopThud'

export interface CareSfx {
  play(sound: CareSound, pitch?: number): void
  /** A held beetle buzz, 0 (silent) to 1. */
  buzz(level: number): void
  stopAll(): void
}

const MASTER = 0.42

let context: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null

function audio(): { context: AudioContext; master: GainNode; noise: AudioBuffer } | null {
  if (!context) {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    try {
      context = new AudioContextClass()
    } catch {
      return null
    }
    master = context.createGain()
    master.gain.value = MASTER
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -14
    master.connect(compressor)
    compressor.connect(context.destination)
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const data = noise.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  }
  if (context.state === 'suspended') void context.resume()
  return context && master && noise ? { context, master, noise } : null
}

function tone(type: OscillatorType, from: number, to: number, start: number, seconds: number, peak: number): void {
  const kit = audio()
  if (!kit) return
  const { context: ctx, master: out } = kit
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  osc.connect(gain)
  gain.connect(out)
  osc.start(start)
  osc.stop(start + seconds + 0.02)
}

function hiss(start: number, seconds: number, peak: number, filter: BiquadFilterType, from: number, to: number, q = 1): void {
  const kit = audio()
  if (!kit) return
  const { context: ctx, master: out, noise: buffer } = kit
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const band = ctx.createBiquadFilter()
  band.type = filter
  band.Q.value = q
  band.frequency.setValueAtTime(from, start)
  band.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  source.connect(band)
  band.connect(gain)
  gain.connect(out)
  source.start(start, Math.random() * 0.5)
  source.stop(start + seconds + 0.02)
}

const NOTE = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

let buzzOsc: OscillatorNode | null = null
let buzzGain: GainNode | null = null

export function createCareSfx(): CareSfx {
  return {
    play(sound, pitch = 1): void {
      const kit = audio()
      if (!kit) return
      const now = kit.context.currentTime + 0.005
      switch (sound) {
        case 'sting':
          [72, 76, 79].forEach((note, index) => tone('square', NOTE(note), NOTE(note), now + index * 0.07, 0.09, 0.12))
          tone('triangle', NOTE(84), NOTE(84), now + 0.21, 0.22, 0.18)
          break
        case 'swat':
          hiss(now, 0.12, 0.6, 'bandpass', 1800, 500, 0.8)
          tone('sine', 180, 45, now, 0.16, 0.7)
          break
        case 'whiff':
          hiss(now, 0.16, 0.18, 'bandpass', 600, 2400, 2)
          break
        case 'chomp':
          tone('square', 320, 260, now, 0.05, 0.12)
          tone('square', 240, 200, now + 0.07, 0.05, 0.12)
          break
        case 'harm':
          tone('triangle', 220, 110, now, 0.28, 0.35)
          tone('square', 110, 90, now, 0.18, 0.08)
          break
        case 'snip':
          hiss(now, 0.05, 0.35, 'highpass', 4000, 6000)
          tone('sine', 2400 * pitch, 1800 * pitch, now, 0.12, 0.12)
          break
        case 'squish':
          hiss(now, 0.2, 0.4, 'lowpass', 1200, 200, 2)
          tone('sine', 300, 90, now, 0.2, 0.3)
          break
        case 'tap':
          tone('sine', 660 * pitch, 990 * pitch, now, 0.14, 0.32)
          hiss(now, 0.25, 0.08, 'bandpass', 3000, 1500, 1)
          break
        case 'downpour':
          hiss(now, 1.6, 0.22, 'lowpass', 2600, 900, 0.7)
          tone('sine', 523, 523, now + 0.05, 0.12, 0.12)
          tone('sine', 784, 784, now + 0.14, 0.2, 0.12)
          break
        case 'pop':
          tone('sine', 520, 1200, now, 0.08, 0.25)
          break
        case 'win':
          [72, 76, 79, 84, 88].forEach((note, index) => tone('triangle', NOTE(note), NOTE(note), now + index * 0.08, 0.16, 0.22))
          tone('square', NOTE(96), NOTE(96), now + 0.42, 0.25, 0.06)
          break
        case 'lose':
          tone('triangle', NOTE(67), NOTE(62), now, 0.3, 0.25)
          tone('triangle', NOTE(62), NOTE(55), now + 0.32, 0.5, 0.25)
          break
        // chop
        case 'chopSnap':
          hiss(now, 0.06, 0.5, 'highpass', 3000, 6000)
          tone('square', 1500 * pitch, 900 * pitch, now, 0.04, 0.06)
          break
        case 'chopPerfect':
          tone('sine', NOTE(90), NOTE(96), now, 0.12, 0.2)
          tone('sine', NOTE(102), NOTE(102), now + 0.05, 0.2, 0.16)
          break
        case 'chopGood':
          tone('triangle', 880 * pitch, 660 * pitch, now, 0.1, 0.2)
          break
        case 'chopMiss':
          tone('triangle', 180, 90, now, 0.25, 0.3)
          hiss(now, 0.15, 0.25, 'lowpass', 900, 200, 1)
          break
        case 'chopThud':
          tone('sine', 140, 60, now, 0.25, 0.35)
          hiss(now, 0.2, 0.3, 'lowpass', 600, 120, 1.5)
          break
      }
    },
    buzz(level): void {
      const kit = audio()
      if (!kit) return
      const target = Math.max(0, Math.min(1, level)) * 0.05
      if (!buzzOsc && target > 0) {
        buzzOsc = kit.context.createOscillator()
        buzzOsc.type = 'sawtooth'
        buzzOsc.frequency.value = 190
        const wobble = kit.context.createOscillator()
        const depth = kit.context.createGain()
        wobble.frequency.value = 26
        depth.gain.value = 24
        wobble.connect(depth)
        depth.connect(buzzOsc.frequency)
        const soften = kit.context.createBiquadFilter()
        soften.type = 'lowpass'
        soften.frequency.value = 1400
        buzzGain = kit.context.createGain()
        buzzGain.gain.value = 0
        buzzOsc.connect(soften)
        soften.connect(buzzGain)
        buzzGain.connect(kit.master)
        buzzOsc.start()
        wobble.start()
      }
      buzzGain?.gain.setTargetAtTime(target, kit.context.currentTime, 0.05)
    },
    stopAll(): void {
      if (buzzGain && context) buzzGain.gain.setTargetAtTime(0, context.currentTime, 0.03)
    },
  }
}
