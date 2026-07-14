import { describe, it, expect } from 'vitest'
import { inputMeta } from '../input.meta'
import { __inputSizeKeys } from '../input'

describe('inputMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(inputMeta.name).toBe('Input')
    expect(inputMeta.importPath).toBe('@/components/ui/input')
    expect(inputMeta.summary.length).toBeGreaterThan(0)
  })

  it('sizes match the input size keys (drift guard)', () => {
    const metaSizeNames = inputMeta.sizes.map((s) => s.name)
    expect(metaSizeNames.sort()).toEqual([...__inputSizeKeys].sort())
  })

  it('has at least one guideline and one example', () => {
    expect(inputMeta.guidelines.length).toBeGreaterThan(0)
    expect(inputMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(inputMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    inputMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    inputMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    inputMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
