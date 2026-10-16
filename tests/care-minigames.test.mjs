import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const games = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createCareRound, CARE_GAME_RULES, CARE_GAME_COPY, CARE_GAME_KINDS, CARE_GAMES, careGameFor, lossLine } = games
const { outputFiles: catalogFiles } = await build({ entryPoints: ['src/game/plants.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { PLANT_CATALOG, PLANT_CARE_KINDS } = await import(`data:text/javascript;base64,${Buffer.from(catalogFiles[0].text).toString('base64')}`)

test('each plant type plays its own three games, one per chore', () => {
  assert.deepEqual(CARE_GAMES, {
    bush: { water: 'rain', pest: 'swat', prune: 'snip' },
    flower: { water: 'buzz', pest: 'hop', prune: 'chop' },
    water: { water: 'skim', pest: 'paddle', prune: 'rope' },
  })
  for (const type of Object.keys(CARE_GAMES)) {
    assert.deepEqual(Object.keys(CARE_GAMES[type]).sort(), [...PLANT_CARE_KINDS].sort(), type)
    assert.equal(new Set(Object.values(CARE_GAMES[type])).size, 3, `${type} has three different games`)
  }
})

test('every type and chore has a game, and each game is a kind with rules and copy', () => {
  const played = new Set()
  for (const type of Object.keys(CARE_GAMES)) for (const care of PLANT_CARE_KINDS) played.add(CARE_GAMES[type][care])
  assert.deepEqual([...played].sort(), [...CARE_GAME_KINDS].sort())
  for (const kind of CARE_GAME_KINDS) {
    assert.ok(CARE_GAME_RULES[kind].goal > 0 && CARE_GAME_RULES[kind].seconds > 0, kind)
    assert.ok(CARE_GAME_COPY[kind].command && CARE_GAME_COPY[kind].goalLine && CARE_GAME_COPY[kind].winLine && CARE_GAME_COPY[kind].chore, kind)
    assert.ok(lossLine(kind, 'time').length > 0, kind)
    assert.ok(lossLine(kind, 'forfeit').length > 0, kind)
  }
})

test('every species with minigames has a game for each chore its care list asks for', () => {
  for (const species of PLANT_CATALOG.filter((entry) => entry.minigames)) {
    for (const stop of species.care) {
      assert.ok(CARE_GAME_KINDS.includes(careGameFor(species.id, stop.kind)), `${species.id} ${stop.kind}`)
    }
  }
})

test('blueberry keeps the bush games exactly as before', () => {
  assert.equal(careGameFor('blueberry', 'water'), 'rain')
  assert.equal(careGameFor('blueberry', 'pest'), 'swat')
  assert.equal(careGameFor('blueberry', 'prune'), 'snip')
  assert.equal(CARE_GAME_COPY.swat.command, 'SWAT!')
  assert.equal(CARE_GAME_COPY.snip.command, 'SNIP!')
  assert.equal(CARE_GAME_COPY.rain.command, 'TAP!')
})

test('flower and water species play their own games', () => {
  assert.equal(careGameFor('poppy', 'water'), 'buzz')
  assert.equal(careGameFor('clover', 'pest'), 'hop')
  assert.equal(careGameFor('dandelion', 'prune'), 'chop')
  assert.equal(careGameFor('water-lily', 'water'), 'skim')
  assert.equal(careGameFor('water-lily', 'pest'), 'paddle')
  assert.equal(careGameFor('water-lily', 'prune'), 'rope')
  assert.equal(PLANT_CATALOG.find(({ id }) => id === 'poppy').careType, 'flower')
})

test('new games: the chop loses on a low score; the flapping bee loses on bonks', () => {
  const chop = createCareRound('chop')
  for (let stalk = 0; stalk < CARE_GAME_RULES.chop.goal; stalk += 1) chop.hit()
  assert.equal(chop.snapshot.state, 'won')
  const missed = createCareRound('chop')
  missed.fail('score')
  assert.equal(missed.snapshot.lossReason, 'score')
  assert.match(lossLine('chop', 'score'), /points/)
  const bee = createCareRound('buzz')
  bee.harm()
  bee.harm()
  assert.equal(bee.snapshot.lossReason, 'hearts')
  assert.match(lossLine('buzz', 'hearts'), /bonked/)
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

test('paddle: a run to the lily is decided on arrival, not when the goal is met', () => {
  const { goal, seconds, hearts } = CARE_GAME_RULES.paddle
  const fed = createCareRound('paddle')
  for (let snap = 0; snap < goal + 2; snap += 1) fed.hit()
  assert.equal(fed.snapshot.state, 'playing', 'the goal alone does not end the run')
  fed.tick(seconds - 0.1)
  assert.equal(fed.snapshot.state, 'playing')
  fed.tick(0.2)
  assert.equal(fed.snapshot.state, 'won')

  const hungry = createCareRound('paddle')
  for (let snap = 0; snap < goal - 1; snap += 1) hungry.hit()
  hungry.tick(seconds + 1)
  assert.equal(hungry.snapshot.state, 'lost')
  assert.equal(hungry.snapshot.lossReason, 'score')
  assert.match(lossLine('paddle', 'score'), /lily/)

  const knocked = createCareRound('paddle')
  for (let snap = 0; snap < goal; snap += 1) knocked.hit()
  for (let knock = 0; knock < hearts; knock += 1) knocked.harm()
  assert.equal(knocked.snapshot.state, 'lost', 'hearts still end the run early')
  assert.equal(knocked.snapshot.lossReason, 'hearts')
})
