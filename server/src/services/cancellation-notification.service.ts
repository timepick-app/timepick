import { query } from '../db'
import { sendSlotCancellationEmail } from './email.service'
import { formatSlotEmailDate, formatSlotEmailTime } from '../utils/slotEmailFormat'

/**
 * Service des notifications d'annulation « en attente ».
 *
 * Source de vérité : une réservation est « en attente » quand son créneau est
 * annulé (`slots.cancelled_at IS NOT NULL`) ET que la notification n'a pas
 * encore été envoyée avec succès (`bookings.cancellation_notified_at IS NULL`).
 * cf. migration 015 + slot.service.cancelSlot (qui pose le marqueur sur les
 * envois réussis).
 *
 * Ce service alimente deux surfaces admin (carte Tableau de bord + section de
 * l'onglet Emails d'un événement) via une lecture groupée et un renvoi groupé
 * idempotent. Première brique d'un éventuel registre d'envois avec reprise
 * automatique (non livré ici — cf. plan §13).
 */

interface PendingRecipient {
  bookingId: string
  email: string
  firstName: string | null
  lastName: string | null
}

export interface PendingSlot {
  slotId: string
  startTime: string
  endTime: string
  cancellationReason: string | null
  recipients: PendingRecipient[]
}

export interface PendingEvent {
  eventId: string
  eventName: string
  pendingCount: number
  slots: PendingSlot[]
}

export interface PendingNotifications {
  pending: number
  events: PendingEvent[]
}

export interface ResendResult {
  sent: number
  failed: number
}

/**
 * Forme brute d'une ligne « en attente » (snake_case, telle que retournée par
 * la DB). Une ligne = une réservation en attente sur un créneau annulé.
 */
interface PendingRow {
  event_id: string
  event_name: string
  slot_id: string
  start_time: Date
  end_time: Date
  cancellation_reason: string | null
  booking_id: string
  email: string
  first_name: string | null
  last_name: string | null
}

/**
 * Sélectionne toutes les réservations en attente, optionnellement filtrées par
 * événement. Tri stable event › slot › destinataire pour un groupement
 * déterministe et une UX lisible. Le cast `$1::uuid` exige un UUID valide quand
 * `eventId` est fourni (le contrôleur valide en amont) ; `null` = global.
 */
async function selectPendingRows(eventId?: string): Promise<PendingRow[]> {
  const result = await query<PendingRow>(
    `SELECT e.id AS event_id,
            e.name AS event_name,
            s.id AS slot_id,
            s.start_time,
            s.end_time,
            s.cancellation_reason,
            b.id AS booking_id,
            u.email,
            u.first_name,
            u.last_name
       FROM bookings b
       JOIN slots s ON b.slot_id = s.id
       JOIN events e ON s.event_id = e.id
       JOIN users u ON b.user_id = u.id
      WHERE s.cancelled_at IS NOT NULL
        AND b.cancellation_notified_at IS NULL
        AND ($1::uuid IS NULL OR e.id = $1)
      ORDER BY e.name ASC, s.start_time ASC, u.last_name ASC NULLS LAST, u.first_name ASC`,
    [eventId ?? null]
  )
  return result.rows
}

export const cancellationNotificationService = {
  /**
   * Liste groupée des notifications en attente (event › slot › destinataire)
   * avec compteurs. Sans `eventId` = global ; avec = un seul événement.
   * `pending = 0` ⇒ `events: []`.
   */
  async getPending(eventId?: string): Promise<PendingNotifications> {
    const rows = await selectPendingRows(eventId)

    const eventsById = new Map<string, PendingEvent>()
    const slotsById = new Map<string, PendingSlot>()

    for (const row of rows) {
      let event = eventsById.get(row.event_id)
      if (!event) {
        event = {
          eventId: row.event_id,
          eventName: row.event_name,
          pendingCount: 0,
          slots: [],
        }
        eventsById.set(row.event_id, event)
      }

      let slot = slotsById.get(row.slot_id)
      if (!slot) {
        slot = {
          slotId: row.slot_id,
          startTime: new Date(row.start_time).toISOString(),
          endTime: new Date(row.end_time).toISOString(),
          cancellationReason: row.cancellation_reason,
          recipients: [],
        }
        slotsById.set(row.slot_id, slot)
        event.slots.push(slot)
      }

      slot.recipients.push({
        bookingId: row.booking_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
      })
      event.pendingCount += 1
    }

    return {
      pending: rows.length,
      events: Array.from(eventsById.values()),
    }
  },

  /**
   * Renvoi groupé idempotent. Re-sélectionne les réservations en attente
   * (filtrées par `eventId` si fourni), ré-envoie via `sendSlotCancellationEmail`
   * et pose `cancellation_notified_at = NOW()` sur les succès. Un re-appel après
   * succès ne cible plus rien (`{ sent: 0, failed: 0 }`).
   *
   * Le contrat de `sendSlotCancellationEmail` est inchangé ; le motif provient
   * de `slots.cancellation_reason` (l'échappement HTML est fait dans le service
   * email). Un échec de marquage est journalisé mais ne fait pas basculer un
   * envoi réussi en échec (au pire un email en double au prochain renvoi).
   */
  async resend(eventId?: string): Promise<ResendResult> {
    const rows = await selectPendingRows(eventId)

    const results = await Promise.allSettled(
      rows.map(async (row) => {
        const start = row.start_time
        const end = row.end_time

        const sent = await sendSlotCancellationEmail({
          userEmail: row.email,
          userFirstName: row.first_name,
          userLastName: row.last_name,
          eventName: row.event_name,
          eventId: row.event_id,
          slotDate: formatSlotEmailDate(start, end),
          slotTime: formatSlotEmailTime(start, end),
          cancellationReason: row.cancellation_reason ?? undefined,
        })

        if (sent) {
          try {
            await query(
              `UPDATE bookings SET cancellation_notified_at = NOW()
               WHERE id = $1 AND cancellation_notified_at IS NULL`,
              [row.booking_id]
            )
          } catch (markErr) {
            console.error(
              `[Cancellation Resend] Échec du marquage cancellation_notified_at pour la réservation ${row.booking_id}:`,
              markErr
            )
          }
        }

        return sent
      })
    )

    let sent = 0
    let failed = 0
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value === true) {
        sent += 1
      } else {
        failed += 1
      }
    }

    return { sent, failed }
  },
}
