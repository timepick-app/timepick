/**
 * Body extraction / wrapping helpers for the MJML editor overlay.
 *
 * The editor canvas needs a full <mjml> document (locked header + footer +
 * editable body), but the DB stores only the body fragment. These helpers
 * round-trip between the two using HTML comment markers (D-ext6, frozen in
 * Story 23-0 T5.4).
 *
 * Self-closing MJML tags (e.g. `<mj-image .../>`) are forbidden inside body
 * fragments: GrapesJS' DOM parser treats the void form as opening a tag that
 * absorbs subsequent siblings as children. Use the explicit close form
 * (`<mj-image ...></mj-image>`). See memory `feedback_grapesjs_mjml_self_closing.md`.
 */

import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

const BODY_MARKER_RE = /<!-- BODY:START -->([\s\S]*?)<!-- BODY:END -->/
const MJ_BUTTON_OPEN_TAG_RE = /<mj-button\b([^>]*)>/g
const BRAND_BUTTON_ATTR_RE = /\s+(?:background-color|color|border-radius)="[^"]*"/g
const MJ_SECTION_OPEN_TAG_RE = /<mj-section\b([^>]*)>/
const CSS_CLASS_ATTR_RE = /\s+css-class="([^"]*)"/
const DATA_LOCKED_LABEL_ATTR_RE = /\s*data-locked-label="[^"]*"/
const DATA_PART_KIND_ATTR_RE = /\s*data-part-kind="[^"]*"/
const DATA_INHERITED_ATTR_RE = /\s*data-inherited="[^"]*"/
// Plan `2026-05-17-shell-parts-persistance-save` + Plan carte-éditable —
// regex d'extraction des sections header/footer et de la carte (mj-wrapper)
// d'un MJML complet de canvas. `\b` sur `<mj-body` évite un faux match sur
// `<mj-body-wrapper>` hypothétique. Les variantes _G (globales) servent au
// comptage d'unicité des marqueurs dans `isShellMarkersIntact`.
const MJ_BODY_OPEN_TAG_RE = /<mj-body\b([^>]*)>/
const ATTR_MATCH_ALL_RE = /([\w-]+)="([^"]*)"/g
const MJ_SECTION_OPEN_TAG_RE_G = /<mj-section\b([^>]*)>/g
const MJ_BODY_OPEN_RE = /<mj-body\b[^>]*>/
const BODY_START_RE = /<!--\s*BODY:START\s*-->/
const BODY_END_RE = /<!--\s*BODY:END\s*-->/
const MJ_BODY_CLOSE_RE = /<\/mj-body>/
const MJ_BODY_OPEN_RE_G = /<mj-body\b[^>]*>/g
const BODY_START_RE_G = /<!--\s*BODY:START\s*-->/g
const BODY_END_RE_G = /<!--\s*BODY:END\s*-->/g
const MJ_BODY_CLOSE_RE_G = /<\/mj-body>/g
const CARD_WRAPPER_OPEN_RE = /<mj-wrapper\b([^>]*)>/
const CARD_WRAPPER_OPEN_RE_G = /<mj-wrapper\b[^>]*>/g
const CARD_WRAPPER_CLOSE_RE = /<\/mj-wrapper>/
const CARD_WRAPPER_CLOSE_RE_G = /<\/mj-wrapper>/g
// Attributs whitelistés conservés à l'extraction de la carte (forme stockage).
const CARD_ATTR_WHITELIST = new Set([
  'background-color',
  'border-radius',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'padding',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
])

export type LockedShellPartKind = 'header' | 'footer'

export interface BrandShellTokens {
  logoUrl: string | null
  primaryColor: string
  fontFamily: string
  buttonBorderRadius: number
}

type ShellBlockOrigin = 'event' | 'template' | 'brand' | 'hardcoded'

interface ResolvedShellBlock {
  contentMjml: string
  origin: ShellBlockOrigin
}

// Plan 1 du 2026-05-22 — attributs résolus du <mj-body> racine. Mêmes 3 attrs
// que le côté serveur (cf. `ResolvedMjBodyAttrs` dans editor-context.service).
// Dupliqué ici pour éviter une dépendance services → components.
export interface ResolvedMjBodyAttrsForCanvas {
  backgroundColor: string
  paddingTop: string
  paddingBottom: string
}

export interface ResolvedShellForCanvas {
  header: ResolvedShellBlock
  footer: ResolvedShellBlock
  // Plan 1 du 2026-05-22 — attrs résolus du <mj-body> racine (cascade fond).
  // Consommé par `wrapBodyForEditing` pour le `background-color` du canvas.
  mjBody: ResolvedMjBodyAttrsForCanvas
  // Plan carte-éditable (2026-06-08) — la carte (content-wrapper) résolue,
  // forme de stockage `<mj-section attrs></mj-section>`. Optionnel/null : un
  // canvas legacy (sans cascade content-wrapper) reste valide → corps nu.
  contentWrapper?: ResolvedShellBlock | null
}

export const HARDCODED_MJ_BODY_ATTRS_CANVAS: ResolvedMjBodyAttrsForCanvas = {
  backgroundColor: MJ_BODY_BACKGROUND_COLOR,
  paddingTop: '0',
  paddingBottom: '0',
}

function warnIfFragmentMissesMjSection(fragment: string, helperName: string): boolean {
  if (MJ_SECTION_OPEN_TAG_RE.test(fragment)) return true
  // This file is dual-runtime: imported by Vite (client) AND by ts-jest (the
  // server-side email-shell-parity test). `import.meta.env.DEV` is not
  // available under ts-jest's CommonJS compile, so the warn fires
  // unconditionally — that is intentional: a missing <mj-section> here
  // signals a real data-integrity issue (malformed resolved shell fragment)
  // and is rare enough that the noise in production is acceptable.
  console.warn(
    `[bodyExtraction] ${helperName} received a fragment without an <mj-section> opening tag — the helper is a no-op. Fragment preview:`,
    fragment.slice(0, 120),
  )
  return false
}

/**
 * Injects `css-class="locked-shell"` on the first `<mj-section>` of a
 * server-resolved fragment. The hardcoded fallback fragments shipped by
 * `server/src/services/shell-hardcoded-fallback.ts` deliberately omit the
 * class — keeping it canvas-only preserves the 26-0 baseline snapshots
 * byte-identical post-26-2. If the fragment already declares a `css-class`
 * attribute, the helper prepends `locked-shell` to its value (Q7).
 */
export function addLockedShellClass(fragment: string): string {
  if (!warnIfFragmentMissesMjSection(fragment, 'addLockedShellClass')) return fragment
  return fragment.replace(MJ_SECTION_OPEN_TAG_RE, (_match, attrsBlob: string) => {
    const cssClassMatch = CSS_CLASS_ATTR_RE.exec(attrsBlob)
    if (cssClassMatch) {
      const existing = cssClassMatch[1]
      if (existing.split(/\s+/).includes('locked-shell')) return `<mj-section${attrsBlob}>`
      // Empty existing css-class ("") would produce "locked-shell " with a
      // trailing space. Guard so the result stays clean.
      const nextValue = existing ? `locked-shell ${existing}` : 'locked-shell'
      const nextAttrs = attrsBlob.replace(CSS_CLASS_ATTR_RE, ` css-class="${nextValue}"`)
      return `<mj-section${nextAttrs}>`
    }
    return `<mj-section${attrsBlob} css-class="locked-shell">`
  })
}

/**
 * Injects `data-locked-label="<label>"` on the first `<mj-section>` of a
 * fragment — consumed by the CSS pseudo-element rule in `email-editor.css`
 * to render the permanent "En-tête" / "Pied" labels (AC6). Replaces any
 * pre-existing `data-locked-label` so re-wrapping is idempotent. The label
 * value is escaped to keep the produced attribute well-formed if a caller
 * (current or future) passes a string containing a double-quote.
 */
export function addLockedLabel(fragment: string, label: string): string {
  if (!warnIfFragmentMissesMjSection(fragment, 'addLockedLabel')) return fragment
  const safeLabel = label.replace(/"/g, '&quot;')
  return fragment.replace(MJ_SECTION_OPEN_TAG_RE, (_match, attrsBlob: string) => {
    const stripped = attrsBlob.replace(DATA_LOCKED_LABEL_ATTR_RE, '')
    return `<mj-section${stripped} data-locked-label="${safeLabel}">`
  })
}

/**
 * Injects `data-part-kind="header|footer"` on the first `<mj-section>` of a
 * fragment. Replaces any pre-existing `data-part-kind` so re-wrapping is
 * idempotent. Story 26-2 / D4 — moves the partKind tagging from the
 * `grapesConfig.ts` post-load forEach (which assigned by index 0/1 and broke
 * silently if `find('.locked-shell')` did not return exactly 2 roots) to the
 * MJML itself, making the routing deterministic.
 */
export function addPartKindAttr(fragment: string, partKind: LockedShellPartKind): string {
  if (!warnIfFragmentMissesMjSection(fragment, 'addPartKindAttr')) return fragment
  return fragment.replace(MJ_SECTION_OPEN_TAG_RE, (_match, attrsBlob: string) => {
    const stripped = attrsBlob.replace(DATA_PART_KIND_ATTR_RE, '')
    return `<mj-section${stripped} data-part-kind="${partKind}">`
  })
}

/**
 * Story 26-2d — injecte `data-part-kind="<partKind>"` sur la première
 * `<mj-section>` d'un fragment RÉSOLU juste avant un PUT vers
 * `/api/admin/shell-parts/:ownerKind/:ownerId/:partKind`. Le validateur serveur
 * 26-2c (`.strict()`) refuse les payloads dont l'attribut section ne correspond
 * pas au partKind du path — l'injection client-side rend le contrat explicite.
 * Accepte `'body'` (carte/content-wrapper) en plus de header/footer, à la
 * différence d'`addPartKindAttr` (canvas lock routing, header|footer seul, avec
 * garde warn). Idempotente : un `data-part-kind` pré-existant est strippé avant
 * ré-injection.
 */
export function tagSectionWithPartKind(
  fragment: string,
  partKind: 'header' | 'body' | 'footer',
): string {
  return fragment.replace(MJ_SECTION_OPEN_TAG_RE, (_match, attrsBlob: string) => {
    const stripped = attrsBlob.replace(DATA_PART_KIND_ATTR_RE, '')
    return `<mj-section${stripped} data-part-kind="${partKind}">`
  })
}

/**
 * Injects `data-inherited="true"` on the first `<mj-section>` of a fragment
 * when the block's origin differs from the current editing scope (= the block
 * is inherited from a higher level of the cascade). The grapesConfig post-load
 * pass uses this attribute to route the locked-shell to the deep lock pass
 * (full recursion + 6 flags) that prevents silent edits on inherited content.
 * When `isInherited === false`, any pre-existing `data-inherited` is stripped
 * (idempotent re-wraps after the user creates an override and reopens).
 *
 * Rule encoded here (mirrors the email-shell customization policy): no edit
 * may be entered on content that will not be saved. Inherited blocks have no
 * persistence target at the current level until an override is created
 * explicitly (Story 26-3).
 */
export function addInheritedAttr(fragment: string, isInherited: boolean): string {
  if (!warnIfFragmentMissesMjSection(fragment, 'addInheritedAttr')) return fragment
  return fragment.replace(MJ_SECTION_OPEN_TAG_RE, (_match, attrsBlob: string) => {
    const stripped = attrsBlob.replace(DATA_INHERITED_ATTR_RE, '')
    if (!isInherited) return `<mj-section${stripped}>`
    return `<mj-section${stripped} data-inherited="true">`
  })
}

export function extractBodyFragment(fullMjml: string): string {
  const match = BODY_MARKER_RE.exec(fullMjml)
  if (!match) {
    throw new Error('Body markers missing')
  }
  return stripBrandButtonAttrs(match[1].trim())
}

export function isBodyMarkerIntact(fullMjml: string): boolean {
  return fullMjml.includes('<!-- BODY:START -->') && fullMjml.includes('<!-- BODY:END -->')
}

/**
 * Bug #3 post-e26 (smoke 2026-05-18) — strippe les marqueurs `<!-- BODY:START -->`
 * et `<!-- BODY:END -->` d'un body fragment. Idempotent : no-op si absents.
 *
 * Nécessaire car le body chargé par l'éditeur peut déjà contenir les marqueurs.
 * Deux sources : la forme factory/seed (`email_templates.body_mjml` /
 * `default_body_mjml`) les embarque ; et le flux par-événement les EXIGE dans le
 * payload PATCH (validator D-ext6, `event-email-template.validator.ts`), donc
 * `events.invitation_mjml` est toujours stocké AVEC. Le PATCH global invitation
 * (`invitationPatchSchema`) ne les impose PAS et stocke le payload tel quel.
 * Sans ce strip à l'init du canvas et des ancres, `wrapBodyForEditing`
 * double-injecterait les markers (2 paires) → dirty tracker incohérent → bouton
 * Enregistrer bloqué. Consommé aussi par les panneaux hôtes pour `isCustom`.
 */
export function stripBodyMarkers(fragment: string): string {
  return fragment.replace(/<!--\s*BODY:(START|END)\s*-->/g, '').trim()
}

// PARITY: must stay in lockstep with server buildShell() in
// server/src/services/render-email.service.ts. Header and footer block
// divergence is caught by
// server/src/services/__tests__/email-shell-parity.test.ts. If you change
// this shell, change the server shell too — or update the parity test
// with a justification.
//
// When `resolvedShell` is provided (since Story 26-2), the locked header and
// footer sections are replaced by the server-resolved fragments. The class
// `locked-shell` is injected client-side (`addLockedShellClass`) so the
// GrapesJS lock pass keeps matching the 2 root sections, while the server
// fragments stay byte-identical to the 26-0 baselines.
//
// STORY 26-2 transitoire — tant que PATCH /api/admin/shell-parts n'est pas
// livré, header et footer sont marqués `data-inherited="true"` inconditionnellement
// (deep-lock filet) pour bannir le silent-failure bug : le pipeline de save ne
// capte que le body entre les marqueurs BODY:START/END. La condition
// architecturale correcte (`origin !== ownerKind`) sera restaurée avec la
// future story PATCH — cf. git `5eebca2e^` pour la reconstruction.

/**
 * Plan carte-éditable (2026-06-08) — extrait le blob d'attributs du `<mj-section>`
 * racine d'un fragment de stockage content-wrapper (forme `<mj-section attrs/>`).
 * Le blob est ré-injecté verbatim dans le <mj-wrapper> de la carte du canvas
 * (attrs déjà validés write-side). Retourne '' si non trouvé → le caller
 * applique le défaut blanc.
 */
export function extractCardAttrsBlob(contentMjml: string | undefined | null): string {
  if (!contentMjml) return ''
  const m = MJ_SECTION_OPEN_TAG_RE.exec(contentMjml)
  return m ? m[1].trim() : ''
}

/**
 * Plan 1 du 2026-05-22 — extrait les 3 attrs (background-color, padding-top,
 * padding-bottom) du `<mj-body>` racine du MJML complet du canvas. Symétrique
 * à `extractBodyFragment` (qui extrait le contenu sectionnel). Les attrs
 * absentes retombent sur les défauts hardcodés (MJ_BODY_BACKGROUND_COLOR, '0', '0') —
 * équivalent client de `HARDCODED_MJ_BODY_ATTRS` côté serveur.
 *
 * Précondition implicite : le canvas est intègre (`isShellMarkersIntact`).
 * Si la balise `<mj-body>` n'est pas trouvée, jette une Error — l'orchestrateur
 * intercepte via try/catch comme pour les autres helpers d'extraction.
 */
export function extractMjBodyAttrs(fullMjml: string): ResolvedMjBodyAttrsForCanvas {
  const match = MJ_BODY_OPEN_TAG_RE.exec(fullMjml)
  if (!match) throw new Error('<mj-body> opening tag missing')
  const attrs: ResolvedMjBodyAttrsForCanvas = { ...HARDCODED_MJ_BODY_ATTRS_CANVAS }
  for (const [, key, value] of match[1].matchAll(ATTR_MATCH_ALL_RE)) {
    if (key === 'background-color') attrs.backgroundColor = value
    else if (key === 'padding-top') attrs.paddingTop = value
    else if (key === 'padding-bottom') attrs.paddingBottom = value
  }
  return attrs
}

/**
 * Plan 1 du 2026-05-22 — compare deux jeux d'attrs `<mj-body>`. Utilisé par
 * le dirty tracker (`isShellDirty`) pour décider si le leg orchestrateur
 * `<mj-body>` doit s'engager.
 */
export function mjBodyAttrsEqual(
  a: ResolvedMjBodyAttrsForCanvas,
  b: ResolvedMjBodyAttrsForCanvas,
): boolean {
  return (
    a.backgroundColor === b.backgroundColor &&
    a.paddingTop === b.paddingTop &&
    a.paddingBottom === b.paddingBottom
  )
}

/**
 * Prédicat UNIQUE « ce bloc de coque est hérité au niveau d'édition courant »,
 * c'est-à-dire : il n'a aucune cible de sauvegarde ici.
 *
 * Deux consommateurs doivent en dépendre, sans quoi ils divergent :
 *  - `wrapBodyForEditing` ci-dessous, qui pose `data-inherited` (→ deep-lock) ;
 *  - la garde de montage du `LockedShellInfoPanel` côté overlay.
 *
 * La divergence a réellement eu lieu : l'overlay gardait sur
 * `origin !== ownerKind`, vrai au niveau template général dès que la cascade
 * remonte à brand/hardcoded — le panneau « défini au niveau supérieur »
 * s'ouvrait alors sur une coque parfaitement éditable. Or l'onglet Invitation
 * écrit le propriétaire commun `template[invitation]` quelle que soit l'origine
 * résolue : c'est une SOURCE de la cascade, pas un niveau qui hérite.
 */
export function isShellBlockInherited(
  blockOrigin: string | undefined,
  shellLock?: { ownerKind?: 'brand' | 'template' | 'event'; isSystem?: boolean },
): boolean {
  // Seul le niveau événement hérite bloc par bloc : une surcharge event est
  // éditable, tout le reste de la cascade ne l'est pas depuis cet écran.
  if (shellLock?.ownerKind === 'event') return blockOrigin !== 'event'
  // Ailleurs, l'éditabilité ne dépend pas de l'origine : seul l'onglet
  // Invitation (template, non système) porte la coque commune.
  return !(shellLock?.ownerKind === 'template' && !shellLock?.isSystem)
}

export function wrapBodyForEditing(
  bodyFragment: string,
  brand: BrandShellTokens,
  resolvedShell?: ResolvedShellForCanvas,
  shellLock?: { ownerKind?: 'brand' | 'template' | 'event'; isSystem?: boolean },
): string {
  // <img> is a void HTML element rendered inside <mj-text> (which accepts raw
  // HTML), so the self-closing form is correct here. The self-closing ban
  // documented above applies only to MJML tags (`<mj-*>`), not to native HTML.
  const headerInner = brand.logoUrl
    ? `<img src="${escapeAttribute(brand.logoUrl)}" alt="Logo" style="max-height:60px" />`
    : 'TimePick'

  // Brand button attrs are applied directly to body buttons because
  // grapesjs-mjml renders each canvas component in isolation: an <mj-head> /
  // <mj-attributes> defaults block would never be inherited, so we no longer
  // emit one (the server owns the authoritative head via buildShell).
  // Stripped on extract → saved body remains brand-agnostic (D-ext5).
  //
  // Bug #3 post-e26 — strip les marqueurs BODY:START/END en amont : le body
  // chargé peut déjà les porter (forme factory/seed ; et flux par-événement où
  // le validator D-ext6 les impose). Sans ce strip défensif, le wrap re-injecte
  // une seconde paire → dirty tracker incohérent → bouton Enregistrer bloqué.
  const styledBody = applyBrandButtonAttrs(stripBodyMarkers(bodyFragment), brand)

  // Lot 2 T4 — la coque (header/pied/Frame) n'est éditable QUE dans l'éditeur
  // Invitation (ownerKind==='template' && !isSystem). Éditeurs système : coque
  // verrouillée (header/footer hérités → deep-lock). Niveau événement : seules
  // les sections d'origine non-événement sont héritées. Param optionnel → les
  // call-sites non mis à jour restent verrouillés (fallbackInherited=true).
  const headerInherited = isShellBlockInherited(resolvedShell?.header.origin, shellLock)
  const footerInherited = isShellBlockInherited(resolvedShell?.footer.origin, shellLock)
  const fallbackInherited = isShellBlockInherited(undefined, shellLock)

  // Fallback header — MIROIR byte-identique du serveur `hardcodedHeader`
  // (shell-hardcoded-fallback.ts) = la coque commune « carte »
  // (INVITATION_FACTORY_HEADER_MJML) : fond blanc, coins hauts arrondis, fines
  // bordures gris clair #e5e7eb, titre noir #000000. Les attrs canvas
  // (css-class/data-locked-label/data-part-kind/data-inherited) sont stripés par
  // normalize() du parity test → n'affectent pas la parité.
  const headerSection = resolvedShell
    ? addInheritedAttr(
        addPartKindAttr(
          addLockedLabel(addLockedShellClass(resolvedShell.header.contentMjml), 'En-tête'),
          'header',
        ),
        headerInherited,
      )
    : `<mj-section css-class="locked-shell" data-locked-label="En-tête" data-part-kind="header"${fallbackInherited ? ' data-inherited="true"' : ''} background-color="#ffffff" padding="20px" border-radius="10px 10px 0px 0px" border-right="1px solid #e5e7eb" border-left="1px solid #e5e7eb" border-top="1px solid #e5e7eb" border-bottom="1px solid #e5e7eb" padding-top="10px" padding-bottom="10px">
      <mj-column>
        <mj-text color="#000000" font-size="22px" font-weight="bold" align="center">${headerInner}</mj-text>
      </mj-column>
    </mj-section>`

  // Fallback footer — MIROIR byte-identique du serveur `HARDCODED_FOOTER`
  // (shell-hardcoded-fallback.ts) : PAS de <mj-divider>, padding-top="0".
  // Le divider a été retiré côté serveur par `f528dcc7`. Les attrs canvas
  // (css-class/data-locked-label/data-part-kind/data-inherited) sont stripés
  // par normalize() du parity test → n'affectent pas la parité.
  const footerSection = resolvedShell
    ? addInheritedAttr(
        addPartKindAttr(
          addLockedLabel(addLockedShellClass(resolvedShell.footer.contentMjml), 'Pied'),
          'footer',
        ),
        footerInherited,
      )
    : `<mj-section css-class="locked-shell" data-locked-label="Pied" data-part-kind="footer"${fallbackInherited ? ' data-inherited="true"' : ''} padding="20px 20px 0 20px">
      <mj-column>
        <mj-text color="#999999" font-size="12px" padding-top="0">Ce lien est personnel et ne doit pas être partagé.</mj-text>
      </mj-column>
    </mj-section>`

  // Plan 1 du 2026-05-22 — `<mj-body>` consomme les attrs résolus depuis la
  // cascade shell_parts (`resolvedShell.mjBody`). Le legacy flow (resolvedShell
  // undefined : 2-args parity path) retombe sur le repli hardcodé
  // `HARDCODED_MJ_BODY_ATTRS_CANVAS` (MJ_BODY_BACKGROUND_COLOR). Le fond n'est plus un token de
  // marque (retrait `background_color`, migration 022) — parité avec le serveur.
  const mjBodyAttrsBlob = resolvedShell
    ? `background-color="${escapeAttribute(resolvedShell.mjBody.backgroundColor)}" padding-top="${escapeAttribute(resolvedShell.mjBody.paddingTop)}" padding-bottom="${escapeAttribute(resolvedShell.mjBody.paddingBottom)}"`
    : `background-color="${HARDCODED_MJ_BODY_ATTRS_CANVAS.backgroundColor}"`

  // Plan carte-éditable (2026-06-08) — la « carte » (content-wrapper) enveloppe
  // le corps SEUL, UNIQUEMENT quand la cascade content-wrapper est non-null.
  // Blob d'attrs extrait de la forme stockage `<mj-section attrs/>` de la
  // cascade, ré-émis sur un <mj-wrapper> (miroir de buildShell serveur). Classe
  // DISTINCTE (locked-card, PAS locked-shell) → ne casse pas le comptage
  // 3-sections du lock controller. L'ABSENCE de cascade (legacy / 2-args
  // parity) → corps nu, INDISPENSABLE pour la parité byte-identique 2-args.
  const resolvedCard = resolvedShell?.contentWrapper
  const cardAttrsBlob = resolvedCard
    ? extractCardAttrsBlob(resolvedCard.contentMjml) || 'background-color="#ffffff"'
    : null

  // Les marqueurs BODY:START/END restent À L'INTÉRIEUR de la carte (ou nus),
  // autour de styledBody — extractBodyFragment les utilise comme bornes.
  const marked = `<!-- BODY:START -->
${styledBody}
    <!-- BODY:END -->`
  const bodyBlock = cardAttrsBlob
    ? `<mj-wrapper ${cardAttrsBlob} css-class="locked-card" data-part-kind="content-wrapper">
    ${marked}
    </mj-wrapper>`
    : marked

  return `<mjml>
  <mj-body ${mjBodyAttrsBlob}>
    ${headerSection}
    ${bodyBlock}
    ${footerSection}
  </mj-body>
</mjml>`
}

function applyBrandButtonAttrs(bodyFragment: string, brand: BrandShellTokens): string {
  const injected = ` background-color="${escapeAttribute(brand.primaryColor)}" color="#ffffff" border-radius="${brand.buttonBorderRadius}px"`
  return bodyFragment.replace(MJ_BUTTON_OPEN_TAG_RE, (_match, attrsBlob: string) => {
    return `<mj-button${stripBrandAttrs(attrsBlob)}${injected}>`
  })
}

function stripBrandButtonAttrs(bodyFragment: string): string {
  return bodyFragment.replace(MJ_BUTTON_OPEN_TAG_RE, (_match, attrsBlob: string) => {
    return `<mj-button${stripBrandAttrs(attrsBlob)}>`
  })
}

function stripBrandAttrs(attrsBlob: string): string {
  return attrsBlob.replace(BRAND_BUTTON_ATTR_RE, '')
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Plan `2026-05-17-shell-parts-persistance-save` — vérifie que les marqueurs
 * structurels `<mj-body … >`, `<!-- BODY:START -->`, `<!-- BODY:END -->`,
 * `</mj-body>` ET la carte `<mj-wrapper>` sont présents, UNIQUES et dans le
 * bon ordre. Si KO, l'orchestrateur de save abort avec un toast dédié plutôt
 * que de laisser fuiter un payload corrompu ou un dirty tracker incohérent.
 * Plus strict qu'`isBodyMarkerIntact` (qui ne vérifie que la présence des deux
 * commentaires BODY).
 */
export function isShellMarkersIntact(fullMjml: string): boolean {
  // Review R-P7 — refuser tout MJML qui contient plusieurs occurrences d'un
  // marqueur structurel. `extractShellSections` capterait sinon le premier
  // match et produirait des fragments header/footer incohérents.
  if ((fullMjml.match(MJ_BODY_OPEN_RE_G) || []).length !== 1) return false
  if ((fullMjml.match(CARD_WRAPPER_OPEN_RE_G) || []).length !== 1) return false
  if ((fullMjml.match(BODY_START_RE_G) || []).length !== 1) return false
  if ((fullMjml.match(BODY_END_RE_G) || []).length !== 1) return false
  if ((fullMjml.match(CARD_WRAPPER_CLOSE_RE_G) || []).length !== 1) return false
  if ((fullMjml.match(MJ_BODY_CLOSE_RE_G) || []).length !== 1) return false

  const openMatch = MJ_BODY_OPEN_RE.exec(fullMjml)
  if (!openMatch) return false
  const cardOpenMatch = CARD_WRAPPER_OPEN_RE.exec(fullMjml)
  if (!cardOpenMatch) return false
  const startMatch = BODY_START_RE.exec(fullMjml)
  if (!startMatch) return false
  const endMatch = BODY_END_RE.exec(fullMjml)
  if (!endMatch) return false
  const cardCloseMatch = CARD_WRAPPER_CLOSE_RE.exec(fullMjml)
  if (!cardCloseMatch) return false
  const closeMatch = MJ_BODY_CLOSE_RE.exec(fullMjml)
  if (!closeMatch) return false

  // Plan carte-éditable — ordre attendu : <mj-body> < <mj-wrapper> < BODY:START
  // < BODY:END < </mj-wrapper> < </mj-body>. La carte (mj-wrapper) enveloppe le
  // corps ; les marqueurs BODY sont strictement à l'intérieur de la carte.
  const openEnd = openMatch.index + openMatch[0].length
  const cardOpenPos = cardOpenMatch.index
  const startPos = startMatch.index
  const endPos = endMatch.index
  const cardClosePos = cardCloseMatch.index
  const closePos = closeMatch.index

  return (
    openEnd <= cardOpenPos &&
    cardOpenPos + cardOpenMatch[0].length <= startPos &&
    startPos < endPos &&
    endPos + endMatch[0].length <= cardClosePos &&
    cardClosePos + cardCloseMatch[0].length <= closePos
  )
}

/**
 * Plan `2026-05-17-shell-parts-persistance-save` — extrait les fragments
 * header (entre `<mj-body … >` et l'open-tag `<mj-wrapper>` de la carte) et
 * footer (entre `</mj-wrapper>` et `</mj-body>`) du MJML complet du canvas.
 * Précondition : `isShellMarkersIntact(fullMjml) === true`. Les fragments sont
 * normalisés via `normalizeShellFragment` (strip css-class/data-locked-label/
 * data-part-kind/data-inherited, trim, collapse whitespace inter-balises) — la
 * comparaison vs résolu serveur devient symétrique. Body non retourné (déjà
 * couvert par `extractBodyFragment`).
 */
export function extractShellSections(fullMjml: string): {
  header: string
  footer: string
} {
  if (!isShellMarkersIntact(fullMjml)) {
    throw new Error('Shell markers corrupted')
  }
  const openMatch = MJ_BODY_OPEN_RE.exec(fullMjml)!
  const cardOpenMatch = CARD_WRAPPER_OPEN_RE.exec(fullMjml)!
  const cardCloseMatch = CARD_WRAPPER_CLOSE_RE.exec(fullMjml)!
  const closeMatch = MJ_BODY_CLOSE_RE.exec(fullMjml)!

  // Plan carte-éditable — header borné par l'open-tag du <mj-wrapper> de la
  // carte (exclu) ; footer borné par sa balise fermante.
  const header = fullMjml.substring(openMatch.index + openMatch[0].length, cardOpenMatch.index)
  const footer = fullMjml.substring(
    cardCloseMatch.index + cardCloseMatch[0].length,
    closeMatch.index,
  )

  return {
    header: normalizeShellFragment(header),
    footer: normalizeShellFragment(footer),
  }
}

/**
 * Plan carte-éditable (2026-06-08) — extrait les attrs du <mj-wrapper> de la
 * carte du canvas et les sérialise en forme de STOCKAGE
 * `<mj-section attrs></mj-section>` (ce que le PUT
 * /shell-parts/.../content-wrapper attend, cf. validateContentWrapperContent
 * serveur). Ne retient que la whitelist (bg, border-radius, border-*, padding*)
 * — strippe css-class et data-part-kind. Miroir de serializeMjBodyContent.
 * Lève si la carte est absente.
 */
export function extractContentWrapperFromCanvas(fullMjml: string): string {
  const m = CARD_WRAPPER_OPEN_RE.exec(fullMjml)
  if (!m) throw new Error('content-wrapper <mj-wrapper> introuvable dans le canvas')
  const kept: string[] = []
  for (const [, key, value] of m[1].matchAll(ATTR_MATCH_ALL_RE)) {
    if (CARD_ATTR_WHITELIST.has(key)) kept.push(`${key}="${escapeAttribute(value)}"`)
  }
  return kept.length ? `<mj-section ${kept.join(' ')}></mj-section>` : '<mj-section></mj-section>'
}

/**
 * Plan `2026-05-17-shell-parts-persistance-save` — strip les marqueurs éditeur
 * (`css-class="locked-shell"`, `data-locked-label`, `data-part-kind`,
 * `data-inherited`) absents du résolu serveur, trim, collapse whitespace
 * inter-balises. Idempotente : `normalize(normalize(x)) === normalize(x)`.
 * Utilisée à la fois pour hydrater les ancres locales depuis le canvas et pour
 * comparer le canvas vs les ancres / vs le résolu cascade.
 *
 * GREFFE Lot 2 — l'appel à `stripBrandFontFamily` du 5eebca2e^ est RETIRÉ : le
 * `wrapBodyForEditing` actuel n'injecte plus font-family par section
 * (l'injection se fait via `<mj-attributes><mj-all>` dans le head, pas
 * per-composant). Le strip `data-inherited` est AJOUTÉ pour réconcilier avec
 * le `addInheritedAttr` du wrap actuel : sans lui, le dirty tracker flaguerait
 * le toggle inherited comme une diff structurelle (canvas injecte
 * data-inherited, résolu serveur non).
 */
export function normalizeShellFragment(fragment: string): string {
  const stripped = fragment
    .replace(MJ_SECTION_OPEN_TAG_RE_G, (_match, attrsBlob: string) => {
      let next = attrsBlob.replace(DATA_LOCKED_LABEL_ATTR_RE, '')
      next = next.replace(DATA_PART_KIND_ATTR_RE, '')
      next = next.replace(DATA_INHERITED_ATTR_RE, '')
      const cssClassMatch = CSS_CLASS_ATTR_RE.exec(next)
      if (cssClassMatch) {
        const classes = cssClassMatch[1]
          .split(/\s+/)
          .filter((c) => c !== '' && c !== 'locked-shell')
        if (classes.length === 0) {
          next = next.replace(CSS_CLASS_ATTR_RE, '')
        } else {
          next = next.replace(CSS_CLASS_ATTR_RE, ` css-class="${classes.join(' ')}"`)
        }
      }
      return `<mj-section${next}>`
    })
    .trim()
  // Collapse whitespace entre balises (`>   <` → `><`) pour rendre la
  // comparaison robuste aux différences d'indentation entre canvas et serveur.
  return stripped.replace(/>\s+</g, '><')
}

/**
 * Plan `2026-05-17-shell-parts-persistance-save` — dirty tracker asymétrique.
 * Compare les sections du canvas vs des **ancres locales** (pas le résolu
 * serveur). Pour chaque section : `normalizeShellFragment(canvasSection) !==
 * anchors.initial<Part>Mjml` → dirty=true.
 *
 * Asymétrie body/shell-parts assumée : body et shell-parts ont des flux de
 * persistance distincts (colonnes legacy `email_templates.body_mjml` /
 * `events.invitation_mjml` vs table `shell_parts` cascade). Les ancres locales
 * sont avancées per-leg success par l'orchestrateur après chaque save, ce qui
 * rend `isDirty=false` cohérent post-save.
 *
 * Précondition : `isShellMarkersIntact(fullMjml) === true`. L'orchestrateur
 * abort proprement en amont avec un toast dédié si les marqueurs sont KO.
 */
export function isShellDirty(
  fullMjml: string,
  anchors: {
    initialBodyMjml: string
    initialHeaderMjml: string
    initialFooterMjml: string
    /** Plan 1 du 2026-05-22 — ancre des attrs `<mj-body>`. Optionnel pour
     * préserver les call-sites legacy qui n'ont pas encore migré ; quand
     * absent, `mjBody` reste à `false`. */
    initialMjBodyAttrs?: ResolvedMjBodyAttrsForCanvas
  },
): { header: boolean; body: boolean; footer: boolean; mjBody: boolean } {
  const { header: canvasHeader, footer: canvasFooter } = extractShellSections(fullMjml)
  const canvasBody = extractBodyFragment(fullMjml)
  const mjBodyDirty = anchors.initialMjBodyAttrs
    ? !mjBodyAttrsEqual(extractMjBodyAttrs(fullMjml), anchors.initialMjBodyAttrs)
    : false
  return {
    header: canvasHeader !== anchors.initialHeaderMjml,
    body: canvasBody.trim() !== anchors.initialBodyMjml.trim(),
    footer: canvasFooter !== anchors.initialFooterMjml,
    mjBody: mjBodyDirty,
  }
}
