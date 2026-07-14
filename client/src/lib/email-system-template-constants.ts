/**
 * Variables et helpers liés aux templates d'emails système
 * (`magic_link_login`, `reservation_confirmation`,
 * `account_created`, `cancellation_confirmation`, `role_promoted`, `role_demoted`).
 *
 * Source canonique des noms : `server/src/migrations/006_email_refactoring.sql:180-217`
 * (textes seedés) + `server/src/services/render-email.service.ts:343-349`
 * (`HEALTHCHECK_STUB_VARIABLES`).
 *
 * Le serveur garantit `{{magic_link}}` (templates magic_link_*) et
 * `{{calendar_url}}` (reservation_confirmation) via le squelette MJML
 * (`SYSTEM_TEMPLATE_SKELETONS` dans
 * `server/src/services/email-templates.service.ts:65-110`). Ces variables
 * ne sont donc pas listées comme critiques côté UI : l'utilisateur ne peut
 * pas les retirer du body. Les listing comme critiques créerait un
 * blocage fantôme.
 */

import type { TemplateKey } from '@/services/email-templates.service'
import {
  describeEmailVariables,
  type EmailVariableHelp,
} from '@/lib/email-template-constants'

export type SystemTemplateKey = Exclude<TemplateKey, 'invitation'>

export const SYSTEM_TEMPLATE_VARIABLES: Record<
  SystemTemplateKey,
  readonly string[]
> = {
  magic_link_login: ['user_first_name', 'user_last_name', 'user_full_name', 'magic_link', 'expiration_date'],
  reservation_confirmation: [
    'user_first_name',
    'user_last_name',
    'user_full_name',
    'event_name',
    'slot_date',
    'slot_time',
    'calendar_url',
  ],
  account_created: ['user_first_name', 'user_last_name', 'user_full_name', 'login_url'],
  cancellation_confirmation: ['user_first_name', 'user_last_name', 'user_full_name', 'event_name', 'slot_date', 'slot_time', 'cancellation_reason', 'calendar_url'],
  role_promoted: ['user_first_name', 'user_last_name', 'user_full_name', 'login_url'],
  role_demoted: ['user_first_name', 'user_last_name', 'user_full_name', 'login_url'],
  unregistration_confirmation: ['user_first_name', 'user_last_name', 'user_full_name', 'event_name', 'slot_date', 'slot_time', 'calendar_url'],
} as const

export const SYSTEM_TEMPLATE_CRITICAL_VARIABLES: Record<
  SystemTemplateKey,
  readonly string[]
> = {
  magic_link_login: ['expiration_date'],
  reservation_confirmation: ['event_name', 'slot_date', 'slot_time'],
  account_created: [],
  cancellation_confirmation: [],
  role_promoted: [],
  role_demoted: [],
  unregistration_confirmation: ['event_name', 'slot_date', 'slot_time'],
} as const

export function findMissingSystemCriticalVariables(
  templateKey: SystemTemplateKey,
  introText: string,
  signatureText: string,
): readonly string[] {
  const haystack = `${introText} ${signatureText}`
  return SYSTEM_TEMPLATE_CRITICAL_VARIABLES[templateKey].filter(
    (name) => !new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(haystack),
  )
}

/**
 * Variables propres à chaque email système, enrichies de leur description
 * canonique (cf. `EMAIL_VARIABLE_DESCRIPTIONS`). Consommé par la section
 * « Variables disponibles » du panneau système.
 */
export const SYSTEM_TEMPLATE_VARIABLE_HELP: Record<
  SystemTemplateKey,
  readonly EmailVariableHelp[]
> = {
  magic_link_login: describeEmailVariables(SYSTEM_TEMPLATE_VARIABLES.magic_link_login),
  reservation_confirmation: describeEmailVariables(
    SYSTEM_TEMPLATE_VARIABLES.reservation_confirmation,
  ),
  account_created: describeEmailVariables(SYSTEM_TEMPLATE_VARIABLES.account_created),
  cancellation_confirmation: describeEmailVariables(
    SYSTEM_TEMPLATE_VARIABLES.cancellation_confirmation,
  ),
  role_promoted: describeEmailVariables(SYSTEM_TEMPLATE_VARIABLES.role_promoted),
  role_demoted: describeEmailVariables(SYSTEM_TEMPLATE_VARIABLES.role_demoted),
  unregistration_confirmation: describeEmailVariables(SYSTEM_TEMPLATE_VARIABLES.unregistration_confirmation),
}
