import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const load = async (entry) => {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const diet = await load('src/game/animal-diet.ts')
const { createAnimalLife } = await load('src/game/animal-life.ts')

const DAY = 480
const quickConfig = {
  visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 1e9,
  breedIntervalSeconds: 60, babyDurationSeconds: 60,
  packSizes: {}, replacementCooldownSeconds: 1e9, groundsVisitorsBase: 0, groundsVisitorsPerLevel: 0,
}
const farmWith = (state = {}) => ({
  state: { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, propCounts: { barn: 3, coop: 1, oak: 1 }, ...state },
  residentSpecies: new Set(['cow', 'chicken']),
})
const barns = [{ id: 'barn-1', prop: 'barn', x: 0, z: 0 }, { id: 'barn-2', prop: 'barn', x: 5, z: 0 }, { id: 'barn-3', prop: 'barn', x: 10, z: 0 }]
const world = (state, houses = barns) => ({ farm: farmWith(state), expansionLevel: 0, houses })
const run = (life, snapshot, seconds, step = 1) => {
  const events = []
  for (let t = 0; t < seconds; t += step) events.push(...life.tick(snapshot, step))
  return events
}
const cows = (life) => life.all().filter((animal) => animal.species === 'cow' && animal.stage >= 3)

test('the hunger ladder: full, fed, hungry, starving', () => {
  assert.equal(diet.hungerLevel(1), 'full')
  assert.equal(diet.hungerLevel(0.7), 'full')
  assert.equal(diet.hungerLevel(0.5), 'fed')
  assert.equal(diet.hungerLevel(0.3), 'hungry')
  assert.equal(diet.hungerLevel(0.05), 'starving')
  assert.equal(diet.hungerLevel(Number.NaN), 'starving')
})

test('every food is a plain rate times what the farm measures', () => {
  const farm = farmWith({ tallGrassArea: 100, waterArea: 10, meadowArea: 20, plantCounts: { dandelion: 2, poppy: 1, 'water-lily': 2 }, propCounts: { 'garbage-can': 2 } }).state
  assert.equal(diet.foodSupply('grass', farm), 100 * diet.FOOD_YIELDS.grassPerSquareMeter)
  assert.equal(diet.foodSupply('seeds', farm), 3 * diet.FOOD_YIELDS.seedsPerFlower)
  assert.equal(diet.foodSupply('pondweed', farm), 10 * diet.FOOD_YIELDS.pondweedPerSquareMeter + 2 * diet.FOOD_YIELDS.pondweedPerLily)
  assert.equal(diet.foodSupply('scraps', farm), 2 * diet.FOOD_YIELDS.scrapsPerCan)
  assert.equal(diet.foodSupply('feed', farm), 0, 'feed is bought, never grown')
  assert.equal(diet.foodSupply('grass', farm, { grass: 2 }), 2 * diet.foodSupply('grass', farm), 'gem boosts multiply')
})

test('every species with a house has a diet', () => {
  for (const species of ['cow', 'sheep', 'goose', 'duck', 'chicken', 'pig', 'frog', 'mouse', 'rat', 'raccoon', 'mole', 'owl', 'snake']) {
    assert.ok(diet.DIETS[species], species)
  }
})

test('a well-fed resident stays full on a lush lawn', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  const cow = life.add('cow', 3)
  run(life, world({ tallGrassArea: 60 }), 3 * DAY)
  assert.equal(life.animal(cow.id).hunger, 'full')
  assert.equal(life.animal(cow.id).helium, 1)
})

test('a resident with nothing to eat goes hungry, then starves and goes flat', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  const cow = life.add('cow', 3)
  const events = run(life, world({ tallGrassArea: 0 }), 0.5 * DAY)
  assert.equal(life.animal(cow.id).hunger, 'fed')
  events.push(...run(life, world({ tallGrassArea: 0 }), 0.4 * DAY))
  assert.equal(life.animal(cow.id).hunger, 'starving')
  assert.ok(events.some((event) => event.kind === 'hunger' && event.hunger === 'hungry'))
  events.push(...run(life, world({ tallGrassArea: 0 }), 0.5 * DAY))
  assert.equal(life.animal(cow.id), undefined, 'popped')
  const flat = events.find((event) => event.kind === 'deflate')
  assert.equal(flat.reason, 'starved')
})

test('bought feed carries a herd through a bare spell, and a starving animal tops its helium back up once fed', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  const cow = life.add('cow', 3)
  life.setFullness(cow.id, 0.05)
  run(life, world({ tallGrassArea: 0 }), 30)
  assert.ok(life.animal(cow.id).helium < 1, 'leaking while starving')
  life.addFeed(20)
  run(life, world({ tallGrassArea: 0 }), 120)
  assert.equal(life.animal(cow.id).helium, 1)
  assert.notEqual(life.animal(cow.id).hunger, 'starving')
  const feed = life.foodReport().find((entry) => entry.food === 'feed')
  assert.ok(feed.stock < 20 && feed.stock > 15, `ate some feed: ${feed.stock}`)
})

test('a shortage lands on the newest mouths, not evenly on everyone', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  const herd = Array.from({ length: 6 }, () => life.add('cow', 3))
  // Grass for about three cows.
  run(life, world({ tallGrassArea: 3 * 1.5 / diet.FOOD_YIELDS.grassPerSquareMeter }), 2 * DAY)
  const oldest = life.animal(herd[0].id)
  assert.ok(oldest && ['full', 'fed'].includes(oldest.hunger), JSON.stringify(oldest))
  assert.equal(life.animal(herd[5].id), undefined, 'the newest cow went flat')
})

test('a hungry species stops breeding: a herd levels off at its food instead of filling every barn', () => {
  const grassFor = (count) => count * 1.5 / diet.FOOD_YIELDS.grassPerSquareMeter
  const lush = createAnimalLife(['cow'], { config: quickConfig })
  const lean = createAnimalLife(['cow'], { config: quickConfig })
  for (let index = 0; index < 2; index += 1) {
    lush.add('cow', 4)
    lean.add('cow', 4)
  }
  run(lush, world({ tallGrassArea: grassFor(40) }), 8 * DAY)
  run(lean, world({ tallGrassArea: grassFor(4) }), 8 * DAY)
  assert.ok(cows(lush).length >= 12, `lush herd grew: ${cows(lush).length}`)
  assert.ok(cows(lean).length <= 6, `lean herd levelled off: ${cows(lean).length}`)
  assert.ok(cows(lean).length >= 3, `lean herd still holds its food's worth: ${cows(lean).length}`)
})

test('well-fed residents make goods into their house, and the farmer collects them', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  life.add('cow', 3)
  life.add('cow', 3)
  const events = run(life, world({ tallGrassArea: 60 }, [barns[0]]), 1.2 * DAY)
  assert.ok(events.some((event) => event.kind === 'produce' && event.good === 'milk' && event.houseId === 'barn-1'))
  const milk = life.goodsIn('barn-1').milk
  assert.equal(milk, 2, 'a bottle a cow a day')
  assert.deepEqual(life.collectGoods('barn-1'), [{ good: 'milk', count: milk }])
  assert.deepEqual(life.goodsIn('barn-1'), {})
})

test('hungry animals make nothing, and a full house lets goods spoil into scraps', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  const cow = life.add('cow', 3)
  life.setFullness(cow.id, 0.3)
  run(life, world({ tallGrassArea: 0 }), 0.2 * DAY)
  assert.deepEqual(life.goodsIn('barn-1'), {})

  const busy = createAnimalLife(['cow'], { config: quickConfig })
  for (let index = 0; index < 8; index += 1) busy.add('cow', 3)
  const scrapsBefore = 6
  run(busy, world({ tallGrassArea: 200 }, [barns[0]]), 3 * DAY)
  assert.equal(busy.goodsIn('barn-1').milk, diet.HOUSE_GOODS_CAPACITY)
  const scraps = busy.foodReport().find((entry) => entry.food === 'scraps')
  assert.ok(scraps.stock > scrapsBefore, `spoiled milk became slop: ${scraps.stock}`)
})

test('truffles need an oak on the farm', () => {
  const sty = [{ id: 'sty-1', prop: 'sty', x: 0, z: 0 }]
  const withOak = createAnimalLife(['pig'], { config: quickConfig })
  const without = createAnimalLife(['pig'], { config: quickConfig })
  withOak.add('pig', 3)
  without.add('pig', 3)
  withOak.addFeed(100)
  without.addFeed(100)
  run(withOak, world({ propCounts: { sty: 1, oak: 1 } }, sty), 3 * DAY)
  run(without, world({ propCounts: { sty: 1 } }, sty), 3 * DAY)
  assert.ok((withOak.goodsIn('sty-1').truffle ?? 0) >= 1)
  assert.equal(without.goodsIn('sty-1').truffle, undefined)
})

test('a fed predator lazes about; a hungry one hunts, and a catch fills it up', () => {
  const life = createAnimalLife(['snake'], { config: quickConfig })
  const visitor = life.add('snake', 2)
  assert.equal(life.wantsToHunt(visitor.id), true, 'a visitor hunts to earn its home')
  const snake = life.add('snake', 3)
  assert.equal(life.wantsToHunt(snake.id), false, 'just arrived, full')
  run(life, world({}), 0.5 * DAY)
  assert.equal(life.wantsToHunt(snake.id), true, 'hungry again by the afternoon')
  life.feedCatch(snake.id)
  assert.equal(life.wantsToHunt(snake.id), false)
  run(life, world({}), 3 * DAY)
  assert.equal(life.animal(snake.id), undefined, 'a predator that never catches anything goes flat')
})

test('fullness, larders and house goods survive a save', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  const cow = life.add('cow', 3)
  life.add('cow', 3)
  life.addFeed(30)
  run(life, world({ tallGrassArea: 60 }, [barns[0]]), 1.2 * DAY)
  life.setFullness(cow.id, 0.33)
  const saved = JSON.parse(JSON.stringify(life.exportState()))
  const milk = life.goodsIn('barn-1').milk
  assert.ok(milk > 0)

  const loaded = createAnimalLife(['cow'], { config: quickConfig })
  loaded.importState(saved)
  assert.equal(loaded.animal(cow.id).fullness, 0.33)
  // A new session's barn has a new id, standing where the old one stood.
  loaded.tick(world({ tallGrassArea: 60 }, [{ ...barns[0], id: 'barn-7' }]), 0.01)
  assert.equal(loaded.goodsIn('barn-7').milk, milk)
  const feed = loaded.foodReport().find((entry) => entry.food === 'feed')
  assert.ok(Math.abs(feed.stock - 30) < 0.01)
})

test('selling a house with goods inside spoils them into scraps', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  life.add('cow', 3)
  run(life, world({ tallGrassArea: 60 }, [barns[0]]), 2 * DAY)
  assert.ok(life.goodsIn('barn-1').milk > 0)
  life.tick(world({ tallGrassArea: 60 }, []), 0.01)
  assert.deepEqual(life.goodsIn('barn-1'), {})
})

const { measureHarmony, harmonyTier } = await load('src/game/harmony.ts')
const residents = (spec) => Object.entries(spec).flatMap(([species, count]) => Array.from({ length: count }, () => ({ species, fullness: 1 })))

test('harmony rewards a varied, even, fed farm over a big lopsided one', () => {
  const lopsided = measureHarmony(residents({ cow: 40, sheep: 2, chicken: 2 }))
  const balanced = measureHarmony(residents({ cow: 4, sheep: 4, chicken: 4, duck: 4, pig: 3, mouse: 4, snake: 1, owl: 1 }))
  assert.ok(balanced.score > lopsided.score + 20, `${balanced.score} vs ${lopsided.score}`)
  assert.equal(lopsided.crowding, 'cow')
  assert.equal(balanced.crowding, null)
  assert.deepEqual([...balanced.activeLinks].sort(), ['owl → chicken', 'snake → mouse'])
  assert.equal(harmonyTier(balanced.score), 'Flourishing')
})

test('a hungry farm loses harmony', () => {
  const fed = measureHarmony(residents({ cow: 4, sheep: 4, chicken: 4 }))
  const hungry = measureHarmony(residents({ cow: 4, sheep: 4, chicken: 4 }).map((entry) => ({ ...entry, fullness: 0.2 })))
  // Three species: fed counts at 3/5 of its 25 points.
  assert.equal(fed.score - hungry.score, 15)
  assert.equal(measureHarmony([]).score, 0)
})
