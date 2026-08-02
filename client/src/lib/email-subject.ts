/**
 * Règles de la ligne d'objet, côté client — MIROIR du module serveur du même
 * nom. Les deux doivent produire la même chaîne pour la même entrée : l'objet
 * affiché dans l'éditeur est une promesse sur ce qui partira réellement, et
 * une promesse fausse est pire que pas d'aperçu du tout. Un test de parité
 * verrouille l'égalité sur un jeu de cas figé.
 */

/** Variable d'objet telle que le SERVEUR la publie — jamais reconstruite ici. */
export interface SubjectVariable {
  name: string
  label: string
  previewValue: string
}

/**
 * Plafond de STOCKAGE, miroir du serveur. Ce n'est pas le repère de
 * lisibilité — voir `SUBJECT_LENGTH_HINT`.
 */
export const MAX_SUBJECT_LENGTH = 255

/**
 * Repère de lisibilité affiché pendant la frappe. Il vient de mesures publiées
 * de troncature par client de messagerie — Gmail mobile ≈ 30 caractères,
 * iPhone 41 à 48, Outlook bureau 50 à 60, Gmail bureau 60 à 88 — et non d'une
 * mesure faite sur ce produit. C'est un INDICATEUR : dépasser n'empêche rien.
 */
export const SUBJECT_LENGTH_HINT = 50

/**
 * Un objet est une LIGNE : contrôles et blancs rabattus sur un espace simple,
 * bords rognés. Miroir EXACT de `normalizeSubject` côté serveur, y compris
 * `\p{Cc}`/`\p{Cf}` que `\s` ne couvre pas — c'est ce qui fait que le compteur
 * de caractères annonce la longueur réellement stockée.
 */
export function normalizeSubject(raw: string): string {
  return raw.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()
}

// Capture TOUT `{{…}}`, y compris les formes que le moteur ne reconnaît pas.
// Miroir du serveur, et c'est le point : `{{ event_name }}` avec des espaces
// n'est PAS un jeton — il doit rester littéral des deux côtés, et être signalé
// comme non autorisé plutôt que remplacé en silence.
const ANY_TOKEN_RE = /\{\{([^}]*)\}\}/g

/**
 * L'objet tel qu'il partira, jetons remplacés par les valeurs de démonstration
 * du serveur. Un jeton absent de la liste reste LITTÉRAL : c'est exactement ce
 * que fait le moteur serveur pour une forme qu'il ne reconnaît pas, et c'est
 * ce qui rend la faute visible au lieu de la masquer par du vide.
 */
export function interpolateSubject(
  source: string,
  variables: readonly SubjectVariable[],
): string {
  const values = new Map(variables.map((v) => [v.name, v.previewValue]))
  return normalizeSubject(
    source.replace(ANY_TOKEN_RE, (match, name: string) => values.get(name) ?? match),
  )
}

/**
 * Les jetons que ce modèle ne saurait pas remplir, accolades comprises et dans
 * l'ordre d'apparition. Miroir du refus serveur : on le calcule ici pour que la
 * faute se voie pendant la frappe, pas au moment de l'enregistrement.
 */
export function findUnsupportedSubjectTokens(
  source: string,
  variables: readonly SubjectVariable[],
): string[] {
  const allowed = new Set(variables.map((v) => v.name))
  const unsupported: string[] = []
  for (const match of source.matchAll(ANY_TOKEN_RE)) {
    if (allowed.has(match[1])) continue
    if (!unsupported.includes(match[0])) unsupported.push(match[0])
  }
  return unsupported
}

/**
 * Le motif qui BLOQUE l'enregistrement, ou `null` si l'objet est acceptable.
 *
 * Il NOMME la condition à satisfaire — « la variable {{x}} n'est pas
 * autorisée » — et jamais un simple constat : c'est ce qui le rend actionnable,
 * et c'est ce qu'exige la règle du système de design sur les actions bloquées.
 * La même chaîne sert au motif de la barre d'outils et au message sous le
 * champ ; deux formulations divergeraient.
 */
export function subjectBlockReason(
  source: string,
  variables: readonly SubjectVariable[],
): string | null {
  const normalized = normalizeSubject(source)
  if (normalized.length === 0) return "Objet : l'objet ne peut pas être vide."
  if (normalized.length > MAX_SUBJECT_LENGTH) {
    return `Objet : ${normalized.length} caractères, le maximum est ${MAX_SUBJECT_LENGTH}.`
  }
  const unsupported = findUnsupportedSubjectTokens(normalized, variables)
  if (unsupported.length === 1) {
    return `Objet : la variable ${unsupported[0]} n'est pas autorisée pour ce modèle.`
  }
  if (unsupported.length > 1) {
    return `Objet : les variables ${unsupported.join(', ')} ne sont pas autorisées pour ce modèle.`
  }
  return null
}
