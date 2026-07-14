import DOMPurify from 'isomorphic-dompurify'

/**
 * Liste blanche des balises autorisées dans les descriptions d'événement.
 * Correspond exactement à la liste côté client (richText.ts) pour cohérence
 * défense-en-profondeur : le client nettoie avant envoi, le serveur revalide à l'écriture.
 */
const DESCRIPTION_ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'a'] as const

/** Attributs autorisés sur les balises whitelistées (href/target/rel pour les liens). */
const DESCRIPTION_ALLOWED_ATTR = ['href', 'target', 'rel'] as const

/**
 * Sanitise une description riche côté écriture (défense en profondeur).
 * Supprime tout contenu malveillant (<script>, handlers onclick, liens javascript:…)
 * tout en conservant le formatage minimal autorisé (gras, italique, liens http(s)).
 * Applique le modèle « retour = <br> » : aplatit les paragraphes en un seul <p>
 * à base de <br>, plafonné à 2 <br> consécutifs — cohérent avec l'éditeur, le
 * rendu membre et l'email.
 */
export function sanitizeRichText(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...DESCRIPTION_ALLOWED_TAGS],
    ALLOWED_ATTR: [...DESCRIPTION_ALLOWED_ATTR],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    // ALLOWED_URI_REGEXP s'applique à toute valeur d'attribut non URI-safe :
    // sans ceci, target="_blank" / rel="..." seraient supprimés. href reste filtré.
    ADD_URI_SAFE_ATTR: ['target', 'rel'],
  })
  const hadParagraph = /<p[^>]*>/i.test(clean)
  const inner = clean
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/^\s*<p[^>]*>/i, '')
    .replace(/<\/p>\s*$/i, '')
    .trim()
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>')
  if (!inner) return inner
  return hadParagraph ? `<p>${inner}</p>` : inner
}
