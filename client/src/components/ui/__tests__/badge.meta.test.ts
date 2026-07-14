import { describe, it, expect } from 'vitest'
import { badgeMeta } from '../badge.meta'
import { __badgeVariantKeys, __badgeSizeKeys, __badgeAppearanceKeys } from '../badge'

describe('badgeMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(badgeMeta.name).toBe('Badge')
    expect(badgeMeta.importPath).toBe('@/components/ui/badge')
    expect(badgeMeta.summary).toMatch(/badge|statut/i)
  })

  it('variants match the variantStyles record (drift guard)', () => {
    expect(badgeMeta.variants.map(v => v.name).sort()).toEqual([...__badgeVariantKeys].sort())
  })

  it('sizes match the sizeStyles record (drift guard)', () => {
    expect(badgeMeta.sizes.map(s => s.name).sort()).toEqual([...__badgeSizeKeys].sort())
  })

  it('appearance axis matches the appearance keys (drift guard)', () => {
    const axis = badgeMeta.extraAxes?.find((a) => a.name === 'appearance')
    expect(axis?.items.map((i) => i.name).sort()).toEqual([...__badgeAppearanceKeys].sort())
  })

  it('has at least one guideline and one example', () => {
    expect(badgeMeta.guidelines.length).toBeGreaterThan(0)
    expect(badgeMeta.examples.length).toBeGreaterThan(0)
  })
})
