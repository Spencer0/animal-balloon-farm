import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The animal info card keeps its rules pure (no Three.js, no DOM) in
 * `src/game/animal-card.ts`, so the Helium meter, the resident sell gate and
 * the confirm flow are verified here rather than only by eye in a browser.
 */
const bundle = async (entry) => {
  const { outputFiles } = await build({
    entryPoints: [`src/game/${entry}.ts`],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const card = await bundle('animal-card')
const {
  RESIDENT_STAGE,
  HELIUM_LEVEL,
  HELIUM_STATUS,
  MAX_NAME_LENGTH,
  heliumLevel,
  heliumStatus,
  stageGroup,
  stageChipLabel,
  canShowSellButton,
  isValidAnimalName,
  sanitizeAnimalName,
  createAnimalCardState,
  armSellConfirm,
  cancelSellConfirm,
  resetAnimalCardState,
  placeInfoCard,
  hungerView,
  huntingStatus,
} = card

test('a balloon that has lost nothing reads a full helium meter; a leaking one says so', () => {
  assert.equal(heliumLevel(), 1)
  assert.equal(HELIUM_LEVEL, 1)
  assert.equal(heliumStatus(), 'helium')
  assert.equal(HELIUM_STATUS, 'helium')
  assert.equal(heliumLevel(0.4), 0.4)
  assert.equal(heliumStatus(0.4), 'leaking')
})

test('residents start at stage 3; the chip names the group', () => {
  assert.equal(RESIDENT_STAGE, 3)
  assert.equal(stageGroup(1), 'Visitor')
  assert.equal(stageGroup(2), 'Visitor')
  assert.equal(stageGroup(3), 'Resident')
  assert.equal(stageGroup(4), 'Resident')
  assert.equal(stageChipLabel(2), 'Stage 2 · Visitor')
  assert.equal(stageChipLabel(3), 'Stage 3 · Resident')
})

test('the sell button hides until the animal is a sellable resident', () => {
  assert.equal(canShowSellButton({ stage: 2, sellable: true }), false)
  assert.equal(canShowSellButton({ stage: 3, sellable: false }), false)
  assert.equal(canShowSellButton({ stage: 3, sellable: true }), true)
  assert.equal(canShowSellButton({ stage: 4, sellable: true }), true)
})

test('renames need 1..24 non-blank characters', () => {
  assert.equal(isValidAnimalName('Mabel'), true)
  assert.equal(isValidAnimalName('   '), false)
  assert.equal(isValidAnimalName(''), false)
  assert.equal(isValidAnimalName('x'.repeat(MAX_NAME_LENGTH + 1)), false)
  assert.equal(sanitizeAnimalName('  Mabel  '), 'Mabel')
  assert.equal(sanitizeAnimalName(`  ${'x'.repeat(40)}  `).length, MAX_NAME_LENGTH)
})

test('selling takes two presses: arm, then confirm or stand down', () => {
  const state = createAnimalCardState()
  assert.equal(state.mode, 'info')
  armSellConfirm(state)
  assert.equal(state.mode, 'confirm')
  cancelSellConfirm(state)
  assert.equal(state.mode, 'info')
  armSellConfirm(state)
  state.editing = true
  resetAnimalCardState(state)
  assert.deepEqual(state, { mode: 'info', editing: false })
})

test('the pinned card prefers the right of the balloon and stays on screen', () => {
  const view = { left: -800, right: 800, top: 450, bottom: -450 }
  const cardSize = { width: 380, height: 330 }
  const right = placeInfoCard({ x: 0, y: 0 }, cardSize, view)
  assert.deepEqual(right, { x: 218, y: 0 })
  const flipped = placeInfoCard({ x: 700, y: 100 }, cardSize, view)
  assert.deepEqual(flipped, { x: 482, y: 100 })
  const clamped = placeInfoCard({ x: -790, y: 440 }, cardSize, view)
  assert.deepEqual(clamped, { x: -572, y: 285 })
})

test('the hunger meter names its rung, colours it, and warns when hungry', () => {
  assert.deepEqual([hungerView(1).label, hungerView(0.5).label, hungerView(0.2).label, hungerView(0).label], ['Full', 'Fed', 'Hungry', 'Starving'])
  assert.equal(hungerView(0.5).tone, 'fed')
  assert.equal(hungerView(1).hint, null)
  assert.equal(hungerView(0.5).hint, null)
  assert.match(hungerView(0.2).hint, /don't breed or make goods/)
  assert.ok(hungerView(0).hint)
  assert.equal(hungerView(7).fill, 1)
  assert.equal(hungerView(-1).fill, 0)
  assert.equal(hungerView(Number.NaN).level, 'full')
})

test('a predator hunts or lazes', () => {
  assert.equal(huntingStatus(true), 'Hunting')
  assert.equal(huntingStatus(false), 'Lazing (fed)')
})
