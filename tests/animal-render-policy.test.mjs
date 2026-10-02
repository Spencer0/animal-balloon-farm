import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/animal-render-policy.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const policyModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { chooseDetailedAnimals } = policyModule

test('the detailed representation budget is a hard cap at every zoom', () => {
  const candidates = Array.from({ length: 1000 }, (_, index) => ({
    id: `animal-${index}`,
    projectedHeight: 1200 - index,
    distance: index,
    priority: 0,
    interactive: false,
  }))
  const selected = chooseDetailedAnimals(candidates)
  assert.equal(selected.size, 16)
  assert.ok(selected.has('animal-0'))
  assert.equal(selected.has('animal-16'), false)
})

test('in-progress interaction gets detail ahead of merely large crowd members', () => {
  const candidates = [
    { id: 'far-capture', projectedHeight: 14, distance: 100, priority: 100, interactive: true },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `close-${index}`,
      projectedHeight: 500 - index,
      distance: index,
      priority: 0,
      interactive: false,
    })),
  ]
  const selected = chooseDetailedAnimals(candidates)
  assert.ok(selected.has('far-capture'))
  assert.equal(selected.size, 16)
})

test('off-screen and sub-pixel candidates never become full-detail residents', () => {
  const selected = chooseDetailedAnimals([
    { id: 'tiny', projectedHeight: 8, distance: 2, priority: 0, interactive: false },
    { id: 'large', projectedHeight: 80, distance: 100, priority: 0, interactive: false },
  ])
  assert.deepEqual([...selected], ['large'])
})

test('results are stable when candidate input order changes', () => {
  const candidates = Array.from({ length: 30 }, (_, index) => ({
    id: `animal-${index}`,
    projectedHeight: index + 20,
    distance: 100 - index,
    priority: index % 3,
    interactive: index === 8,
  }))
  assert.deepEqual(
    [...chooseDetailedAnimals(candidates)],
    [...chooseDetailedAnimals([...candidates].reverse())],
  )
})
