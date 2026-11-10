/* The Auto theme: light in the daytime, dark at night, and Grace can switch it on. */
import { describe, expect, it } from 'vitest'
import { msUntilSwitch, resolveTheme, themeForTime } from '../src/lib/dayTheme'
import { respond } from '../src/lib/assistant'
import { computeStats } from '../src/lib/stats'

const at = (h, m = 0) => new Date(2026, 10, 10, h, m)
const day = { from: 7, to: 19 }

describe('themeForTime', () => {
  it('is light from 7am until 7pm', () => {
    expect(themeForTime(at(7), day)).toBe('light')
    expect(themeForTime(at(12, 30), day)).toBe('light')
    expect(themeForTime(at(18, 59), day)).toBe('light')
  })
  it('is dark from 7pm until 7am', () => {
    expect(themeForTime(at(19), day)).toBe('dark')
    expect(themeForTime(at(23, 45), day)).toBe('dark')
    expect(themeForTime(at(2), day)).toBe('dark')
    expect(themeForTime(at(6, 59), day)).toBe('dark')
  })
})

describe('msUntilSwitch', () => {
  it('waits for nightfall in the day and for morning at night', () => {
    expect(msUntilSwitch(at(18, 30), day)).toBe(30 * 60 * 1000)
    expect(msUntilSwitch(at(6), day)).toBe(60 * 60 * 1000)
    expect(msUntilSwitch(at(23), day)).toBe(8 * 60 * 60 * 1000)
  })
})

describe('resolveTheme', () => {
  it('follows the clock only in auto', () => {
    expect(resolveTheme('auto', at(21), day)).toBe('dark')
    expect(resolveTheme('auto', at(9), day)).toBe('light')
    expect(resolveTheme('dark', at(9), day)).toBe('dark')
    expect(resolveTheme('light', at(21), day)).toBe('light')
  })
})

describe('Grace and the auto theme', () => {
  const calls = []
  const app = {
    user: { first: 'R', name: 'R' },
    theme: 'light',
    themeMode: 'light',
    contacts: [],
    goals: [],
    bills: [],
    transactions: [],
    pots: [],
    budgets: [],
    switchTheme: (m) => calls.push(m),
    stats: computeStats([], []),
    period: 'month',
    currency: 'USD',
    activity: [],
  }
  it('turns on auto theme when asked', () => {
    for (const q of ['turn on auto theme', 'automatic dark mode', 'set the theme to auto', 'follow the time of day']) {
      calls.length = 0
      const r = respond(q, app, {})
      expect(r.text).toMatch(/7pm/)
      r.run()
      expect(calls).toEqual(['auto'])
    }
  })
  it('still switches to plain dark mode', () => {
    calls.length = 0
    respond('switch to dark mode', app, {}).run()
    expect(calls).toEqual(['dark'])
  })
})
