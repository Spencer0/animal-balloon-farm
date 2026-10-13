import * as THREE from 'three'
import { CARE_GAME_FOR } from './game/care-minigames'
import { CARE_HELPERS, type GreenThumb } from './game/plant-helpers'
import { plantSpecies, SEED_PRICES, type GardenPlant, type PlantCare, type PlantId } from './game/plants'
import type { FarmRenderer } from './render/backend'
import type { GardenPlants } from './scene/garden-plants'
import { createCareGamePlayer, type CareGamePlayer } from './scene/care-games/care-game-player'
import { createRainChallenge, type RainChallenge } from './scene/care-games/rain-challenge'
import { createCareGameDom, type CareGameResultView } from './ui/care-game-dom'

/**
 * Plant care that is earned: the glue between a plant's care marker, the
 * minigame that answers it, and the Green Thumb ribbons and helpers.
 *
 * - water opens the rain cloud right on the farm (`rainChallenge`);
 * - pest and prune open a close-up minigame that takes over the screen the way
 *   a cutscene does (`playing`, `update`, `render`);
 * - a win answers the care, and the first win of a chore for a species earns
 *   its ribbon, which puts that chore's helper on Pip's shelf;
 * - a hired helper answers the chore for the species from then on, so its
 *   marker never asks again (garden-plants runs the helper itself).
 */

export interface CareControllerDeps {
  readonly renderer: FarmRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.Camera
  readonly canvas: HTMLCanvasElement
  readonly gardenPlants: () => GardenPlants | null
  readonly greenThumb: GreenThumb
  readonly notify: (title: string, detail: string) => void
  readonly saveSoon: () => void
  /** Put cards, placement and tools down before a game starts. */
  readonly clearFarmFocus: () => void
  readonly refreshChrome: () => void
}

export interface CareController {
  /** A close-up minigame owns the screen. */
  readonly playing: boolean
  readonly player: CareGamePlayer | null
  readonly rain: RainChallenge
  startGame(plant: GardenPlant, care: PlantCare): void
  helperHired(species: PlantId, care: PlantCare): boolean
  /** Per frame while `playing`: the frame loop draws this instead of the farm. */
  update(deltaSeconds: number): void
  render(): void
  /** Per frame on the farm: the rain cloud. */
  updateFarm(deltaSeconds: number): void
  resize(cssWidth: number, cssHeight: number): void
}

export function createCareController(deps: CareControllerDeps): CareController {
  const dom = createCareGameDom()
  const rain = createRainChallenge(deps.scene, deps.camera, deps.canvas, dom)
  let player: CareGamePlayer | null = null
  let playerPlant: GardenPlant | null = null
  let playerCare: PlantCare | null = null

  /** Answer the care and record the ribbon; returns the ribbon copy on a first win. */
  function answer(plant: GardenPlant, care: PlantCare): CareGameResultView['ribbon'] {
    deps.gardenPlants()?.simulation.resolveCare(plant.instanceId, care)
    const fresh = deps.greenThumb.earnRibbon(plant.species, care)
    deps.saveSoon()
    if (!fresh) return null
    const helper = CARE_HELPERS[care]
    const species = plantSpecies(plant.species).name
    return {
      title: `Green Thumb Ribbon: ${species}`,
      detail: `Pip now stocks the ${helper.name}. Hire it and it does ${helper.chore} for every ${species.toLowerCase()} you grow.`,
    }
  }

  function finishPlayer(): void {
    const finished = player
    if (!finished) return
    const plant = playerPlant
    const care = playerCare
    finished.dispose()
    player = null
    playerPlant = null
    playerCare = null
    const garden = deps.gardenPlants()
    garden?.setAnswering(null)
    if (finished.won && plant && care) garden?.celebrateCare(plant.instanceId, care)
    deps.refreshChrome()
  }

  return {
    get playing() { return player !== null },
    get player() { return player },
    rain,
    helperHired: (species, care) => deps.greenThumb.isHired(species, care),
    startGame(plant, care): void {
      const garden = deps.gardenPlants()
      if (!garden || player || rain.active) return
      deps.clearFarmFocus()
      const kind = CARE_GAME_FOR[care]
      const subject = plantSpecies(plant.species).name
      garden.setAnswering(plant.instanceId)
      if (kind === 'rain') {
        const frame = garden.plantFrame(plant.instanceId)
        if (!frame) {
          garden.setAnswering(null)
          return
        }
        rain.start(frame, () => {
          const ribbon = answer(plant, care)
          garden.celebrateCare(plant.instanceId, care)
          if (ribbon) deps.notify(ribbon.title, ribbon.detail)
        }, () => {
          garden.setAnswering(null)
          deps.refreshChrome()
        })
        return
      }
      playerPlant = plant
      playerCare = care
      player = createCareGamePlayer(deps.renderer, dom, { kind, subject, onWin: () => answer(plant, care) })
    },
    update(deltaSeconds): void {
      if (!player) return
      player.update(deltaSeconds)
      if (player.done) finishPlayer()
    },
    render(): void {
      player?.render()
    },
    updateFarm(deltaSeconds): void {
      rain.update(deltaSeconds)
    },
    resize(cssWidth, cssHeight): void {
      player?.resize(cssWidth, cssHeight)
    },
  }
}

/** Shop copy for a helper, written for one species. */
export function helperShopCopy(species: PlantId, care: PlantCare): { readonly name: string; readonly blurb: string; readonly needs: string } {
  const helper = CARE_HELPERS[care]
  const name = plantSpecies(species).name
  return {
    name: helper.name,
    blurb: helper.blurb(name.toLowerCase()),
    needs: `Win ${helper.chore} on a ${name.toLowerCase()} once to earn its ribbon.`,
  }
}

/** The price a species' helpers are quoted at. */
export function helperSeedPrice(species: PlantId): number {
  return SEED_PRICES[species]
}
