import { describe, it, expect } from 'vitest'
import { timePickerMeta } from '../time-picker.meta'

describe('timePickerMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(timePickerMeta.name).toBe('TimePicker')
    expect(timePickerMeta.importPath).toBe('@/components/ui/time-picker')
    expect(timePickerMeta.summary).toMatch(/heure|time/i)
  })

  it('has at least one guideline and one example', () => {
    expect(timePickerMeta.guidelines.length).toBeGreaterThan(0)
    expect(timePickerMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(timePickerMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    timePickerMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })
})
