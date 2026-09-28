import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal } from './balloon-animal'
import { GARDEN_LAWN_Y } from '../scene/fairground'

export type PigAnimation = 'IDLE' | 'WALK'

export interface BalloonPig extends BalloonAnimal {
  setAnimation(name: PigAnimation, fadeSeconds?: number): void
}

export async function createBalloonPig(
  parent: THREE.Group,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
): Promise<BalloonPig> {
  return createBalloonAnimal(parent, {
    id: 'pig',
    assetUrl: '/assets/animals/balloon-pig.glb',
    name: 'pig',
    spawn: [-7, -3.8],
    groundY: GARDEN_LAWN_Y,
    seed: 5104,
    size: 2.05,
    speed: 1.25,
    bounds: { x: 11.2, z: 6.5 },
    canvas,
    camera,
  })
}
