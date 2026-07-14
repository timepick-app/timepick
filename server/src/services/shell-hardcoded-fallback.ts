/**
 * Hardcoded shell fragments — ultimate fallback when no `shell_parts` row
 * exists at any cascade level (brand → template → event).
 *
 * The HEADER fallback is the factory card shell `INVITATION_FACTORY_HEADER_MJML`
 * (shell-parts.service.ts) — the single source of truth also seeded by migration
 * 018 and restored by « Restaurer le gabarit d'usine ». Deriving the fallback
 * from that constant guarantees the degraded (empty-DB) render shows the SAME
 * white card as the seeded state, instead of the old black band that a stale,
 * independently-defined fallback used to emit (regression 2026-06). Drift is
 * structurally prevented and guarded by shell-fallback-ssot.test.ts.
 *
 * The FOOTER fallback (HARDCODED_FOOTER) is the sole definition of the default
 * footer (no factory footer row exists), so it has no second source to drift from.
 *
 * CRITICAL: the client editor ships a byte-identical header/footer fallback in
 * client/src/components/admin/email-editor/bodyExtraction.ts. Any edit here MUST
 * be mirrored there, or email-shell-parity.test.ts fails.
 *
 * Also hosts `recoupleHeaderLogo` (Drawbridge #29): it swaps the card's text node
 * ↔ logo image to follow `brand.logoUrl`, and is reused to build the logo variant
 * of the hardcoded header above.
 */

import { INVITATION_FACTORY_HEADER_MJML } from './shell-parts.service'

/**
 * Logo header — the card variant used when `brand.logoUrl` is non-null. Derived
 * from `INVITATION_FACTORY_HEADER_MJML` via `recoupleHeaderLogo`, which swaps the
 * card's text node for the brand logo image while preserving the card's
 * structural attributes (white background, rounded top corners, light-gray
 * borders).
 */
export function hardcodedHeaderLogo(logoUrl: string): string {
  return recoupleHeaderLogo(INVITATION_FACTORY_HEADER_MJML, logoUrl)
}

/**
 * Text header — the card variant used when `brand.logoUrl` is null. This IS the
 * factory card shell (white background, rounded top corners, light-gray borders,
 * black centered « TimePick » title), re-exported from the single source of
 * truth `INVITATION_FACTORY_HEADER_MJML`. The fallback can therefore never again
 * drift to a stale design — the regression where this held the old black band
 * (#18181b) is structurally impossible (guarded by shell-fallback-ssot.test.ts).
 */
export const HARDCODED_HEADER_TEXT = INVITATION_FACTORY_HEADER_MJML

/**
 * Footer — privacy line. Divider retiré (2026-06-17) : plus de séparateur
 * `<hr>` dans les footers. Reproduit render-email.service.ts:270-273 (pre-26-1)
 * sans le `<mj-divider>`.
 */
export const HARDCODED_FOOTER = `<mj-section padding="20px 20px 0 20px"><mj-column>
        <mj-text color="#999999" font-size="12px" padding-top="0">Ce lien est personnel et ne doit pas être partagé.</mj-text>
      </mj-column></mj-section>`

/**
 * Hardcoded header dispatch — picks the logo variant when `logoUrl` is
 * a non-empty string, otherwise the text variant. Mirrors the truthy
 * branching in pre-26-1 `buildShell()`: an empty-string logoUrl would
 * otherwise render `<mj-image src="">` and break the 26-0 baseline.
 */
export function hardcodedHeader(logoUrl: string | null): string {
  return logoUrl ? hardcodedHeaderLogo(logoUrl) : HARDCODED_HEADER_TEXT
}

/**
 * Drawbridge #29 — re-couple an OVERRIDE header's logo to `brand.logoUrl`.
 *
 * The logo is a brand token (`email_brand_settings.logo_url`), but the email
 * header lives in the `shell_parts` cascade. When the header is customized at
 * the template/event level, GrapesJS serializes the *current* brand logo into
 * the override's `content_mjml`, freezing it — resetting or changing
 * `brand.logoUrl` then no longer affects the header. This re-derives the
 * header's logo/text content from `brand.logoUrl` while preserving the
 * override's structural `<mj-section>`/`<mj-column>` attributes (background,
 * padding, `data-part-kind`):
 *   - logoUrl set  → ensure the column holds `<mj-image src="${logoUrl}">`
 *     (refresh the `src` in place, or swap from the text fallback);
 *   - logoUrl null → ensure the column holds the `TimePick` text fallback
 *     (swap from the logo image).
 *
 * Applied ONLY to override fragments: the `hardcoded` cascade level already
 * couples to `brand.logoUrl` via `hardcodedHeader()` and is byte-locked to the
 * 26-0 baseline snapshots, so it must not pass through here. Non-canonical
 * overrides (multiple columns/images — validator-permitted but never produced
 * by the editor) are returned untouched: we cannot safely locate the logo.
 */
const HEADER_IMAGE_SRC_RE = /(<mj-image\b[^>]*\bsrc=")[^"]*(")/
const HEADER_COLUMN_INNER_RE = /(<mj-column\b[^>]*>)[\s\S]*?(<\/mj-column>)/
// Global variants used only to count loci for the canonical-shape guard.
const HEADER_COLUMN_GLOBAL_RE = /<mj-column\b/g
const HEADER_IMAGE_GLOBAL_RE = /<mj-image\b/g
// Inner of the card text fallback — byte-identical to the `<mj-text>` element
// inside INVITATION_FACTORY_HEADER_MJML (black title on the white card).
const HEADER_TEXT_INNER =
  '<mj-text color="#000000" font-size="22px" font-weight="bold" align="center">TimePick</mj-text>'

function headerLogoInner(logoUrl: string): string {
  return `<mj-image src="${logoUrl}" alt="TimePick" width="160px" align="center"></mj-image>`
}

export function recoupleHeaderLogo(contentMjml: string, logoUrl: string | null): string {
  // We only know where the brand logo lives in the canonical single-column
  // logo-bar header (`<mj-section><mj-column>[<mj-image> | TimePick text]`).
  // The shell-content validator permits richer shapes (multiple columns or
  // images), but the editor never produces them (header descendants are
  // add/remove-locked). For any non-canonical override we cannot tell which
  // node is the logo, so we pass it through untouched rather than rewrite the
  // wrong element (no blind erase; pre-#29 verbatim behavior preserved).
  const columnCount = (contentMjml.match(HEADER_COLUMN_GLOBAL_RE) ?? []).length
  const imageCount = (contentMjml.match(HEADER_IMAGE_GLOBAL_RE) ?? []).length
  if (columnCount !== 1 || imageCount > 1) return contentMjml

  if (logoUrl) {
    // Refresh the existing `<mj-image src>` in place (no structural churn).
    // Gate on the regex MATCHING, not on the result changing: a same-URL
    // refresh must stay a no-op, not fall through to rebuild (idempotency).
    if (HEADER_IMAGE_SRC_RE.test(contentMjml)) {
      // Function replacer: `logoUrl` is a validated URL but may contain `$`.
      return contentMjml.replace(
        HEADER_IMAGE_SRC_RE,
        (_m, pre: string, post: string) => `${pre}${logoUrl}${post}`,
      )
    }
    // Text fallback, or an `<mj-image>` without a `src` attr (defensive) →
    // rebuild the column inner as a logo image.
    return contentMjml.replace(
      HEADER_COLUMN_INNER_RE,
      (_m, open: string, close: string) => `${open}${headerLogoInner(logoUrl)}${close}`,
    )
  }
  // logoUrl null → text fallback; nothing to do for a text-only override.
  if (imageCount === 0) return contentMjml
  return contentMjml.replace(
    HEADER_COLUMN_INNER_RE,
    (_m, open: string, close: string) => `${open}${HEADER_TEXT_INNER}${close}`,
  )
}
