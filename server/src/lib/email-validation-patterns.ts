/**
 * Shared validation patterns for the email pipeline (brand singleton +
 * shell parts content). Single source of truth so `render-email.service.ts`
 * (defense-in-depth brand validation) and `shell-content.validator.ts`
 * (Outlook-safe whitelist) stay in lockstep.
 *
 * Source of truth (documentary): the allowed-properties whitelist spec (component/attribute/value formats).
 * Source of truth (compatibility): the email client compatibility guide.
 *
 * Story 26.1 / T4.3 — extracted from render-email.service.ts:148-154.
 */

// --- Raw regex constants (no Zod dependency) ---

/** Hex color: `#RRGGBB` — 6 chars, no shorthand, no alpha. */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Font stack: letters, digits, spaces, hyphens, commas, dots, underscores,
 * and quotes around individual family names. Rejects `<`, `>`, `"`, `&`,
 * `` ` ``, `\n` — anything that could escape an HTML attribute.
 */
export const FONT_STACK_RE = /^[A-Za-z0-9 ,.\-'_]+$/

/** Generic font families required as the final fallback in any font-stack. */
const GENERIC_FAMILIES = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'] as const

/** Border-radius bounds for the brand singleton (`email_brand_settings.button_border_radius`). */
export const RADIUS_MIN_BRAND = 0
export const RADIUS_MAX_BRAND = 32

/** Maximum `mj-section` width (pixels) — Outlook horizontal-clip threshold. */
export const SECTION_WIDTH_MAX = 600

/** Maximum `mj-image` width (pixels) — matches section ceiling. */
export const IMAGE_WIDTH_MAX = 600

/** Maximum `mj-divider` border-width (pixels). */
export const DIVIDER_BORDER_WIDTH_MAX = 4

/** Maximum `mj-spacer` height (pixels). */
export const SPACER_HEIGHT_MAX = 100

/** Maximum length for `font_family` strings (matches DB VARCHAR(64)). */
export const FONT_FAMILY_MAX_LEN = 64

/** Maximum length for `mj-image` alt text. */
export const IMAGE_ALT_MAX_LEN = 200

/**
 * Maximum length (characters) of a single shell-part `content_mjml` payload,
 * enforced BEFORE the MJML parse to bound parser cost (DoS defense on the
 * admin write-path `PUT /api/admin/shell-parts`). 256 KB — very generous vs.
 * real shell parts (header/footer/mj-body/content-wrapper are all small).
 */
export const SHELL_CONTENT_MAX_LEN = 262_144

/**
 * Maximum nesting depth of the shell-content AST, enforced during `walk()`.
 * Real shell content is ~4-5 levels (section > column > text/button/image);
 * 20 is a generous ceiling that rejects pathologically deep payloads.
 */
export const SHELL_CONTENT_MAX_DEPTH = 20

// --- Helper predicates ---

/** Returns true when `fontStack` ends with one of the generic families. */
export function endsWithGenericFamily(fontStack: string): boolean {
  return GENERIC_FAMILIES.some((generic) => fontStack.endsWith(generic))
}

/** Returns true when `href` looks like an https URL or a /uploads/ path. */
const SAFE_HREF_RE = /^(https:\/\/|\/uploads\/)/

/** Image src validity: SafeHref + .svg/.svgz refusal (extension or query-stripped). */
export const SVG_EXTENSION_RE = /\.svgz?(\?.*)?$/i

// Plan 5a du 2026-05-24 — l'endpoint d'upload (`routes/uploads.routes.ts:46-48`)
// construit en dev une URL absolue préfixée par `req.protocol://req.host`, ce
// qui donne `http://localhost:PORT/uploads/...`. Ce préfixe ne matche pas
// `SAFE_HREF_RE` (qui exige `https://` ou `/uploads/`), donc à la fois le
// healthcheck render et le validator de contenu MJML rejettent en cascade
// tout logo uploadé en local. On accepte cette forme uniquement quand
// `NODE_ENV !== 'production'` ; en prod, seul HTTPS ou `/uploads/` passe.
// Portée strictement ancrée sur `localhost` / `127.0.0.1` + path `/uploads/`
// — pas d'IP arbitraire, pas de `.local`, pas de plages privées.
const DEV_LOGO_URL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/uploads\//

/**
 * Returns true when `value` is acceptable as an `href` or `src` attribute
 * inside an MJML fragment, with dev tolerance for the localhost upload URL
 * shape produced by `routes/uploads.routes.ts:46-48`.
 *
 * Single source of truth shared by `render-email.service.ts` (brand validator,
 * boot healthcheck) and `shell-content.validator.ts` (admin-saisi MJML
 * fragments). Centralising the dev/prod branch here keeps the two call sites
 * in lockstep and removes the silent asymmetry that surfaced as Plan 4a
 * defer-A (admin could not save any header in dev once a logo was uploaded).
 */
export function isAcceptableContentHref(value: string): boolean {
  if (SAFE_HREF_RE.test(value)) return true
  if (process.env.NODE_ENV !== 'production') return DEV_LOGO_URL_RE.test(value)
  return false
}
