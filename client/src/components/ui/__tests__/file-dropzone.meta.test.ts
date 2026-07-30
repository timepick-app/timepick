import { describe, it, expect } from 'vitest'
import { fileDropzoneMeta } from '../file-dropzone.meta'

describe('fileDropzoneMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(fileDropzoneMeta.name).toBe('FileDropzone')
    expect(fileDropzoneMeta.importPath).toBe('@/components/ui/file-dropzone')
    expect(fileDropzoneMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline and one example', () => {
    expect(fileDropzoneMeta.guidelines.length).toBeGreaterThan(0)
    expect(fileDropzoneMeta.examples.length).toBeGreaterThan(0)
  })

  it('has at least one antiPattern documented', () => {
    expect(fileDropzoneMeta.antiPatterns.length).toBeGreaterThan(0)
  })

  it('antiPatterns all have title and description', () => {
    fileDropzoneMeta.antiPatterns.forEach((ap) => {
      expect(ap.title.length).toBeGreaterThan(0)
      expect(ap.description.length).toBeGreaterThan(0)
    })
  })

  it('guidelines all have rule, correct, and wrong examples', () => {
    fileDropzoneMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('examples all have a label and code', () => {
    fileDropzoneMeta.examples.forEach((ex) => {
      expect(ex.label.length).toBeGreaterThan(0)
      expect(ex.code.length).toBeGreaterThan(0)
    })
  })
})
