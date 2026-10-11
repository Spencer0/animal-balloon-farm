import * as THREE from 'three'
import { skyBlendOf, sunElevation } from '../game/day-night'
import type { FarmRenderer, SkyColors } from '../render/backend'

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
const scratchC = new THREE.Color()

function lerpColor(target: THREE.Color, from: string, to: string, amount: number): void {
  scratchA.set(from)
  scratchB.set(to)
  target.copy(scratchA).lerp(scratchB, amount)
}

function lerpField(lower: number, upper: number, amount: number): number {
  return lower + (upper - lower) * amount
}

/** golden -> day by `day`, then toward night by `night`. */
function blendColor(target: THREE.Color, key: (frame: SkyKeyframe) => string, day: number, night: number): void {
  lerpColor(target, key(GOLDEN), key(DAY), day)
  scratchC.set(key(NIGHT))
  target.lerp(scratchC, night)
}

function blendField(key: (frame: SkyKeyframe) => number, day: number, night: number): number {
  return lerpField(lerpField(key(GOLDEN), key(DAY), day), key(NIGHT), night)
}

export interface DayNightRig {
  update(timeOfDay: number): void
}

export function createDayNightRig(
  scene: THREE.Scene,
  renderer: FarmRenderer,
  lights: DayNightRigLights,
  skyColors: SkyColors,
): DayNightRig {
  const background = scene.background as THREE.Color | null
  const fog = scene.fog as THREE.Fog | null
  const baseSunPosition = new THREE.Vector3(-22, 42, 17)
  const sunDirection = new THREE.Vector3()

  return {
    update(timeOfDay: number): void {
      const { day, night } = skyBlendOf(timeOfDay)
      blendColor(skyColors.horizon, (f) => f.horizon, day, night)
      blendColor(skyColors.middle, (f) => f.middle, day, night)
      blendColor(skyColors.zenith, (f) => f.zenith, day, night)
      if (background) blendColor(background, (f) => f.fog, day, night)
      if (fog) blendColor(fog.color, (f) => f.fog, day, night)
      blendColor(lights.sun.color, (f) => f.sun, day, night)
      lights.sun.intensity = blendField((f) => f.sunIntensity, day, night)
      lights.ambient.intensity = blendField((f) => f.ambientIntensity, day, night)
      lights.fill.intensity = blendField((f) => f.fillIntensity, day, night)
      lights.rim.intensity = blendField((f) => f.rimIntensity, day, night)
      renderer.toneMappingExposure = blendField((f) => f.exposure, day, night)
      const elevation = sunElevation(timeOfDay)
      const angle = (timeOfDay - 0.25) * Math.PI * 2
      const radius = baseSunPosition.length()
      sunDirection.set(Math.cos(angle) * radius, Math.max(elevation, -0.35) * radius, baseSunPosition.z)
      // Ease the sun down into the fixed moon height instead of snapping at night.
      sunDirection.y = lerpField(sunDirection.y, 18, night)
      lights.sun.position.copy(sunDirection)
    },
  }
}
