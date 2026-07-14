/**
 * Contrat wire d'une réservation (shape camelCase — ce que le client reçoit
 * après snakeToCamelMiddleware).
 *
 * Unifié depuis client/src/types/booking.ts et server/src/services/reservation.service.ts.
 * Décisions de contrat wire (G7), lues depuis les endpoints :
 *  • eventName → REQUIS sur les endpoints qui LISTENT des bookings
 *    (getUserReservations mappe `e.name AS event_name` ; admin.controller idem).
 *    EXCEPTION : la réponse de CRÉATION (POST /reservations) retourne un bare-row
 *    INSERT sans eventName/slot/user → type dédié `BookingCreated` (ci-dessous).
 *    `getSlotReservations` (dead code, sans route) omet aussi eventName et garde
 *    un cast `as Booking[]` (mensonge pré-existant, G2 — non corrigé ici).
 *  • slot.cancelledAt / slot.cancellationReason → REQUIS `string | null` à
 *    l'intérieur de `slot`. getUserReservations les SELECT et les mappe
 *    (soft-delete visible côté « Mes réservations »). Absents du type serveur
 *    d'origine (mensonge type pré-existant, masqué par `as Booking[]`).
 *  • user → OPTIONNEL, présent uniquement sur les endpoints admin.
 */
export interface Booking {
  id: string
  slotId: string
  userId: string
  createdAt: string
  // Inclut les détails du créneau quand demandé (getUserReservations)
  slot?: {
    id: string
    startTime: string
    endTime: string
    capacity: number
    eventId: string
    // Soft-delete organisateur : toujours présent quand slot est présent
    cancelledAt: string | null
    cancellationReason: string | null
  }
  // Le nom de l'événement est inclus dans getUserReservations + endpoint admin
  eventName: string
  // Inclut les détails utilisateur pour les admins (endpoint admin uniquement)
  user?: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
  }
}

/**
 * Réponse étroite de POST /api/public/reservations : bare-row
 * `INSERT INTO bookings ... RETURNING *` (id/slotId/userId/createdAt) — SANS
 * eventName, slot, user. La création n'hydrate pas l'événement ; le client
 * rafraîchit la liste (getUserReservations) pour obtenir le Booking complet.
 * Ne pas confondre avec `Booking` (qui exige eventName).
 */
export interface BookingCreated {
  id: string
  slotId: string
  userId: string
  createdAt: string
}
