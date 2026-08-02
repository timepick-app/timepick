/**
 * Email Body Content Guard — contrôle de contenu à l'ÉCRITURE des deux seules
 * surfaces MJML de corps librement éditables :
 *   • `email_templates.body_mjml` (modèle général « invitation »)
 *   • `events.invitation_mjml`    (surcharge par événement)
 *
 * Les deux flux sont jumeaux et doivent rester traités ensemble : un garde posé
 * sur un seul des deux ne ferme rien (le corps rejeté d'un côté s'écrit de
 * l'autre, et le modèle général est hérité par TOUS les événements sans
 * surcharge).
 *
 * ─── Pourquoi un contrôle à l'entrée alors qu'un sanitiseur existe en sortie ──
 *
 * Le sanitiseur de sortie (DOMPurify sur le HTML compilé) est un vrai parseur et
 * reste l'autorité sur les nœuds ÉLÉMENTS. Mais il est structurellement aveugle
 * aux nœuds COMMENTAIRES : un `<!--[if mso]> … <![endif]-->` est recopié verbatim
 * dans l'e-mail expédié, et Outlook pour Windows l'interprète comme du balisage.
 * Tout ce que la liste d'éléments interdits retire passe donc, pour ce client-là.
 *
 * Et il ne peut PAS cesser d'être aveugle : MJML produit lui-même ces
 * commentaires conditionnels — c'est sa mécanique de mise en page Outlook. Les
 * retirer en sortie casserait le rendu Outlook de tous les e-mails. La
 * distinction « commentaire du compilateur » / « commentaire de l'utilisateur »
 * n'existe qu'AVANT compilation : dans le fragment de corps, tout commentaire est
 * d'origine utilisateur (ou d'usine). D'où ce garde, et d'où le fait qu'il ne
 * s'applique qu'à l'entrée.
 *
 * ─── Pourquoi REFUSER et non nettoyer ────────────────────────────────────────
 *
 * Le stockage du corps n'est pas normalisé : ce qui est saisi est stocké
 * verbatim, et un corps existant doit se réenregistrer octet pour octet. Un
 * nettoyage silencieux modifierait le contenu écrit par un administrateur pour un
 * bénéfice théorique. Le refus, lui, ne peut pas altérer un corps : il l'accepte
 * ou le rejette avec un message qui nomme la construction à retirer.
 *
 * ─── Pourquoi un balayage à état, et non des expressions régulières ──────────
 *
 * Première version (2026-07-31) : deux passes de regex — commentaires sur la
 * chaîne entière, puis balises capturées par un motif unique. Mesurée, elle avait
 * huit écarts, dans les DEUX sens, tous dus à la même cause : une regex ne sait
 * pas dans quel contexte elle se trouve.
 *
 *   • Faux positif — `alt="<!-- promo"` : une séquence de commentaire dans une
 *     valeur d'attribut n'ouvre aucun commentaire pour un parseur, mais la passe
 *     « commentaires d'abord » y voyait un commentaire non refermé et refusait un
 *     corps légitime.
 *   • Faux négatifs — `src=x/onerror=…` (le `/` est un séparateur d'attribut au
 *     même titre qu'une espace), `href="&#106;avascript:…"` (entité décodée par le
 *     client), `href="java<TAB>script:…"` (le client retire les caractères de
 *     contrôle des URL), et toute balise NON refermée en fin de fragment — que le
 *     motif ignorait faute de `>`, alors que le balisage de la coque la referme à
 *     l'insertion.
 *   • Coût — 403 ms sur 48 Ko de `<a ` répétés, sur un chemin d'écriture
 *     synchrone.
 *
 * D'où ce balayage : UN passage, un état explicite (prose / commentaire / balise /
 * valeur d'attribut), les attributs réellement découpés en nom + valeur. Chaque
 * règle s'applique alors à l'endroit où elle a un sens — un nom d'attribut n'est
 * jamais confondu avec du texte affiché, et une valeur n'est jamais lue comme un
 * nom. Coût linéaire, aucun retour arrière.
 *
 * Deux conséquences volontaires, vérifiées contre la façon dont un client HTML
 * découpe réellement le balisage : `<img alt="x onerror="alert(1)">` est ACCEPTÉ
 * (le `onerror` est à l'intérieur de la valeur de `alt` — aucun gestionnaire n'est
 * posé), et `<img alt=a>b onerror="x">` aussi (la balise se termine au premier `>`
 * non quoté, le reste est du texte).
 *
 * ─── Ce que ce garde n'est pas ───────────────────────────────────────────────
 *
 * Ce n'est PAS une liste blanche de balises. La coque (en-tête, pied, `mj-body`,
 * content-wrapper) en a une, volontairement étroite ; l'appliquer au corps —
 * la zone la plus librement éditable de l'éditeur — rejetterait des corps déjà
 * stockés et valides. Ce garde est un ensemble FERMÉ de constructions refusées,
 * mesuré sur la totalité des corps d'usine et stockés : aucun n'est refusé.
 *
 * Ce n'est pas non plus un parseur de sécurité exhaustif : DOMPurify reste
 * l'autorité sur les éléments du HTML expédié. Ce garde ferme le canal que
 * DOMPurify ne peut pas voir (les commentaires) et refuse à la source les
 * vecteurs exécutables évidents — notamment pour que le canvas de l'éditeur, qui
 * recharge le corps stocké SANS passer par DOMPurify, ne les reçoive jamais.
 *
 * Les `data:` URI ne sont volontairement pas refusés ici : ils ne s'exécutent pas
 * chez un client mail et le pré-passage du sanitiseur de sortie les neutralise
 * déjà. Le garde reste sur ce qui exécute ou ce qui contourne.
 */

import { ERROR_CODES } from '@timepick/shared'
import { ValidationError } from '../errors/ValidationError'

/** Construction refusée, discriminant stable (le message en dérive). */
export type UnsafeBodyConstruct =
  | 'comment-markup'
  | 'comment-unterminated'
  | 'forbidden-tag'
  | 'handler-attribute'
  | 'script-uri'

// Miroir des balises interdites par le sanitiseur de sortie — refusées ici pour
// qu'elles n'atteignent pas le stockage, donc pas non plus le canvas de
// l'éditeur, qui recharge le corps stocké SANS passer par ce sanitiseur.
const FORBIDDEN_TAGS: Record<string, true> = {
  script: true,
  iframe: true,
  object: true,
  embed: true,
  form: true,
  input: true,
}

// Nom de balise dissimulé dans le nom d'une pseudo-déclaration (`<![CDATA[<iframe`) :
// un nom de balise légitime ne contient jamais de `<`.
const EMBEDDED_FORBIDDEN_TAG = /<\/?(?:script|iframe|object|embed|form|input)\b/i

// Nom d'attribut complet, jamais une sous-chaîne : le découpage nom/valeur est
// déjà fait quand ce motif s'applique.
const HANDLER_ATTR_NAME = /^on[a-z][a-z0-9-]*$/i

const SCRIPT_URI_SCHEME = /^(?:java|vb)script:/i
const NUMERIC_ENTITY_HEX = /&#x([0-9a-f]+);?/gi
const NUMERIC_ENTITY_DEC = /&#(\d+);?/g
// Espaces et caractères de contrôle : un client mail les retire d'une URL avant
// d'en lire le schéma, donc `java<TAB>script:` s'exécute.
const URI_NOISE = /[\s\u0000-\u001f\u007f]/g
// Un schéma exige un `:` — littéral ou encodé. Court-circuit du cas courant
// (couleurs, tailles, textes) avant toute normalisation.
const ENCODED_COLON = /&#(?:58|x3a);?/i

const CHAR_TAG_OPENER = /[a-zA-Z!/]/
const CHAR_NAME_END = /[\s/>]/
const CHAR_ATTR_SEPARATOR = /[\s/]/
const CHAR_ATTR_NAME_END = /[\s/>=]/
const CHAR_UNQUOTED_VALUE_END = /[\s>]/
const CHAR_SPACE = /\s/

const CONSTRUCT_LABEL: Record<UnsafeBodyConstruct, string> = {
  'comment-markup':
    'un commentaire HTML qui transporte du balisage (par exemple un commentaire conditionnel Outlook)',
  'comment-unterminated': 'un commentaire HTML qui n\u2019est jamais refermé',
  'forbidden-tag': 'une balise interdite (script, iframe, object, embed, form ou input)',
  'handler-attribute':
    'un attribut de gestionnaire d\u2019événement (onclick, onerror\u2026)',
  'script-uri': 'un lien javascript: ou vbscript:',
}

/**
 * Fin d'un commentaire ouvert en `from`, ou -1. `--!>` ferme un commentaire au
 * même titre que `-->` du point de vue d'un parseur HTML.
 */
function findCommentEnd(source: string, from: number): number {
  let cursor = from
  for (;;) {
    const dashes = source.indexOf('--', cursor)
    if (dashes === -1) return -1
    if (source.startsWith('-->', dashes) || source.startsWith('--!>', dashes)) return dashes
    cursor = dashes + 1
  }
}

/** Point de code hors plage Unicode : `String.fromCodePoint` lève, il faut le devancer. */
const MAX_CODE_POINT = 0x10ffff

/**
 * Entité numérique décodée, ou la séquence d'origine si elle ne désigne aucun
 * caractère (`&#1114112;`, `&#xFFFFFF;`).
 *
 * Rendre le décodage TOTAL est une exigence de correction, pas une précaution :
 * une `RangeError` remonterait jusqu'au contrôleur, qui ne saurait pas la
 * classer et répondrait 500 sur un corps parfaitement légitime — un refus
 * d'enregistrement là où il n'y a aucun vecteur. Laisser la séquence telle
 * quelle n'ouvre rien : un préfixe non décodé empêche l'URL de COMMENCER par un
 * schéma exécutable, ce qu'un client conclut aussi de son côté.
 */
function decodeCodePoint(match: string, digits: string, radix: number): string {
  const codePoint = parseInt(digits, radix)
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) return match
  return String.fromCodePoint(codePoint)
}

/**
 * Valeur d'attribut portant un schéma exécutable, après avoir refait ce que fait
 * un client : décoder les entités numériques, retirer le bruit.
 */
function isScriptUri(value: string): boolean {
  if (!value.includes(':') && !ENCODED_COLON.test(value)) return false
  const normalized = value
    .replace(NUMERIC_ENTITY_HEX, (m: string, hex: string) => decodeCodePoint(m, hex, 16))
    .replace(NUMERIC_ENTITY_DEC, (m: string, dec: string) => decodeCodePoint(m, dec, 10))
    .replace(URI_NOISE, '')
  return SCRIPT_URI_SCHEME.test(normalized)
}

/**
 * Balaie une balise ouverte en `open` (index du `<`). Retourne l'index qui suit
 * la balise et, le cas échéant, la construction refusée.
 *
 * Une balise non refermée est balayée jusqu'à la fin du fragment plutôt
 * qu'ignorée : le balisage de la coque la referme à l'insertion, donc son
 * gestionnaire serait bien posé dans l'e-mail expédié.
 */
function scanTag(
  source: string,
  open: number,
): { next: number; construct: UnsafeBodyConstruct | null } {
  const end = source.length
  let cursor = open + 1
  if (source[cursor] === '/') cursor++

  const nameStart = cursor
  while (cursor < end && !CHAR_NAME_END.test(source[cursor])) cursor++
  const name = source.slice(nameStart, cursor).toLowerCase()
  if (FORBIDDEN_TAGS[name] || EMBEDDED_FORBIDDEN_TAG.test(name)) {
    return { next: cursor, construct: 'forbidden-tag' }
  }

  while (cursor < end && source[cursor] !== '>') {
    if (CHAR_ATTR_SEPARATOR.test(source[cursor])) {
      cursor++
      continue
    }

    const attrStart = cursor
    while (cursor < end && !CHAR_ATTR_NAME_END.test(source[cursor])) cursor++
    const attrName = source.slice(attrStart, cursor).toLowerCase()
    if (HANDLER_ATTR_NAME.test(attrName)) {
      return { next: cursor, construct: 'handler-attribute' }
    }

    let probe = cursor
    while (probe < end && CHAR_SPACE.test(source[probe])) probe++
    if (source[probe] !== '=') {
      // Attribut booléen : pas de valeur à examiner. `cursor = probe` et JAMAIS
      // `probe + 1` — un `+ 1` sautait par-dessus le `>` de fin quand l'attribut
      // le touche (`<! --[if mso]>`), et la boucle continuait alors à découper le
      // balisage SUIVANT comme s'il appartenait à la balise, avalant un
      // `<script>` placé juste après.
      //
      // Progression garantie sans compteur de secours : `probe >= cursor`, et si
      // `probe === cursor` le caractère en `cursor` ne peut être que `/` ou `>`
      // (seuls terminateurs de nom qui ne soient ni une espace ni un `=`) — le
      // premier avance au tour suivant par la branche séparateur, le second sort
      // de la boucle.
      cursor = probe
      continue
    }

    probe++
    while (probe < end && CHAR_SPACE.test(source[probe])) probe++
    const quote = source[probe]
    let value: string
    if (quote === '"' || quote === "'") {
      const close = source.indexOf(quote, probe + 1)
      value = source.slice(probe + 1, close === -1 ? end : close)
      cursor = close === -1 ? end : close + 1
    } else {
      const valueStart = probe
      while (probe < end && !CHAR_UNQUOTED_VALUE_END.test(source[probe])) probe++
      value = source.slice(valueStart, probe)
      cursor = probe
    }

    if (isScriptUri(value)) return { next: cursor, construct: 'script-uri' }
  }

  return { next: cursor + 1, construct: null }
}

/**
 * Première construction refusée trouvée dans le fragment de corps, ou `null`.
 *
 * Un seul passage, sans retour arrière : la position dans le fragment décide de
 * la règle applicable. Un commentaire n'est reconnu qu'en prose — jamais à
 * l'intérieur d'une balise, où `<!--` n'est que du texte d'attribut.
 */
export function findUnsafeBodyConstruct(bodyMjml: string): UnsafeBodyConstruct | null {
  const end = bodyMjml.length
  let cursor = 0

  while (cursor < end) {
    if (bodyMjml[cursor] !== '<') {
      cursor++
      continue
    }

    if (bodyMjml.startsWith('<!--', cursor)) {
      const commentEnd = findCommentEnd(bodyMjml, cursor + 4)
      if (commentEnd === -1) return 'comment-unterminated'
      // Un commentaire conditionnel porte toujours `<![endif]` : la règle « aucun
      // `<` dans un commentaire » les couvre donc tous, sans les énumérer.
      const inner = bodyMjml.indexOf('<', cursor + 4)
      if (inner !== -1 && inner < commentEnd) return 'comment-markup'
      cursor = commentEnd + (bodyMjml.startsWith('-->', commentEnd) ? 3 : 4)
      continue
    }

    // `<` non suivi d'un nom, d'un `/` ou d'un `!` : caractère littéral en prose.
    if (!CHAR_TAG_OPENER.test(bodyMjml[cursor + 1] ?? '')) {
      cursor++
      continue
    }

    const { next, construct } = scanTag(bodyMjml, cursor)
    if (construct !== null) return construct
    cursor = Math.max(next, cursor + 1)
  }

  return null
}

/**
 * Garde d'écriture : à appeler juste avant toute persistance d'un corps MJML.
 *
 * @throws ValidationError (400, `EMAIL_BODY_UNSAFE_CONTENT`) — message montrable,
 *         il nomme la construction refusée sans recopier la charge.
 */
export function assertSafeEmailBody(bodyMjml: string): void {
  const construct = findUnsafeBodyConstruct(bodyMjml)
  if (construct === null) return
  throw new ValidationError(
    `Le corps du modèle contient ${CONSTRUCT_LABEL[construct]}. Retirez-le du contenu, puis enregistrez à nouveau.`,
    ERROR_CODES.EMAIL_BODY_UNSAFE_CONTENT,
  )
}
