import type { BalloonAnimal } from '../animals/balloon-animal'
import type { AnimalLife } from '../game/animal-life'
import { createDeerRaider, stepDeerRaider, type DeerRaider, type SaltLickSpot } from '../game/deer-raid'
import type { GardenPlant } from '../game/plants'
import type { GardenPlants } from './garden-plants'

/** Drives every deer on the farm through `stepDeerRaider` and hands eaten plants to `onEaten`. */
export function createDeerRaids(
  animals: readonly BalloonAnimal[],
  life: AnimalLife,
  garden: () => GardenPlants | null,
  saltLicks: () => readonly SaltLickSpot[],
  onEaten: (plant: GardenPlant, deer: BalloonAnimal) => void,
  random: () => number = Math.random,
) {
  const states = new Map<string, DeerRaider>()
  return {
    tick(dt: number, active: boolean): void {
      const plants = garden()
      const licks = saltLicks()
      const present = new Set<string>()
      for (const animal of animals) {
        if (animal.id !== 'deer') continue
        present.add(animal.instanceId)
        const record = life.animal(animal.instanceId)
        const eligible = Boolean(active && plants && record && record.stage >= 2 && !record.baby && !record.insideId
          && !record.departing && animal.isAtFarm && !animal.isSold && !animal.isCapturing && !animal.isResidencyPending
          && !animal.isGoingHome && !animal.isAlarmed && !animal.isSleeping)
        let state = states.get(animal.instanceId)
        if (!state && !eligible) continue
        if (!state) { state = createDeerRaider(); states.set(animal.instanceId, state) }
        const owned = state.phase === 'approach' || state.phase === 'eat' || state.phase === 'lick'
        const command = stepDeerRaider(state, { x: animal.sim.x, z: animal.sim.z, eligible }, plants?.simulation.plants ?? [], licks, dt, random,
          (plantId) => {
            const plant = plants?.eatPlant(plantId) ?? null
            if (plant) onEaten(plant, animal)
            return plant !== null
          })
        if (command.target) animal.setPursuit(command.target)
        else if (owned) animal.setPursuit(null)
        if (command.face) animal.facePoint(command.face.x, command.face.z)
        animal.setEating(command.eating)
      }
      for (const id of states.keys()) if (!present.has(id)) states.delete(id)
    },
    /** Debug: what each deer is up to. */
    report(): readonly { readonly id: string; readonly phase: DeerRaider['phase']; readonly targetId: number | null }[] {
      return [...states].map(([id, state]) => ({ id, phase: state.phase, targetId: state.targetId }))
    },
  }
}
