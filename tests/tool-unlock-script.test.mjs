import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const film = await load('src/game/tool-unlock-script.ts')
const unlocks = await load('src/game/tool-unlocks.ts')
const {
  TOOL_UNLOCK_SHOTS, TOOL_UNLOCK_DURATION, TOOL_UNLOCK_FILMS, TOOL_BOY_CUES, PIP_CUES, TOOL_UNLOCK_SOUND_CUES,
  toolUnlockFilmFor, toolUnlockFrameAt, toolUnlockCaptions, toolStateAt,
} = film
const snower = TOOL_UNLOCK_FILMS.snower

const cueAt = (cues, clip) => cues.find((cue) => cue.clip === clip).at
const playing = (states) => states.reduce((best, state) => (state.weight > best.weight ? state : best)).clip

test('shots run back to back from zero to the end with no gaps', () => {
  assert.equal(TOOL_UNLOCK_SHOTS[0].start, 0)
  for (let index = 1; index < TOOL_UNLOCK_SHOTS.length; index += 1) {
    assert.equal(TOOL_UNLOCK_SHOTS[index].start, TOOL_UNLOCK_SHOTS[index - 1].end, `${TOOL_UNLOCK_SHOTS[index].id} starts where the last shot ends`)
  }
  assert.equal(TOOL_UNLOCK_DURATION, TOOL_UNLOCK_SHOTS.at(-1).end)
  for (const shot of TOOL_UNLOCK_SHOTS) {
    assert.equal(shot.camera[0].t, shot.start, `${shot.id} camera starts with the shot`)
    assert.equal(shot.camera.at(-1).t, shot.end, `${shot.id} camera ends with the shot`)
  }
})

test('every tool the shop sells has a film, and the land deed does not', () => {
  for (const id of unlocks.UPGRADE_ORDER) {
    const entry = toolUnlockFilmFor(id)
    if (id === 'land-deed') {
      assert.equal(entry, null)
      continue
    }
    assert.ok(entry, `${id} has a film`)
    assert.equal(entry.id, id)
    assert.ok(entry.title && entry.titleSpoken && entry.cheer && entry.cheerSpoken, `${id} has its lines`)
    assert.ok(entry.grip.scale > 0, `${id} has a grip`)
  }
})

test('the tool appears in Pip’s hands, crosses the counter while both reach, then stays with the boy', () => {
  const offer = cueAt(PIP_CUES, 'OFFER')
  const take = cueAt(TOOL_BOY_CUES, 'TAKE')
  assert.equal(toolStateAt(offer).visible, false, 'Pip ducks under the counter first')
  const firstSeen = toolStateAt(offer + 0.4)
  assert.equal(firstSeen.visible, true)
  assert.equal(firstSeen.handoff, 0, 'it starts with Pip')
  let crossing = null
  for (let t = 0; t <= TOOL_UNLOCK_DURATION; t += 0.05) {
    const handoff = toolStateAt(t).handoff
    if (crossing === null && handoff > 0) crossing = t
  }
  assert.ok(crossing > take + 0.3, 'the boy is already reaching when it leaves Pip')
  const frame = toolUnlockFrameAt(snower, crossing)
  assert.equal(playing(frame.pip), 'OFFER', 'Pip is still holding it out')
  assert.equal(toolStateAt(cueAt(TOOL_BOY_CUES, 'INSPECT')).handoff, 1, 'he has it before he inspects it')
  assert.equal(toolStateAt(TOOL_UNLOCK_DURATION).handoff, 1)
})

test('the boy walks to the counter, faces Pip for the handover, and turns to the camera to cheer', () => {
  const atCounter = toolUnlockFrameAt(snower, cueAt(TOOL_BOY_CUES, 'TAKE'))
  assert.ok(Math.abs(atCounter.boyYaw - Math.PI) < 1e-6, 'facing Pip')
  assert.equal(playing(toolUnlockFrameAt(snower, 1.5).boy), 'WALK')
  const cheer = toolUnlockFrameAt(snower, cueAt(TOOL_BOY_CUES, 'CHEER') + 0.5)
  assert.equal(cheer.shot.id, 'cheer')
  assert.ok(Math.abs(cheer.boyYaw) < Math.PI / 2, 'facing the shop floor, where the camera is')
  assert.ok(cheer.camera.position[2] > cheer.boyPosition[2], 'the camera is in front of him')
})

test('captions name the tool and never overlap, and Pip’s voice sits on Pip’s line', () => {
  const captions = toolUnlockCaptions(snower)
  for (let index = 1; index < captions.length; index += 1) assert.ok(captions[index].start >= captions[index - 1].end)
  assert.ok(captions.some((caption) => caption.style === 'card' && caption.text === snower.title))
  assert.ok(captions.some((caption) => caption.text === snower.cheer))
  const pipLine = captions.find((caption) => caption.speaker === 'Pip')
  const voice = TOOL_UNLOCK_SOUND_CUES.find((cue) => cue.sound === 'pip-voice')
  assert.ok(voice.at >= pipLine.start && voice.at + voice.duration <= pipLine.end)
  assert.equal(toolUnlockFrameAt(snower, 7.6).caption.text, 'The Snower')
  assert.equal(toolUnlockFrameAt(TOOL_UNLOCK_FILMS['tall-grass'], 7.6).caption.text, 'Tall Grass Seed Pack')
})

test('it opens from black and ends on white, and only reports done at the very end', () => {
  assert.equal(toolUnlockFrameAt(snower, 0).fadeBlack, 1)
  assert.equal(toolUnlockFrameAt(snower, 2).fadeBlack, 0)
  assert.equal(toolUnlockFrameAt(snower, TOOL_UNLOCK_DURATION).fadeWhite, 1)
  assert.equal(toolUnlockFrameAt(snower, TOOL_UNLOCK_DURATION - 0.01).done, false)
  assert.equal(toolUnlockFrameAt(snower, TOOL_UNLOCK_DURATION).done, true)
  assert.equal(toolUnlockFrameAt(snower, 999).t, TOOL_UNLOCK_DURATION)
})
