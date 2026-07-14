import { describe, it, expect } from 'vitest'
import { richTextEditorMeta } from '../rich-text-editor.meta'

describe('richTextEditorMeta', () => {
  it('declare les champs de premier niveau corrects', () => {
    expect(richTextEditorMeta.name).toBe('RichTextEditor')
    expect(richTextEditorMeta.importPath).toBe('@/components/ui/rich-text-editor')
    expect(richTextEditorMeta.summary.length).toBeGreaterThan(0)
  })

  it('a au moins une guideline et un exemple', () => {
    expect(richTextEditorMeta.guidelines.length).toBeGreaterThan(0)
    expect(richTextEditorMeta.examples.length).toBeGreaterThan(0)
  })

  it('a au moins un antiPattern documenté', () => {
    expect(richTextEditorMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('les antiPatterns ont tous un title et une description', () => {
    richTextEditorMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('les guidelines ont toutes rule, correct et wrong', () => {
    richTextEditorMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('les examples ont tous un label et du code', () => {
    richTextEditorMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
