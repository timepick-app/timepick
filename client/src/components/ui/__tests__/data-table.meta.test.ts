import { describe, it, expect } from 'vitest'
import { dataTableMeta } from '../data-table.meta'
import * as dataTable from '../data-table'

describe('dataTableMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(dataTableMeta.name).toBe('DataTable')
    expect(dataTableMeta.importPath).toBe('@/components/ui/data-table')
    expect(dataTableMeta.summary.length).toBeGreaterThan(0)
  })

  it('has at least one guideline, antiPattern and example', () => {
    expect(dataTableMeta.guidelines.length).toBeGreaterThan(0)
    expect(dataTableMeta.antiPatterns.length).toBeGreaterThan(0)
    expect(dataTableMeta.examples.length).toBeGreaterThan(0)
  })

  it('guidelines all have rule, correct and wrong examples', () => {
    dataTableMeta.guidelines.forEach((g) => {
      expect(g.rule.length).toBeGreaterThan(0)
      expect(g.correct.length).toBeGreaterThan(0)
      expect(g.wrong.length).toBeGreaterThan(0)
    })
  })

  it('documents the composable parts via extraAxes', () => {
    const parts = dataTableMeta.extraAxes?.find((a) => a.name === 'Parties')
    expect(parts).toBeDefined()
    expect(parts!.items.length).toBeGreaterThanOrEqual(6)
  })

  it('every documented part exists as a runtime export (drift guard)', () => {
    const exported = new Set(Object.keys(dataTable))
    const parts = dataTableMeta.extraAxes?.find((a) => a.name === 'Parties')
    parts!.items.forEach((item) => {
      expect(exported.has(item.name)).toBe(true)
    })
  })
})
