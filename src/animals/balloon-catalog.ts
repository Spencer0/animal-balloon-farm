import { ANIMAL_CATALOG } from './animal-catalog'

export const SHOWCASE_ANIMALS = Object.fromEntries(ANIMAL_CATALOG.map((animal) => [animal.id, {
  spawn: animal.showcaseSpawn,
  color: animal.color,
  accent: animal.color,
}])) as {
  readonly [Animal in typeof ANIMAL_CATALOG[number] as Animal['id']]: {
    readonly spawn: readonly [number, number]
    readonly color: string
    readonly accent: string
  }
}
