import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-chop.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const chop = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { outputFiles: roundFiles } = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const games = await import(`data:text/javascript;base64,${Buffer.from(roundFiles[0].text).toString('base64')}`)
const { createCareRound, CARE_GAME_RULES } = games

test('a tap grades by how far the band is from the blade line', () => {
  assert.equal(chop.gradeChop(0), 'perfect')
  assert.equal(chop.gradeChop(-chop.CHOP_PERFECT_BAND), 'perfect')
  assert.equal(chop.gradeChop(chop.CHOP_PERFECT_BAND + 0.001), 'good')
  assert.equal(chop.gradeChop(-chop.CHOP_GOOD_BAND), 'good')
  assert.equal(chop.gradeChop(chop.CHOP_GOOD_BAND + 0.001), 'miss')
  assert.equal(chop.gradeChop(-chop.CHOP_REACH), 'miss')
  assert.equal(chop.gradeChop(chop.CHOP_REACH + 0.01), 'whiff')
  assert.equal(chop.gradeChop(Number.NaN), 'whiff')
})

test('a PERFECT is worth more hits than a GOOD; a MISS and a whiff are worth none', () => {
  assert.equal(chop.hitsFor('perfect'), chop.CHOP_PERFECT_HITS)
  assert.ok(chop.hitsFor('perfect') > chop.hitsFor('good'))
  assert.equal(chop.hitsFor('good'), 1)
  assert.equal(chop.hitsFor('miss'), 0)
  assert.equal(chop.hitsFor('whiff'), 0)
})

test('a stalk that drops out of reach below the blades has fallen through', () => {
  assert.equal(chop.fellThrough(-chop.CHOP_REACH - 0.01), true)
  assert.equal(chop.fellThrough(-chop.CHOP_REACH), false)
  assert.equal(chop.fellThrough(0.5), false)
})

test('stalks fall faster and come more often as the round goes on, within limits', () => {
  for (let index = 1; index < 12; index += 1) {
    assert.ok(chop.chopFallSpeed(index) >= chop.chopFallSpeed(index - 1))
    assert.ok(chop.chopSpawnGap(index) <= chop.chopSpawnGap(index - 1))
  }
  assert.ok(chop.chopFallSpeed(0) < 1, 'the first stalk is gentle')
  assert.ok(chop.chopFallSpeed(99) <= 1.3)
  assert.ok(chop.chopSpawnGap(99) >= 1.9, 'a stalk is never rushed onto the blades')
})

test('fake-outs are rarer at the start and capped', () => {
  assert.ok(chop.chopFakeOutChance(0) < chop.chopFakeOutChance(5))
  for (let index = 0; index < 50; index += 1) {
    const chance = chop.chopFakeOutChance(index)
    assert.ok(chance >= 0 && chance <= 0.45)
  }
  // A fake-out stalls just outside GOOD, so a tap then is a MISS, not a free hit.
  assert.ok(chop.CHOP_FAKE_OUT_AT > chop.CHOP_GOOD_BAND)
})

test('the band is painted on the stalk between its low and high marks', () => {
  assert.equal(chop.chopBandHeight(0), chop.CHOP_BAND_LOW)
  assert.ok(Math.abs(chop.chopBandHeight(1) - chop.CHOP_BAND_HIGH) < 1e-9)
  assert.ok(chop.chopBandHeight(0.5) > chop.CHOP_BAND_LOW && chop.chopBandHeight(0.5) < chop.CHOP_BAND_HIGH)
  assert.equal(chop.chopBandHeight(-3), chop.CHOP_BAND_LOW)
})

test('six cuts can win the chop round, with the PERFECT rule', () => {
  const round = createCareRound('chop')
  for (let index = 0; index < CARE_GAME_RULES.chop.goal; index += 1) {
    if (round.snapshot.state !== 'playing') break
    for (let hits = 0; hits < chop.hitsFor('perfect'); hits += 1) round.hit()
  }
  assert.equal(round.snapshot.state, 'won')
})

test('two stalks left uncut lose the chop round', () => {
  const round = createCareRound('chop')
  round.miss()
  assert.equal(round.snapshot.state, 'playing')
  round.miss()
  assert.equal(round.snapshot.state, 'lost')
  assert.equal(round.snapshot.lossReason, 'misses')
})

test('the camera frames the playfield: wide enough on a phone, tall enough on a desktop', () => {
  const desktop = chop.chopViewHeight(16 / 9)
  const phone = chop.chopViewHeight(390 / 844)
  assert.equal(desktop, chop.CHOP_PLAY_HEIGHT)
  assert.ok(phone > desktop, 'a narrow window shows more height')
  // At any aspect the view shows the whole playfield width.
  for (const aspect of [0.4, 0.46, 0.75, 1, 1.33, 1.78, 2.4]) {
    const view = chop.chopViewHeight(aspect)
    assert.ok(view * aspect >= chop.CHOP_PLAY_WIDTH - 1e-9, `width at ${aspect}`)
    assert.ok(view >= chop.CHOP_PLAY_HEIGHT - 1e-9, `height at ${aspect}`)
    assert.ok(chop.chopViewTop(aspect) > chop.CHOP_PLAY_BOTTOM)
  }
})
