import { describe, it, expect } from 'vitest'
import { globalConventions } from '../_global.meta'

describe('globalConventions', () => {
  it('declares the cross-cutting conventions section', () => {
    expect(globalConventions.title).toBe('Conventions transverses')
    expect(globalConventions.intro).toMatch(/TOUS les composants/i)
    expect(globalConventions.sections.length).toBeGreaterThanOrEqual(2)
  })

  it('documents the button alignment rules R1–R4', () => {
    const alignment = globalConventions.sections.find((s) =>
      /Alignement des groupes de boutons/i.test(s.heading),
    )
    expect(alignment).toBeDefined()
    for (const rule of ['R1', 'R2', 'R3', 'R4']) {
      expect(alignment!.body).toContain(rule)
    }
    expect(alignment!.body).toContain('justify-end')
    expect(alignment!.body).toMatch(/dernier enfant DOM/i)
    expect(alignment!.body).toMatch(/une seule action/i)
  })

  it('lists the closed set of derogations D1–D6', () => {
    const derogations = globalConventions.sections.find((s) =>
      /Dérogations/i.test(s.heading),
    )
    expect(derogations).toBeDefined()
    for (const code of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) {
      expect(derogations!.body).toContain(code)
    }
  })

  it('attaches at least one example to every section', () => {
    for (const section of globalConventions.sections) {
      expect(section.examples?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
