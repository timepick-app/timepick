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

/** Plafond du modèle : jamais plus de 2 `<br>` d'affilée (= une ligne vide). */
const EXCESS_LINE_BREAKS_RE = /(?:<br\s*\/?>\s*){3,}/gi

/**
 * Aplatit une structure multi-paragraphes en un seul paragraphe à base de `<br>` :
 * chaque frontière de paragraphe devient une LIGNE VIDE (`<br><br>`), puis les
 * `<br>` sont plafonnés à 2. Rend le contenu (legacy ou collé) conforme au
 * modèle « retour = <br> » SANS perdre la séparation voulue par l'auteur : un
 * `<br>` unique collerait les deux blocs, ce qu'il n'a jamais demandé.
 */
export function flattenToLineBreaks(html: string): string {
  if (!html) return ''
  const inner = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br><br>')
    .replace(/^\s*<p[^>]*>/i, '')
    .replace(/<\/p>\s*$/i, '')
    .trim()
    .replace(EXCESS_LINE_BREAKS_RE, '<br><br>')
  return inner ? `<p>${inner}</p>` : ''
}

/**
 * Convertit du TEXTE BRUT collé en HTML conforme au modèle « retour = <br> ».
 *
 * Indispensable parce qu'un presse-papiers sans variante HTML n'atteint jamais
 * `transformPastedHTML` : ProseMirror découpe le texte lui-même et fabrique de
 * vrais `<p>`, hors modèle, et la ligne vide est perdue au découpage (son split
 * collapse les `\n` consécutifs). Cf. `clipboardTextParser` dans
 * `RichTextEditor`, seul point qui voit le texte AVANT ce découpage.
 *
 * Deux écarts assumés avec `normalizeStoredDescription` :
 *  - les ESPACES de bord sont préservés — un collage au milieu d'une phrase ne
 *    doit pas perdre son espace ;
 *  - les RETOURS de bord sont retirés — copier un paragraphe embarque presque
 *    toujours son `\n` final, qui sinon ouvre une ligne vide parasite ; le
 *    rognage est symétrique aux deux bords, comme sur le chemin HTML.
 */
export function pastedTextToLineBreakHtml(text: string): string {
  const normalized = text
    // Tout ce qu'Unicode considère comme fin de ligne est ramené à LF, seule
    // forme que `plainTextToSafeHtml` convertit en `<br>` : CRLF, CR seul
    // (ancien Mac), NEL (U+0085), séparateurs de ligne et de paragraphe
    // (U+2028/U+2029, qu'on récolte en copiant depuis un PDF ou Word). Sans
    // ça le caractère survit littéralement : le navigateur l'affiche comme un
    // saut, mais `htmlToPlainText` le compte comme une espace — l'invariant
    // « le seul séparateur est `<br>` » est rompu.
    .replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n')
    .replace(/^\s*\n/, '')
    .replace(/\s*\n\s*$/, '')
  return plainTextToSafeHtml(normalized).replace(EXCESS_LINE_BREAKS_RE, '<br><br>')
}

/**
 * Balises INLINE : les seules qui n'ouvrent pas de frontière de bloc. Liste
 * volontairement INVERSÉE — tout le reste (`div`, `h1`, `li`, `td`, `details`,
 * `figure`, un composant maison inconnu…) vaut une ligne vide. Une liste de
 * balises de BLOC serait toujours en retard d'une balise, et son échec COLLE
 * les mots ; ici l'échec d'une inline oubliée n'ajoute qu'une ligne vide de
 * trop : visible, corrigeable à la main, jamais destructeur. C'est ce sens de
 * défaillance qui motive l'inversion.
 *
 * Contenu phrasé du HTML vivant, plus les balises de présentation historiques
 * que Word et les vieilles pages produisent encore (`big`, `tt`, `strike`,
 * `acronym`) : oubliées, elles éclateraient une phrase en autant de lignes.
 */
const INLINE_TAGS = [
  'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'cite', 'code', 'data',
  'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark', 'output',
  'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong',
  'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr',
] as const
/**
 * Balises dont le contenu n'est PAS du texte d'auteur : jetées AVEC leur
 * contenu. Indispensable — le schéma ProseMirror en aval ne garde certes que
 * `paragraph/text/bold/italic/link/hardBreak`, mais il garde le TEXTE de tout
 * le reste : sans cette liste, le CSS d'un `<style>` de Word, le corps d'un
 * `<script>`, les libellés d'un `<select>` ou le message de repli d'un
 * `<video>` atterrissent en clair dans la description.
 * Volontairement courte : les balises vides ou à contenu hors light-DOM
 * (`meta`, `link`, `template`) n'ont pas besoin d'y figurer — elles ne
 * produisent qu'une frontière vide, absorbée par le rognage des bords.
 */
const NON_TEXT_TAGS = [
  'script', 'style', 'noscript', 'title',
  'select', 'option', 'textarea', 'button',
  'iframe', 'object', 'svg', 'canvas', 'audio', 'video',
] as const
/** Tout élément qui ouvre une frontière de bloc (donc : pas inline, pas `br`). */
const BLOCK_SELECTOR = `*:not(br,${INLINE_TAGS.join(',')})`
/** Lignes vides de bord : celles du conteneur lui-même, jamais voulues. */
const EDGE_LINE_BREAKS_RE = /^(?:\s*<br\s*\/?>\s*)+|(?:\s*<br\s*\/?>\s*)+$/gi

/**
 * Convertit du HTML collé en HTML conforme au modèle « retour = <br> ».
 *
 * Distinct de `flattenToLineBreaks` — qui ne connaît que `<p>` — parce qu'un
 * presse-papiers ne contient presque jamais des `<p>` : un site web, Notion ou
 * Slack donnent des `<div>`, une doc des `<h1>`. Ces balises-là survivaient à
 * l'aplatissement, se faisaient emballer dans le `<p>` de sortie, et le parseur
 * HTML les ressortait : un paragraphe vide parasite en tête, puis les blocs
 * collés les uns aux autres.
 *
 * Le travail se fait sur un DOM inerte, JAMAIS à la regex : un `<div
 * title="a>b">` fait mentir tout motif en `[^>]*>` (il s'arrête au `>` de
 * l'attribut) et laissait fuir `b">` en texte visible. Le document est créé par
 * `createHTMLDocument` — sans contexte de navigation, donc aucun script exécuté
 * ni aucune ressource chargée pendant l'analyse (même socle que DOMPurify).
 *
 * Le contenu STOCKÉ garde son propre chemin (`normalizeStoredDescription`) :
 * déjà sanitisé à l'allowlist, il n'a jamais de `<div>` à aplatir.
 */
export function pastedHtmlToLineBreakHtml(html: string): string {
  if (!html) return ''
  const doc = document.implementation.createHTMLDocument('')
  doc.body.innerHTML = html
  const dropped: ChildNode[] = [...doc.body.querySelectorAll(NON_TEXT_TAGS.join(','))]
  // Commentaires : Chromium et Firefox emballent TOUJOURS le `text/html` du
  // presse-papiers dans `<!--StartFragment-->…<!--EndFragment-->`. Ce ne sont
  // pas des éléments, donc `querySelectorAll` ne les voit pas — laissés en
  // place ils s'intercalent entre les `<br>`, et le plafond comme le rognage
  // (ancrés `^`/`$`) échouent : TOUT collage HTML depuis un navigateur gagnait
  // une ligne vide en tête et en queue, et un commentaire entre deux blocs
  // laissait passer 4 sauts consécutifs.
  const comments = doc.createNodeIterator(doc.body, NodeFilter.SHOW_COMMENT)
  for (let node = comments.nextNode(); node !== null; node = comments.nextNode()) {
    dropped.push(node as ChildNode)
  }
  dropped.forEach((node) => node.remove())
  // Ordre inverse = du plus profond au plus haut : quand un bloc parent est
  // dépiauté, ses enfants blocs le sont déjà, et leurs `<br>` remontent avec.
  const blocks = [...doc.body.querySelectorAll(BLOCK_SELECTOR)].reverse()
  for (const block of blocks) {
    // Une frontière de chaque côté : le plafond et le rognage des bords
    // ramènent ensuite les doublons à une seule ligne vide.
    block.replaceWith(
      doc.createElement('br'),
      doc.createElement('br'),
      ...block.childNodes,
      doc.createElement('br'),
      doc.createElement('br')
    )
  }
  // Inlines qui ne portent RIEN (`<span></span>`, `<wbr>`, `<a href></a>`) :
  // même piège que les commentaires — intercalés entre deux séries de `<br>`,
  // ils empêchent le plafond de les fusionner et laissent passer 4 sauts. On ne
  // retire que le vraiment inerte : un élément contenant un `<br>` porte le
  // saut voulu par l'auteur. Ordre inverse pour que vider l'intérieur rende le
  // parent inerte à son tour.
  for (const el of [...doc.body.querySelectorAll('*')].reverse()) {
    if (el.tagName !== 'BR' && !el.querySelector('br') && !el.textContent?.trim()) {
      el.remove()
    }
  }
  const inner = doc.body.innerHTML
    .replace(EXCESS_LINE_BREAKS_RE, '<br><br>')
    .replace(EDGE_LINE_BREAKS_RE, '')
    .trim()
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

/**
 * Deux écritures désignent-elles le même contenu affiché ?
 *
 * À utiliser partout où une description sert de **référence de comparaison** :
 * « rien n'a changé, ne rien écrire » (étape organisation du wizard) et « le
 * serveur confirme déjà ce que le formulaire affiche » (garde de resync des
 * panneaux admin). Comparer les chaînes brutes à la place laisse deux façons de
 * dire la même chose se contredire, et gèle la garde de resync sur l'instantané
 * courant. Reste STRICT sur tout changement visible.
 *
 * La forme canonique est calculée en trois étapes, chacune indispensable :
 *  1. `isRichTextEmpty` d'abord — `normalizeStoredDescription('<p><br></p>')`
 *     rend `'<p><br></p>'`, pas `''`, alors qu'une Entrée dans un éditeur
 *     vierge produit exactement ça ;
 *  2. `normalizeStoredDescription` — la normalisation qui ALIMENTE déjà
 *     l'éditeur, donc texte brut legacy et HTML de Tiptap convergent ;
 *  3. `sanitizeRichHtml` en sortie — reparse et ré-sérialise, ce qui unifie
 *     l'orthographe des entités : `plainTextToSafeHtml` échappe l'apostrophe en
 *     `&#39;` là où Tiptap la laisse brute. Sans cette passe, toute description
 *     française contenant une apostrophe reste « différente » d'elle-même.
 *
 * Comparaison seulement : ce qui est ÉCRIT reste ce que l'éditeur a produit.
 *
 * @example
 * isSameRichText('<p></p>', '')                                  // true
 * isSameRichText("L'asso", "<p>L'asso</p>")                      // true
 * isSameRichText('<p>A</p>', '<p><strong>A</strong></p>')        // false
 */
export function isSameRichText(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  // Chemin rapide : deux chaînes identiques désignent trivialement le même
  // contenu. Il compte parce que ce prédicat est appelé PENDANT le rendu du
  // panneau admin (garde de resync hors-effet) : sans lui, chaque frappe dans le
  // champ nom ferait tourner DOMPurify sur une description inchangée tant qu'un
  // refetch divergent n'est pas adopté.
  if (a === b) return true
  return (
    (isRichTextEmpty(a) ? '' : sanitizeRichHtml(normalizeStoredDescription(a))) ===
    (isRichTextEmpty(b) ? '' : sanitizeRichHtml(normalizeStoredDescription(b)))
  )
}
