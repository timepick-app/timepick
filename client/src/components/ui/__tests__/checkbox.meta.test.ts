import { describe, it, expect } from 'vitest'
import { checkboxMeta } from '../checkbox.meta'

describe('checkboxMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(checkboxMeta.name).toBe('Checkbox')
    expect(checkboxMeta.importPath).toBe('@/components/ui/checkbox')
    expect(checkboxMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(checkboxMeta.guidelines.length).toBeGreaterThan(0)
    expect(checkboxMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(checkboxMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    checkboxMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    checkboxMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    checkboxMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
