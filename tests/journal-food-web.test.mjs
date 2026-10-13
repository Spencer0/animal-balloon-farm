import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const load = async (entry) => {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const web = await load('src/game/journal-food-web.ts')
const diet = await load('src/game/animal-diet.ts')

const names = { cow: 'Cow', sheep: 'Sheep', pig: 'Pig', owl: 'Owl', snake: 'Snake', chicken: 'Chicken', mouse: 'Mouse', rat: 'Rat', goose: 'Goose', duck: 'Duck' }
const nameOf = (id) => names[id] ?? id
const catalog = Object.keys(diet.DIETS)

test('a cow eats grass then feed, in plain words, with icons', () => {
  const block = web.dietBlock('cow', nameOf)
  assert.equal(block.eatsText, 'Grass, then feed sacks')
  assert.equal(block.appetiteText, 'Big eater: 1.5 meals a day')
  assert.deepEqual(block.foods.map((food) => food.icon), ['assets/goods/food-grass.png', 'assets/goods/food-feed.png'])
  assert.match(block.makes.text, /^Milk, kept in the barn\. One a day when full, half when just fed\.$/)
  assert.equal(block.huntText, null)
})

test('truffles name the oak, and a three-food diet reads in order', () => {
  assert.match(web.dietBlock('pig', nameOf).makes.text, /Only with an oak on the farm\./)
  assert.equal(web.dietBlock('goose', nameOf).eatsText, 'Pond weed, then grass, then feed sacks')
})

test('hunters get the catch line and no appetite; prey name their hunters', () => {
  const owl = web.dietBlock('owl', nameOf)
  assert.equal(owl.appetiteText, null)
  assert.match(owl.huntText, /One catch fills it for about a day/)
  assert.match(owl.huntText, /fed hunter leaves the flock be/)
  assert.equal(owl.foods[0].icon, null)
  assert.equal(web.dietBlock('chicken', nameOf).huntedByText, 'Hunted by: Owl')
  assert.equal(web.dietBlock('mouse', nameOf).huntedByText, 'Hunted by: Snake')
  assert.equal(web.dietBlock('cow', nameOf).huntedByText, null)
})

test('every species with a diet has a block, so a new one appears with no edit', () => {
  for (const species of Object.keys(diet.DIETS)) assert.ok(web.dietBlock(species, nameOf), species)
  assert.equal(web.dietBlock('unicorn', nameOf), null)
})

test('the herd line counts only residents and rungs that exist', () => {
  const herd = [
    ...Array.from({ length: 4 }, () => ({ species: 'cow', stage: 3, fullness: 1 })),
    { species: 'cow', stage: 3, fullness: 0.5 },
    { species: 'cow', stage: 4, fullness: 0.2 },
    { species: 'cow', stage: 2, fullness: 0 },
    { species: 'sheep', stage: 3, fullness: 0 },
  ]
  const line = web.herdLine('cow', herd, 'Cow')
  assert.equal(line.text, 'Your 6 cows: 4 full · 1 fed · 1 hungry')
  assert.match(line.hint, /^One is going hungry\./)
  assert.equal(web.herdLine('goose', herd, 'Goose'), null)
  assert.equal(web.herdLine('sheep', herd, 'Sheep').text, 'Your 1 sheep: 1 starving')
  assert.equal(web.herdLine('cow', [{ species: 'cow', stage: 3, fullness: 1 }], 'Cow').hint, null)
  assert.equal(web.pluralName('Mouse'), 'mice')
})

test('the food overview shows only discovered names and ??? for the rest', () => {
  const rows = web.foodOverview(catalog, new Set(['cow']), nameOf)
  const grass = rows.find((row) => row.food === 'grass')
  assert.equal(grass.icon, 'assets/goods/food-grass.png')
  assert.deepEqual(grass.eaters.find((eater) => eater.species === 'cow').name, 'Cow')
  assert.equal(grass.eaters.find((eater) => eater.species === 'sheep').name, null)
  assert.ok(!JSON.stringify(rows).includes('Sheep'))
  assert.ok(!rows.some((row) => row.food === 'prey'))
})

test('the hunt overview lists prey and keeps unmet species secret', () => {
  const rows = web.huntOverview(catalog, new Set(['owl']), nameOf)
  const owl = rows.find((row) => row.hunter.species === 'owl')
  assert.equal(owl.hunter.name, 'Owl')
  assert.deepEqual(owl.prey.map((p) => p.name), [null])
  const snake = rows.find((row) => row.hunter.species === 'snake')
  assert.equal(snake.hunter.name, null)
})

test('the goods list gives each good its maker and value', () => {
  const rows = web.goodsList(catalog, new Set(['cow', 'pig']), nameOf)
  const milk = rows.find((row) => row.good === 'milk')
  assert.equal(milk.valueText, '2 coins')
  assert.equal(milk.makers[0].name, 'Cow')
  assert.equal(rows.find((row) => row.good === 'egg').valueText, '1 coin')
  assert.equal(rows.find((row) => row.good === 'egg').makers[0].name, null)
  if (rows.some((row) => row.good === 'gem')) assert.equal(rows.find((row) => row.good === 'gem').valueText, 'Not sold')
})

test('the hunger ladder copy covers every rung in order', () => {
  assert.deepEqual(web.HUNGER_LADDER.map((rung) => rung.level), ['full', 'fed', 'hungry', 'starving'])
  assert.ok(web.HARMONY_PARTS.map((part) => part.name).join() === 'Variety,Balance,Fed,Links')
  for (const text of [...web.HUNGER_LADDER.map((r) => r.text), web.HUNGER_INTRO, web.HARMONY_INTRO]) {
    assert.ok(!/[\u{1F300}-\u{1FAFF}—]/u.test(text), text)
  }
})
