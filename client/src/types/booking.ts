/**
 * Booking — forme wire unifiée (source unique @timepick/shared).
 *
 * Historiquement défini ici puis dupliqué côté serveur. À présent importé
 * depuis @timepick/shared et ré-exporté pour préserver les importateurs
 * (`import type { Booking } from '@/types/booking'`). Les helpers runtime
 * (isActiveBooking) et le type de requête (CreateReservationInput) restent
 * locaux (G3 : seuls les contrats API entrent dans shared).
 */
import type { Booking, BookingCreated } from '@timepick/shared'

export type { Booking, BookingCreated }

/**
 * Prédicat : une réservation est « active » si son créneau existe ET n'a pas
 * été annulé par l'organisateur (soft-delete `slot.cancelledAt`). Une annulation
 * par le membre supprime le booking côté serveur (il disparaît de la liste),
 * donc seule l'annulation organisateur subsiste ici. Source unique réutilisée
 * par MyReservationsPanel (totaux) et MemberReservationsPopover (badge).
 */
export const isActiveBooking = (booking: Booking): boolean =>
  booking.slot != null && booking.slot.cancelledAt == null

/**
 * Input pour créer une réservation
 */
export interface CreateReservationInput {
  slotId: string
}
