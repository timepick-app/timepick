/**
 * L3a — composition canvas + extraction des emails système (mode contraint).
 *
 * Le DTO système client n'expose PAS `bodyMjml` (union discriminée
 * `SystemTemplateView`, seulement `introText`/`signatureText`). Le client
 * compose donc lui-même un corps canvas miroir de `SYSTEM_TEMPLATE_SKELETONS`
 * (`server/src/services/email-templates.service.ts`) : 2 `<mj-text>` taggés
 * (accroche + signature) éditables, un CTA `<mj-button>` d'affichage figé.
 * **Le corps MJML système ne quitte jamais le client** — au save, seules les
 * 2 zones sont ré-extraites en texte brut → `PATCH { introText, signatureText }`.
 *
 * Symétrie serveur : `composeSystemTemplate` applique `encodeHtmlEntities` aux
 * 2 zones. On insère donc l'intro/sig **non encodés** (texte brut) au canvas,
 * et on ré-extrait en **texte brut** (balises strippées + entités décodées),
 * pour que le round-trip soit neutre.
 */

import type { SystemTemplateKey } from '@/lib/email-system-template-constants'
import { SYSTEM_EDITABLE_ZONE_CLASSES } from './shellStructureLock'

// Source unique de vérité (Phase 1) — pas de duplication des littéraux.
export const SYSTEM_EDIT_INTRO_CLASS = SYSTEM_EDITABLE_ZONE_CLASSES[0]
export const SYSTEM_EDIT_SIG_CLASS = SYSTEM_EDITABLE_ZONE_CLASSES[1]

/**
 * Bloc figé au milieu du canvas par clé — miroir de `SYSTEM_TEMPLATE_SKELETONS`.
 * Pour les 4 templates avec CTA : bouton MJML figé (jamais sérialisé vers le serveur).
 * Pour cancellation_confirmation : bloc détails (Événement/Date/Horaires/motif/lien)
 * qui reste verrouillé en lecture, l'admin ne peut éditer que l'accroche et la signature.
 */
const SYSTEM_FIXED_MIDDLE: Record<SystemTemplateKey, string> = {
  magic_link_login: `<mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>`,
  reservation_confirmation: `<mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>`,
  account_created: `<mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>`,
  cancellation_confirmation: `<mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Choisir un nouveau créneau</mj-button>`,
  role_promoted: `<mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>`,
  role_demoted: `<mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>`,
  unregistration_confirmation: `<mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Voir les créneaux disponibles</mj-button>`,
}

/**
 * Compose le fragment body canvas (un `<mj-section>`) miroir du squelette
 * serveur, en injectant `introText`/`signatureText` transformés. Les 2
 * `<mj-text>` portent leur `css-class` de zone (`tp-edit-intro`/`tp-edit-sig`)
 * pour être ré-ouverts par `reEnableEditableZones` et ciblés à l'extraction.
 *
 * **Canonisation** : les sauts de ligne (`\n`) sont convertis en `<br/>` après
 * l'escape des métacaractères HTML (`& < >`). La salutation
 * `Bonjour {{user_first_name}},` est la **1ʳᵉ ligne éditable** de la zone intro
 * (stockée dans `introText`) — plus de bloc figé séparé. `htmlToPlainText`
 * (extract) est l'inverse exact : `<br/>` → `\n`, décode entités.
 *
 * `wrapBodyForEditing` injectera ensuite `css-class="locked-shell"` sur le
 * `<mj-section>` (préfixé, donc la section reste figée) — les 2 zones gardent
 * leur classe propre.
 */
export function composeSystemCanvasBody(
  templateKey: SystemTemplateKey,
  introText: string,
  signatureText: string,
): string {
  // Escape `& < >` AVANT injection, PUIS `\n` → `<br/>` :
  // • l'escape garantit qu'un texte admin contenant `<nom>` n'est pas parsé
  //   comme balise par GrapesJS puis strippé à l'extraction (perte silencieuse).
  // • la conversion `\n` → `<br/>` APRÈS l'escape évite d'encoder accidentellement
  //   un `<br/>` littéral admin en `&lt;br/&gt;` (l'admin ne saisit pas de HTML).
  // L'inverse exact : `htmlToPlainText` convertit `<br/>` → `\n` AVANT de décoder.
  const safeIntro = introText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  const safeSig = signatureText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text css-class="${SYSTEM_EDIT_INTRO_CLASS}" padding-bottom="8px">${safeIntro}</mj-text>
    <!-- INTRO:END -->
    ${SYSTEM_FIXED_MIDDLE[templateKey]}
    <!-- SIG:START -->
    <mj-text css-class="${SYSTEM_EDIT_SIG_CLASS}" color="#999999" font-size="13px" align="center" padding-top="0">${safeSig}</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`
}

const HTML_TAG_RE = /<[^>]+>/g
// Frontières de bloc/saut : converties en saut de ligne (`\n`) AVANT le strip
// des balises restantes. Sans cette conversion, le retrait nu de `<br>`/`<div>`/
// `<p>` collerait les mots (« lien<br>de » → « liende »). Chaque frontière
// produit au moins un `\n` ; `htmlToPlainText` collapse ensuite `\n{3,}` → `\n\n`.
const BLOCK_BOUNDARY_RE = /<\s*br\s*\/?>|<\/?\s*(?:div|p)\b[^>]*>/gi
// Symétrique avec `decodeHtmlEntities` côté serveur (5 entités encodées par
// `encodeHtmlEntities`) + `&nbsp;` que le contentEditable produit pour les
// espaces multiples (sans ça, l'espace insécable serait persisté comme texte
// littéral « &nbsp; » après ré-encodage serveur du `&`).
const ENTITY_DECODE_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}
const ENTITY_DECODE_RE = /&(?:amp|lt|gt|quot|#39|#x27|apos|nbsp);/g

/**
 * Réduit un fragment HTML (issu de `getInnerHTML()`) en texte brut.
 * Pipeline dans l'ordre obligatoire :
 * 1. `<br>`/frontières `<div>`/`<p>` → `\n` (saut significatif, pas espace).
 * 2. Strip de toutes les balises restantes (`<b style=…>` etc.).
 * 3. Décodage des entités HTML (`&amp;` → `&`, …).
 * 4. `[ \t]{2,}` → `' '` (collapse horizontal).
 * 5. `\n{3,}` → `\n\n` (max une ligne vide).
 * 6. trim global.
 * L'ordre conversion-balises AVANT décode est obligatoire : un `&lt;br&gt;`
 * littéral (saisi par l'admin) ne doit pas devenir un saut après décodage.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(BLOCK_BOUNDARY_RE, '\n')
    .replace(HTML_TAG_RE, '')
    .replace(ENTITY_DECODE_RE, (m) => ENTITY_DECODE_MAP[m] ?? m)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface ZoneComponentLike {
  getInnerHTML?: () => string
}

export interface SystemZoneWrapperLike {
  find: (selector: string) => Array<ZoneComponentLike | undefined>
}

function readZone(wrapper: SystemZoneWrapperLike, cls: string): string {
  const node = wrapper.find(`[css-class~="${cls}"]`)?.[0]
  const html = node?.getInnerHTML?.()
  if (html == null) {
    // Fail-loud : zone introuvable = canvas désynchronisé. Retourne '' ; le
    // garde « zone vide » du save (handleSave système) bloquera le PATCH avec un
    // toast (le gate des variables critiques ne couvre PAS une intro vide quand
    // la seule variable critique vit dans la signature). `console.error`
    // volontairement utilisé en prod ici pour le débogage côté client.
    console.error(`[systemCanvas] zone éditable introuvable au save : ${cls}`)
    return ''
  }
  return htmlToPlainText(html)
}

/**
 * Ré-extrait les 2 zones éditables par `css-class` (jamais par regex de
 * marqueur — RÉSERVE 3), en texte brut. Sortie directement consommable par
 * `PATCH { introText, signatureText }`. **Aucun `bodyMjml`.**
 */
export function extractSystemZones(wrapper: SystemZoneWrapperLike): {
  introText: string
  signatureText: string
} {
  return {
    introText: readZone(wrapper, SYSTEM_EDIT_INTRO_CLASS),
    signatureText: readZone(wrapper, SYSTEM_EDIT_SIG_CLASS),
  }
}
