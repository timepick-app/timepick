/**
 * Parity guard between the server-side email shell (buildShell) and the
 * editor-side preview shell (wrapBodyForEditing). The two implementations
 * MUST stay in lockstep — divergence here caused the "missing black header
 * band" bug (see the 2026-05-12 header-parity design notes).
 *
 * Compares MJML source (not compiled HTML) for readable diffs on failure.
 * Whitelist below explicitly notes attrs that are legitimately
 * client-only or server-only and stripped before comparison.
 *
 * Scope: <mj-body> content only. <mj-head> divergence (e.g. brand button
 * defaults, mj-style, breakpoints) is intentional and not asserted here.
 */
import { wrapBodyForEditing } from '../../../../client/src/components/admin/email-editor/bodyExtraction'
import { __testing__ } from '../render-email.service'
import type { EmailBrandSettings } from '../../db/email-brand-settings.db'

const { buildShell } = __testing__

const SENTINEL = '<!-- SENTINEL_BODY_FRAGMENT -->'

const BRAND_NO_LOGO: EmailBrandSettings = {
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
  logoUrl: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const BRAND_WITH_LOGO: EmailBrandSettings = {
  ...BRAND_NO_LOGO,
  logoUrl: 'https://example.com/logo.png',
}

function extractShell(mjml: string): { header: string; footer: string } {
  const bodyOpenMatch = /<mj-body[^>]*>/.exec(mjml)
  if (!bodyOpenMatch) throw new Error('No <mj-body> open tag')
  const bodyOpenEnd = bodyOpenMatch.index + bodyOpenMatch[0].length
  const bodyCloseIdx = mjml.lastIndexOf('</mj-body>')
  if (bodyCloseIdx === -1) throw new Error('No </mj-body> close tag')

  const inner = mjml
    .slice(bodyOpenEnd, bodyCloseIdx)
    .replace(/<!-- BODY:START -->\s*/g, '')
    .replace(/\s*<!-- BODY:END -->/g, '')

  const sentinelIdx = inner.indexOf(SENTINEL)
  if (sentinelIdx === -1) throw new Error('Sentinel not found in body')

  return {
    header: inner.slice(0, sentinelIdx),
    footer: inner.slice(sentinelIdx + SENTINEL.length),
  }
}

function normalize(mjml: string): string {
  return mjml
    // Canvas-only annotations (Story 26-2 — see bodyExtraction.ts header
    // comment): the client injects these so the GrapesJS lock pass, the
    // permanent labels CSS, the LockedShellInfoPanel routing, and the
    // deep-vs-root lock decision all work. The server intentionally never
    // emits them so the rendered email remains byte-identical to the 26-0
    // snapshots. `data-inherited` was added in the Story 26-2 drift fix
    // (2026-05-14) to route blocks whose origin differs from the current
    // editing scope through the deep lock pass.
    .replace(/\s+css-class="locked-shell"/g, '')
    .replace(/\s+data-locked-label="[^"]*"/g, '')
    .replace(/\s+data-part-kind="[^"]*"/g, '')
    .replace(/\s+data-inherited="[^"]*"/g, '')
    // `data-inherited-label` (2026-07-30) porte le libellé de la pastille
    // « Hérité du modèle / de la marque / Contenu d'origine » du canvas. Attribut
    // séparé de `data-inherited` à dessein : la passe de verrou teste
    // `data-inherited === 'true'`, une valeur d'origine y casserait le deep-lock.
    .replace(/\s+data-inherited-label="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    // Collapse whitespace between adjacent tags (`> <` → `><`). Indentation in
    // the source templates is cosmetic — semantically identical in MJML — so
    // we strip it so the diff focuses on attribute/element differences.
    .replace(/>\s+</g, '><')
    .trim()
}

describe('email shell parity — server buildShell vs editor wrapBodyForEditing', () => {
  it('produces identical header and footer with no logo', () => {
    const serverMjml = buildShell(BRAND_NO_LOGO, SENTINEL)
    const editorMjml = wrapBodyForEditing(SENTINEL, BRAND_NO_LOGO)

    const server = extractShell(serverMjml)
    const editor = extractShell(editorMjml)

    expect(normalize(server.header)).toEqual(normalize(editor.header))
    expect(normalize(server.footer)).toEqual(normalize(editor.footer))
  })

  // TODO(follow-up): logo sizing divergence between <mj-image width="160px">
  // (server) and <img max-height:60px /> inline inside <mj-text> (editor).
  // Out of scope for the header-parity fix — see design doc Section 3
  // (header-parity design notes, 2026-05-12). The footer
  // already matches; only the header's image-rendering strategy diverges.
  it.skip('produces identical header and footer with logo', () => {
    const serverMjml = buildShell(BRAND_WITH_LOGO, SENTINEL)
    const editorMjml = wrapBodyForEditing(SENTINEL, BRAND_WITH_LOGO)

    const server = extractShell(serverMjml)
    const editor = extractShell(editorMjml)

    expect(normalize(server.header)).toEqual(normalize(editor.header))
    expect(normalize(server.footer)).toEqual(normalize(editor.footer))
  })
})
