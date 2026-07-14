import { describe, it, expect } from 'vitest'
import {
  detectOutlookIncompatibilities,
  type EmailCompatIssue,
} from '../emailCompatibility'

describe('detectOutlookIncompatibilities', () => {
  it('retourne tableau vide quand toutes les sources sont absentes', () => {
    expect(detectOutlookIncompatibilities({})).toEqual([])
    expect(detectOutlookIncompatibilities({ body: '' })).toEqual([])
    expect(detectOutlookIncompatibilities({ body: undefined })).toEqual([])
    expect(detectOutlookIncompatibilities({ body: null })).toEqual([])
  })

  it("retourne tableau vide quand aucun border-radius n'est présent", () => {
    const mjml = `
      <mj-section padding="0">
        <mj-column>
          <mj-text>Hello</mj-text>
          <mj-button background-color="#000">Réserver</mj-button>
        </mj-column>
      </mj-section>
    `
    expect(detectOutlookIncompatibilities({ body: mjml })).toEqual([])
  })

  it('détecte border-radius >0 sur mj-section (attribut MJML)', () => {
    const mjml = '<mj-section border-radius="4px"><mj-column /></mj-section>'
    const issues = detectOutlookIncompatibilities({ body: mjml })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject<EmailCompatIssue>({
      id: 'border-radius',
      severity: 'warning',
      message: expect.stringContaining('coins arrondis') as unknown as string,
      sources: ['body'],
    })
  })

  it('détecte border-radius >0 sur mj-button (attribut MJML)', () => {
    const mjml = '<mj-button border-radius="12px">CTA</mj-button>'
    expect(detectOutlookIncompatibilities({ body: mjml })).toHaveLength(1)
  })

  it('détecte border-radius dans un style CSS inline', () => {
    const mjml = '<mj-section css-style="border-radius: 6px;"></mj-section>'
    expect(detectOutlookIncompatibilities({ body: mjml })).toHaveLength(1)
  })

  it('détecte un shorthand multi-valeurs dont au moins une >0', () => {
    const mjml = '<mj-section border-radius="0 4px 0 4px"></mj-section>'
    expect(detectOutlookIncompatibilities({ body: mjml })).toHaveLength(1)
  })

  it('ignore un shorthand entièrement à zéro', () => {
    const mjml = '<mj-section border-radius="0 0 0 0"></mj-section>'
    expect(detectOutlookIncompatibilities({ body: mjml })).toEqual([])
  })

  it('ignore border-radius="0" et border-radius="0px"', () => {
    expect(
      detectOutlookIncompatibilities({
        body: '<mj-button border-radius="0">A</mj-button>',
      }),
    ).toEqual([])
    expect(
      detectOutlookIncompatibilities({
        body: '<mj-button border-radius="0px">A</mj-button>',
      }),
    ).toEqual([])
  })

  it('dédoublonne par id : plusieurs occurrences border-radius >0 → une seule entrée', () => {
    const mjml = `
      <mj-section border-radius="4px"></mj-section>
      <mj-section border-radius="8px"></mj-section>
      <mj-button border-radius="12px">CTA</mj-button>
    `
    const issues = detectOutlookIncompatibilities({ body: mjml })
    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe('border-radius')
  })

  it('remonte la provenance des sources matchées (header + body)', () => {
    const issues = detectOutlookIncompatibilities({
      header: '<mj-section border-radius="4px"></mj-section>',
      body: '<mj-button border-radius="8px">CTA</mj-button>',
      footer: '<mj-text>Footer</mj-text>',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0].sources).toEqual(['header', 'body'])
  })

  it("remonte la provenance dans l'ordre header → body → footer", () => {
    const issues = detectOutlookIncompatibilities({
      footer: '<mj-section border-radius="4px"></mj-section>',
      header: '<mj-section border-radius="4px"></mj-section>',
    })
    expect(issues[0].sources).toEqual(['header', 'footer'])
  })

  it('reste idempotent sur appels successifs (pas de fuite de lastIndex regex)', () => {
    const mjml = '<mj-section border-radius="4px"></mj-section>'
    const first = detectOutlookIncompatibilities({ body: mjml })
    const second = detectOutlookIncompatibilities({ body: mjml })
    const third = detectOutlookIncompatibilities({ body: mjml })
    expect(first).toEqual(second)
    expect(second).toEqual(third)
    expect(first[0].sources).toEqual(['body'])
  })
})
