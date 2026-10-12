import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import { PLANT_CATALOG } from '../game/plants'
import type { GardenPlants } from './garden-plants'
import type { GardenProps, HouseSpot } from './garden-props'
import type { FarmState } from '../game/farm-state'
import type { FarmSnapshot } from '../game/animal-progress'
import type { AnimalLifeEvent, AnimalLifeSnapshot, AnimalRecord, createAnimalLife } from '../game/animal-life'
import type { AccomplishmentDef, AccomplishmentStage, createAccomplishmentTracker } from '../game/accomplishments'
import type { createProgressLedger } from '../game/farm-progression'
import { isNightTime } from '../game/predator'
import { DIETS } from '../game/animal-diet'
import type { VisitorMotion } from './visitor-motion'

export interface FarmLifecycleDeps {
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly progression: ReturnType<typeof createProgressLedger>
  readonly accomplishments: ReturnType<typeof createAccomplishmentTracker>
  readonly notificationPanel: { notifyAccomplishment(title: string, detail: string): void; notifyMilestone(kind: 'birth', subject: string): void }
  readonly animals: BalloonAnimal[]
  readonly animalById: Map<string, BalloonAnimal>
  readonly farmHomes: Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>
  readonly newbornUntil: Map<string, number>
  readonly NEWBORN_SHOW_SECONDS: number
  readonly getFocusedAnimal: () => string | null
  readonly menuOpen: () => boolean
  readonly salePanelOpen: () => boolean
  readonly gardenProps: () => GardenProps | null
  readonly gardenPlants: () => GardenPlants | null
  readonly expansionLevel: () => number
  readonly houses: () => readonly HouseSpot[]
  readonly setHouses: (spots: readonly HouseSpot[]) => void
  readonly updateHousing: (nowSeconds: number) => void
  readonly measureFarmForSim: () => FarmState
  readonly dayNightClock: { readonly timeOfDay: number }
  readonly createAnimalInstance: (record: AnimalRecord, position?: { x: number; z: number }, emerging?: boolean) => Promise<BalloonAnimal>
  readonly visitorMotion: VisitorMotion
  readonly fairgroundRoot: THREE.Object3D
  readonly refreshAnimalVisibility: (nowSeconds: number, force?: boolean) => void
  readonly animalDisplayName: (species: string) => string
  readonly animalNames: Map<string, string>
  readonly popAnimal: (animal: BalloonAnimal, style?: 'bang' | 'deflate') => void
  readonly animalCard: { setHelium(helium: number): void }
  readonly noteJournalStages: () => void
  /** A resident made a good (milk into the barn, a gem from the starhorn). */
  readonly onProduce?: (event: AnimalLifeEvent) => void
  /** Plural display name, e.g. "Cows", for herd-wide notices. */
  readonly speciesPluralName?: (species: string) => string
}

/** A herd-wide hunger notice is given at most this often per species (seconds, game time). */
const HUNGER_NOTICE_SECONDS = 240

/** What a hungry species can be given, in a notice. */
const FOOD_HINTS: Readonly<Record<string, string>> = {
  grass: 'Grow more lawn, thin the herd, or buy feed at the shop.',
  pondweed: 'Dig a bigger pond, plant lilies, or thin the flock.',
  seeds: 'Plant more dandelions and poppies, or buy feed.',
  scraps: 'Put out a garbage can, or leave some goods to spoil into slop.',
  meadow: 'Sow more tall meadow grass.',
  worms: 'Leave more of the farm as bare dirt.',
  prey: 'It needs prey on the farm to hunt.',
  blooms: 'Plant more flowers.',
}

export function createFarmLifecycle(deps: FarmLifecycleDeps) {
  const { onProduce, speciesPluralName } = deps
  /** Game seconds left before each species' next hunger notice may show. */
  const hungerNoticeCooldown = new Map<string, number>()
  const { progress, progression, accomplishments, notificationPanel, animals, animalById, animalNames, popAnimal, animalCard, farmHomes, newbornUntil, NEWBORN_SHOW_SECONDS, getFocusedAnimal, menuOpen, salePanelOpen, gardenProps, gardenPlants, expansionLevel, houses, setHouses, updateHousing, measureFarmForSim, dayNightClock, createAnimalInstance, visitorMotion, animalDisplayName, noteJournalStages, fairgroundRoot, refreshAnimalVisibility } = deps
  /**
   * Advance every animal one step and play whatever transition it earned.
   *
   * This is the only place the scene learns that a condition was met, and it
   * does so by setting `animal.stage` -- the animal then runs its own reveal.
   * Keeping the event handling here means `balloon-animal.ts` never has to know
   * that a condition system exists. */
  function progressionHudState() {
    const housing = progress.housing()
    return {
      points: progression.points,
      level: progression.level,
      pointsToNextLevel: progression.pointsToNextLevel,
      population: progress.all().filter((animal) => animal.stage > 0).length,
      outside: animals.filter((animal) => !animal.isSold && (progress.animal(animal.instanceId)?.stage ?? 0) > 0).length,
      houseRoom: housing.capacity,
      houseUsed: housing.used,
    }
  }

  function currentFarmSnapshot(): FarmSnapshot {
    const residentSpecies = new Set(progress.all()
      .filter((entry) => entry.stage >= 3 && !entry.baby && !animalById.get(entry.id)?.isSold)
      .map((entry) => entry.species))
    return { state: measureFarmForSim(), residentSpecies, night: isNightTime(dayNightClock.timeOfDay) }
  }

  function accomplishmentStageForKind(kind: AnimalLifeEvent['kind']): AccomplishmentStage | null {
    if (kind === 'arriveCarnival') return 'appear'
    if (kind === 'enterFarm') return 'visit'
    if (kind === 'settle') return 'live'
    if (kind === 'fallInLove') return 'breed'
    return null
  }

  function unlockAccomplishment(def: AccomplishmentDef): void {
    progression.awardPoints(def.id, def.points)
    notificationPanel.notifyAccomplishment(def.title + ' · +' + def.points + ' pts', def.detail)
  }

  function ownedSeedSpecies(): ReadonlySet<string> {
    const owned = new Set<string>()
    for (const entry of PLANT_CATALOG) {
      if ((gardenPlants()?.simulation.seedsFor(entry.id) ?? 0) > 0) owned.add(entry.id)
    }
    for (const plant of gardenPlants()?.simulation.plants ?? []) owned.add(plant.species)
    return owned
  }

  function handleAnimalLifeEvents(events: readonly AnimalLifeEvent[]): void {
    visitorMotion.beginBatch()
    for (const event of events) {
      const animal = event.animalId ? animalById.get(event.animalId) : undefined
      const stage = accomplishmentStageForKind(event.kind)
      if (stage) {
        const earned = accomplishments.discoverAnimalStage(event.species, stage)
        if (earned) unlockAccomplishment(earned)
      }
      if (event.stage !== undefined && animal) {
        animal.stage = event.stage
        animal.setDetailedVisible(animal.instanceId === getFocusedAnimal() || animal.isCapturing)
        // A new arrival comes in at the far edge of the meadow and walks to its
        // spot; one that is stepping onto the farm, or has left, stops being walked.
        if (event.kind === 'arriveCarnival') visitorMotion.beginArrival(animal, visitorMotion.planArrival(event))
        if (event.kind === 'enterFarm' || event.kind === 'departCarnival') visitorMotion.cancel(animal.instanceId)
        if (event.kind === 'settle' || event.kind === 'fallInLove') {
          // Logged here rather than beside the tick so the debug setStage reports
          // the same thing a live promotion does.
          console.info(`[Animal Balloon Farm] ${event.species} -> stage ${event.stage}`)
        }
      }
      if (event.kind === 'arriveCarnival' && event.animalId && !animal) {
        const record = progress.animal(event.animalId)
        if (record) {
          const plan = visitorMotion.planArrival(event)
          void createAnimalInstance(record, plan.entry).then((created) => {
            farmHomes.set(created.instanceId, { parent: created.root.parent ?? fairgroundRoot, position: created.root.position.clone() })
            visitorMotion.beginArrival(created, plan)
          })
        }
      }
      if (event.kind === 'birth' && event.animalId) {
        // The baby is born indoors; keeping it in view for a while brings it out of the door.
        newbornUntil.set(event.animalId, performance.now() / 1000 + NEWBORN_SHOW_SECONDS)
        notificationPanel.notifyMilestone('birth', animalDisplayName(event.species))
        console.info(`[Animal Balloon Farm] a ${event.species} was born in ${event.houseId}`)
      }
      if (event.kind === 'growUp' && animal) animal.setGrowth(1)
    if (event.kind === 'unsettle' && animal) {
      const name = animalNames.get(animal.instanceId) ?? animalDisplayName(event.species)
      notificationPanel.notifyAccomplishment(`${name} is losing helium`, 'The farm no longer suits it. Put things back before it goes flat.')
      console.info(`[Animal Balloon Farm] ${event.species} unsettled: the farm no longer suits it`)
    }
    if (event.kind === 'resettle' && animal) {
      const name = animalNames.get(animal.instanceId) ?? animalDisplayName(event.species)
      notificationPanel.notifyAccomplishment(`${name} is topping up again`, 'The farm suits it once more.')
    }
    if (event.kind === 'hunger' && (event.hunger === 'hungry' || event.hunger === 'starving')) {
      const key = `${event.species}:${event.hunger}`
      if ((hungerNoticeCooldown.get(key) ?? 0) <= 0) {
        hungerNoticeCooldown.set(key, HUNGER_NOTICE_SECONDS)
        const herd = speciesPluralName?.(event.species) ?? animalDisplayName(event.species)
        const food = DIETS[event.species]?.foods[0]
        const hint = (food && FOOD_HINTS[food]) ?? 'The farm is not growing enough for them.'
        if (event.hunger === 'hungry') notificationPanel.notifyAccomplishment(`${herd} are going hungry`, `Hungry animals stop breeding and making goods. ${hint}`)
        else notificationPanel.notifyAccomplishment(`${herd} are starving`, `A starving balloon loses helium. ${hint}`)
      }
    }
    if (event.kind === 'produce') onProduce?.(event)
    if (event.kind === 'deflate' && animal) {
      const name = animalNames.get(animal.instanceId) ?? animalDisplayName(event.species)
      popAnimal(animal, 'deflate')
      if (event.reason !== 'starved') notificationPanel.notifyAccomplishment(`${name} ran out of helium`, 'The farm stopped suiting it, and it slowly went flat.')
      else if ((hungerNoticeCooldown.get(`${event.species}:flat`) ?? 0) <= 0) {
        // An overgrown herd can lose several at once; one notice per species is enough.
        hungerNoticeCooldown.set(`${event.species}:flat`, HUNGER_NOTICE_SECONDS)
        notificationPanel.notifyAccomplishment(`${name} ran out of helium`, 'It went too long without enough to eat, and slowly went flat. The herd is bigger than the farm can feed.')
      }
      console.info(`[Animal Balloon Farm] ${event.species} popped: the farm stopped suiting it`)
    }
    }
  }

  /**
   * Everything the animal sim reads from the scene, in one place. Every tick goes
   * through here: a tick that left out the houses would evict every resident.
   */
  function animalLifeSnapshot(): AnimalLifeSnapshot {
    setHouses(gardenProps()?.houses() ?? [])
    return {
      farm: currentFarmSnapshot(),
      expansionLevel: expansionLevel(),
      positions: Object.fromEntries(animals.map((animal) => [animal.instanceId, { x: animal.root.position.x, z: animal.root.position.z }])),
      houses: houses().map((house) => ({ id: house.id, prop: house.prop, x: house.x, z: house.z })),
    }
  }

  function updateAnimalProgress(deltaSeconds: number): void {
    if (menuOpen() || salePanelOpen()) return
    for (const [key, left] of hungerNoticeCooldown) hungerNoticeCooldown.set(key, left - deltaSeconds)
    const events = progress.tick(animalLifeSnapshot(), deltaSeconds)
    handleAnimalLifeEvents(events)
    noteJournalStages()
    for (const record of progress.all()) {
      const animal = animalById.get(record.id)
      if (!animal || animal.isSold) continue
      if (record.departing) visitorMotion.beginDeparture(animal)
      // A leaking balloon visibly sags: it shrinks toward just over half size at flat.
      animal.setGrowth(record.growth * record.adultScale * (0.55 + 0.45 * record.helium))
    }
    visitorMotion.step()
    const focused = getFocusedAnimal()
    if (focused) animalCard.setHelium(progress.animal(focused)?.helium ?? 1)
    updateHousing(performance.now() / 1000)
    // No appearance is applied from the event list here: `animal.stage = event.stage`
    // already routes the promotion through the model's residency gate, which keeps
    // a settle that arrives out at the tents waiting until the walk-in is done.
    refreshAnimalVisibility(performance.now() / 1000)
    // Land is no longer handed out for points: farmer level only opens the next
    // Land Deed at the shop (see game/tool-unlocks.ts), and buying it expands.
  }

  return {
    progressionHudState,
    handleAnimalLifeEvents,
    animalLifeSnapshot,
    updateAnimalProgress,
    ownedSeedSpecies,
    unlockAccomplishment,
  }
}
