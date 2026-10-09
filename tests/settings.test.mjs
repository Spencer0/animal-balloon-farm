import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const { DEFAULT_SETTINGS, SETTINGS_KEY, parseSettings, createSettingsStore } = await load('src/game/settings.ts')
const { createFpsMeter, fpsTone } = await load('src/game/fps-meter.ts')

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), data }
}

test('the FPS counter is off by default', () => {
  assert.equal(DEFAULT_SETTINGS.showFps, false)
})

test('unreadable or wrongly typed saved settings fall back to defaults', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(parseSettings('not json'), DEFAULT_SETTINGS)
  assert.deepEqual(parseSettings('42'), DEFAULT_SETTINGS)
  assert.deepEqual(parseSettings('{"showFps":"yes"}'), DEFAULT_SETTINGS)
  assert.equal(parseSettings('{"showFps":true}').showFps, true)
})

test('a changed setting is saved, announced, and read back by a new store', () => {
  const storage = memoryStorage()
  const store = createSettingsStore(storage)
  const seen = []
  store.subscribe((settings) => seen.push(settings.showFps))
  store.set('showFps', true)
  store.set('showFps', true)
  assert.deepEqual(seen, [true], 'setting the same value again is not a change')
  assert.equal(JSON.parse(storage.data.get(SETTINGS_KEY)).showFps, true)
  assert.equal(createSettingsStore(storage).settings.showFps, true)
})

test('blocked storage still lets the setting work for the session', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  const store = createSettingsStore(blocked)
  assert.equal(store.settings.showFps, false)
  store.set('showFps', true)
  assert.equal(store.settings.showFps, true)
  assert.equal(createSettingsStore(null).settings.showFps, false)
})

test('the meter averages a window and reports the worst frame', () => {
  const meter = createFpsMeter(500)
  assert.equal(meter.frame(0), null)
  let reading = null
  // 60 fps with one 50 ms hitch.
  const times = []
  let now = 0
  let hitched = false
  while (now < 500) {
    const hitch = !hitched && now >= 200
    hitched ||= hitch
    now += hitch ? 50 : 16.667
    times.push(now)
  }
  for (const time of times) reading = meter.frame(time) ?? reading
  assert.ok(reading, 'a reading arrives once the window fills')
  assert.ok(reading.fps > 50 && reading.fps < 62, `fps ${reading.fps}`)
  assert.ok(reading.worstFrameMs >= 50)
})

test('reset drops the window so a hidden gap is not read as one slow frame', () => {
  const meter = createFpsMeter(500)
  meter.frame(0)
  meter.frame(100)
  meter.reset()
  assert.equal(meter.frame(60000), null)
  const reading = meter.frame(60500)
  assert.ok(reading.worstFrameMs <= 500)
})

test('tone follows the frame rate', () => {
  assert.equal(fpsTone(60), 'good')
  assert.equal(fpsTone(40), 'warn')
  assert.equal(fpsTone(12), 'bad')
})
