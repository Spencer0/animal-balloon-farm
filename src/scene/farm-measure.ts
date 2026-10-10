import * as THREE from 'three'
import { measureFarmState, type FarmState, type LawnSample, type TerrainSample, type WaterSample } from '../game/farm-state'
import type { GardenTerrain } from './garden-terrain'
import type { createGardenWaterField } from '../game/garden-water'

export interface FarmMeasureDeps {
  readonly gardenSurface: () => THREE.Mesh | undefined
  readonly gardenTerrain: GardenTerrain | null
  readonly gardenWater: ReturnType<typeof createGardenWaterField> | null
  readonly gardenTools: { meadowArea(): number } | null
  readonly gardenPlants: () => { readonly simulation: { readonly plants: readonly { readonly mature: boolean; readonly species: string }[] } } | null
  readonly gardenProps: () => { propCounts(): Record<string, number> } | null
  readonly residentCounts: () => Record<string, number>
  readonly preyEaten: () => Record<string, number>
  /** Visible pond cells that are frozen solid: they are not water to drink or paddle in. */
  readonly frozenWaterCells: () => number
}

export function createFarmMeasure(deps: FarmMeasureDeps) {
  const { gardenSurface, gardenTerrain, gardenWater, gardenTools, gardenPlants, gardenProps, residentCounts, preyEaten, frozenWaterCells } = deps
  // ------------------------------------------------------- farm measurement --

  /**
   * The lawn's own vertex grids, read straight out of the tool that maintains
   * them. This is the seam between the renderer and the simulation: the pure
   * condition code never sees a Three.js object, it only ever sees these arrays.
   */
  function currentLawnSample(): LawnSample | null {
    const lawn = gardenSurface()
    if (!lawn) return null
    const positions = lawn.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = lawn.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    if (!colors) return null
    const count = positions.count
    const xs = new Float32Array(count)
    const zs = new Float32Array(count)
    const coverage = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      xs[index] = positions.getX(index)
      // The lawn geometry is authored in the XZ plane with +Y mapping to -Z.
      zs[index] = -positions.getY(index)
      coverage[index] = colors.getW(index)
    }
    return { count, xs, zs, coverage }
  }

  function currentTerrainSample(): TerrainSample | null {
    if (!gardenTerrain) return null
    // The height field's own grid; `cellSize`/`cols`/`rows` describe it exactly.
    const cols = gardenTerrain.gridCols
    const rows = gardenTerrain.gridRows
    const cellSize = gardenTerrain.cellSize
    const originX = gardenTerrain.originX
    const originZ = gardenTerrain.originZ
    const heights = new Float32Array(cols * rows)
    for (let gz = 0; gz < rows; gz += 1) {
      for (let gx = 0; gx < cols; gx += 1) {
        heights[gz * cols + gx] = gardenTerrain.heightAt(
          originX + gx * cellSize,
          originZ + gz * cellSize,
        )
      }
    }
    return { heights, cols, rows, cellSize, originX, originZ }
  }

  /** The last measured farm, kept so the journal and harness can read it. */
  let lastFarmState: FarmState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, residentCounts: {}, preyEaten: {}, propCounts: {} }

  function currentWaterSample(): WaterSample | null {
    if (!gardenWater) return null
    const summary = gardenWater.summary()
    return { visibleWetCells: Math.max(0, summary.visibleWetCells - frozenWaterCells()), cellSize: gardenWater.cellSize }
  }

  /**
   * Grown-up plants per species, which is what a `plantCount` condition reads.
   *
   * Only mature ones count, so an animal cannot be satisfied by seeds that have
   * been dropped in the water and forgotten. The plant simulation owns the truth
   * about growth; this only tallies it.
   */
  function maturePlantCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const plant of gardenPlants()?.simulation.plants ?? []) {
      if (!plant.mature) continue
      counts[plant.species] = (counts[plant.species] ?? 0) + 1
    }
    return counts
  }

  /**
   * Tall meadow is measured from every grass blade, which is too much work to
   * redo each frame. Measure it at most once a second; anything that replaces
   * the grass outright (a load, a harness sow or clear) asks for a fresh one.
   */
  const MEADOW_REMEASURE_MS = 1000
  let meadowMeasuredAt = Number.NEGATIVE_INFINITY
  let meadowAreaCache = 0

  function currentMeadowArea(): number {
    const now = performance.now()
    if (now - meadowMeasuredAt >= MEADOW_REMEASURE_MS) {
      meadowAreaCache = gardenTools?.meadowArea() ?? 0
      meadowMeasuredAt = now
    }
    return meadowAreaCache
  }

  function remeasureMeadow(): void {
    meadowMeasuredAt = Number.NEGATIVE_INFINITY
  }

  function measureFarm(): FarmState {
    const lawn = currentLawnSample()
    const terrain = currentTerrainSample()
    if (!lawn || !terrain) return lastFarmState
    lastFarmState = {
      ...measureFarmState(lawn, terrain, currentWaterSample(), maturePlantCounts()),
      meadowArea: currentMeadowArea(),
      residentCounts: residentCounts(),
      preyEaten: preyEaten(),
      propCounts: gardenProps()?.propCounts() ?? {},
    }
    return lastFarmState
  }

  return {
    measureFarm,
    remeasureMeadow,
    maturePlantCounts,
  }
}
