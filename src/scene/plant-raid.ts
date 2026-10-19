import type { BalloonAnimal } from '../animals/balloon-animal'
import type { AnimalLife } from '../game/animal-life'
import { cellAt, cellKey, fencedCells, type FenceSegment } from '../game/farm-props'
import { createPlantRaider, stepPlantRaider, type PlantRaider } from '../game/plant-raid'
import { PLANT_CATALOG, type GardenPlant } from '../game/plants'
import type { GardenPlants } from './garden-plants'

/** Every species that raids some plant, from the catalog. */
const RAIDERS = new Set(PLANT_CATALOG.flatMap((species) => species.raid?.by ?? []))

/** Fences move rarely; which plants they shut in is worked out a couple of times a second. */
const FENCE_REFRESH_SECONDS = 0.5

export function createPlantRaids(
  animals: readonly BalloonAnimal[],
  life: AnimalLife,
  garden: () => GardenPlants | null,
  fences: () => readonly FenceSegment[],
  /** A raider's bite just withered a plant. */
  onWithered?: (plant: GardenPlant, raider: string) => void,
) {
  const states = new Map<string, PlantRaider>()
  let fenced: ReadonlySet<number> = new Set()
  let fencedAge = Infinity

  function refreshFenced(plants: readonly GardenPlant[]): void {
    const cells = fencedCells(fences())
    fenced = new Set(plants.filter((plant) => cells.has(cellKey(cellAt(plant.x, plant.z)))).map((plant) => plant.instanceId))
    fencedAge = 0
  }

  return {
    tick(dt: number, active: boolean): void {
      const simulation = garden()?.simulation
      const plants = simulation?.plants ?? []
      fencedAge += dt
      if (fencedAge >= FENCE_REFRESH_SECONDS) refreshFenced(plants)
      const present = new Set<string>()
      for (const animal of animals) {
        if (!RAIDERS.has(animal.id)) continue
        present.add(animal.instanceId)
        const record = life.animal(animal.instanceId)
        const eligible = Boolean(active && simulation && record && record.stage >= 2 && !record.baby && !record.insideId
          && animal.isAtFarm && !animal.isSold && !animal.isCapturing && !animal.isResidencyPending
          && !animal.isGoingHome && !animal.isAlarmed && !animal.isSleeping)
        let state = states.get(animal.instanceId)
        if (!state && !eligible) continue
        if (!state) { state = createPlantRaider(); states.set(animal.instanceId, state) }
        const ownedPursuit = state.phase === 'approach' || state.phase === 'eat'
        let bitten: number | null = null
        const command = stepPlantRaider(state, { species: animal.id, x: animal.sim.x, z: animal.sim.z, eligible }, plants, dt,
          (plantId) => {
            if (!simulation?.raid(plantId)) return false
            bitten = plantId
            return true
          }, fenced)
        if (command.target) {
          animal.setPursuit(command.target)
          if (command.eating) animal.facePoint(command.target.x, command.target.z)
        } else if (ownedPursuit) animal.setPursuit(null)
        animal.setEating(command.eating, command.holdingBerry && animal.id === 'squirrel')
        if (bitten !== null) {
          const plant = simulation?.plants.find((entry) => entry.instanceId === bitten)
          if (plant?.withered) onWithered?.(plant, animal.id)
        }
        if (command.completedBite && state.targetId !== null) {
          const species = plants.find((plant) => plant.instanceId === state.targetId)?.species
          if (species) life.recordFruitEaten(animal.instanceId, species)
        }
      }
      for (const id of states.keys()) if (!present.has(id)) states.delete(id)
    },
  }
}
