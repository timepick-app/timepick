/**
 * Email Render Pipeline (Epic E1.S2 / Story 22.2)
 *
 * Single public entry point `renderEmail({ templateKey, eventId?, variables })`
 * that compiles all five transactional emails (`invitation`,
 * `magic_link_login`, `magic_link_recovery`, `reservation_confirmation`,
 * `cancellation_confirmation`) through one contract, plus a fail-fast
 * boot-time `runRenderEmailHealthcheck()` that the server runs before binding
 * a port (D-ext7).
 *
 * Pipeline (per call):
 *   1. validate templateKey                    → InvalidTemplateKeyError
 *   2. read brand singleton                    → BrandSettingsNotFoundError
 *   3. read body fragment (with per-event override for invitation)
 *                                              → TemplateNotFoundError
 *   4. wrap body in the global brand-tokenized shell
 *   5. compileMjml → MJML errors fail loudly   → MjmlCompileError
 *   6. substituteVariables on compiled HTML    (post-compile, regex-safe)
 *   7. sanitizeEmailHtml (DOMPurify)
 *   8. htmlToText (regex-based plain-text fallback, D2)
 *
 * The shell (header + footer) is owned by THIS file, never the DB. Brand
 * tokens are applied at runtime via `<mj-attributes>` (D-ext5) so that
 * Settings updates take effect on the next send without re-rendering bodies.
 *
 * Brand and template reads are NOT cached: at E1's call volume the cost is
 * negligible — no cache layer exists, by design.
 */

import {
  getEmailBrandSettings,
  EmailBrandSettingsNotFoundError,
  type EmailBrandSettings,
} from '../db/email-brand-settings.db'
import {
  compileMjml,
  sanitizeEmailHtml,
  substituteVariables,
  type MjmlError,
  type VariablesPayload,
} from './mjml-compile.service'
import {
  HARDCODED_MJ_BODY_ATTRS,
  resolveShellParts,
  TemplateBodyMissingError,
  type ResolvedMjBodyAttrs,
} from './shell-resolver.service'
import { hardcodedHeader, HARDCODED_FOOTER } from './shell-hardcoded-fallback'
import { EMAIL_BRAND_FACTORY_DEFAULTS } from '../config/emailBrandDefaults'
import { TEMPLATE_KEYS as TEMPLATE_KEY_LIST, type TemplateKey } from '../db/email-templates.db'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Source UNIQUE des clés : `db/email-templates.db` (tuple `as const`). On
// ré-exporte le tuple + le type, et on dérive le Set de lookup consommé par
// cette couche (`.has()`) — une seule liste à maintenir dans tout le serveur.
export { TEMPLATE_KEY_LIST }
export type { TemplateKey }
export const TEMPLATE_KEYS: ReadonlySet<TemplateKey> = new Set<TemplateKey>(TEMPLATE_KEY_LIST)

export interface RenderEmailParams {
  templateKey: TemplateKey
  /** Honored only when `templateKey === 'invitation'`. */
  eventId?: string
  variables: VariablesPayload
}

export interface RenderEmailOutput {
  html: string
  text: string
}

// ---------------------------------------------------------------------------
// Error hierarchy (every failure mode has a class — never raw Error)
// ---------------------------------------------------------------------------

class RenderEmailError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class InvalidTemplateKeyError extends RenderEmailError {
  constructor(public readonly templateKey: string) {
    super(`Unknown templateKey: ${templateKey}`)
  }
}

export class BrandSettingsNotFoundError extends RenderEmailError {
  constructor() {
    super('email_brand_settings singleton row is missing — re-run migration 006')
  }
}

export class TemplateNotFoundError extends RenderEmailError {
  constructor(public readonly templateKey: TemplateKey) {
    super(`email_templates row for "${templateKey}" is missing — re-run migration 006`)
  }
}

// Field type uses the 5 camelCase keys the renderer actually validates.
// `logoUrl` is checked against SAFE_HREF_RE when non-null so that a brand
// row inserted via a non-PATCH path (raw SQL, future migration) can't pass
// an attacker-shaped href into the unescaped shell template literal.
// `updatedAt` is upstream-validated.
export type InvalidBrandSettingsField =
  | 'logoUrl'
  | 'primaryColor'
  | 'buttonTextColor'
  | 'fontFamily'
  | 'buttonBorderRadius'

export class InvalidBrandSettingsError extends RenderEmailError {
  constructor(public readonly field: InvalidBrandSettingsField, public readonly value: unknown) {
    super(`email_brand_settings.${field} has invalid value: ${JSON.stringify(value)}`)
  }
}

export class InvalidEventIdError extends RenderEmailError {
  constructor(public readonly eventId: string) {
    super(`Invalid eventId (must be a valid UUID): ${eventId}`)
  }
}

export class MjmlCompileError extends RenderEmailError {
  constructor(public readonly mjmlErrors: MjmlError[]) {
    super(`MJML compile failed (${mjmlErrors.length} error(s))`)
  }
}

export class RenderEmailHealthcheckError extends RenderEmailError {
  constructor(
    public readonly failures: ReadonlyArray<{ key: TemplateKey; error: Error }>,
  ) {
    super(
      `renderEmail healthcheck failed for ${failures.length}/${TEMPLATE_KEYS.size} templates: ` +
        failures.map((f) => `${f.key} (${f.error.message})`).join('; '),
    )
  }
}

// ---------------------------------------------------------------------------
// Defense-in-depth validation. The DB CHECK constraints cap varchar lengths
// but do NOT enforce hex-color or font-stack format. Until S3a's Zod layer
// ships at the API boundary, the renderer is the only chokepoint that catches
// a corrupt brand row before it reaches the MJML template literal — where an
// unescaped `"` could break out of an attribute. DOMPurify is the final net,
// not the first.
// ---------------------------------------------------------------------------

import {
  FONT_FAMILY_MAX_LEN,
  FONT_STACK_RE,
  HEX_COLOR_RE,
  isAcceptableContentHref,
  RADIUS_MAX_BRAND,
  RADIUS_MIN_BRAND,
} from '../lib/email-validation-patterns'
import { UUID_RE } from '../lib/constants'

// Plan 5a du 2026-05-24 — la règle dev/prod (HTTPS + /uploads/ strict + tolérance
// `http://localhost:PORT/uploads/` hors prod) est centralisée dans
// `isAcceptableContentHref` (`lib/email-validation-patterns.ts`). Source unique
// partagée avec `shell-content.validator.ts` (SafeHref) pour éviter que la
// branche dev dérive entre brand validator et content validator. L'ancien
// wrapper `isAcceptableLogoUrl` (alias mince après Plan 5a) a été inlined : pas
// de consommateur externe, pas d'export `__testing__`, naming asymétrique
// induisant en erreur (logo vs content href = même prédicat).

function validateBrandSettings(row: EmailBrandSettings): EmailBrandSettings {
  if (row.logoUrl !== null && !isAcceptableContentHref(row.logoUrl)) {
    throw new InvalidBrandSettingsError('logoUrl', row.logoUrl)
  }
  if (!HEX_COLOR_RE.test(row.primaryColor)) {
    throw new InvalidBrandSettingsError('primaryColor', row.primaryColor)
  }
  if (!HEX_COLOR_RE.test(row.buttonTextColor)) {
    throw new InvalidBrandSettingsError('buttonTextColor', row.buttonTextColor)
  }
  if (!FONT_STACK_RE.test(row.fontFamily) || row.fontFamily.length > FONT_FAMILY_MAX_LEN) {
    throw new InvalidBrandSettingsError('fontFamily', row.fontFamily)
  }
  if (
    !Number.isInteger(row.buttonBorderRadius) ||
    row.buttonBorderRadius < RADIUS_MIN_BRAND ||
    row.buttonBorderRadius > RADIUS_MAX_BRAND
  ) {
    throw new InvalidBrandSettingsError('buttonBorderRadius', row.buttonBorderRadius)
  }
  return row
}

// ---------------------------------------------------------------------------
// DB read helpers (kept inline — small surface, no other consumer in E1)
// ---------------------------------------------------------------------------

/**
 * Read + validate the email_brand_settings singleton.
 *
 * Wraps the camelCase DTO read (`getEmailBrandSettings` in
 * `db/email-brand-settings.db.ts`) and re-throws its `EmailBrandSettingsNotFoundError`
 * as the renderer's own `BrandSettingsNotFoundError`, preserving the
 * public-error-contract that the integration suite (`render-email-healthcheck.test.ts`)
 * and any future renderer consumer asserts on. The defense-in-depth
 * `validateBrandSettings()` then runs against the already-camelCase row —
 * the DB layer guarantees the column-presence/type shape, this guarantees
 * the format (hex/font-stack/radius bounds).
 *
 * Story 23.1 / A3 — closes 22-retro action item by collapsing the duplicate
 * read path that previously existed at this same location.
 */
async function getValidatedBrand(): Promise<EmailBrandSettings> {
  let row: EmailBrandSettings
  try {
    row = await getEmailBrandSettings()
  } catch (err) {
    if (err instanceof EmailBrandSettingsNotFoundError) {
      throw new BrandSettingsNotFoundError()
    }
    throw err
  }
  return validateBrandSettings(row)
}
// ---------------------------------------------------------------------------
// Règle métier footer-sans-lien (2026-06-28) : la mention de confidentialité
// « Ce lien est personnel et ne doit pas être partagé. » ne doit JAMAIS
// s'afficher si l'email ne contient aucun lien cliquable — elle n'a de sens
// que pour protéger un lien partagé. Source unique de la règle, consommée par
// `renderEmailWithBrand` (tous les templates) et `renderSmtpTestEmail`.
// ---------------------------------------------------------------------------

// Règle footer-sans-lien : footer affiché ssi le corps contient un lien
// (href= couvre mj-button/mj-link/a, y compris les placeholders non-substitués).
// buildShell replie un footer vide sur HARDCODED_FOOTER et n'émet le padding bas
// que pour un footer <mj-section> : on passe donc une <mj-section> vide
// (transparente sur #fafafa, porte le padding) plutôt que '' — contourne le
// repli sans modifier buildShell (parité éditeur client).
const NO_LINK_FOOTER_MJML = '<mj-section padding="0"><mj-column></mj-column></mj-section>'

// Source unique de la règle footer-sans-lien (renderEmailWithBrand pour tous les
// templates + renderSmtpTestEmail).
function effectiveFooter(bodyFragment: string, resolvedFooter: string): string {
  return /\bhref\s*=/i.test(bodyFragment) ? resolvedFooter : NO_LINK_FOOTER_MJML
}

/**
 * Charge les réglages de marque avec repli usine quand la row
 * `email_brand_settings` id=1 est absente (cas du wizard de setup initial,
 * avant qu'aucune marque n'ait été initialisée). Contrairement à
 * `getValidatedBrand` qui lève `BrandSettingsNotFoundError` sur une row
 * absente, ce helper retombe silencieusement sur `EMAIL_BRAND_FACTORY_DEFAULTS`
 * complété d'un `updatedAt` — l'email de test SMTP doit pouvoir être rendu
 * même avant l'initialisation de la marque.
 */
async function loadBrandOrDefault(): Promise<EmailBrandSettings> {
  try {
    return validateBrandSettings(await getEmailBrandSettings())
  } catch (err) {
    if (err instanceof EmailBrandSettingsNotFoundError) {
      return { ...EMAIL_BRAND_FACTORY_DEFAULTS, updatedAt: new Date(0) }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Shell template (single global shell — D-ext4)
// ---------------------------------------------------------------------------

// PARITY: must stay in lockstep with client wrapBodyForEditing() in
// client/src/components/admin/email-editor/bodyExtraction.ts. Header and
// footer block divergence is caught by
// server/src/services/__tests__/email-shell-parity.test.ts. If you change
// this shell, change the editor shell too — or update the parity test
// with a justification.
//
// Plan 4b du 2026-05-24 — MJML spec n'accepte pas `padding-*` sur `<mj-body>`.
// Les valeurs sont silencieusement strippées au compile (mémoire
// `feedback_mj_body_padding_not_in_mjml_spec`). Le workaround consiste à
// envelopper header/footer dans une `<mj-wrapper padding-top|padding-bottom>`
// extérieure quand le padding est non nul. `isNonZeroPx` garde le comportement
// pré-Plan 4b quand padding=0 (pas de wrapper parasite — sortie byte-identique
// au pré-fix).
//
// Defense-in-depth (post-review P3 du 2026-05-24) : le validator d'écriture
// (`shell-content.validator.ts` branche mj-body) limite déjà à
// `/^(0|\d+px)$/` avec une borne 0-100 ; ce helper ne fait pas confiance à la
// chaîne reçue. Il accepte uniquement un entier positif strict, suivi
// optionnellement de l'unité `px` (insensible à la casse, avec ou sans espace
// intercalaire). Toute autre forme — unité hors `px`, signe, décimal, attribut
// injecté — est traitée comme zéro : pas de wrapper, pas d'interpolation
// d'une chaîne non-sanitisée dans l'attribut MJML.
const PX_VALUE_RE = /^(\d+)(?:\s*px)?$/i

function isNonZeroPx(value: string): boolean {
  const match = PX_VALUE_RE.exec(value.trim())
  if (!match) return false
  return Number.parseInt(match[1], 10) > 0
}

// Plan 4b review pass 2 (M3) — normalisation à l'interpolation : `'40PX'`,
// `' 40 px '`, `'40'` deviennent tous `'40px'` lowercase. Évite d'interpoler
// la chaîne admin brute dans l'attribut MJML, ce qui prévient les ambiguïtés
// de casse et les variantes whitespace stockées par un row non-validé.
function normalizePx(value: string): string {
  const match = PX_VALUE_RE.exec(value.trim())
  if (!match) return '0'
  return `${Number.parseInt(match[1], 10)}px`
}

// Guard défensif post-review P4 du 2026-05-24, durci par review pass 2 (M2+M4) :
// 1. Strip des commentaires HTML en tête (`<!-- ... -->`) — le validator d'écriture
//    parse via `mjml-parser-xml` qui filtre par `tagName` et tolère les commentaires
//    en début de fragment ; sans le strip, `startsWith('<mj-section')` retournerait
//    `false` et le wrapper ne serait pas émis pour un fragment légitime.
// 2. Délimiteur explicite après `mj-section` (espace ou `>`) pour éviter le
//    faux positif sur `<mj-section-foo>` (préfixe sans délimiteur).
// `<mj-wrapper>` n'accepte que `<mj-section>` (ou `<mj-group>`/`<mj-raw>`)
// comme enfants directs. Le validator côté écriture impose un `<mj-section>`
// racine pour les rows `shell_parts(header|footer)`, et tous les fragments
// hardcodés commencent par `<mj-section>`. Mais un row inséré par voie
// hors-validator (raw SQL, futur backfill non audité) pourrait stocker autre
// chose ; on préfère ne pas wrapper du tout plutôt que crasher MJML en envoi
// transactionnel.
const LEADING_HTML_COMMENT_RE = /^(?:<!--[\s\S]*?-->\s*)+/
const MJ_SECTION_OPEN_RE = /^<mj-section[\s>]/

function startsWithMjSection(block: string): boolean {
  const stripped = block.trimStart().replace(LEADING_HTML_COMMENT_RE, '')
  return MJ_SECTION_OPEN_RE.test(stripped)
}

// Plan 4b review pass 2 (M5) — defense-in-depth render-time pour `background-color`
// en miroir du durcissement P3 appliqué au padding. Si le row mj-body extrait par
// la cascade contient une valeur compromise (raw SQL hors validator), on retombe
// sur le fallback brand fourni en paramètre plutôt que d'interpoler une chaîne
// arbitraire dans l'attribut MJML. Le validator côté écriture impose déjà
// `HexColor` mais cette ligne défensive supplémentaire n'a aucun coût runtime.
function safeBackgroundColor(value: string, fallback: string): string {
  return HEX_COLOR_RE.test(value) ? value : fallback
}

// ---------------------------------------------------------------------------
// Plan-5b-defer-A L3 (2026-05-25) — consommation runtime du content-wrapper.
//
// `resolveShellParts` expose `contentWrapper: ResolvedBlock | null`. Quand
// non-null, on enveloppe le `bodyFragment` (entre wrappers header/footer
// paddings) dans une `<mj-wrapper>` extérieure portant les attributs
// whitelistés du content-wrapper. Pattern miroir du wrap conditionnel
// padding mj-body : si tous les attrs résolus sont vides/zero, aucun wrapper
// n'est émis (sortie byte-identique au pré-L3).
//
// Pourquoi `<mj-wrapper>` plutôt que `<mj-section>` extérieur ? Le bodyFragment
// standard commence par `<mj-section>` ; MJML 4.x interdit `<mj-section>`
// imbriqué. `<mj-wrapper>` accepte `<mj-section>` comme enfant direct et
// supporte nativement background-color, padding* et border-radius.
//
// Defense-in-depth : le validator côté écriture (`shell-content.validator.ts`
// branche content-wrapper) impose déjà HexColor/PxValue/BorderRadiusShell. Ce
// helper ne fait pas confiance à la chaîne reçue : tout attribut ne matchant
// pas la regex miroir est strippé silencieusement avec un warn DEV-only
// nommant l'attribut + la valeur (en miroir du pattern Plan 4b review pass 2
// M4 sur le padding mj-body).
// ---------------------------------------------------------------------------

// Miroir defensive du validator `BorderRadiusShell` (shell-content.validator.ts:160) :
// 1-4 entiers `Npx` séparés par whitespace. Le flag `i` couvre le cas pathologique
// `8PX` stocké hors-validator. Pas de réutilisation du module Zod : importer
// `shell-content.validator` ici créerait un couplage runtime (validateur côté
// écriture ↔ render-email côté envoi) que la spec rejette explicitement.
const BORDER_RADIUS_RENDER_RE = /^\d+px(\s+\d+px){0,3}$/i

// Miroir defensive du validator `PxValue` (shell-content.validator.ts:151) :
// 1-4 valeurs, chacune `0` (zéro CSS universel) ou `Npx`. Couvre à la fois le
// shorthand `padding` et les longhands `padding-top/-bottom/-left/-right`.
const PX_SHORTHAND_RE = /^(0|\d+px)(?:\s+(0|\d+px)){0,3}$/i

interface ContentWrapperRawAttrs {
  backgroundColor: string
  padding: string
  paddingTop: string
  paddingBottom: string
  paddingLeft: string
  paddingRight: string
  borderRadius: string
  borderTop: string
  borderRight: string
  borderBottom: string
  borderLeft: string
}

const EMPTY_CONTENT_WRAPPER_ATTRS: ContentWrapperRawAttrs = {
  backgroundColor: '',
  padding: '',
  paddingTop: '',
  paddingBottom: '',
  paddingLeft: '',
  paddingRight: '',
  borderRadius: '',
  borderTop: '',
  borderRight: '',
  borderBottom: '',
  borderLeft: '',
}

// Regex miroir `extractMjBodyAttrs` (shell-resolver.service.ts:300) : capture
// non-greedy du blob d'attributs du `<mj-section>` racine. Le validator côté
// écriture impose `<mj-section>` racine sans enfants ; ce regex se borne à
// extraire les attrs whitelistés et ignore tout le reste.
const MJ_SECTION_ATTRS_RE = /<mj-section\b([^>]*)>/
const CONTENT_WRAPPER_ATTR_RE = /([\w-]+)="([^"]*)"/g

function extractContentWrapperAttrs(contentMjml: string): ContentWrapperRawAttrs {
  const attrs: ContentWrapperRawAttrs = { ...EMPTY_CONTENT_WRAPPER_ATTRS }
  const match = MJ_SECTION_ATTRS_RE.exec(contentMjml)
  if (!match) return attrs
  for (const [, key, value] of match[1].matchAll(CONTENT_WRAPPER_ATTR_RE)) {
    switch (key) {
      case 'background-color':
        attrs.backgroundColor = value
        break
      case 'padding':
        attrs.padding = value
        break
      case 'padding-top':
        attrs.paddingTop = value
        break
      case 'padding-bottom':
        attrs.paddingBottom = value
        break
      case 'padding-left':
        attrs.paddingLeft = value
        break
      case 'padding-right':
        attrs.paddingRight = value
        break
      case 'border-radius':
        attrs.borderRadius = value
        break
      case 'border-top':
        attrs.borderTop = value
        break
      case 'border-right':
        attrs.borderRight = value
        break
      case 'border-bottom':
        attrs.borderBottom = value
        break
      case 'border-left':
        attrs.borderLeft = value
        break
    }
  }
  return attrs
}

function warnContentWrapperStrip(name: string, value: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[render-email] content-wrapper ${name} invalid value stripped: ${JSON.stringify(value)}`,
    )
  }
}

// Pour les paddings : normalise lowercase, single-space ; retourne '' si invalide.
function normalizeContentWrapperPadding(name: string, raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!PX_SHORTHAND_RE.test(trimmed)) {
    warnContentWrapperStrip(name, raw)
    return ''
  }
  return trimmed.toLowerCase().replace(/\s+/g, ' ')
}

// Padding considéré comme "visuel" ssi au moins une de ses 1-4 valeurs est un
// entier `Npx` strictement positif. `"0"` et `"0 0 0 0"` sont équivalents
// (no-op) ; `"0 20px 0 0"` est visuel. Évite d'émettre des `padding="0"`
// parasites qui ne changent rien au render.
function hasNonZeroPadding(normalized: string): boolean {
  if (!normalized) return false
  return normalized.split(' ').some((token) => token !== '0' && Number.parseInt(token, 10) > 0)
}

// Plan post-5b-defer-A L2-B / B.6 — border-radius "visuel" ssi au moins une
// valeur `Npx` est > 0. `BORDER_RADIUS_RENDER_RE` impose le suffixe `px`
// partout (contrairement au padding qui accepte `0` seul), donc `Number.parseInt`
// suffit ; pas besoin du garde `token !== '0'`. Miroir strict de
// `hasNonZeroPadding` pour éviter qu'un row stocké avec `border-radius="0px"`
// (visuellement no-op) déclenche l'émission de l'attribut sur le `<mj-wrapper>`
// et rompe la parité byte-level pré-L3 sur les BASELINES.
function hasNonZeroBorderRadius(normalized: string): boolean {
  if (!normalized) return false
  return normalized.split(' ').some((token) => Number.parseInt(token, 10) > 0)
}

function normalizeContentWrapperBorderRadius(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!BORDER_RADIUS_RENDER_RE.test(trimmed)) {
    warnContentWrapperStrip('border-radius', raw)
    return ''
  }
  return trimmed.toLowerCase().replace(/\s+/g, ' ')
}

// Plan carte-éditable (2026-06-08) — bordure par côté du content-wrapper,
// portée par <mj-wrapper>. Même contrat que le sous-type `BorderSide` du
// validator (shell-content.validator.ts) : "<width>px <style> #hex". Retourne
// '' si invalide (defense-in-depth read, miroir des autres normaliseurs).
const CONTENT_WRAPPER_BORDER_SIDE_RE = /^\d+px\s+(solid|dashed|dotted|double)\s+#[0-9a-fA-F]{6}$/
function normalizeContentWrapperBorderSide(name: string, raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!CONTENT_WRAPPER_BORDER_SIDE_RE.test(trimmed)) {
    warnContentWrapperStrip(name, raw)
    return ''
  }
  return trimmed.toLowerCase().replace(/\s+/g, ' ')
}

function normalizeContentWrapperBackgroundColor(raw: string): string {
  if (!raw) return ''
  // Plan post-5b-defer-A L2-B / B.7 — symétrie avec `normalizeContentWrapperPadding`
  // et `normalizeContentWrapperBorderRadius` : `.trim()` puis `.toLowerCase()` pour
  // qu'une row legacy stockée hors-validator avec un hex uppercase (`#F9F9F9`,
  // `  #aaa  `) soit ré-émise en forme canonique lowercase et nettoyée du
  // whitespace, plutôt que de slip verbatim dans l'attribut MJML.
  const trimmed = raw.trim()
  if (!HEX_COLOR_RE.test(trimmed)) {
    warnContentWrapperStrip('background-color', raw)
    return ''
  }
  return trimmed.toLowerCase()
}

// Émet la chaîne d'attributs MJML normalisée à interpoler dans `<mj-wrapper
// ${...}>`. Chaîne vide => aucun wrapper visuel utile => caller doit no-op.
function formatContentWrapperAttrs(raw: ContentWrapperRawAttrs): string {
  const parts: string[] = []
  const bg = normalizeContentWrapperBackgroundColor(raw.backgroundColor)
  if (bg) parts.push(`background-color="${bg}"`)
  const padding = normalizeContentWrapperPadding('padding', raw.padding)
  if (hasNonZeroPadding(padding)) parts.push(`padding="${padding}"`)
  const pt = normalizeContentWrapperPadding('padding-top', raw.paddingTop)
  if (hasNonZeroPadding(pt)) parts.push(`padding-top="${pt}"`)
  const pb = normalizeContentWrapperPadding('padding-bottom', raw.paddingBottom)
  if (hasNonZeroPadding(pb)) parts.push(`padding-bottom="${pb}"`)
  const pl = normalizeContentWrapperPadding('padding-left', raw.paddingLeft)
  if (hasNonZeroPadding(pl)) parts.push(`padding-left="${pl}"`)
  const pr = normalizeContentWrapperPadding('padding-right', raw.paddingRight)
  if (hasNonZeroPadding(pr)) parts.push(`padding-right="${pr}"`)
  const br = normalizeContentWrapperBorderRadius(raw.borderRadius)
  if (hasNonZeroBorderRadius(br)) parts.push(`border-radius="${br}"`)
  // Plan carte-éditable (2026-06-08) — bordures par côté de la carte, émises
  // sur le <mj-wrapper>. Avant le bloc A3 (padding vertical neutralisé) pour
  // qu'une carte n'ayant QUE des bordures compte comme « wrapper utile ».
  const bt = normalizeContentWrapperBorderSide('border-top', raw.borderTop)
  if (bt) parts.push(`border-top="${bt}"`)
  const brt = normalizeContentWrapperBorderSide('border-right', raw.borderRight)
  if (brt) parts.push(`border-right="${brt}"`)
  const bb = normalizeContentWrapperBorderSide('border-bottom', raw.borderBottom)
  if (bb) parts.push(`border-bottom="${bb}"`)
  const bl = normalizeContentWrapperBorderSide('border-left', raw.borderLeft)
  if (bl) parts.push(`border-left="${bl}"`)
  // Plan A3 (2026-06-08) — neutralise le padding vertical par défaut (20px)
  // du <mj-wrapper> pour que l'en-tête et le corps s'accolent (cadre continu).
  // Uniquement quand le wrapper a déjà une raison d'exister (bg/radius/…),
  // pour préserver le « pas de wrapper si vide ». Un padding admin explicite
  // (shorthand OU longhand) gagne et n'est pas écrasé.
  if (parts.length > 0) {
    if (!hasNonZeroPadding(padding) && !hasNonZeroPadding(pt)) parts.push('padding-top="0"')
    if (!hasNonZeroPadding(padding) && !hasNonZeroPadding(pb)) parts.push('padding-bottom="0"')
  }
  return parts.join(' ')
}

// Vrai ssi la version formatée produit au moins un attribut émettable.
// Wrapper utilitaire exposé via `__testing__` pour les unit tests qui valident
// le predicate de manière isolée. Au sein de `buildShell`, on appelle
// `formatContentWrapperAttrs` une seule fois et on teste si la chaîne est vide,
// pour éviter de déclencher les warns deux fois pour le même render.
function hasContentWrapperPayload(raw: ContentWrapperRawAttrs): boolean {
  return formatContentWrapperAttrs(raw).length > 0
}

// Story 26.1 — buildShell accepts pre-resolved header/footer MJML
// fragments (from `shell-resolver.service.ts`). They stay optional so the
// parity test (and any direct caller that only owns a brand + body fragment)
// can keep calling `buildShell(brand, body)` and get the hardcoded fallback
// identical to pre-26-1 output.
//
// Plan 4b du 2026-05-24 — `mjBodyAttrs` est ajouté en option (défaut
// `HARDCODED_MJ_BODY_ATTRS`) pour répercuter `background-color` + `padding-top`
// / `padding-bottom` résolus par la cascade `shell_parts(mj-body)`. La 2-args
// form `buildShell(brand, body)` reste valide pour la parity guard
// (`email-shell-parity.test.ts`) et `scripts/verify-mjml-strict.ts` — défauts
// = pas de padding wrapper + background `#ffffff` (identique à brand factory).
//
// Plan-5b-defer-A L3 (2026-05-25) — 6ᵉ paramètre `contentWrapper` (défaut
// `null`). Quand non-null ET au moins un attribut whitelisté résolu, le
// `bodyFragment` est enveloppé dans une `<mj-wrapper>` extérieure portant les
// attributs résolus du content-wrapper. La parity guard 2-args reste valide.
function buildShell(
  brand: EmailBrandSettings,
  bodyFragment: string,
  resolvedHeader?: string,
  resolvedFooter?: string,
  mjBodyAttrs: ResolvedMjBodyAttrs = HARDCODED_MJ_BODY_ATTRS,
  contentWrapper: { contentMjml: string } | null = null,
): string {
  // Q3 (S1): logoUrl NULL → text fallback header. Healthcheck exercises this
  // path because the factory seed leaves logo_url NULL.
  // Truthy guards (not ??) so that an empty-string resolvedHeader/Footer
  // never bypasses the hardcoded fallback and renders an empty block.
  const headerBlock = resolvedHeader && resolvedHeader.length > 0 ? resolvedHeader : hardcodedHeader(brand.logoUrl)
  const footerBlock = resolvedFooter && resolvedFooter.length > 0 ? resolvedFooter : HARDCODED_FOOTER

  // `<mj-wrapper>` (et non `<mj-section>`) — le `headerBlock` / `footerBlock`
  // résolu est lui-même un `<mj-section>` ; or MJML interdit l'imbrication
  // d'une `<mj-section>` dans une `<mj-section>`. `<mj-wrapper>` est le
  // composant MJML standard prévu pour regrouper plusieurs `<mj-section>`
  // tout en portant ses propres `padding-*`, lui aussi compilé en `<table>`
  // respecté universellement (Gmail, Apple Mail, Outlook 2016+).
  //
  // `padding-left="0" padding-right="0"` explicites : `<mj-wrapper>` a un
  // padding par défaut de `20px` sur les 4 côtés (spec MJML). Sans cette
  // remise à zéro, l'enveloppement comprimerait la largeur du header/footer
  // de 40 px (régression layout horizontal).
  // Plan 4b review pass 2 (M4) — warn explicite en non-prod quand un padding
  // non nul est demandé mais que le fragment résolu ne débute pas par
  // `<mj-section>` (cas pathologique : raw SQL backfill, format custom hors
  // validator). Sans ce warn, le padding est silencieusement ignoré, ce qui
  // reproduit exactement le bug originel que Plan 4b corrigeait. Clôture aussi
  // `plan-4b-defer-E` (observabilité sur silent skip).
  const headerHasPaddingTop = isNonZeroPx(mjBodyAttrs.paddingTop)
  const footerHasPaddingBottom = isNonZeroPx(mjBodyAttrs.paddingBottom)
  if (process.env.NODE_ENV !== 'production') {
    if (headerHasPaddingTop && !startsWithMjSection(headerBlock)) {
      console.warn(
        '[render-email] mj-body padding-top non-zero but header fragment does not start with <mj-section> — wrapper not emitted, padding will be lost',
      )
    }
    if (footerHasPaddingBottom && !startsWithMjSection(footerBlock)) {
      console.warn(
        '[render-email] mj-body padding-bottom non-zero but footer fragment does not start with <mj-section> — wrapper not emitted, padding will be lost',
      )
    }
    // Plan post-5b-defer-A L2-B / B.8 — miroir Plan 4b M4 pour le wrap content-wrapper.
    // Sémantique différente : ici le wrap reste émis (defense-in-depth read), car
    // un `<mj-wrapper>` enveloppant un fragment commençant par `<mj-text>` ou
    // `<mj-raw>` produit du MJML mal-formé visible à la compilation. Le warn
    // signale le cas pathologique à l'opérateur sans suspendre l'émission.
    if (contentWrapper && !startsWithMjSection(bodyFragment)) {
      console.warn(
        '[render-email] content-wrapper requested but body fragment does not start with <mj-section> — wrapper emitted defensively, downstream MJML may misrender',
      )
    }
  }

  // Plan 4b review pass 2 (M3) — `normalizePx` re-extrait la valeur via
  // `PX_VALUE_RE` et reconstitue `${n}px` lowercase. Évite d'interpoler une
  // valeur admin brute (`'40PX'`, `' 40 px '`) qui pourrait mal compiler côté
  // MJML core selon version.
  const wrappedHeader =
    headerHasPaddingTop && startsWithMjSection(headerBlock)
      ? `<mj-wrapper padding-top="${normalizePx(mjBodyAttrs.paddingTop)}" padding-bottom="0" padding-left="0" padding-right="0">${headerBlock}</mj-wrapper>`
      : headerBlock
  const wrappedFooter =
    footerHasPaddingBottom && startsWithMjSection(footerBlock)
      ? `<mj-wrapper padding-top="0" padding-bottom="${normalizePx(mjBodyAttrs.paddingBottom)}" padding-left="0" padding-right="0">${footerBlock}</mj-wrapper>`
      : footerBlock

  // Plan-5b-defer-A L3 — wrap conditionnel autour du `bodyFragment`. La
  // formattage retourne `''` si aucun attribut whitelisté ne survit à la
  // defense-in-depth ; dans ce cas (et quand `contentWrapper === null`), on
  // émet `bodyFragment` tel quel pour préserver la parité byte-level avec
  // pré-L3 sur les BASELINES existantes.
  const contentWrapperAttrs = contentWrapper
    ? formatContentWrapperAttrs(extractContentWrapperAttrs(contentWrapper.contentMjml))
    : ''
  const wrappedBody = contentWrapperAttrs
    ? `<mj-wrapper ${contentWrapperAttrs}>${bodyFragment}</mj-wrapper>`
    : bodyFragment

  return `<mjml>
    <mj-head>
      <mj-title>TimePick</mj-title>
      <mj-breakpoint width="600px"></mj-breakpoint>
      <mj-attributes>
        <mj-all font-family="${brand.fontFamily}"></mj-all>
        <mj-text color="#333333" font-size="14px" line-height="22px"></mj-text>
        <mj-button background-color="${brand.primaryColor}" color="${brand.buttonTextColor}" border-radius="${brand.buttonBorderRadius}px"></mj-button>
      </mj-attributes>
      <mj-style>
        @media only screen and (max-width: 600px) {
          .mj-column-per-100 { width: 100% !important; max-width: 100% !important; }
        }
      </mj-style>
    </mj-head>
    <mj-body background-color="${safeBackgroundColor(mjBodyAttrs.backgroundColor, HARDCODED_MJ_BODY_ATTRS.backgroundColor)}">
      ${wrappedHeader}
      ${wrappedBody}
      ${wrappedFooter}
    </mj-body>
  </mjml>`
}

// ---------------------------------------------------------------------------
// HTML → plain-text fallback (D2). Regex-based; ugly but functional. A heavier
// library (html-to-text) is overkill here — we only need a non-empty body for
// spam-filter scoring and accessibility clients.
// ---------------------------------------------------------------------------

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|nbsp|quot|#39|apos);/g, (m) => HTML_ENTITY_MAP[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderEmail(
  params: RenderEmailParams,
): Promise<RenderEmailOutput> {
  // Synchronous validation BEFORE any DB call.
  if (!TEMPLATE_KEYS.has(params.templateKey)) {
    throw new InvalidTemplateKeyError(params.templateKey as string)
  }

  const brand = await getValidatedBrand()
  return renderEmailWithBrand(params, brand)
}

// Internal pipeline that takes an already-validated brand. Used by
// `renderEmail` and by `runRenderEmailHealthcheck` so the latter can read the
// brand row ONCE per boot instead of N times in parallel (H1 fix).
//
// Story 26.1 — the shell (header/body/footer) is now resolved by
// `shell-resolver.service.ts` rather than read inline. The resolver applies
// the cascade `event → template → brand → hardcoded fallback` for
// header/footer; the body cascade is intentionally frozen in 26-1 and
// remains restricted to event (per-event override) or template (default).
async function renderEmailWithBrand(
  params: RenderEmailParams,
  brand: EmailBrandSettings,
): Promise<RenderEmailOutput> {
  const { templateKey, eventId, variables } = params

  if (eventId !== undefined && !UUID_RE.test(eventId)) {
    throw new InvalidEventIdError(eventId)
  }

  let resolved
  try {
    resolved = await resolveShellParts({
      templateKey,
      eventId,
      // `brand` réduit à `logoUrl` : le fond du <mj-body> vient de la cascade
      // shell_parts(mj-body) / du repli hardcodé `HARDCODED_MJ_BODY_ATTRS`, et
      // n'est plus un token de marque (retrait `background_color`, migration 022 —
      // cf. ResolveShellPartsInput dans shell-resolver.service.ts).
      brand: { logoUrl: brand.logoUrl },
    })
  } catch (err) {
    if (err instanceof TemplateBodyMissingError) {
      throw new TemplateNotFoundError(templateKey)
    }
    throw err
  }

  // Règle footer-sans-lien : le footer résolu par la cascade n'est passé à
  // buildShell que si le corps contient un lien ; sinon effectiveFooter
  // retourne un fragment no-op (pas de footer visible). buildShell reste un
  // assembleur pur — la règle vit dans la couche d'orchestration du rendu.
  const footer = effectiveFooter(resolved.body.contentMjml, resolved.footer.contentMjml)
  const shellSource = buildShell(
    brand,
    resolved.body.contentMjml,
    resolved.header.contentMjml,
    footer,
    resolved.mjBody.attrs,
    resolved.contentWrapper,
  )
  const compiled = await compileMjml(shellSource)
  if (compiled.errors.length > 0) {
    throw new MjmlCompileError(compiled.errors)
  }

  const withVars = substituteVariables(compiled.html, variables)
  const html = sanitizeEmailHtml(withVars)
  const text = htmlToText(html)

  return { html, text }
}
// ---------------------------------------------------------------------------
// Email de test SMTP (2026-06-28) : même habillage qu'un email système
// standard. On emprunte le MÊME chemin de résolution que renderEmailWithBrand
// (resolveShellParts → cascade shell_parts depuis l'owner partagé
// template[invitation]) plutôt que les constantes HARDCODED_* (shell « nu » du
// test de parité 2-args). Ainsi l'email hérite du padding d'enveloppe <mj-body>
// (30px), de la carte content-wrapper (bordures #e5e7eb + border-radius) et du
// header de marque — ET respecte les customisations admin de la coque partagée
// (la cascade lit la DB). On n'override que le corps (message de test).
//
// Sans footer de confidentialité : le corps ne contient aucun lien, donc la
// règle `effectiveFooter` supprime le footer automatiquement (source unique de
// la règle footer-sans-lien, partagée avec renderEmailWithBrand).
//
// Aucun paramètre : le destinataire et le transport sont gérés par la couche
// transport (email-transport.service.ts / email-send.service.ts), qui importe
// cette fonction et envoie le { html, text } rendu.
// ---------------------------------------------------------------------------

export async function renderSmtpTestEmail(): Promise<{ html: string; text: string }> {
  const brand = await loadBrandOrDefault()

  // Coque commune production — owner partagé template[invitation] (promotion γ).
  // On ne consomme que header / footer / mjBody / contentWrapper ; le corps
  // résolu (invitation) est écarté au profit du message de test ci-dessous.
  const resolved = await resolveShellParts({
    templateKey: 'invitation',
    brand: { logoUrl: brand.logoUrl },
  })

  // Corps verbatim demandé par l'utilisateur, calqué sur le style production
  // (<mj-section padding="20px"> SANS background-color — la carte blanche vient
  // du content-wrapper, comme les autres templates). Aucun href → effectiveFooter
  // retourne le fragment no-op → pas de footer de confidentialité.
  const bodyFragment = `<mj-section padding="20px"><mj-column>
        <mj-text>Connexion SMTP réussie ! Si vous recevez cet email, votre configuration SMTP est correcte.</mj-text>
      </mj-column></mj-section>`

  const footer = effectiveFooter(bodyFragment, resolved.footer.contentMjml)
  const shell = buildShell(
    brand,
    bodyFragment,
    resolved.header.contentMjml,
    footer,
    resolved.mjBody.attrs,
    resolved.contentWrapper,
  )

  const compiled = await compileMjml(shell)
  if (compiled.errors.length > 0) {
    throw new MjmlCompileError(compiled.errors)
  }

  // compileMjml ne produit pas de version plain-text (MjmlCompileResult =
  // { html, errors }) ; on dérive le text du HTML sanitisé, comme
  // renderEmailWithBrand. Aucune variable à substituer (pas de placeholder
  // dans le corps de test) — substituteVariables n'est pas nécessaire.
  const html = sanitizeEmailHtml(compiled.html)
  const text = htmlToText(html)

  return { html, text }
}

// ---------------------------------------------------------------------------
// Boot-time healthcheck (D-ext7 fail-fast)
// ---------------------------------------------------------------------------

// Boot healthcheck stub ONLY — admin preview/test-send use buildPreviewVariables() (email.service.ts).
export const HEALTHCHECK_STUB_VARIABLES: VariablesPayload = {
  event_name: 'Healthcheck',
  event_description: 'Healthcheck render',
  magic_link: 'https://example.invalid/healthcheck',
  expiration_date: '2099-12-31',
  slot_date: '2099-12-31',
  slot_time: '12:00',
  user_first_name: 'Camille',
  user_last_name: 'Martin',
  user_full_name: 'Camille Martin',
  cancellation_reason: '',
  login_url: 'https://example.invalid/login',
  changes_blocks: '',
  calendar_url: 'https://example.invalid/calendrier',
}

export async function runRenderEmailHealthcheck(): Promise<void> {
  // Read brand ONCE — a missing/invalid brand row would otherwise surface as
  // four duplicate failure entries (one per template), drowning the real root
  // cause. Brand-level errors propagate as-is so the boot log shows the actual
  // typed error (BrandSettingsNotFoundError / InvalidBrandSettingsError).
  const brand = await getValidatedBrand()

  // Run all templates in parallel; collect every TEMPLATE-level failure
  // so the dev sees them all at once instead of one-by-one across reboots.
  const results = await Promise.all(
    Array.from(TEMPLATE_KEYS).map(async (key) => {
      try {
        await renderEmailWithBrand(
          { templateKey: key, variables: HEALTHCHECK_STUB_VARIABLES },
          brand,
        )
        return { key, error: null as Error | null }
      } catch (err) {
        return { key, error: err instanceof Error ? err : new Error(String(err)) }
      }
    }),
  )

  const failures = results
    .filter((r): r is { key: TemplateKey; error: Error } => r.error !== null)
    .map((r) => ({ key: r.key, error: r.error }))

  if (failures.length > 0) {
    throw new RenderEmailHealthcheckError(failures)
  }
}

// Exported for unit tests only — keeps the public API lean.
export const __testing__ = {
  buildShell,
  htmlToText,
  isNonZeroPx,
  normalizePx,
  startsWithMjSection,
  safeBackgroundColor,
  validateBrandSettings,
  HEALTHCHECK_STUB_VARIABLES,
  // Plan-5b-defer-A L3 (2026-05-25) — helpers content-wrapper.
  extractContentWrapperAttrs,
  formatContentWrapperAttrs,
  hasContentWrapperPayload,
  BORDER_RADIUS_RENDER_RE,
  // Règle footer-sans-lien (2026-06-28) — test seam pour les unit tests.
  effectiveFooter,
}
