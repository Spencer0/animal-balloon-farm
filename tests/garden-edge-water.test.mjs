import assert from 'node:assert/strict'
import * as THREE from 'three'
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

const { outputFiles: fairgroundOutput } = await build({
  entryPoints: ['src/scene/fairground.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const fairgroundModule = await import(`data:text/javascript;base64,${Buffer.from(fairgroundOutput[0].text).toString('base64')}`)
const { makeGardenLawnGeometry, updateLandRevealMask } = fairgroundModule

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

function makeTerrainRenderHarness() {
  const width = 76.16
  const depth = 52.16
  const widthSegments = 181
  const heightSegments = 125
  const soil = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth, widthSegments, heightSegments),
    new THREE.MeshStandardMaterial({ vertexColors: true }),
  )
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth, widthSegments, heightSegments),
    new THREE.MeshStandardMaterial(),
  )
  soil.rotation.x = -Math.PI / 2
  lawn.rotation.x = -Math.PI / 2
  const terrain = createGardenTerrain([
    { mesh: soil, offset: -0.012, soilRings: true },
    { mesh: lawn },
  ])
  terrain.applyToMeshes(true)
  return { terrain, soil, lawn }
}

test('local terrain mesh updates exactly match a full rebuild, including normals and contour colors', () => {
  const local = makeTerrainRenderHarness()
  const full = makeTerrainRenderHarness()
  const strokes = [
    [0.1, -0.2, 1.25, -0.16],
    [2.1, 0.7, 1.05, -0.19],
    [1.3, 1.9, 0.9, 0.11],
  ]
  for (const [x, z, radius, amount] of strokes) {
    assert.ok(local.terrain.splat(x, z, radius, amount) > 0)
    full.terrain.splat(x, z, radius, amount)
    local.terrain.applyToMeshes()
    full.terrain.applyToMeshes(true)
  }

  for (const [localMesh, fullMesh] of [[local.soil, full.soil], [local.lawn, full.lawn]]) {
    for (const name of ['position', 'normal', ...(localMesh === local.soil ? ['color'] : [])]) {
      const actual = localMesh.geometry.getAttribute(name).array
      const expected = fullMesh.geometry.getAttribute(name).array
      assert.equal(actual.length, expected.length)
      for (let index = 0; index < actual.length; index += 1) {
        assert.ok(Math.abs(actual[index] - expected[index]) < 1e-6,
          `${name}[${index}] differs: local ${actual[index]}, full ${expected[index]}`)
      }
    }
  }
  assert.equal(local.terrain.dirty, false)
})

test('smooth parcel expansion reveals the new border without forcing a full mesh rebuild', () => {
  let active = { halfWidth: START.halfWidth, halfDepth: START.halfDepth }
  const terrain = createGardenTerrain([], () => active)
  terrain.applyToMeshes()
  const before = terrain.stats()
  active = { halfWidth: START.halfWidth + 0.35, halfDepth: START.halfDepth + 0.22 }
  assert.equal(terrain.syncBounds(), true, 'smooth expansion updates the editable parcel mask')
  assert.equal(terrain.dirty, false, 'revealing flat outside cells must not dirty the terrain mesh')
  assert.equal(terrain.stats().changedCells, before.changedCells, 'expansion-only cells remain at grade')
  assert.equal(terrain.splat(START.halfWidth + 0.6, 0, 0.15, -0.12), 0,
    'a grid cell remains masked until its center is inside the animated parcel')
  active = { halfWidth: START.halfWidth + 0.8, halfDepth: START.halfDepth + 0.22 }
  assert.equal(terrain.syncBounds(), true)
  assert.equal(terrain.dirty, false)
  assert.ok(terrain.splat(START.halfWidth + 0.6, 0, 0.3, -0.12) > 0,
    'newly revealed ground is editable without rebuilding mesh topology')
  assert.equal(terrain.dirty, true, 'only an actual terrain edit dirties the mesh')
})

test('the expansion reveal only patches mesh rows near the moving boundary and matches a full mask', () => {
  const geometry = makeGardenLawnGeometry()
  const colors = geometry.getAttribute('color')
  const positions = geometry.getAttribute('position')
  const bounds = { halfWidth: 14, halfDepth: 9.5 }
  updateLandRevealMask(geometry, null, bounds)
  const previous = new Float32Array(colors.array)
  colors.clearUpdateRanges()

  const nextBounds = { halfWidth: 14.55, halfDepth: 9.88 }
  updateLandRevealMask(geometry, bounds, nextBounds)
  const patched = new Float32Array(colors.array)
  const rowsWritten = colors.updateRanges.reduce((sum, range) => sum + range.count, 0)
  assert.ok(rowsWritten < colors.array.length / 3,
    `one expansion frame should upload a fraction of the mask (${rowsWritten}/${colors.array.length} components)`)

  const expectedGeometry = makeGardenLawnGeometry()
  const expectedColors = expectedGeometry.getAttribute('color')
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = -positions.getY(index)
    const radius = 0.9
    const cornerX = nextBounds.halfWidth - radius
    const cornerZ = nextBounds.halfDepth - radius
    const qx = Math.abs(x) - cornerX
    const qz = Math.abs(z) - cornerZ
    const distance = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius
    const alpha = 1 - THREE.MathUtils.smoothstep(distance, 0, 0.38)
    expectedColors.setXYZW(index, 1, 1, 1, alpha)
  }
  const expected = expectedColors.array
  for (let index = 0; index < patched.length; index += 1) {
    assert.ok(Math.abs(patched[index] - expected[index]) < 1e-6,
      `incremental reveal component ${index} should match a full recompute`)
    if (index % colors.itemSize !== colors.itemSize - 1) continue
    const alphaUnchanged = Math.abs(previous[index] - patched[index]) < 1e-6
    if (alphaUnchanged) continue
    const vertex = Math.floor(index / colors.itemSize)
    const x = positions.getX(vertex)
    const z = -positions.getY(vertex)
    assert.ok(Math.abs(x) > 12 || Math.abs(z) > 8,
      `a changed reveal vertex should lie near an expanding edge, got (${x}, ${z})`)
  }
  geometry.dispose()
  expectedGeometry.dispose()
})

test('animated parcel masks update faster than rebuilding the whole soil reveal', () => {
  const incrementalGeometry = makeGardenLawnGeometry()
  const fullGeometry = makeGardenLawnGeometry()
  let previous = { halfWidth: 14, halfDepth: 9.5 }
  updateLandRevealMask(incrementalGeometry, null, previous)
  const incrementalTimes = []
  const fullTimes = []
  const samples = 12
  for (let sample = 0; sample < samples; sample += 1) {
    const bounds = {
      halfWidth: 14 + (sample + 1) * 1.6 / samples,
      halfDepth: 9.5 + (sample + 1) * 1.1 / samples,
    }
    const incrementalStart = performance.now()
    updateLandRevealMask(incrementalGeometry, previous, bounds)
    incrementalTimes.push(performance.now() - incrementalStart)

    const fullStart = performance.now()
    updateLandRevealMask(fullGeometry, null, bounds)
    fullTimes.push(performance.now() - fullStart)
    previous = bounds
  }
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const incrementalMedian = median(incrementalTimes)
  const fullMedian = median(fullTimes)
  console.log(`expansion mask benchmark: incremental=${incrementalMedian.toFixed(3)}ms full=${fullMedian.toFixed(3)}ms speedup=${(fullMedian / incrementalMedian).toFixed(1)}x`)
  assert.ok(incrementalMedian < fullMedian,
    'a moving parcel reveal should update faster than rewriting the complete soil mask')
  incrementalGeometry.dispose()
  fullGeometry.dispose()
})

test('localized terrain application is faster than full geometry rebuilds', () => {
  const local = makeTerrainRenderHarness()
  const full = makeTerrainRenderHarness()
  const samples = 50
  const localTimes = []
  const fullTimes = []
  for (let sample = 0; sample < samples; sample += 1) {
    const x = -8 + (sample % 9) * 1.7
    const z = -4 + (sample % 7) * 1.2
    local.terrain.splat(x, z, 1.3, -0.08)
    const localStart = performance.now()
    local.terrain.applyToMeshes()
    localTimes.push(performance.now() - localStart)

    full.terrain.splat(x, z, 1.3, -0.08)
    const fullStart = performance.now()
    full.terrain.applyToMeshes(true)
    fullTimes.push(performance.now() - fullStart)
  }
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const localMedian = median(localTimes)
  const fullMedian = median(fullTimes)
  console.log(`terrain mesh benchmark: localized=${localMedian.toFixed(3)}ms full=${fullMedian.toFixed(3)}ms speedup=${(fullMedian / localMedian).toFixed(1)}x`)
  assert.ok(localMedian < fullMedian, 'localized geometry updates should beat full geometry rebuilds')
})
