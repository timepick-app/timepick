import { describe, it, expect } from 'vitest'
import { buttonMeta } from '../button.meta'
import { __buttonVariantKeys, __buttonSizeKeys } from '../button'

describe('buttonMeta', () => {
  it('declares the correct top-level fields', () => {
    expect(buttonMeta.name).toBe('Button')
    expect(buttonMeta.importPath).toBe('@/components/ui/button')
    expect(buttonMeta.summary).toMatch(/bouton|action/i)
  })

  it('variants match the button variant keys (drift guard)', () => {
    const metaVariantNames = buttonMeta.variants.map(v => v.name)
    expect(metaVariantNames.sort()).toEqual([...__buttonVariantKeys].sort())
  })

  it('sizes match the button size keys (drift guard)', () => {
    const metaSizeNames = buttonMeta.sizes.map(s => s.name)
    expect(metaSizeNames.sort()).toEqual([...__buttonSizeKeys].sort())
  })

  it('has at least one guideline and one example', () => {
    expect(buttonMeta.guidelines.length).toBeGreaterThan(0)
    expect(buttonMeta.examples.length).toBeGreaterThan(0)
  })
})
