import { Request, Response } from 'express'
import { slotService } from '../services/slot.service'
import { NotFoundError } from '../errors/NotFoundError'
import { eventUsersService } from '../services/eventUsers.service'
import { query, getClient } from '../db'
import { VOLUNTEERS_AGG_FRAGMENT } from '../utils/slotSql'

/**
 * Contrôleur pour les routes publiques de slots
 * Ces routes sont utilisées par les utilisateurs connectés pour réserver des créneaux
 */

/**
 * Récupérer les créneaux d'un événement public par UUID
 * GET /api/public/events/:uuid/slots
 *
 * Vérifications :
 * - L'événement doit être publié (404 sinon)
 * - Si authentifié avec rôle admin: accès autorisé (bypass event_users) - Story 11.5
 * - Si authentifié sans rôle admin: vérifier que l'utilisateur est dans event_users (403 sinon)
 * - Si non authentifié: retourne les slots mais mode lecture seule
 *
 * Chaque slot inclut :
 * - currentBookings: nombre de réservations actuelles
 * - availablePlaces: places restantes (capacity - currentBookings)
 */
export const getPublicEventSlots = async (req: Request, res: Response): Promise<void> => {
  // Déclarer uuid à l'extérieur du try pour être accessible dans le catch
  const { uuid } = req.params
  const userId = req.user?.userId

  try {
    // Le service applique le filtrage soft-delete + l'exception is_published :
    // créneaux actifs si l'événement est publié, + les créneaux annulés réservés
    // par l'utilisateur courant quelle que soit la publication (décision #8).
    const slots = await slotService.getPublicSlotsByEventUuid(uuid, userId)

    // Si authentifié, vérifier l'autorisation
    if (userId) {
      // Existence de l'événement, indépendamment de la publication : un inscrit
      // doit pouvoir consulter ses créneaux annulés même si l'événement est
      // repassé en brouillon (canal de secours décision #8). Les créneaux actifs
      // d'un brouillon ne fuitent pas — ils sont filtrés côté SQL.
      const eventResult = await query(
        'SELECT id FROM events WHERE id = $1',
        [uuid]
      )

      if (eventResult.rows.length === 0) {
        res.status(404).json({ error: 'Événement non trouvé' })
        return
      }

      // Story 11.5: Admin bypass l'autorisation event_users
      const userRole = req.user?.role
      if (userRole === 'admin') {
        res.json({ data: slots })
        return
      }

      const eventId = eventResult.rows[0].id
      const isAuthorized = await eventUsersService.isUserAuthorizedForEvent(eventId, userId)

      if (!isAuthorized) {
        res.status(403).json({ error: "Vous n'êtes pas autorisé à accéder à cet événement" })
        return
      }
    }

    // Retourner les slots avec le statut de disponibilité
    res.json({ data: slots })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }

    // Story 8.3: Enhanced logging for polling error monitoring
    // Identify error patterns: TIMEOUT, NETWORK, SERVER
    const errorType = (error as any).code === 'ECONNREFUSED' ? 'NETWORK' :
                     (error as any).code === 'ETIMEDOUT' ? 'TIMEOUT' :
                     (error as any).code === 'ECONNRESET' ? 'NETWORK_RESET' : 'SERVER'

    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[POLLING-ERROR][${errorType}] Failed to fetch slots for event ${uuid}: ${errorMessage}`)

    res.status(500).json({ error: 'Erreur lors de la récupération des créneaux' })
  }
}

export const getSlots = async (req: Request, res: Response) => {
  const { eventId } = req.query
  // requireAuth garantit la présence de req.user sur cette route.
  const userId = req.user?.userId

  // Validation: eventId est requis pour éviter d'exposer tous les slots de tous les événements
  if (!eventId || typeof eventId !== 'string') {
    res.status(400).json({ error: 'eventId parameter is required' })
    return
  }

  try {
    // Filtrage soft-delete 'forCurrentUser' (F2/F7) : l'inscrit voit ses propres
    // créneaux annulés (réservés), sans borne temporelle ; les annulés d'autrui
    // sont masqués.
    const result = await query(`
      SELECT s.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id)::int as current_bookings,
      ${VOLUNTEERS_AGG_FRAGMENT}
      FROM slots s
      WHERE s.event_id = $1
        AND (s.cancelled_at IS NULL
             OR EXISTS (SELECT 1 FROM bookings b4 WHERE b4.slot_id = s.id AND b4.user_id = $2))
      ORDER BY s.start_time ASC
    `, [eventId, userId ?? null])
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const bookSlot = async (req: Request, res: Response): Promise<void> => {
  const { slotId } = req.body
  // @ts-ignore - req.user.userId is added by requireAuth middleware but not defined in Express Request type
  const userId = req.user?.userId

  if (!slotId || !userId) {
    res.status(400).json({ error: 'Missing slotId or User not authenticated' })
    return
  }

  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Lock the slot row to prevent race conditions
    const slotResult = await client.query('SELECT * FROM slots WHERE id = $1 FOR UPDATE', [slotId])

    if (slotResult.rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Slot not found' })
      return
    }

    const slot = slotResult.rows[0]

    // Garde-fou soft-delete (F6) : refuser la réservation d'un créneau annulé.
    // La vérification est dans la même transaction que le verrou `FOR UPDATE`,
    // ce qui ferme la race « inscription à T0 / annulation à T0.001 » : si une
    // annulation concurrente a commité avant nous, ce re-read voit cancelled_at
    // renseigné et refuse ; sinon notre verrou la fait patienter.
    if (slot.cancelled_at !== null) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Ce créneau a été annulé. Les inscriptions ne sont plus possibles.' })
      return
    }

    // Check if the slot has already ended
    if (new Date(slot.end_time) < new Date()) {
      await client.query('ROLLBACK')
      res.status(400).json({ error: 'Ce créneau est passé. Les inscriptions ne sont plus possibles.' })
      return
    }

    // Check current bookings count
    const bookingCountResult = await client.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [slotId])
    const currentCount = parseInt(bookingCountResult.rows[0].count)

    if (currentCount >= slot.capacity) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Le créneau vient d\'être pris. Veuillez choisir un autre créneau.' })
      return
    }

    // Check if user already booked this slot (Double booking prevention)
    // Unique constraint in DB will also catch this, but cleaner to check/handle gracefully.
    const userBooking = await client.query('SELECT 1 FROM bookings WHERE slot_id = $1 AND user_id = $2', [slotId, userId])
    if (userBooking.rowCount && userBooking.rowCount > 0) {
      await client.query('ROLLBACK')
      res.status(400).json({ error: 'You have already booked this slot.' })
      return
    }

    // Insert booking
    await client.query('INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)', [userId, slotId])

    await client.query('COMMIT')

    // TODO: Send confirmation email async (don't fail request if email fails)
    // sendConfirmationEmail(...)

    res.json({ message: 'Booking successful' })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Booking transaction error:', err)
    res.status(500).json({ error: 'Booking failed due to server error' })
  } finally {
    client.release()
  }
}

export const cancelBooking = async (req: Request, res: Response): Promise<void> => {
  const { slotId } = req.params
  // @ts-ignore - req.user.userId is added by requireAuth middleware but not defined in Express Request type
  const userId = req.user?.userId

  if (!slotId || !userId) {
    res.status(400).json({ error: 'Missing params' })
    return
  }

  try {
    // Check if the slot has already ended
    const slotResult = await query('SELECT end_time FROM slots WHERE id = $1', [slotId])
    if (slotResult.rows.length > 0 && new Date(slotResult.rows[0].end_time) < new Date()) {
      res.status(400).json({ error: 'Ce créneau est passé. Les annulations ne sont plus possibles.' })
      return
    }

    await query('DELETE FROM bookings WHERE slot_id = $1 AND user_id = $2', [slotId, userId])
    res.json({ message: 'Booking cancelled' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Cancellation failed' })
  }
}
