import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/chapter-film.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const chapters = await build({ entryPoints: ['src/game/farm-chapters.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const c = await import(`data:text/javascript;base64,${Buffer.from(chapters.outputFiles[0].text).toString('base64')}`)

const IDS = c.CHAPTER_ORDER
const RADIUS = 20

test('every chapter has a film of sane length', () => {
  assert.ok(m.CHAPTER_FILM_DURATION >= 5 && m.CHAPTER_FILM_DURATION <= 9)
  for (const id of IDS) {
    const keys = m.chapterFilmCamera(id, RADIUS)
    assert.ok(keys.length >= 2, `${id} has at least two camera keys`)
    assert.equal(keys[0].t, 0, `${id} camera starts at zero`)
    assert.equal(keys.at(-1).t, m.CHAPTER_FILM_DURATION, `${id} camera ends with the film`)
    for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i].t > keys[i - 1].t, `${id} key times rise`)
  }
})

test('poses, fov and letterbox are finite and stay in range across the whole film', () => {
  for (const id of IDS) {
    for (let t = -1; t <= m.CHAPTER_FILM_DURATION + 1; t += 0.05) {
      const frame = m.chapterFilmAt(id, t, RADIUS)
      for (const v of [...frame.position, ...frame.target, frame.fov, frame.letterbox, frame.captionOpacity]) {
        assert.ok(Number.isFinite(v), `${id} at ${t.toFixed(2)} is finite`)
      }
      assert.ok(frame.fov > 10 && frame.fov < 90, `${id} fov is a sane lens`)
      assert.ok(frame.letterbox >= 0 && frame.letterbox <= m.CHAPTER_LETTERBOX + 1e-9)
      assert.ok(frame.captionOpacity >= 0 && frame.captionOpacity <= 1)
    }
  }
})

test('the camera moves over the farm, and stays off its centre line', () => {
  for (const id of IDS) {
    // A tilt-up (mythical) moves the look-at point rather than the camera, so count both.
    const a = m.chapterFilmAt(id, 0, RADIUS)
    const b = m.chapterFilmAt(id, m.CHAPTER_FILM_DURATION, RADIUS)
    const moved = Math.hypot(...a.position.map((v, i) => v - b.position[i])) + Math.hypot(...a.target.map((v, i) => v - b.target[i]))
    assert.ok(moved > RADIUS * 0.3, `${id} moves at least 0.3 radius`)
    // Nothing should send the camera through the middle of the farm.
    for (let t = 0; t <= m.CHAPTER_FILM_DURATION; t += 0.5) {
      const [x, y, z] = m.chapterFilmAt(id, t, RADIUS).position
      assert.ok(Math.hypot(x, z) > RADIUS * 0.2 || y > RADIUS * 0.5, `${id} keeps clear of the farm centre at ${t}`)
    }
  }
})

test('every chapter has its title card at the title moment, matching the chapter', () => {
  for (const id of IDS) {
    const frame = m.chapterFilmAt(id, m.CHAPTER_TITLE_AT, RADIUS)
    assert.equal(frame.caption?.kind, 'title', `${id} shows a title card`)
    assert.equal(frame.caption.label, `Chapter ${c.CHAPTERS[id].number}`)
    assert.equal(frame.caption.title, c.CHAPTERS[id].title)
    assert.equal(frame.caption.tagline, c.CHAPTERS[id].tagline)
    assert.equal(frame.captionOpacity, 1, `${id} title is fully shown at its moment`)
  }
})

test('every chapter has one short original line after the title card', () => {
  for (const id of IDS) {
    const captions = m.chapterFilmCaptions(id)
    const line = captions.find((caption) => caption.kind === 'line')
    const title = captions.find((caption) => caption.kind === 'title')
    assert.ok(line, `${id} has a line`)
    assert.ok(line.text.length > 10 && line.text.length <= 70, `${id} line is short`)
    assert.ok(line.start >= title.end, `${id} line follows the title`)
    assert.ok(line.end <= m.CHAPTER_FILM_DURATION, `${id} line ends within the film`)
    const frame = m.chapterFilmAt(id, (line.start + line.end) / 2, RADIUS)
    assert.equal(frame.caption?.kind, 'line')
    assert.equal(frame.caption.text, line.text)
  }
})

test('the same chapter at the same time is the same pose, every time', () => {
  for (const id of IDS) {
    for (const t of [0, 1.3, m.CHAPTER_TITLE_AT, 5.9]) {
      assert.deepEqual(m.chapterFilmAt(id, t, RADIUS), m.chapterFilmAt(id, t, RADIUS))
    }
  }
  // Seeking backwards lands on the same frame as playing straight there.
  const straight = m.chapterFilmAt('harmony', 4, RADIUS)
  m.chapterFilmAt('harmony', 6, RADIUS)
  assert.deepEqual(m.chapterFilmAt('harmony', 4, RADIUS), straight)
})

test('a bigger farm stands the camera further out, and the done flag ends the film', () => {
  const near = m.chapterFilmAt('garden', 3, 10).position
  const far = m.chapterFilmAt('garden', 3, 40).position
  assert.ok(Math.hypot(...far) > Math.hypot(...near) * 3)
  assert.equal(m.chapterFilmAt('garden', m.CHAPTER_FILM_DURATION - 0.1, RADIUS).done, false)
  assert.equal(m.chapterFilmAt('garden', m.CHAPTER_FILM_DURATION, RADIUS).done, true)
  assert.deepEqual(m.chapterFilmAt('garden', 99, RADIUS).position, m.chapterFilmAt('garden', m.CHAPTER_FILM_DURATION, RADIUS).position)
})

// The frame's four corners, cast down onto the ground plane. A shot that sees
// past the farm shows the slab's side or the void beyond it; one that lands on
// the lawn and meadow never does.
function groundCorners(frame, aspect = 16 / 9) {
  const [px, py, pz] = frame.position
  const dir = frame.target.map((v, i) => v - frame.position[i])
  const length = Math.hypot(...dir)
  const d = dir.map((v) => v / length)
  const right = [d[2], 0, -d[0]]
  const rightLength = Math.hypot(...right)
  right.splice(0, 3, ...right.map((v) => v / rightLength))
  const up = [right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0]]
  const halfHeight = length * Math.tan((frame.fov * Math.PI) / 360)
  const hits = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const origin = [0, 1, 2].map((i) => frame.position[i] + right[i] * sx * halfHeight * aspect + up[i] * sy * halfHeight)
      const s = -origin[1] / d[1]
      hits.push({ x: origin[0] + s * d[0], z: origin[2] + s * d[2], s, eyeAbove: py > 0 })
    }
  }
  return hits
}

test('every shot looks down steeply and never sees past the farm', () => {
  for (const id of IDS) {
    for (let t = 0; t <= m.CHAPTER_FILM_DURATION; t += 0.25) {
      const frame = m.chapterFilmAt(id, t, RADIUS)
      const [x, y, z] = frame.position
      const [tx, ty, tz] = frame.target
      const pitch = Math.atan2(y - ty, Math.hypot(x - tx, z - tz)) * (180 / Math.PI)
      assert.ok(pitch >= 38 && pitch <= 62, `${id} at ${t}: pitch ${pitch.toFixed(1)} is steep enough to show the plot`)
      assert.ok(y > 0, `${id} at ${t} keeps the camera above the ground`)
      for (const hit of groundCorners(frame)) {
        assert.ok(hit.s > 0, `${id} at ${t}: every corner ray hits the ground ahead`)
        assert.ok(Math.hypot(hit.x, hit.z) < RADIUS * 5, `${id} at ${t}: frame reaches ${Math.hypot(hit.x, hit.z).toFixed(1)} from the centre, past the farm`)
      }
    }
  }
})
