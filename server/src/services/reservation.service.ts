import { getClient, query } from '../db'
import { NotFoundError } from '../errors/NotFoundError'
import { ConflictError } from '../errors/ConflictError'
import { sendReservationEmail, sendUnregistrationEmail } from './email.service'
import { formatSlotEmailDate, formatSlotEmailTime } from '../utils/slotEmailFormat'
import type { Booking, BookingCreated } from '@timepick/shared'

// Booking : forme wire unifiée (source unique @timepick/shared). Historiquement
// défini localement (eventName optionnel, slot sans cancelledAt/cancellationReason).
// Conservé comme ré-export pour préserver les importateurs type existants
// (ex. `import type { Booking } from './reservation.service'`).
export type { Booking }

/**
 * Service de gestion des réservations
 * Gère les opérations CRUD pour les réservations de créneaux
 *
 * CRITICAL: Toutes les opérations d'écriture DOIVENT utiliser SELECT FOR UPDATE
 * pour éviter les race conditions et garantir 0 surbooking
 *
 * =============================================================================
 * PATTERN SELECT FOR UPDATE - GARANTIE 0 SURBOOKING
 * =============================================================================
 *
 * Ce pattern utilise les verrous de ligne PostgreSQL (row-level locks) pour
 * sérialiser les accès concurrents au même créneau.
 *
 * Diagramme de séquence avec 2 utilisateurs tentant de réserver le même créneau:
 *
 *   Transaction A (User 1)          Transaction B (User 2)          État du créneau
 *   =====================          =====================          ==================
 *
 *   BEGIN                                                        capacity: 1, bookings: 0
 *        |
 *   SELECT * FROM slots              BEGIN
 *   WHERE id = 'slot-1'                   |
 *   FOR UPDATE                       SELECT * FROM slots
 *   [VERROU POSÉ] ✓                    WHERE id = 'slot-1'
 *        |                            FOR UPDATE
 *   COUNT bookings = 0                    |
 *   [capacity > bookings] ✓         [ATTEND VERROU] ⏳
 *        |                                |
 *   INSERT INTO bookings                 |
 *   [COMMIT]                              |
 *        |                            [VERROU OBTENU] ✓
 *   [VERROU LIBÉRÉ]                     COUNT bookings = 1
 *        |                            [capacity = bookings] ✗
 *        |                            ROLLBACK
 *        |                                 |
 *        |                            ERROR 409: SLOT_FULL
 *
 * =============================================================================
 * PROPRIÉTÉS CLÉS:
 * =============================================================================
 * 1. Le verrou est au niveau ligne (row-level lock) - ne bloque pas les autres créneaux
 * 2. Les lectures concurrentes sont sérialisées - B attend que A termine
 * 3. La vérification capacity est atomique - pas de lecture périmée
 * 4. En cas de ROLLBACK, le verrou est automatiquement libéré
 *
 * DOUBLE PROTECTION:
 * - SELECT FOR UPDATE empêche le surbooking entre transactions concurrentes
 * - CONSTRAINT unique_booking (slot_id, user_id) empêche la double réservation
 *   (l'erreur PostgreSQL 23505 est convertie en ConflictError avec code ALREADY_BOOKED)
 */
export const reservationService = {
  /**
   * Créer une nouvelle réservation
   *
   * Transaction avec SELECT FOR UPDATE pour garantir 0 surbooking:
   * 1. Verrouiller le créneau (SELECT FOR UPDATE)
   * 2. Vérifier que le créneau existe
   * 3. Vérifier la capacité (current_bookings < capacity)
   * 4. Créer la réservation (la contrainte UNIQUE empêche les doublons au niveau DB)
   * 5. Envoyer email de confirmation (async, ne bloque pas la réponse)
   *
   * Note: La vérification de double réservation est gérée par la contrainte unique_booking
   * au niveau de la base de données. L'erreur PostgreSQL (code 23505) est convertie
   * en ConflictError avec le code ALREADY_BOOKED dans le bloc catch.
   *
   * @param slotId - UUID du créneau
   * @param userId - UUID de l'utilisateur
   * @returns La réservation créée
   * @throws NotFoundError si le créneau n'existe pas
   * @throws ConflictError si le créneau est complet (SLOT_FULL)
   * @throws ConflictError si l'utilisateur a déjà réservé (ALREADY_BOOKED)
   */
  async createReservation(slotId: string, userId: string): Promise<BookingCreated> {
    const client = await getClient()

    try {
      await client.query('BEGIN')

      // Verrouiller le créneau pour éviter les race conditions (CRITICAL)
      const slotResult = await client.query(
        'SELECT * FROM slots WHERE id = $1 FOR UPDATE',
        [slotId]
      )

      if (slotResult.rows.length === 0) {
        await client.query('ROLLBACK')
        throw new NotFoundError('Créneau non trouvé')
      }

      const slot = slotResult.rows[0]

      // Vérifier si le créneau est passé
      if (new Date(slot.end_time) < new Date()) {
        await client.query('ROLLBACK')
        throw new ConflictError('Ce créneau est passé. Les inscriptions ne sont plus possibles.', 'SLOT_PAST')
      }

      // Vérifier la capacité
      const bookingCountResult = await client.query(
        'SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1',
        [slotId]
      )

      const currentBookings = parseInt(bookingCountResult.rows[0].count)
      if (currentBookings >= slot.capacity) {
        await client.query('ROLLBACK')
        throw new ConflictError(
          'Désolé, ce créneau vient d\'être pris. Choisissez un autre créneau.',
          'SLOT_FULL'
        )
      }

      // Créer la réservation (la contrainte UNIQUE (slot_id, user_id) empêche les doublons)
      const result = await client.query(
        'INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2) RETURNING *',
        [slotId, userId]
      )

      await client.query('COMMIT')

      const booking = result.rows[0] as BookingCreated

      // Envoyer l'email de confirmation de manière asynchrone (ne bloque pas la réponse)
      this.sendConfirmationEmailAsync(booking.id, slot, userId).catch((error) => {
        console.error('[Reservation] Failed to send confirmation email:', {
          bookingId: booking.id,
          userId,
          slotId,
          error: error instanceof Error ? error.message : error,
        })
      })

      return booking

    } catch (error) {
      await client.query('ROLLBACK')
      // Si c'est déjà une erreur personnalisée, la renvoyer telle quelle
      if (error instanceof NotFoundError || error instanceof ConflictError) {
        throw error
      }

      // Gérer les erreurs PostgreSQL et les convertir en erreurs applicatives
      const postgresError = error as { code?: string; constraint?: string; detail?: string }
      if (postgresError.code === '23505') { // unique_violation
        // La contrainte unique_booking (slot_id, user_id) a été violée
        if (postgresError.constraint === 'unique_booking' || postgresError.constraint === 'unique_user_slot_booking') {
          throw new ConflictError(
            'Vous avez déjà réservé ce créneau.',
            'ALREADY_BOOKED'
          )
        }
      }

      // Sinon, envelopper dans une erreur générique
      console.error('[Reservation] Error creating reservation:', error)
      throw new Error('Erreur lors de la création de la réservation')
    } finally {
      client.release()
    }
  },

  /**
   * Désinscription volontaire d'une réservation
   *
   * Envoie un email de confirmation de désinscription de manière asynchrone.
   *
   * @param bookingId - UUID de la réservation
   * @param userId - UUID de l'utilisateur (pour vérification)
   * @returns true si désinscription effectuée
   * @throws NotFoundError si la réservation n'existe pas ou n'appartient pas à l'utilisateur
   */
  async cancelReservation(bookingId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM bookings
       WHERE id = $1 AND user_id = $2
       RETURNING id, slot_id`,
      [bookingId, userId]
    )

    if (result.rows.length === 0) {
      throw new NotFoundError('Réservation non trouvée')
    }

    const deletedBooking = result.rows[0]

    // Envoyer l'email de confirmation de désinscription de manière asynchrone (ne bloque pas la réponse)
    this.sendUnregistrationEmailAsync(deletedBooking.slot_id, userId).catch((error) => {
      console.error('[Reservation] Failed to send unregistration email:', {
        bookingId,
        userId,
        slotId: deletedBooking.slot_id,
        error: error instanceof Error ? error.message : error,
      })
    })

    return true
  },

  /**
   * Désinscription volontaire par slot_id et user_id
   * Méthode alternative utilisée pour se désinscrire d'un créneau spécifique
   *
   * Envoie un email de confirmation de désinscription de manière asynchrone.
   *
   * @param slotId - UUID du créneau
   * @param userId - UUID de l'utilisateur
   * @returns true si désinscription effectuée
   */
  async cancelReservationBySlot(slotId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM bookings
       WHERE slot_id = $1 AND user_id = $2
       RETURNING id`,
      [slotId, userId]
    )

    const wasDeleted = result.rows.length > 0

    // Envoyer l'email de confirmation de désinscription de manière asynchrone si une réservation a été supprimée
    if (wasDeleted) {
      this.sendUnregistrationEmailAsync(slotId, userId).catch((error) => {
        console.error('[Reservation] Failed to send unregistration email:', {
          slotId,
          userId,
          error: error instanceof Error ? error.message : error,
        })
      })
    }

    return wasDeleted
  },

  /**
   * Récupérer les réservations d'un utilisateur
   *
   * @param userId - UUID de l'utilisateur
   * @returns Liste des réservations avec détails du créneau
   */
  async getUserReservations(userId: string): Promise<Booking[]> {
    const result = await query(
      `SELECT b.id,
              b.slot_id,
              b.user_id,
              b.created_at,
              s.start_time,
              s.end_time,
              s.capacity,
              s.event_id,
              s.cancelled_at,
              s.cancellation_reason,
              e.name as event_name
       FROM bookings b
       JOIN slots s ON b.slot_id = s.id
       JOIN events e ON s.event_id = e.id
       WHERE b.user_id = $1
       ORDER BY s.start_time ASC`,
      [userId]
    )

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      slotId: row.slot_id,
      userId: row.user_id,
      createdAt: row.created_at,
      slot: {
        id: row.slot_id,
        startTime: row.start_time,
        endTime: row.end_time,
        capacity: row.capacity,
        eventId: row.event_id,
        // Soft-delete : permet à « Mes réservations » de refléter une annulation
        cancelledAt: row.cancelled_at,
        cancellationReason: row.cancellation_reason,
      },
      eventName: row.event_name,
    })) as Booking[]
  },

  /**
   * Récupérer les réservations pour un créneau
   *
   * @param slotId - UUID du créneau
   * @returns Liste des réservations avec détails utilisateur
   */
  async getSlotReservations(slotId: string): Promise<Booking[]> {
    const result = await query(
      `SELECT b.id,
              b.slot_id,
              b.user_id,
              b.created_at,
              u.first_name,
              u.last_name,
              u.email
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.slot_id = $1
       ORDER BY b.created_at ASC`,
      [slotId]
    )

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      slotId: row.slot_id,
      userId: row.user_id,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
      },
    })) as Booking[]
  },

  /**
   * Vérifier si un utilisateur a réservé un créneau
   *
   * @param slotId - UUID du créneau
   * @param userId - UUID de l'utilisateur
   * @returns true si l'utilisateur a réservé ce créneau
   */
  async hasUserBookedSlot(slotId: string, userId: string): Promise<boolean> {
    const result = await query(
      'SELECT 1 FROM bookings WHERE slot_id = $1 AND user_id = $2',
      [slotId, userId]
    )
    return (result.rows.length > 0)
  },

  /**
   * Envoyer l'email de confirmation de manière asynchrone
   * Ne bloque pas la réponse HTTP
   *
   * @param bookingId - L'ID de la réservation créée (pour le log ; évite de lire un champ camelCase sur la row brute)
   * @param slot - Le créneau réservé
   * @param userId - L'ID de l'utilisateur (source fiable ; le middleware snakeToCamel ne s'applique qu'à la réponse HTTP)
   */
  async sendConfirmationEmailAsync(
    bookingId: string,
    slot: Record<string, unknown>,
    userId: string
  ): Promise<void> {
    try {
      // Récupérer les détails utilisateur et événement
      const userDetails = await query<{ first_name: string | null; last_name: string | null; email: string; event_name: string }>(
        `SELECT u.first_name, u.last_name, u.email, e.name as event_name
         FROM users u
         CROSS JOIN events e
         WHERE u.id = $1
         AND e.id = $2`,
        [userId, slot.event_id]
      )

      if (userDetails.rows.length === 0) {
        console.warn('[Reservation] User or event not found for confirmation email', { userId, eventId: slot.event_id })
        return
      }

      const user = userDetails.rows[0]
      const startTime = new Date(slot.start_time as string)
      const endTime = new Date(slot.end_time as string)

      await sendReservationEmail({
        userEmail: user.email,
        userFirstName: user.first_name,
        userLastName: user.last_name,
        eventId: slot.event_id as string,
        eventName: user.event_name,
        slotDate: formatSlotEmailDate(startTime, endTime),
        slotTime: formatSlotEmailTime(startTime, endTime),
      })

      console.log('[Reservation] Confirmation email sent for booking:', bookingId)
    } catch (error) {
      // Logger l'erreur mais ne pas lancer d'exception (email non-blocking)
      console.error('[Reservation] Error sending confirmation email:', error)
    }
  },

  /**
   * Envoyer l'email de confirmation de désinscription de manière asynchrone
   * Ne bloque pas la réponse HTTP
   *
   * @param slotId - L'ID du créneau dont l'utilisateur s'est désinscrit
   * @param userId - L'ID de l'utilisateur qui s'est désinscrit
   */
  async sendUnregistrationEmailAsync(slotId: string, userId: string): Promise<void> {
    try {
      // Récupérer les détails utilisateur, créneau et événement
      const details = await query<{ first_name: string | null; last_name: string | null; email: string; event_name: string; event_id: string; start_time: Date; end_time: Date }>(
        `SELECT u.first_name, u.last_name, u.email, e.name as event_name,
                e.id as event_id, s.start_time, s.end_time
         FROM users u
         JOIN slots s ON s.id = $1
         JOIN events e ON e.id = s.event_id
         WHERE u.id = $2`,
        [slotId, userId]
      )

      if (details.rows.length === 0) {
        console.warn('[Reservation] User, slot or event not found for unregistration email')
        return
      }

      const data = details.rows[0]
      const startTime = data.start_time
      const endTime = data.end_time

      await sendUnregistrationEmail({
        userEmail: data.email,
        userFirstName: data.first_name,
        userLastName: data.last_name,
        eventName: data.event_name,
        eventId: data.event_id,
        slotDate: formatSlotEmailDate(startTime, endTime),
        slotTime: formatSlotEmailTime(startTime, endTime),
      })

      console.log('[Reservation] Unregistration email sent for slot:', slotId, 'user:', userId)
    } catch (error) {
      // Logger l'erreur mais ne pas lancer d'exception (email non-blocking)
      console.error('[Reservation] Error sending unregistration email:', error)
    }
  },
}
