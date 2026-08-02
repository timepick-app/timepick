/**
 * Règles communes à la ligne d'objet des e-mails.
 *
 * Vit dans `lib/` parce que les deux bouts de la chaîne en dépendent et qu'ils
 * ne doivent pas diverger : le chemin d'ENVOI (résolution + interpolation) et
 * le chemin d'ÉCRITURE (validation Zod du PATCH). Une normalisation appliquée
 * d'un seul côté produirait un objet accepté sous une forme et envoyé sous une
 * autre.
 */

import type { TemplateKey } from '../db/email-templates.db'
import type { SubjectSubstitutableKey } from '../services/mjml-compile.service'

/**
 * Plafond de STOCKAGE, pas règle de lisibilité. Les clients de messagerie
 * tronquent bien avant (≈30 caractères sur Gmail mobile, 50-60 sur Outlook
 * bureau) — c'est l'affaire du repère affiché dans l'éditeur, pas d'un refus
 * serveur. Ici on borne seulement ce qu'on accepte d'écrire en base.
 */
export const MAX_SUBJECT_LENGTH = 255

/**
 * Un objet d'e-mail est une LIGNE. On rabat donc tout blanc — espaces, retours
 * à la ligne, tabulations — sur un espace simple, puis on rogne les bords.
 * `\p{Cc}` (contrôles C0/C1) et `\p{Cf}` (bidi, largeurs nulles) sont écrasés
 * d'abord : `\s` ne les couvre pas, un NUL ferait échouer l'écriture Postgres
 * en 500 plutôt qu'en 400, et un `U+202E` venu d'un nom d'utilisateur rendrait
 * la ligne d'objet trompeuse.
 *
 * PORTANT POUR LA SÉCURITÉ sur le chemin des transports HTTP (brevo, mailjet,
 * resend, scaleway, sweego) : `http-transport.ts` recopie l'objet brut dans le
 * corps JSON du fournisseur sans jamais traverser mime-node, donc cet appel est
 * la SEULE suppression serveur des CR/LF. Sur SMTP, Nodemailer en pose une
 * seconde. L'appel de `resolveSubject` APRÈS interpolation est obligatoire : les
 * valeurs interpolées (`{{user_full_name}}`, que le membre édite lui-même) ne
 * sont jamais validées à l'écriture. Ne pas déplacer ce nettoyage à la seule
 * écriture sous prétexte que la base est déjà propre.
 */
export function normalizeSubject(raw: string): string {
  return raw.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Libellés FR des variables admissibles dans un objet. Le serveur est
 * propriétaire de cette liste et la renvoie dans le GET : le client affiche ce
 * qu'on lui dit, il ne maintient pas une quatrième liste de variables qui
 * dériverait de celles du corps.
 *
 * Formulations COURTES : elles remplissent un menu d'insertion, pas une fiche
 * d'aide. Les descriptions longues des variables de corps vivent côté client,
 * dans le registre des cartes « Variables disponibles ».
 */
export const SUBJECT_VARIABLE_LABELS: Record<SubjectSubstitutableKey, string> = {
  event_name: "Nom de l'événement",
  slot_date: 'Date du créneau',
  slot_time: 'Heure du créneau',
  user_first_name: 'Prénom du destinataire',
  user_last_name: 'Nom du destinataire',
  user_full_name: 'Prénom et nom du destinataire',
}

const NAME_VARIABLES = [
  'user_first_name',
  'user_last_name',
  'user_full_name',
] as const satisfies readonly SubjectSubstitutableKey[]

const SLOT_VARIABLES = [
  'event_name',
  'slot_date',
  'slot_time',
  ...NAME_VARIABLES,
] as const satisfies readonly SubjectSubstitutableKey[]

/**
 * Ce que CHAQUE modèle fournit réellement, relevé dans la charge de variables
 * passée à `renderEmail` par sa fonction d'envoi.
 *
 * C'EST UNE LISTE DE DISPONIBILITÉ, PAS UNE PRÉFÉRENCE. Un jeton absent d'ici
 * n'est pas « déconseillé » : il s'interpolerait en VIDE à l'envoi, parce que
 * la fonction d'envoi ne le passe pas. Autoriser `{{event_name}}` sur
 * `account_created` produirait « Bienvenue sur » suivi de rien.
 *
 * Le `Record<TemplateKey, …>` est exhaustif à dessein : une nouvelle clé de
 * modèle ne compile pas tant que ses variables d'objet ne sont pas déclarées.
 */
export const SUBJECT_VARIABLES_BY_TEMPLATE: Record<
  TemplateKey,
  readonly SubjectSubstitutableKey[]
> = {
  invitation: ['event_name', ...NAME_VARIABLES],
  magic_link_login: [...NAME_VARIABLES],
  reservation_confirmation: SLOT_VARIABLES,
  cancellation_confirmation: SLOT_VARIABLES,
  unregistration_confirmation: SLOT_VARIABLES,
  account_created: NAME_VARIABLES,
  role_promoted: NAME_VARIABLES,
  role_demoted: NAME_VARIABLES,
  // Hors périmètre d'édition (exclu du schéma de param, donc ni GET ni PATCH),
  // mais déclaré pour ce qu'il passe réellement — le jour où il gagne une
  // surface, la liste est déjà juste.
  slot_modification: ['event_name', ...NAME_VARIABLES],
}

// Capture TOUT `{{…}}`, y compris les formes que le moteur ne reconnaît pas
// (jeton inconnu, ou espaces intérieurs comme `{{ event_name }}`). C'est
// délibérément plus large que `SUBJECT_VAR_RE` : ce qui doit être refusé, c'est
// justement ce que le moteur laisserait passer LITTÉRALEMENT, accolades
// comprises, jusque dans la boîte du destinataire.
const ANY_TOKEN_RE = /\{\{([^}]*)\}\}/g

/**
 * Les jetons d'un objet que ce modèle ne saurait pas remplir — inconnus,
 * interdits dans un objet, ou orthographiés avec des espaces intérieurs.
 *
 * Retour dans l'ordre d'apparition, sans doublon, accolades comprises : le
 * message d'erreur doit pouvoir NOMMER le jeton fautif tel que l'administrateur
 * l'a tapé.
 */
export function findUnsupportedSubjectTokens(
  subject: string,
  templateKey: TemplateKey,
): string[] {
  const allowed: readonly string[] = SUBJECT_VARIABLES_BY_TEMPLATE[templateKey]
  // Set, pas tableau : `Array.includes` sur un accumulateur croissant coûte
  // k²/2 comparaisons, et le contrôle de longueur qui précède n'interrompt pas
  // la chaîne Zod — un corps de 100 Ko de jetons distincts bloquerait la boucle
  // d'événements. L'ordre d'insertion est préservé par `Set`.
  const unsupported = new Set<string>()
  for (const match of subject.matchAll(ANY_TOKEN_RE)) {
    if (allowed.includes(match[1])) continue
    unsupported.add(match[0])
  }
  return [...unsupported]
}
