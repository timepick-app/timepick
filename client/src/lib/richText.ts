/**
 * Helpers partagés pour la description riche d'événement (sortie HTML de Tiptap).
 *
 * Contrat unique consommé par :
 *  - `RichTextEditor`        (normalise la valeur initiale, détecte le vide)
 *  - `RichTextContent`       (rendu sanitisé côté membre)
 *  - `EventCard`             (aperçu texte tronqué via `htmlToPlainText`)
 *
 * Politique de sécurité : allowlist minimaliste `p/br/strong/em/a`, liens http(s)
 * uniquement, `rel="noopener noreferrer"` forcé sur tout lien `target="_blank"`.
 * Le rendu ne fait JAMAIS confiance au HTML stocké : `sanitizeRichHtml` est
 * rejoué à chaque affichage (défense en profondeur, le serveur sanitise aussi).
 */
import DOMPurify from 'dompurify'

/** Balises autorisées dans une description riche (édition + rendu). */
const RICH_TEXT_ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'a'] as const
/** Attributs autorisés (uniquement sur les liens). */
const RICH_TEXT_ALLOWED_ATTR = ['href', 'target', 'rel'] as const
/** Schémas d'URL autorisés pour les liens : http(s) seulement. */
const RICH_TEXT_URI_REGEXP = /^https?:\/\//i

let hookRegistered = false
function ensureLinkHardeningHook(): void {
  if (hookRegistered) return
  // Sur tout lien ouvrant un nouvel onglet, forcer rel anti-tabnabbing même si
  // l'éditeur (ou un HTML legacy) ne l'a pas posé.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  hookRegistered = true
}

/** Sanitise du HTML riche selon l'allowlist minimaliste. Sûr pour `dangerouslySetInnerHTML`. */
export function sanitizeRichHtml(html: string): string {
  ensureLinkHardeningHook()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTR],
    ALLOWED_URI_REGEXP: RICH_TEXT_URI_REGEXP,
    // `ALLOWED_URI_REGEXP` est appliqué à TOUTE valeur d'attribut sauf celles
    // listées URI-safe. Sans cela, `target="_blank"` / `rel="..."` (non-URL)
    // seraient rejetés par la regex http(s) et supprimés. href reste soumis au
    // contrôle d'URL.
    ADD_URI_SAFE_ATTR: ['target', 'rel'],
  })
}

/**
 * Détecte si une valeur stockée est déjà du HTML riche (vs. texte brut legacy).
 * Volontairement restreint aux balises de notre allowlist pour éviter les
 * faux positifs sur du texte du type « 5 < 10 ».
 */
export function isLikelyHtml(value: string): boolean {
  return /<(?:p|br|strong|em|b|i|u|a)(?:\s[^>]*)?\/?>/i.test(value)
}

/**
 * Convertit du texte brut (legacy) en HTML sûr, modèle « un retour = un <br> » :
 * échappe, chaque saut de ligne => `<br>`, le tout dans un seul `<p>`.
 */
export function plainTextToSafeHtml(text: string): string {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`
}

/**
 * Aplatit une structure multi-paragraphes en un seul paragraphe à base de `<br>` :
 * chaque frontière de paragraphe devient un `<br>`, puis les `<br>` sont plafonnés
 * à 2. Rend le contenu (legacy ou collé) conforme au modèle « retour = <br> ».
 */
export function flattenToLineBreaks(html: string): string {
  if (!html) return ''
  const inner = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/^\s*<p[^>]*>/i, '')
    .replace(/<\/p>\s*$/i, '')
    .trim()
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>')
  return inner ? `<p>${inner}</p>` : ''
}

/**
 * Normalise une description stockée en HTML sûr (modèle « retour = <br> ») :
 *  - déjà du HTML  => sanitisé puis aplati en un paragraphe à `<br>`
 *  - texte brut    => converti (`\n` => `<br>`)
 * Retourne `''` pour une valeur vide/absente.
 */
export function normalizeStoredDescription(value: string | null | undefined): string {
  if (!value) return ''
  const html = isLikelyHtml(value) ? sanitizeRichHtml(value) : plainTextToSafeHtml(value)
  return flattenToLineBreaks(html)
}

/**
 * Extrait le texte visible d'un HTML riche (sans DOM) — pour l'aperçu tronqué
 * des cartes et le décompte de caractères. Les frontières de blocs deviennent
 * des espaces afin que « <p>A</p><p>B</p> » donne « A B ».
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Vrai si la description ne contient aucun texte visible (ex. `<p></p>` de Tiptap).
 * Volontairement léger (strip de balises sans DOMPurify) : appelé à chaque frappe.
 */
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length === 0
}
