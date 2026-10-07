import * as THREE from 'three'
import { daylightAmount, phaseOf, sunElevation, type DayPhase } from '../game/day-night'

/**
 * Drives the farm lights, sky and fog from the day/night clock.
 *
 * Keyframes are authored per phase and blended by sun elevation so dawn and
 * dusk get their warm wash without a second code path. Night keeps a cool
 * moonlight fill so the farm stays readable, never pitch black.
 */

export interface DayNightRigLights {
  readonly sun: THREE.DirectionalLight
  readonly ambient: THREE.HemisphereLight
  readonly fill: THREE.DirectionalLight
  readonly rim: THREE.DirectionalLight
}

interface SkyKeyframe {
  readonly horizon: string
  readonly middle: string
  readonly zenith: string
  readonly fog: string
  readonly sun: string
  readonly sunIntensity: number
  readonly ambientIntensity: number
  readonly fillIntensity: number
  readonly rimIntensity: number
  readonly exposure: number
}

const DAY: SkyKeyframe = {
  horizon: '#f6c98c',
  middle: '#92cfce',
  zenith: '#63a8c5',
  fog: '#c2d8cf',
  sun: '#fff0d6',
  sunIntensity: 3.0,
  ambientIntensity: 1.85,
  fillIntensity: 0.82,
  rimIntensity: 1.15,
  exposure: 1.12,
}

const GOLDEN: SkyKeyframe = {
  horizon: '#ff9e5e',
  middle: '#d78a7d',
  zenith: '#4a5a9e',
  fog: '#d9a184',
  sun: '#ffb066',
  sunIntensity: 1.7,
  ambientIntensity: 1.1,
  fillIntensity: 0.5,
  rimIntensity: 1.5,
  exposure: 1.05,
}

const NIGHT: SkyKeyframe = {
  horizon: '#2a3560',
  middle: '#1c2547',
  zenith: '#0b1026',
  fog: '#232c4e',
  sun: '#9fb6ff',
  sunIntensity: 0.35,
  ambientIntensity: 0.5,
  fillIntensity: 0.22,
  rimIntensity: 0.4,
  exposure: 0.9,
}

const scratchA = new THREE.Color()
const scratchB = new THREE.Color()

function lerpColor(target: THREE.Color, from: string, to: string, amount: number): void {
  scratchA.set(from)
  scratchB.set(to)
  target.copy(scratchA).lerp(scratchB, amount)
}

function blendKeyframes(daylight: number, phase: DayPhase): { lower: SkyKeyframe; upper: SkyKeyframe; amount: number } {
  if (phase === 'night') return { lower: NIGHT, upper: NIGHT, amount: 0 }
  if (phase === 'dawn' || phase === 'dusk') return { lower: GOLDEN, upper: DAY, amount: THREE.MathUtils.clamp(daylight * 1.4, 0, 1) }
  if (daylight < 0.35) return { lower: GOLDEN, upper: DAY, amount: daylight / 0.35 }
  return { lower: DAY, upper: DAY, amount: 0 }
}

function lerpField(lower: number, upper: number, amount: number): number {
  return lower + (upper - lower) * amount
}

export interface DayNightRig {
  update(timeOfDay: number): void
}

export function createDayNightRig(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  lights: DayNightRigLights,
  skyDome: THREE.Mesh,
): DayNightRig {
  const material = skyDome.material as THREE.ShaderMaterial
  const uniforms = material.uniforms as Record<string, { value: THREE.Color }>
  const background = scene.background as THREE.Color | null
  const fog = scene.fog as THREE.Fog | null
  const baseSunPosition = new THREE.Vector3(-22, 42, 17)
  const sunDirection = new THREE.Vector3()

  return {
    update(timeOfDay: number): void {
      const daylight = daylightAmount(timeOfDay)
      const phase = phaseOf(timeOfDay)
      const frames = blendKeyframes(daylight, phase)
      const lower = frames.lower
      const upper = frames.upper
      const amount = frames.amount
      if (uniforms.horizonColor) lerpColor(uniforms.horizonColor.value, lower.horizon, upper.horizon, amount)
      if (uniforms.middleColor) lerpColor(uniforms.middleColor.value, lower.middle, upper.middle, amount)
      if (uniforms.zenithColor) lerpColor(uniforms.zenithColor.value, lower.zenith, upper.zenith, amount)
      if (background) lerpColor(background, lower.fog, upper.fog, amount)
      if (fog) lerpColor(fog.color, lower.fog, upper.fog, amount)
      lerpColor(lights.sun.color, lower.sun, upper.sun, amount)
      lights.sun.intensity = lerpField(lower.sunIntensity, upper.sunIntensity, amount)
      lights.ambient.intensity = lerpField(lower.ambientIntensity, upper.ambientIntensity, amount)
      lights.fill.intensity = lerpField(lower.fillIntensity, upper.fillIntensity, amount)
      lights.rim.intensity = lerpField(lower.rimIntensity, upper.rimIntensity, amount)
      renderer.toneMappingExposure = lerpField(lower.exposure, upper.exposure, amount)
      const elevation = sunElevation(timeOfDay)
      const angle = (timeOfDay - 0.25) * Math.PI * 2
      const radius = baseSunPosition.length()
      sunDirection.set(Math.cos(angle) * radius, Math.max(elevation, -0.35) * radius, baseSunPosition.z)
      if (sunDirection.y < 4 && phase === 'night') sunDirection.y = 18
      lights.sun.position.copy(sunDirection)
    },
  }
}
