import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { createOwlPresenter } from './owl-hunt'
import { createLionSim, createOwlSim, createSnakeSim, type HuntEvent, type LionInput, type OwlInput, type PreyInput } from '../game/animal-hunt'
import { isApexSpecies, LION_TUNING, type LionEvent, type LionHouseView } from '../game/apex-raid'
import type { AnimalLifeEvent } from '../game/animal-life'
import { createPopBurst, type PopBurst } from './pop-burst'
import { createDeflateEffect } from './deflate-effect'
import { createPredationLedger, isNightTime, PREY_OF } from '../game/predator'
import { HOUSE_CAPACITY, houseWithRoom, occupantsByHouse } from '../game/animal-housing'
import { propDefinition } from '../game/farm-props'
import type { AnimalRecord, createAnimalLife } from '../game/animal-life'
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
  /** Residents per species, babies and animals indoors included: what an apex predator counts. */
  readonly herdCounts: () => Record<string, number>
  /** Animals the scene must not draw right now (the lion inside a house). The herd reads it. */
  readonly hiddenAnimals: Set<string>
  /** Play life events the way a tick's are played (the lion's summon and its return to the hills). */
  readonly applyLifeEvents: (events: readonly AnimalLifeEvent[]) => void
  readonly createAnimalInstance: (record: AnimalRecord, position?: { x: number; z: number }) => Promise<BalloonAnimal>
}

export function createPredation(deps: PredationDeps) {
  const { fairgroundRoot, lawnY, scene, progress, animals, animalById, animalNames, farmHomes, goingIn, getFocusedAnimal, setFocusedAnimal, houses, gardenProps, animalCard, syncFarmChrome, notificationPanel, refreshAnimalVisibility, carnivalSpawnFor, activeGardenBounds, residentCounts, bodySizeBySpecies, speciesPluralName, dayNightClock, herdCounts, hiddenAnimals, applyLifeEvents, createAnimalInstance } = deps
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
  /** The mountain lion (pure sim in game/apex-raid.ts): a crowd of any species summons it. */
  const lionHunt = createLionSim()
  const huntEvents: HuntEvent[] = []
  /**
   * A pop playing out. `animal` is the model it swells and the effect disposes,
   * or null for an animal eaten indoors (it has no model). `wait` holds a burst
   * back a moment, so a house raid pops its victims out of the door one by one.
   */
  interface PopInFlight { readonly burst: PopBurst; readonly animal: BalloonAnimal | null; wait: number }
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
    // A raid is told in one notice at its end, not one per catch.
    if (isApexSpecies(hunter)) return
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
    popsInFlight.push({ burst, animal: prey, wait: 0 })
    refreshAnimalVisibility(performance.now() / 1000, true)
  }

  /**
   * Per frame: finish the pop effects, and show every owl where the last two sim
   * ticks put it (`simAlpha` of the way between them).
   */
  function presentHunts(deltaSeconds: number, simAlpha: number): void {
    for (let index = popsInFlight.length - 1; index >= 0; index -= 1) {
      const pop = popsInFlight[index]
      if (pop.wait > 0) {
        pop.wait -= deltaSeconds
        if (pop.wait > 0) continue
        scene.add(pop.burst.root)
      }
      if (pop.burst.update(deltaSeconds)) continue
      pop.burst.dispose()
      pop.animal?.dispose()
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
      return { id: animal.instanceId, carnivalSpawn: carnival, stage, roost, stranded: stage >= 3 && oakCount === 0, sold: animal.isSold, hungry: progress.wantsToHunt(animal.instanceId) }
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
        return { id: animal.instanceId, record: animal.sim, huntAllowed: Boolean(record && record.stage >= 2 && animal.isAtFarm && !busy && progress.wantsToHunt(animal.instanceId)), reach }
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
        // A catch is a big meal: a fed predator lazes about until it is hungry again.
        progress.feedCatch(event.hunterId)
      } else if (event.type === 'escaped') {
        const prey = animalById.get(event.preyId)
        if (prey) boltHome(prey, event.roll)
      } else if (event.type === 'raid') {
        playRaidEvent(event.event, event.hunterId)
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
    stepLionHunt(stepSeconds)
    playHuntEvents()
  }

  // ----------------------------------------------------------- the mountain lion --

  /** How far ahead of its centre the lion's mouth is, as a share of its length. */
  const LION_MOUTH_SHARE = 0.42
  /** How far inside the fence the lion lands when it comes over, and how far past it it walks off. */
  const LION_FENCE_INSET = 1.6
  const LION_EXIT_MARGIN = 6
  /** Seconds between the pops of a house raid, so the victims come out of the door one by one. */
  const DEVOUR_POP_GAP = 0.22
  /** The lion's quarry indoors stays hidden this long after it was last about. */
  const RAID_HIDING_SECONDS = 4

  /** The mountain lion's record: the one in the world if there is one, else the one waiting in the hills. */
  function lionRecord(records: readonly AnimalRecord[]): AnimalRecord | null {
    let best: AnimalRecord | null = null
    for (const record of records) {
      if (!isApexSpecies(record.species)) continue
      if (!best || record.stage > best.stage) best = record
    }
    return best
  }

  /**
   * The fence point in the direction of `to`, `offset` beyond it (negative: inside). The
   * fence is taken as the ellipse inside the plot's bounds, so a point just inside it is
   * on the farm even where an organic footprint rounds the corners off.
   */
  function fencePoint(to: { readonly x: number; readonly z: number }, offset: number): { x: number; z: number } {
    const bounds = activeGardenBounds()
    const halfWidth = Math.max(2, bounds.halfWidth)
    const halfDepth = Math.max(2, bounds.halfDepth)
    const angle = Math.atan2(to.z / halfDepth, to.x / halfWidth)
    return { x: Math.cos(angle) * (halfWidth + offset), z: Math.sin(angle) * (halfDepth + offset) }
  }

  /** Where the quarry is: the first of it out in the open, else the first house it hides in, else off to one side. */
  function quarrySpot(species: string): { x: number; z: number } {
    const outside = animals.find((animal) => animal.id === species && !animal.isSold && animal.isAtFarm)
    if (outside) return { x: outside.currentPosition.x, z: outside.currentPosition.z }
    const holding = new Set(progress.all().filter((record) => record.species === species && record.insideId).map((record) => record.insideId))
    const house = houses().find((spot) => holding.has(spot.id))
    return house ? { x: house.doorX, z: house.doorZ } : { x: 1, z: 0 }
  }

  function stepLionHunt(stepSeconds: number): void {
    const records = progress.all()
    const record = lionRecord(records)
    const model = record ? animalById.get(record.id) : undefined
    const live = model && !model.isSold ? model : undefined
    const stage = record && !model?.isSold ? record.stage : 0
    const lion: LionInput | null = record ? {
      id: record.id,
      stage,
      record: live?.sim ?? null,
      reach: (bodySizeBySpecies.get(record.species) ?? 2.9) * LION_MOUTH_SHARE * (live?.currentScale ?? 1),
      speed: ANIMAL_CATALOG.find((entry) => entry.id === record.species)?.speed ?? 1.4,
      // On the farm but not yet drawn, or mid paint-reveal of a taming: it waits.
      busy: stage >= 2 && (!live || live.isCapturing),
    } : null
    const prey: PreyInput[] = animals
      .filter((animal) => !animal.isSold && !animal.isFlier && animal.isAtFarm && !isApexSpecies(animal.id))
      .filter((animal) => (progress.animal(animal.instanceId)?.stage ?? 0) >= 2)
      .map((animal) => preyInput(animal, !animal.isCapturing && !animal.isGoingHome))
    const insideBy = new Map<string, { id: string; species: string }[]>()
    const herds: Record<string, number> = {}
    for (const entry of records) {
      if (entry.stage >= 3 && !animalById.get(entry.id)?.isSold) herds[entry.species] = (herds[entry.species] ?? 0) + 1
      if (!entry.insideId) continue
      const list = insideBy.get(entry.insideId) ?? []
      list.push({ id: entry.id, species: entry.species })
      insideBy.set(entry.insideId, list)
    }
    const houseViews: LionHouseView[] = houses().map((house) => ({ id: house.id, doorX: house.doorX, doorZ: house.doorZ, inside: insideBy.get(house.id) ?? [] }))
    const at = live ? { x: live.sim.x, z: live.sim.z } : { x: 0, z: 0 }
    const bounds = activeGardenBounds()
    lionHunt.step(stepSeconds, { lion, prey, herds, houses: houseViews, exit: fencePoint(at, LION_EXIT_MARGIN), bounds: { halfWidth: bounds.halfWidth, halfDepth: bounds.halfDepth } }, huntEvents)
    // While it raids, its quarry indoors cowers there and will not come out: the lion has to go in.
    const report = lionHunt.report()
    if (report.quarry && stage >= 2 && report.phase !== 'leave') {
      // And any of it on its way in bolts for the door instead of strolling (a trip home beats the scramble).
      for (const animal of animals) {
        const home = animal.sim.home
        if (animal.id === report.quarry && home && home.speedScale < LION_TUNING.fleeSpeedScale) animal.setHomeTrip(home, LION_TUNING.fleeSpeedScale)
      }
      const until = performance.now() / 1000 + RAID_HIDING_SECONDS
      for (const views of insideBy.values()) {
        for (const entry of views) if (entry.species === report.quarry) hidingUntil.set(entry.id, until)
      }
    }
    // Up in the hills it is not drawn; hold it where it left so it does not wander back in unseen.
    if (live && stage === 0 && !live.sim.pursuit) live.setPursuit({ x: live.sim.x, z: live.sim.z, speedScale: 0 })
    const hide = Boolean(record && lionHunt.isHidden(record.id))
    if (record && hide !== hiddenAnimals.has(record.id)) {
      if (hide) hiddenAnimals.add(record.id)
      else hiddenAnimals.delete(record.id)
      refreshAnimalVisibility(performance.now() / 1000, true)
    }
  }

  /** A crowd brought it: over the fence by the quarry, on the farm as a wild raider (stage 2). */
  function summonLion(species: string): void {
    const events = progress.summon('cougar')
    const arrival = events.find((event) => event.animalId)
    const record = arrival?.animalId ? progress.animal(arrival.animalId) : undefined
    if (!record) return
    const entry = fencePoint(quarrySpot(species), -LION_FENCE_INSET)
    const model = animalById.get(record.id)
    if (model) {
      model.setPursuit(null)
      model.placeAt(entry.x, entry.z)
      applyLifeEvents(events)
    } else {
      applyLifeEvents(events)
      void createAnimalInstance(record, entry).then((created) => {
        created.placeAt(entry.x, entry.z)
        refreshAnimalVisibility(performance.now() / 1000, true)
      })
    }
    const count = herdCounts()[species] ?? 0
    notificationPanel.notifyAccomplishment('A mountain lion is on the farm!', `It has come for your ${count} ${speciesPluralName(species).toLowerCase()}, and a house will not save them.`)
    console.info(`[Animal Balloon Farm] mountain lion arrived for ${count} ${species}`)
  }

  /** The lion went into a house: everyone of its quarry in there pops out of the door, one after another. */
  function devourInside(houseId: string, preyIds: readonly string[]): void {
    const house = houses().find((spot) => spot.id === houseId)
    let eaten = 0
    let species = ''
    for (const id of preyIds) {
      const record = progress.animal(id)
      if (!record) continue
      species = record.species
      predationLedger.record(record.species)
      hidingUntil.delete(id)
      const model = animalById.get(id)
      if (model) {
        popAnimal(model)
      } else {
        progress.remove(id)
        const catalog = ANIMAL_CATALOG.find((entry) => entry.id === record.species)
        const door = new THREE.Vector3(house?.doorX ?? 0, lawnY, house?.doorZ ?? 0)
        const burst = createPopBurst({
          position: door,
          color: catalog?.color ?? '#f6c94d',
          accent: record.species === 'chicken' ? '#e65b69' : '#fff0d0',
          burstHeight: (catalog?.size ?? 1.8) * 0.42,
          animal: null,
        })
        popsInFlight.push({ burst, animal: null, wait: eaten * DEVOUR_POP_GAP })
        if (eaten === 0) scene.add(burst.root)
      }
      eaten += 1
    }
    if (eaten === 0) return
    const place = house ? propDefinition(house.prop).name.toLowerCase() : 'house'
    const herd = eaten === 1 ? preyLabel(species) : speciesPluralName(species).toLowerCase()
    notificationPanel.notifyAccomplishment(`The mountain lion broke into the ${place}`, `${eaten} ${herd} eaten inside.`)
    console.info(`[Animal Balloon Farm] mountain lion ate ${eaten} ${species} inside ${houseId}`)
  }

  /** Play what the lion decided this tick. Catches came through as `caught`/`popped` already. */
  function playRaidEvent(event: LionEvent, lionId: string | null): void {
    switch (event.kind) {
      case 'scent': {
        const herd = speciesPluralName(event.species).toLowerCase()
        if (event.tame) {
          notificationPanel.notifyAccomplishment(`Your mountain lion is eyeing the ${herd}`, `There are ${event.count}. It will thin them back to six unless you do first.`)
        } else {
          notificationPanel.notifyAccomplishment(`Something in the hills smells your ${event.count} ${herd}`, `A mountain lion is coming for every last one in about ${Math.round(event.seconds)} seconds. Sell some to get back to six and it loses interest.`)
        }
        console.info(`[Animal Balloon Farm] mountain lion caught the scent of ${event.count} ${event.species}`)
        break
      }
      case 'lostScent': {
        const herd = speciesPluralName(event.species).toLowerCase()
        notificationPanel.notifyAccomplishment(event.tame ? 'Your mountain lion settles down' : 'The mountain lion lost interest', `Your ${herd} are back to six.`)
        break
      }
      case 'arrive':
        summonLion(event.species)
        break
      case 'pounce':
        // The crouch, the leap and the swipe are one clip, keyed to the sim's beats (LION_TUNING).
        if (lionId) animalById.get(lionId)?.playOnce('STRIKE')
        break
      case 'devour':
        devourInside(event.houseId, event.preyIds)
        break
      case 'cleared': {
        const herd = speciesPluralName(event.species).toLowerCase()
        const eaten = `It ate ${event.eaten} ${event.eaten === 1 ? preyLabel(event.species) : herd}`
        if (event.tame) notificationPanel.notifyAccomplishment(`Your mountain lion thinned the ${herd}`, `${eaten}. They are back to six.`)
        else if (event.left > 0) notificationPanel.notifyAccomplishment('The mountain lion gave up the hunt', `${eaten}; ${event.left} stayed out of its reach. It is heading back to the hills.`)
        else notificationPanel.notifyAccomplishment(`Every one of your ${herd} is gone`, `${eaten}, even the ones hiding indoors, and is heading back to the hills.`)
        console.info(`[Animal Balloon Farm] mountain lion raid over: ${event.eaten} ${event.species} eaten, ${event.left} left`)
        break
      }
      case 'gone': {
        if (!lionId) break
        applyLifeEvents(progress.sendAway(lionId))
        hiddenAnimals.delete(lionId)
        refreshAnimalVisibility(performance.now() / 1000, true)
        break
      }
      default:
        break
    }
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
    lionHunt,
    popsInFlight,
    bolting,
    hidingUntil,
    panicking,
    tickHunts,
    presentHunts,
  }
}
