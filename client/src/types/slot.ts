import type { Slot, Volunteer } from '@timepick/shared'

// Slot + Volunteer : forme wire unifiée (source unique @timepick/shared).
// Historiquement définis ici puis dupliqués côté serveur. À présent importés
// depuis @timepick/shared et ré-exportés pour préserver les importateurs
// (`import { …, type Slot } from '@/types/slot'`). Les helpers runtime, les
// props UI et le type AvailabilityStatus restent locaux (G3).
export type { Slot, Volunteer }

/**
 * Un créneau est annulé (soft-delete) si cancelledAt est renseigné.
 * Centralise la convention pour éviter la dispersion des `!= null` dans l'UI.
 */
export function isSlotCancelled(slot: Pick<Slot, 'cancelledAt'>): boolean {
  return slot.cancelledAt != null
}

/**
 * Statut de disponibilité d'un créneau
 */
export type AvailabilityStatus = 'available' | 'partial' | 'full'

/**
 * Helper pour calculer le statut de disponibilité
 * @param slot - Le créneau à évaluer
 * @returns Le statut de disponibilité
 *
 * currentBookings est optionnel sur la forme wire (absent des réponses POST
 * create / PUT update) → guard `?? 0` pour éviter NaN.
 */
export function getAvailabilityStatus(slot: Slot): AvailabilityStatus {
  const bookings = slot.currentBookings ?? 0
  if (bookings >= slot.capacity) return 'full'
  if (bookings > 0) return 'partial'
  return 'available'
}

/**
 * Helper pour obtenir le nombre de places disponibles
 * Utilise la valeur availablePlaces si fournie, sinon calcule
 *
 * currentBookings optionnel (voir getAvailabilityStatus) → guard `?? 0`.
 */
export function getAvailablePlaces(slot: Slot): number {
  if (slot.availablePlaces !== undefined) return slot.availablePlaces
  return Math.max(0, slot.capacity - (slot.currentBookings ?? 0))
}

/**
 * Props pour le composant SlotCard
 */
export interface SlotCardProps {
  slot: Slot
  onSelect?: (slotId: string) => void
  disabled?: boolean
  hasBooked?: boolean // Story 6.7 - Indique si l'utilisateur a réservé ce créneau
  variant?: 'calendar' | 'list' // Variant pour différents styles d'affichage
}

/**
 * Props pour le composant SlotDetailDialog
 */
export interface SlotDetailDialogProps {
  slot: Slot | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBook?: (slotId: string) => void
  isBooking?: boolean
  isConsultative?: boolean
  opensAtDate?: string | null
  hasBooked?: boolean
  onCancel?: () => void
  isCancelling?: boolean
}

/**
 * Helper pour vérifier si un créneau est passé
 * Un créneau est considéré comme passé si son heure de fin est avant maintenant.
 * Un créneau qui a commencé mais pas encore terminé reste réservable.
 */
export function isSlotPast(slot: Slot): boolean {
  return new Date(slot.endTime) < new Date()
}
