import { describe, it, expect } from 'vitest'
import { tooltipMeta } from '../tooltip.meta'

describe('tooltipMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(tooltipMeta.name).toBe('Tooltip')
    expect(tooltipMeta.importPath).toBe('@/components/ui/tooltip')
    expect(tooltipMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(tooltipMeta.guidelines.length).toBeGreaterThan(0)
    expect(tooltipMeta.examples.length).toBeGreaterThan(0)
  })


  it('guidelines all have rule, correct, and wrong examples', () => {
    tooltipMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    tooltipMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
