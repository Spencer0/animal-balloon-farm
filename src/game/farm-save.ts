import type { BalloonAnimal } from '../animals/balloon-animal'
import type { Fairground } from '../scene/fairground'
import type { GardenBounds } from '../game/farm-expansion'
import { GARDEN_BOUNDS } from '../scene/fairground'
import type { GardenTerrain } from '../scene/garden-terrain'
import type { GardenTools } from '../scene/garden-tools'
import type { GardenPlants } from '../scene/garden-plants'
import type { GardenProps } from '../scene/garden-props'
import { PROP_ORDER } from './farm-props'
import { shopUnlocked } from './shop-construction'
import { LEGACY_FREE_UPGRADES, UPGRADE_ORDER } from './tool-unlocks'
import { createFarmsPanel } from '../ui/farms-panel'
import { createSaveStore, makeEnvelope, packInt16, unpackInt16, type PackedField, type SaveGameData } from './save-game'
import type { createAnimalLife } from './animal-life'
import type { createProgressLedger } from './farm-progression'
import type { createAccomplishmentTracker } from './accomplishments'
import type { createUpgradeLedger } from './tool-unlocks'
import type { createPredationLedger } from './predator'
import type { createDayNightClock } from './day-night'
import type { createGardenWaterField } from './garden-water'
import type { createGardenWaterMesh } from '../scene/garden-water-mesh'
import type { createWallet } from './sales'

export interface FarmSaveDeps {
  readonly loadedSave: SaveGameData | null
  readonly startupSlot: number | null
  readonly saveStore: ReturnType<typeof createSaveStore>
  readonly saveEnabled: boolean
  readonly dayNightClock: ReturnType<typeof createDayNightClock>
  readonly wallet: ReturnType<typeof createWallet>
  readonly progression: ReturnType<typeof createProgressLedger>
  readonly upgrades: ReturnType<typeof createUpgradeLedger>
  readonly accomplishments: ReturnType<typeof createAccomplishmentTracker>
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly predationLedger: ReturnType<typeof createPredationLedger>
  readonly fairground: Fairground
  readonly gardenTools: GardenTools | null
  readonly gardenPlants: () => GardenPlants | null
  readonly gardenProps: () => GardenProps | null
  readonly gardenTerrain: GardenTerrain | null
  readonly gardenWater: ReturnType<typeof createGardenWaterField> | null
  readonly gardenWaterMesh: ReturnType<typeof createGardenWaterMesh> | null
  readonly animalNames: Map<string, string>
  readonly animalById: Map<string, BalloonAnimal>
  readonly knownDoors: Map<string, { readonly x: number; readonly z: number }>
  readonly knownMaturePlants: Set<number>
  readonly journalBestStage: Map<string, number>
  readonly setGardenBounds: (bounds: GardenBounds) => void
  readonly setLastExpansionLevel: (level: number) => void
  readonly remeasureMeadow: () => void
  readonly syncOwnedTools: () => void
  readonly syncGrassPack: () => void
  readonly refreshShopUi: () => void
  readonly noteJournalStages: () => void
  readonly salePanel: { setWallet(balance: number): void }
  readonly notificationPanel: { notifyAccomplishment(title: string, detail: string): void }
  readonly menuOpen: () => boolean
  readonly syncFarmChrome: () => void
}

export function createFarmSave(deps: FarmSaveDeps) {
  const { loadedSave, startupSlot, saveStore, saveEnabled, dayNightClock, wallet, progression, upgrades, accomplishments, progress, predationLedger, fairground, gardenTools, gardenPlants, gardenProps, gardenTerrain, gardenWater, gardenWaterMesh, animalNames, animalById, knownDoors, knownMaturePlants, journalBestStage, setGardenBounds, setLastExpansionLevel, remeasureMeadow, syncOwnedTools, syncGrassPack, refreshShopUi, noteJournalStages, salePanel, notificationPanel, menuOpen, syncFarmChrome } = deps
  /** Seconds of play in this farm, across every session that has carried it. */
  let playSeconds = loadedSave?.playSeconds ?? 0

  /** Autosave waits until the player has walked in, so merely opening the page never overwrites a farm. */
  let hasEntered = false

  /** The slot the running farm saves into; null until the player picks one. */
  let activeSaveSlot: number | null = startupSlot

  saveStore.setActiveSlot(activeSaveSlot)

  const AUTOSAVE_SECONDS = 60

  /** After a sale or a purchase, save soon rather than waiting out the minute. */
  const SAVE_SOON_SECONDS = 2

  let secondsSinceSave = 0

  let saveSoonIn = Infinity

  let saveFailureReported = false

  function packField(values: Float32Array | null, cols: number, rows: number): PackedField {
    if (!values) return { cols: 0, rows: 0, data: '', scale: 1000 }
    return { cols, rows, data: packInt16(values, 1000), scale: 1000 }
  }

  function captureSave(): SaveGameData {
    const animalPlaces: Record<string, { x: number; z: number; name: string }> = {}
    for (const record of progress.all()) {
      const animal = animalById.get(record.id)
      // An animal indoors has no model; its place is the door it went in by.
      const door = record.insideId ? knownDoors.get(record.insideId) : undefined
      animalPlaces[record.id] = {
        x: animal?.root.position.x ?? door?.x ?? 0,
        z: animal?.root.position.z ?? door?.z ?? 0,
        name: animalNames.get(record.id) ?? '',
      }
    }
    const grass = gardenTools?.exportGrass() ?? { xs: '', zs: '', heights: '', count: 0, paintKeys: '', paintCoverage: '', paintCount: 0 }
    const placed = gardenProps()?.exportPlaced() ?? { props: [], fenceRuns: [] }
    return {
      playSeconds,
      clock: { timeOfDay: dayNightClock.timeOfDay, elapsedDays: dayNightClock.elapsedDays },
      coins: wallet.balance,
      progression: progression.exportState(),
      upgrades: Object.fromEntries(UPGRADE_ORDER.map((id) => [id, upgrades.count(id)])),
      accomplishments: accomplishments.exportState(),
      expansionLevel: fairground.farmExpansion?.level ?? 0,
      life: progress.exportState(),
      animalPlaces,
      preyEaten: predationLedger.totals,
      plants: gardenPlants()?.simulation.exportState() ?? { seeds: {}, plants: [], nextInstanceId: 1 },
      props: {
        inventory: gardenProps()?.inventory.counts ?? {},
        placed: placed.props.map((prop) => ({ ...prop })),
        fenceRuns: placed.fenceRuns,
      },
      terrain: packField(gardenTerrain?.exportHeights() ?? null, gardenTerrain?.gridCols ?? 0, gardenTerrain?.gridRows ?? 0),
      water: packField(gardenWater?.exportDepths() ?? null, gardenWater?.gridCols ?? 0, gardenWater?.gridRows ?? 0),
      grass,
      tools: { grassPack: gardenTools?.grassPack ?? 'short' },
      journalBestStage: Object.fromEntries(journalBestStage),
    }
  }

  function saveSummary(data: SaveGameData) {
    return {
      farmerLevel: progression.level + 1,
      coins: data.coins,
      day: Math.floor(data.clock.elapsedDays) + 1,
      residents: progress.all().filter((record) => record.stage >= 3 && !record.baby).length,
      playSeconds: Math.floor(data.playSeconds),
    }
  }

  function saveFailureText(reason: 'unavailable' | 'full' | 'invalid-slot'): string {
    if (reason === 'full') return 'The browser has no room left for saves. Free some space and try again.'
    if (reason === 'invalid-slot') return 'That is not a farm slot.'
    return 'This browser is not letting the game keep saves.'
  }

  /** Write the running farm into a slot. Returns what the Farms screen should say. */
  function saveFarmTo(slot: number): { ok: boolean; message: string } {
    let data: SaveGameData
    try {
      data = captureSave()
    } catch (error) {
      console.error('[save] capturing the farm failed', error)
      return { ok: false, message: 'Something went wrong gathering the farm, so nothing was saved.' }
    }
    const result = saveStore.write(slot, makeEnvelope(data, saveSummary(data), Date.now()))
    if (!result.ok) return { ok: false, message: saveFailureText(result.reason) }
    activeSaveSlot = slot
    saveStore.setActiveSlot(slot)
    secondsSinceSave = 0
    saveSoonIn = Infinity
    saveFailureReported = false
    return { ok: true, message: `Saved to Farm ${slot}.` }
  }

  /** Save without being asked. Quiet on success, one polite warning on failure. */
  function autosave(): void {
    if (!saveEnabled || !hasEntered || activeSaveSlot === null) return
    const result = saveFarmTo(activeSaveSlot)
    if (result.ok || saveFailureReported) return
    saveFailureReported = true
    notificationPanel.notifyAccomplishment('Your farm could not be saved', result.message)
  }

  /** A sale or a purchase just changed the farm in a way worth keeping. */
  function saveSoon(): void {
    if (saveSoonIn === Infinity) saveSoonIn = SAVE_SOON_SECONDS
  }

  function tickAutosave(deltaSeconds: number): void {
    if (!hasEntered || menuOpen()) return
    playSeconds += deltaSeconds
    secondsSinceSave += deltaSeconds
    saveSoonIn -= deltaSeconds
    if (secondsSinceSave >= AUTOSAVE_SECONDS || saveSoonIn <= 0) {
      secondsSinceSave = 0
      saveSoonIn = Infinity
      autosave()
    }
  }

  window.addEventListener('pagehide', autosave)

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave() })

  function reloadWith(request: { kind: 'load' | 'new'; slot: number }): void {
    // Keep the farm that is running safe first (the pagehide autosave would too,
    // but a failed queue below must not leave the player with a half-done switch).
    autosave()
    if (!saveStore.queueBoot(request)) {
      farmsPanel.open('This browser is not letting the game keep saves, so it cannot switch farms.')
      return
    }
    window.location.reload()
  }

  const farmsPanel = createFarmsPanel({
    slots: () => saveStore.slots(),
    activeSlot: () => activeSaveSlot,
    storageAvailable: () => saveStore.available,
    hasUnsavedWork: () => hasEntered && activeSaveSlot === null,
    save: (slot) => saveFarmTo(slot),
    load: (slot) => reloadWith({ kind: 'load', slot }),
    startNew: (slot) => {
      // The old farm in that slot is replaced the moment the new one first saves.
      // Without this, the old page's pagehide autosave would write the farm being
      // thrown away straight back over the slot the player just cleared.
      if (activeSaveSlot === slot) activeSaveSlot = null
      reloadWith({ kind: 'new', slot })
    },
  }, () => syncFarmChrome())

  /**
   * Lay a loaded save over the freshly built world. Each section is applied on its
   * own, so one that cannot be read costs the farm that piece, not the whole save.
   */
  function applySavedWorld(data: SaveGameData): void {
    const problems: string[] = []
    const section = (name: string, apply: () => void): void => {
      try {
        apply()
      } catch (error) {
        problems.push(name)
        console.error(`[save] could not restore ${name}`, error)
      }
    }
    const expansion = fairground.farmExpansion
    section('land', () => {
      expansion?.restoreLevel(data.expansionLevel)
      setLastExpansionLevel(expansion?.level ?? 0)
      setGardenBounds(expansion?.bounds ?? GARDEN_BOUNDS)
      gardenTerrain?.syncBounds()
    })
    section('ground', () => {
      if (!gardenTerrain || data.terrain.cols === 0) return
      const { cols, rows } = data.terrain
      if (cols !== gardenTerrain.gridCols || rows !== gardenTerrain.gridRows) throw new RangeError('terrain grid size changed')
      gardenTerrain.restoreHeights(unpackInt16(data.terrain.data, data.terrain.scale, cols * rows))
      gardenTerrain.applyToMeshes(true)
    })
    section('water', () => {
      if (!gardenWater || !gardenTerrain) return
      gardenWater.resize(gardenTerrain.gridCols, gardenTerrain.gridRows)
      gardenWater.markTerrainChanged()
      if (data.water.cols === gardenWater.gridCols && data.water.rows === gardenWater.gridRows) {
        gardenWater.restoreDepths(unpackInt16(data.water.data, data.water.scale, data.water.cols * data.water.rows))
      }
      gardenWaterMesh?.markDirty()
    })
    section('grass', () => {
      gardenTools?.importGrass(data.grass)
      remeasureMeadow()
    })
    section('purse and progress', () => {
      wallet.restore(data.coins)
      progression.importState(data.progression)
      // A save from before the shop sold the shovel and the bucket has no entry for
      // them: that farmer had both, so they keep them. A new save names every upgrade.
      for (const id of UPGRADE_ORDER) upgrades.set(id, data.upgrades[id] ?? (LEGACY_FREE_UPGRADES.includes(id) ? 1 : 0))
      accomplishments.importState(data.accomplishments)
      predationLedger.restore(data.preyEaten)
    })
    section('garden', () => {
      gardenPlants()?.simulation.importState(data.plants)
      for (const plant of gardenPlants()?.simulation.plants ?? []) if (plant.mature) knownMaturePlants.add(plant.instanceId)
      for (const id of PROP_ORDER) gardenProps()?.inventory.set(id, data.props.inventory[id] ?? 0)
      gardenProps()?.importPlaced({ props: data.props.placed, fenceRuns: data.props.fenceRuns })
      if (shopUnlocked(progression.level)) gardenProps()?.finishShopBuild()
    })
    section('journal', () => {
      journalBestStage.clear()
      for (const [species, stage] of Object.entries(data.journalBestStage)) {
        if (Number.isFinite(stage) && stage > 0) journalBestStage.set(species, Math.min(4, Math.floor(stage)))
      }
      noteJournalStages()
    })
    section('tools', () => {
      if (data.tools.grassPack === 'tall' && upgrades.owns('tall-grass')) gardenTools?.setGrassPack('tall')
      syncOwnedTools()
      syncGrassPack()
      salePanel.setWallet(wallet.balance)
      refreshShopUi()
    })
    if (problems.length > 0) {
      farmsPanel.open(`Part of this farm could not be restored (${problems.join(', ')}). The rest is back.`)
    }
  }
function markEntered(): void { hasEntered = true }

  return {
    autosave,
    saveSoon,
    tickAutosave,
    markEntered,
    applySavedWorld,
    farmsPanel,
  }
}
