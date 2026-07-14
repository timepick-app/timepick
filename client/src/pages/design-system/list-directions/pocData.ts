import type { Slot } from '@/types/slot'

/**
 * Jeu d'essai commun aux 4 directions du POC « vue Liste » (espace membre).
 * Dev-only — aucun appel réseau, données figées.
 *
 * Couvre les cas imposés :
 *  - S1 : mono-jour PASSÉ, courte description
 *  - S2 : MULTI-JOURS, statut Partiel, LONGUE description (test no-troncature)
 *  - S3 : mono-jour Disponible, SANS description (cas « 1 ligne »)
 *  - S4 : mono-jour RÉSERVÉ (dans POC_BOOKED_IDS)
 *  - S5 : mono-jour COMPLET (CTA désactivé)
 *
 * Dates ancrées en juin 2026 (cohérentes avec la capture d'origine et la date
 * courante du projet) : S1 est passé, S2→S5 sont à venir.
 */
const ISO = '2026-06-01T00:00:00+02:00'

export const POC_SLOTS: Slot[] = [
  {
    id: 'poc-s1',
    eventId: 'poc-evt',
    startTime: '2026-06-17T09:00:00+02:00',
    endTime: '2026-06-17T10:00:00+02:00',
    capacity: 6,
    currentBookings: 0,
    createdAt: ISO,
    updatedAt: ISO,
    cancelledAt: null,
    cancellationReason: null,
    description: 'Yolo day !',
  },
  {
    id: 'poc-s2',
    eventId: 'poc-evt',
    startTime: '2026-06-20T23:00:00+02:00',
    endTime: '2026-06-21T05:00:00+02:00',
    capacity: 10,
    currentBookings: 1,
    createdAt: ISO,
    updatedAt: ISO,
    cancelledAt: null,
    cancellationReason: null,
    description:
      'Observation de la lune, toute la nuit ! Places limitées, pensez à apporter une couverture chaude et un thermos.',
  },
  {
    id: 'poc-s3',
    eventId: 'poc-evt',
    startTime: '2026-06-21T14:00:00+02:00',
    endTime: '2026-06-21T16:00:00+02:00',
    capacity: 10,
    currentBookings: 2,
    createdAt: ISO,
    updatedAt: ISO,
    cancelledAt: null,
    cancellationReason: null,
  },
  {
    id: 'poc-s4',
    eventId: 'poc-evt',
    startTime: '2026-06-28T09:00:00+02:00',
    endTime: '2026-06-28T10:00:00+02:00',
    capacity: 10,
    currentBookings: 1,
    createdAt: ISO,
    updatedAt: ISO,
    cancelledAt: null,
    cancellationReason: null,
    description:
      'Le créneau du matin : pour le rangement, il faudra des gens disponibles et motivés.',
  },
  {
    id: 'poc-s5',
    eventId: 'poc-evt',
    startTime: '2026-06-28T16:00:00+02:00',
    endTime: '2026-06-28T18:00:00+02:00',
    capacity: 10,
    currentBookings: 10,
    createdAt: ISO,
    updatedAt: ISO,
    cancelledAt: null,
    cancellationReason: null,
    description: 'Atelier crêpes.',
  },
  {
    id: 'poc-s6',
    eventId: 'poc-evt',
    startTime: '2026-06-28T20:00:00+02:00',
    endTime: '2026-06-28T22:00:00+02:00',
    capacity: 8,
    currentBookings: 2,
    createdAt: ISO,
    updatedAt: ISO,
    description: 'Veillée musicale au bord du lac.',
    cancelledAt: '2026-06-25T10:00:00+02:00',
    cancellationReason: 'Météo défavorable — report à une date ultérieure.',
  },
]

/** Créneaux réservés par l'utilisateur courant (→ statut « Réservé »). Table statique. */
const POC_BOOKED_IDS: Record<string, true> = { 'poc-s4': true }

/** L'utilisateur courant a-t-il réservé ce créneau ? */
export function isBooked(slotId: string): boolean {
  return POC_BOOKED_IDS[slotId] === true
}
