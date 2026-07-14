import type { Slot } from '@/types/slot'
import { isSlotCancelled } from '@/types/slot'
import { isSlotPast } from '@/lib/utils'

/**
 * Retourne la date d'ouverture du calendrier des créneaux : le créneau le plus
 * ancien parmi les créneaux À VENIR et NON ANNULÉS (la disponibilité n'entre pas
 * dans le critère — un créneau futur complet reste un candidat valide).
 *
 * « À venir » s'appuie sur `isSlotPast` (lib/utils, basé sur l'heure de début) :
 * un créneau dont le début est dépassé est exclu. Voir deferred-work.md
 * (post-slot-calendar-initial-date-defer-A) pour la coexistence des deux
 * `isSlotPast` (début vs fin) et le choix volontaire de la version « début ».
 *
 * @param slots - Liste brute des créneaux (non garantie triée).
 * @returns la date du créneau cible, ou `undefined` si aucun candidat
 *          (FullCalendar retombe alors sur « aujourd'hui »).
 */
export function getInitialCalendarDate(slots: Slot[]): Date | undefined {
  const upcoming = slots.filter(
    (slot) => !isSlotCancelled(slot) && !isSlotPast(slot)
  )
  if (upcoming.length === 0) return undefined

  // Les créneaux ne sont pas garantis triés → on prend le minimum par startTime
  // (pas slots[0]).
  const earliest = upcoming.reduce((min, slot) =>
    new Date(slot.startTime).getTime() < new Date(min.startTime).getTime() ? slot : min
  )
  return new Date(earliest.startTime)
}
