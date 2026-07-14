import { describe, it, expect } from 'vitest'
import { sidebarMeta } from '../sidebar.meta'

describe('sidebarMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(sidebarMeta.name).toBe('Sidebar')
    expect(sidebarMeta.importPath).toBe('@/components/layout/SidebarContent')
    expect(sidebarMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline, example and antiPattern', () => {
    expect(sidebarMeta.guidelines.length).toBeGreaterThan(0)
    expect(sidebarMeta.examples.length).toBeGreaterThan(0)
    expect(sidebarMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    sidebarMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('antiPatterns all have title and description', () => {
    sidebarMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    sidebarMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })

  it('documents the pitfalls hit in practice (min-w-0, SheetTitle)', () => {
    const haystack = JSON.stringify(sidebarMeta)
    expect(haystack).toMatch(/min-w-0/)
    expect(haystack).toMatch(/SheetTitle/)
  })
})
