import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

// Pure helpers pulled out of main.ts. They bundle like the other tests do, so
// the test runs the same TypeScript the game ships.
async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const { tourSubjectsOf } = await load('src/scene/tour-subjects.ts')
const { animalDisplayName, plantDisplayName } = await load('src/game/display-names.ts')

test('the camera tour is given every live animal, rounded to millimetres', () => {
  const animals = [
    { id: 'cow', isSold: false, root: { visible: true, position: { x: 1.23456, y: 0.5, z: -2.00049 } } },
    { id: 'owl', isSold: true, root: { visible: true, position: { x: 9, y: 9, z: 9 } } },
    { id: 'goat', isSold: false, root: { visible: false, position: { x: 4, y: 0, z: 4 } } },
  ]
  assert.deepEqual(tourSubjectsOf(animals), [{ id: 'cow', x: 1.235, y: 0.5, z: -2 }])
})

test('the tour has no subjects when the farm is empty', () => {
  assert.deepEqual(tourSubjectsOf([]), [])
})

test('a known species shows its catalog name, and an unknown one falls back to its id', () => {
  assert.equal(animalDisplayName('definitely-not-an-animal'), 'definitely-not-an-animal')
  assert.equal(plantDisplayName('definitely-not-a-plant'), 'definitely-not-a-plant')
  assert.notEqual(animalDisplayName('cow'), 'cow', 'cow has a friendly catalog name')
})
