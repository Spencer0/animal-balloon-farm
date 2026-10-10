import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { PLANT_CATALOG, type GardenPlant } from '../game/plants'
import { playerLevelCards } from './player-dom'
import { animalSaleValue, plantSaleValue, type createWallet } from '../game/sales'
import { UPGRADE_CATALOG, upgradeQuote, purchaseUpgrade, type UpgradeId, type createUpgradeLedger } from '../game/tool-unlocks'
import type { createAnimalLife } from '../game/animal-life'
import type { createProgressLedger } from '../game/farm-progression'
import type { createAccomplishmentTracker } from '../game/accomplishments'
import type { Fairground } from '../scene/fairground'
import { GARDEN_LAWN_Y } from '../scene/fairground'
import type { GardenPlants } from '../scene/garden-plants'
import type { GardenProps, PropSelection } from '../scene/garden-props'
import type { GardenTools } from '../scene/garden-tools'
import { createSellBurst, type SellBurst } from './sell-burst'
import type { createAnimalCard } from './animal-card'
import type { createPropCard, PropResidents } from './prop-card'
import type { createPlantCard } from './plant-card'
import type { createSalePanel } from './sale-panel'
import type { createShedPanel } from './shed-panel'
import type { ShedDomPanel } from './shed-dom'
import type { ShopDomPanel } from './shop-dom'
import type { createBalloonPanel } from './balloon-panel'
import type { UILayer } from './ui-layer'

export interface FarmActionsDeps {
  readonly camera: THREE.Camera
  readonly ui: UILayer
  readonly scene: THREE.Scene
  readonly animalCard: ReturnType<typeof createAnimalCard>
  readonly propCard: ReturnType<typeof createPropCard>
  readonly plantCard: ReturnType<typeof createPlantCard>
  readonly salePanel: ReturnType<typeof createSalePanel>
  readonly shed: ReturnType<typeof createShedPanel>
  readonly shedDom: ShedDomPanel
  readonly shop: ShopDomPanel
  readonly balloon: ReturnType<typeof createBalloonPanel>
  readonly wallet: ReturnType<typeof createWallet>
  readonly upgrades: ReturnType<typeof createUpgradeLedger>
  readonly progression: ReturnType<typeof createProgressLedger>
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly accomplishments: ReturnType<typeof createAccomplishmentTracker>
  readonly fairground: Fairground
  readonly gardenPlants: () => GardenPlants | null
  readonly gardenProps: () => GardenProps | null
  readonly gardenTools: GardenTools | null
  readonly animals: BalloonAnimal[]
  readonly animalById: Map<string, BalloonAnimal>
  readonly animalNames: Map<string, string>
  readonly farmHomes: Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>
  readonly viewerStands: Map<string, THREE.Vector3>
  readonly sellBursts: SellBurst[]
  readonly getFocusedAnimal: () => string | null
  readonly setFocusedAnimal: (id: string | null) => void
  readonly setSelectedProp: (selection: PropSelection | null) => void
  readonly refreshAnimalVisibility: (nowSeconds: number, force?: boolean) => void
  readonly residentsOf: (selection: PropSelection) => PropResidents | null
  readonly saveSoon: () => void
  readonly syncGrassPack: () => void
  readonly syncFarmChrome: () => void
  readonly progressionHudState: () => Readonly<Record<string, number>>
  readonly ownedSeedSpecies: () => ReadonlySet<string>
}

export function createFarmActions(deps: FarmActionsDeps) {
  const { camera, ui, scene, animalCard, propCard, plantCard, salePanel, shed, shedDom, shop, balloon, wallet, upgrades, progression, progress, accomplishments, fairground, gardenPlants, gardenProps, gardenTools, animals, animalById, animalNames, farmHomes, viewerStands, sellBursts, getFocusedAnimal, setFocusedAnimal, setSelectedProp, refreshAnimalVisibility, residentsOf, saveSoon, syncGrassPack, syncFarmChrome, progressionHudState, ownedSeedSpecies } = deps
  /**
   * Opens the animal info card for a live animal. Shared by the farm click
   * and the garden-debug harness so the card stays verifiable headlessly.
   * The card pins to the right of the balloon (flipping left at the edge).
   */
  function openAnimalCardFor(animal: BalloonAnimal, preview?: { stage?: number; sellable?: boolean }): void {
    propCard.close()
    setFocusedAnimal(animal.instanceId)
    refreshAnimalVisibility(performance.now() / 1000, true)
    plantCard.close()
    gardenPlants()?.clearSelection()
    const species = ANIMAL_CATALOG.find((entry) => entry.id === animal.id)
    // A preview renders states the live ladder cannot hold on demand (a
    // resident with no meadow behind it). Selling still validates the live
    // animal, so this never mints coins; it only draws.
    const stage = preview?.stage ?? animal.stage
    const sellable = preview?.sellable ?? animal.canSell
    const anchorWorld = animal.root.getWorldPosition(new THREE.Vector3())
    anchorWorld.y += 2.6
    const anchorNdc = anchorWorld.project(camera)
    const anchor = {
      x: anchorNdc.x * ui.viewport.width / 2,
      y: anchorNdc.y * ui.viewport.height / 2,
    }
    animalCard.open({
      instanceId: animal.instanceId,
      speciesId: animal.id,
      name: animalNames.get(animal.instanceId) ?? species?.name ?? animal.id,
      speciesLabel: `Balloon ${species?.name ?? animal.id}`,
      stage,
      price: animalSaleValue(animal.id, stage),
      sellable,
    }, anchor)
    syncFarmChrome()
  }

  /**
   * The shared goodbye behind the sale card and the animal info card: the
   * animal leaves the world, the wallet grows, and a quick gold burst pops
   * where it stood. Sales never touch the accomplishment banner -- that is for
   * milestones, not routine farm business.
   */
  function completeAnimalSale(instanceId: string): { balance: number; price: number; name: string } | null {
    const animal = animalById.get(instanceId)
    if (!animal || !animal.canSell || !animal.sell()) return null
    const name = animalNames.get(instanceId) ?? animal.id
    const price = animalSaleValue(animal.id, animal.stage)
    const farewellAt = animal.root.getWorldPosition(new THREE.Vector3())
    progress.remove(animal.instanceId)
    animalById.delete(animal.instanceId)
    const animalIndex = animals.indexOf(animal)
    if (animalIndex >= 0) animals.splice(animalIndex, 1)
    if (getFocusedAnimal() === animal.instanceId) setFocusedAnimal(null)
    animal.dispose()
    refreshAnimalVisibility(performance.now() / 1000, true)
    farmHomes.delete(animal.instanceId)
    viewerStands.delete(animal.instanceId)
    const balance = wallet.credit(price)
    salePanel.setWallet(balance)
    saveSoon()
    const burst = createSellBurst(farewellAt, price)
    scene.add(burst.root)
    sellBursts.push(burst)
    return { balance, price, name }
  }

  /** Pin the prop card beside a placed prop and highlight it on the lawn. */
  function openPropCardFor(selection: PropSelection): void {
    animalCard.close()
    plantCard.close()
    salePanel.close()
    gardenPlants()?.clearSelection()
    setSelectedProp(selection)
    gardenProps()?.select(selection)
    const ndc = new THREE.Vector3(selection.anchor.x, selection.anchor.y, selection.anchor.z).project(camera)
    propCard.open({
      id: selection.id,
      name: selection.name,
      blurb: selection.blurb,
      sections: selection.sections,
      salePrice: selection.salePrice,
      movable: selection.movable,
      rotatable: selection.rotatable,
      residents: residentsOf(selection),
    }, { x: ndc.x * ui.viewport.width / 2, y: ndc.y * ui.viewport.height / 2 })
    syncFarmChrome()
  }

  function refreshShopUi(): void {
    shedDom.refresh()
    shop.refresh()
  }

  function buyUpgrade(id: UpgradeId): { ok: boolean; text: string } {
    const definition = UPGRADE_CATALOG[id]
    const expansion = fairground.farmExpansion
    if (id === 'land-deed' && (!expansion || expansion.state.isAnimating)) {
      return { ok: false, text: 'The surveyors are still marking out the last parcel. Give them a moment.' }
    }
    const quote = upgradeQuote(id, upgrades, progression.level)
    const result = purchaseUpgrade(wallet, upgrades, id, progression.level)
    if (!result.ok) {
      if (result.failure === 'maxed') return { ok: false, text: `You already own every ${definition.name}.` }
      if (result.failure === 'locked') return { ok: false, text: `Pip will sell you this at farmer level ${quote.requiredLevel + 1}.` }
      return { ok: false, text: `Not enough coins for the ${definition.name} -- it costs ${quote.price}.` }
    }
    salePanel.setWallet(wallet.balance)
    saveSoon()
    if (id === 'land-deed') {
      expansion?.expand()
      refreshShopUi()
      return { ok: true, text: 'Deed signed -- a new strip of land opens up.' }
    }
    syncGrassPack()
    refreshShopUi()
    return { ok: true, text: 'The green pack is yours. Press E with the seed bag out to swap packs.' }
  }

  function playerDomStats() {
    const base = progressionHudState()
    const parcel = (fairground.farmExpansion?.state.level ?? 0) + 1
    return {
      points: base.points,
      level: base.level,
      pointsToNext: base.pointsToNextLevel,
      parcel,
      population: base.population,
      outside: base.outside,
      houseRoom: base.houseRoom,
      houseUsed: base.houseUsed,
      accomplishments: accomplishments.list(ownedSeedSpecies()),
      recentAccomplishments: accomplishments.recent(),
      levels: playerLevelCards(base.points, base.level),
    }
  }

  function balloonInboxAnchor(): { x: number; y: number } {
    const vw = ui.viewport.width
    const vh = ui.viewport.height
    const described = balloon.describe?.() as { center?: { x: number; y: number }; radius?: number } | undefined
    const cx = described?.center?.x ?? vw / 2 - 150
    const cy = described?.center?.y ?? 195 - vh / 2
    const top = cy + (described?.radius ?? 108) + 10
    return {
      x: ((cx + vw / 2) / vw) * window.innerWidth,
      y: ((vh / 2 - top) / vh) * window.innerHeight,
    }
  }

  function openPlantCardFor(plant: GardenPlant): void {
    propCard.close()
    const species = PLANT_CATALOG.find((entry) => entry.id === plant.species)
    const anchorWorld = new THREE.Vector3(plant.x, GARDEN_LAWN_Y + 1.4, plant.z)
    const anchorNdc = anchorWorld.project(camera)
    gardenPlants()?.cancelPlacement()
    gardenTools?.setPlantingMode(false)
    shed.setPlacementActive(false)
    plantCard.open({
      instanceId: plant.instanceId,
      speciesId: plant.species,
      name: `${species?.name ?? 'Plant'} ${gardenPlants()?.selectedPlantNumber ?? 1}`,
      speciesLabel: species?.subtitle ?? 'Plant',
      growth: plant.growth,
      care: plant.careNeeded,
      price: plantSaleValue(plant.species, plant.growth),
    }, { x: anchorNdc.x * ui.viewport.width / 2, y: anchorNdc.y * ui.viewport.height / 2 })
    syncFarmChrome()
  }

  let plantCardSyncTimer = 0

  function syncPlantCard(deltaSeconds: number): void {
    if (!plantCard.isOpen) return
    plantCardSyncTimer += deltaSeconds
    if (plantCardSyncTimer < 0.25) return
    plantCardSyncTimer = 0
    const plant = gardenPlants()?.simulation.plants.find((entry) => entry.instanceId === plantCard.instanceId)
    if (!plant) {
      plantCard.close()
      return
    }
    plantCard.sync({ growth: plant.growth, care: plant.careNeeded, price: plantSaleValue(plant.species, plant.growth) })
  }

  return {
    openAnimalCardFor,
    completeAnimalSale,
    openPropCardFor,
    refreshShopUi,
    buyUpgrade,
    playerDomStats,
    balloonInboxAnchor,
    openPlantCardFor,
    syncPlantCard,
  }
}
