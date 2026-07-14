/**
 * Unit tests for `recoupleHeaderLogo` (Drawbridge #29).
 *
 * The brand logo is a brand token; baking it into a `shell_parts` header
 * override froze it (resetting/changing `brand.logoUrl` no longer reached the
 * header). `recoupleHeaderLogo` re-derives the header's logo/text content from
 * `brand.logoUrl` while preserving the override's structural `<mj-section>` /
 * `<mj-column>` attributes. These cases are pure-function (no DB).
 */
import {
  recoupleHeaderLogo,
  HARDCODED_HEADER_TEXT,
  hardcodedHeaderLogo,
} from '../shell-hardcoded-fallback'

// Faithful to the field-reported override (Drawbridge #29 repro): a template
// header that baked the brand logo into `<mj-image src>` plus the canvas
// `data-part-kind` marker — structurally identical to the hardcoded fragment.
const OVERRIDE_WITH_LOGO =
  '<mj-section background-color="#18181b" padding="20px" data-part-kind="header">' +
  '<mj-column><mj-image src="https://cdn.example.com/old-logo.webp" alt="TimePick" width="160px"></mj-image></mj-column>' +
  '</mj-section>'

// A header override that customizes a structural attr (background) and carries
// the text fallback — no logo image.
const OVERRIDE_TEXT_ONLY =
  '<mj-section background-color="#0a0a0a" padding="24px" data-part-kind="header">' +
  '<mj-column><mj-text color="#ffffff" font-size="22px" font-weight="bold" align="center">TimePick</mj-text></mj-column>' +
  '</mj-section>'

describe('recoupleHeaderLogo (Drawbridge #29)', () => {
  describe('logoUrl null — header falls back to the TimePick text', () => {
    it('swaps a baked logo image for the text fallback (the reset bug)', () => {
      const out = recoupleHeaderLogo(OVERRIDE_WITH_LOGO, null)

      expect(out).not.toContain('<mj-image')
      expect(out).not.toContain('old-logo.webp')
      expect(out).toContain('>TimePick</mj-text>')
    })

    it('preserves the override structural attrs while swapping to text', () => {
      const out = recoupleHeaderLogo(OVERRIDE_WITH_LOGO, null)

      // mj-section attrs (background, padding, data-part-kind) untouched.
      expect(out).toContain(
        '<mj-section background-color="#18181b" padding="20px" data-part-kind="header">',
      )
      // The injected text matches the hardcoded fallback's <mj-text> verbatim.
      expect(out).toContain(
        '<mj-text color="#000000" font-size="22px" font-weight="bold" align="center">TimePick</mj-text>',
      )
    })

    it('leaves a text-only override unchanged (custom structure preserved)', () => {
      expect(recoupleHeaderLogo(OVERRIDE_TEXT_ONLY, null)).toBe(OVERRIDE_TEXT_ONLY)
    })
  })

  describe('logoUrl set — header shows the brand logo', () => {
    it('refreshes the src of an existing logo image in place (propagation bug)', () => {
      const out = recoupleHeaderLogo(OVERRIDE_WITH_LOGO, 'https://cdn.example.com/new-logo.webp')

      expect(out).toContain('src="https://cdn.example.com/new-logo.webp"')
      expect(out).not.toContain('old-logo.webp')
      // No structural churn: alt/width and the section attrs are preserved.
      expect(out).toContain('alt="TimePick" width="160px"')
      expect(out).toContain(
        '<mj-section background-color="#18181b" padding="20px" data-part-kind="header">',
      )
    })

    it('swaps a text fallback for a logo image when a logo is set', () => {
      const out = recoupleHeaderLogo(OVERRIDE_TEXT_ONLY, 'https://cdn.example.com/logo.png')

      expect(out).toContain('<mj-image src="https://cdn.example.com/logo.png"')
      expect(out).not.toContain('<mj-text')
      // Structural override attrs preserved across the swap.
      expect(out).toContain(
        '<mj-section background-color="#0a0a0a" padding="24px" data-part-kind="header">',
      )
    })

    it('does not mangle a logo URL containing "$" (function replacer)', () => {
      const tricky = 'https://cdn.example.com/$logo$1.webp?v=$2'
      const out = recoupleHeaderLogo(OVERRIDE_WITH_LOGO, tricky)

      expect(out).toContain(`src="${tricky}"`)
    })

    it('does not mangle a "$" URL on the text→logo rebuild path either', () => {
      const tricky = 'https://cdn.example.com/$logo$1.webp?v=$2'
      const out = recoupleHeaderLogo(OVERRIDE_TEXT_ONLY, tricky)

      expect(out).toContain(`src="${tricky}"`)
    })

    it('rebuilds the inner when the <mj-image> has no src attribute (defensive)', () => {
      const noSrc =
        '<mj-section padding="20px" data-part-kind="header"><mj-column><mj-image alt="x"></mj-image></mj-column></mj-section>'
      const out = recoupleHeaderLogo(noSrc, 'https://cdn.example.com/logo.png')

      expect(out).toContain('<mj-image src="https://cdn.example.com/logo.png"')
    })
  })

  describe('idempotency', () => {
    it('re-applying with the same logoUrl is stable', () => {
      const once = recoupleHeaderLogo(OVERRIDE_WITH_LOGO, 'https://cdn.example.com/new-logo.webp')
      const twice = recoupleHeaderLogo(once, 'https://cdn.example.com/new-logo.webp')
      expect(twice).toBe(once)
    })

    it('re-applying with null is stable', () => {
      const once = recoupleHeaderLogo(OVERRIDE_WITH_LOGO, null)
      const twice = recoupleHeaderLogo(once, null)
      expect(twice).toBe(once)
    })
  })

  describe('hardcoded fragments are self-consistent with re-coupling', () => {
    // The text fallback injected on logoUrl=null is the same <mj-text> the
    // hardcoded path emits, so an override and the hardcoded header read alike.
    it('injected text inner matches HARDCODED_HEADER_TEXT', () => {
      expect(HARDCODED_HEADER_TEXT).toContain(
        '<mj-text color="#000000" font-size="22px" font-weight="bold" align="center">TimePick</mj-text>',
      )
    })

    it('injected logo inner matches the hardcoded logo image shape', () => {
      const url = 'https://cdn.example.com/logo.png'
      const out = recoupleHeaderLogo(OVERRIDE_TEXT_ONLY, url)
      // hardcodedHeaderLogo emits the same <mj-image ...> attributes.
      expect(hardcodedHeaderLogo(url)).toContain(
        `<mj-image src="${url}" alt="TimePick" width="160px" align="center">`,
      )
      expect(out).toContain(
        `<mj-image src="${url}" alt="TimePick" width="160px" align="center">`,
      )
    })
  })

  describe('non-canonical headers are passed through untouched (guard)', () => {
    // The validator permits richer headers (multiple columns/images) but the
    // editor never produces them; we cannot tell which node is the logo, so we
    // must not rewrite the wrong element. Pre-#29 verbatim behavior is kept.
    const MULTI_COLUMN =
      '<mj-section data-part-kind="header"><mj-column><mj-text>Hi</mj-text></mj-column>' +
      '<mj-column><mj-image src="https://cdn.example.com/old-logo.webp" alt="logo" width="160px"></mj-image></mj-column>' +
      '</mj-section>'
    const MULTI_IMAGE =
      '<mj-section data-part-kind="header"><mj-column>' +
      '<mj-image src="https://cdn.example.com/banner.png" alt="banner"></mj-image>' +
      '<mj-image src="https://cdn.example.com/old-logo.webp" alt="logo"></mj-image>' +
      '</mj-column></mj-section>'

    it('returns a multi-column header unchanged on reset (no first-column-only rewrite)', () => {
      expect(recoupleHeaderLogo(MULTI_COLUMN, null)).toBe(MULTI_COLUMN)
    })

    it('returns a multi-image header unchanged on logo change (no wrong-image overwrite)', () => {
      expect(recoupleHeaderLogo(MULTI_IMAGE, 'https://cdn.example.com/new-logo.png')).toBe(MULTI_IMAGE)
    })
  })
})
