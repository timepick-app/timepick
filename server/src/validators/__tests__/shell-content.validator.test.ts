/**
 * Unit tests for shell-content.validator.ts — Outlook-safe whitelist.
 *
 * Covers refused CSS property values (relative units, modern CSS functions) and
 * the hardcoded fallback fragments (valid baseline).
 *
 * Story 26.1 / T4.8.
 */

import { validateShellContent, validateShellContentPart } from '../shell-content.validator'
import {
  HARDCODED_FOOTER,
  HARDCODED_HEADER_TEXT,
  hardcodedHeaderLogo,
} from '../../services/shell-hardcoded-fallback'
import {
  SHELL_CONTENT_MAX_DEPTH,
  SHELL_CONTENT_MAX_LEN,
} from '../../lib/email-validation-patterns'

describe('shell-content.validator', () => {
  describe('valid baselines (must accept the pre-26-1 fragments)', () => {
    it('accepts HARDCODED_HEADER_TEXT', () => {
      expect(validateShellContent(HARDCODED_HEADER_TEXT)).toEqual({ ok: true })
    })

    it('accepts hardcodedHeaderLogo(...)', () => {
      const fragment = hardcodedHeaderLogo('https://cdn.example.com/logo.png')
      expect(validateShellContent(fragment)).toEqual({ ok: true })
    })

    it('accepts HARDCODED_FOOTER as-is (longhand padding-top + bare 0 shorthand)', () => {
      // The hardcoded fragment uses padding="20px 20px 0 20px" (with a bare
      // "0", a CSS-legal zero) and padding-top on mj-text. Both are standard
      // MJML idioms accepted by the whitelist; the regression intent is to
      // refuse RELATIVE units (em/rem/%/vh/vw), not to enforce a px suffix
      // on the universal zero.
      expect(validateShellContent(HARDCODED_FOOTER)).toEqual({ ok: true })
    })

    it('accepts a custom header with all allowed mj-text attributes', () => {
      const fragment = `<mj-section background-color="#ffffff" padding="20px"><mj-column width="100%">
        <mj-text color="#18181b" font-family="Inter, sans-serif" font-size="22px" font-weight="bold" align="center" padding="10px">Welcome</mj-text>
      </mj-column></mj-section>`
      expect(validateShellContent(fragment)).toEqual({ ok: true })
    })

    it('accepts a custom mj-button under the radius/href safety bounds', () => {
      const fragment = `<mj-section><mj-column>
        <mj-button background-color="#18181b" color="#ffffff" font-family="Inter, sans-serif" border-radius="8px" href="https://example.com/x">Click me</mj-button>
      </mj-column></mj-section>`
      expect(validateShellContent(fragment)).toEqual({ ok: true })
    })
  })

  describe('§ 4 — refused properties', () => {
    it('rejects mj-raw (not in whitelist)', () => {
      const fragment = `<mj-section><mj-column><mj-raw><script>alert(1)</script></mj-raw></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/<mj-raw>/)
    })

    it('rejects out-of-whitelist component (e.g. mj-table)', () => {
      const fragment = `<mj-section><mj-column><mj-table><tr><td>x</td></tr></mj-table></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/<mj-table>/)
    })

    it('rejects a gradient passed where a hex color is expected', () => {
      // linear-gradient cannot match HexColor regex
      const fragment = `<mj-section background-color="linear-gradient(#fff,#000)"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/background-color/)
    })

    it('rejects box-shadow as an unknown attribute on mj-text', () => {
      const fragment = `<mj-section><mj-column><mj-text box-shadow="0 0 10px #000">x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/box-shadow|Unrecognized key/i)
    })

    it('rejects a font-family without a generic terminal family', () => {
      const fragment = `<mj-section><mj-column><mj-text font-family="Inter, Arial">x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/font-family/)
    })

    it('rejects an SVG image src', () => {
      const fragment = `<mj-section><mj-column><mj-image src="https://example.com/logo.svg" alt="logo"/></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/SVG/i)
    })

    it('rejects an mj-image with a non-https, non-/uploads/ src', () => {
      const fragment = `<mj-section><mj-column><mj-image src="http://example.com/logo.png" alt="logo"/></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/src/)
    })

    it('rejects mj-section width > 600px', () => {
      const fragment = `<mj-section width="800px"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/width/)
    })

    it('accepts mj-button border-radius with arbitrary integer px values', () => {
      const fragment = `<mj-section><mj-column><mj-button border-radius="16px" href="https://example.com">Big radius</mj-button></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(true)
    })

    it('accepts border-radius shorthand 4 values (cas du brief F1: "30px 30px 30px 30px")', () => {
      const fragment = `<mj-section border-radius="30px 30px 30px 30px"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(true)
    })

    it('accepts border-radius shorthand with 2 and 4 values', () => {
      const fragment4 = `<mj-section border-radius="4px 8px 4px 8px"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const fragment2 = `<mj-section border-radius="4px 8px"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      expect(validateShellContent(fragment4).ok).toBe(true)
      expect(validateShellContent(fragment2).ok).toBe(true)
    })

    it('rejects border-radius with non-pixel garbage', () => {
      const fragment = `<mj-section border-radius="foo"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/border-radius/)
    })

    it('rejects border-radius shorthand with 5 values (too many)', () => {
      const fragment = `<mj-section border-radius="4px 4px 4px 4px 4px"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/border-radius/)
    })

    it('rejects border-radius with unitless integer', () => {
      const fragment = `<mj-section border-radius="30"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/border-radius/)
    })

    it('rejects relative units (em / rem / %) on padding', () => {
      const fragment = `<mj-section padding="2em"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/padding/)
    })

    it('rejects calc()/var()/clamp() values (modern CSS)', () => {
      const fragment = `<mj-section padding="calc(10px + 2px)"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/padding/)
    })

    it('rejects transition / animation attributes (unknown keys via .strict())', () => {
      const fragment = `<mj-section transition="all 0.3s"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/transition|Unrecognized key/i)
    })

    it('rejects an invalid font-weight (e.g. 550)', () => {
      const fragment = `<mj-section><mj-column><mj-text font-weight="550">x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/font-weight/)
    })

    it('rejects empty content', () => {
      expect(validateShellContent('')).toEqual({ ok: false, error: 'contentMjml is empty' })
      expect(validateShellContent('   ')).toEqual({ ok: false, error: 'contentMjml is empty' })
    })

    it('accepts a section with per-side borders (hex)', () => {
      const fragment = `<mj-section border-top="1px solid #18181b" border-left="1px solid #18181b" border-right="1px solid #18181b"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      expect(validateShellContent(fragment)).toEqual({ ok: true })
    })

    it('accepts border-bottom with a dashed style', () => {
      const fragment = `<mj-section border-bottom="2px dashed #ff0000"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      expect(validateShellContent(fragment).ok).toBe(true)
    })

    it('rejects a per-side border with a non-hex color (e.g. "black")', () => {
      const fragment = `<mj-section border-top="1px solid black"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      const result = validateShellContent(fragment)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/border-top/)
    })

    it('rejects a per-side border with a non-px width', () => {
      const fragment = `<mj-section border-left="1em solid #18181b"><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
      expect(validateShellContent(fragment).ok).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Plan 5a du 2026-05-24 — tolérance dev pour les URLs `http://localhost:PORT/uploads/...`
  // produites par l'endpoint d'upload local. SafeHref consomme désormais le helper partagé
  // `isAcceptableContentHref` (`lib/email-validation-patterns.ts`) qui ajoute la branche
  // dev sans toucher au comportement prod.
  // ---------------------------------------------------------------------------
  describe('Plan 5a — SafeHref dev tolerance for localhost upload URLs', () => {
    const originalNodeEnv = process.env.NODE_ENV

    afterEach(() => {
      // Patch review pass — restore correctement même quand NODE_ENV était
      // unset au boot du process : `process.env.X = undefined` coerce en la
      // string littérale "undefined", ce qui casserait toute branche dev/prod
      // ultérieure. `delete` libère la clé.
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    })

    describe('dev (NODE_ENV !== production)', () => {
      // Jest seeds NODE_ENV='test' par défaut → branche dev active sans override.

      it('accepts an https:// mj-image src', () => {
        const fragment = `<mj-section><mj-column><mj-image src="https://cdn.example.com/logo.png" alt="x"/></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      it('accepts a relative /uploads/ mj-image src', () => {
        const fragment = `<mj-section><mj-column><mj-image src="/uploads/logo.png" alt="x"/></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      it('accepts http://localhost:PORT/uploads/... (the Plan 5a target case)', () => {
        const fragment = `<mj-section><mj-column><mj-image src="http://localhost:3000/uploads/emails/2026/05/logo.webp" alt="logo"/></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      it('accepts http://127.0.0.1:PORT/uploads/... (loopback equivalent)', () => {
        const fragment = `<mj-section><mj-column><mj-image src="http://127.0.0.1:3000/uploads/anything.png" alt="logo"/></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      // Patch review pass — matrix row 11 du spec : port optionnel dans la regex.
      it('accepts http://localhost/uploads/... without an explicit port', () => {
        const fragment = `<mj-section><mj-column><mj-image src="http://localhost/uploads/x.png" alt="logo"/></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      // Patch review pass — matrix row 12 du spec : path différent de /uploads/.
      it('rejects http://localhost:PORT/foo/bar (path not anchored on /uploads/)', () => {
        const fragment = `<mj-section><mj-column><mj-image src="http://localhost:3000/foo/bar.png" alt="logo"/></mj-column></mj-section>`
        const result = validateShellContent(fragment)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toMatch(/src/)
      })

      // Patch review pass — Always #4 du spec : tolérance dev couvre aussi `href`,
      // pas seulement `src`. SafeHref est partagé entre <mj-image src> et <mj-button href>.
      it('accepts an mj-button href with http://localhost:PORT/uploads/... in dev', () => {
        const fragment = `<mj-section><mj-column><mj-button href="http://localhost:3000/uploads/cta.png">CTA</mj-button></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      it('still rejects http:// URLs to non-localhost hosts', () => {
        const fragment = `<mj-section><mj-column><mj-image src="http://evil.example/uploads/x.png" alt="x"/></mj-column></mj-section>`
        const result = validateShellContent(fragment)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toMatch(/src/)
      })

      it('rejects javascript: URLs (scheme tolerance is never relaxed)', () => {
        const fragment = `<mj-section><mj-column><mj-button href="javascript:alert(1)">Click</mj-button></mj-column></mj-section>`
        const result = validateShellContent(fragment)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toMatch(/href/)
      })
    })

    describe('prod (NODE_ENV === production)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production'
      })

      it('accepts an https:// mj-image src', () => {
        const fragment = `<mj-section><mj-column><mj-image src="https://cdn.example.com/logo.png" alt="x"/></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      it('accepts a relative /uploads/ mj-image src', () => {
        const fragment = `<mj-section><mj-column><mj-image src="/uploads/logo.png" alt="x"/></mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })

      it('rejects http://localhost:PORT/uploads/... (no dev tolerance in prod)', () => {
        const fragment = `<mj-section><mj-column><mj-image src="http://localhost:3000/uploads/logo.webp" alt="x"/></mj-column></mj-section>`
        const result = validateShellContent(fragment)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toMatch(/src/)
      })

      it('rejects javascript: URLs in prod', () => {
        const fragment = `<mj-section><mj-column><mj-button href="javascript:alert(1)">Click</mj-button></mj-column></mj-section>`
        const result = validateShellContent(fragment)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toMatch(/href/)
      })
    })

    describe('mj-image complet — shell-parts header fragment (dev)', () => {
      it('accepts a full header section with localhost logo src (the originally-broken save payload)', () => {
        const fragment = `<mj-section background-color="#0f172a" padding="20px"><mj-column width="100%">
          <mj-image src="http://localhost:3000/uploads/emails/2026/05/logo.webp" alt="TimePick" width="200px" align="center"/>
        </mj-column></mj-section>`
        expect(validateShellContent(fragment)).toEqual({ ok: true })
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Plan post-5b-defer-A L2-B — hardening défensif (8 findings B.1-B.8).
  // Couvre B.1 (root text/comment guard) et B.2 (PxValue/BorderRadiusShell
  // whitespace-only guard). Pattern miroir entre branches mj-body et
  // content-wrapper.
  // ---------------------------------------------------------------------------
  describe('B.1 — root text/comment content guard (slot d\'attributs)', () => {
    describe('part_kind=content-wrapper', () => {
      it('rejects un text node significatif inside <mj-section> root', () => {
        const fragment = `<mj-section background-color="#f9f9f9">hello world</mj-section>`
        const result = validateShellContentPart(fragment, 'content-wrapper')
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error).toBe(
            'content-wrapper expects no text/comment content on root <mj-section> (attributes only)',
          )
        }
      })

      it('tolère un whitespace pur (indentation) sans rejeter', () => {
        const fragment = `<mj-section background-color="#f9f9f9">    </mj-section>`
        // Whitespace-only content => `.trim().length === 0` => bypass du guard B.1.
        expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
      })

      it('accepte un fragment vide (cas factory)', () => {
        const fragment = `<mj-section></mj-section>`
        expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
      })
    })

    describe('part_kind=mj-body', () => {
      it('rejects un text node significatif inside <mj-body> root', () => {
        const fragment = `<mj-body background-color="#ffffff">stray text</mj-body>`
        const result = validateShellContentPart(fragment, 'mj-body')
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error).toBe(
            '<mj-body> for part_kind=mj-body must have no text/comment content (attributes only)',
          )
        }
      })

      it('tolère un whitespace pur (indentation) sans rejeter', () => {
        const fragment = `<mj-body background-color="#ffffff">   </mj-body>`
        expect(validateShellContentPart(fragment, 'mj-body')).toEqual({ ok: true })
      })

      it('accepte un fragment <mj-body></mj-body> sans contenu', () => {
        const fragment = `<mj-body background-color="#ffffff" padding-top="0" padding-bottom="0"></mj-body>`
        expect(validateShellContentPart(fragment, 'mj-body')).toEqual({ ok: true })
      })
    })
  })

  describe('B.2 — PxValue / BorderRadiusShell whitespace-only / empty guard', () => {
    describe('content-wrapper branche', () => {
      it('rejects padding="" (chaîne vide post-parser — defensive)', () => {
        // Cas synthétique : le parser MJML strippe les attrs vides en pratique,
        // mais on construit le fragment de manière à exercer la branche refine.
        // Comme le parser MJML va effectivement supprimer padding="", on teste
        // via padding="   " (whitespace-only que le parser conserve).
        const fragment = `<mj-section padding="   "></mj-section>`
        const result = validateShellContentPart(fragment, 'content-wrapper')
        expect(result.ok).toBe(false)
        if (!result.ok) {
          // Message provient de PxValue refine — peut être "must not be empty"
          // ou "must not be whitespace-only" selon le strip parser. Les deux
          // sont des messages valides du nouveau guard B.2.
          expect(result.error).toMatch(/padding/)
          expect(result.error).toMatch(/whitespace-only|must not be empty/)
        }
      })

      it('rejects border-radius="   " (whitespace-only)', () => {
        const fragment = `<mj-section border-radius="   "></mj-section>`
        const result = validateShellContentPart(fragment, 'content-wrapper')
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error).toMatch(/border-radius/)
          expect(result.error).toMatch(/whitespace-only|must not be empty/)
        }
      })

      it('accepte padding="0 0 0 0" — légitime, doit rester accepté après hardening', () => {
        const fragment = `<mj-section padding="0 0 0 0"></mj-section>`
        expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
      })

      it('accepte padding="20px" — légitime, parité avant/après B.2', () => {
        const fragment = `<mj-section padding="20px"></mj-section>`
        expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
      })
    })

    describe('content-wrapper — bordures par côté (Plan 2026-06-08)', () => {
      it('accepts a content-wrapper with per-side borders (hex)', () => {
        const fragment = `<mj-section background-color="#ffffff" border-left="1px solid #18181b" border-right="1px solid #18181b" border-bottom="1px solid #18181b"></mj-section>`
        expect(validateShellContentPart(fragment, 'content-wrapper')).toEqual({ ok: true })
      })

      it('accepts border-radius + a single border side', () => {
        const fragment = `<mj-section background-color="#ffffff" border-radius="0px 0px 8px 8px" border-bottom="2px dashed #ff0000"></mj-section>`
        expect(validateShellContentPart(fragment, 'content-wrapper').ok).toBe(true)
      })

      it('rejects a per-side border with a non-hex color', () => {
        const fragment = `<mj-section border-top="1px solid black"></mj-section>`
        const result = validateShellContentPart(fragment, 'content-wrapper')
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toMatch(/border-top/)
      })

      it('rejects a per-side border with a non-px width', () => {
        const fragment = `<mj-section border-left="1em solid #18181b"></mj-section>`
        expect(validateShellContentPart(fragment, 'content-wrapper').ok).toBe(false)
      })
    })

    describe('walk générique (mj-section structurelle)', () => {
      it('rejects padding="   " sur une <mj-section> non-content-wrapper', () => {
        const fragment = `<mj-section padding="   "><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
        const result = validateShellContent(fragment)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error).toMatch(/padding/)
          expect(result.error).toMatch(/whitespace-only|must not be empty/)
        }
      })

      it('rejects border-radius="   " sur une <mj-section> non-content-wrapper', () => {
        const fragment = `<mj-section border-radius="   "><mj-column><mj-text>x</mj-text></mj-column></mj-section>`
        const result = validateShellContent(fragment)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error).toMatch(/border-radius/)
        }
      })
    })
  })
})

describe('shell-content.validator — DoS guards (26-1 Z2/Z3)', () => {
  describe('size cap (enforced BEFORE the MJML parse)', () => {
    it('rejects content_mjml above SHELL_CONTENT_MAX_LEN via validateShellContent', () => {
      const huge = 'x'.repeat(SHELL_CONTENT_MAX_LEN + 1)
      const result = validateShellContent(huge)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/too large/)
    })

    it('rejects oversized payloads via validateShellContentPart too', () => {
      const huge = 'x'.repeat(SHELL_CONTENT_MAX_LEN + 1)
      const result = validateShellContentPart(huge, 'header')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/too large/)
    })

    it('accepts a large but under-cap valid fragment (cap is generous)', () => {
      const longText = 'a'.repeat(200_000)
      const fragment = `<mj-section><mj-column><mj-text>${longText}</mj-text></mj-column></mj-section>`
      expect(fragment.length).toBeLessThanOrEqual(SHELL_CONTENT_MAX_LEN)
      expect(validateShellContent(fragment)).toEqual({ ok: true })
    })
  })

  describe('depth cap (enforced during walk)', () => {
    it('rejects nesting beyond SHELL_CONTENT_MAX_DEPTH', () => {
      const n = SHELL_CONTENT_MAX_DEPTH + 2
      const deep =
        '<mj-section>'.repeat(n) +
        '<mj-column><mj-text>x</mj-text></mj-column>' +
        '</mj-section>'.repeat(n)
      const result = validateShellContent(deep)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/too deep|max depth/)
    })
  })
})
