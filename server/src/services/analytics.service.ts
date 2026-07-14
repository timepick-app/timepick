import { query } from '../db'
import { UNANSWERED_OVER_3_DAYS } from './invitations.service'

export interface EngagementStats {
  invited: number
  sent: number
  clicked: number
  booked: number
  unansweredOver3Days: number
}

export interface EventActivity {
  eventId: string
  lastSentAt: string | null
  lastBookingAt: string | null
  unansweredOver3Days: number
}

export interface BookingTimestamps {
  name: string
  opensAt: string | null // events.opens_at en ISO (ou null)
  createdAt: string // events.created_at en ISO (ancre de début d'extent)
  endDate: string | null // events.end_date en ISO (ou null, ancre de fin d'extent)
  timestamps: number[] // epoch ms de chaque bookings.created_at, triés ascendant
  totalCapacity: number // SUM(slots.capacity) des créneaux actifs — total réservable proposé
}

export const analyticsService = {
  /**
   * Dernière activité par événement : date du dernier envoi d'invitation et de la
   * dernière réservation. Ne liste que les événements ayant ≥ 1 envoi ou ≥ 1 réservation.
   * Clés camelCase explicites (indépendant de snakeToCamelMiddleware) ; `pg` renvoie des
   * `Date` → `.toISOString()`. `resolveChartEvent` (client) tolère un eventId absent.
   */
  async getEventActivity(): Promise<EventActivity[]> {
    const [bookings, sends, unanswered] = await Promise.all([
      query(`SELECT s.event_id, MAX(b.created_at) AS last_booking_at
               FROM bookings b JOIN slots s ON s.id = b.slot_id GROUP BY s.event_id`),
      query(`SELECT event_id, MAX(sent_at) AS last_sent_at FROM invitations WHERE sent_at IS NOT NULL GROUP BY event_id`),
      // Prédicat partagé UNANSWERED_OVER_3_DAYS (== cible relance) : invitations envoyées
      // non cliquées >3j, restreintes aux membres encore sélectionnés (event_users) et à
      // un événement non terminé (events."end"). La table invitations reste NON aliasée
      // pour que les colonnes du prédicat résolvent sans préfixe.
      query(`SELECT invitations.event_id, COUNT(*)::int AS n
               FROM invitations
               JOIN event_users eu ON eu.event_id = invitations.event_id AND eu.user_id = invitations.user_id
               JOIN events e ON e.id = invitations.event_id
               WHERE ${UNANSWERED_OVER_3_DAYS}
                 AND (e."end" IS NULL OR e."end" >= NOW())
               GROUP BY invitations.event_id`),
    ])
    const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
    const map = new Map<string, EventActivity>()
    for (const r of bookings.rows)
      map.set(r.event_id, { eventId: r.event_id, lastSentAt: null, lastBookingAt: iso(r.last_booking_at), unansweredOver3Days: 0 })
    for (const r of sends.rows) {
      const cur = map.get(r.event_id) ?? { eventId: r.event_id, lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 0 }
      cur.lastSentAt = iso(r.last_sent_at)
      map.set(r.event_id, cur)
    }
    // Un événement avec des non-répondants mais ni booking ni envoi (improbable mais possible)
    // doit tout de même apparaître avec son compte — d'où la branche `??` ci-dessous.
    for (const r of unanswered.rows) {
      const cur = map.get(r.event_id) ?? { eventId: r.event_id, lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 0 }
      cur.unansweredOver3Days = r.n
      map.set(r.event_id, cur)
    }
    return [...map.values()]
  },

  /**
   * Agrégats d'engagement pour un événement (ou tous) :
   * invited = membres ayant accès ; sent = invitations dispatchées ;
   * clicked = invitations cliquées ; booked = membres distincts ayant réservé ;
   * unansweredOver3Days = invitations envoyées non cliquées depuis plus de 3 jours.
   */
  async getEngagement(eventId?: string): Promise<EngagementStats> {
    const filter = eventId ? 'WHERE event_id = $1' : ''
    const bookingFilter = eventId ? 'WHERE s.event_id = $1' : ''
    const params = eventId ? [eventId] : []

    const [invited, inv, booked] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM event_users ${filter}`, params),
      // Source de vérité unique : `clicked_at IS NOT NULL` (monotone — jamais réinitialisé).
      // `status` reste 'sent'/'failed' après un clic. Pour préserver l'invariant `clicked ⊆ sent`
      // (le clic peut survenir sur une ligne 'failed', ex. faux-négatif SMTP), `sent` inclut toute
      // ligne cliquée : ratio clicked/sent ≤ 1 garanti.
      query(
        `SELECT
           COUNT(*) FILTER (WHERE clicked_at IS NOT NULL OR status IN ('sent','clicked'))::int AS sent,
           COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked,
           COUNT(*) FILTER (WHERE ${UNANSWERED_OVER_3_DAYS}
                            AND EXISTS (SELECT 1 FROM event_users eu WHERE eu.event_id = invitations.event_id AND eu.user_id = invitations.user_id)
                            AND EXISTS (SELECT 1 FROM events e WHERE e.id = invitations.event_id AND (e."end" IS NULL OR e."end" >= NOW())))::int AS unanswered
         FROM invitations ${filter}`,
        params,
      ),
      query(
        `SELECT COUNT(DISTINCT b.user_id)::int AS n
           FROM bookings b JOIN slots s ON s.id = b.slot_id ${bookingFilter}`,
        params,
      ),
    ])

    return {
      invited: invited.rows[0].n,
      sent: inv.rows[0].sent,
      clicked: inv.rows[0].clicked,
      booked: booked.rows[0].n,
      unansweredOver3Days: inv.rows[0].unanswered,
    }
  },

  /**
   * Horodatages bruts des réservations d'un événement : epoch ms de chaque
   * `bookings.created_at` (triés ascendant), accompagnés du nom et de la date
   * d'ouverture des inscriptions (events.opens_at). Sert au graphique POC de pics
   * d'inscription : le bucketing/granularité se fait côté client (cf. lib/peaks.ts),
   * sans dépendre du fuseau de session SQL.
   *
   * Pas de filtre cancelled_at (on compte toutes les réservations).
   */
  async getBookingTimestamps(eventId: string): Promise<BookingTimestamps> {
    const event = await query(
      `SELECT name, opens_at, created_at,
              (SELECT MAX(s.end_time) FROM slots s WHERE s.event_id = $1) AS last_slot_end,
              (SELECT COALESCE(SUM(s.capacity), 0) FROM slots s
                 WHERE s.event_id = $1) AS total_capacity
         FROM events WHERE id = $1`,
      [eventId],
    )
    if (event.rows.length === 0) {
      return { name: '', opensAt: null, createdAt: '', endDate: null, totalCapacity: 0, timestamps: [] }
    }
    const e = event.rows[0] as {
      name: string
      opens_at: Date | null
      created_at: Date
      last_slot_end: Date | null
      total_capacity: number | string
    }
    const bookings = await query(
      `SELECT b.created_at
         FROM bookings b JOIN slots s ON s.id = b.slot_id
        WHERE s.event_id = $1
        ORDER BY b.created_at ASC`,
      [eventId],
    )
    const timestamps = bookings.rows.map(
      (r: { created_at: Date }) => new Date(r.created_at).getTime(),
    )
    return {
      name: e.name,
      opensAt: e.opens_at ? new Date(e.opens_at).toISOString() : null,
      createdAt: new Date(e.created_at).toISOString(),
      endDate: e.last_slot_end ? new Date(e.last_slot_end).toISOString() : null,
      timestamps,
      totalCapacity: Number(e.total_capacity),
    }
  }
}
