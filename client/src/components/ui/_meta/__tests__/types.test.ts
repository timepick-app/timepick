import { describe, it, expectTypeOf } from 'vitest'
import type { ComponentMeta, MetaVariant, MetaGuideline, MetaExample, MetaAxis } from '../types'

describe('ComponentMeta type contract', () => {
  it('has the required top-level fields', () => {
    const sample: ComponentMeta = {
      name: 'Sample',
      importPath: '@/components/ui/sample',
      summary: 'A sample component.',
      variants: [],
      sizes: [],
      guidelines: [],
      antiPatterns: [],
      examples: [],
    }
    expectTypeOf(sample.name).toEqualTypeOf<string>()
    expectTypeOf(sample.variants).toEqualTypeOf<MetaVariant[]>()
  })

  it('MetaVariant requires name + description', () => {
    const v: MetaVariant = { name: 'default', description: 'Action principale' }
    expectTypeOf(v.name).toEqualTypeOf<string>()
  })

  it('MetaGuideline shape (correct/wrong/rule)', () => {
    const g: MetaGuideline = {
      rule: 'Use Button, not raw <button>',
      correct: '<Button>OK</Button>',
      wrong: '<button>OK</button>',
    }
    expectTypeOf(g).toMatchTypeOf<MetaGuideline>()
  })

  it('MetaExample requires label + code', () => {
    const e: MetaExample = { label: 'Import', code: "import { Sample } from '...'" }
    expectTypeOf(e).toMatchTypeOf<MetaExample>()
  })

  it('ComponentMeta supports optional extraAxes', () => {
    const sample: ComponentMeta = {
      name: 'Sample',
      importPath: '@/components/ui/sample',
      summary: 'Sample.',
      variants: [],
      sizes: [],
      guidelines: [],
      antiPatterns: [],
      examples: [],
      extraAxes: [
        { name: 'color', description: 'Couleur', items: [{ name: 'red', description: 'Rouge' }] },
      ],
    }
    expectTypeOf(sample.extraAxes).toEqualTypeOf<MetaAxis[] | undefined>()
  })
})
