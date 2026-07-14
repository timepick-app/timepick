export interface MetaVariant {
  name: string
  description: string
  whenToUse?: string
  cssHint?: string
}

export interface MetaSize {
  name: string
  description: string
  cssHint?: string
}

export interface MetaGuideline {
  rule: string
  correct: string
  wrong: string
}

export interface MetaAntiPattern {
  title: string
  description: string
}

export interface MetaExample {
  label: string
  code: string
}

export interface MetaAxis {
  name: string
  description: string
  items: MetaVariant[]
}

export interface ComponentMeta {
  name: string
  importPath: string
  summary: string
  variants: MetaVariant[]
  sizes: MetaSize[]
  guidelines: MetaGuideline[]
  antiPatterns: MetaAntiPattern[]
  examples: MetaExample[]
  extraAxes?: MetaAxis[]
}

export interface GlobalConventions {
  title: string
  intro: string
  sections: { heading: string; body: string; examples?: MetaExample[] }[]
}
