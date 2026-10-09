import type { BalloonAnimal } from '../animals/balloon-animal'
import {
  createGroundHunter,
  stepGroundHunter,
  type GroundHunter,
  type GroundHuntPhase,
  type GroundPreyView,
} from '../game/ground-hunt'

/**
 * Drives every snake each frame: gathers the mice and rats it can see, steps the
 * pure hunt in `src/game/ground-hunt.ts`, and steers the snake with the result.
 * When the strike die says the snake catches its prey, the prey freezes in
 * fright until the lunge lands. A catch and an escape are both handed back to
 * the caller, who owns popping the prey or sending it sprinting home.
 */
export interface HuntSnake {
  readonly animal: BalloonAnimal
  /** Visitors and residents on the farm hunt; a snake out at the carnival does not. */
  readonly huntAllowed: boolean
  /** How far ahead of its centre its mouth is, in metres. */
  readonly reach: number
}

export interface SnakeHuntContext {
  readonly snakes: readonly HuntSnake[]
  /** Adult mice and rats out on the farm, targetable or not. */
  readonly prey: readonly { readonly animal: BalloonAnimal; readonly targetable: boolean }[]
  /** Adult residents per prey species, indoors or out, for the breeding floor. */
  readonly preyCounts: Readonly<Record<string, number>>
}

export interface SnakeCatch {
  readonly snake: BalloonAnimal
  readonly prey: BalloonAnimal
  /** The strike die's face. */
  readonly roll: number
}

export interface SnakeHuntResult {
  readonly catches: readonly SnakeCatch[]
  /** Prey the die let off: the snake strikes empty grass, and the prey should run for home. */
  readonly escapes: readonly SnakeCatch[]
}

export interface SnakeHuntReport {
  readonly snakes: readonly { readonly id: string; readonly phase: GroundHuntPhase; readonly preyId: string | null; readonly cooldown: number }[]
}

export interface SnakeHunt {
  update(deltaSeconds: number, context: SnakeHuntContext): SnakeHuntResult
  /** Prey a snake is after right now; the scene keeps these in full detail. */
  huntedIds(): ReadonlySet<string>
  /** Debug: make every snake hunt as soon as it can. */
  hurry(): void
  /** Forget every snake's hunt and calm every mouse, as when the farm is reset. */
  reset(): void
  report(): SnakeHuntReport
}

export function createSnakeHunt(): SnakeHunt {
  const hunters = new Map<string, GroundHunter>()
  const steered = new Map<string, BalloonAnimal>()
  /** Prey frozen in fright by a winning roll, held still until the lunge lands. */
  const frozen = new Map<string, BalloonAnimal>()
  const rolls = new Map<string, number>()
  const hunted = new Set<string>()

  function calm(preyId: string): void {
    frozen.get(preyId)?.setPursuit(null)
    frozen.delete(preyId)
    rolls.delete(preyId)
    hunted.delete(preyId)
  }

  function release(snakeId: string): void {
    steered.get(snakeId)?.setPursuit(null)
    steered.delete(snakeId)
  }

  return {
    update(deltaSeconds, context) {
      const catches: SnakeCatch[] = []
      const escapes: SnakeCatch[] = []
      const views: GroundPreyView[] = context.prey.map(({ animal, targetable }) => ({
        id: animal.instanceId,
        species: animal.id,
        x: animal.currentPosition.x,
        z: animal.currentPosition.z,
        targetable,
      }))
      const preyById = new Map(context.prey.map(({ animal }) => [animal.instanceId, animal]))
      const present = new Set<string>()

      for (const snake of context.snakes) {
        const id = snake.animal.instanceId
        present.add(id)
        let hunter = hunters.get(id)
        if (!hunter) {
          hunter = createGroundHunter()
          hunters.set(id, hunter)
        }
        const step = stepGroundHunter(hunter, {
          x: snake.animal.currentPosition.x,
          z: snake.animal.currentPosition.z,
          huntAllowed: snake.huntAllowed,
          reach: snake.reach,
          prey: views,
          preyCounts: context.preyCounts,
        }, deltaSeconds)
        for (const event of step.events) {
          if (event.kind === 'stalk') {
            hunted.add(event.preyId)
          } else if (event.kind === 'strike') {
            const prey = preyById.get(event.preyId)
            if (!prey) continue
            if (event.caught) {
              // Frozen to the spot, the way a mouse goes still when it is too late.
              prey.setPursuit({ x: prey.currentPosition.x, z: prey.currentPosition.z, speedScale: 0 })
              frozen.set(event.preyId, prey)
              rolls.set(event.preyId, event.roll)
            } else {
              calm(event.preyId)
              escapes.push({ snake: snake.animal, prey, roll: event.roll })
            }
          } else if (event.kind === 'abandon') {
            calm(event.preyId)
          } else if (event.kind === 'catch') {
            const prey = preyById.get(event.preyId)
            const roll = rolls.get(event.preyId) ?? 0
            calm(event.preyId)
            if (prey) catches.push({ snake: snake.animal, prey, roll })
          }
        }
        if (step.pursuit) {
          snake.animal.setPursuit(step.pursuit)
          steered.set(id, snake.animal)
        } else if (steered.has(id)) {
          release(id)
        }
      }

      // Forget snakes that have gone (sold, popped, indoors), and release their prey.
      for (const [id, hunter] of hunters) {
        if (present.has(id)) continue
        if (hunter.preyId) calm(hunter.preyId)
        release(id)
        hunters.delete(id)
      }
      for (const id of [...frozen.keys()]) if (!preyById.has(id)) calm(id)
      for (const id of [...hunted]) if (!preyById.has(id)) hunted.delete(id)
      return { catches, escapes }
    },
    huntedIds: () => hunted,
    hurry() {
      for (const hunter of hunters.values()) hunter.cooldown = 0
    },
    reset() {
      for (const id of [...frozen.keys()]) calm(id)
      hunted.clear()
      for (const id of [...steered.keys()]) release(id)
      hunters.clear()
    },
    report() {
      return {
        snakes: [...hunters.entries()].map(([id, hunter]) => ({ id, phase: hunter.phase, preyId: hunter.preyId, cooldown: hunter.cooldown })),
      }
    },
  }
}
