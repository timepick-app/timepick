import { describe, it, expect } from 'vitest'
import { getBestUnit, secondsToDisplay, type DurationConfig } from '../duration-utils'

const SESSION_CONFIG: DurationConfig = {
  defaultValue: 2,
  defaultUnit: 'hours',
  minSeconds: 300,
  maxSeconds: 86400,
}

describe('getBestUnit', () => {
  it('returns minutes for values below 3600', () => {
    expect(getBestUnit(300)).toBe('minutes')
  })

  it('returns hours for values >= 3600 and < 86400', () => {
    expect(getBestUnit(3600)).toBe('hours')
    expect(getBestUnit(7200)).toBe('hours')
  })

  it('returns days for values >= 86400', () => {
    expect(getBestUnit(86400)).toBe('days')
    expect(getBestUnit(604800)).toBe('days')
  })

  it('returns minutes at boundary 3599', () => {
    expect(getBestUnit(3599)).toBe('minutes')
  })

  it('returns hours at boundary 86399', () => {
    expect(getBestUnit(86399)).toBe('hours')
  })
})

describe('secondsToDisplay', () => {
  it('regression: 7200s returns 2 hours, not 5 minutes', () => {
    const result = secondsToDisplay(7200, SESSION_CONFIG)
    expect(result).toEqual({ value: 2, unit: 'hours' })
  })

  it('converts 300s to 5 minutes', () => {
    expect(secondsToDisplay(300, SESSION_CONFIG)).toEqual({ value: 5, unit: 'minutes' })
  })

  it('converts 86400s to 1 day', () => {
    expect(secondsToDisplay(86400, SESSION_CONFIG)).toEqual({ value: 1, unit: 'days' })
  })

  it('converts 604800s to 7 days with appropriate config', () => {
    const config: DurationConfig = {
      defaultValue: 7,
      defaultUnit: 'days',
      minSeconds: 60,
      maxSeconds: 2592000,
    }
    expect(secondsToDisplay(604800, config)).toEqual({ value: 7, unit: 'days' })
  })

  it('clamps below minimum to minSeconds', () => {
    const result = secondsToDisplay(100, SESSION_CONFIG)
    expect(result).toEqual({ value: 5, unit: 'minutes' })
  })

  it('clamps above maximum to maxSeconds', () => {
    const result = secondsToDisplay(90000, SESSION_CONFIG)
    expect(result).toEqual({ value: 1, unit: 'days' })
  })

  it('exact minimum boundary returns correct value', () => {
    expect(secondsToDisplay(300, SESSION_CONFIG)).toEqual({ value: 5, unit: 'minutes' })
  })

  it('exact maximum boundary returns correct value', () => {
    expect(secondsToDisplay(86400, SESSION_CONFIG)).toEqual({ value: 1, unit: 'days' })
  })

  it('constrains unit to allowedUnits when getBestUnit returns disallowed unit', () => {
    // 86400s → getBestUnit returns 'days', but only ['minutes', 'hours'] allowed → falls back to 'hours'
    expect(secondsToDisplay(86400, SESSION_CONFIG, ['minutes', 'hours'])).toEqual({ value: 24, unit: 'hours' })
  })

  it('clamp + allowedUnits combined: over max with constrained units', () => {
    expect(secondsToDisplay(90000, SESSION_CONFIG, ['minutes', 'hours'])).toEqual({ value: 24, unit: 'hours' })
  })
})
