/**
 * Day/night cycle + three-month calendar.
 *
 * Pure on purpose (no Three.js, no DOM): the scene rig in
 * `src/scene/day-night-rig.ts` reads this state and drives the lights, and
 * the HUD in `src/ui/clock-calendar-hud.ts` reads it to draw the clock.
 * Everything here is covered by `tests/day-night.test.mjs`.
 *
 * Time of day is a fraction: 0 = midnight, 0.25 = sunrise, 0.5 = noon,
 * 0.75 = sunset. The calendar is three original ten-day months
 * (Sproutide, Sunspire, Leafdown); day 1 of Sproutide, year 1 is the epoch.
 */

export const DAY_LENGTH_SECONDS = 480

export const START_TIME_OF_DAY = 0.32

export interface CalendarMonth {
  readonly id: string
  readonly name: string
  readonly days: number
}

export const CALENDAR_MONTHS: readonly CalendarMonth[] = [
  { id: 'sproutide', name: 'Sproutide', days: 10 },
  { id: 'sunspire', name: 'Sunspire', days: 10 },
  { id: 'leafdown', name: 'Leafdown', days: 10 },
]

export const DAYS_PER_YEAR = CALENDAR_MONTHS.reduce((total, month) => total + month.days, 0)

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk'

export interface DayNightState {
  timeOfDay: number
  elapsedDays: number
}

export interface CalendarDate {
  readonly year: number
  readonly monthIndex: number
  readonly month: CalendarMonth
  readonly day: number
  readonly dayOfYear: number
}

export function createDayNightClock(startTimeOfDay = START_TIME_OF_DAY): DayNightState {
  return { timeOfDay: wrapTime(startTimeOfDay), elapsedDays: 0 }
}

export function advanceClock(state: DayNightState, deltaSeconds: number): DayNightState {
  if (!(deltaSeconds > 0)) return state
  const next = state.timeOfDay + deltaSeconds / DAY_LENGTH_SECONDS
  const rolled = Math.floor(next)
  state.timeOfDay = next - rolled
  state.elapsedDays += rolled
  return state
}

export function setTimeOfDay(state: DayNightState, timeOfDay: number): DayNightState {
  state.timeOfDay = wrapTime(timeOfDay)
  return state
}

/** Jump forward to the next occurrence of `target` (crossing midnight counts a day). */
export function skipToNext(state: DayNightState, target: number): DayNightState {
  const wrapped = wrapTime(target)
  if (wrapped <= state.timeOfDay) state.elapsedDays += 1
  state.timeOfDay = wrapped
  return state
}

export function phaseOf(timeOfDay: number): DayPhase {
  const t = wrapTime(timeOfDay)
  if (t < 0.22 || t >= 0.78) return 'night'
  if (t < 0.3) return 'dawn'
  if (t < 0.7) return 'day'
  return 'dusk'
}

export function sunElevation(timeOfDay: number): number {
  return Math.sin((wrapTime(timeOfDay) - 0.25) * Math.PI * 2)
}

export function daylightAmount(timeOfDay: number): number {
  const elevation = sunElevation(timeOfDay)
  if (elevation <= 0) return 0
  return Math.min(1, elevation * 1.6)
}

export function calendarOf(elapsedDays: number): CalendarDate {
  const total = Math.max(0, Math.floor(elapsedDays))
  const year = Math.floor(total / DAYS_PER_YEAR) + 1
  const dayOfYear = total - (year - 1) * DAYS_PER_YEAR + 1
  let rest = dayOfYear - 1
  for (let index = 0; index < CALENDAR_MONTHS.length; index += 1) {
    const month = CALENDAR_MONTHS[index]
    if (rest < month.days) {
      return { year, monthIndex: index, month, day: rest + 1, dayOfYear }
    }
    rest -= month.days
  }
  const last = CALENDAR_MONTHS[CALENDAR_MONTHS.length - 1]
  return { year, monthIndex: CALENDAR_MONTHS.length - 1, month: last, day: last.days, dayOfYear: DAYS_PER_YEAR }
}

export function formatClockTime(timeOfDay: number): string {
  const minutes = Math.floor(wrapTime(timeOfDay) * 24 * 60)
  const hour24 = Math.floor(minutes / 60)
  const minute = minutes - hour24 * 60
  const suffix = hour24 < 12 ? 'a' : 'p'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return hour12 + ':' + String(minute).padStart(2, '0') + suffix
}

export function formatCalendarDate(date: CalendarDate): string {
  return date.month.name + ' ' + date.day + ', Y' + date.year
}

function wrapTime(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value - Math.floor(value)
}
