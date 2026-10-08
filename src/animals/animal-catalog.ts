import type { Camera } from 'three'
import { GARDEN_LAWN_Y } from '../scene/fairground'

interface AnimalCatalogFields {
  readonly name: string
  readonly label: string
  readonly spriteUrl: string
  readonly subtitle: string
  readonly description: string
  readonly note: string
  readonly color: string
  readonly gesture: string
  readonly assetUrl: string
  readonly spawn: readonly [number, number]
  /**
   * Where the species first turns up: out at the carnival tents, well outside
   * the fence. This is the "visit the carnival" condition made physical.
   */
  readonly carnivalSpawn: readonly [number, number]
  readonly showcaseSpawn: readonly [number, number]
  readonly seed: number
  readonly size: number
  readonly speed: number
  readonly bounds: { readonly x: number; readonly z: number }
  /**
   * True for a species that flies instead of wandering. A flier is positioned
   * by the predator sim (`src/game/predator.ts`) rather than by the ground
   * wander, and only comes out at night.
   */
  readonly flier?: boolean
}

export const ANIMAL_CATALOG = [
  {
    id: 'pig', name: 'Pig', label: 'pig', spriteUrl: 'assets/animals/balloon-pig-review.png',
    subtitle: 'The curious snuffler', description: 'A rosy little wanderer with a nose for new things and a soft spot for a friendly garden.',
    note: 'A familiar face around the farm. Look for its jaunty ears and bright balloon cheeks.', color: '#ed679d', gesture: 'Digs for color',
    assetUrl: 'assets/animals/balloon-pig.glb', spawn: [-7, -3.8], carnivalSpawn: [-19.5, 12.5], showcaseSpawn: [-7, -3.2], seed: 5104, size: 2.05, speed: 1.25, bounds: { x: 11.2, z: 6.5 },
  },
  {
    id: 'sheep', name: 'Sheep', label: 'sheep', spriteUrl: 'assets/animals/balloon-sheep-review.png',
    subtitle: 'The cloud-soft friend', description: 'A gentle woolly visitor who brings a little extra fluff and calm wherever it goes.',
    note: 'Its pillowy coat catches the afternoon light like a tiny traveling cloud.', color: '#fff0d0', gesture: 'Bouncy wool',
    assetUrl: 'assets/animals/balloon-sheep.glb', spawn: [-3.2, 2.1], carnivalSpawn: [-20, -11], showcaseSpawn: [0, -3.2], seed: 861, size: 2.1, speed: 0.88, bounds: { x: 10.9, z: 6.2 },
  },
  {
    id: 'cow', name: 'Cow', label: 'cow', spriteUrl: 'assets/animals/balloon-cow-review.png',
    subtitle: 'The meadow sweetheart', description: 'A big-hearted farm friend with a patient pace and a wonderfully unmistakable silhouette.',
    note: 'A slow stroll and a sunny patch make a lovely afternoon.', color: '#292735', gesture: 'Tips into color',
    assetUrl: 'assets/animals/balloon-cow.glb', spawn: [4.4, 2.8], carnivalSpawn: [18, -13], showcaseSpawn: [7, -3.2], seed: 1402, size: 2.7, speed: 0.72, bounds: { x: 10.7, z: 6.1 },
  },
  {
    id: 'chicken', name: 'Chicken', label: 'chicken', spriteUrl: 'assets/animals/balloon-chicken-review.png',
    subtitle: 'The peppy peckish pal', description: 'A small golden busybody, always ready to investigate a new corner of the garden.',
    note: 'Listen for a happy little cluck as it bobs along the path.', color: '#f6c94d', gesture: 'Flaps skyward',
    assetUrl: 'assets/animals/balloon-chicken.glb', spawn: [7.4, -1.1], carnivalSpawn: [19.5, 8], showcaseSpawn: [-7, 3.2], seed: 2406, size: 1.85, speed: 1.02, bounds: { x: 10.5, z: 6.1 },
  },
  {
    id: 'duck', name: 'Duck', label: 'duck', spriteUrl: 'assets/animals/balloon-duck-review.png',
    subtitle: 'The puddle-day dreamer', description: 'A bright-eyed waddler who makes even an ordinary stroll feel like a little parade.',
    note: 'Those tiny webbed feet are made for a cheerful waddle.', color: '#45a36c', gesture: 'Flaps and floats',
    assetUrl: 'assets/animals/balloon-duck.glb', spawn: [-8, 3.5], carnivalSpawn: [-22, -18], showcaseSpawn: [0, 3.2], seed: 3128, size: 2, speed: 0.92, bounds: { x: 10.5, z: 6.1 },
  },
  {
    id: 'goose', name: 'Goose', label: 'goose', spriteUrl: 'assets/animals/balloon-goose-review.png',
    subtitle: 'The grand waddler', description: 'A graceful feathered friend with a curious gaze and a rather proud little stride.',
    note: 'Give this tall visitor a wave when it wanders by.', color: '#fff2df', gesture: 'Takes flight',
    assetUrl: 'assets/animals/balloon-goose.glb', spawn: [0.4, -5], carnivalSpawn: [26, 4], showcaseSpawn: [7, 3.2], seed: 4801, size: 2.35, speed: 0.8, bounds: { x: 10.5, z: 6.1 },
  },
  {
    id: 'frog', name: 'Frog', label: 'frog', spriteUrl: 'assets/animals/balloon-frog-review.png',
    subtitle: 'The lily-pad hopper', description: 'A bright pond friend who springs, bounces and lands wherever the water sings.',
    note: 'Follow the splash sounds — that bobbing green dot is the frog, mid-hop.', color: '#6ab84e', gesture: 'Springs skyward',
    assetUrl: 'assets/animals/balloon-frog.glb', spawn: [-5.6, -5.2], carnivalSpawn: [21, 14], showcaseSpawn: [-11, 0], seed: 6107, size: 1.9, speed: 0.85, bounds: { x: 10.5, z: 6.1 },
  },
  {
    id: 'owl', name: 'Owl', label: 'owl', spriteUrl: 'assets/animals/balloon-owl-review.png',
    subtitle: 'The night-shift hunter', description: 'A plump hazelnut balloon that drifts over the farm after dark and swoops on anything that clucks.',
    note: 'It barely flaps. Balloons are most of the way to flying already. Keep an eye on the flock.', color: '#a9774b', gesture: 'Drifts on wide wings',
    assetUrl: 'assets/animals/balloon-owl.glb', spawn: [-6, 3], carnivalSpawn: [-24, 6], showcaseSpawn: [11, 0], seed: 7312, size: 2.5, speed: 3, bounds: { x: 10.5, z: 6.1 },
    flier: true,
  },
] as const satisfies readonly (AnimalCatalogFields & { readonly id: string })[]

export type BalloonAnimalId = typeof ANIMAL_CATALOG[number]['id']

/**
 * Which species the asset viewer stages. The viewer doubles as the review
 * booth for new models: while a species is being tuned it stands here alone,
 * framed close and paired with a single tray card, instead of sharing the
 * stage with the whole catalog. Swap the id to review a different model, or
 * list several to compare them side by side.
 */
export const VIEWER_CAST: readonly BalloonAnimalId[] = ['frog']

export function getAnimalSceneOptions(
  showcaseMode: boolean,
  canvas: HTMLCanvasElement,
  camera: Camera,
  groundSampler?: (x: number, z: number) => number,
) {
  return ANIMAL_CATALOG.map((animal) => ({
    id: animal.id,
    assetUrl: animal.assetUrl,
    name: animal.label,
    spawn: showcaseMode ? animal.showcaseSpawn : animal.spawn,
    groundY: GARDEN_LAWN_Y,
    seed: animal.seed,
    size: animal.size,
    speed: animal.speed,
    bounds: animal.bounds,
    flier: 'flier' in animal && animal.flier,
    canvas,
    camera,
    groundSampler,
    // The viewer is a pose gallery, so clicking replays a species' reveal.
    // In the farm an animal now settles because the land is ready, not because
    // it was clicked, so the click-to-capture verb is off there.
    wandering: !showcaseMode,
    captureOnClick: false,
    replayCaptureOnClick: showcaseMode,
  }))
}
