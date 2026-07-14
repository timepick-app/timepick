import { describe, it, expect } from 'vitest'
import { textareaMeta } from '../textarea.meta'

describe('textareaMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(textareaMeta.name).toBe('Textarea')
    expect(textareaMeta.importPath).toBe('@/components/ui/textarea')
    expect(textareaMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(textareaMeta.guidelines.length).toBeGreaterThan(0)
    expect(textareaMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(textareaMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    textareaMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    textareaMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    textareaMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
