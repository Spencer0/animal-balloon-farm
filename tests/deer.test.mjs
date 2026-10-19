import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const conditions = await load('src/game/animal-conditions.ts')
const { requirementMet } = await load('src/game/animal-progress.ts')
const raid = await load('src/game/deer-raid.ts')
const props = await load('src/game/farm-props.ts')
const { houseFor, HOUSE_SPECIES } = await load('src/game/animal-housing.ts')
const { propUnlocked, PROP_UNLOCK_LEVEL } = await load('src/game/tool-unlocks.ts')
const { SHOP_UNLOCK_LEVEL } = await load('src/game/shop-construction.ts')
const { ANIMAL_SALE_PRICES } = await load('src/game/sales.ts')
const empty = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }
const farm = (extra = {}) => ({ state: { ...empty, ...extra }, residentSpecies: new Set(), night: false })

const plant = (instanceId, x, z, growth = 1) => ({ instanceId, species: 'carrot', x, z, growth, mature: growth >= 1, careNeeded: null })
/** Step one deer until `until` says stop or the clock runs out; returns every command. */
function run(state, at, plants, licks, seconds, { random = () => 0, eat = () => true, until = () => false } = {}) {
  const commands = []
  for (let t = 0; t < seconds; t += 0.1) {
    const command = raid.stepDeerRaider(state, { ...at, eligible: true }, plants, licks, 0.1, random, eat)
    commands.push(command)
    if (command.target && command.target.speedScale > 0) Object.assign(at, { x: command.target.x, z: command.target.z })
    if (until(command)) break
  }
  return commands
}

test('deer: a day animal lured by any two grown plants, settled by a salt lick, breeding in the barn', () => {
  assert.equal(conditions.isNightOnly('deer'), false)
  const lure = conditions.DISCOVERY.deer
  assert.equal(lure.kind, 'plantCount')
  assert.equal(lure.species, undefined, 'any plant, not one kind')
  assert.equal(requirementMet(lure, farm({ plantCounts: { carrot: 1 } })), false)
  assert.equal(requirementMet(lure, farm({ plantCounts: { carrot: 1, poppy: 1 } })), true)
  const stages = conditions.getSpeciesConditions('deer')
  assert.equal(stages.length, 4)
  assert.deepEqual(stages[1].requirement, { kind: 'plantCount', amount: 2 })
  assert.deepEqual(stages[2].requirement, { kind: 'propCount', species: 'salt-lick', amount: 1 })
  assert.equal(stages[3].requirement.species, 'barn')
  assert.deepEqual(stages[3].requirement.and, [{ kind: 'propCount', species: 'salt-lick', amount: 1 }])
  assert.equal(requirementMet(stages[2].requirement, farm({ propCounts: { 'salt-lick': 1 } })), true)
  assert.equal(requirementMet(stages[2].requirement, farm({ propCounts: {} })), false)
  assert.equal(conditions.conditionMetricLabel(stages[1].requirement), 'Grown garden plants')
  assert.equal(houseFor('deer'), 'barn')
  assert.ok(HOUSE_SPECIES.barn.includes('deer'))
  assert.equal(ANIMAL_SALE_PRICES.deer, 20)
})

test('salt lick: a cheap one-cell utility prop on the shop\'s first shelf, with its model and icon', () => {
  const lick = props.PROP_CATALOG['salt-lick']
  assert.ok(lick)
  assert.deepEqual(lick.footprint, { width: 1, depth: 1 })
  assert.equal(lick.blocking, true)
  assert.ok(lick.price <= 40, 'a chapter-one purse can afford it')
  assert.ok(props.PROP_ORDER.includes('salt-lick'))
  assert.equal(props.createPropInventory().count('salt-lick'), 0)
  // It is stocked the moment Pip's shop opens, since deer turn up in chapter 1.
  assert.equal(PROP_UNLOCK_LEVEL['salt-lick'], SHOP_UNLOCK_LEVEL)
  assert.equal(propUnlocked('salt-lick', SHOP_UNLOCK_LEVEL), true)
  for (const file of ['public/assets/props/salt-lick.glb', 'public/assets/props/prop-salt-lick.png']) assert.ok(readFileSync(file).length > 0, file)
})

test('deer GLB carries WALK, IDLE and EAT, each keying every rig node', () => {
  const glb = readFileSync('public/assets/animals/balloon-deer.glb')
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
  const clips = Object.fromEntries(json.animations.map((clip) => [clip.name.toUpperCase(), new Set(clip.channels.map((channel) => channel.target.node))]))
  for (const name of ['WALK', 'IDLE', 'EAT']) assert.ok(clips[name], name)
  assert.deepEqual([...clips.EAT].sort(), [...clips.WALK].sort())
  assert.deepEqual([...clips.IDLE].sort(), [...clips.WALK].sort())
})

test('a deer rests, walks to a random plant, eats it whole and rests again', () => {
  const garden = [plant(1, -3, 0), plant(2, 0, 0), plant(3, 3, 0), plant(4, 6, 0, 0.1)]
  const state = raid.createDeerRaider()
  const at = { x: 10, z: 0 }
  const eaten = []
  // random() = 0.5 picks the middle of the three edible plants: not the nearest one (3).
  const commands = run(state, at, garden, [], 40, { random: () => 0.5, eat: (id) => { eaten.push(id); return true }, until: (command) => command.ate !== null })
  const firstMove = commands.findIndex((command) => command.target)
  assert.ok(firstMove * 0.1 >= raid.DEER_FIRST_RAID_SECONDS - 0.2, 'it rests before the first raid')
  assert.deepEqual(eaten, [2])
  assert.equal(commands.at(-1).ate, 2)
  assert.ok(commands.some((command) => command.eating && !command.licking), 'head down at the plant before it goes')
  assert.equal(state.phase, 'rest')
  assert.ok(state.restFor >= raid.DEER_REST_SECONDS.min)
})

test('a deer never eats a seedling, and gives up on a plant someone else ate', () => {
  const state = raid.createDeerRaider()
  const commands = run(state, { x: 4, z: 0 }, [plant(1, 0, 0, 0.1)], [], 20)
  assert.ok(commands.every((command) => !command.target && command.ate === null))
  const garden = [plant(1, 0, 0)]
  const racer = raid.createDeerRaider()
  run(racer, { x: 5, z: 0 }, garden, [], 8, { until: () => racer.phase === 'approach' })
  assert.equal(racer.targetId, 1)
  const after = raid.stepDeerRaider(racer, { x: 3, z: 0, eligible: true }, [], [], 0.1, () => 0, () => true)
  assert.equal(after.target, null)
  assert.equal(racer.phase, 'rest')
})

test('a salt lick wins: the deer licks it instead of eating, even mid-bite, and goes back to raiding once it is gone', () => {
  const garden = [plant(1, 0, 0)]
  const state = raid.createDeerRaider()
  const at = { x: 1.5, z: 0 }
  let eats = 0
  // Head down at the plant, almost done...
  run(state, at, garden, [], 20, { until: () => state.phase === 'eat' })
  assert.equal(state.phase, 'eat')
  // ...when a lick is set out across the farm.
  const lick = { x: -6, z: 4 }
  const licking = run(state, at, garden, [lick], 60, { eat: () => { eats += 1; return true } })
  assert.equal(eats, 0, 'not one plant eaten while the lick stands')
  assert.ok(licking.some((command) => command.licking && command.face?.x === lick.x))
  assert.ok(Math.hypot(at.x - lick.x, at.z - lick.z) <= raid.SALT_LICK_REACH + 0.4, 'it walked over to the lick')
  assert.ok(licking.some((command) => !command.target && !command.licking), 'between licks it browses, but leaves the plants alone')
  // The lick is picked up: the raids start again after a rest.
  const back = run(state, at, garden, [], 80, { eat: () => { eats += 1; return true }, until: (command) => command.ate !== null })
  assert.equal(eats, 1)
  assert.equal(back.at(-1).ate, 1)
})

test('an ineligible deer (indoors, leaving, asleep) drops its target and does nothing', () => {
  const state = raid.createDeerRaider()
  run(state, { x: 5, z: 0 }, [plant(1, 0, 0)], [], 8, { until: () => state.phase === 'approach' })
  const command = raid.stepDeerRaider(state, { x: 4, z: 0, eligible: false }, [plant(1, 0, 0)], [], 0.1, () => 0, () => true)
  assert.deepEqual(command, { target: null, face: null, eating: false, licking: false, ate: null })
  assert.equal(state.phase, 'rest')
  assert.equal(state.targetId, null)
})
