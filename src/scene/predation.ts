import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { createOwlPresenter } from './owl-hunt'
import { createOwlSim, createSnakeSim, type HuntEvent, type OwlInput, type PreyInput } from '../game/animal-hunt'
import { createPopBurst, type PopBurst } from './pop-burst'
import { createDeflateEffect } from './deflate-effect'
import { createPredationLedger, isNightTime, PREY_OF } from '../game/predator'
import { HOUSE_CAPACITY, houseWithRoom, occupantsByHouse } from '../game/animal-housing'
import { propDefinition } from '../game/farm-props'
import type { createAnimalLife } from '../game/animal-life'
import type { GardenBounds } from '../game/farm-expansion'
import type { GardenProps, HouseSpot } from './garden-props'

export interface PredationDeps {
  readonly fairgroundRoot: THREE.Object3D
  readonly lawnY: number
  readonly scene: THREE.Scene
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly animals: BalloonAnimal[]
  readonly animalById: Map<string, BalloonAnimal>
  readonly animalNames: Map<string, string>
  readonly farmHomes: Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>
  readonly goingIn: Map<string, { readonly houseId: string; readonly since: number }>
  readonly getFocusedAnimal: () => string | null
  readonly setFocusedAnimal: (id: string | null) => void
  readonly houses: () => readonly HouseSpot[]
  readonly gardenProps: () => GardenProps | null
  readonly animalCard: { close(): void }
  readonly syncFarmChrome: () => void
  readonly notificationPanel: { notifyAccomplishment(title: string, detail: string): void }
  readonly refreshAnimalVisibility: (nowSeconds: number, force?: boolean) => void
  readonly carnivalSpawnFor: (species: string) => readonly [number, number]
  readonly activeGardenBounds: () => GardenBounds
  readonly residentCounts: () => Record<string, number>
  readonly bodySizeBySpecies: Map<string, number>
  readonly speciesPluralName: (species: string) => string
  readonly dayNightClock: { readonly timeOfDay: number }
}

export function createPredation(deps: PredationDeps) {
  const { fairgroundRoot, lawnY, scene, progress, animals, animalById, animalNames, farmHomes, goingIn, getFocusedAnimal, setFocusedAnimal, houses, gardenProps, animalCard, syncFarmChrome, notificationPanel, refreshAnimalVisibility, carnivalSpawnFor, activeGardenBounds, residentCounts, bodySizeBySpecies, speciesPluralName, dayNightClock } = deps
  /**
   * Predator and prey. The owl's flight is stepped by `owlHunt` (which wraps the
   * pure sim in game/predator.ts); every chicken it takes is tallied in the ledger,
   * and a `preyEaten` condition reads that tally. A caught chicken pops, and its
   * effect holds the animal until the clean-up has finished.
   */
  const predationLedger = createPredationLedger()
  const owlSim = createOwlSim()
  const owlPresenter = createOwlPresenter(fairgroundRoot, lawnY, owlSim)
  /** The owl's sim, with the farm reset also clearing what the presenter remembers. */
  const owlHunt = {
    huntedIds: owlSim.huntedIds,
    hurry: owlSim.hurry,
    setHelium: owlSim.setHelium,
    report: owlSim.report,
    reset(): void {
      owlSim.reset()
      owlPresenter.reset()
    },
    dispose(): void { owlPresenter.dispose() },
  }
  /** Snakes hunt mice and rats on the ground (pure sim in game/ground-hunt.ts); catches go in the same ledger. */
  const snakeHunt = createSnakeSim(0x5a4e)
  /** Which owls the farm gave a perch to this tick, so the presenter can turn them to face the camera. */
  const roostedOwls = new Set<string>()
  const huntEvents: HuntEvent[] = []
  interface PopInFlight { readonly burst: PopBurst; readonly animal: BalloonAnimal }
  const popsInFlight: PopInFlight[] = []

  /** Ground-plane name for a species in a notice, e.g. "chicken". */
  function preyLabel(species: string): string {
    return ANIMAL_CATALOG.find((entry) => entry.id === species)?.label ?? species
  }

  /**
   * A hunter has caught a chicken, mouse or rat: tally it and tell the player.
   * The prey leaves the farm on the `popped` event that follows.
   */
  function handlePredatorCatch(hunter: string, prey: BalloonAnimal, roll?: number): void {
    const total = predationLedger.record(prey.id)
    const name = animalNames.get(prey.instanceId) ?? preyLabel(prey.id)
    const eaten = total === 1 ? preyLabel(prey.id) : speciesPluralName(prey.id).toLowerCase()
    const rolled = roll ? ` (rolled ${roll})` : ''
    notificationPanel.notifyAccomplishment(`The ${preyLabel(hunter)} caught ${name}${rolled}`, `${total} ${eaten} eaten on your farm`)
    console.info(`[Animal Balloon Farm] ${hunter} caught ${prey.id} (${total} eaten)`)
  }

  /** Take an animal out of the farm and play its pop; the effect disposes the model when done. */
  /**
   * Take an animal out of the farm and play its death; the effect disposes the
   * model when done. `bang` is for being caught: it swells and pops. `deflate`
   * is for running out of helium: it hisses, sags flat, and shrinks away.
   */
  function popAnimal(prey: BalloonAnimal, style: 'bang' | 'deflate' = 'bang'): void {
    const catalog = ANIMAL_CATALOG.find((entry) => entry.id === prey.id)
    const at = prey.root.getWorldPosition(new THREE.Vector3())
    progress.remove(prey.instanceId)
    animalById.delete(prey.instanceId)
    const index = animals.indexOf(prey)
    if (index >= 0) animals.splice(index, 1)
    if (getFocusedAnimal() === prey.instanceId) {
      setFocusedAnimal(null)
      animalCard.close()
      syncFarmChrome()
    }
    farmHomes.delete(prey.instanceId)
    prey.setAlarmed(false)
    const burst = style === 'deflate' ? createDeflateEffect({
      position: new THREE.Vector3(at.x, at.y, at.z),
      height: (catalog?.size ?? 1.8) * 0.42,
      animal: prey.hasDetailedModel ? prey.root : null,
    }) : createPopBurst({
      position: new THREE.Vector3(at.x, at.y, at.z),
      color: catalog?.color ?? '#f6c94d',
      accent: prey.id === 'chicken' ? '#e65b69' : '#fff0d0',
      burstHeight: (catalog?.size ?? 1.8) * 0.42,
      animal: prey.hasDetailedModel ? prey.root : null,
    })
    scene.add(burst.root)
    popsInFlight.push({ burst, animal: prey })
    refreshAnimalVisibility(performance.now() / 1000, true)
  }

  /**
   * Per frame: finish the pop effects, and show every owl where the last two sim
   * ticks put it (`simAlpha` of the way between them).
   */
  function presentHunts(deltaSeconds: number, simAlpha: number): void {
    for (let index = popsInFlight.length - 1; index >= 0; index -= 1) {
      const { burst, animal } = popsInFlight[index]
      if (burst.update(deltaSeconds)) continue
      burst.dispose()
      animal.dispose()
      popsInFlight.splice(index, 1)
    }
    const owls = animals
      .filter((animal) => animal.isFlier && !animal.isSold)
      .map((animal) => ({ animal, hasRoost: roostedOwls.has(animal.instanceId) }))
    if (owls.length > 0) owlPresenter.present(simAlpha, deltaSeconds, owls)
  }

  const preyInput = (animal: BalloonAnimal, targetable: boolean): PreyInput => ({ id: animal.instanceId, species: animal.id, record: animal.sim, targetable })

  function stepOwlHunt(stepSeconds: number): void {
    const owlAnimals = animals.filter((animal) => animal.isFlier && !animal.isSold)
    if (owlAnimals.length === 0) return
    const roosts = gardenProps()?.roosts() ?? []
    // Stranded means no oak on the farm at all; an oak whose model is still loading is not a loss.
    const oakCount = gardenProps()?.propCounts().oak ?? 0
    let nextRoost = 0
    roostedOwls.clear()
    const owls: OwlInput[] = owlAnimals.map((animal) => {
      const record = progress.animal(animal.instanceId)
      const stage = record?.stage ?? 0
      const carnival = carnivalSpawnFor(animal.id)
      // A resident takes the next oak; owls beyond the oak count share one, a step apart.
      // A visitor has no perch and leaves at dawn. A resident with no oak at all is stranded.
      let roost: OwlInput['roost'] = null
      if (stage >= 3 && roosts.length > 0) {
        const base = roosts[nextRoost % roosts.length]
        const sharers = Math.floor(nextRoost / roosts.length)
        roost = { x: base.x + sharers * 0.9, y: base.y, z: base.z }
        roostedOwls.add(animal.instanceId)
        nextRoost += 1
      }
      return { id: animal.instanceId, carnivalSpawn: carnival, stage, roost, stranded: stage >= 3 && oakCount === 0, sold: animal.isSold }
    })
    const flock = animals
      .filter((animal) => animal.id === 'chicken' && !animal.isSold && animal.isAtFarm)
      .filter((animal) => {
        const record = progress.animal(animal.instanceId)
        return Boolean(record && record.stage >= 3 && !record.baby)
      })
      .map((animal) => preyInput(animal, !animal.isCapturing && !animal.isResidencyPending))
    const bounds = activeGardenBounds()
    owlSim.step(stepSeconds, {
      night: isNightTime(dayNightClock.timeOfDay),
      owls,
      prey: flock,
      farm: { halfWidth: bounds.halfWidth, halfDepth: bounds.halfDepth },
    }, huntEvents)
  }

  /**
   * Snakes stalk mice and rats through the grass. A snake on the farm (a visitor
   * or a resident) hunts; prey is any adult mouse or rat out on the farm, and a
   * species down to its breeding pair is left alone.
   */
  const SNAKE_MOUTH_SHARE = 0.42

  function stepSnakeHunt(stepSeconds: number): void {
    const prey = PREY_OF.snake ?? []
    const snakes = animals
      .filter((animal) => animal.id === 'snake' && !animal.isSold)
      .map((animal) => {
        const record = progress.animal(animal.instanceId)
        const busy = animal.isCapturing || animal.isResidencyPending || animal.isGoingHome
        // `size` is the model's length, so the mouth sits a little under half of it ahead of the centre.
        const reach = (bodySizeBySpecies.get('snake') ?? 2.8) * SNAKE_MOUTH_SHARE * animal.currentScale
        return { id: animal.instanceId, record: animal.sim, huntAllowed: Boolean(record && record.stage >= 2 && animal.isAtFarm && !busy), reach }
      })
    if (snakes.length === 0) return
    const quarry = animals
      .filter((animal) => prey.includes(animal.id) && !animal.isSold && animal.isAtFarm)
      .filter((animal) => {
        const record = progress.animal(animal.instanceId)
        return Boolean(record && record.stage >= 3 && !record.baby)
      })
      .map((animal) => preyInput(animal, !animal.isCapturing && !animal.isResidencyPending && !animal.isGoingHome))
    snakeHunt.step(stepSeconds, { snakes, prey: quarry, preyCounts: residentCounts() }, huntEvents)
    // Mice scattering with no house to hide in calm down after a few seconds. Only checked
    // while a snake is about, as it always was.
    const now = performance.now() / 1000
    for (const [id, until] of panicking) {
      if (until > now) continue
      animalById.get(id)?.setAlarmed(false)
      panicking.delete(id)
    }
  }

  /** Play what the hunts decided this tick: tallies, notices, pops and the mouse that got away. */
  function playHuntEvents(): void {
    for (const event of huntEvents) {
      if (event.type === 'caught') {
        const prey = animalById.get(event.preyId)
        if (prey) handlePredatorCatch(event.hunter, prey, event.roll)
      } else if (event.type === 'escaped') {
        const prey = animalById.get(event.preyId)
        if (prey) boltHome(prey, event.roll)
      } else if (event.cause === 'caught') {
        const prey = animalById.get(event.animalId)
        if (prey) popAnimal(prey)
      } else {
        const owl = animalById.get(event.animalId)
        if (!owl) continue
        const name = animalNames.get(owl.instanceId) ?? preyLabel(owl.id)
        popAnimal(owl, 'deflate')
        notificationPanel.notifyAccomplishment(`${name} ran out of helium`, 'Without an oak to roost on, an owl slowly deflates.')
        console.info(`[Animal Balloon Farm] ${owl.id} popped: out of helium`)
      }
    }
    huntEvents.length = 0
  }

  /**
   * One sim tick of both hunts, after the animals have walked: decide, steer the
   * hunters and prey through their records, and play whatever happened.
   */
  function tickHunts(stepSeconds: number): void {
    stepOwlHunt(stepSeconds)
    stepSnakeHunt(stepSeconds)
    playHuntEvents()
  }

  /** How much faster than its walk a mouse runs for home when the strike die lets it off. */
  const ESCAPE_SPRINT = 3
  /** How long an escaped mouse hides indoors before it dares come out. */
  const ESCAPE_HIDING_SECONDS = 30
  /** How long one with no house to run to panics in the open. */
  const ESCAPE_PANIC_SECONDS = 4
  /** Prey sprinting home from a snake: its trip is not cancelled by the outdoor roster. */
  const bolting = new Set<string>()
  /** Prey that escaped indoors stays in until then (seconds, `performance.now` clock). */
  const hidingUntil = new Map<string, number>()
  /** Prey with nowhere to hide, scattering in the open until then. */
  const panicking = new Map<string, number>()

  /**
   * The strike die let the prey off: it sprints for the nearest house of its kind
   * with room and hides there a while. With no house, it scatters in a panic.
   */
  function boltHome(prey: BalloonAnimal, roll: number): void {
    const now = performance.now() / 1000
    const name = animalNames.get(prey.instanceId) ?? preyLabel(prey.id)
    const reserved = new Map<string, number>()
    for (const trip of goingIn.values()) reserved.set(trip.houseId, (reserved.get(trip.houseId) ?? 0) + 1)
    const used = new Map(occupantsByHouse(progress.all(), reserved))
    const from = { x: prey.currentPosition.x, z: prey.currentPosition.z }
    const house = houseWithRoom(prey.id, houses(), used, HOUSE_CAPACITY, from)
    if (house) {
      prey.setHomeTrip({ x: house.doorX, z: house.doorZ }, ESCAPE_SPRINT)
      goingIn.set(prey.instanceId, { houseId: house.id, since: now })
      bolting.add(prey.instanceId)
      hidingUntil.set(prey.instanceId, now + ESCAPE_HIDING_SECONDS)
      const place = propDefinition(house.prop).name.toLowerCase()
      notificationPanel.notifyAccomplishment(`${name} got away (snake rolled ${roll})`, `It dashed into the ${place} to hide.`)
    } else {
      prey.setAlarmed(true)
      panicking.set(prey.instanceId, now + ESCAPE_PANIC_SECONDS)
      notificationPanel.notifyAccomplishment(`${name} got away (snake rolled ${roll})`, 'With no house to hide in, it scatters through the grass.')
    }
    console.info(`[Animal Balloon Farm] snake rolled ${roll}: ${prey.id} escaped${house ? ` into ${house.id}` : ''}`)
  }

  return {
    predationLedger,
    popAnimal,
    owlHunt,
    snakeHunt,
    popsInFlight,
    bolting,
    hidingUntil,
    panicking,
    tickHunts,
    presentHunts,
  }
}
