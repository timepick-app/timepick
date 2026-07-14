import { describe, it, expect } from 'vitest'
import { skeletonMeta } from '../skeleton.meta'

describe('skeletonMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(skeletonMeta.name).toBe('Skeleton')
    expect(skeletonMeta.importPath).toBe('@/components/ui/skeleton')
    expect(skeletonMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(skeletonMeta.guidelines.length).toBeGreaterThan(0)
    expect(skeletonMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(skeletonMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    skeletonMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    skeletonMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    skeletonMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
