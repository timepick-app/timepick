/**
 * Shell Content Validator — Outlook-safe whitelist for `shell_parts.content_mjml`.
 *
 * Two public functions co-exist here with distinct vocations:
 *
 * - `validateShellContent(contentMjml)` (Story 26.1 / AC4) — walks the
 *   whitelist over a generic shell fragment, without assumption on the
 *   root structure. Consumed wherever the whitelist alone is enough.
 *
 * - `validateShellContentPart(contentMjml, expectedPartKind)` (Story 26.2c
 *   / AC3) — the stricter wrapper used by `PUT /api/admin/shell-parts/…`.
 *   On top of the whitelist, it enforces:
 *     1. exactly one `<mj-section>` root,
 *     2. `data-part-kind` attribute present and equal to `expectedPartKind`
 *        (server is the single authority for partKind coherence — no silent
 *        auto-injection, per the email-shell customization policy's principle
 *        that partKind is server-authoritative).
 *
 * Both consume the same allowed-properties whitelist (components, attributes,
 * and value formats) as their documentary source of truth. Any change to this
 * validator MUST be paired with a prior update to that whitelist's spec
 * (non-negotiable review procedure).
 *
 * Algorithm (validateShellContent):
 *   1. Wrap the fragment in `<mjml><mj-body>…</mj-body></mjml>`.
 *   2. Parse with `mjml-parser-xml` — XML errors → ParseError.
 *   3. Walk the AST. For each tag:
 *      - if not in WHITELIST → reject with explicit tag name.
 *      - otherwise validate its attributes via the corresponding Zod schema
 *        (`.strict()` — any unknown attribute keys are rejected).
 *   4. Return `{ ok: true }` or `{ ok: false, error: <human message> }`.
 *
 * Source rules: component whitelist (§ 1), border/degradation handling for
 * shell-part components (§ 2), Zod sub-type value formats (§ 3), and
 * Outlook-safe numeric CSS values (§ 4).
 */

import { z } from 'zod'
// eslint-disable-next-line @typescript-eslint/no-require-imports -- mjml-parser-xml has no ESM default export
import MJMLParser = require('mjml-parser-xml')
import { PART_KINDS, type PartKind } from '../services/shell-parts.service'
import {
  DIVIDER_BORDER_WIDTH_MAX,
  endsWithGenericFamily,
  FONT_FAMILY_MAX_LEN,
  FONT_STACK_RE,
  HEX_COLOR_RE,
  IMAGE_ALT_MAX_LEN,
  IMAGE_WIDTH_MAX,
  isAcceptableContentHref,
  SECTION_WIDTH_MAX,
  SHELL_CONTENT_MAX_DEPTH,
  SHELL_CONTENT_MAX_LEN,
  SPACER_HEIGHT_MAX,
  SVG_EXTENSION_RE,
} from '../lib/email-validation-patterns'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; error: string }

// DoS guard (26-1 Z2) — reject oversized payloads BEFORE the MJML parse so a
// giant/abusive `content_mjml` never reaches the (synchronous) parser on the
// admin write-path. Called at the top of every public entry point.
function checkContentSize(contentMjml: string): ValidationResult {
  if (contentMjml.length > SHELL_CONTENT_MAX_LEN) {
    return {
      ok: false,
      error: `content_mjml too large: ${contentMjml.length} chars (max ${SHELL_CONTENT_MAX_LEN})`,
    }
  }
  return { ok: true }
}

// Parses an MJML fragment wrapped in `<mjml><mj-body>…</mj-body></mjml>` and
// returns the `mj-body` AST node. Shared by `validateShellContent` and
// `validateShellContentPart` so the cost of parsing the same content twice
// per PUT call is avoided.
function parseShellContent(
  contentMjml: string,
): { ok: true; body: ParsedNode } | { ok: false; error: string } {
  if (!contentMjml || contentMjml.trim().length === 0) {
    return { ok: false, error: 'contentMjml is empty' }
  }

  let ast: ParsedNode
  try {
    ast = MJMLParser(`<mjml><mj-body>${contentMjml}</mj-body></mjml>`, {
      addEmptyAttributes: false,
    }) as ParsedNode
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `MJML parse failed: ${msg}` }
  }

  const body = ast.children?.find((c) => c.tagName === 'mj-body')
  if (!body) {
    return { ok: false, error: 'Parsed AST has no <mj-body> root — wrapping failed' }
  }
  return { ok: true, body }
}

// Parses an MJML fragment whose root IS the `<mj-body>` element (cas part_kind='mj-body').
// Wrap minimal `<mjml>${contentMjml}</mjml>` — pas de double-mj-body imbriqué qui
// fausserait l'AST.
function parseMjBodyContent(
  contentMjml: string,
): { ok: true; mjBody: ParsedNode } | { ok: false; error: string } {
  if (!contentMjml || contentMjml.trim().length === 0) {
    return { ok: false, error: 'contentMjml is empty' }
  }

  let ast: ParsedNode
  try {
    ast = MJMLParser(`<mjml>${contentMjml}</mjml>`, {
      addEmptyAttributes: false,
    }) as ParsedNode
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `MJML parse failed: ${msg}` }
  }

  const bodies = (ast.children ?? []).filter((c) => c.tagName === 'mj-body')
  if (bodies.length !== 1) {
    return {
      ok: false,
      error: `Body must contain exactly one <mj-body> root (got: ${bodies.length})`,
    }
  }
  return { ok: true, mjBody: bodies[0] }
}

function walkBody(body: ParsedNode): ValidationResult {
  if (!body.children || body.children.length === 0) {
    return { ok: false, error: 'contentMjml has no top-level element' }
  }
  for (const child of body.children) {
    const walked = walk(child, [])
    if (!walked.ok) return walked
  }
  return { ok: true }
}

export function validateShellContent(contentMjml: string): ValidationResult {
  const sizeCheck = checkContentSize(contentMjml)
  if (!sizeCheck.ok) return sizeCheck

  const parsed = parseShellContent(contentMjml)
  if (!parsed.ok) return parsed
  return walkBody(parsed.body)
}

// ---------------------------------------------------------------------------
// Zod sub-types for shell-content whitelist values (color/font/pixel/radius formats)
// ---------------------------------------------------------------------------

const HexColor = z.string().regex(HEX_COLOR_RE, 'must be a #RRGGBB hex color')

const FontStack = z
  .string()
  .max(FONT_FAMILY_MAX_LEN, `font-family must be ≤${FONT_FAMILY_MAX_LEN} chars`)
  .regex(FONT_STACK_RE, 'font-family contains forbidden characters')
  .refine(endsWithGenericFamily, {
    message: 'font-family must end with a generic family (sans-serif / serif / monospace / cursive / fantasy)',
  })

// PxValue accepts 1-4 shorthand values. Each value is either `0` (the
// universal CSS zero) or `Npx` (integer pixels). Relative units (em/rem/%/
// vh/vw/ch/lh) and modern-CSS values (calc/var/clamp) are rejected — that's
// the Outlook-safety intent: raw pixel values only.
//
// Plan post-5b-defer-A L2-B / B.2 — durcissement défensif : `min(1)` + refine
// trim non-vide AVANT le regex. Le parser MJML strip silencieusement les attrs
// vides en amont, donc le validator ne reçoit jamais `""` en pratique ; ce
// garde défensif assure une erreur explicite si le parser change de comportement
// (mise à jour upstream) plutôt qu'un slip silencieux. Pattern miroir appliqué
// à `BorderRadiusShell`.
const PxValue = z
  .string()
  .min(1, 'must not be empty')
  .refine((s) => s.trim().length > 0, 'must not be whitespace-only')
  .refine(
    (s) => /^(0|\d+px)(?:\s+(0|\d+px)){0,3}$/.test(s),
    'must be 1-4 integer pixel values (e.g. "20px", "0", or "20px 0 10px 0")',
  )

// Border-radius accepts 1-4 shorthand values, each an integer pixel. No upper
// cap server-side — Outlook for Windows ignores ALL border-radius values
// regardless of magnitude (no numeric limit documented). The compatibility
// hint is surfaced as a dismissible client card (EmailCompatibilityWarningCard),
// not a hard rejection here.
const BorderRadiusShell = z
  .string()
  .min(1, 'must not be empty')
  .refine((s) => s.trim().length > 0, 'must not be whitespace-only')
  .refine(
    (s) => /^\d+px(\s+\d+px){0,3}$/.test(s),
    'border-radius must be 1-4 integer px values (e.g. "8px" or "4px 8px 4px 8px")',
  )

// Bordure par côté. Le composite GrapesJS par côté émet le shorthand CSS
// "<largeur>px <style> <#hex>" (ordre largeur/style/couleur). Outlook ignore
// les bordures portées par un <div> (dégradation acceptée — cf. la règle de
// dégradation des bordures pour les composants de la coque email). Couleur hex obligatoire (GrapesJS est
// contraint côté éditeur à émettre du hex, cf. Phase 3).
const BorderSide = z
  .string()
  .min(1, 'must not be empty')
  .refine((s) => s.trim().length > 0, 'must not be whitespace-only')
  .refine(
    (s) => /^\d+px\s+(solid|dashed|dotted|double)\s+#[0-9a-fA-F]{6}$/.test(s.trim()),
    'border-<side> must be "<width>px <style> #RRGGBB" (e.g. "1px solid #18181b")',
  )

const SectionWidth = z
  .string()
  .regex(/^\d+px$/, 'mj-section width must be an integer px value')
  .refine((v) => parseInt(v, 10) <= SECTION_WIDTH_MAX, {
    message: `mj-section width must be ≤${SECTION_WIDTH_MAX}px (Outlook horizontal clip)`,
  })

const ColumnWidth = z
  .string()
  .regex(/^(\d+(\.\d+)?(%|px))$/, 'mj-column width must be a px or % value')

const ImageWidth = z
  .string()
  .regex(/^\d+px$/, 'mj-image width must be an integer px value')
  .refine((v) => parseInt(v, 10) <= IMAGE_WIDTH_MAX, {
    message: `mj-image width must be ≤${IMAGE_WIDTH_MAX}px`,
  })

const FontWeight = z
  .string()
  .regex(/^(normal|bold|[1-9]00)$/, 'font-weight must be normal/bold or a 100-900 multiple of 100')

const LineHeight = z
  .string()
  .regex(/^(\d+px|\d+(\.\d+)?)$/, 'line-height must be Npx or a unitless number')

const TextAlign = z.enum(['left', 'center', 'right'])
const VerticalAlign = z.enum(['top', 'middle', 'bottom'])

// Plan 5a du 2026-05-24 — `.refine` consomme le helper partagé
// `isAcceptableContentHref` qui ajoute la tolérance dev pour les URLs
// `http://localhost:PORT/uploads/...` produites par l'endpoint d'upload local.
// Comportement prod strictement inchangé : seul `https://` ou `/uploads/` passent.
// Message orienté prod (la branche dev est silencieuse côté UI).
const SafeHref = z
  .string()
  .refine(isAcceptableContentHref, { message: 'href must start with https:// or /uploads/' })

const SafeImageHref = SafeHref.refine((s) => !SVG_EXTENSION_RE.test(s), {
  message: 'SVG forbidden (Outlook renders SVG as invisible) — use PNG/JPG',
})

const DividerBorderWidth = z
  .string()
  .regex(/^\d+px$/, 'mj-divider border-width must be an integer px value')
  .refine((v) => parseInt(v, 10) <= DIVIDER_BORDER_WIDTH_MAX, {
    message: `mj-divider border-width must be 0-${DIVIDER_BORDER_WIDTH_MAX}px`,
  })

const SpacerHeight = z
  .string()
  .regex(/^\d+px$/, 'mj-spacer height must be an integer px value')
  .refine((v) => parseInt(v, 10) <= SPACER_HEIGHT_MAX, {
    message: `mj-spacer height must be 0-${SPACER_HEIGHT_MAX}px`,
  })

// Universal MJML attributes that any component may carry without breaking
// the whitelist intent (cosmetic, no rendering impact in our pipeline).
const universalAttrs = {
  'css-class': z.string().max(64).optional(),
  'mj-class': z.string().max(64).optional(),
}

// MJML lets `padding` be expressed either as the 1-4 value shorthand OR via
// the longhand variants `padding-top` / `-bottom` / `-left` / `-right`.
// Both forms produce identical HTML, so the whitelist accepts both.
const longhandPaddingAttrs = {
  'padding-top': PxValue.optional(),
  'padding-bottom': PxValue.optional(),
  'padding-left': PxValue.optional(),
  'padding-right': PxValue.optional(),
}

// ---------------------------------------------------------------------------
// Per-tag schemas (whitelist)
// ---------------------------------------------------------------------------

const SectionAttrs = z
  .object({
    ...universalAttrs,
    ...longhandPaddingAttrs,
    'background-color': HexColor.optional(),
    padding: PxValue.optional(),
    'border-radius': BorderRadiusShell.optional(),
    'border-top': BorderSide.optional(),
    'border-right': BorderSide.optional(),
    'border-bottom': BorderSide.optional(),
    'border-left': BorderSide.optional(),
    width: SectionWidth.optional(),
    // Story 26.2c — server-set marker carried by the three immutable shell
    // sections. Tagged client-side by `tagShellSectionsByOrder` (26-2b) and
    // cross-checked against the URL `partKind` by `validateShellContentPart`.
    // The schema only accepts the three known partKinds — `validateShellContent`
    // refuses any out-of-domain value even when called outside the per-part
    // wrapper.
    'data-part-kind': z.enum(PART_KINDS).optional(),
  })
  .strict()

const ColumnAttrs = z
  .object({
    ...universalAttrs,
    ...longhandPaddingAttrs,
    'background-color': HexColor.optional(),
    padding: PxValue.optional(),
    width: ColumnWidth.optional(),
    'vertical-align': VerticalAlign.optional(),
  })
  .strict()

const TextAttrs = z
  .object({
    ...universalAttrs,
    ...longhandPaddingAttrs,
    color: HexColor.optional(),
    'font-family': FontStack.optional(),
    'font-size': PxValue.optional(),
    'font-weight': FontWeight.optional(),
    'line-height': LineHeight.optional(),
    align: TextAlign.optional(),
    padding: PxValue.optional(),
  })
  .strict()

const ButtonAttrs = z
  .object({
    ...universalAttrs,
    ...longhandPaddingAttrs,
    'background-color': HexColor.optional(),
    color: HexColor.optional(),
    'font-family': FontStack.optional(),
    'font-size': PxValue.optional(),
    'font-weight': FontWeight.optional(),
    'border-radius': BorderRadiusShell.optional(),
    padding: PxValue.optional(),
    href: SafeHref.optional(),
  })
  .strict()

const ImageAttrs = z
  .object({
    ...universalAttrs,
    ...longhandPaddingAttrs,
    src: SafeImageHref,
    alt: z.string().max(IMAGE_ALT_MAX_LEN).optional(),
    width: ImageWidth.optional(),
    align: TextAlign.optional(),
    padding: PxValue.optional(),
  })
  .strict()

const DividerAttrs = z
  .object({
    ...universalAttrs,
    ...longhandPaddingAttrs,
    'border-color': HexColor.optional(),
    'border-width': DividerBorderWidth.optional(),
    padding: PxValue.optional(),
  })
  .strict()

const SpacerAttrs = z
  .object({
    ...universalAttrs,
    height: SpacerHeight,
  })
  .strict()

// ---------------------------------------------------------------------------
// Branche content-wrapper (Plan-5b-defer-A L2, 2026-05-25) — attributs d'un
// wrapper transversal hors-bloc appliqué autour du contenu du corps au render.
// Whitelist Outlook-safe : background-color (hex), padding (shorthand 1-4 px)
// ou padding-top/bottom/left/right longhand, border-radius (shorthand 1-4 px).
// Pas de `data-part-kind` requis — la branche dispatchée par
// expectedPartKind='content-wrapper' est self-contained, miroir mj-body.
// Le fragment est un `<mj-section>` sans enfants : slot-d'attributs, pas une
// section structurelle (la composition du wrapper appartient au render-email
// en L3).
// ---------------------------------------------------------------------------

const ContentWrapperAttrs = z
  .object({
    'background-color': HexColor.optional(),
    padding: PxValue.optional(),
    'padding-top': PxValue.optional(),
    'padding-bottom': PxValue.optional(),
    'padding-left': PxValue.optional(),
    'padding-right': PxValue.optional(),
    'border-radius': BorderRadiusShell.optional(),
    // Plan 2026-06-08 — bordures par côté de la carte (content-wrapper), même
    // sous-type BorderSide que les sections (A3). Portées par <mj-wrapper> au
    // render. Dégradation Outlook acceptée (cf. la règle de dégradation des bordures pour les composants de la coque email).
    'border-top': BorderSide.optional(),
    'border-right': BorderSide.optional(),
    'border-bottom': BorderSide.optional(),
    'border-left': BorderSide.optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Branche mj-body (Plan 1 du 2026-05-22) — attributs du <mj-body> racine.
// Whitelist 3 attrs : background-color (hex), padding-top / padding-bottom
// (entiers 0-100 px). Pas de `padding` shorthand, pas de padding-left/right
// (hors périmètre Plan 1, cf. spec « Never »). Pas de `data-part-kind` ni
// de `css-class` requis — la branche dispatchée par expectedPartKind='mj-body'
// est self-contained.
// ---------------------------------------------------------------------------

const MJ_BODY_PADDING_MAX = 100

// Accepte `0` bare (zéro CSS universel, parité avec `PxValue`) ou un entier Npx.
// GrapesJS Style Manager émet typiquement `0px` mais peut émettre `0` selon les
// builders ; on accepte les deux pour ne pas surprendre l'admin avec un 422 sur
// un payload visuellement correct.
const MjBodyPadding = z
  .string()
  .regex(/^(0|\d+px)$/, 'must be "0" or an integer px value (e.g. "20px")')
  .refine((v) => parseInt(v, 10) <= MJ_BODY_PADDING_MAX, {
    message: `must be 0-${MJ_BODY_PADDING_MAX}px`,
  })

const MjBodyAttrs = z
  .object({
    'background-color': HexColor.optional(),
    'padding-top': MjBodyPadding.optional(),
    'padding-bottom': MjBodyPadding.optional(),
  })
  .strict()

type TagName = keyof typeof TAG_VALIDATORS
const TAG_VALIDATORS = {
  'mj-section': SectionAttrs,
  'mj-column': ColumnAttrs,
  'mj-text': TextAttrs,
  'mj-button': ButtonAttrs,
  'mj-image': ImageAttrs,
  'mj-divider': DividerAttrs,
  'mj-spacer': SpacerAttrs,
} as const

const WHITELIST: ReadonlySet<string> = new Set(Object.keys(TAG_VALIDATORS))

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

interface ParsedNode {
  tagName: string
  attributes?: Record<string, string>
  children?: ParsedNode[]
  content?: string
}

function formatPath(path: string[]): string {
  return path.length === 0 ? '<root>' : path.join(' > ')
}

function walk(node: ParsedNode, path: string[]): ValidationResult {
  const currentPath = [...path, node.tagName]

  // DoS guard (26-1 Z2/Z3) — bound recursion against pathologically deep
  // payloads. `currentPath.length` is the node's depth (1 = top-level child).
  if (currentPath.length > SHELL_CONTENT_MAX_DEPTH) {
    return {
      ok: false,
      error: `Nesting too deep at ${formatPath(currentPath)} — max depth ${SHELL_CONTENT_MAX_DEPTH}`,
    }
  }

  if (!WHITELIST.has(node.tagName)) {
    return {
      ok: false,
      error: `Forbidden component <${node.tagName}> at ${formatPath(currentPath)} — not in whitelist`,
    }
  }

  const validator = TAG_VALIDATORS[node.tagName as TagName]
  const parsed = validator.safeParse(node.attributes ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const attr = issue.path.join('.') || '<root attrs>'
    return {
      ok: false,
      error: `Invalid attribute on <${node.tagName}> at ${formatPath(currentPath)}: ${attr} → ${issue.message}`,
    }
  }

  for (const child of node.children ?? []) {
    const childResult = walk(child, currentPath)
    if (!childResult.ok) return childResult
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Story 26.2c — per-part wrapper used by PUT /api/admin/shell-parts/…
// ---------------------------------------------------------------------------

/**
 * Validates a shell content fragment intended to be written as a single
 * `shell_parts` row (one `(owner_kind, owner_id, part_kind)` triple).
 *
 * Enforces four invariants on top of `validateShellContent`:
 *   1. Exactly one `<mj-section>` root.
 *   2. The root section declares `data-part-kind` equal to the URL's
 *      `partKind` — server refuses silent partKind drift between URL and
 *      payload (the email-shell customization policy's rule that partKind is server-authoritative).
 *   3. The root section contains at least one `<mj-column>` child — refuses
 *      a self-closed or empty `<mj-section/>` that would render as a
 *      visually broken block (fixed-structure rule of the email-shell customization policy).
 *   4. Whitelist composants + propriétés (delegated to `validateShellContent`).
 *
 * The MJML parse is performed once via the shared `parseShellContent` helper;
 * `validateShellContent` reuses the same parse path on its delegated walk.
 */
export function validateShellContentPart(
  contentMjml: string,
  expectedPartKind: PartKind,
): ValidationResult {
  const sizeCheck = checkContentSize(contentMjml)
  if (!sizeCheck.ok) return sizeCheck

  // Plan 1 du 2026-05-22 — branche dédiée au stockage des attributs du
  // <mj-body> racine. Schéma ≠ des 3 sections : pas de <mj-section> root, pas
  // de data-part-kind requis, validation d'attributs uniquement.
  if (expectedPartKind === 'mj-body') {
    return validateMjBodyContent(contentMjml)
  }

  // Plan-5b-defer-A L2 (2026-05-25) — branche dédiée au stockage des attributs
  // du wrapper transversal hors-bloc. Schéma : `<mj-section>` racine sans
  // enfants, attrs whitelistés Outlook-safe (background-color, padding*,
  // border-radius). Pas de data-part-kind requis — dispatch URL est la source
  // d'autorité, miroir branche mj-body.
  if (expectedPartKind === 'content-wrapper') {
    return validateContentWrapperContent(contentMjml)
  }

  const parsed = parseShellContent(contentMjml)
  if (!parsed.ok) return parsed

  const sections = (parsed.body.children ?? []).filter((c) => c.tagName === 'mj-section')
  if (sections.length !== 1) {
    return {
      ok: false,
      error: `Body must contain exactly one <mj-section> root (got: ${sections.length})`,
    }
  }

  const rootSection = sections[0]
  const actualPartKind = rootSection.attributes?.['data-part-kind']
  if (actualPartKind === undefined) {
    return {
      ok: false,
      error: `Root <mj-section> must declare data-part-kind="${expectedPartKind}"`,
    }
  }
  if (actualPartKind !== expectedPartKind) {
    return {
      ok: false,
      error: `data-part-kind mismatch: expected "${expectedPartKind}", got "${actualPartKind}"`,
    }
  }

  const hasMjColumn = (rootSection.children ?? []).some((c) => c.tagName === 'mj-column')
  if (!hasMjColumn) {
    return {
      ok: false,
      error: 'Root <mj-section> must contain at least one <mj-column>',
    }
  }

  return walkBody(parsed.body)
}

/**
 * Plan-5b-defer-A L2 (2026-05-25) — validation d'un fragment `<mj-section attrs></mj-section>`
 * stocké pour part_kind='content-wrapper'. Invariants :
 *   1. Exactement un `<mj-section>` racine. Note : la branche réutilise
 *      `parseShellContent` (wrap `<mjml><mj-body>${fragment}</mj-body></mjml>`)
 *      car la sémantique de slot porte ici sur un `<mj-section>` ; la branche
 *      mj-body utilise `parseMjBodyContent` parce que son slot porte sur le
 *      `<mj-body>` racine. Pattern miroir au niveau intention (slot d'attributs),
 *      pas au niveau parser.
 *   2. Aucun enfant — content-wrapper est un slot-d'attributs, pas une section
 *      structurelle ; la composition du wrapper extérieur appartient au
 *      render-email en L3.
 *   3. Whitelist Outlook-safe (background-color hex, padding/padding-* px
 *      shorthand, border-radius shorthand). Aucun autre attribut accepté.
 *
 * `data-part-kind` n'est PAS requis ici : dispatch via `expectedPartKind`
 * (le partKind URL est la source d'autorité, cohérent avec la branche mj-body).
 */
function validateContentWrapperContent(contentMjml: string): ValidationResult {
  const parsed = parseShellContent(contentMjml)
  if (!parsed.ok) return parsed

  const sections = (parsed.body.children ?? []).filter((c) => c.tagName === 'mj-section')
  if (sections.length !== 1) {
    return {
      ok: false,
      error: `Body must contain exactly one <mj-section> root (got: ${sections.length})`,
    }
  }

  const root = sections[0]
  if ((root.children ?? []).length > 0) {
    return {
      ok: false,
      error: 'content-wrapper expects no children (attributes only — composition appartient au render)',
    }
  }
  // Plan post-5b-defer-A L2-B / B.1 — la balise racine est un slot d'attributs ;
  // tout text node significatif (« <mj-section> hi </mj-section> ») viole
  // l'intent et serait absorbé silencieusement par MJML (rendu en `<table>` vide).
  // Le parser strip nativement les commentaires HTML, donc on ne contrôle ici
  // que le `content` brut ; un whitespace pur (indentation) reste toléré.
  if ((root.content ?? '').trim().length > 0) {
    return {
      ok: false,
      error: 'content-wrapper expects no text/comment content on root <mj-section> (attributes only)',
    }
  }

  const result = ContentWrapperAttrs.safeParse(root.attributes ?? {})
  if (!result.success) {
    const issue = result.error.issues[0]
    const attr = issue.path.join('.') || '<root attrs>'
    return {
      ok: false,
      error: `Invalid attribute on <mj-section> for content-wrapper: ${attr} → ${issue.message}`,
    }
  }

  return { ok: true }
}

/**
 * Plan 1 du 2026-05-22 — validation du fragment `<mj-body attrs></mj-body>`
 * stocké pour part_kind='mj-body'. Invariants :
 *   1. Exactement un `<mj-body>` racine.
 *   2. Aucun enfant (le contenu sectionnel reste dans header/body/footer).
 *   3. Whitelist stricte 3 attrs : background-color (hex), padding-top et
 *      padding-bottom (entiers 0-100 px).
 *
 * `data-part-kind` n'est PAS requis ici : la branche est dispatchée
 * explicitement par `expectedPartKind` (le partKind URL est la source
 * d'autorité, cohérent avec la sémantique slot-d'attributs vs section).
 */
function validateMjBodyContent(contentMjml: string): ValidationResult {
  const parsed = parseMjBodyContent(contentMjml)
  if (!parsed.ok) return parsed

  if ((parsed.mjBody.children ?? []).length > 0) {
    return {
      ok: false,
      error: '<mj-body> for part_kind=mj-body must have no children (attributes only)',
    }
  }
  // Plan post-5b-defer-A L2-B / B.1 — miroir strict de la branche content-wrapper :
  // le `<mj-body>` est un slot d'attributs, tout text node significatif viole
  // l'intent. Commentaires strippés par MJML ; whitespace pur toléré.
  if ((parsed.mjBody.content ?? '').trim().length > 0) {
    return {
      ok: false,
      error: '<mj-body> for part_kind=mj-body must have no text/comment content (attributes only)',
    }
  }

  const result = MjBodyAttrs.safeParse(parsed.mjBody.attributes ?? {})
  if (!result.success) {
    const issue = result.error.issues[0]
    const attr = issue.path.join('.') || '<root attrs>'
    return {
      ok: false,
      error: `Invalid attribute on <mj-body>: ${attr} → ${issue.message}`,
    }
  }

  return { ok: true }
}
