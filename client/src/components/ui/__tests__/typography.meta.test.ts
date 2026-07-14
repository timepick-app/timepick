import { describe, it, expect } from 'vitest'
import { typographyMeta } from '../typography.meta'
import { __typographyVariantKeys, __typographyColorKeys, __typographyWeightKeys } from '../typography'

describe('typographyMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(typographyMeta.name).toBe('Typography')
    expect(typographyMeta.importPath).toBe('@/components/ui/typography')
    expect(typographyMeta.summary).toMatch(/typographi|typography/i)
  })

  it('variants match the cva variant axis (drift guard)', () => {
    expect(typographyMeta.variants.map(v => v.name).sort()).toEqual([...__typographyVariantKeys].sort())
  })

  it('extraAxes contains color and weight axes (drift guard)', () => {
    const colorAxis = typographyMeta.extraAxes?.find(a => a.name === 'color')
    const weightAxis = typographyMeta.extraAxes?.find(a => a.name === 'weight')
    expect(colorAxis).toBeDefined()
    expect(weightAxis).toBeDefined()
    expect(colorAxis?.items.map(i => i.name).sort()).toEqual([...__typographyColorKeys].sort())
    expect(weightAxis?.items.map(i => i.name).sort()).toEqual([...__typographyWeightKeys].sort())
  })

  it('has at least one anti-pattern and example', () => {
    expect(typographyMeta.antiPatterns.length).toBeGreaterThan(0)
    expect(typographyMeta.examples.length).toBeGreaterThan(0)
  })
})
