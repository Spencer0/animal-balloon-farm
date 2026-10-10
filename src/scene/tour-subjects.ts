import type { CameraTourSubject } from '../game/camera-tour'
import type { BalloonAnimal } from '../animals/balloon-animal'

/** Who the tour could pin to: every animal still living at the farm. */
export function tourSubjectsOf(animals: readonly BalloonAnimal[]): CameraTourSubject[] {
  return animals
    .filter((animal) => !animal.isSold && animal.root.visible)
    .map((animal) => ({
      id: animal.id,
      x: +animal.root.position.x.toFixed(3),
      y: +animal.root.position.y.toFixed(3),
      z: +animal.root.position.z.toFixed(3),
    }))
}
