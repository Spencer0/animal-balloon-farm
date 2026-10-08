import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The condition mechanic is pure (no Three.js, no DOM), so the whole loop can
 * be verified here rather than only by eye in a browser. That is the point of
 * keeping it in `src/game/`.
 */
const bundle = async (entry) => {
  const { outputFiles } = await build({
    entryPoints: [`src/game/${entry}.ts`],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const conditions = await bundle('animal-conditions')
const farmState = await bundle('farm-state')
const progressModule = await bundle('animal-progress')

const {
  SPECIES_CONDITIONS,
  CARNIVAL_STARTERS,
  DISCOVERY,
  getSpeciesConditions,
  stageAppearance,
  stageHasHeartEyes,
  conditionMetricUnit,
  formatConditionMetric,
} = conditions
const { measureTallGrass, measureWater, measureFlatGrassArea, measureFarmState, DEFAULT_MATURITY } = farmState
const { createAnimalProgress, requirementMet, startingCarnivalSpecies, makeFarmSnapshot } = progressModule

const SPECIES = ['pig', 'sheep', 'cow', 'chicken', 'duck', 'goose', 'frog']

/**
 * A lawn grid of `cols` x `rows` vertices with uniform coverage. Pass a number
 * for `maturity` to make every blade that height, or a per-index callback.
 */
function lawn(coverage, cols = 4, rows = 4, maturity) {
  const count = cols * rows
  const xs = new Float32Array(count)
  const zs = new Float32Array(count)
  const cov = new Float32Array(count)
  const heights = maturity === undefined ? undefined : new Float32Array(count)
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = z * cols + x
      xs[index] = x * 0.58
      zs[index] = z * 0.58
      cov[index] = coverage
      if (heights) {
        heights[index] = typeof maturity === 'function' ? maturity(index) : maturity
      }
    }
  }
  return { count, xs, zs, coverage: cov, maturity: heights }
}

/** A flat terrain grid at height 0. */
function flatTerrain(cols = 10, rows = 10, cellSize = 0.55) {
  return {
    heights: new Float32Array(cols * rows),
    cols,
    rows,
    cellSize,
    originX: 0,
    originZ: 0,
  }
}

const EMPTY_FARM = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }

function snapshot(state, residents = []) {
  return { state, residentSpecies: new Set(residents) }
}

// --------------------------------------------------------------- the ladder --

test('every species defines the same four conditions in the same order', () => {
  for (const species of SPECIES) {
    const stages = getSpeciesConditions(species)
    assert.equal(stages.length, 4, `${species} should have four conditions`)
    assert.deepEqual(stages.map((stage) => stage.stage), [1, 2, 3, 4], `${species} stage numbers`)
    assert.deepEqual(
      stages.map((stage) => stage.title),
      ['Visit the carnival', 'Visit the farm', 'Call the farm home', 'Love the farm'],
      `${species} titles`,
    )
  }
})

test('the carnival asks nothing; a visit asks nothing unless the animal is lured by plants; the last two do', () => {
  const lured = { sheep: 'clover', chicken: 'dandelion' }
  for (const species of SPECIES) {
    const stages = getSpeciesConditions(species)
    assert.equal(stages[0].requirement, null, `${species} carnival needs nothing`)
    if (lured[species]) {
      assert.equal(stages[1].requirement.kind, 'plantCount', `${species} visiting needs its plant`)
      assert.equal(stages[1].requirement.species, lured[species])
    } else {
      assert.equal(stages[1].requirement, null, `${species} visiting needs nothing`)
    }
    assert.ok(stages[2].requirement, `${species} calling home needs something`)
    assert.ok(stages[3].requirement, `${species} loving the farm needs something`)
  }
})

test('appearance and heart eyes map onto the stage number', () => {
  assert.equal(stageAppearance(0), 'wild')
  assert.equal(stageAppearance(1), 'wild')
  assert.equal(stageAppearance(2), 'wild')
  assert.equal(stageAppearance(3), 'standard')
  assert.equal(stageAppearance(4), 'standard')
  assert.equal(stageHasHeartEyes(3), false)
  assert.equal(stageHasHeartEyes(4), true)
})

test('the cow needs 15 m2 of tall grass to call the farm home', () => {
  const cow = getSpeciesConditions('cow')
  assert.equal(cow[2].requirement.kind, 'grassArea')
  assert.equal(cow[2].requirement.amount, 15)
  assert.equal(cow[2].requirement.maturity, 0.75)
})

test('the pig needs a resident cow, which is how the dependency is expressed', () => {
  const pig = getSpeciesConditions('pig')
  assert.equal(pig[2].requirement.kind, 'residentSpecies')
  assert.equal(pig[2].requirement.species, 'cow')
  assert.deepEqual(SPECIES_CONDITIONS.pig.requiresResident, ['cow'])
})

test('the frog wants water plants, which is a condition kind of its own', () => {
  const frog = getSpeciesConditions('frog')
  // Asking for lily pads implies asking for a pond: a lily can only be planted
  // in visible water, so the chain is expressed by the plant rather than by
  // listing two requirements.
  assert.equal(frog[2].requirement.kind, 'plantCount')
  assert.equal(frog[2].requirement.species, 'water-lily')
  assert.equal(frog[2].requirement.amount, 2)
  assert.equal(frog[3].requirement.kind, 'plantCount')
  assert.equal(frog[3].requirement.species, 'water-lily')
  assert.equal(frog[3].requirement.amount, 4)
})

test('grown lily pads settle the frog; seeds in the water do not', () => {
  const [settle, love] = getSpeciesConditions('frog').slice(2)
  // A big bare pond is still not home: the metric is plants, not water.
  assert.equal(requirementMet(settle.requirement, snapshot({ ...EMPTY_FARM, waterArea: 60 })), false)
  assert.equal(
    requirementMet(settle.requirement, snapshot({ ...EMPTY_FARM, waterArea: 60, plantCounts: { 'water-lily': 1 } })),
    false,
  )
  const two = snapshot({ ...EMPTY_FARM, waterArea: 60, plantCounts: { 'water-lily': 2 } })
  assert.equal(requirementMet(settle.requirement, two), true)
  assert.equal(requirementMet(love.requirement, two), false, 'two pads settle it; four are what it loves')
  assert.equal(
    requirementMet(love.requirement, snapshot({ ...EMPTY_FARM, waterArea: 60, plantCounts: { 'water-lily': 4 } })),
    true,
  )
})

test('a plant condition counts the plant it asked for and no other', () => {
  const frog = getSpeciesConditions('frog')[2].requirement
  assert.equal(
    requirementMet(frog, snapshot({ ...EMPTY_FARM, plantCounts: { clover: 9, poppy: 9 } })),
    false,
    'a field of clover is not a substitute for a lily pad',
  )
  assert.equal(
    requirementMet(frog, snapshot({ ...EMPTY_FARM, plantCounts: { 'not-a-plant': 5 } })),
    false,
    'an unknown plant id reads as zero, the same as an empty pond',
  )
})

test('only the cow and the duck start the game at the carnival; sheep and chickens must be lured', () => {
  assert.deepEqual([...startingCarnivalSpecies(SPECIES)], ['cow', 'duck'])
  assert.equal(CARNIVAL_STARTERS.length, 2)
  assert.equal(DISCOVERY.sheep.kind, 'plantCount')
  assert.equal(DISCOVERY.sheep.species, 'clover')
  assert.equal(DISCOVERY.chicken.species, 'dandelion')
})

// --------------------------------------------------------- farm measurement --

test('tall grass is measured in square meters and needs maturity', () => {
  // 0.58 spacing -> 0.3364 m2 per vertex. 4x4 = 16 cells.
  const full = measureTallGrass(lawn(1))
  assert.ok(Math.abs(full - 16 * 0.58 * 0.58) < 0.01, `expected ~5.38, got ${full}`)

  // Half-grown is not tall grass.
  assert.equal(measureTallGrass(lawn(0.5)), 0)

  // Painted but not grown tall yet is also not tall grass.
  const paintedOnly = lawn(1, 4, 4, 0.2)
  assert.equal(measureTallGrass(paintedOnly), 0)

  // A patch that straddles the threshold counts only the mature part.
  const mixed = lawn(1, 4, 4, (index) => (index < 8 ? 0.9 : 0.3))
  const partial = measureTallGrass(mixed)
  assert.ok(partial > 0 && partial < full, `expected a partial area, got ${partial} of ${full}`)
  assert.equal(DEFAULT_MATURITY, 0.75)
})

test('water measures visibly filled pond cells, never empty holes', () => {
  const terrain = flatTerrain()
  // A deep, empty 2x2 excavation is still dry and cannot satisfy a water need.
  for (let z = 4; z < 6; z += 1) {
    for (let x = 4; x < 6; x += 1) terrain.heights[z * terrain.cols + x] = -1
  }
  assert.equal(measureWater(null), 0, 'dug terrain without simulated water is dry')
  assert.equal(measureFarmState(lawn(0), terrain, null).waterArea, 0,
    'a deep empty excavation contributes no pond surface')
  assert.equal(measureWater({ cellSize: 0.55, visibleWetCells: 0 }), 0)
  assert.equal(requirementMet(getSpeciesConditions('duck')[2].requirement, snapshot({ ...EMPTY_FARM, waterArea: measureWater(null) })), false,
    'a dry excavation leaves the duck waiting for a pond')

  // Only actual, rendered water contributes pond surface area.
  const area = measureWater({ cellSize: 0.55, visibleWetCells: 40 })
  assert.ok(Math.abs(area - 40 * 0.55 * 0.55) < 0.01, `expected ~12.1, got ${area}`)
  assert.equal(requirementMet(getSpeciesConditions('duck')[2].requirement, snapshot({ ...EMPTY_FARM, waterArea: area })), true,
    'a filled pond with enough visible surface satisfies the duck')
})

test('journal metric labels describe the revealed habitat without exposing hidden needs', () => {
  const watched = ['cow', 'duck', 'sheep', 'frog']
  const progress = createAnimalProgress(watched)
  for (const species of watched) progress.discover(species)
  progress.tick(snapshot(EMPTY_FARM), 1 / 30)
  for (const species of watched) {
    const rows = progress.statusOf(species)
    assert.equal(rows[2].revealed, false)
    assert.equal(rows[2].metricLabel, null, `${species} habitat stays hidden`)
  }

  for (const species of watched) progress.setStage(species, 2)
  progress.tick(snapshot(EMPTY_FARM), 1 / 30)
  assert.equal(progress.statusOf('cow')[2].metricLabel, 'Mature tall grass')
  assert.equal(progress.statusOf('duck')[2].metricLabel, 'Visible pond water')
  assert.equal(progress.statusOf('sheep')[2].metricLabel, 'Level grassy pasture')
  assert.equal(progress.statusOf('frog')[2].metricLabel, 'Lily pads in the pond')
})

test('a plant count is not measured in square meters', () => {
  // The journal writes the unit beside the bar, and "5.0 / 2 m²" of lily pads
  // is the kind of thing that ships because nobody looked at the page.
  const frog = getSpeciesConditions('frog')
  for (const stage of frog.slice(2)) {
    assert.equal(conditionMetricUnit(stage.requirement), '', 'a count of plants takes no unit')
    assert.equal(formatConditionMetric(stage.requirement, 5), '5', 'and it is written as a whole number')
  }
  const duck = getSpeciesConditions('duck')
  for (const stage of duck.slice(2)) {
    assert.equal(conditionMetricUnit(stage.requirement), ' m²', 'an area keeps its square meters')
    assert.equal(formatConditionMetric(stage.requirement, 12.34), '12.3')
  }
  assert.equal(conditionMetricUnit(null), ' m²', 'a stage with no requirement is not a plant count')
})

test('the journal shows a live lily count against what the frog wants', () => {
  // Zero delays isolate the lily condition from the pause an animal takes
  // before committing, which is covered by its own tests.
  const progress = createAnimalProgress(['frog'], { visitDelaySeconds: 0, enterFarmSeconds: 0 })
  progress.setStage('frog', 2)
  progress.tick(snapshot({ ...EMPTY_FARM, plantCounts: { 'water-lily': 1 } }), 1 / 30)
  const row = progress.statusOf('frog')[2]
  assert.equal(row.metricLabel, 'Lily pads in the pond')
  assert.equal(row.current, 1, 'one pad so far')
  assert.equal(row.target, 2)
  assert.equal(row.met, false)
  assert.equal(progress.progressOf('frog').stage, 2, 'one pad is not enough to move it')

  progress.tick(snapshot({ ...EMPTY_FARM, plantCounts: { 'water-lily': 2 } }), 1 / 30)
  assert.equal(progress.progressOf('frog').stage, 3, 'two grown pads call the frog home')
  assert.equal(progress.statusOf('frog')[2].met, true)
})

test('flat ground means grassy flat ground, not bare dirt', () => {
  const terrain = flatTerrain(20, 20)
  // Bare soil is not pasture, however level it is.
  assert.equal(measureFlatGrassArea(lawn(0, 20, 20), terrain), 0)

  // Full grass on level ground is.
  const full = measureFlatGrassArea(lawn(1, 20, 20), terrain)
  assert.ok(Math.abs(full - 400 * 0.58 * 0.58) < 0.5, `expected the whole grid, got ${full}`)

  // A hole in the middle stops counting: the dug ground is underwater and its
  // grassed neighbours now have a bank towering over them. The lawn grid
  // (0.58m) and the height grid (0.55m) do not align exactly, so dig a 3x3
  // pond rather than one cell, which is what a player would actually make.
  for (let z = 9; z < 12; z += 1) {
    for (let x = 9; x < 12; x += 1) terrain.heights[z * 20 + x] = -1
  }
  const after = measureFlatGrassArea(lawn(1, 20, 20), terrain)
  assert.ok(after < full, `digging should reduce flat pasture (${after} of ${full})`)
  assert.ok(after > full - 40, 'only the pond neighbourhood should be lost')
})

test('a fresh plot satisfies no area condition on its own', () => {
  // The regression that made the sheep settle for free: a brand new plot is
  // perfectly flat, so a bare-dirt condition would pass instantly.
  const terrain = flatTerrain()
  const fresh = measureFlatGrassArea(lawn(0, 20, 20), terrain)
  assert.equal(fresh, 0)
  assert.equal(requirementMet(getSpeciesConditions('sheep')[2].requirement, snapshot(EMPTY_FARM)), false)
})

// ------------------------------------------------------------- progression --

/** Run the clock forward without the farm changing. */
function tickFor(progress, farm, seconds, step = 1 / 30) {
  const events = []
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    events.push(...progress.tick(farm, step))
  }
  return events
}

test('a fresh plot leaves every species at the carnival and nothing further', () => {
  const progress = createAnimalProgress(SPECIES, { deltaSeconds: 1 / 30 })
  for (const species of startingCarnivalSpecies(SPECIES)) progress.discover(species)
  for (const species of ['pig', 'goose']) assert.equal(progress.progressOf(species).stage, 0)

  const events = tickFor(progress, snapshot(EMPTY_FARM), 20)
  // Stage 1 -> 2 happens after the visit delay even on bare soil, because
  // visiting the farm asks nothing of the player.
  assert.ok(events.some((event) => event.kind === 'enterFarm' && event.species === 'cow'))
  for (const species of startingCarnivalSpecies(SPECIES)) {
    assert.equal(progress.progressOf(species).stage, 2, `${species} should be visiting`)
  }
  // Nobody settles on an empty plot.
  for (const species of SPECIES) assert.ok(progress.progressOf(species).stage < 3, `${species} should not be a resident`)
})

test('visiting the farm and calling it home are separate beats', () => {
  // Stage 1 -> 2 is on a timer, because it asks nothing of the player. Stage
  // 2 -> 3 waits on the land. They must not collapse into one step.
  const progress = createAnimalProgress(['cow'], { deltaSeconds: 1 / 30 })
  progress.discover('cow')

  // Not yet: the visit delay has not elapsed.
  progress.tick(snapshot(EMPTY_FARM), 1/30)
  assert.equal(progress.progressOf('cow').stage, 1)

  tickFor(progress, snapshot(EMPTY_FARM), 3)
  assert.equal(progress.progressOf('cow').stage, 1, 'still lingering at the carnival')

  tickFor(progress, snapshot(EMPTY_FARM), 3)
  assert.equal(progress.progressOf('cow').stage, 2, 'now visiting the farm')
})

test('the cow settles once 15 m2 of tall grass exists, and loves the farm at 30', () => {
  const progress = createAnimalProgress(SPECIES, { enterFarmSeconds: 0 })
  progress.discover('cow')
  progress.setStage('cow', 2)

  assert.equal(requirementMet(getSpeciesConditions('cow')[2].requirement, snapshot({ ...EMPTY_FARM, tallGrassArea: 14.9 })), false)
  assert.equal(requirementMet(getSpeciesConditions('cow')[2].requirement, snapshot({ ...EMPTY_FARM, tallGrassArea: 15 })), true)

  const settle = progress.tick(snapshot({ ...EMPTY_FARM, tallGrassArea: 16 }), 1/30).filter((event) => event.species === 'cow')
  assert.deepEqual(settle.map((event) => event.kind), ['settle'])
  assert.equal(progress.progressOf('cow').stage, 3)
  assert.equal(progress.progressOf('cow').appearance, 'standard')
  assert.equal(progress.progressOf('cow').heartEyes, false)

  // A bigger meadow is not enough on its own: calves need a small barn.
  const noBarn = progress.tick(snapshot({ ...EMPTY_FARM, tallGrassArea: 31 }), 1/30).filter((event) => event.species === 'cow')
  assert.deepEqual(noBarn, [])
  assert.equal(progress.progressOf('cow').stage, 3)
  const love = progress.tick(snapshot({ ...EMPTY_FARM, tallGrassArea: 31, propCounts: { barn: 1 } }), 1/30).filter((event) => event.species === 'cow')
  assert.deepEqual(love.map((event) => event.kind), ['fallInLove'])
  assert.equal(progress.progressOf('cow').stage, 4)
  assert.equal(progress.progressOf('cow').heartEyes, true)
})

test('the pig cannot settle until a cow is a resident', () => {
  const progress = createAnimalProgress(SPECIES, { enterFarmSeconds: 0 })
  progress.setStage('pig', 2)

  // Plenty of grass, but no cow: the pig stays a visitor.
  const noCow = snapshot({ ...EMPTY_FARM, tallGrassArea: 40 })
  assert.deepEqual(progress.tick(noCow, 1/30), [])
  assert.equal(progress.progressOf('pig').stage, 2)

  // The cow settles; now the pig's condition is met. The resident set is part
  // of the snapshot the scene hands in each tick, so it has to be rebuilt from
  // progress — that is what makeFarmSnapshot is for. The cow itself also
  // qualifies for its next rung on this plot (40 m2 of grass clears 30), and
  // the grass draws the goose over as well, so the whole tick is busy. Only
  // the pig's own settle is asserted here.
  progress.setStage('cow', 3)
  const events = progress.tick(makeFarmSnapshot(noCow.state, progress), 1/30)
  const pigEvents = events.filter((event) => event.species === 'pig' && event.stage === 3)
  assert.deepEqual(pigEvents.map((event) => event.kind), ['settle'])
  assert.equal(progress.progressOf('pig').stage, 3)
})

test('requirements stay hidden until the previous condition is reached', () => {
  const progress = createAnimalProgress(['cow'], { enterFarmSeconds: 0 })
  const fresh = progress.statusOf('cow')
  assert.deepEqual(fresh.map((status) => status.revealed), [true, false, false, false])
  assert.equal(fresh[3].target, null, 'a hidden requirement reports no target')

  progress.discover('cow')
  const visited = progress.statusOf('cow')
  assert.deepEqual(visited.map((status) => status.revealed), [true, true, false, false])

  progress.setStage('cow', 2)
  progress.tick(snapshot(EMPTY_FARM), 1/30)
  const farmed = progress.statusOf('cow')
  assert.deepEqual(farmed.map((status) => status.revealed), [true, true, true, false])
  // Now the cow's grass requirement is visible, with live numbers.
  assert.equal(farmed[2].target, 15)
  assert.equal(typeof farmed[2].current, 'number')
})

test('a species nobody has seen is still findable', () => {
  // The pig and the goose do not start at the carnival. If nothing could ever
  // move them off stage 0 their conditions would be unsatisfiable, which is
  // just a hidden requirement with extra steps.
  const progress = createAnimalProgress(SPECIES, { visitDelaySeconds: 0, enterFarmSeconds: 0 })
  assert.equal(progress.progressOf('pig').stage, 0)
  assert.equal(progress.progressOf('goose').stage, 0)

  // Bare soil reveals nobody.
  assert.deepEqual(progress.tick(snapshot(EMPTY_FARM), 1/30), [])

  // A little grass draws the pig over; a little water draws the goose.
  const withGrass = progress.tick(snapshot({ ...EMPTY_FARM, tallGrassArea: 9 }), 1/30)
    .filter((event) => event.kind === 'arriveCarnival')
  assert.deepEqual(withGrass.map((event) => event.species), ['pig'])
  assert.equal(withGrass[0].discovered, true, 'a discovered arrival is flagged as earned')  // A little water draws the frog over alongside the goose (catalog order).
  const withWater = progress.tick(snapshot({ ...EMPTY_FARM, waterArea: 6 }), 1 / 30)
    .filter((event) => event.kind === 'arriveCarnival')
  assert.deepEqual(withWater.map((event) => event.species), ['goose', 'frog'])
})

test('the journal reports a live progress bar against the target', () => {
  const progress = createAnimalProgress(['cow'], { enterFarmSeconds: 0 })
  progress.discover('cow')
  progress.setStage('cow', 2)
  progress.tick(snapshot({ ...EMPTY_FARM, tallGrassArea: 12.4 }), 1/30)
  const [callingHome] = progress.statusOf('cow').slice(2)
  assert.equal(callingHome.target, 15)
  assert.equal(callingHome.current, 12.4)
  assert.equal(callingHome.met, false)
})

test('a requirement already met is reported as met, not as unknown', () => {
  const progress = createAnimalProgress(['cow'], { enterFarmSeconds: 0 })
  progress.discover('cow')
  progress.setStage('cow', 2)
  progress.tick(snapshot({ ...EMPTY_FARM, tallGrassArea: 20 }), 1/30)
  const statuses = progress.statusOf('cow')
  assert.equal(statuses[2].met, true, 'the reached condition reads as met')
})

test('stages only ever move forward, one rung at a time', () => {
  const progress = createAnimalProgress(['cow'], { deltaSeconds: 1 / 30 })
  const events = progress.setStage('cow', 4)
  // One event per rung, so a debug jump still plays the whole arc.
  assert.deepEqual(events.map((event) => event.stage), [1, 2, 3, 4])
  assert.deepEqual(events.map((event) => event.kind), ['arriveCarnival', 'enterFarm', 'settle', 'fallInLove'])
  // Already there: nothing to do.
  assert.deepEqual(progress.setStage('cow', 4), [])
  assert.deepEqual(progress.setStage('cow', 2), [])
})

test('the farm snapshot derives residents from the progress itself', () => {
  const progress = createAnimalProgress(['cow', 'pig'], { deltaSeconds: 1 / 30 })
  assert.equal(makeFarmSnapshot(EMPTY_FARM, progress).residentSpecies.size, 0)
  progress.setStage('cow', 3)
  const farm = makeFarmSnapshot(EMPTY_FARM, progress)
  assert.deepEqual([...farm.residentSpecies], ['cow'])
  // And that is enough to satisfy a dependent species.
  assert.equal(requirementMet({ kind: 'residentSpecies', species: 'cow' }, farm), true)
  assert.equal(requirementMet({ kind: 'residentSpecies', species: 'goose' }, farm), false)
})

test('an unknown species still has a usable four-step ladder', () => {
  const stages = getSpeciesConditions('newcomer')
  assert.equal(stages.length, 4)
  assert.deepEqual(stages.map((stage) => stage.stage), [1, 2, 3, 4])
})

test('heart eyes are a reversible state, not a one-way door', () => {
  // The stage machine can demote a species to replay its reveal, so putting the
  // hearts on has to be undoable. Leaving the bookkeeping behind kept the hearts
  // off the face while still reporting them, so the debug report claimed a
  // species was breeding when it was not.
  const progress = createAnimalProgress(['cow'], { enterFarmSeconds: 0 })
  progress.setStage('cow', 4)
  assert.equal(stageHasHeartEyes(progress.progressOf('cow').stage), true)

  progress.setStage('cow', 0)
  assert.equal(progress.progressOf('cow').stage, 0)
  assert.equal(stageHasHeartEyes(progress.progressOf('cow').stage), false)

  // And back again, so the round trip is safe to repeat.
  progress.setStage('cow', 4)
  assert.equal(stageHasHeartEyes(progress.progressOf('cow').stage), true)
  progress.reset()
  assert.equal(progress.progressOf('cow').stage, 0)
  assert.equal(progress.progressOf('cow').heartEyes, false)
})

test('a naive, direct progression run reaches the full four-step arc', () => {
  // The whole loop end to end, the way the game actually plays it.
  const progress = createAnimalProgress(SPECIES, { visitDelaySeconds: 0, enterFarmSeconds: 0 })
  const seen = []
  // The starters are already at the carnival on frame one, so their arrival is
  // part of the arc too.
  for (const species of startingCarnivalSpecies(SPECIES)) {
    seen.push(...progress.discover(species).map((event) => `${event.species}:${event.kind}`))
  }

  let farm = snapshot(EMPTY_FARM)
  for (let step = 0; step < 400; step += 1) {
    // Sow grass, dig a pond, then plant and grow lily pads, as a player would.
    const state = {
      tallGrassArea: Math.min(40, step * 0.5),
      waterArea: Math.min(25, step * 0.5),
      flatGrassArea: Math.min(40, step * 0.5),
      plantCounts: {
        'water-lily': Math.min(4, Math.floor(step / 40)),
        clover: Math.min(4, Math.floor(step / 40)),
        dandelion: Math.min(4, Math.floor(step / 40)),
      },
      propCounts: { barn: step > 100 ? 1 : 0, coop: step > 100 ? 2 : 0 },
    }
    farm = makeFarmSnapshot(state, progress)
    seen.push(...progress.tick(farm, step).map((event) => `${event.species}:${event.kind}`))
  }

  // Every starter species made it to a heart-eyed, breeding-ready animal.
  for (const species of ['cow', 'sheep', 'chicken', 'duck']) {
    assert.equal(progress.progressOf(species).stage, 4, `${species} should love the farm`)
    assert.equal(progress.progressOf(species).heartEyes, true)
  }
  // The pig joined once the cow was a resident.
  assert.equal(progress.progressOf('pig').stage, 4)
  // The goose was drawn over by the pond and climbed the same arc.
  assert.equal(progress.progressOf('goose').stage, 4)
  // The frog climbed its own arc, on lily pads rather than on open water.
  assert.equal(progress.progressOf('frog').stage, 4)
  assert.deepEqual(
    seen.filter((entry) => entry.startsWith('frog:')),
    ['frog:arriveCarnival', 'frog:enterFarm', 'frog:settle', 'frog:fallInLove'],
  )
  // And the arc happened in the right order for every animal.
  const cowEvents = seen.filter((entry) => entry.startsWith('cow:'))
  assert.deepEqual(cowEvents, ['cow:arriveCarnival', 'cow:enterFarm', 'cow:settle', 'cow:fallInLove'])
  // The pig was discovered late and needed the cow to be there first.
  const pigEvents = seen.filter((entry) => entry.startsWith('pig:'))
  assert.deepEqual(pigEvents, ['pig:arriveCarnival', 'pig:enterFarm', 'pig:settle', 'pig:fallInLove'])
  assert.ok(
    seen.indexOf('cow:settle') < seen.indexOf('pig:settle'),
    'the cow must settle before the pig can',
  )
})

test('the grid pitch is not read off the rounded corner', () => {
  // The lawn is a rounded rectangle, so the first row is the corner bevel and
  // its steps are short. Taking vertices 0 and 1 as the pitch under-reported
  // every area by ~4x, which would have quietly halved the cow's 15 m2 and
  // let a third of the lawn settle it.
  const rounded = lawn(1, 12, 12)
  const xs = rounded.xs
  // Overwrite the first few x values with a tight bevel, as the mesh really is.
  xs[1] = xs[0] + 0.241
  const bevel = measureTallGrass(rounded)
  const straight = measureTallGrass(lawn(1, 12, 12))
  assert.equal(bevel, straight, 'a corner bevel must not change the measured area')
})

test('the measured lawn the tools already maintain converts to the cow threshold', () => {
  // 15 m2 at the lawn's 0.58 vertex spacing is 45 vertices of full grass.
  const cellsNeeded = 15 / (0.58 * 0.58)
  assert.ok(Math.abs(cellsNeeded - 44.6) < 0.2, `expected ~45 cells, got ${cellsNeeded}`)
  const fortyFive = measureTallGrass(lawn(1, 7, 7))
  assert.ok(fortyFive >= 15, `7x7 full lawn (${fortyFive} m2) should clear the cow threshold`)
})

test('a half-grown lawn does not clear the cow threshold early', () => {
  // The maturity gate is what stops a fresh sweep of the seeder from settling
  // the cow before the grass has actually grown up.
  const halfGrown = measureTallGrass(lawn(0.9, 20, 20, 0.4), DEFAULT_MATURITY)
  assert.equal(halfGrown, 0, 'painted but still short is not tall grass')
  const fullGrown = measureTallGrass(lawn(1, 20, 20, 1), DEFAULT_MATURITY)
  assert.ok(fullGrown > 0)
})
