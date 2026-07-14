/**
 * Unit tests for `validateShellContentPart` — Story 26.2c / AC3.
 *
 * Covers the per-part wrapper that enforces, on top of
 * `validateShellContent`:
 *   1. exactly one `<mj-section>` root,
 *   2. `data-part-kind` attribute present and coherent with the URL's
 *      `partKind` (server is the single authority for partKind coherence).
 */

import { validateShellContent, validateShellContentPart } from '../shell-content.validator'

const VALID_HEADER = `<mj-section data-part-kind="header" background-color="#000000"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`

describe('validateShellContentPart', () => {
  describe('happy path', () => {
    it('accepts a single mj-section with matching data-part-kind=header', () => {
      expect(validateShellContentPart(VALID_HEADER, 'header')).toEqual({ ok: true })
    })

    it('accepts a single mj-section for body', () => {
      const fragment = `<mj-section data-part-kind="body"><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>`
      expect(validateShellContentPart(fragment, 'body')).toEqual({ ok: true })
    })

    it('accepts a single mj-section for footer', () => {
      const fragment = `<mj-section data-part-kind="footer"><mj-column><mj-text>Bye</mj-text></mj-column></mj-section>`
      expect(validateShellContentPart(fragment, 'footer')).toEqual({ ok: true })
    })
  })

  describe('section count invariant', () => {
    it('rejects empty content', () => {
      const result = validateShellContentPart('', 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/empty|required/i)
    })

    it('rejects whitespace-only content', () => {
      const result = validateShellContentPart('   ', 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/empty|required/i)
    })

    it('rejects content without any mj-section (got 0)', () => {
      const fragment = `<mj-text>no section here</mj-text>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('Body must contain exactly one <mj-section> root (got: 0)')
    })

    it('rejects content with two mj-section roots (got 2)', () => {
      const fragment = `${VALID_HEADER}<mj-section data-part-kind="footer"><mj-column><mj-text>Y</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('Body must contain exactly one <mj-section> root (got: 2)')
    })
  })

  describe('data-part-kind coherence', () => {
    it('rejects a section without data-part-kind attribute', () => {
      const fragment = `<mj-section background-color="#fff"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('Root <mj-section> must declare data-part-kind="header"')
    })

    it('rejects mismatch: expected header, got footer', () => {
      const fragment = `<mj-section data-part-kind="footer"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('data-part-kind mismatch: expected "header", got "footer"')
    })

    it('rejects mismatch: expected body, got header', () => {
      const fragment = `<mj-section data-part-kind="header"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('data-part-kind mismatch: expected "body", got "header"')
    })
  })

  describe('whitelist delegation (regressions on validateShellContent path)', () => {
    it('rejects mj-raw inside an otherwise-valid section', () => {
      const fragment = `<mj-section data-part-kind="body"><mj-column><mj-raw><script>alert(1)</script></mj-raw></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/<mj-raw>/)
    })

    it('rejects an attribute outside the whitelist on mj-text', () => {
      const fragment = `<mj-section data-part-kind="header"><mj-column><mj-text box-shadow="0 0 10px #000">X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/box-shadow|Unrecognized key/i)
    })

    it('rejects a gradient where a hex color is expected', () => {
      const fragment = `<mj-section data-part-kind="header" background-color="linear-gradient(#fff,#000)"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/background-color/)
    })
  })

  describe('mj-column presence invariant (P23)', () => {
    it('rejects a self-closed mj-section without any mj-column child', () => {
      const fragment = `<mj-section data-part-kind="header"></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Root <mj-section> must contain at least one <mj-column>')
      }
    })

    it('rejects an mj-section whose children are not mj-column (e.g. stray mj-text at section level)', () => {
      // Edge case: mj-section with a direct mj-text child (no wrapping
      // mj-column). The whitelist would reject mj-text under mj-section
      // anyway, but the mj-column guard fires first and gives a clearer
      // error.
      const fragment = `<mj-section data-part-kind="header"><mj-text>orphan</mj-text></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Root <mj-section> must contain at least one <mj-column>')
      }
    })
  })

  describe('ordering of failures (defense-in-depth)', () => {
    it('reports section-count failure before data-part-kind failure when both are wrong', () => {
      // Two sections, both without data-part-kind. Section-count fires first.
      const fragment = `<mj-section><mj-column><mj-text>X</mj-text></mj-column></mj-section><mj-section><mj-column><mj-text>Y</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/exactly one <mj-section> root/)
    })

    it('reports data-part-kind failure before whitelist failure when both are wrong', () => {
      // Section with wrong partKind AND box-shadow inside. partKind check fires first.
      const fragment = `<mj-section data-part-kind="footer"><mj-column><mj-text box-shadow="0 0 10px #000">X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/data-part-kind mismatch/)
    })

    it('reports data-part-kind failure before mj-column failure when both are wrong', () => {
      // Section with mismatched data-part-kind AND no mj-column. partKind
      // check fires first (more specific signal for the caller than the
      // generic "empty section" message).
      const fragment = `<mj-section data-part-kind="footer"></mj-section>`
      const result = validateShellContentPart(fragment, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/data-part-kind mismatch/)
    })
  })
})

// ---------------------------------------------------------------------------
// P24 — data-part-kind value is enum-strict on validateShellContent direct calls
// ---------------------------------------------------------------------------

describe('validateShellContent — data-part-kind enum invariant (P24)', () => {
  it('accepts a section tagged with a known partKind (header)', () => {
    const fragment = `<mj-section data-part-kind="header"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
    expect(validateShellContent(fragment)).toEqual({ ok: true })
  })

  it('rejects a section tagged with an out-of-domain data-part-kind ("bogus")', () => {
    // Even without the per-part wrapper, the whitelist refuses any value
    // outside `PART_KINDS`. Defence-in-depth so a future direct consumer of
    // `validateShellContent` cannot inadvertently accept a marker the
    // resolver does not understand.
    const fragment = `<mj-section data-part-kind="bogus"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
    const result = validateShellContent(fragment)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/data-part-kind/)
  })
})

// ---------------------------------------------------------------------------
// Plan 1 du 2026-05-22 — branche mj-body (slot d'attributs du <mj-body> racine)
// ---------------------------------------------------------------------------

describe('validateShellContentPart — branche mj-body', () => {
  const VALID_FULL_ATTRS = `<mj-body background-color="#f5f5f5" padding-top="20px" padding-bottom="10px"></mj-body>`

  describe('happy path', () => {
    it('accepts a mj-body with the 3 whitelisted attrs', () => {
      expect(validateShellContentPart(VALID_FULL_ATTRS, 'mj-body')).toEqual({ ok: true })
    })

    it('accepts a mj-body with only background-color (attrs are individually optional)', () => {
      const fragment = `<mj-body background-color="#ffffff"></mj-body>`
      expect(validateShellContentPart(fragment, 'mj-body')).toEqual({ ok: true })
    })

    it('accepts a mj-body with only padding-top', () => {
      const fragment = `<mj-body padding-top="20px"></mj-body>`
      expect(validateShellContentPart(fragment, 'mj-body')).toEqual({ ok: true })
    })

    it('accepts a mj-body with no attrs (canonical "back to hardcoded defaults" payload)', () => {
      const fragment = `<mj-body></mj-body>`
      expect(validateShellContentPart(fragment, 'mj-body')).toEqual({ ok: true })
    })

    it('accepts padding-top="0" (bare zero, parité avec PxValue)', () => {
      const fragment = `<mj-body padding-top="0" padding-bottom="0"></mj-body>`
      expect(validateShellContentPart(fragment, 'mj-body')).toEqual({ ok: true })
    })

    it('accepts the maximum padding value (100px)', () => {
      const fragment = `<mj-body padding-top="100px" padding-bottom="100px"></mj-body>`
      expect(validateShellContentPart(fragment, 'mj-body')).toEqual({ ok: true })
    })
  })

  describe('mj-body count invariant', () => {
    it('rejects empty content', () => {
      const result = validateShellContentPart('', 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/empty/i)
    })

    it('rejects content without any mj-body (got 0)', () => {
      const fragment = `<mj-section><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/exactly one <mj-body> root \(got: 0\)/)
    })
  })

  describe('children invariant — slot d\'attributs uniquement', () => {
    it('rejects a mj-body with children (e.g. a stray mj-section)', () => {
      const fragment = `<mj-body background-color="#fff"><mj-section><mj-column><mj-text>X</mj-text></mj-column></mj-section></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(
          '<mj-body> for part_kind=mj-body must have no children (attributes only)',
        )
      }
    })
  })

  describe('attrs whitelist', () => {
    it('rejects an attr outside the whitelist (e.g. width)', () => {
      const fragment = `<mj-body background-color="#fff" width="600"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Invalid attribute on <mj-body>/)
    })

    it('rejects padding-left (hors périmètre Plan 1)', () => {
      const fragment = `<mj-body padding-left="10px"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Invalid attribute on <mj-body>/)
    })

    it('rejects padding shorthand (only longhand is in the Plan 1 whitelist)', () => {
      const fragment = `<mj-body padding="10px 0 10px 0"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Invalid attribute on <mj-body>/)
    })

    it('rejects a non-hex background-color', () => {
      const fragment = `<mj-body background-color="red"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/hex color/i)
    })

    it('rejects a gradient background-color (Outlook-flatten guard)', () => {
      const fragment = `<mj-body background-color="linear-gradient(#fff,#000)"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/hex color/i)
    })

    it('rejects padding-top > 100px (upper bound)', () => {
      const fragment = `<mj-body padding-top="200px"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/0-100px/)
    })

    it('rejects padding-top in em units', () => {
      const fragment = `<mj-body padding-top="2em"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/integer px/i)
    })

    it('rejects padding-top in percent', () => {
      const fragment = `<mj-body padding-top="20%"></mj-body>`
      const result = validateShellContentPart(fragment, 'mj-body')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/integer px/i)
    })
  })
})

// ---------------------------------------------------------------------------
// Plan-5b-defer-A L2 (2026-05-25) — branche content-wrapper (slot d'attributs
// d'un wrapper transversal hors-bloc). Pattern miroir mj-body : pas de
// data-part-kind requis, pas d'enfants, whitelist Outlook-safe.
// ---------------------------------------------------------------------------

describe('validateShellContentPart — branche content-wrapper', () => {
  const VALID_FULL_ATTRS = `<mj-section background-color="#f9f9f9" padding="20px" border-radius="8px"></mj-section>`

  describe('happy path', () => {
    it('accepts a content-wrapper with the canonical 3 whitelisted attrs', () => {
      expect(validateShellContentPart(VALID_FULL_ATTRS, 'content-wrapper')).toEqual({ ok: true })
    })

    it('accepts a content-wrapper with only background-color', () => {
      const fragment = `<mj-section background-color="#ffffff"></mj-section>`
      expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
    })

    it('accepts padding longhand (padding-top/bottom/left/right)', () => {
      const fragment = `<mj-section padding-top="10px" padding-bottom="20px" padding-left="15px" padding-right="15px"></mj-section>`
      expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
    })

    it('accepts a content-wrapper with no attrs (canonical "back to defaults")', () => {
      const fragment = `<mj-section></mj-section>`
      expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
    })

    it('accepts a border-radius 1-4 shorthand', () => {
      const fragment = `<mj-section border-radius="4px 8px 4px 8px"></mj-section>`
      expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
    })

    it('accepts a padding "0" bare zero (parité avec PxValue)', () => {
      const fragment = `<mj-section padding="0"></mj-section>`
      expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
    })
  })

  describe('section count invariant', () => {
    it('rejects empty content', () => {
      const result = validateShellContentPart('', 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/empty/i)
    })

    it('rejects content without any mj-section root (got 0)', () => {
      const fragment = `<mj-body><mj-text>X</mj-text></mj-body>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/exactly one <mj-section> root/)
    })

    it('rejects two mj-section roots', () => {
      const fragment = `<mj-section padding="10px"></mj-section><mj-section padding="20px"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/exactly one <mj-section> root \(got: 2\)/)
    })
  })

  describe("children invariant — slot d'attributs uniquement", () => {
    it('rejects a mj-section with mj-column child', () => {
      const fragment = `<mj-section background-color="#f9f9f9"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/no children/)
    })
  })

  describe('attrs whitelist', () => {
    it('rejects an attr outside the whitelist (color)', () => {
      const fragment = `<mj-section color="#ff0000" padding="20px"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Invalid attribute on <mj-section> for content-wrapper/)
    })

    it('rejects font-family (out of allowlist)', () => {
      const fragment = `<mj-section font-family="Inter, sans-serif"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Invalid attribute on <mj-section> for content-wrapper/)
    })

    it('rejects width (out of allowlist — content-wrapper is not a structural section)', () => {
      const fragment = `<mj-section width="600px"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Invalid attribute on <mj-section> for content-wrapper/)
    })

    it('rejects a non-hex background-color', () => {
      const fragment = `<mj-section background-color="red"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/hex color/i)
    })

    it('rejects a gradient background-color (Outlook-flatten guard)', () => {
      const fragment = `<mj-section background-color="linear-gradient(#fff,#000)"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/hex color/i)
    })

    it('rejects border-radius in non-px units', () => {
      const fragment = `<mj-section border-radius="0.5rem"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/border-radius/)
    })

    it('rejects padding in em units', () => {
      const fragment = `<mj-section padding="2em"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/integer pixel/i)
    })

    it('rejects data-part-kind (not required for content-wrapper, miroir mj-body)', () => {
      const fragment = `<mj-section data-part-kind="content-wrapper"></mj-section>`
      const result = validateShellContentPart(fragment, 'content-wrapper')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Invalid attribute on <mj-section> for content-wrapper/)
    })
  })
})
