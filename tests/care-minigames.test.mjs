import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const games = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createCareRound, CARE_GAME_RULES, CARE_GAME_FOR, lossLine } = games

test('each chore opens its own game', () => {
  assert.deepEqual(CARE_GAME_FOR, { water: 'rain', pest: 'swat', prune: 'snip' })
})

test('rain: enough taps in time wins, the clock running out loses', () => {
  const won = createCareRound('rain')
  for (let tap = 0; tap < CARE_GAME_RULES.rain.goal; tap += 1) won.hit()
  assert.equal(won.snapshot.state, 'won')
  const lost = createCareRound('rain')
  lost.hit()
  lost.tick(CARE_GAME_RULES.rain.seconds + 0.1)
  assert.equal(lost.snapshot.state, 'lost')
  assert.equal(lost.snapshot.lossReason, 'time')
  assert.match(lossLine('rain', 'time'), /drifted/)
})

test('swat: three berries lost ends it, even mid-swarm', () => {
  const round = createCareRound('swat')
  round.hit()
  round.harm()
  round.harm()
  assert.equal(round.snapshot.state, 'playing')
  round.harm()
  assert.equal(round.snapshot.state, 'lost')
  assert.equal(round.snapshot.lossReason, 'hearts')
  round.hit()
  assert.equal(round.snapshot.hits, 1, 'a finished round ignores late hits')
})

test('swat: a beetle that eats and flies off still counts toward the end of the swarm', () => {
  const round = createCareRound('swat')
  for (let beetle = 0; beetle < CARE_GAME_RULES.swat.goal - 1; beetle += 1) round.hit()
  round.harm()
  round.release()
  assert.equal(round.snapshot.state, 'won')
  assert.equal(round.snapshot.hearts, CARE_GAME_RULES.swat.hearts - 1)
})

test('snip: dropped leaves and cut berries both lose; a clean run wins and streaks', () => {
  const dropped = createCareRound('snip')
  for (let leaf = 0; leaf < CARE_GAME_RULES.snip.misses; leaf += 1) dropped.miss()
  assert.equal(dropped.snapshot.lossReason, 'misses')
  const cut = createCareRound('snip')
  for (let berry = 0; berry < CARE_GAME_RULES.snip.hearts; berry += 1) cut.harm()
  assert.equal(cut.snapshot.lossReason, 'hearts')
  const clean = createCareRound('snip')
  clean.hit()
  clean.hit()
  clean.whiff()
  for (let leaf = 2; leaf < CARE_GAME_RULES.snip.goal; leaf += 1) clean.hit()
  assert.equal(clean.snapshot.state, 'won')
  assert.equal(clean.snapshot.bestStreak, CARE_GAME_RULES.snip.goal - 2)
})

test('forfeit loses at once and bad ticks are ignored', () => {
  const round = createCareRound('snip')
  round.tick(Number.NaN)
  round.tick(-4)
  assert.equal(round.snapshot.timeLeft, CARE_GAME_RULES.snip.seconds)
  round.forfeit()
  assert.equal(round.snapshot.lossReason, 'forfeit')
})
