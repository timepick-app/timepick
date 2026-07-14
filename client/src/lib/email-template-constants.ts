/**
 * Variables et helpers liés au template d'invitation par défaut.
 *
 * Source canonique des noms : `server/src/services/render-email.service.ts:343-349`
 * (`HEALTHCHECK_STUB_VARIABLES`). Les tokens `slot_date` / `slot_time` /
 * `calendar_url` appartiennent au template `reservation_confirmation` (E2.S5)
 * et ne sont pas exposés ici.
 */

export const INVITATION_VARIABLES: readonly string[] = [
  'user_first_name',
  'event_name',
  'event_description',
  'magic_link',
  'expiration_date',
] as const

/**
 * Variables qui doivent rester dans le body de l'invitation pour que les
 * magic links restent fonctionnels. Leur retrait déclenche un toast
 * d'avertissement non-bloquant (D-ext3 / FR55).
 */
export const INVITATION_CRITICAL_VARIABLES: readonly string[] = [
  'magic_link',
  'expiration_date',
] as const

export function findMissingCriticalVariables(bodyMjml: string): readonly string[] {
  return INVITATION_CRITICAL_VARIABLES.filter(
    (name) => !new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(bodyMjml),
  )
}

/**
 * Description fonctionnelle (registre FR) de chaque variable d'email, affichée
 * à l'administrateur dans la section « Variables disponibles » des cartes.
 *
 * **Source unique** : tout token rendu dans l'UID doit avoir son libellé ici,
 * jamais en dur dans le JSX. Le registre est canonique (un seul libellé par
 * token) pour que les variables partagées entre invitation et emails système
 * (`magic_link`, `expiration_date`, `event_name`) ne divergent pas.
 */
export interface EmailVariableHelp {
  readonly name: string
  readonly description: string
}

const EMAIL_VARIABLE_DESCRIPTIONS: Record<string, string> = {
  magic_link: 'Lien de connexion sécurisé, généré automatiquement pour le destinataire.',
  expiration_date: "Date et heure d'expiration du lien de connexion.",
  event_name: "Nom de l'événement concerné.",
  event_description: "Description de l'événement concerné.",
  slot_date: 'Date du créneau réservé.',
  slot_time: 'Heure du créneau réservé.',
  user_first_name: 'Prénom du destinataire.',
  user_last_name: 'Nom de famille du destinataire (peut être vide).',
  user_full_name: 'Prénom et nom du destinataire.',
  login_url: "Lien de connexion à l'espace, généré automatiquement.",
  cancellation_reason: "Motif d'annulation pré-formaté (peut être vide).",
  calendar_url: "Lien vers la page de l'événement pour gérer la réservation.",
}

/**
 * Associe à chaque nom de variable sa description canonique. Les tokens
 * inconnus du registre retombent sur une chaîne vide (ne devrait pas arriver :
 * les listes de variables et le registre sont maintenus ensemble).
 */
export function describeEmailVariables(
  names: readonly string[],
): readonly EmailVariableHelp[] {
  return names.map((name) => ({
    name,
    description: EMAIL_VARIABLE_DESCRIPTIONS[name] ?? '',
  }))
}

export const INVITATION_VARIABLE_HELP: readonly EmailVariableHelp[] =
  describeEmailVariables(INVITATION_VARIABLES)
