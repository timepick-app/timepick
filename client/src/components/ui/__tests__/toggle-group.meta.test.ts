import { describe, it, expect } from 'vitest'
import { toggleGroupMeta } from '../toggle-group.meta'
import { __toggleVariantKeys, __toggleSizeKeys } from '../toggle'

describe('toggleGroupMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(toggleGroupMeta.name).toBe('ToggleGroup')
    expect(toggleGroupMeta.importPath).toBe('@/components/ui/toggle-group')
    expect(toggleGroupMeta.summary).toMatch(/exclusi|toggle|radix/i)
  })

  it('variants match the toggle variant keys (drift guard)', () => {
    const metaVariantNames = toggleGroupMeta.variants.map((v) => v.name)
    expect([...metaVariantNames].sort()).toEqual([...__toggleVariantKeys].sort())
  })

  it('sizes match the toggle size keys (drift guard)', () => {
    const metaSizeNames = toggleGroupMeta.sizes.map((s) => s.name)
    expect([...metaSizeNames].sort()).toEqual([...__toggleSizeKeys].sort())
  })

  it('has at least one guideline and one example', () => {
    expect(toggleGroupMeta.guidelines.length).toBeGreaterThan(0)
    expect(toggleGroupMeta.examples.length).toBeGreaterThan(0)
  })
})
