import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * Escape is routed by one pure module (`src/game/escape-router.ts`): the layers
 * are asked top-first on key-up, and the main menu is the last stop. These tests
 * pin the UAT rules: Escape closes what is open, then opens the menu, then
 * closes the menu, and one physical press never does two of those.
 */
const { outputFiles } = await build({
  entryPoints: ['src/game/escape-router.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const { createEscapeRouter, menuCloseLayer, menuOpenLayer } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`,
)

const key = (name, repeat = false) => ({ key: name, repeat, prevented: false, preventDefault() { this.prevented = true } })

/** A tiny world: a stack of open screens plus the menu, wired the way main.ts wires them. */
function world({ menuOpen = false, dismissable = false, screens = [] } = {}) {
  const state = { menuOpen, dismissable, screens: [...screens], log: [] }
  const menu = {
    get isOpen() { return state.menuOpen },
    get dismissable() { return state.dismissable },
    open() { state.menuOpen = true; state.log.push('menu opened') },
    dismiss() { state.menuOpen = false; state.log.push('menu closed') },
  }
  const layers = [
    menuCloseLayer(menu),
    () => {
      const top = state.screens.pop()
      if (!top) return false
      state.log.push(`${top} closed`)
      return true
    },
    menuOpenLayer(menu),
  ]
  const router = createEscapeRouter(layers)
  const press = (opts = {}) => {
    router.keyDown(key('Escape', opts.repeat))
    router.keyUp(key('Escape'))
  }
  return { state, router, press }
}

test('Escape closes the open screen and does not open the menu in the same press', () => {
  const w = world({ screens: ['shop'] })
  w.press()
  assert.deepEqual(w.state.log, ['shop closed'])
  assert.equal(w.state.menuOpen, false)
})

test('journal and shop each close on the first press, then the next press opens the menu', () => {
  for (const screen of ['journal', 'shop']) {
    const w = world({ screens: [screen] })
    w.press()
    assert.deepEqual(w.state.log, [`${screen} closed`])
    w.press()
    assert.deepEqual(w.state.log, [`${screen} closed`, 'menu opened'])
  }
})

test('Escape with nothing open opens the menu, and Escape again closes it once the player has entered', () => {
  const w = world({ dismissable: true })
  w.press()
  assert.equal(w.state.menuOpen, true)
  w.press()
  assert.equal(w.state.menuOpen, false)
  assert.deepEqual(w.state.log, ['menu opened', 'menu closed'])
})

test('a fresh-boot menu ignores Escape until the player has chosen something', () => {
  const w = world({ menuOpen: true, dismissable: false })
  w.press()
  w.press()
  assert.equal(w.state.menuOpen, true)
  assert.deepEqual(w.state.log, [])
})

test('the menu takes Escape before any screen beneath it', () => {
  const w = world({ menuOpen: true, dismissable: true, screens: ['shop'] })
  w.press()
  assert.deepEqual(w.state.log, ['menu closed'])
  assert.deepEqual(w.state.screens, ['shop'])
})

test('screens close one per press, topmost first', () => {
  const w = world({ screens: ['shop', 'card'] })
  w.press()
  assert.deepEqual(w.state.log, ['card closed'])
  w.press()
  assert.deepEqual(w.state.log, ['card closed', 'shop closed'])
})

test('nothing happens on key-down; the key-up acts', () => {
  const w = world({ screens: ['shop'] })
  w.router.keyDown(key('Escape'))
  assert.deepEqual(w.state.log, [])
  w.router.keyUp(key('Escape'))
  assert.deepEqual(w.state.log, ['shop closed'])
})

test('a held key auto-repeating acts once, on release', () => {
  const w = world({ screens: ['shop'] })
  w.router.keyDown(key('Escape'))
  for (let i = 0; i < 10; i += 1) w.router.keyDown(key('Escape', true))
  w.router.keyUp(key('Escape'))
  assert.deepEqual(w.state.log, ['shop closed'])
  assert.equal(w.state.menuOpen, false)
})

test('a release whose key-down never reached the router does nothing', () => {
  // The key-down was owned elsewhere (a film skip, a minigame forfeit, a name being typed).
  const w = world({ screens: ['shop'] })
  w.router.keyUp(key('Escape'))
  assert.deepEqual(w.state.log, [])
})

test('one key-down yields one action even if key-up fires twice', () => {
  const w = world({ screens: ['shop'] })
  w.router.keyDown(key('Escape'))
  w.router.keyUp(key('Escape'))
  w.router.keyUp(key('Escape'))
  assert.deepEqual(w.state.log, ['shop closed'])
})

test('reset (window blur) drops a half-finished press', () => {
  const w = world({ screens: ['shop'] })
  w.router.keyDown(key('Escape'))
  w.router.reset()
  w.router.keyUp(key('Escape'))
  assert.deepEqual(w.state.log, [])
})

test('other keys are ignored', () => {
  const w = world({ screens: ['shop'] })
  w.router.keyDown(key('a'))
  w.router.keyUp(key('a'))
  assert.deepEqual(w.state.log, [])
})

test('Escape key-down is claimed so the browser keeps its own meaning out', () => {
  const w = world()
  const down = key('Escape')
  w.router.keyDown(down)
  assert.equal(down.prevented, true)
})
