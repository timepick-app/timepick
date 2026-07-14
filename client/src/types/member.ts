/**
 * MemberEvent — événement exposé au membre via `GET /api/me/events`.
 *
 * Miroir camelCase du type serveur (`server/src/services/me.service.ts`,
 * `MemberEvent`). `startDate`/`endDate` sont des chaînes ISO 8601 (ou `null`
 * si l'événement n'a aucun créneau actif). `myBookingCount` exclut les
 * réservations portant sur des créneaux annulés ; `isUpcoming` est vrai tant
 * qu'au moins un créneau actif se termine dans le futur.
 *
 * Ne pas réutiliser le type `Event` admin — la sidebar membre n'a pas besoin
 * de ses champs (D14). Aucun `any`.
 */
export interface MemberEvent {
  uuid: string
  name: string
  startDate: string | null
  endDate: string | null
  myBookingCount: number
  isUpcoming: boolean
}

/**
 * MySlotBooking — créneau réservé par le membre, exposé via `GET /api/me/slots`.
 *
 * Miroir camelCase du type serveur (`server/src/services/me.service.ts`,
 * `MySlotBooking`). `status:'cancelled'` signifie que la réservation a été
 * annulée ; le créneau reste visible dans la liste `upcoming` pour information.
 * Aucun `any`.
 */
interface MySlotBooking {
  slotUuid: string
  eventUuid: string
  eventName: string
  startTime: string
  endTime: string
  status: 'active' | 'cancelled'
}

/**
 * MyAvailableSlot — créneau libre disponible à la réservation, exposé via
 * `GET /api/me/available-slots`. Limité à 10 résultats max, triés par
 * `startTime ASC`, uniquement dans des événements publiés rattachés au membre
 * et non encore réservés par lui.
 */
export interface MyAvailableSlot {
  slotUuid: string
  eventUuid: string
  eventName: string
  startTime: string
  endTime: string
  availableSpots: number
}

/**
 * MySlotsResponse — enveloppe de réponse `GET /api/me/slots` (après unwrap
 * `data.data`). `upcoming` : tous les créneaux futurs (annulés inclus), triés
 * ASC. `past` : 20 derniers créneaux passés, triés DESC. `nextCursor` : ISO du
 * dernier créneau passé renvoyé si la page est pleine (20), sinon `null`.
 * `totalRealizedHours` : somme des durées des créneaux passés ACTIFS uniquement,
 * arrondie à 1 décimale.
 */
export interface MySlotsResponse {
  upcoming: MySlotBooking[]
  past: MySlotBooking[]
  nextCursor: string | null
  totalRealizedHours: number
}
