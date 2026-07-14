import { describe, it, expect } from 'vitest'
import { progressMeta } from '../progress.meta'

describe('progressMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(progressMeta.name).toBe('Progress')
    expect(progressMeta.importPath).toBe('@/components/ui/progress')
    expect(progressMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(progressMeta.guidelines.length).toBeGreaterThan(0)
    expect(progressMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(progressMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    progressMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    progressMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    progressMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
