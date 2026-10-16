import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-chop.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const chop = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { outputFiles: roundFiles } = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const games = await import(`data:text/javascript;base64,${Buffer.from(roundFiles[0].text).toString('base64')}`)
const { createCareRound, CARE_GAME_RULES } = games

test('points peak on the line and fall off in a straight line to nothing', () => {
  assert.equal(chop.chopPoints(0), chop.CHOP_MAX_POINTS)
  assert.equal(chop.chopPoints(chop.CHOP_PERFECT_BAND), chop.CHOP_MAX_POINTS)
  let last = chop.CHOP_MAX_POINTS
  for (let distance = chop.CHOP_PERFECT_BAND; distance < chop.CHOP_SCORE_REACH; distance += 0.01) {
    const points = chop.chopPoints(distance)
    assert.ok(points <= last, `monotonic at ${distance}`)
    last = points
  }
  assert.equal(chop.chopPoints(chop.CHOP_SCORE_REACH), 0)
  assert.equal(chop.chopPoints(2), 0, 'cut far too early scores nothing')
  assert.equal(chop.chopPoints(Number.NaN), 0)
})

test('points are the same either side of the line', () => {
  for (const distance of [0.02, 0.1, 0.2, 0.35]) assert.equal(chop.chopPoints(distance), chop.chopPoints(-distance))
})

test('a cut is graded by its points; too early is EARLY', () => {
  assert.equal(chop.gradeChop(0), 'perfect')
  assert.equal(chop.gradeChop(0.15), 'good')
  assert.equal(chop.gradeChop(chop.CHOP_SCORE_REACH - 0.01), 'ok')
  assert.equal(chop.gradeChop(1), 'early')
  assert.equal(chop.gradeChop(-0.001), 'perfect')
})

test('a stalk that drops out of reach below the blades has fallen through', () => {
  assert.equal(chop.fellThrough(-chop.CHOP_SCORE_REACH), true)
  assert.equal(chop.fellThrough(-chop.CHOP_SCORE_REACH + 0.01), false)
  assert.equal(chop.fellThrough(0.5), false)
})

test('the pass mark is a good score, not the maximum and not a gimme', () => {
  assert.equal(chop.chopMaxScore(), chop.CHOP_ROUNDS * chop.CHOP_STALKS_PER_ROUND * chop.CHOP_MAX_POINTS)
  assert.ok(chop.chopPassScore() > chop.chopMaxScore() / 2)
  assert.ok(chop.chopPassScore() < chop.chopMaxScore())
  assert.equal(chop.chopPassed(chop.chopPassScore()), true)
  assert.equal(chop.chopPassed(chop.chopPassScore() - 1), false)
  assert.equal(chop.chopPassed(0), false)
})

test('gravity drops a stalk the height in the time, and later rounds hit the blades faster', () => {
  const height = 1.9
  for (let round = 0; round < chop.CHOP_ROUNDS; round += 1) {
    const seconds = chop.chopFallSeconds(round)
    const g = chop.chopGravity(height, seconds)
    assert.ok(Math.abs(0.5 * g * seconds * seconds - height) < 1e-9)
    assert.ok(Math.abs(g * seconds - chop.chopImpactSpeed(height, seconds)) < 1e-9)
    if (round > 0) assert.ok(chop.chopImpactSpeed(height, seconds) > chop.chopImpactSpeed(height, chop.chopFallSeconds(round - 1)))
  }
})

test('the band is painted on the stalk between its low and high marks', () => {
  assert.equal(chop.chopBandHeight(0), chop.CHOP_BAND_LOW)
  assert.ok(Math.abs(chop.chopBandHeight(1) - chop.CHOP_BAND_HIGH) < 1e-9)
  assert.ok(chop.chopBandHeight(0.5) > chop.CHOP_BAND_LOW && chop.chopBandHeight(0.5) < chop.CHOP_BAND_HIGH)
  assert.equal(chop.chopBandHeight(-3), chop.CHOP_BAND_LOW)
})

test('three rounds, one hit each, win the chop round on the rules side', () => {
  const round = createCareRound('chop')
  for (let index = 0; index < chop.CHOP_ROUNDS; index += 1) round.hit()
  assert.equal(CARE_GAME_RULES.chop.goal, chop.CHOP_ROUNDS)
  assert.equal(round.snapshot.state, 'won')
})

test('a score under the pass mark fails the chop round', () => {
  const round = createCareRound('chop')
  round.hit()
  round.fail('score')
  assert.equal(round.snapshot.state, 'lost')
  assert.equal(round.snapshot.lossReason, 'score')
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
