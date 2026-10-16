import type { BalloonAnimal } from '../animals/balloon-animal'
import type { AnimalLife } from '../game/animal-life'
import { createBerryForager, stepBerryForager, type BerryForager } from '../game/berry-forage'
import type { GardenPlants } from './garden-plants'

export function createBerryForaging(
  animals: readonly BalloonAnimal[],
  life: AnimalLife,
  garden: () => GardenPlants | null,
) {
  const states = new Map<string, BerryForager>()
  return {
    tick(dt: number, active: boolean): void {
      const simulation = garden()?.simulation
      const present = new Set<string>()
      for (const animal of animals) {
        if (animal.id !== 'squirrel') continue
        present.add(animal.instanceId)
        const record = life.animal(animal.instanceId)
        const eligible = Boolean(active && simulation && record && record.stage >= 2 && !record.baby && !record.insideId
          && animal.isAtFarm && !animal.isSold && !animal.isCapturing && !animal.isResidencyPending
          && !animal.isGoingHome && !animal.isAlarmed)
        let state = states.get(animal.instanceId)
        if (!state && !eligible) continue
        if (!state) { state = createBerryForager(); states.set(animal.instanceId, state) }
        const ownedPursuit = state.phase === 'approach' || state.phase === 'eat'
        const command = stepBerryForager(state, { x: animal.sim.x, z: animal.sim.z, eligible }, simulation?.plants ?? [], dt,
          (plantId) => simulation?.pickFruit(plantId) ?? null)
        if (command.target) {
          animal.setPursuit(command.target)
          if (command.eating) animal.facePoint(command.target.x, command.target.z)
        } else if (ownedPursuit) animal.setPursuit(null)
        animal.setEating(command.eating, command.holdingBerry)
        if (command.completedBite) life.recordFruitEaten(animal.instanceId, 'blueberry')
      }
      for (const id of states.keys()) if (!present.has(id)) states.delete(id)
    },
  }
}
