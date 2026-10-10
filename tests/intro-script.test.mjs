import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/intro-script.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const intro = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { INTRO_SHOTS, INTRO_DURATION, INTRO_CAPTIONS, BOY_CUES, PRESIDENT_CUES, PROP_CUES, SOUND_CUES, introFrameAt, clipStatesAt, kitStateAt } = intro

test('shots run back to back from zero to the end with no gaps', () => {
  assert.equal(INTRO_SHOTS[0].start, 0)
  for (let index = 1; index < INTRO_SHOTS.length; index += 1) {
    assert.equal(INTRO_SHOTS[index].start, INTRO_SHOTS[index - 1].end, `${INTRO_SHOTS[index].id} starts where the last shot ends`)
  }
  assert.equal(INTRO_DURATION, INTRO_SHOTS.at(-1).end)
  for (const shot of INTRO_SHOTS) {
    assert.ok(shot.end > shot.start, `${shot.id} has length`)
    assert.equal(shot.camera[0].t, shot.start, `${shot.id} camera starts with the shot`)
    assert.equal(shot.camera.at(-1).t, shot.end, `${shot.id} camera ends with the shot`)
  }
})

test('it opens on the president, cuts to the boy asking why, then the mailbox', () => {
  const lines = INTRO_CAPTIONS.map((caption) => caption.text)
  assert.ok(lines.indexOf('All balloon people must now farm!') >= 0)
  assert.ok(lines.indexOf('Why?') > lines.indexOf('All balloon people must now farm!'))
  assert.equal(introFrameAt(0).shot.id, 'broadcast')
  assert.equal(introFrameAt(12).shot.id, 'why')
  assert.equal(introFrameAt(12).set, 'room')
  assert.equal(introFrameAt(24).set, 'exterior')
  const mailOpens = PROP_CUES.find((cue) => cue.clip === 'MAIL_OPEN').at
  const reach = BOY_CUES.find((cue) => cue.clip === 'REACH').at
  assert.ok(reach < mailOpens, 'the boy reaches before the door opens')
  assert.equal(kitStateAt(mailOpens).visible, false, 'the kit waits for the open door')
  assert.equal(kitStateAt(INTRO_DURATION - 1).visible, true)
})

test('captions sit inside the cutscene and never overlap', () => {
  const sorted = [...INTRO_CAPTIONS].sort((a, b) => a.start - b.start)
  for (let index = 0; index < sorted.length; index += 1) {
    assert.ok(sorted[index].start >= 0 && sorted[index].end <= INTRO_DURATION)
    if (index > 0) assert.ok(sorted[index].start >= sorted[index - 1].end, `${sorted[index].text} after ${sorted[index - 1].text}`)
  }
})

test('clip crossfades always weigh one in total and restart at zero', () => {
  for (const cues of [BOY_CUES, PRESIDENT_CUES]) {
    for (let t = 0; t <= INTRO_DURATION; t += 0.05) {
      const states = clipStatesAt(cues, t)
      const total = states.reduce((sum, state) => sum + state.weight, 0)
      assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to 1 at ${t}`)
      assert.ok(states.every((state) => state.time >= 0))
    }
    for (const cue of cues) assert.equal(clipStatesAt(cues, cue.at)[0].time, 0)
  }
})

test('a frame is a pure function of time, so seeking matches playing', () => {
  const a = introFrameAt(23.7)
  introFrameAt(5)
  introFrameAt(31)
  assert.deepEqual(introFrameAt(23.7), a)
})

test('the picture fades in from black and out to white, then reports done', () => {
  assert.equal(introFrameAt(0).fadeBlack, 1)
  assert.equal(introFrameAt(2).fadeBlack, 0)
  assert.equal(introFrameAt(INTRO_DURATION).fadeWhite, 1)
  assert.equal(introFrameAt(INTRO_DURATION - 3).fadeWhite, 0)
  assert.equal(introFrameAt(INTRO_DURATION - 0.01).done, false)
  assert.equal(introFrameAt(INTRO_DURATION + 1).done, true)
})

test('the boy stays hidden indoors until the cottage door has opened', () => {
  const door = PROP_CUES.find((cue) => cue.clip === 'DOOR_OPEN').at
  assert.equal(introFrameAt(16).boyVisible, false)
  assert.ok(introFrameAt(door + 0.6).boyVisible)
  assert.ok(introFrameAt(12).boyVisible)
})

test('sounds land on the moments that make them', () => {
  for (const cue of SOUND_CUES) {
    assert.ok(cue.at >= 0 && cue.at + (cue.duration ?? 0) <= INTRO_DURATION + 1e-9, `${cue.sound} fits in the film`)
  }
  // Every spoken caption has a voice under it.
  for (const caption of INTRO_CAPTIONS.filter((entry) => entry.style === 'speech')) {
    const voice = SOUND_CUES.find((cue) => cue.sound.endsWith('voice') && cue.at >= caption.start - 0.2 && cue.at < caption.end)
    assert.ok(voice, `a voice speaks "${caption.text}"`)
  }
  for (const [sound, clip] of [['flag', 'FLAG'], ['door', 'DOOR_OPEN'], ['mailbox', 'MAIL_OPEN']]) {
    const cue = SOUND_CUES.find((entry) => entry.sound === sound)
    assert.equal(cue.at, PROP_CUES.find((entry) => entry.clip === clip).at, `${sound} sounds as ${clip} plays`)
  }
})
