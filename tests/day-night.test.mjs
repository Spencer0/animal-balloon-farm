import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The day/night clock and calendar stay pure (no Three.js, no DOM) so the
 * cycle can be verified here instead of only by eye in a browser.
 */
const bundle = async (entry) => {
  const { outputFiles } = await build({
    entryPoints: ['src/game/' + entry + '.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  const encoded = Buffer.from(outputFiles[0].text).toString('base64')
  return import('data:text/javascript;base64,' + encoded)
}

const clock = await bundle('day-night')
const {
  DAY_LENGTH_SECONDS,
  CALENDAR_MONTHS,
  DAYS_PER_YEAR,
  createDayNightClock,
  advanceClock,
  setTimeOfDay,
  skipToNext,
  phaseOf,
  sunElevation,
  daylightAmount,
  calendarOf,
  formatClockTime,
  formatCalendarDate,
} = clock

test('a full day takes DAY_LENGTH_SECONDS and rolls the calendar', () => {
  const state = createDayNightClock(0)
  advanceClock(state, DAY_LENGTH_SECONDS)
  assert.equal(state.timeOfDay, 0)
  assert.equal(state.elapsedDays, 1)
})

test('partial advances never roll the calendar early', () => {
  const state = createDayNightClock(0)
  advanceClock(state, DAY_LENGTH_SECONDS - 1)
  assert.equal(state.elapsedDays, 0)
  assert.ok(state.timeOfDay > 0.99 && state.timeOfDay < 1)
})

test('phases split the day into night, dawn, day and dusk', () => {
  assert.equal(phaseOf(0), 'night')
  assert.equal(phaseOf(0.25), 'dawn')
  assert.equal(phaseOf(0.5), 'day')
  assert.equal(phaseOf(0.74), 'dusk')
  assert.equal(phaseOf(0.8), 'night')
})

test('the sun peaks at noon and daylight is zero overnight', () => {
  assert.ok(Math.abs(sunElevation(0.5) - 1) < 1e-9)
  assert.ok(sunElevation(0) < 0)
  assert.equal(daylightAmount(0), 0)
  assert.ok(daylightAmount(0.5) > 0.9)
  assert.ok(daylightAmount(0.25) < daylightAmount(0.5))
})

test('the calendar has three ten-day months', () => {
  assert.equal(CALENDAR_MONTHS.length, 3)
  assert.equal(DAYS_PER_YEAR, 30)
  const names = new Set(CALENDAR_MONTHS.map((month) => month.name))
  assert.equal(names.size, 3)
})

test('dates roll through months and into year two', () => {
  const triple = (d) => [d.year, d.monthIndex, d.day]
  assert.deepEqual(triple(calendarOf(0)), [1, 0, 1])
  assert.deepEqual(triple(calendarOf(9)), [1, 0, 10])
  assert.deepEqual(triple(calendarOf(10)), [1, 1, 1])
  assert.deepEqual(triple(calendarOf(29)), [1, 2, 10])
  assert.deepEqual(triple(calendarOf(30)), [2, 0, 1])
})

test('skipToNext jumps forward and counts a crossed midnight', () => {
  const state = createDayNightClock(0.5)
  skipToNext(state, 0.6)
  assert.equal(state.timeOfDay, 0.6)
  assert.equal(state.elapsedDays, 0)
  skipToNext(state, 0.1)
  assert.equal(state.timeOfDay, 0.1)
  assert.equal(state.elapsedDays, 1)
})

test('setTimeOfDay wraps without touching the calendar', () => {
  const state = createDayNightClock(0.5)
  setTimeOfDay(state, 1.25)
  assert.equal(state.timeOfDay, 0.25)
  assert.equal(state.elapsedDays, 0)
})

test('clock and calendar format for the HUD', () => {
  assert.equal(formatClockTime(0.5), '12:00p')
  assert.equal(formatClockTime(0), '12:00a')
  assert.equal(formatCalendarDate(calendarOf(0)), CALENDAR_MONTHS[0].name + ' 1, Y1')
})
