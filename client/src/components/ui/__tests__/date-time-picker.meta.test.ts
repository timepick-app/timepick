import { describe, it, expect } from 'vitest'
import { dateTimePickerMeta } from '../date-time-picker.meta'

describe('dateTimePickerMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(dateTimePickerMeta.name).toBe('DateTimePicker')
    expect(dateTimePickerMeta.importPath).toBe('@/components/ui/date-time-picker')
    expect(dateTimePickerMeta.summary).toMatch(/date|heure|time/i)
  })

  it('has at least one guideline and one example', () => {
    expect(dateTimePickerMeta.guidelines.length).toBeGreaterThan(0)
    expect(dateTimePickerMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(dateTimePickerMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    dateTimePickerMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })
})
