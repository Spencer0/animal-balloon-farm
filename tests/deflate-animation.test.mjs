import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/deflate-animation.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const deflate = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('a deflating balloon sags flat, widens a little, then shrinks to nothing', () => {
  const start = deflate.deflateFrame(0)
  assert.equal(start.scaleY, 1)
  assert.equal(start.finished, false)
  const flat = deflate.deflateFrame(deflate.DEFLATE_HISS_SECONDS + 0.1)
  assert.ok(flat.scaleY < 0.12, `lying flat: ${flat.scaleY}`)
  assert.ok(flat.scaleX > 1.1, 'wider than it stood')
  const end = deflate.deflateFrame(deflate.DEFLATE_TOTAL_SECONDS + 0.01)
  assert.equal(end.finished, true)
  assert.equal(end.scaleX + end.scaleY + end.scaleZ, 0)
})

test('it only ever gets thinner, and no scale goes negative', () => {
  let last = Infinity
  for (let t = 0; t <= deflate.DEFLATE_TOTAL_SECONDS + 0.2; t += 0.05) {
    const frame = deflate.deflateFrame(t)
    assert.ok(frame.scaleY >= 0 && frame.scaleX >= 0 && frame.scaleZ >= 0)
    assert.ok(frame.scaleY <= last + 0.02, `rising at ${t}`)
    last = frame.scaleY
  }
})

test('a bad time is treated as the start', () => {
  assert.equal(deflate.deflateFrame(Number.NaN).scaleY, 1)
  assert.equal(deflate.deflateFrame(-3).finished, false)
})

test('air puffs show during the hiss, stay faint, and none are left at the end', () => {
  let seen = 0
  for (let index = 0; index < deflate.DEFLATE_PUFF_COUNT; index += 1) {
    for (let age = 0; age <= deflate.DEFLATE_TOTAL_SECONDS; age += 0.05) {
      const puff = deflate.puffState(index, age)
      if (puff.alpha > 0) seen += 1
      assert.ok(puff.alpha >= 0 && puff.alpha <= 0.6)
    }
    assert.equal(deflate.puffState(index, deflate.DEFLATE_TOTAL_SECONDS + 1).alpha, 0)
  }
  assert.ok(seen > 0, 'puffs do show')
})
