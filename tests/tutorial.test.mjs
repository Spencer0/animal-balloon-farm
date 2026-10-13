import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/tutorial.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { tutorialStep, nudgeVisible, tutorialSeed, TUTORIAL_NUDGE_EVERY_SECONDS } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const base = { playable: true, shedOpen: false, shedTab: 'seeds', seedArmed: false, seedsHeld: 1, plantsStanding: 0, plantedBefore: false }

test('the trail walks shed, Seeds tab, seed, ground', () => {
  assert.equal(tutorialStep(base), 'open-shed')
  assert.equal(tutorialStep({ ...base, shedOpen: true, shedTab: 'props' }), 'seeds-tab')
  assert.equal(tutorialStep({ ...base, shedOpen: true }), 'pick-seed')
  assert.equal(tutorialStep({ ...base, seedArmed: true }), 'place-seed')
})

test('it ends for good once anything is planted', () => {
  assert.equal(tutorialStep({ ...base, plantsStanding: 1 }), 'done')
  assert.equal(tutorialStep({ ...base, plantedBefore: true }), 'done')
})

test('it stays quiet when the player cannot act or has no seeds', () => {
  assert.equal(tutorialStep({ ...base, playable: false }), 'done')
  assert.equal(tutorialStep({ ...base, seedsHeld: 0 }), 'done')
})

test('the nudge waits a beat, then repeats every ten seconds', () => {
  assert.equal(nudgeVisible(0), false)
  assert.equal(nudgeVisible(1.2), true)
  assert.equal(nudgeVisible(6), false)
  assert.equal(nudgeVisible(TUTORIAL_NUDGE_EVERY_SECONDS + 0.5), true)
  assert.equal(nudgeVisible(TUTORIAL_NUDGE_EVERY_SECONDS + 5), false)
})

test('the seed trail prefers the named plant, else the first held', () => {
  assert.equal(tutorialSeed(['poppy', 'clover'], ['blueberry', 'clover']), 'clover')
  assert.equal(tutorialSeed(['poppy', 'clover']), 'poppy')
  assert.equal(tutorialSeed([]), null)
})
