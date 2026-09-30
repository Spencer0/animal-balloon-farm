import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/scene/garden-terrain.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const terrainModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createGardenTerrain } = terrainModule

const { outputFiles: waterOutput } = await build({
  entryPoints: ['src/game/garden-water.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const waterModule = await import(`data:text/javascript;base64,${Buffer.from(waterOutput[0].text).toString('base64')}`)
const { createGardenWaterField } = waterModule

const START = { halfWidth: 14, halfDepth: 9.5 }

/**
 * The real terrain and the real water field, wired together exactly as main.ts
 * does it — no mesh bindings, since these tests are about the ground and the
 * water, not the render.
 */
function makeGarden(bounds = START) {
  let active = bounds
  const terrain = createGardenTerrain([], () => active)
  const water = createGardenWaterField({
    cellSize: terrain.cellSize,
    gridCols: terrain.gridCols,
    gridRows: terrain.gridRows,
    cellHeight: (gx, gz) => terrain.cellHeightAt(gx, gz),
  })
  // The shovel tells the water when the ground moved; do the same here.
  const edit = (mutate) => {
    mutate()
    terrain.markEdited?.()
    water.markTerrainChanged()
  }
  return {
    terrain,
    water,
    setBounds(next) {
      active = next
      if (terrain.syncBounds()) water.markTerrainChanged()
      water.settle()
    },
    dig(x, z, radius, amount) {
      terrain.splat(x, z, radius, amount)
      water.markTerrainChanged()
    },
    fill(x, z, radius, amount) {
      terrain.splat(x, z, radius, -amount)
      water.markTerrainChanged()
    },
    settle(passes = 40) {
      for (let i = 0; i < passes; i += 1) {
        if (!water.dirty) break
        water.settle()
      }
    },
  }
}

test('the garden is ringed by a raised bed lip', () => {
  const { terrain } = makeGarden()
  // The very edge stands proud of grade...
  const edge = terrain.heightAt(START.halfWidth - 0.2, 0)
  assert.ok(edge > 0.2, `the edge should be raised, got ${edge}`)
  // ...and it eases back down to grade well inside the plot.
  const inside = terrain.heightAt(START.halfWidth - 3, 0)
  assert.ok(Math.abs(inside) < 0.01, `the interior should be at grade, got ${inside}`)
})

test('the lip rises smoothly rather than stepping', () => {
  const { terrain } = makeGarden()
  let previous = terrain.heightAt(START.halfWidth - 0.05, 0)
  for (let inset = 0.2; inset < 1.4; inset += 0.1) {
    const next = terrain.heightAt(START.halfWidth - inset, 0)
    // No cliff anywhere along the lip: each step down is gentle.
    assert.ok(
      Math.abs(previous - next) < 0.12,
      `lip step at inset ${inset} was too steep (${previous} -> ${next})`,
    )
    previous = next
  }
})

test('a pond dug against the edge holds water instead of draining away', () => {
  const garden = makeGarden()
  // Dig a basin hard up against the +x edge, inside the keep-out ring.
  const edgeX = START.halfWidth - 1.1
  for (let i = 0; i < 60; i += 1) garden.dig(edgeX, 0, 1.4, -0.3)
  garden.settle()
  for (let i = 0; i < 12; i += 1) garden.water.pour(edgeX, 0, 1, 0.3)
  garden.settle()
  const summary = garden.water.summary()
  assert.ok(summary.wetCells > 0, 'an edge pond should hold water, not leak')
  assert.ok(summary.runoff < 0.05, `the lip should retain the water, runoff was ${summary.runoff}`)
})

test('a pond in the middle of the garden is unaffected by the lip', () => {
  const garden = makeGarden()
  for (let i = 0; i < 60; i += 1) garden.dig(0, 0, 2, -0.3)
  garden.settle()
  for (let i = 0; i < 12; i += 1) garden.water.pour(0, 0, 1, 0.3)
  garden.settle()
  assert.ok(garden.water.summary().wetCells > 0, 'a mid-garden pond should hold')
})

test('the shovel cannot dig through the lip', () => {
  const garden = makeGarden()
  const edgeX = START.halfWidth - 0.3
  for (let i = 0; i < 80; i += 1) garden.dig(edgeX, 0, 1.5, -0.4)
  garden.settle()
  const lowest = garden.terrain.heightAt(edgeX, 0)
  assert.ok(
    lowest > 0,
    `digging at the edge must not breach the border (height went to ${lowest})`,
  )
})

test('filling the border back in restores the full lip', () => {
  const garden = makeGarden()
  const edgeX = START.halfWidth - 0.4
  for (let i = 0; i < 40; i += 1) garden.fill(edgeX, 0, 1.5, 0.4)
  garden.settle()
  const height = garden.terrain.heightAt(edgeX, 0)
  assert.ok(
    height > 0.2,
    `the lip should be back to full height after filling, got ${height}`,
  )
})

test('clearing the garden keeps the lip and drops the player edits', () => {
  const garden = makeGarden()
  for (let i = 0; i < 60; i += 1) garden.dig(0, 0, 2, -0.3)
  garden.settle()
  assert.ok(garden.terrain.heightAt(0, 0) < -1, 'expected a dug pit before clearing')
  garden.terrain.clear()
  garden.settle()
  assert.ok(
    Math.abs(garden.terrain.heightAt(0, 0)) < 0.01,
    'clearing should flatten the middle back to grade',
  )
  assert.ok(
    garden.terrain.heightAt(START.halfWidth - 0.2, 0) > 0.2,
    'clearing must not erase the bed lip',
  )
})

test('revealing a new parcel moves the lip outward with the garden', () => {
  const garden = makeGarden()
  const grown = { halfWidth: START.halfWidth + 1.6, halfDepth: START.halfDepth + 1.1 }
  garden.setBounds(grown)
  // The old edge is now interior, so it must be at grade...
  assert.ok(
    Math.abs(garden.terrain.heightAt(START.halfWidth - 0.2, 0)) < 0.02,
    'the former edge should be flat once the parcel is revealed',
  )
  // ...and the new edge carries the lip.
  const newEdge = garden.terrain.heightAt(grown.halfWidth - 0.2, 0)
  assert.ok(newEdge > 0.2, `the new edge should be lipped, got ${newEdge}`)
})

test('a pond dug before an expansion does not leak once the lip moves out', () => {
  const garden = makeGarden()
  const edgeX = START.halfWidth - 1.1
  for (let i = 0; i < 60; i += 1) garden.dig(edgeX, 0, 1.4, -0.3)
  garden.settle()
  for (let i = 0; i < 12; i += 1) garden.water.pour(edgeX, 0, 1, 0.3)
  garden.settle()
  const before = garden.water.summary()
  garden.setBounds({ halfWidth: START.halfWidth + 1.6, halfDepth: START.halfDepth + 1.1 })
  const after = garden.water.summary()
  assert.ok(after.wetCells > 0, 'the pond should survive the expansion')
  assert.ok(
    after.runoff - before.runoff < 0.05,
    `the pond should not suddenly leak (runoff ${before.runoff} -> ${after.runoff})`,
  )
})
