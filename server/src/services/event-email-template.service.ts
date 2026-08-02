import { query, withTransaction } from '../db'
import { NotFoundError } from '../errors/NotFoundError'
import { TemplateNotFoundError } from './render-email.service'
import { ERROR_CODES } from '@timepick/shared'
import { assertSafeEmailBody } from '../validators/email-body-content.validator'
import { subjectVariableViews, type SubjectVariableView } from './email-templates.service'
import { factorySubjectTemplate } from './email-send.service'

/**
 * Per-event email template view (E3.S2 — FR56/FR57/FR58).
 *
 * Mirrors the runtime inheritance resolution of render-email.service.ts:317-323
 * at the SQL layer (single round-trip LEFT JOIN), without compiling MJML.
 * MJML compile belongs to E3.S3's preview path, not S2.
 *
 * isCustom semantics:
 *   - false → events.invitation_mjml IS NULL AND no shell_parts @ owner_kind='event' for this event
 *   - true  → events.invitation_mjml IS NOT NULL (body override) OR at least one shell_parts row
 *             exists for this event (shell override)
 */
export interface EventEmailTemplateView {
  eventId: string
  templateKey: 'invitation'
  bodyMjml: string
  defaultBodyMjml: string
  isCustom: boolean
  /**
   * Surcharge d'objet DE CET ÉVÉNEMENT, forme source. `null` = hérite.
   * Volontairement distinct de `isCustom`, qui agrège corps ET coque : l'objet
   * a son propre état d'héritage et son propre chemin de retour.
   */
  subject: string | null
  /**
   * L'objet dont cet événement hérite, forme source : la personnalisation du
   * modèle général si elle existe, sinon l'objet d'usine. C'est ce que la
   * ligne affiche à l'état hérité, et ce dont part « Personnaliser ».
   */
  inheritedSubject: string
  /** Variables admissibles dans l'objet de l'invitation — même liste qu'au niveau modèle. */
  subjectVariables: SubjectVariableView[]
  updatedAt: string
}

interface EventEmailTemplateRow {
  invitation_mjml: string | null
  default_body: string | null
  invitation_subject: string | null
  template_subject: string | null
  /**
   * Le nom RÉEL de l'événement — pas de la décoration : il devient la valeur de
   * démonstration de `{{event_name}}`, pour que la ligne Objet de l'éditeur
   * annonce le même texte que l'aperçu affiché sur la même page.
   */
  event_name: string
  updated_at: Date
  has_event_shell: boolean
}

function buildView(eventId: string, row: EventEmailTemplateRow): EventEmailTemplateView {
  if (row.default_body === null) {
    throw new TemplateNotFoundError('invitation')
  }
  const isCustom = row.invitation_mjml !== null || row.has_event_shell === true

  return {
    eventId,
    templateKey: 'invitation',
    bodyMjml: row.invitation_mjml !== null ? row.invitation_mjml : row.default_body,
    defaultBodyMjml: row.default_body,
    isCustom,
    subject: row.invitation_subject,
    inheritedSubject: row.template_subject ?? factorySubjectTemplate('invitation', false),
    subjectVariables: subjectVariableViews('invitation', row.event_name),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * Read the active per-event invitation template (custom override OR global default fallback)
 * plus diff metadata for side-by-side comparison in the editor host (E3.S3).
 *
 * @throws NotFoundError if the event does not exist
 * @throws TemplateNotFoundError if the global 'invitation' template row is missing
 *         (should not happen — migration 006 + seed enforce its presence)
 */
export async function getEventEmailTemplateView(
  eventId: string,
): Promise<EventEmailTemplateView> {
  const { rows } = await query<EventEmailTemplateRow>(
    `SELECT
       e.invitation_mjml,
       e.invitation_subject,
       t.body_mjml AS default_body,
       t.subject AS template_subject,
       e.name AS event_name,
       e.updated_at,
       EXISTS(
         SELECT 1 FROM shell_parts
        WHERE owner_kind = 'event' AND owner_id = e.id::text
       ) AS has_event_shell
     FROM events e
     LEFT JOIN email_templates t ON t.template_key = 'invitation'
     WHERE e.id = $1`,
    [eventId],
  )

  if (rows.length === 0) {
    throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
  }

  return buildView(eventId, rows[0])
}

/**
 * Persist a new per-event invitation MJML body (FR57).
 *
 * Single-roundtrip CTE: the UPDATE and the inheritance-resolution SELECT are one
 * atomic statement, eliminating the UPDATE→SELECT race window (no concurrent
 * admin can overwrite or delete the event between write and re-read).
 *
 * Le corps est stocké verbatim : le garde de contenu refuse (il ne nettoie
 * jamais), donc un corps accepté ici est écrit octet pour octet. Flux jumeau du
 * modèle général — les deux surfaces portent le même garde, sinon aucune des deux
 * n'est fermée.
 *
 * L'OBJET, LUI, EST NORMALISÉ À L'ÉCRITURE : une surcharge identique à l'objet
 * hérité est ramenée à NULL. Sans ça, un administrateur qui ouvre le popover,
 * regarde l'objet hérité et le réenregistre sans y toucher fige une copie —
 * l'événement cesse alors silencieusement de suivre le modèle général, et la
 * prochaine modification du modèle ne l'atteint plus. La comparaison est faite
 * EN SQL, dans la même instruction que l'écriture, pour ne pas rouvrir la
 * fenêtre de course que ce CTE existe pour fermer.
 *
 * `subject` absent = ne pas toucher à la colonne ; `null` = revenir à
 * l'héritage. La distinction compte : un enregistrement qui ne change que le
 * corps ne doit pas effacer la surcharge d'objet.
 *
 * @throws ValidationError si le corps porte une construction refusée à l'écriture
 * @throws NotFoundError if the event does not exist
 * @throws TemplateNotFoundError if the global 'invitation' template row is missing
 */
export async function updateEventEmailTemplate(
  eventId: string,
  bodyMjml: string,
  subject?: string | null,
): Promise<EventEmailTemplateView> {
  assertSafeEmailBody(bodyMjml)

  const { rows } = await query<EventEmailTemplateRow>(
    `WITH inherited AS (
       SELECT COALESCE(subject, $5) AS subject
         FROM email_templates WHERE template_key = 'invitation'
     ), updated AS (
       UPDATE events SET
         invitation_mjml = $1,
         invitation_subject = CASE
           WHEN NOT $3 THEN invitation_subject
           WHEN $4 = (SELECT subject FROM inherited) THEN NULL
           ELSE $4
         END,
         updated_at = NOW()
       WHERE id = $2
       RETURNING invitation_mjml, invitation_subject, name AS event_name, updated_at
     )
     SELECT u.invitation_mjml, u.invitation_subject, t.body_mjml AS default_body,
            t.subject AS template_subject, u.event_name, u.updated_at,
            EXISTS(
              SELECT 1 FROM shell_parts
              WHERE owner_kind = 'event' AND owner_id = $2::text
            ) AS has_event_shell
     FROM updated u
     LEFT JOIN email_templates t ON t.template_key = 'invitation'`,
    [
      bodyMjml,
      eventId,
      subject !== undefined,
      subject ?? null,
      factorySubjectTemplate('invitation', false),
    ],
  )

  if (rows.length === 0) {
    throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
  }

  return buildView(eventId, rows[0])
}

/**
 * Purge toutes les personnalisations de l'événement (FR58) :
 * corps (events.invitation_mjml → NULL) ET coque event (shell_parts @ owner_kind='event').
 * Idempotent : appeler reset sur un événement déjà vierge est un succès silencieux.
 *
 * Opération atomique via withTransaction : le DELETE shell_parts et le UPDATE events
 * s'engagent ensemble ou pas du tout.
 *
 * @throws NotFoundError si l'événement n'existe pas
 * @throws TemplateNotFoundError si le template global 'invitation' est absent
 *         (ne devrait pas arriver — migration 006 + seed l'assurent)
 */
export async function resetEventEmailTemplate(
  eventId: string,
): Promise<EventEmailTemplateView> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<EventEmailTemplateRow>(
      `WITH updated AS (
         UPDATE events SET invitation_mjml = NULL, invitation_subject = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING invitation_mjml, invitation_subject, name AS event_name, updated_at
       )
       SELECT u.invitation_mjml, u.invitation_subject, t.body_mjml AS default_body,
              t.subject AS template_subject, u.event_name, u.updated_at,
              false AS has_event_shell
       FROM updated u
       LEFT JOIN email_templates t ON t.template_key = 'invitation'`,
      [eventId],
    )

    if (rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }

    await client.query(
      `DELETE FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`,
      [eventId],
    )

    return buildView(eventId, rows[0])
  })
}
