/**
 * Créneau horaire — forme wire (camelCase, shape après snakeToCamelMiddleware).
 *
 * Unifié depuis client/src/types/slot.ts et server/src/services/slot.service.ts.
 * Décisions de contrat wire (G7), lues depuis les endpoints :
 *  • currentBookings → OPTIONNEL. Calculé par un sous-SELECT COUNT dans les GET
 *    (slot.service.ts, slots.public.controller.ts) ; absent des réponses POST
 *    create et PUT update (INSERT/UPDATE RETURNING * ne contient pas de colonne
 *    current_bookings — ce n'est pas une colonne DB).
 *  • cancelledAt / cancellationReason → REQUIS `string | null`. Colonnes DB
 *    (migration 014) toujours retournées par SELECT s.* / RETURNING *, même sur
 *    les writes (null par défaut). Le type client d'origine les déclarait
 *    optionnels (mensonge type pré-existant).
 *  • availablePlaces → OPTIONNEL (calculé sur certains GET publics uniquement).
 *  • volunteers → OPTIONNEL (agrégé via json_agg sur les GET avec
 *    VOLUNTEERS_AGG_FRAGMENT).
 *
 * Helpers runtime (isSlotCancelled, getAvailabilityStatus, getAvailablePlaces,
 * isSlotPast), props UI (SlotCardProps, SlotDetailDialogProps) et le type UI
 * AvailabilityStatus restent côté client (G3) — seuls les contrats API entrent
 * dans shared.
 */
export interface Volunteer {
  id: string
  name: string | null
}

export interface Slot {
  id: string
  eventId: string
  startTime: string
  endTime: string
  capacity: number
  description?: string
  currentBookings?: number
  availablePlaces?: number
  volunteers?: Volunteer[] | null
  cancelledAt: string | null
  cancellationReason: string | null
  createdAt: string
  updatedAt: string
}
