import { query, withTransaction } from '../db'
import { NotFoundError } from '../errors/NotFoundError'
import { TemplateNotFoundError } from './render-email.service'

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
  updatedAt: string
}

interface EventEmailTemplateRow {
  invitation_mjml: string | null
  default_body: string | null
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
       t.body_mjml AS default_body,
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
    throw new NotFoundError('Événement non trouvé')
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
 * @throws NotFoundError if the event does not exist
 * @throws TemplateNotFoundError if the global 'invitation' template row is missing
 */
export async function updateEventEmailTemplate(
  eventId: string,
  bodyMjml: string,
): Promise<EventEmailTemplateView> {
  const { rows } = await query<EventEmailTemplateRow>(
    `WITH updated AS (
       UPDATE events SET invitation_mjml = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING invitation_mjml, updated_at
     )
     SELECT u.invitation_mjml, t.body_mjml AS default_body, u.updated_at,
            EXISTS(
              SELECT 1 FROM shell_parts
              WHERE owner_kind = 'event' AND owner_id = $2::text
            ) AS has_event_shell
     FROM updated u
     LEFT JOIN email_templates t ON t.template_key = 'invitation'`,
    [bodyMjml, eventId],
  )

  if (rows.length === 0) {
    throw new NotFoundError('Événement non trouvé')
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
         UPDATE events SET invitation_mjml = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING invitation_mjml, updated_at
       )
       SELECT u.invitation_mjml, t.body_mjml AS default_body, u.updated_at,
              false AS has_event_shell
       FROM updated u
       LEFT JOIN email_templates t ON t.template_key = 'invitation'`,
      [eventId],
    )

    if (rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }

    await client.query(
      `DELETE FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`,
      [eventId],
    )

    return buildView(eventId, rows[0])
  })
}
