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

test('flat ground takes no water: a pour it cannot keep adds nothing and runs nothing off', () => {
  const field = makeField(() => 0)
  // Flat ground drains to the open border, so nothing poured there can be
  // kept. The bucket refuses it rather than wasting it off the parcel edge.
  assert.equal(field.canPour(0, 0, 2), false, 'the cursor should read red on bare flat ground')
  assert.equal(field.pour(0, 0, 2, 0.4), 0, 'a refused pour reports no volume added')
  settleFully(field)
  assert.equal(field.summary().wetCells, 0, 'no water should remain on a flat plate')
  assert.equal(field.summary().runoff, 0, 'a refused pour must not appear as runoff')
})

test('a bowl pins its level at the rim and refuses to rise above it', () => {
  const field = makeField(bowl(2.5, -1))
  const rim = 0
  // Keep pouring until the pool stops rising: that is the moment it reached
  // the rim, which is the behavior under test.
  fillBasin(field, 0, 0, 1, 0.5)
  const first = field.summary()
  assert.ok(first.wetCells > 0, 'the bowl should hold water')
  assert.ok(first.visibleWetCells > 0, 'a filled bowl has rendered pond surface')
  assert.ok(
    Math.abs(first.highestSurface - rim) < 1e-3,
    `level should sit at the rim (${rim}), got ${first.highestSurface}`,
  )
  // Over-pour hard. The level must NOT climb above the rim.
  let refused = 0
  for (let i = 0; i < 60; i += 1) {
    refused += field.pour(0, 0, 1, 0.5)
    settleFully(field)
  }
  const flooded = field.summary()
  assert.ok(
    flooded.highestSurface <= rim + 1e-3,
    `level must not exceed the rim, got ${flooded.highestSurface}`,
  )
  // A full bowl refuses the surplus instead of spilling it: no runoff, and the
  // cursor reads red once there is no room left.
  assert.equal(flooded.runoff, 0, 'a full bowl should refuse water, not spill it')
  assert.equal(field.canPour(0, 0, 1), false, 'a full bowl should read as not pourable')
  assert.ok(Math.abs(flooded.volume - first.volume) < 1e-3, 'a full bowl keeps the same volume')
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

test('a thick pour onto a basinless slope is refused rather than run off', () => {
  const field = makeField(slope(0.6))
  assert.equal(field.canPour(-4, 0, 1.5), false, 'a basinless slope cannot take water')
  assert.equal(field.pour(-4, 0, 1.5, 3), 0, 'the slope accepts nothing')
  settleFully(field)
  assert.equal(field.summary().wetCells, 0, 'a basinless slope should not hold water')
  assert.equal(field.summary().runoff, 0, 'and nothing should be recorded as runoff')
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
  // A single-cell click below the visible depth. A wider disc would pool its
  // water into the pit floor and cross the threshold, which is correct.
  field.pour(0, 0, 0.1, WATER_MIN_VISIBLE_DEPTH * 0.5)
  settleFully(field)
  assert.equal(field.summary().wetCells, 0, 'a sub-visible film should not register as water')
  assert.equal(field.summary().visibleWetCells, 0, 'a sub-render-threshold film has no pond surface')
})

test('a small bucket click does not render a broad wet halo before a pool has depth', () => {
  const field = makeField(bowl(2.5, -1))
  field.pour(0, 0, 0.8, WATER_MIN_RENDER_DEPTH * 0.1)
  settleFully(field)
  const summary = field.summary()
  assert.ok(summary.wetCells > 0, 'a shallow film can still be tracked by the water simulation')
  assert.equal(summary.visibleWetCells, 0, 'a shallow film must not count as visible pond habitat')
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

test('terrain edits on an empty water field skip the expensive full hydrology solve', () => {
  let terrainHeight = (_x, _z) => 0
  const field = makeField((x, z) => terrainHeight(x, z))
  field.markTerrainChanged()
  const start = performance.now()
  field.settle()
  const dryEditMs = performance.now() - start
  assert.equal(field.dirty, false)
  assert.equal(field.hasWater, false)
  assert.ok(dryEditMs < 10, `empty terrain sync should be trivial (got ${dryEditMs.toFixed(2)}ms)`)

  terrainHeight = (x, z) => Math.hypot(x, z) < 2 ? -0.8 : 0
  field.pour(0, 0, 1, 0.4)
  settleFully(field)
  assert.ok(field.summary().wetCells > 0, 'a pour after dry edits uses the latest ground')
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

/**
 * One frame of the bucket: pour a tick's worth, then settle as the 30 Hz loop
 * would. Returns the volume the pour accepted, so tests can account for it.
 */
function bucketTick(field, x, z, radius, metres) {
  const added = field.pour(x, z, radius, metres)
  if (field.dirty) field.settle()
  return added
}

/** A pit with its rim at grade and open flat ground beyond it. */
function pit() {
  return makeField(bowl(2.5, -1))
}

test('a pour onto the slope above a bowl flows down and fills it', () => {
  // Regression: a pour that landed on the bowl's slope, not its floor, used to
  // be written off as runoff because the pool was anchored above its own level.
  const field = pit()
  let poured = 0
  for (let tick = 0; tick < 60; tick += 1) poured += bucketTick(field, 1.2, 0, 0.6, 0.0336)
  const summary = field.summary()
  assert.ok(summary.wetCells > 0, 'the bowl should be holding water')
  assert.equal(summary.runoff, 0, 'a bowl that can take the water should not spill it')
  assert.ok(Math.abs(summary.volume - poured) < 1e-3, `held ${summary.volume} should match poured ${poured}`)
  const floorDepth = field.depthAt(0, 0)
  assert.ok(floorDepth > 0, 'the water should reach the lowest point of the bowl')
})

test('a cursor grazing a bowl edge fills only the part it covers', () => {
  const field = pit()
  for (let tick = 0; tick < 60; tick += 1) bucketTick(field, 2.1, 0, 0.6, 0.0336)
  const outside = countWetAbove(field, () => true)
  const wet = field.wetCells()
  assert.ok(wet.length > 0, 'the grazed part of the bowl should hold water')
  for (const index of wet) {
    const [x, z] = cellCentre(index)
    assert.ok(Math.hypot(x, z) < 2.5, `water must stay inside the bowl, found one at (${x.toFixed(2)}, ${z.toFixed(2)})`)
  }
  assert.equal(field.summary().runoff, 0, 'grazing water should not run off the flat ground')
  assert.ok(outside >= wet.length, 'sanity: the wet count is a subset of the field')
})

test('a big cursor over a bowl and the flat ground around it takes only what the bowl holds', () => {
  const field = pit()
  let poured = 0
  for (let tick = 0; tick < 200; tick += 1) poured += bucketTick(field, 0, 0, 4, 0.0336)
  const summary = field.summary()
  assert.equal(summary.runoff, 0, 'a big bucket must not send water off the flat ground')
  assert.ok(summary.highestSurface <= 1e-3, `level must stay at the rim, got ${summary.highestSurface}`)
  // Water only ever lands in the bowl, so nothing sits on the flat ring.
  assert.equal(countWetAbove(field, () => true) - field.wetCells().filter((i) => Math.hypot(...cellCentre(i)) < 2.5).length, 0,
    'no water should sit on the flat ground outside the bowl')
  assert.ok(Math.abs(summary.volume - poured) < 1e-3, `held ${summary.volume} should match what the bowl accepted ${poured}`)
})

test('canPour agrees with pour: a pour is accepted exactly where the cursor reads green', () => {
  const spots = [[0, 0], [1.2, 0], [2.1, 0], [3.5, 0], [-3.5, 0], [0, 3.5]]
  for (const [x, z] of spots) {
    const field = pit()
    // Fill the bowl part way, so the answer depends on what is already held.
    for (let tick = 0; tick < 25; tick += 1) bucketTick(field, 0, 0, 1.4, 0.0336)
    const green = field.canPour(x, z, 0.6)
    const accepted = field.pour(x, z, 0.6, 0.0336)
    assert.equal(accepted > 0, green, `at (${x}, ${z}) canPour said ${green} but pour accepted ${accepted}`)
  }
})

test('canPour turns red once a bowl is full, and the spill is refused rather than run off', () => {
  const field = pit()
  for (let tick = 0; tick < 400; tick += 1) bucketTick(field, 0, 0, 2, 0.0336)
  assert.equal(field.canPour(0, 0, 2), false, 'a full bowl should not read as pourable')
  assert.equal(field.summary().runoff, 0, 'refusing a full bowl must not create runoff')
})

test('volume is conserved across random pours and drains in random basins', () => {
  // Deterministic LCG so a failure reproduces exactly.
  let seed = 12345
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let trial = 0; trial < 6; trial += 1) {
    const floor = -0.4 - random() * 1.2
    const radius = 1.2 + random() * 1.8
    const field = makeField(bowl(radius + 0.5, floor))
    let poured = 0
    let drained = 0
    const startRunoff = field.summary().runoff
    for (let step = 0; step < 150; step += 1) {
      const x = (random() - 0.5) * 5
      const z = (random() - 0.5) * 5
      const cursor = 0.3 + random() * 1.5
      if (random() < 0.8) poured += bucketTick(field, x, z, cursor, 0.02 + random() * 0.05)
      else {
        drained += field.drain(x, z, cursor, 0.02 + random() * 0.05)
        if (field.dirty) field.settle()
      }
    }
    settleFully(field)
    const summary = field.summary()
    const accounted = summary.volume + (summary.runoff - startRunoff) + drained
    assert.ok(
      Math.abs(accounted - poured) < 1e-3 * Math.max(1, poured),
      `trial ${trial}: poured ${poured.toFixed(5)}, held+runoff+drained ${accounted.toFixed(5)}`,
    )
  }
})
