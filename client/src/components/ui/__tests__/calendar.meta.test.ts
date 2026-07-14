import { describe, it, expect } from 'vitest'
import { calendarMeta } from '../calendar.meta'

describe('calendarMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(calendarMeta.name).toBe('Calendar')
    expect(calendarMeta.importPath).toBe('@/components/ui/calendar')
    expect(calendarMeta.summary).toMatch(/calendar|react-day-picker|jour/i)
  })

  it('has at least one guideline and one example', () => {
    expect(calendarMeta.guidelines.length).toBeGreaterThan(0)
    expect(calendarMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(calendarMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    calendarMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })
})
