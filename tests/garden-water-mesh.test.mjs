import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/scene/garden-water-mesh.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const module = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createGardenWaterMesh } = module

function makeHarness(bounds = { halfWidth: 14, halfDepth: 9.5 }) {
  const cellSize = 0.55
  const cols = 139
  const rows = 96
  const terrainHeights = new Float32Array(cols * rows)
  let waterDirty = false
  let waterPresent = false
  let renderable = false
  const water = {
    cellSize,
    gridCols: cols,
    gridRows: rows,
    originX: -(cols * cellSize) / 2,
    originZ: -(rows * cellSize) / 2,
    get dirty() { return waterDirty },
    get hasWater() { return waterPresent },
    get hasRenderableWater() { return renderable },
    shoreField() {
      const level = new Float32Array(cols * rows)
      const wetness = new Float32Array(cols * rows)
      const centerX = cols >> 1
      const centerZ = rows >> 1
      for (let z = 0; z < rows; z += 1) {
        for (let x = 0; x < cols; x += 1) {
          const distance = Math.hypot(x - centerX, z - centerZ)
          if (distance < 5) {
            const index = z * cols + x
            level[index] = 0.2
            wetness[index] = 1 - Math.min(1, distance / 5)
          }
        }
      }
      return { level, wetness }
    },
  }
  const terrain = {
    cellSize,
    gridCols: cols,
    gridRows: rows,
    originX: -(cols - 1) * cellSize / 2,
    originZ: -(rows - 1) * cellSize / 2,
    heightAt(x, z) {
      const gx = Math.max(0, Math.min(cols - 1, Math.round((x - this.originX) / cellSize)))
      const gz = Math.max(0, Math.min(rows - 1, Math.round((z - this.originZ) / cellSize)))
      return terrainHeights[gz * cols + gx]
    },
  }
  const mesh = createGardenWaterMesh(terrain, water, () => bounds)
  return {
    mesh,
    waterGeometry: mesh.geometry,
    water,
    terrain,
    setWater(next) {
      waterPresent = next
      renderable = next
      waterDirty = true
    },
    settle() { waterDirty = false },
    resize(next) { bounds = next; mesh.syncBounds(next) },
  }
}

test('dry water-field updates stay clear and wet updates stay in the active pond region', () => {
  const harness = makeHarness()
  const geometry = harness.waterGeometry
  const colors = geometry.getAttribute('color')
  const initialRangeCount = colors.updateRanges.length
  harness.mesh.update(0)
  assert.equal(colors.updateRanges.length, initialRangeCount, 'dry field should not scan or upload the water sheet')

  harness.setWater(true)
  harness.settle()
  harness.mesh.markDirty()
  const beforePositionVersion = geometry.getAttribute('position').version
  const beforeColorVersion = geometry.getAttribute('color').version
  harness.mesh.update(0.5)
  assert.ok(geometry.getAttribute('position').version > beforePositionVersion, 'pond edit uploads its position patch')
  assert.ok(geometry.getAttribute('color').version > beforeColorVersion, 'pond edit uploads its color patch')
  const ranges = geometry.getAttribute('position').updateRanges
  assert.ok(ranges.length > 0, 'a visible pool should produce patch update ranges')
  const positionArray = geometry.getAttribute('position').array
  const changedCount = ranges.reduce((sum, range) => sum + range.count, 0) / 3
  assert.ok(changedCount < positionArray.length / 12,
    `pond surface should patch a small fraction of the parcel (uploaded vertices=${changedCount})`)
  assert.equal(harness.mesh.dirty, false)
})

test('resizing the parcel preserves the wet surface contract', () => {
  const harness = makeHarness()
  harness.setWater(true)
  harness.settle()
  harness.mesh.update(0)
  const previous = harness.mesh.mesh.geometry
  const previousBuffer = harness.waterGeometry
  harness.resize({ halfWidth: 15.6, halfDepth: 10.6 })
  assert.equal(harness.mesh.mesh.geometry, previous, 'parcel reveal reuses the max-capacity water mesh')
  assert.equal(harness.waterGeometry, previousBuffer, 'parcel reveal does not allocate replacement buffers')
  assert.equal(harness.mesh.dirty, true)
  harness.mesh.markDirty()
  harness.mesh.update(1)
  assert.equal(harness.mesh.dirty, false)
})
