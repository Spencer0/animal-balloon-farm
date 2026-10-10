import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { PLANT_CATALOG } from './plants'

export function animalDisplayName(species: string): string {
  return ANIMAL_CATALOG.find((entry) => entry.id === species)?.name ?? species
}

export function plantDisplayName(species: string): string {
  return PLANT_CATALOG.find((entry) => entry.id === species)?.name ?? species
}
