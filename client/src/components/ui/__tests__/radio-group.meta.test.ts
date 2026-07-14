import { describe, it, expect } from 'vitest'
import { radioGroupMeta } from '../radio-group.meta'

describe('radioGroupMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(radioGroupMeta.name).toBe('RadioGroup')
    expect(radioGroupMeta.importPath).toBe('@/components/ui/radio-group')
    expect(radioGroupMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(radioGroupMeta.guidelines.length).toBeGreaterThan(0)
    expect(radioGroupMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(radioGroupMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    radioGroupMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    radioGroupMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    radioGroupMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
