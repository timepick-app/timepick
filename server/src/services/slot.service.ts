import { query, withTransaction } from '../db'
import type { CreateSlotInput, UpdateSlotInput } from '../validators/slot.validator'
import { NotFoundError } from '../errors/NotFoundError'
import { ConflictError } from '../errors/ConflictError'
import { sendSlotCancellationEmail, sendSlotModificationEmail } from './email.service'
import { computeSlotDiff } from '../utils/slot-diff'
import { formatSlotEmailDate, formatSlotEmailTime } from '../utils/slotEmailFormat'
import { formatFullName } from '../utils/nameUtils'
import { VOLUNTEERS_AGG_FRAGMENT } from '../utils/slotSql'
import { ERROR_CODES } from '@timepick/shared'
import type { Slot } from '@timepick/shared'

// Slot : forme wire unifiée (source unique @timepick/shared). Historiquement
// défini localement. Conservé comme ré-export pour préserver les importateurs
// type (ex. `import type { Slot } from './slot.service'`). currentBookings est
// optionnel (absent des RETURNING * des writes) ; cancelledAt/cancellationReason
// sont requis string|null (colonnes DB migration 014, toujours retournées).
export type { Slot }

/**
 * Compteurs de notification partagés par UpdateSlotResult et CancelSlotResult.
 */
export interface NotificationOutcome {
  readonly notified: number
  readonly failed: number
}

/**
 * Résultat d'une annulation/suppression de créneau (`cancelSlot`).
 * Permet au client de signaler à l'admin l'issue réelle, notamment une
 * notification d'annulation qui n'a pas pu partir (`failed > 0`).
 */
export interface CancelSlotResult extends NotificationOutcome {
  cancelled: boolean // true si le créneau a été supprimé ou annulé
  hadReservations: boolean // true = soft-delete (≥1 inscrit) ; false = hard-delete (0 inscrit)
}

/**
 * Résultat d'une mise à jour de créneau (`updateSlot`).
 * Permet au client de signaler à l'admin l'issue réelle des notifications
 * de modification.
 */
export interface UpdateSlotResult extends NotificationOutcome {
  slot: Slot
}

/**
 * Row brute du SELECT de notification d'annulation (`cancelSlot`). Typée pour
 * supprimer les `as string`/`as Date` ad hoc : `first_name`/`last_name` sont
 * nullable en DB (split S2, pas de backfill), le compilateur le reflète.
 */
interface SlotCancellationRow {
  booking_id: string
  email: string
  first_name: string | null
  last_name: string | null
  event_name: string
  event_id: string
  start_time: Date
  end_time: Date
}

/**
 * Row brute retournée par `SELECT * FROM slots` (UPDATE … RETURNING * inclus).
 * Typée pour supprimer les `as Date` ad hoc dans updateSlot.
 */
interface SlotRow {
  id: string
  event_id: string
  start_time: Date
  end_time: Date
  capacity: number
  description: string | null
  created_at: Date
  updated_at: Date
  cancelled_at: Date | null
  cancellation_reason: string | null
}

/**
 * Service de gestion des créneaux horaires
 * Gère les opérations CRUD pour les créneaux de participation
 */
export const slotService = {
  /**
   * Créer un nouveau créneau horaire
   * @param data - Données du créneau (eventId, startTime, endTime, capacity)
   * @returns Le créneau créé
   */
  async createSlot(data: CreateSlotInput): Promise<Slot> {
    const result = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.eventId, data.startTime, data.endTime, data.capacity, data.description || null]
    )
    return result.rows[0] as Slot
  },

  /**
   * Lister tous les créneaux d'un événement avec compteur de réservations.
   *
   * Filtrage soft-delete (F7) piloté par `includeCancelled` :
   *  - `false` (défaut, public non-auth) → seulement les créneaux actifs.
   *  - `true` (admin) → tous les créneaux, annulés inclus (arbitrage #1).
   *  - `'forCurrentUser'` (inscrit authentifié) → actifs + ses propres créneaux
   *    annulés (réservés), sans aucune borne temporelle (décision #2).
   *
   * @param eventId - UUID de l'événement
   * @param options.includeCancelled - mode de filtrage des créneaux annulés
   * @param options.userId - requis quand includeCancelled === 'forCurrentUser'
   * @returns Liste des créneaux triés par heure de début
   */
  async getSlotsByEvent(
    eventId: string,
    options?: { includeCancelled?: boolean | 'forCurrentUser'; userId?: string }
  ): Promise<Slot[]> {
    const mode = options?.includeCancelled ?? false
    const params: unknown[] = [eventId]
    let cancelledClause = ''

    if (mode === false) {
      cancelledClause = 'AND s.cancelled_at IS NULL'
    } else if (mode === 'forCurrentUser') {
      params.push(options?.userId ?? null)
      cancelledClause = `AND (s.cancelled_at IS NULL
              OR EXISTS (SELECT 1 FROM bookings b2 WHERE b2.slot_id = s.id AND b2.user_id = $2))`
    }
    // mode === true → aucune clause : tous les créneaux (admin).

    const result = await query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id)::int as current_bookings,
              ${VOLUNTEERS_AGG_FRAGMENT}
       FROM slots s
       WHERE s.event_id = $1 ${cancelledClause}
       ORDER BY s.start_time ASC`,
      params
    )
    return result.rows as Slot[]
  },

  /**
   * Lister les créneaux d'un événement par son UUID public (calendrier public).
   *
   * Filtrage soft-delete + exception `is_published` (F7/F8, décisions #2/#8) :
   *  - Créneau ACTIF : visible uniquement si l'événement est publié — un brouillon
   *    ne fuite jamais ses créneaux actifs (gate `is_published` conservé).
   *  - Créneau ANNULÉ : visible uniquement à l'inscrit qui l'a réservé, **quelle que
   *    soit la publication** de l'événement (canal de secours décision #8). Borné à
   *    l'utilisateur courant via EXISTS → aucun autre créneau annulé ne fuite.
   *  - userId absent (anonyme) : l'EXSITS est toujours faux → seulement les créneaux
   *    actifs d'un événement publié (comportement historique préservé, AC3).
   *
   * @param eventUuid - UUID public de l'événement
   * @param userId - id de l'utilisateur authentifié (optionnel)
   * @returns Liste des créneaux triés par heure de début avec disponibilité
   */
  async getPublicSlotsByEventUuid(eventUuid: string, userId?: string): Promise<Slot[]> {
    const result = await query(
      `SELECT s.id,
              s.event_id,
              s.start_time,
              s.end_time,
              s.capacity,
              s.description,
              s.cancelled_at,
              s.cancellation_reason,
              s.created_at,
              s.updated_at,
              (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id)::int as current_bookings,
              s.capacity - (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id)::int as available_places
       FROM slots s
       JOIN events e ON s.event_id = e.id
       WHERE e.id = $1
         AND (
           (e.is_published = true AND s.cancelled_at IS NULL)
           OR (s.cancelled_at IS NOT NULL
               AND EXISTS (SELECT 1 FROM bookings b3 WHERE b3.slot_id = s.id AND b3.user_id = $2))
         )
       ORDER BY s.start_time ASC`,
      [eventUuid, userId ?? null]
    )
    return result.rows as Slot[]
  },

  /**
   * Récupérer un créneau par UUID
   * @param id - UUID du créneau
   * @returns Le créneau trouvé
   * @throws NotFoundError si le créneau n'existe pas
   */
  async getSlotById(id: string): Promise<Slot> {
    const result = await query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id)::int as current_bookings
       FROM slots s
       WHERE s.id = $1`,
      [id]
    )
    if (result.rows.length === 0) {
      throw new NotFoundError('Créneau non trouvé', ERROR_CODES.SLOT_NOT_FOUND)
    }
    return result.rows[0] as Slot
  },

  /**
   * Mettre à jour un créneau et notifier les inscrits si les champs surveillés
   * (start_time, end_time, description) ont changé.
   *
   * SELECT FOR UPDATE garantit l'atomicité lecture/écriture. La race entre le
   * SELECT initial et l'UPDATE est acceptable en V0 : le verrou sérialise les
   * appels concurrents sur la même row, le diff reflète toujours l'état DB avant
   * et après la transaction.
   *
   * @param id - UUID du créneau
   * @param data - Champs à modifier
   * @param options.notify - Envoyer les notifications de modification (défaut true)
   * @returns slot mis à jour + compteurs de notifications
   * @throws NotFoundError si le créneau n'existe pas
   * @throws ConflictError si le créneau est annulé
   * @throws Error si la capacité est réduite en dessous du nombre de réservations
   */
  async updateSlot(id: string, data: UpdateSlotInput, options: { notify?: boolean } = {}): Promise<UpdateSlotResult> {
    const notify = options.notify ?? true

    const { after, diff, currentBookings } = await withTransaction(async (client) => {
      // Verrouiller la row : lit l'état avant mutation et sérialise les appels concurrents.
      const lockRes = await client.query<SlotRow>(
        'SELECT * FROM slots WHERE id = $1 FOR UPDATE',
        [id]
      )
      if (lockRes.rows.length === 0) throw new NotFoundError('Créneau non trouvé', ERROR_CODES.SLOT_NOT_FOUND)
      const beforeRow = lockRes.rows[0]
      if (beforeRow.cancelled_at !== null) {
        throw new ConflictError('Ce créneau est annulé et ne peut plus être modifié.', 'SLOT_CANCELLED')
      }

      const countRes = await client.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1',
        [id]
      )
      const bookings = parseInt(countRes.rows[0]?.count || '0', 10)
      if (data.capacity !== undefined && data.capacity < bookings) {
        throw new Error(`Impossible de réduire la capacité en dessous du nombre de réservations actuelles (${bookings})`)
      }

      // Build dynamique identique à l'actuel (start_time/end_time/capacity/description)
      const updates: string[] = []
      const values: (string | number | Date | null)[] = []
      let paramIndex = 1

      if (data.startTime !== undefined) { updates.push(`start_time = $${paramIndex++}`); values.push(data.startTime) }
      if (data.endTime !== undefined) { updates.push(`end_time = $${paramIndex++}`); values.push(data.endTime) }
      if (data.capacity !== undefined) { updates.push(`capacity = $${paramIndex++}`); values.push(data.capacity) }
      if (data.description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(data.description) }

      if (updates.length === 0) throw new Error('Aucun champ à mettre à jour')

      values.push(id)
      const updRes = await client.query<SlotRow>(
        `UPDATE slots SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      )
      const afterRow = updRes.rows[0]

      // Diff calculé sur les rows DB (snake_case) — pas sur le payload d'entrée.
      const d = computeSlotDiff(beforeRow, afterRow)

      return { after: afterRow, diff: d, currentBookings: bookings }
    })

    let notified = 0
    let failed = 0

    // Court-circuit : skip total si pas de notif demandée, diff vide, ou aucun inscrit.
    if (notify && diff.fields.length > 0 && currentBookings > 0) {
      try {
        const recipients = await query(
          `SELECT u.email, u.first_name, u.last_name, s.event_id, e.name as event_name
           FROM bookings b
           JOIN users u ON b.user_id = u.id
           JOIN slots s ON b.slot_id = s.id
           JOIN events e ON s.event_id = e.id
           WHERE b.slot_id = $1`,
          [id]
        )
        if (recipients.rows.length > 0) {
          const eventName = recipients.rows[0].event_name as string
          const eventId = recipients.rows[0].event_id as string
          const res = await sendSlotModificationEmail(
            recipients.rows.map((r: { email: string; first_name: string | null; last_name: string | null }) => ({
              email: r.email,
              firstName: r.first_name ?? '',
              lastName: r.last_name ?? null,
            })),
            { id, eventName, eventId },
            diff,
          )
          notified = res.notified
          failed = res.failed
        }
      } catch (err) {
        // failed = currentBookings est honnête : sendSlotModificationEmail ne throw jamais après un envoi
        // (rendu en try/catch, sendMailWithFallback renvoie un booléen, allSettled ne rejette pas) ;
        // ce catch ne se déclenche donc en pratique que si la requête destinataires échoue —
        // cas où 0 email est parti.
        console.error(`[Slot Modification] Échec du dispatch des notifications pour le créneau ${id}:`, err)
        notified = 0
        failed = currentBookings
      }
    }

    // La row est snake_case ; la conversion snake→camel est faite par le middleware de sérialisation
    // de la réponse (cf. getSlotById/cancelSlot).
    return { slot: after as unknown as Slot, notified, failed }
  },

  /**
   * Annuler un créneau, de façon conditionnelle au nombre d'inscrits.
   *
   * Comportement (spec-conditional-slot-cancellation, renversement de l'arbitrage
   * #3 « soft-delete inconditionnel ») :
   *  - 0 inscrit  → suppression définitive (`DELETE FROM slots`) : un créneau créé
   *    par erreur, sans valeur d'audit, quitte calendrier/liste/base. Aucun email.
   *  - ≥1 inscrit → soft-delete (`cancelled_at`/`cancellation_reason`) : la donnée
   *    et les bookings sont préservés (pas de cascade, arbitrage #7) ; les inscrits
   *    conservent un canal de découverte indépendant du SMTP et sont notifiés.
   *
   * Le hard-delete d'un créneau RÉSERVÉ reste interdit : on ne supprime que les
   * créneaux à 0 booking. Le branchement se fait dans la transaction, après le
   * SELECT des inscrits, sous le verrou `FOR UPDATE` qui sérialise `bookSlot`.
   *
   * @param id - UUID du créneau
   * @param cancellationReason - Motif optionnel (cas ≥1 inscrit), propagé aux
   *   emails de notification. Ignoré dans le cas suppression (0 inscrit).
   * @returns le résultat de l'opération (cancelled, hadReservations, notified,
   *   failed) — `failed > 0` permet au client d'alerter l'admin qu'une
   *   notification n'a pas pu être envoyée.
   * @throws NotFoundError si le créneau n'existe pas (404)
   * @throws ConflictError si le créneau est déjà annulé (409, décision #9)
   */
  async cancelSlot(id: string, cancellationReason?: string): Promise<CancelSlotResult> {
    // Verrouiller la row active, lire les participants et annuler dans une seule
    // transaction. Le verrou `WHERE id = $1 AND cancelled_at IS NULL FOR UPDATE`
    // sérialise les annulations concurrentes : seul le gagnant poursuit ; un appel
    // concurrent voit la row filtrée (cancelled_at posé après le commit du gagnant)
    // et n'envoie aucune notification — garantie « au plus un courriel par
    // participant » (post-5b-defer-a-L3-data-F-C). Un créneau déjà annulé lève
    // ConflictError (409) sans re-mail ; un créneau absent lève NotFoundError (404).
    const usersToNotify = await withTransaction(async (client) => {
      const slotLock = await client.query(
        `SELECT id FROM slots WHERE id = $1 AND cancelled_at IS NULL FOR UPDATE`,
        [id]
      )
      if (slotLock.rows.length === 0) {
        // 0 row = créneau absent OU déjà annulé. On distingue pour la réponse HTTP
        // sans jamais atteindre le chemin d'envoi d'email.
        const exists = await client.query(`SELECT 1 FROM slots WHERE id = $1`, [id])
        if (exists.rows.length > 0) {
          throw new ConflictError('Ce créneau est déjà annulé.', 'SLOT_ALREADY_CANCELLED')
        }
        throw new NotFoundError('Créneau non trouvé', ERROR_CODES.SLOT_NOT_FOUND)
      }

      const users = await client.query<SlotCancellationRow>(
        `SELECT b.id AS booking_id, u.email, u.first_name, u.last_name, e.name as event_name, e.id AS event_id, s.start_time, s.end_time
         FROM bookings b
         JOIN users u ON b.user_id = u.id
         JOIN slots s ON b.slot_id = s.id
         JOIN events e ON s.event_id = e.id
         WHERE b.slot_id = $1`,
        [id]
      )

      // Branchement conditionnel au nombre d'inscrits (renversement de
      // l'arbitrage #3 ; spec-conditional-slot-cancellation).
      if (users.rows.length === 0) {
        // 0 inscrit : suppression définitive. Le créneau (typiquement une erreur
        // de saisie) quitte calendrier/liste/base — rien à auditer, personne à
        // notifier. Sûr car users.rows.length === 0 : aucune réservation à ce
        // stade, donc le ON DELETE CASCADE de `bookings.slot_id` ne supprime rien
        // (on ne hard-delete JAMAIS un créneau réservé).
        await client.query(`DELETE FROM slots WHERE id = $1`, [id])
        return []
      }

      // ≥1 inscrit : soft-delete. On horodate l'annulation ; les bookings sont
      // préservés (pas de cascade), ce qui alimente le filtrage « inscrit voit son
      // créneau annulé » et la notification post-commit.
      await client.query(
        `UPDATE slots SET cancelled_at = NOW(), cancellation_reason = $2 WHERE id = $1`,
        [id, cancellationReason ?? null]
      )

      return users.rows
    })

    // Emails envoyés APRÈS le commit, par le seul gagnant du verrou, afin de
    // refléter l'état validé et de fermer le décalage SELECT/DELETE.
    const emailResults = await Promise.allSettled(
      usersToNotify.map(async (user) => {
        const startTime = user.start_time
        const endTime = user.end_time

        const sent = await sendSlotCancellationEmail({
          userEmail: user.email,
          userFirstName: user.first_name,
          userLastName: user.last_name,
          eventName: user.event_name,
          eventId: user.event_id,
          slotDate: formatSlotEmailDate(startTime, endTime),
          slotTime: formatSlotEmailTime(startTime, endTime),
          cancellationReason,
        })

        // Marqueur durable de notification (spec-cancellation-notification-
        // reliability) : on n'horodate QUE les envois réussis. Le garde
        // `AND cancellation_notified_at IS NULL` rend le marquage idempotent.
        // Un échec du marquage est journalisé mais ne fait PAS basculer un
        // envoi réussi en « échec » — le pire cas est un email en double au
        // renvoi (sur-notifier > sous-notifier), jamais une perte silencieuse.
        if (sent && user.booking_id) {
          try {
            await query(
              `UPDATE bookings SET cancellation_notified_at = NOW()
               WHERE id = $1 AND cancellation_notified_at IS NULL`,
              [user.booking_id]
            )
          } catch (markErr) {
            console.error(
              `[Slot Cancellation] Échec du marquage cancellation_notified_at pour la réservation ${user.booking_id}:`,
              markErr
            )
          }
        }

        return sent
      })
    )

    // Comptabiliser à la fois les retours `false` et les promesses rejetées
    // (exception non capturée hors du contrat interne de sendSlotCancellationEmail).
    const failedEmails = emailResults
      .map((result, index) => ({ result, user: usersToNotify[index] }))
      .filter(({ result }) =>
        (result.status === 'fulfilled' && result.value === false) ||
        result.status === 'rejected'
      )

    if (failedEmails.length > 0) {
      console.warn(`[Slot Cancellation] ${failedEmails.length} email(s) de notification ont échoué pour le créneau ${id}:`, {
        failedUsers: failedEmails.map(({ user }) => ({ email: user.email, name: formatFullName(user.first_name ?? '', user.last_name) })),
        rejections: failedEmails
          .filter(({ result }) => result.status === 'rejected')
          .map(({ result }) => (result as PromiseRejectedResult).reason),
      })
    }

    // usersToNotify est vide pour un hard-delete (0 inscrit) → hadReservations
    // false, aucune notification. Sinon, on remonte le décompte succès/échec pour
    // que le client puisse alerter l'admin si une notification n'a pas pu partir.
    const failed = failedEmails.length
    return {
      cancelled: true,
      hadReservations: usersToNotify.length > 0,
      notified: usersToNotify.length - failed,
      failed,
    }
  },
}
