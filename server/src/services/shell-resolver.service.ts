/**
 * Shell Resolver — composes the 3-block email shell (header, body, footer)
 * by walking the cascade `event → template → brand → hardcoded fallback`.
 *
 * Story 26.1 / AC3 — the cascade applies to header and footer. The body
 * cascade is intentionally frozen in 26-1 (per the email-shell customization
 * policy and Q2 in the story) to avoid breaking FR56-FR60 (24-2 / 24-3). The
 * body block IS exposed in the output for wire-shape uniformity (AC5
 * endpoint contract returns all 3 blocks), but its `origin` is restricted
 * to `'event'` (when `events.invitation_mjml` is non-null) or `'template'`
 * (the default `email_templates.body_mjml`). `shell_parts` rows with
 * `part_kind='body'` are accepted for forward-compat writes but NEVER
 * read here.
 *
 * Plans 3b (2026-05-23) + 5b (2026-05-24) + plan-5b-defer-A L2 (2026-05-25)
 * — promotion γ : pour `part_kind IN ('header', 'mj-body', 'content-wrapper')`,
 * le row `(template, 'invitation', <part_kind>)` agit comme fallback
 * inter-templates entre `template[currentKey]` et `brand`. Le footer reste
 * strictement isolé par templateKey (cf. la politique de personnalisation de
 * la coque email, section « Promotion γ : en-tête, attributs mj-body, content-wrapper »).
 *
 * `content-wrapper` est un artefact transversal hors-bloc : sa résolution
 * est exposée dans `ResolvedShell.contentWrapper` (nullable) pour que L3
 * (render-email + UI dédiée) puisse en consommer la valeur. L2 ne lit pas
 * cette valeur côté rendu — c'est volontairement un enabler data-layer.
 *
 * Pattern reference: event-email-template.service.ts:31-44 (`buildView`)
 * — a simpler 2-level cascade. We generalize to 4 buckets for promoted
 * part_kinds (header + mj-body + content-wrapper via promotion γ) and
 * 3 buckets for the footer (no promotion).
 */

import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

import { query } from '../db'
import { hardcodedHeader, HARDCODED_FOOTER, recoupleHeaderLogo } from './shell-hardcoded-fallback'
import type { TemplateKey } from './render-email.service'
import { TEMPLATE_KEYS } from './render-email.service'
import type { OwnerKind, PartKind } from './shell-parts.service'

// --- Types ---

type BlockOrigin = 'event' | 'template' | 'brand' | 'hardcoded'

// Plan post-5b-defer-A L2-B / B.5 — origines réellement productibles pour le
// content-wrapper. Aucun filet hardcoded n'existe (cf. ligne ~284 « null »
// quand la cascade est vide), donc l'union exclut strictement 'hardcoded'.
// Type narrower côté consumers (render-email) sans casser l'assignabilité
// avec `BlockOrigin`.
export type PromotedBlockOrigin = Exclude<BlockOrigin, 'hardcoded'>

interface ResolvedBlock {
  contentMjml: string
  origin: BlockOrigin
}

export interface ResolvedContentWrapper {
  contentMjml: string
  origin: PromotedBlockOrigin
}

// Plan 1 du 2026-05-22 — attributs du <mj-body> racine résolus via cascade
// shell_parts (part_kind='mj-body'). 3 attrs whitelistés par le validator :
// background-color (hex), padding-top, padding-bottom (entiers 0-100 px).
// Défauts hardcodés en filet : '#ffffff', '0', '0'.
export interface ResolvedMjBodyAttrs {
  backgroundColor: string
  paddingTop: string
  paddingBottom: string
}

interface ResolvedMjBody {
  attrs: ResolvedMjBodyAttrs
  origin: BlockOrigin
}

export interface ResolvedShell {
  header: ResolvedBlock
  body: ResolvedBlock
  footer: ResolvedBlock
  mjBody: ResolvedMjBody
  /**
   * Plan-5b-defer-A L2 (2026-05-25) — artefact transversal hors-bloc résolu via
   * cascade γ (cf. la politique de personnalisation de la coque email, § « Le content-wrapper transversal »).
   * `null` quand la cascade est vide : conforme au filet hardcoded « aucun
   * encadrement par défaut ». La consommation côté render-email arrive en L3.
   *
   * Plan post-5b-defer-A L2-B / B.5 — narrower union via `ResolvedContentWrapper`
   * (origin: 'event' | 'template' | 'brand' — pas 'hardcoded') reflète la
   * production réelle du pipeline et bloque côté TypeScript toute construction
   * `{ contentMjml, origin: 'hardcoded' }`.
   */
  contentWrapper: ResolvedContentWrapper | null
}

// Défauts hardcodés du <mj-body> (= le « Cadre » de l'e-mail). Source UNIQUE du
// fond par défaut depuis le retrait de `email_brand_settings.background_color`
// (migration 022) : le fond n'est plus un token de marque. La cascade
// shell_parts(mj-body) surcharge ce défaut dès qu'une row existe ; sans row, ce
// repli s'aligne sur le fond de page de la coque commune « carte »
// (`INVITATION_FACTORY_MJBODY_MJML` = `#fafafa`, migration 018) pour que le mode
// dégradé (DB vide) rende la même teinte que l'état semé. La cohérence
// fallback ↔ usine est garantie par shell-fallback-ssot.test.ts.
// Conforme à la politique de personnalisation de la coque email.
export const HARDCODED_MJ_BODY_ATTRS: ResolvedMjBodyAttrs = {
  backgroundColor: MJ_BODY_BACKGROUND_COLOR,
  paddingTop: '0',
  paddingBottom: '0',
}

export interface ResolveShellPartsInput {
  /** Optional event UUID — drives the per-event override for header/footer cascade and the body invitation override. */
  eventId?: string
  templateKey: TemplateKey
  /**
   * Subset de `EmailBrandSettings` réduit à `logoUrl` : pilote le logo du
   * header à TOUS les niveaux de cascade — le fallback hardcoded
   * (`hardcodedHeader`) ET le re-couplage des overrides (`recoupleHeaderLogo`,
   * Drawbridge #29). Le logo suit toujours la marque. Le fond du `<mj-body>`
   * n'est plus un token de marque (retrait `background_color`, migration 022) :
   * il vient de la cascade `shell_parts(mj-body)` ou, à défaut, de la constante
   * `HARDCODED_MJ_BODY_ATTRS` (cf. resolveShellParts).
   */
  brand: { logoUrl: string | null }
}

// --- Errors ---

export class ShellResolverError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShellResolverError'
  }
}

export class TemplateBodyMissingError extends ShellResolverError {
  constructor(public readonly templateKey: TemplateKey) {
    super(`email_templates.body_mjml row for "${templateKey}" is missing — re-run migration 006`)
  }
}

// --- Internal types ---

type RawRow = {
  owner_kind: OwnerKind
  owner_id: string
  part_kind: PartKind
  content_mjml: string
}

const CASCADE_PRIORITY: ReadonlyArray<OwnerKind> = ['event', 'template', 'brand']

// Plans 3b (2026-05-23) + 5b (2026-05-24) + defer-A L2 (2026-05-25) — promotion γ :
// pour les part_kinds listés dans PROMOTED_PART_KINDS, le row
// (template, 'invitation', <part_kind>) sert de fallback inter-templates entre
// la couche template courante et la couche brand. Footer reste strictement régi
// par CASCADE_PRIORITY (cf. la politique de personnalisation de la coque email,
// section « Promotion γ : en-tête, attributs mj-body, content-wrapper »).
//
// PROMOTED_PART_KINDS est la source unique consommée à la fois par la requête
// SQL (interpolation littérale dans la clause `IN (...)` ci-dessous) ET par la
// sélection JS dans `pickHighestPriority`. Toute extension du tuple doit
// passer par cette constante : la divergence SQL ↔ JS produirait un silent
// fallback hardcoded (BH I1/I2, EC4/EC10 — review pass 2026-05-24).
type PromotedBucket = 'event' | 'template-current' | 'template-invitation' | 'brand'
const CASCADE_PRIORITY_PROMOTED: ReadonlyArray<PromotedBucket> = [
  'event',
  'template-current',
  'template-invitation',
  'brand',
]

const PROMOTED_PART_KINDS = ['header', 'mj-body', 'content-wrapper'] as const
const PROMOTED_PART_KINDS_SET: ReadonlySet<PartKind> = new Set(PROMOTED_PART_KINDS)
const PROMOTED_PART_KINDS_SQL = PROMOTED_PART_KINDS.map((k) => `'${k}'`).join(', ')

function promotedBucketOf(row: RawRow, templateKey: TemplateKey): PromotedBucket {
  if (row.owner_kind === 'event') return 'event'
  if (row.owner_kind === 'brand') return 'brand'
  return row.owner_id === templateKey ? 'template-current' : 'template-invitation'
}

function pickHighestPriority(
  rows: RawRow[],
  partKind: PartKind,
  templateKey: TemplateKey,
): RawRow | null {
  if (PROMOTED_PART_KINDS_SET.has(partKind)) {
    for (const bucket of CASCADE_PRIORITY_PROMOTED) {
      const hit = rows.find(
        (r) => r.part_kind === partKind && promotedBucketOf(r, templateKey) === bucket,
      )
      if (hit) return hit
    }
    return null
  }
  for (const ownerKind of CASCADE_PRIORITY) {
    const hit = rows.find((r) => r.part_kind === partKind && r.owner_kind === ownerKind)
    if (hit) return hit
  }
  return null
}

// --- Public API ---

/**
 * Resolves the 3-block shell plus its hors-bloc artefacts (mj-body attrs,
 * content-wrapper) for a given (templateKey, eventId?) tuple.
 *
 * Algorithm:
 *   1. Header/footer/mj-body/content-wrapper — single SQL fetching every
 *      candidate row across brand/template/event for the relevant owner_ids
 *      (plus the invitation header + mj-body + content-wrapper fallback for
 *      non-invitation templates — Plans 3b/5b + defer-A L2), then in JS pick
 *      the highest-priority row per part_kind. Header, mj-body and
 *      content-wrapper use the 4-bucket order `event > template-current >
 *      template-invitation > brand`; footer uses the 3-bucket order
 *      `event > template > brand`. If nothing → hardcoded fallback for
 *      header/footer/mj-body, and `null` for content-wrapper (« aucun
 *      encadrement par défaut » per the email-shell customization policy).
 *   2. Body — special-cased: if `templateKey === 'invitation'` and
 *      `eventId` is provided and `events.invitation_mjml` is non-null,
 *      origin = 'event'; otherwise read `email_templates.body_mjml`,
 *      origin = 'template'. `shell_parts` is never consulted for body
 *      in 26-1.
 */
export async function resolveShellParts(input: ResolveShellPartsInput): Promise<ResolvedShell> {
  const { eventId, templateKey, brand } = input

  if (!TEMPLATE_KEYS.has(templateKey)) {
    throw new ShellResolverError(`Unknown templateKey: ${templateKey}`)
  }

  // Header/footer/mj-body/content-wrapper cascade query — single round-trip.
  // Tous partagent le même schéma cascade et ne coûtent donc qu'une ligne SQL
  // de plus (un IN au lieu de N). La pick s'effectue séparément par part_kind
  // ci-dessous. content-wrapper (Plan-5b-defer-A L2) est promu γ comme header
  // et mj-body.
  // owner_id convention per kind:
  //   brand    → '1'
  //   template → templateKey
  //   event    → eventId (only included when provided)
  const params: string[] = [templateKey]
  let eventClause = ''
  if (eventId) {
    params.push(eventId)
    eventClause = ` OR (owner_kind = 'event' AND owner_id = $2)`
  }

  // 3e branche `(owner_kind = 'template' AND owner_id = 'invitation' AND
  // part_kind IN (<PROMOTED_PART_KINDS_SQL>) AND $1 <> 'invitation')` :
  // Plans 3b/5b — fetch systématique des rows invitation.<part_kind> comme
  // fallback inter-templates, bornés aux part_kinds promus (γ). Le garde
  // `$1 <> 'invitation'` évite que la 3e branche n'introduise un row
  // redondant côté JS quand `templateKey === 'invitation'` : sans le garde,
  // la 2e et la 3e branche cibleraient le même tuple et `pickHighestPriority`
  // verrait deux entrées au même bucket `template-current` (PK identique côté
  // DB — la dédup côté SQL n'a pas lieu sur un OR, contrairement à ce qu'un
  // commentaire antérieur laissait croire). Le garde est donc fonctionnel,
  // pas cosmétique.
  // ORDER BY défensif (Plan post-5b-defer-A L2-B / B.3) : garantit que
  // `pickHighestPriority` reçoit toujours les mêmes rows dans le même ordre
  // côté JS, indépendamment du plan d'exécution Postgres. Sans ce garde, si
  // une régression future introduit deux rows légitimes dans un même bucket
  // logique (ex. nouveau `part_kind` oubliant le garde `$1 <> 'invitation'`
  // de la 3ᵉ branche), `rows.find()` retournerait un résultat dépendant de
  // l'ordre PG. Le tri par `(part_kind, owner_kind, owner_id)` est arbitraire
  // mais déterministe ; il ne change pas la priorité fonctionnelle qui reste
  // pilotée par `CASCADE_PRIORITY` et `CASCADE_PRIORITY_PROMOTED` côté JS.
  const { rows } = await query<RawRow>(
    `SELECT owner_kind, owner_id, part_kind, content_mjml
       FROM shell_parts
      WHERE part_kind IN ('header', 'footer', 'mj-body', 'content-wrapper')
        AND (
              (owner_kind = 'brand' AND owner_id = '1')
           OR (owner_kind = 'template' AND owner_id = $1)
           OR (owner_kind = 'template' AND owner_id = 'invitation' AND part_kind IN (${PROMOTED_PART_KINDS_SQL}) AND $1 <> 'invitation')
           ${eventClause}
        )
      ORDER BY part_kind, owner_kind, owner_id`,
    params,
  )

  const headerPick = pickHighestPriority(rows, 'header', templateKey)
  const footerPick = pickHighestPriority(rows, 'footer', templateKey)
  const mjBodyPick = pickHighestPriority(rows, 'mj-body', templateKey)
  const contentWrapperPick = pickHighestPriority(rows, 'content-wrapper', templateKey)

  // Drawbridge #29 — le logo est un token de marque ; une surcharge qui le fige
  // dans `content_mjml` le découplait de `brand.logoUrl` (reset/changement sans
  // effet sur le header). On re-dérive le contenu logo/texte de la surcharge
  // depuis `brand.logoUrl` en conservant ses attrs structurels. Le fallback
  // `hardcoded` couple déjà via `hardcodedHeader()`, donc on le laisse intact
  // (parité 26-0).
  const header: ResolvedBlock = headerPick
    ? { contentMjml: recoupleHeaderLogo(headerPick.content_mjml, brand.logoUrl), origin: headerPick.owner_kind }
    : { contentMjml: hardcodedHeader(brand.logoUrl), origin: 'hardcoded' }

  const footer: ResolvedBlock = footerPick
    ? { contentMjml: footerPick.content_mjml, origin: footerPick.owner_kind }
    : { contentMjml: HARDCODED_FOOTER, origin: 'hardcoded' }

  // Résolution du fond/marges du <mj-body> (= le « Cadre » de l'e-mail). Ordre :
  //   1. surcharge admin `shell_parts(mj-body)` — éditée via l'éditeur MJML ;
  //      inclut le fallback inter-templates de la coque commune invitation
  //      (branche γ de la requête ci-dessus ; cf. la politique de personnalisation de la coque email) ;
  //   2. sinon repli hardcodé `HARDCODED_MJ_BODY_ATTRS`, dont la couleur EST la
  //      constante partagée `MJ_BODY_BACKGROUND_COLOR` — citée par son nom, jamais
  //      par sa valeur (ce commentaire affichait un `#ffffff` périmé). Le fond n'est
  //      plus un token de marque depuis le retrait de `background_color` (022).
  const mjBody: ResolvedMjBody = mjBodyPick
    ? {
        attrs: extractMjBodyAttrs(mjBodyPick.content_mjml),
        origin: mjBodyPick.owner_kind,
      }
    : {
        attrs: HARDCODED_MJ_BODY_ATTRS,
        origin: 'hardcoded',
      }

  // Plan-5b-defer-A L2 — content-wrapper est nullable : aucun fragment hardcoded
  // n'est inventé en filet (policy § content-wrapper « aucun encadrement par
  // défaut »). `null` exprime sans ambiguïté l'absence d'encadrement et force
  // le narrowing TypeScript côté consommateur L3.
  //
  // L2-B / B.5 — type narrower `ResolvedContentWrapper` (origin sans 'hardcoded').
  // `contentWrapperPick.owner_kind` est typé `OwnerKind` = `'event' | 'template'
  // | 'brand'`, donc assignable à `PromotedBlockOrigin` sans cast.
  const contentWrapper: ResolvedContentWrapper | null = contentWrapperPick
    ? { contentMjml: contentWrapperPick.content_mjml, origin: contentWrapperPick.owner_kind }
    : null

  const body = await resolveBody(templateKey, eventId)

  return { header, body, footer, mjBody, contentWrapper }
}

// --- mj-body attrs extraction ---

// Regex non-greedy pour capturer le blob d'attributs du <mj-body>. Le contenu
// passé en argument a été validé en amont (`validateShellContentPart` /
// branche mj-body) : exactement un <mj-body>, pas d'enfants, attrs whitelistés
// uniquement. Une simple regex suffit ; importer MJMLParser ici alourdirait le
// chemin lecture du editor-context sans bénéfice de robustesse.
const MJ_BODY_OPEN_RE = /<mj-body\b([^>]*)>/
// `matchAll` génère un iterator frais à chaque appel ; pas de `lastIndex`
// partagé entre invocations (piège classique d'une regex `g` au module-level).
const ATTR_MATCH_ALL_RE = /([\w-]+)="([^"]*)"/g

function extractMjBodyAttrs(contentMjml: string): ResolvedMjBodyAttrs {
  // Défaut = repli hardcodé `HARDCODED_MJ_BODY_ATTRS` (couleur =
  // `MJ_BODY_BACKGROUND_COLOR`) : une row mj-body sans attribut
  // `background-color` hérite du repli au lieu de retomber en chaîne vide. Le
  // fond n'est plus un token de marque (retrait `background_color`, migration 022).
  const attrs: ResolvedMjBodyAttrs = { ...HARDCODED_MJ_BODY_ATTRS }
  const match = MJ_BODY_OPEN_RE.exec(contentMjml)
  if (!match) return attrs
  for (const [, key, value] of match[1].matchAll(ATTR_MATCH_ALL_RE)) {
    if (key === 'background-color') attrs.backgroundColor = value
    else if (key === 'padding-top') attrs.paddingTop = value
    else if (key === 'padding-bottom') attrs.paddingBottom = value
  }
  return attrs
}

async function resolveBody(templateKey: TemplateKey, eventId: string | undefined): Promise<ResolvedBlock> {
  if (templateKey === 'invitation' && eventId) {
    const { rows } = await query<{ invitation_mjml: string | null }>(
      `SELECT invitation_mjml FROM events WHERE id = $1`,
      [eventId],
    )
    const override = rows[0]?.invitation_mjml
    if (override) {
      return { contentMjml: override, origin: 'event' }
    }
  }

  const { rows } = await query<{ body_mjml: string }>(
    `SELECT body_mjml FROM email_templates WHERE template_key = $1`,
    [templateKey],
  )
  const row = rows[0]
  if (!row) throw new TemplateBodyMissingError(templateKey)
  return { contentMjml: row.body_mjml, origin: 'template' }
}
