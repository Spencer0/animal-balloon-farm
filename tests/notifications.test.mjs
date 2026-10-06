import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/notifications.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const notifications = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createNotificationCenter, notificationCopy, relativeTimeLabel } = notifications

test('copy names the subject on every ticket', () => {
  assert.match(notificationCopy('resident', 'Pig').title, /Pig/)
  assert.match(notificationCopy('egg', 'Duck').title, /Duck/)
  assert.match(notificationCopy('plantGrown', 'Clover').title, /Clover/)
  assert.match(notificationCopy('firstResident', 'Pig').detail, /Pig/)
})

test('first milestone per species is a spotlight on stage, repeats file routine mail', () => {
  const center = createNotificationCenter()
  const first = center.pushMilestone('resident', 'Pig')
  assert.ok(first)
  assert.equal(first.spotlight, true)
  assert.equal(first.kind, 'firstResident')
  assert.equal(center.visible().length, 1)
  assert.equal(center.entryState(first.id), 'unread')
  center.tick(99)
  const repeat = center.pushMilestone('resident', 'Pig')
  assert.ok(repeat)
  assert.equal(repeat.spotlight, false)
  assert.equal(repeat.kind, 'resident')
  assert.equal(center.visible().length, 0)
  assert.equal(center.entryState(repeat.id), 'unseen')
  center.tick(99)
  assert.equal(center.pushMilestone('carnival', 'Frog')?.kind, 'firstCarnival')
  center.tick(99)
  assert.equal(center.pushMilestone('carnival', 'Frog'), null)
})

test('milestone memory is per species', () => {
  const center = createNotificationCenter()
  center.pushMilestone('egg', 'Duck')
  const other = center.pushMilestone('egg', 'Goose')
  assert.ok(other)
  assert.equal(other.spotlight, true)
})

test('repeat mail does not stack while an unread copy sits in the postbox', () => {
  const center = createNotificationCenter()
  center.pushPlantGrown('Clover')
  center.pushPlantGrown('Clover')
  assert.equal(center.history().length, 1)
  assert.equal(center.unreadCount(), 1)
  center.markAllRead()
  center.pushPlantGrown('Clover')
  assert.equal(center.history().length, 2)
})

test('spotlights expire after their lifetime and the queue promotes', () => {
  const center = createNotificationCenter({ spotlightLifetime: 4 })
  center.pushMilestone('resident', 'Pig')
  center.pushMilestone('egg', 'Duck')
  assert.equal(center.visible()[0].kind, 'firstResident')
  assert.equal(center.queuedCount(), 1)
  center.tick(4)
  assert.equal(center.visible()[0].kind, 'firstEgg')
  assert.equal(center.entryState(center.visible()[0].id), 'unread')
})

test('dismissing the marquee files it as read and promotes the queue', () => {
  const center = createNotificationCenter()
  const first = center.pushMilestone('resident', 'Pig')
  center.pushMilestone('egg', 'Duck')
  assert.equal(center.dismiss(first.id + 1000), false)
  assert.equal(center.dismiss(first.id), true)
  assert.equal(center.entryState(first.id), 'read')
  assert.equal(center.visible()[0].kind, 'firstEgg')
})

test('unread count clears when the postbox is opened', () => {
  const center = createNotificationCenter()
  center.pushPlantGrown('Clover')
  center.pushMilestone('resident', 'Pig')
  center.tick(99)
  assert.equal(center.unreadCount(), 2)
  center.markAllRead()
  assert.equal(center.unreadCount(), 0)
})

test('the ledger keeps a bounded history of read letters', () => {
  const center = createNotificationCenter({ maxLedger: 3 })
  const first = center.pushPlantGrown('Clover')
  center.pushPlantGrown('Poppy')
  center.pushMilestone('resident', 'Pig')
  center.tick(99)
  center.markAllRead()
  center.pushMilestone('resident', 'Sheep')
  center.tick(99)
  center.markAllRead()
  assert.equal(center.history().length, 3)
  assert.equal(center.entryState(first.id), null)
})

test('reset clears tickets, ledger and first-time memory', () => {
  const center = createNotificationCenter()
  center.pushMilestone('resident', 'Pig')
  center.reset()
  assert.equal(center.visible().length, 0)
  assert.equal(center.history().length, 0)
  assert.equal(center.unreadCount(), 0)
  const again = center.pushMilestone('resident', 'Pig')
  assert.ok(again)
  assert.equal(again.spotlight, true)
})

test('ledger stamps filing time from the center clock', () => {
  const center = createNotificationCenter()
  center.tick(100)
  const entry = center.pushPlantGrown('Clover')
  assert.ok(entry)
  assert.equal(entry.filedAt, 100)
  assert.equal(center.now(), 100)
  center.tick(40)
  assert.equal(center.now(), 140)
})

test('relative time labels read like farm post', () => {
  assert.equal(relativeTimeLabel(0), 'just now')
  assert.equal(relativeTimeLabel(30), 'just now')
  assert.equal(relativeTimeLabel(60), '1 min ago')
  assert.equal(relativeTimeLabel(480), '8 mins ago')
  assert.equal(relativeTimeLabel(3540), '59 mins ago')
  assert.equal(relativeTimeLabel(3600), '1 hr ago')
  assert.equal(relativeTimeLabel(7200), '2 hrs ago')
})

test('reset rewinds the center clock', () => {
  const center = createNotificationCenter()
  center.tick(50)
  center.reset()
  assert.equal(center.now(), 0)
})

test('accomplishment tickets play as spotlights with custom copy', () => {
  const center = createNotificationCenter()
  const entry = center.pushAccomplishment('Pig appear', 'First Pig spotted at the tents.')
  assert.ok(entry)
  assert.equal(entry.spotlight, true)
  assert.equal(entry.title, 'Pig appear')
  assert.equal(center.visible().length, 1)
  center.tick(99)
  assert.equal(center.visible().length, 0)
  assert.equal(center.unreadCount(), 1)
})
