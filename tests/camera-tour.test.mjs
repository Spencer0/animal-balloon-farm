import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/camera-tour.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const tourModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createCameraTour, CAMERA_TOUR_VISTA_HEIGHT } = tourModule

const subject = (id, x, y = 0, z = 0) => ({ id, x, y, z })
const subjects = [subject('a', 0), subject('b', 6), subject('c', -8), subject('d', 12)]

/** Run a tour for `seconds` and collect every shot it reported. */
function run(tour, list, seconds, step = 1 / 30) {
  const shots = []
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    shots.push(tour.tick(step, list))
  }
  return shots
}

/** Collapse per-frame samples down to one entry per shot (or per subject swap). */
function shotBoundaries(shots) {
  const reduced = []
  for (const shot of shots) {
    const previous = reduced[reduced.length - 1]
    if (previous && previous.view === shot.view && (previous.subject?.id ?? null) === (shot.subject?.id ?? null)) continue
    reduced.push(shot)
  }
  return reduced
}

test('the same seed replays the same tour', () => {
  const first = run(createCameraTour(1234), subjects, 240)
  const second = run(createCameraTour(1234), subjects, 240)
  const describe = (shot) => ({
    view: shot.view,
    subject: shot.subject?.id ?? null,
    viewHeight: +shot.viewHeight.toFixed(4),
    orbitAngle: +shot.orbitAngle.toFixed(4),
    orbitSpeed: +shot.orbitSpeed.toFixed(4),
    seconds: +shot.seconds.toFixed(4),
    duration: +shot.duration.toFixed(4),
  })
  assert.deepEqual(first.map(describe), second.map(describe))
})

test('a tour opens on a wide vista and then alternates with animal close-ups', () => {
  const shots = shotBoundaries(run(createCameraTour(7), subjects, 200))
  assert.equal(shots[0].view, 'vista')
  for (let index = 1; index < shots.length; index += 1) {
    assert.notEqual(shots[index].view, shots[index - 1].view, `shot change at sample ${index} stayed on ${shots[index].view}`)
  }
  assert.ok(shots.filter((shot) => shot.view === 'subject').length > 3, 'the tour should visit several animals')
})

test('shots keep their own framing and duration', () => {
  const shots = run(createCameraTour(11), subjects, 240)
  for (const shot of shots) {
    if (shot.view === 'vista') {
      assert.equal(shot.viewHeight, CAMERA_TOUR_VISTA_HEIGHT)
      assert.ok(shot.duration >= 9 && shot.duration <= 15, `vista duration ${shot.duration}`)
      assert.equal(shot.subject, null)
    } else {
      assert.ok(shot.viewHeight >= 7.2 && shot.viewHeight <= 10.4, `subject height ${shot.viewHeight}`)
      assert.ok(shot.duration >= 7 && shot.duration <= 12, `subject duration ${shot.duration}`)
      assert.ok(shot.subject, 'a subject shot names the animal it tracks')
      assert.equal(shot.lookAtHeight, shot.subject.y + 1.05)
    }
    assert.ok(shot.seconds <= shot.duration)
    assert.ok(shot.orbitSpeed !== 0)
  }
})

test('consecutive shots never pin the same animal twice', () => {
  const shots = shotBoundaries(run(createCameraTour(99), subjects, 600))
  const pinned = shots.filter((shot) => shot.view === 'subject').map((shot) => shot.subject.id)
  assert.ok(pinned.length > 8)
  for (let index = 1; index < pinned.length; index += 1) {
    assert.notEqual(pinned[index], pinned[index - 1], `animal ${pinned[index]} was pinned twice in a row`)
  }
})

test('the orbit angle advances at the declared speed', () => {
  const step = 1 / 60
  const tour = createCameraTour(5)
  let previous = tour.tick(0, subjects)
  for (let tick = 0; tick < 600; tick += 1) {
    const shot = tour.tick(step, subjects)
    const expected = previous.orbitAngle + shot.orbitSpeed * step
    assert.ok(Math.abs(shot.orbitAngle - expected) < 1e-9, 'orbit angle drifted from its speed')
    previous = shot
  }
})

test('an empty farm stays on a vista and a sold animal is replaced', () => {
  const tour = createCameraTour(3)
  const empty = run(tour, [], 120)
  assert.ok(empty.every((shot) => shot.view === 'vista' && shot.subject === null))

  const populated = createCameraTour(3)
  let shot = populated.tick(1 / 30, subjects)
  while (shot.view !== 'subject') shot = populated.tick(1 / 30, subjects)
  const tracked = shot.subject.id
  const withoutTracked = subjects.filter((entry) => entry.id !== tracked)
  const replaced = populated.tick(1 / 30, withoutTracked)
  assert.equal(replaced.view, 'subject')
  assert.notEqual(replaced.subject.id, tracked)

  const emptied = populated.tick(1 / 30, [])
  assert.equal(emptied.view, 'vista')
  assert.equal(emptied.subject, null)
  assert.equal(emptied.viewHeight, CAMERA_TOUR_VISTA_HEIGHT)
})
