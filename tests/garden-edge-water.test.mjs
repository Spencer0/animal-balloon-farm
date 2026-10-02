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
  return {
    terrain,
    water,
    setBounds(next) {
      active = next
      if (terrain.syncBounds()) {
        water.resize(terrain.gridCols, terrain.gridRows)
        water.markTerrainChanged()
      }
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

test('the full plot edge stays level at grade until the player sculpts it', () => {
  const { terrain } = makeGarden()
  for (let inset = 0.1; inset <= 1.2; inset += 0.1) {
    const edge = terrain.heightAt(START.halfWidth - inset, 0)
    assert.ok(Math.abs(edge) < 0.001, `edge at inset ${inset} should be at grade, got ${edge}`)
  }
  assert.equal(terrain.heightAt(START.halfWidth + 0.2, 0), 0,
    'the ground outside the parcel must stay fixed at grade')
  assert.equal(terrain.splat(START.halfWidth + 0.5, 0, 0.2, -0.8), 0,
    'the ground outside the parcel must not be editable')
})

test('ordinary edge and center pours drain on flat, unsculpted ground', () => {
  const garden = makeGarden()
  garden.water.pour(START.halfWidth - 0.3, 0, 0.65, 0.5)
  garden.water.pour(0, 0, 0.65, 0.5)
  garden.settle()
  assert.equal(garden.water.summary().wetCells, 0, 'flat ground should not retain a water film')
  assert.ok(garden.water.summary().runoff > 0, 'flat-ground water should escape')
})

test('a deliberately dug corner basin contains water below the flat grade edge', () => {
  const garden = makeGarden()
  const cornerX = START.halfWidth - 0.8
  const cornerZ = START.halfDepth - 0.8
  for (let i = 0; i < 55; i += 1) garden.dig(cornerX, cornerZ, 1.8, -0.3)
  garden.settle()
  for (let i = 0; i < 10; i += 1) garden.water.pour(cornerX, cornerZ, 0.9, 0.3)
  garden.settle()
  const summary = garden.water.summary()
  assert.ok(summary.wetCells > 0, 'a dug corner basin below grade should retain water')
  assert.ok(summary.runoff < 0.05, `corner basin overflowed unexpectedly (${summary.runoff})`)
})

test('a pond in the middle of the garden holds as usual', () => {
  const garden = makeGarden()
  for (let i = 0; i < 60; i += 1) garden.dig(0, 0, 2, -0.3)
  garden.settle()
  for (let i = 0; i < 12; i += 1) garden.water.pour(0, 0, 1, 0.3)
  garden.settle()
  assert.ok(garden.water.summary().wetCells > 0, 'a mid-garden pond should hold')
})

test('editing at the boundary creates a normal basin and clearing restores flat grade', () => {
  const garden = makeGarden()
  const edgeX = START.halfWidth - 0.8
  for (let i = 0; i < 25; i += 1) garden.dig(edgeX, 0, 1.3, -0.25)
  garden.settle()
  assert.ok(garden.terrain.heightAt(edgeX, 0) < -0.5, 'the player can sculpt near the edge')
  garden.terrain.clear()
  garden.settle()
  assert.ok(Math.abs(garden.terrain.heightAt(edgeX, 0)) < 0.001, 'clear restores grade')
})

test('clearing the garden drops the player edits', () => {
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
})

test('revealing a new parcel moves the flat editable edge outward with the garden', () => {
  const garden = makeGarden()
  const grown = { halfWidth: START.halfWidth + 1.6, halfDepth: START.halfDepth + 1.1 }
  garden.setBounds(grown)
  // The old edge is now interior, so it must be at grade...
  assert.ok(
    Math.abs(garden.terrain.heightAt(START.halfWidth - 0.2, 0)) < 0.02,
    'the former edge should be flat once the parcel is revealed',
  )
  // ...and the new edge is also at grade, without a hidden rim.
  const newEdgeX = grown.halfWidth - 0.2
  const newEdge = garden.terrain.heightAt(newEdgeX, 0)
  assert.ok(Math.abs(newEdge) < 0.001, `the new edge should be flat, got ${newEdge}`)
  assert.ok(garden.terrain.splat(newEdgeX, 0, 1.2, -0.4) > 0,
    'the newly revealed edge should be editable')
})

test('terrain and water keep expanding and editable beyond the initial mesh allocation', () => {
  const garden = makeGarden()
  const farBounds = { halfWidth: 180, halfDepth: 125 }
  garden.setBounds(farBounds)
  assert.ok(garden.terrain.gridCols > 169)
  assert.ok(garden.terrain.gridRows > 100)
  assert.equal(garden.water.gridCols, garden.terrain.gridCols)
  assert.equal(garden.water.gridRows, garden.terrain.gridRows)
  const edgeX = farBounds.halfWidth - 1
  assert.ok(garden.terrain.splat(edgeX, 0, 1.5, -0.4) > 0, 'the expanded soil remains sculptable')
  garden.settle()
  assert.ok(garden.terrain.heightAt(edgeX, 0) < -0.1)
  garden.water.pour(edgeX, 0, 0.8, 0.35)
  garden.settle()
  assert.ok(garden.water.originX < -170)
})

test('expanding the parcel preserves a previously dug edge pond', () => {
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
    `the pond should not suddenly leak during expansion (runoff ${before.runoff} -> ${after.runoff})`,
  )
})
