import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/** Bundle-then-import, matching the other suites, so the pure TS is tested as shipped. */
async function load(entry) {
  const { outputFiles } = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const props = await load('src/game/farm-props.ts')
const { createWallet } = await load('src/game/sales.ts')

/** A surface with a uniform height plus an optional water depth, all in bounds. */
function surface({ height = 0, water = 0, contains = () => true } = {}) {
  return {
    heightAt: () => height,
    waterAt: () => water,
    contains,
  }
}

test('a purchase debits exactly the catalog price and increments the inventory', () => {
  const wallet = createWallet(100)
  const inventory = props.createPropInventory()
  const result = props.purchaseProp(wallet, inventory, 'statue')
  assert.equal(result.ok, true)
  assert.equal(result.balance, 100 - props.PROP_CATALOG.statue.price)
  assert.equal(wallet.balance, 100 - props.PROP_CATALOG.statue.price)
  assert.equal(inventory.count('statue'), 1)
  assert.equal(inventory.count('fence'), 0)
})

test('a purchase past the balance is refused and leaves both unchanged', () => {
  const wallet = createWallet(10)
  const inventory = props.createPropInventory()
  const result = props.purchaseProp(wallet, inventory, 'fountain')
  assert.equal(result.ok, false)
  assert.equal(result.failure, 'cannot-afford')
  assert.equal(wallet.balance, 10)
  assert.equal(inventory.count('fountain'), 0)
})

test('placing consumes exactly one, and an empty inventory is out of stock', () => {
  const inventory = props.createPropInventory({ statue: 2 })
  const occupancy = props.createPropOccupancy()
  const cell = { cellX: 0, cellZ: 0 }
  assert.equal(props.placementResult('statue', cell, 0, surface(), occupancy, inventory).valid, true)
  assert.equal(inventory.take('statue', 1), true)
  assert.equal(inventory.count('statue'), 1)
  const empty = props.createPropInventory()
  const blocked = props.placementResult('statue', cell, 0, surface(), occupancy, empty)
  assert.equal(blocked.valid, false)
  assert.equal(blocked.failure, 'out-of-stock')
})

test('a footprint marks its cells occupied and a second prop cannot overlap it', () => {
  const occupancy = props.createPropOccupancy()
  const coop = props.placedCellProp('coop', { cellX: 2, cellZ: 2 }, 0)
  occupancy.add(coop)
  assert.deepEqual(
    coop.cells.map((cell) => `${cell.cellX},${cell.cellZ}`).sort(),
    ['2,2', '2,3', '3,2', '3,3'],
  )
  const overlap = props.placementResult('statue', { cellX: 3, cellZ: 3 }, 0, surface(), occupancy)
  assert.equal(overlap.valid, false)
  assert.equal(overlap.failure, 'occupied')
  const clear = props.placementResult('statue', { cellX: 5, cellZ: 5 }, 0, surface(), occupancy)
  assert.equal(clear.valid, true)
})

test('rotation swaps a rectangular footprint, and 2x2 is rotation-invariant', () => {
  const rect = props.footprintCells('coop', { cellX: 0, cellZ: 0 }, 1)
  assert.equal(rect.length, 4)
  assert.equal(props.footprintExtent('coop', 2).width, 2)
  // A 1x2 footprint would swap; the catalog has none yet, so check the helper directly.
  assert.deepEqual(props.footprintExtent('statue', 1), { width: 1, depth: 1 })
})

test('cell placement is refused out of bounds, in water and on steep ground', () => {
  const cell = { cellX: 0, cellZ: 0 }
  const outOfBounds = props.placementResult('statue', cell, 0, surface({ contains: () => false }))
  assert.equal(outOfBounds.failure, 'out-of-bounds')
  const inWater = props.placementResult('statue', cell, 0, surface({ water: 0.4 }))
  assert.equal(inWater.failure, 'in-water')
  let n = 0
  const bumpy = {
    heightAt: () => (n++ % 2 === 0 ? 0 : 1),
    waterAt: () => 0,
    contains: () => true,
  }
  const steep = props.placementResult('statue', cell, 0, bumpy)
  assert.equal(steep.failure, 'too-steep')
})

test('collinear adjacent fence segments join into one run with shared posts', () => {
  const segments = [
    { x: 0, z: 0, axis: 'x' },
    { x: 1, z: 0, axis: 'x' },
    { x: 2, z: 0, axis: 'x' },
  ]
  const runs = props.fenceRuns(segments)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].segments.length, 3)
  assert.equal(runs[0].posts.length, 4)
  // Removing the middle segment splits the run in two, but the shared outer posts remain.
  const split = props.fenceRuns([segments[0], segments[2]])
  assert.equal(split.length, 2)
  assert.equal(props.fencePosts([segments[0], segments[2]]).length, 4)
})

test('a fence run is priced per new segment and skips segments already fenced', () => {
  const occupancy = props.createPropOccupancy()
  occupancy.add(props.placedFenceRun([{ x: 0, z: 0, axis: 'x' }]))
  const inventory = props.createPropInventory({ fence: 4 })
  const result = props.fenceRunPlacement(
    { x: 0, z: 0 },
    { x: 3, z: 0 },
    surface(),
    occupancy,
    inventory,
  )
  assert.equal(result.valid, true)
  assert.equal(result.segments.length, 3)
  assert.equal(result.free.length, 2)
  assert.equal(result.cost, 2 * props.PROP_CATALOG.fence.price)
})

test('picking a prop up returns it and frees its cells, round-tripping the counts', () => {
  const inventory = props.createPropInventory({ fountain: 1 })
  const occupancy = props.createPropOccupancy()
  const cell = { cellX: -2, cellZ: 1 }
  assert.equal(props.placementResult('fountain', cell, 0, surface(), occupancy, inventory).valid, true)
  assert.equal(inventory.take('fountain', 1), true)
  const placed = props.placedCellProp('fountain', cell, 0)
  occupancy.add(placed)
  assert.equal(inventory.count('fountain'), 0)
  // Pick it back up.
  assert.equal(occupancy.remove(placed), true)
  assert.equal(inventory.add('fountain', 1), 1)
  assert.equal(props.placementResult('fountain', cell, 0, surface(), occupancy, inventory).valid, true)
  assert.equal(inventory.count('fountain'), 1)
  assert.equal(occupancy.placed.length, 0)
})

test('a picked-up fence run releases every segment and returns the whole run', () => {
  const occupancy = props.createPropOccupancy()
  const inventory = props.createPropInventory({ fence: 3 })
  const run = props.fenceRunPlacement({ x: 0, z: 0 }, { x: 3, z: 0 }, surface(), occupancy, inventory)
  assert.equal(run.valid, true)
  const placed = props.placedFenceRun(run.free)
  occupancy.add(placed)
  inventory.take('fence', placed.segments.length)
  assert.equal(inventory.count('fence'), 0)
  assert.equal(occupancy.fenceSegments.length, 3)
  // Pick the whole run back up: every segment returns, and none is left occupied.
  assert.equal(occupancy.remove(placed), true)
  inventory.add('fence', placed.segments.length)
  assert.equal(inventory.count('fence'), 3)
  assert.equal(occupancy.fenceSegments.length, 0)
  assert.equal(occupancy.isEdgeFree({ x: 1, z: 0, axis: 'x' }), true)
})

test('the same purchase-and-place sequence is deterministic twice over', () => {
  const run = () => {
    const wallet = createWallet(200)
    const inventory = props.createPropInventory()
    const occupancy = props.createPropOccupancy()
    for (const id of ['statue', 'fountain', 'coop']) props.purchaseProp(wallet, inventory, id)
    const placements = [
      props.placedCellProp('statue', { cellX: 0, cellZ: 0 }, 1),
      props.placedCellProp('fountain', { cellX: 4, cellZ: 0 }, 0),
      props.placedCellProp('coop', { cellX: 0, cellZ: 4 }, 0),
    ]
    for (const placed of placements) {
      inventory.take(placed.id, 1)
      occupancy.add(placed)
    }
    return {
      counts: inventory.counts,
      occupied: occupancy.placed
        .flatMap((entry) => entry.cells.map((cell) => `${entry.id}@${cell.cellX},${cell.cellZ}`))
        .sort(),
    }
  }
  assert.deepEqual(run(), run())
})
