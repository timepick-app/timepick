import { describe, it, expect } from 'vitest'
import { sliderMeta } from '../slider.meta'

describe('sliderMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(sliderMeta.name).toBe('Slider')
    expect(sliderMeta.importPath).toBe('@/components/ui/slider')
    expect(sliderMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(sliderMeta.guidelines.length).toBeGreaterThan(0)
    expect(sliderMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(sliderMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    sliderMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    sliderMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    sliderMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
