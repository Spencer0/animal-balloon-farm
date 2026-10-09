import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/animal-housing.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const housing = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { chooseOutdoorRoster, freeRoomFor, houseFor, houseAccepts, houseOccupancy, houseWithRoom, occupantsByHouse, HOUSE_SPECIES, OUTDOOR_LIMITS } = housing

const herd = (species, count, extra = {}) => Array.from({ length: count }, (_, index) => ({
  id: `${species}-${index + 1}`, species, canGoIndoors: false, pinned: false, ...extra,
}))

test('every species has exactly one house, and shared houses are the coop and barn', () => {
  for (const species of ['cow', 'sheep', 'chicken', 'duck', 'goose', 'pig', 'frog', 'owl', 'raccoon']) {
    assert.ok(houseFor(species), `${species} has a house`)
    assert.equal(Object.values(HOUSE_SPECIES).filter((list) => list.includes(species)).length, 1)
  }
  assert.equal(houseFor('duck'), 'coop')
  assert.equal(houseFor('chicken'), 'coop')
  assert.equal(houseFor('sheep'), 'barn')
  assert.equal(houseFor('goose'), 'goose-house')
  assert.equal(houseAccepts('coop', 'goose'), false)
})

test('the defaults are 5 per species and 40 in total outdoors', () => {
  assert.equal(OUTDOOR_LIMITS.perSpecies, 5)
  assert.equal(OUTDOOR_LIMITS.total, 40)
})

test('houses are shared space: the nearest one with room, counting animals already walking in', () => {
  const houses = [{ id: 'barn-1', prop: 'barn', x: 0, z: 0 }, { id: 'barn-2', prop: 'barn', x: 20, z: 0 }, { id: 'coop-1', prop: 'coop', x: 1, z: 0 }]
  const inside = [{ id: 'a', species: 'cow', insideId: 'barn-1' }, { id: 'b', species: 'sheep', insideId: 'barn-1' }]
  const used = occupantsByHouse(inside, new Map([['barn-1', 1]]))
  assert.equal(used.get('barn-1'), 3)
  assert.equal(houseWithRoom('cow', houses, used, 10, { x: 2, z: 0 }).id, 'barn-1', 'nearest with room')
  assert.equal(houseWithRoom('cow', houses, used, 3, { x: 2, z: 0 }).id, 'barn-2', 'the near barn is full')
  assert.equal(houseWithRoom('goose', houses, used, 10), null)
  assert.equal(freeRoomFor('sheep', houses, used, 10), 17)
})

test('the roster never puts more than 5 of a species or 40 in total outside', () => {
  const species = ['cow', 'sheep', 'pig', 'chicken', 'duck', 'goose', 'frog', 'owl', 'raccoon', 'dog']
  const animals = species.flatMap((name) => herd(name, 12, { canGoIndoors: true }))
  const outside = chooseOutdoorRoster({ animals, night: true, timeSeconds: 0 })
  assert.ok(outside.size <= 40)
  for (const name of species) {
    assert.ok([...outside].filter((id) => id.startsWith(`${name}-`)).length <= 5, name)
  }
})

test('pinned animals and animals that cannot go indoors go outside first', () => {
  const animals = [
    ...herd('cow', 8, { canGoIndoors: true }),
    { id: 'cow-99', species: 'cow', canGoIndoors: false, pinned: false },
  ]
  animals[7] = { ...animals[7], pinned: true }
  const outside = chooseOutdoorRoster({ animals, night: false, timeSeconds: 0 })
  assert.ok(outside.has('cow-8'), 'pinned')
  assert.ok(outside.has('cow-99'), 'cannot go indoors')
  assert.equal(outside.size, 5)
})

test('housed animals rotate: a later slot swaps one in for another', () => {
  const animals = herd('cow', 8, { canGoIndoors: true })
  const first = chooseOutdoorRoster({ animals, night: false, timeSeconds: 0 })
  const later = chooseOutdoorRoster({ animals, night: false, timeSeconds: OUTDOOR_LIMITS.rotationSeconds })
  assert.equal(first.size, 5)
  assert.equal(later.size, 5)
  const swapped = [...later].filter((id) => !first.has(id))
  assert.equal(swapped.length, 1)
})

test('night animals go indoors by day; day animals stay out at night', () => {
  const owls = herd('owl', 3, { canGoIndoors: true })
  const cows = herd('cow', 3, { canGoIndoors: true })
  const day = chooseOutdoorRoster({ animals: [...owls, ...cows], night: false, timeSeconds: 0 })
  assert.equal([...day].filter((id) => id.startsWith('owl')).length, 0)
  assert.equal([...day].filter((id) => id.startsWith('cow')).length, 3)
  const night = chooseOutdoorRoster({ animals: [...owls, ...cows], night: true, timeSeconds: 0 })
  assert.equal([...night].filter((id) => id.startsWith('owl')).length, 3)
  assert.equal([...night].filter((id) => id.startsWith('cow')).length, 3, 'chickens must stay huntable at night')
})

test('houseOccupancy counts who is inside, by species', () => {
  const animals = [
    { id: 'c1', species: 'chicken', insideId: 'coop-1' },
    { id: 'c2', species: 'chicken', insideId: null },
    { id: 'd1', species: 'duck', insideId: 'coop-1' },
    { id: 'd2', species: 'duck', insideId: 'coop-2' },
  ]
  const report = houseOccupancy('coop-1', 'coop', animals)
  assert.equal(report.capacity, 10)
  assert.equal(report.used, 2)
  assert.deepEqual(report.species, [
    { species: 'chicken', inside: 1 },
    { species: 'duck', inside: 1 },
  ])
})
