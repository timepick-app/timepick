export interface EventActivity {
  eventId: string
  lastSentAt: string | null
  lastBookingAt: string | null
  /** Invitations envoyées sans clic et en retard de plus de 3 jours (par événement). */
  unansweredOver3Days: number
}

export interface EngagementStats {
  invited: number
  sent: number
  clicked: number
  booked: number
  unansweredOver3Days: number
}

export interface BookingTimestamps {
  name: string
  opensAt: string | null
  /** events.created_at ISO — ancrage gauche de l'extent (repli opensAt). */
  createdAt: string
  /** events.end_date ISO ou null — ancrage droit de l'extent. */
  endDate: string | null
  /** epoch ms de chaque bookings.created_at, trié ascendant. */
  timestamps: number[]
  /** SUM(slots.capacity) des créneaux actifs — total réservable proposé (réf. vue cumulative). */
  totalCapacity: number
}
