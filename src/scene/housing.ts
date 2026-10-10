import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import type { BalloonAnimalId } from '../animals/animal-catalog'
import type { AnimalRecord, createAnimalLife } from '../game/animal-life'
import { chooseOutdoorRoster, HOUSE_CAPACITY, houseAccepts, houseOccupancy, houseWithRoom, isHouse, occupantsByHouse, type RosterAnimal } from '../game/animal-housing'
import { animalSaleValue } from '../game/sales'
import { isNightTime } from '../game/predator'
import { SLEEP_PROPS, bedBeside, pickAnchor, shouldSleep, type Bed } from '../game/sleep'
import { footprintWorldRect, propDefinition, type PropId } from '../game/farm-props'
import { resolveCollisions, type CollisionBody, type CollisionBox } from '../game/animal-collision'
import type { GardenProps, HouseSpot } from './garden-props'
import type { PropResidents } from '../ui/prop-card'

export interface HousingDeps {
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly animals: BalloonAnimal[]
  readonly animalById: Map<string, BalloonAnimal>
  readonly farmHomes: Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>
  readonly goingIn: Map<string, { readonly houseId: string; readonly since: number }>
  readonly newbornUntil: Map<string, number>
  readonly knownDoors: Map<string, { readonly x: number; readonly z: number }>
  readonly lastHouseOf: Map<string, string>
  readonly savedIndoors: Map<string, { x: number; z: number }>
  readonly sleepBeds: Map<string, Bed>
  readonly bolting: Set<string>
  readonly hidingUntil: Map<string, number>
  readonly getFocusedAnimal: () => string | null
  readonly isHunted: (id: string) => boolean
  readonly createAnimalInstance: (record: AnimalRecord, position?: { x: number; z: number }, emerging?: boolean) => Promise<BalloonAnimal>
  readonly animalCreations: Map<string, Promise<BalloonAnimal>>
  readonly refreshAnimalVisibility: (nowSeconds: number, force?: boolean) => void
  readonly dayNightClock: { readonly timeOfDay: number }
  readonly getSelectedProp: () => { readonly id: PropId; readonly siteId: string } | null
  readonly propCard: { readonly isOpen: boolean; setResidents(residents: PropResidents | null): void }
  readonly creditCoins: (amount: number) => void
  readonly animalDisplayName: (species: string) => string
  readonly bodySizeBySpecies: Map<string, number>
  readonly crowdFixtures: BalloonAnimal[]
  readonly gardenProps: () => GardenProps | null
}

export function createHousing(deps: HousingDeps) {
  const { progress, animalCreations, animals, animalById, farmHomes, goingIn, newbornUntil, knownDoors, lastHouseOf, savedIndoors, sleepBeds, bolting, hidingUntil, getFocusedAnimal, isHunted, createAnimalInstance, refreshAnimalVisibility, dayNightClock, getSelectedProp, propCard, creditCoins, animalDisplayName, bodySizeBySpecies, crowdFixtures, gardenProps } = deps
  /**
   * Night animals sleep by day: a resident curls up beside a garbage can, anything else
   * where it stands. Everyone wakes at dusk. Beds are chosen once per sleep so the
   * animal is not shuffled about as other animals settle.
   */
  function updateSleepers(): void {
    const night = isNightTime(dayNightClock.timeOfDay)
    // Each night species sleeps by the first prop on its SLEEP_PROPS list that is placed (a house
    // before a can); with none, or no entry, it sleeps where it stands.
    type Home = { x: number; z: number; radius: number; key: string }
    const homesFor = (species: string): Home[] => {
      for (const { prop, radius } of SLEEP_PROPS[species] ?? []) {
        const spots = gardenProps()?.placements(prop as PropId) ?? []
        if (spots.length > 0) return spots.map((spot, index) => ({ ...spot, radius, key: `${prop}:${index}` }))
      }
      return []
    }
    const occupancy = new Map<string, number>()
    const nearHome = (bed: Bed, home: Home): boolean => Math.hypot(bed.x - home.x, bed.z - home.z) < home.radius + 0.5
    for (const animal of animals) {
      const bed = sleepBeds.get(animal.instanceId)
      if (!bed || !shouldSleep(animal.id, night)) continue
      const home = homesFor(animal.id).find((candidate) => nearHome(bed, candidate))
      if (home) occupancy.set(home.key, (occupancy.get(home.key) ?? 0) + 1)
    }
    for (const animal of animals) {
      if (animal.isFlier) continue
      if (animal.isSold) {
        sleepBeds.delete(animal.instanceId)
        continue
      }
      const record = progress.animal(animal.instanceId)
      const wantsSleep = shouldSleep(animal.id, night) && animal.isAtFarm && !animal.isCapturing && !animal.isRomancing
        && Boolean(record && record.stage >= 2 && !record.baby)
      if (!wantsSleep) {
        if (sleepBeds.delete(animal.instanceId)) animal.setSleepSpot(null)
        continue
      }
      let bed = sleepBeds.get(animal.instanceId)
      // A resident prefers a home; if one is placed after it lay down, it moves over.
      const resident = (record?.stage ?? 0) >= 3
      const homes = resident ? homesFor(animal.id) : []
      if (!bed || (homes.length > 0 && !homes.some((home) => nearHome(bed!, home)))) {
        const from = { x: animal.currentPosition.x, z: animal.currentPosition.z }
        const index = pickAnchor(homes, homes.map((home) => occupancy.get(home.key) ?? 0), from)
        if (index >= 0) {
          const home = homes[index]
          const slot = occupancy.get(home.key) ?? 0
          occupancy.set(home.key, slot + 1)
          bed = bedBeside(home, slot, home.radius)
        } else {
          bed = { x: from.x, z: from.z, heading: animal.currentHeading }
        }
        sleepBeds.set(animal.instanceId, bed)
      }
      animal.setSleepSpot(bed)
    }
  }

  /** Houses on the farm, refreshed every tick from the placed props. */
  let houseSpots: readonly HouseSpot[] = []

  /** Who the roster last put outside. */
  let outdoorRoster: ReadonlySet<string> = new Set()

  let lastRosterAt = -Infinity

  const ROSTER_REFRESH_SECONDS = 0.5

  /** Give up on a walk in that never arrives (stuck on a prop) after this long. */
  const GOING_IN_TIMEOUT_SECONDS = 20

  function houseSpot(id: string | null | undefined): HouseSpot | undefined {
    return id ? houseSpots.find((house) => house.id === id) : undefined
  }

  function hasHouseFor(species: string): boolean {
    return houseSpots.some((house) => houseAccepts(house.prop, species))
  }

  /** Must stay in view: busy, selected, hunted, or not yet settled at the farm. */
  function pinnedOutside(id: string, nowSeconds: number): boolean {
    if (id === getFocusedAnimal() || (newbornUntil.get(id) ?? 0) > nowSeconds) return true
    const animal = animalById.get(id)
    if (!animal) return false
    return animal.isCapturing || animal.isResidencyPending || animal.isAlarmed || !animal.isAtFarm
      || isHunted(id)
  }

  /** Take an animal's model off the farm. The record stays in the sim. */
  function retireModel(animal: BalloonAnimal): void {
    animal.setHomeTrip(null)
    goingIn.delete(animal.instanceId)
    bolting.delete(animal.instanceId)
    animalById.delete(animal.instanceId)
    const index = animals.indexOf(animal)
    if (index >= 0) animals.splice(index, 1)
    farmHomes.delete(animal.instanceId)
    sleepBeds.delete(animal.instanceId)
    animal.dispose()
  }

  /** Rebuild an animal's model at a door: it is stepping out onto the farm. */
  function stepOut(record: AnimalRecord, door: { readonly x: number; readonly z: number }): void {
    if (animalById.has(record.id) || animalCreations.has(record.id)) return
    void createAnimalInstance(record, door, true).then((created) => {
      created.placeAt(door.x, door.z)
      refreshAnimalVisibility(performance.now() / 1000, true)
    })
  }

  function cancelTrip(id: string): void {
    animalById.get(id)?.setHomeTrip(null)
    goingIn.delete(id)
    bolting.delete(id)
  }

  /** Give up waiting for a loaded farm's houses after this long and bring indoor animals out instead. */
  const SAVED_INDOORS_WAIT_SECONDS = 5

  let savedIndoorsSince: number | null = null

  /**
   * Put animals that were indoors in a save back into this session's houses:
   * the nearest house of their kind with room to the door they went in by. One
   * with nowhere to go steps out there instead.
   */
  function restoreSavedIndoors(nowSeconds: number): void {
    if (savedIndoors.size === 0) return
    savedIndoorsSince ??= nowSeconds
    const waited = nowSeconds - savedIndoorsSince >= SAVED_INDOORS_WAIT_SECONDS
    if (houseSpots.length === 0 && !waited) return
    for (const [id, door] of savedIndoors) {
      savedIndoors.delete(id)
      const record = progress.animal(id)
      if (!record) continue
      const used = occupantsByHouse(progress.all())
      const house = houseWithRoom(record.species, houseSpots, used, HOUSE_CAPACITY, door)
      if (house && progress.enterHouse(id, house.id)) {
        lastHouseOf.set(id, house.id)
        continue
      }
      stepOut(record, door)
    }
  }

  function updateHousing(nowSeconds: number): void {
    for (const house of houseSpots) knownDoors.set(house.id, { x: house.doorX, z: house.doorZ })
    for (const [id, until] of newbornUntil) if (until <= nowSeconds || !progress.animal(id)) newbornUntil.delete(id)
    restoreSavedIndoors(nowSeconds)
    const records = progress.all().filter((record) => record.stage > 0)
    if (nowSeconds - lastRosterAt >= ROSTER_REFRESH_SECONDS) {
      lastRosterAt = nowSeconds
      const roster: RosterAnimal[] = records.map((record) => ({
        id: record.id,
        species: record.species,
        canGoIndoors: record.stage >= 3 && (record.insideId !== null || hasHouseFor(record.species)),
        pinned: pinnedOutside(record.id, nowSeconds),
      }))
      outdoorRoster = chooseOutdoorRoster({ animals: roster, night: isNightTime(dayNightClock.timeOfDay), timeSeconds: nowSeconds })
    }
    // Space already promised to animals on their way in counts as taken.
    const reserved = new Map<string, number>()
    for (const trip of goingIn.values()) reserved.set(trip.houseId, (reserved.get(trip.houseId) ?? 0) + 1)
    const used = new Map(occupantsByHouse(records, reserved))
    for (const record of records) {
      const animal = animalById.get(record.id)
      if (record.insideId) {
        lastHouseOf.set(record.id, record.insideId)
        if (!outdoorRoster.has(record.id)) continue
        // It just escaped a snake in here: it is not coming out yet.
        if ((hidingUntil.get(record.id) ?? 0) > nowSeconds) continue
        hidingUntil.delete(record.id)
        const house = houseSpot(record.insideId)
        progress.leaveHouse(record.id)
        if (house) stepOut(record, { x: house.doorX, z: house.doorZ })
        continue
      }
      if (!animal) {
        // Out in the sim but with no model: its house was stored or sold from under it.
        if (record.stage >= 3 && !savedIndoors.has(record.id)) stepOut(record, knownDoors.get(lastHouseOf.get(record.id) ?? '') ?? { x: 0, z: 0 })
        continue
      }
      const trip = goingIn.get(record.id)
      // Fleeing a snake beats the roster: it is running for the door, not strolling.
      const fleeing = Boolean(trip) && bolting.has(record.id)
      if (!fleeing && (outdoorRoster.has(record.id) || record.stage < 3)) {
        if (trip) cancelTrip(record.id)
        continue
      }
      if (!trip) {
        const house = houseWithRoom(record.species, houseSpots, used, HOUSE_CAPACITY, { x: animal.currentPosition.x, z: animal.currentPosition.z })
        // Every house of its kind is full: it stays out, over the outdoor limit.
        if (!house) continue
        used.set(house.id, (used.get(house.id) ?? 0) + 1)
        if (animal.isFlier) {
          if (progress.enterHouse(record.id, house.id)) retireModel(animal)
          continue
        }
        animal.setHomeTrip({ x: house.doorX, z: house.doorZ })
        goingIn.set(record.id, { houseId: house.id, since: nowSeconds })
        continue
      }
      if (!houseSpot(trip.houseId)) {
        cancelTrip(record.id)
        continue
      }
      if (animal.isAtDoor || nowSeconds - trip.since > GOING_IN_TIMEOUT_SECONDS) {
        // The house may have filled while it walked over; then it tries again next time.
        if (progress.enterHouse(record.id, trip.houseId)) retireModel(animal)
        else cancelTrip(record.id)
      }
    }
    const selected = getSelectedProp()
    if (propCard.isOpen && selected && isHouse(selected.id)) propCard.setResidents(residentsOf(selected))
  }

  /** Plural display name for a species row on a house card, e.g. "Geese". */
  function speciesPluralName(species: string): string {
    const name = animalDisplayName(species)
    if (species === 'sheep') return name
    if (species === 'goose') return 'Geese'
    if (species === 'mouse') return 'Mice'
    return `${name}s`
  }

  /** The animals inside a house right now. Animals out on the farm belong to no house. */
  function animalsInside(siteId: string): AnimalRecord[] {
    return progress.all().filter((record) => record.insideId === siteId)
  }

  /**
   * Selling a house sells the animals inside it, at their usual prices. They have
   * no model while indoors, so each is simply credited and forgotten; anyone out
   * on the farm is untouched.
   */
  function sellAnimalsInside(siteId: string): number {
    let total = 0
    for (const record of animalsInside(siteId)) {
      const price = animalSaleValue(record.species as BalloonAnimalId, record.stage)
      const model = animalById.get(record.id)
      if (model) retireModel(model)
      progress.remove(record.id)
      newbornUntil.delete(record.id)
      lastHouseOf.delete(record.id)
      total += price
    }
    if (total > 0) creditCoins(total)
    return total
  }

  /** What a house's card shows: space in use and who is inside, by species. */
  function residentsOf(selection: { readonly id: PropId; readonly siteId: string }): PropResidents | null {
    if (!isHouse(selection.id)) return null
    const inside = animalsInside(selection.siteId)
    const occupancy = houseOccupancy(selection.siteId, selection.id, progress.all(), HOUSE_CAPACITY)
    return {
      capacity: occupancy.capacity,
      used: occupancy.used,
      saleCount: inside.length,
      saleValue: inside.reduce((sum, record) => sum + animalSaleValue(record.species as BalloonAnimalId, record.stage), 0),
      rows: occupancy.species.map((row) => ({ name: speciesPluralName(row.species), inside: row.inside })),
    }
  }

  /** Solid prop footprints, rebuilt a few times a second: props move rarely, animals every frame. */
  let collisionBoxes: readonly CollisionBox[] = []

  let collisionBoxesAt = -Infinity

  const COLLISION_BOX_REFRESH_SECONDS = 0.25

  /** An animal's footprint radius as a share of its catalog size (its longest side). */
  const BODY_RADIUS_SHARE = 0.24

  /**
   * Keep walking animals out of houses and other solid props, and out of each
   * other. Only the animals out on the farm have models, so this never sees more
   * than the outdoor limit (plus perf-ramp fixtures).
   */
  function collideAnimals(nowSeconds: number): void {
    if (nowSeconds - collisionBoxesAt >= COLLISION_BOX_REFRESH_SECONDS) {
      collisionBoxesAt = nowSeconds
      collisionBoxes = (gardenProps()?.occupancy.placed ?? [])
        .filter((prop) => prop.id !== 'fence' && propDefinition(prop.id).blocking)
        .map((prop) => footprintWorldRect(prop.id, prop.cell, prop.rotation))
    }
    const walkers: BalloonAnimal[] = []
    const bodies: CollisionBody[] = []
    for (const animal of [...animals, ...crowdFixtures]) {
      if (animal.isFlier || animal.isSold) continue
      const position = animal.currentPosition
      walkers.push(animal)
      bodies.push({
        x: position.x,
        z: position.z,
        radius: (bodySizeBySpecies.get(animal.id) ?? 2) * BODY_RADIUS_SHARE * animal.currentScale,
        fixed: animal.isSleeping || animal.isCapturing || animal.isRomancing,
        // On its way in through a door, walking the gate route from the carnival, or
        // asleep in a bed laid out beside a prop (moving it would wake it to walk back).
        ghost: animal.isGoingHome || !animal.isAtFarm || animal.isSleeping,
      })
    }
    resolveCollisions(bodies, collisionBoxes)
    bodies.forEach((body, index) => {
      const animal = walkers[index]
      const dx = body.x - animal.currentPosition.x
      const dz = body.z - animal.currentPosition.z
      if (dx !== 0 || dz !== 0) animal.nudge(dx, dz)
    })
  }
  function houses(): readonly HouseSpot[] { return houseSpots }
  function setHouses(spots: readonly HouseSpot[]): void { houseSpots = spots }
  function resetRoster(): void {
    outdoorRoster = new Set()
    lastRosterAt = -Infinity
  }

  return {
    houses,
    setHouses,
    resetRoster,
    updateHousing,
    speciesPluralName,
    sellAnimalsInside,
    residentsOf,
    collideAnimals,
    updateSleepers,
  }
}
