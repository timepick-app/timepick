import { describe, it, expect } from 'vitest'
import { datePickerMeta } from '../date-picker.meta'

describe('datePickerMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(datePickerMeta.name).toBe('DatePicker')
    expect(datePickerMeta.importPath).toBe('@/components/ui/date-picker')
    expect(datePickerMeta.summary).toMatch(/date|calendar/i)
  })

  it('has at least one guideline and one example', () => {
    expect(datePickerMeta.guidelines.length).toBeGreaterThan(0)
    expect(datePickerMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(datePickerMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    datePickerMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })
})
