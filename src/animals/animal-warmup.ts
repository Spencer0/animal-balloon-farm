import * as THREE from 'three'
import { createBalloonAnimal, type BalloonAnimal, type BalloonAnimalOptions } from './balloon-animal'
import { setHeartEyes } from './animal-eyes'

/**
 * Parked, never-drawn-again animals that hold the skinned programs open.
 *
 * Every species wears the same material family (double-sided clearcoat
 * physical, no textures), so the programs depend on the *look*, not the
 * species: the standard coat, the wild balloon mask, the heart-eyes variant and
 * the mid-paint capture material. Each used to compile (and, on WebGL, finish
 * linking) the first time an animal first wore it on screen: a stall of
 * hundreds of milliseconds to seconds on the frame that revealed it. One cow in
 * each look, drawn once at load where the sun's shadow pass can see it (so the
 * depth programs are built too), pays that cost behind the loading screen; they
 * are then hidden (zero draw calls, zero triangles) but kept alive so the
 * programs are never released.
 */
const parked: BalloonAnimal[] = []

type Look = 'wild' | 'standard' | 'hearts' | 'capture'
const LOOKS: readonly Look[] = ['wild', 'standard', 'hearts', 'capture']

async function buildLook(parent: THREE.Group, base: BalloonAnimalOptions, look: Look): Promise<BalloonAnimal> {
  let ready: () => void = () => {}
  const loaded = new Promise<void>((resolve) => { ready = resolve })
  const animal = await createBalloonAnimal(parent, {
    ...base,
    name: `Warm-up ${look}`,
    instanceId: `warmup-${look}`,
    stage: look === 'wild' || look === 'capture' ? 1 : 3,
    appearance: look === 'wild' || look === 'capture' ? 'wild' : 'standard',
    captureOnClick: false,
    onDetailedModelReady: ready,
  })
  animal.setDetailedVisible(true)
  await loaded
  if (look === 'hearts') setHeartEyes(animal.root)
  if (look === 'capture') {
    animal.beginCapture()
    // Advance the paint-reveal a little so its per-animal materials are installed and in use.
    for (let step = 0; step < 3; step += 1) animal.update(0.3, 1)
  }
  animal.root.traverse((object) => { object.frustumCulled = false })
  return animal
}

/**
 * Build one animal in each look, run `draw` while they are visible (compile and
 * first draw), then hide them. Failures never stop the farm from loading: a
 * look that cannot be built is simply left to compile on first use.
 */
export async function warmAnimalLooks(parent: THREE.Group, base: BalloonAnimalOptions, draw: () => Promise<void>): Promise<void> {
  const built: BalloonAnimal[] = []
  for (const look of LOOKS) {
    try {
      built.push(await buildLook(parent, base, look))
    } catch (error) {
      console.warn(`[warm-up] could not build the ${look} animal`, error)
    }
  }
  try {
    await draw()
  } finally {
    for (const animal of built) {
      animal.root.visible = false
      parked.push(animal)
    }
  }
}
