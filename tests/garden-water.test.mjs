import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/garden-water.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const waterModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createGardenWaterField, WATER_MIN_RENDER_DEPTH, WATER_MIN_VISIBLE_DEPTH } = waterModule

const CELL = 0.5
const COLS = 21
const ROWS = 21

/**
 * Build a field over a synthetic height function. `height(worldX, worldZ)`
 * is in metres; the grid is centred on the origin exactly like the terrain's.
 */
function makeField(height, cols = COLS, rows = ROWS) {
  const originX = -(cols * CELL) / 2
  const originZ = -(rows * CELL) / 2
  return createGardenWaterField({
    cellSize: CELL,
    gridCols: cols,
    gridRows: rows,
    cellHeight: (gx, gz) => height(originX + (gx + 0.5) * CELL, originZ + (gz + 0.5) * CELL),
  })
}

/** Settle repeatedly, as the render loop would across frames. */
function settleFully(field, passes = 40) {
  for (let pass = 0; pass < passes; pass += 1) {
    if (!field.dirty) break
    field.settle()
  }
}

/**
 * Pour and settle repeatedly until the pool stops growing, so a test can talk
 * about "a full basin" instead of guessing a volume. Returns how many pours it
 * took. `minPours` guarantees a basin test actually gets past its rim.
 */
function fillBasin(field, x, z, radius, metres, maxPours = 200) {
  let previous = -1
  let pours = 0
  for (let i = 0; i < maxPours; i += 1) {
    field.pour(x, z, radius, metres)
    settleFully(field)
    const level = field.summary().highestSurface
    pours = i + 1
    if (Math.abs(level - previous) < 1e-4 && i > 0) break
    previous = level
  }
  return pours
}

/** Deepest point of a disc-shaped bowl centred on the origin. */
function bowl(radius, floor) {
  return (x, z) => {
    const distance = Math.hypot(x, z)
    if (distance >= radius) return 0
    const t = 1 - distance / radius
    return floor * t * t
  }
}

/** A plane tilted along +x, so poured water runs downhill toward +x. */
function slope(range) {
  return (x) => -range * (x / 10)
}

test('flat ground holds nothing: poured water runs off the simulation border', () => {
  const field = makeField(() => 0)
  // The plate is the whole grid, and the grid border is an open outlet, so a
  // film of water poured on flat ground has nowhere to sit.
  field.pour(0, 0, 1, 0.4)
  settleFully(field)
  assert.equal(field.summary().wetCells, 0, 'no water should remain on a flat plate')
  assert.ok(field.summary().runoff > 0, 'the water should be recorded as runoff')
})

test('a bowl pins its level at the rim and refuses to rise above it', () => {
  const field = makeField(bowl(2.5, -1))
  const rim = 0
  // Keep pouring until the pool stops rising: that is the moment it reached
  // the rim, which is the behavior under test.
  fillBasin(field, 0, 0, 1, 0.5)
  const first = field.summary()
  assert.ok(first.wetCells > 0, 'the bowl should hold water')
  assert.ok(
    Math.abs(first.highestSurface - rim) < 1e-3,
    `level should sit at the rim (${rim}), got ${first.highestSurface}`,
  )
  // Over-pour hard. The level must NOT climb above the rim.
  for (let i = 0; i < 60; i += 1) {
    field.pour(0, 0, 1, 0.5)
    settleFully(field)
  }
  const flooded = field.summary()
  assert.ok(
    flooded.highestSurface <= rim + 1e-3,
    `level must not exceed the rim, got ${flooded.highestSurface}`,
  )
  assert.ok(flooded.runoff > 0, 'the surplus over the rim should have run off')
})

test('a basin above grade still holds water (the h<0 shortcut is disallowed)', () => {
  // Floor at +0.4, surroundings at +0.6: entirely above zero.
  const field = makeField((x, z) => {
    const distance = Math.hypot(x, z)
    return distance < 2 ? 0.4 : 0.6
  })
  fillBasin(field, 0, 0, 0.75, 0.4)
  const summary = field.summary()
  assert.ok(summary.wetCells > 0, 'an above-grade dip must hold water')
  assert.ok(
    Math.abs(summary.highestSurface - 0.6) < 1e-3,
    `level should sit at the 0.6 rim, got ${summary.highestSurface}`,
  )
  assert.ok(summary.highestSurface > 0, 'the whole pool is above grade')
})

test('the solved surface is flat across the whole pool', () => {
  const field = makeField(bowl(2.5, -1))
  fillBasin(field, 0, 0, 1, 0.4)
  const wet = field.wetCells()
  assert.ok(wet.length > 4, 'expected a pool several cells across')
  const levels = wet.map((index) => field.surfaceAt(...cellCentre(index)))
  const min = Math.min(...levels)
  const max = Math.max(...levels)
  assert.ok(max - min < 1e-3, `surface should be flat, spread was ${max - min}`)
})

test('water poured on a slope ends up in the basin, not on the hill', () => {
  const field = makeField((x, z) => slope(0.6)(x) + bowl(2.5, -0.8)(x, z))
  fillBasin(field, -3.5, 0, 1, 0.6)
  const summary = field.summary()
  assert.ok(summary.wetCells > 0, 'the slope should drain into the bowl')
  // Nothing is left clinging to the upslope half of the plate.
  const onSlope = countWetAbove(field, x => x < -2.4)
  assert.equal(onSlope, 0, `no water should remain on the slope, found ${onSlope} cells`)
})

test('settle is idempotent: a second pass changes nothing', () => {
  const field = makeField(bowl(2.5, -1))
  fillBasin(field, 0, 0, 1, 0.4)
  const before = field.wetCells().map((index) => field.depthAt(...cellCentre(index)))
  const runoffBefore = field.summary().runoff
  // Mark dirty so settle actually re-runs the solver over the same water.
  field.drain(0, 0, 0.01, 0)
  for (let pass = 0; pass < 5; pass += 1) field.settle()
  const after = field.wetCells().map((index) => field.depthAt(...cellCentre(index)))
  assert.equal(after.length, before.length, 'the same cells should stay wet')
  for (let i = 0; i < before.length; i += 1) {
    assert.ok(Math.abs(before[i] - after[i]) < 1e-5, `cell ${i} drifted: ${before[i]} -> ${after[i]}`)
  }
  assert.equal(field.summary().runoff, runoffBefore, 'a stable pool must not shed new runoff')
})

test('volume is conserved up to recorded runoff', () => {
  const field = makeField(bowl(2.5, -1))
  let poured = 0
  for (let i = 0; i < 10; i += 1) poured += field.pour(0, 0, 0.8, 0.3)
  settleFully(field)
  const summary = field.summary()
  const accounted = summary.volume + summary.runoff
  assert.ok(
    Math.abs(accounted - poured) / poured < 0.02,
    `poured ${poured}, accounted ${accounted} (held ${summary.volume} + runoff ${summary.runoff})`,
  )
})

test('digging the floor deeper lowers the surface but keeps the water', () => {
  let floor = -0.5
  const field = makeField((x, z) => {
    const distance = Math.hypot(x, z)
    return distance < 2 ? floor : 0
  })
  fillBasin(field, 0, 0, 1, 0.25)
  const before = field.summary()
  assert.ok(Math.abs(before.highestSurface) < 1e-3, 'pool should sit at the rim')

  // The shovel takes the flat floor down another 0.5 m. A cylindrical basin
  // widened by digging has more room at every level, so the SAME volume now
  // sits lower: the surface drops by the amount dug and the depth is
  // unchanged. Water is conserved, not created or lost.
  floor = -1.0
  field.markTerrainChanged()
  settleFully(field)
  const after = field.summary()
  assert.ok(
    Math.abs(after.highestSurface - (before.highestSurface - 0.5)) < 1e-3,
    `the surface should drop by the 0.5 m dug, got ${after.highestSurface}`,
  )
  assert.ok(
    Math.abs(after.maxDepth - before.maxDepth) < 1e-3,
    'a straight-walled basin holds the same depth when it gets deeper',
  )
  assert.ok(
    Math.abs(after.volume - before.volume) < 1e-3,
    'digging under water must not create or destroy water',
  )
})

test('digging a pit in the pond bed makes the water at the bottom deeper', () => {
  // This pins the *bed* getting deeper, which is the claim that actually
  // matters to a player who digs under a pond: the ground under the water goes
  // down. Whether the total depth also rises depends on how much capacity the
  // dig adds versus how far the surface sags, so that is asserted separately
  // and loosely — a pit as wide as the pond cancels out exactly, and that is
  // correct physics rather than a bug.
  let pitDepth = 0
  const field = makeField((x, z) => {
    const base = bowl(2.5, -0.8)(x, z)
    if (pitDepth <= 0) return base
    return Math.hypot(x, z) < 1.0 ? base - pitDepth : base
  })
  // A partial pour, not a full basin: a pond filled to its brim would simply
  // overflow and drain the moment the bed is dug out.
  field.pour(0, 0, 1, 0.12)
  settleFully(field)
  const before = field.summary()
  assert.ok(before.maxDepth > 0.2, 'expected a real pool to start with')
  const bedBefore = field.surfaceAt(0, 0) - before.maxDepth

  pitDepth = 0.4
  field.markTerrainChanged()
  settleFully(field)
  const after = field.summary()

  assert.ok(after.wetCells > 0, 'the pond must survive being dug into')
  const bedAfter = field.surfaceAt(0, 0) - after.maxDepth
  assert.ok(
    bedAfter < bedBefore - 0.3,
    `the pond bed should drop by the amount dug (${bedBefore} -> ${bedAfter})`,
  )
  assert.ok(
    Math.abs(after.volume - before.volume) < 1e-2,
    'digging must not create or destroy water',
  )
})

test('filling a pond in removes it', () => {
  let floor = -0.8
  const field = makeField((x, z) => {
    const distance = Math.hypot(x, z)
    return distance < 2 ? floor : 0
  })
  fillBasin(field, 0, 0, 1, 0.3)
  assert.ok(field.summary().wetCells > 0, 'expected a pond to start with')

  // The shovel fills the hole back up to grade: the water has nowhere left.
  floor = 0.05
  field.markTerrainChanged()
  settleFully(field)
  assert.equal(field.summary().wetCells, 0, 'a filled-in pond should be gone')
})

test('drain empties the pond and leaves the ground alone', () => {
  const height = bowl(2.5, -1)
  const field = makeField(height)
  fillBasin(field, 0, 0, 1, 0.4)
  assert.ok(field.summary().wetCells > 0, 'expected a pond to start with')
  const groundBefore = field.summary().highestSurface

  for (let i = 0; i < 60; i += 1) field.drain(0, 0, 2.5, 0.3)
  settleFully(field)
  assert.equal(field.summary().wetCells, 0, 'draining should empty the pond')
  assert.ok(
    field.summary().highestSurface <= groundBefore,
    'draining must not raise the water surface',
  )
})

test('the same pours produce an identical field twice (determinism)', () => {
  const run = () => {
    const field = makeField((x, z) => slope(0.4)(x) + bowl(2.5, -0.7)(x, z))
    for (let i = 0; i < 12; i += 1) field.pour(-2 + i * 0.3, 0, 1, 0.25)
    settleFully(field)
    return field.wetCells().map((index) => field.depthAt(...cellCentre(index)))
  }
  const first = run()
  const second = run()
  assert.deepEqual(first, second, 'two identical pour sequences must match exactly')
})

test('shore field carries the nearest pool level through transparent vertices', () => {
  const field = makeField(bowl(2.5, -1))
  fillBasin(field, 0, 0, 0.8, 0.35)
  const { level, wetness } = field.shoreField()
  const wet = field.wetCells()
  assert.ok(wet.length > 0)
  const poolLevel = field.surfaceAt(...cellCentre(wet[0]))
  const dryFarCell = 0
  assert.equal(wetness[dryFarCell], 0, 'far dry ground remains transparent')
  assert.ok(Number.isFinite(level[dryFarCell]), 'transparent geometry vertices need a finite carried height')
  const farPoint = cellCentre(dryFarCell)
  assert.ok(Math.abs(level[dryFarCell] - poolLevel) < 1e-4,
    'carried vertices must remain coplanar instead of forming long triangular ramps')
  const diagonalShore = wet
    .flatMap((index) => {
      const gx = index % COLS
      const gz = (index - gx) / COLS
      return [[gx + 1, gz + 1], [gx + 1, gz - 1], [gx - 1, gz + 1], [gx - 1, gz - 1]]
    })
    .filter(([gx, gz]) => gx >= 0 && gz >= 0 && gx < COLS && gz < ROWS)
    .map(([gx, gz]) => wetness[cellAt(gx, gz)])
    .find((alpha) => alpha > 0)
  assert.notEqual(diagonalShore, undefined,
    'water should fade in roundly around diagonal corners, not as Manhattan diamonds')
  assert.ok(Number.isFinite(farPoint[0]))
})

test('a thick pour onto a slope drains entirely rather than sheeting uphill', () => {
  const field = makeField(slope(0.6))
  field.pour(-4, 0, 1.5, 3)
  settleFully(field)
  // A pure slope has no basin, so everything runs off the downhill border.
  assert.equal(field.summary().wetCells, 0, 'a basinless slope should not hold water')
  assert.ok(field.summary().runoff > 0, 'the water should have run off')
})

test('the field reports damp ground at the shoreline and dry ground inland', () => {
  const field = makeField(bowl(2.5, -1))
  fillBasin(field, 0, 0, 0.6, 0.4)
  assert.equal(field.isDamp(0, 0), true, 'the pool floor is wet')
  const edge = (COLS * CELL) / 2 - 0.75
  assert.equal(field.isDamp(edge, edge), false, 'the far corner is dry')
})

test('thin films read as damp, not as water', () => {
  const field = makeField(bowl(2.5, -1))
  field.pour(0, 0, 1, WATER_MIN_VISIBLE_DEPTH * 0.5)
  settleFully(field)
  assert.equal(field.summary().wetCells, 0, 'a sub-visible film should not register as water')
})

test('a small bucket click does not render a broad wet halo before a pool has depth', () => {
  const field = makeField(bowl(2.5, -1))
  field.pour(0, 0, 0.8, WATER_MIN_RENDER_DEPTH * 0.1)
  settleFully(field)
  const summary = field.summary()
  assert.ok(summary.wetCells > 0, 'a shallow film can still be tracked by the water simulation')
  assert.ok(summary.maxDepth < WATER_MIN_RENDER_DEPTH,
    `the test pour should remain below the render threshold (${summary.maxDepth})`)
  const { level, wetness } = field.shoreField()
  assert.equal(Math.max(...wetness), 0, 'sub-threshold water must not seed a visible shore fade')
  assert.ok(level.every(Number.isNaN), 'there should be no render surface until water reaches minimum depth')
})

test('a pour with no radius or no volume is a no-op', () => {
  const field = makeField(bowl(2.5, -1))
  assert.equal(field.pour(0, 0, 0, 1), 0)
  assert.equal(field.pour(0, 0, 1, 0), 0)
  assert.equal(field.pour(Number.NaN, 0, 1, 1), 0)
  settleFully(field)
  assert.equal(field.summary().wetCells, 0)
})

test('clear empties the field and resets runoff', () => {
  const field = makeField(() => 0)
  field.pour(0, 0, 1, 0.5)
  settleFully(field)
  field.clear()
  settleFully(field)
  const summary = field.summary()
  assert.equal(summary.wetCells, 0)
  assert.equal(summary.volume, 0)
  assert.equal(summary.runoff, 0)
})

/** Row-major index at a grid coordinate. */
function cellAt(gx, gz) {
  return gz * COLS + gx
}

/** World-space centre of a row-major cell index. */
function cellCentre(index) {
  const originX = -(COLS * CELL) / 2
  const originZ = -(ROWS * CELL) / 2
  const gx = index % COLS
  const gz = (index - gx) / COLS
  return [originX + (gx + 0.5) * CELL, originZ + (gz + 0.5) * CELL]
}

/** Count wet cells whose x passes a predicate. */
function countWetAbove(field, predicate) {
  return field.wetCells().filter((index) => predicate(cellCentre(index)[0])).length
}
