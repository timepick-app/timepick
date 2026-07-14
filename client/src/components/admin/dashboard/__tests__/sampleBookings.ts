import type { BookingTimestamps } from '@/types/analytics'

/**
 * Données fictives pour les tests du composant BookingsPeaksChart
 * (échantillon autonome, sans auth/DB). Événement « Fête de la lune (la suite) » : inscriptions
 * ouvertes le 10 juin, clôture le 30 juin, avec un PIC net le 22 juin vers 14 h
 * (heure de Paris) — 9 inscriptions concentrées sur ~1 h, plus quelques
 * inscriptions éparses les 19 et 20 juin.
 *
 * Toutes les heures ci-dessous sont en UTC ; l'été, Paris est en CEST (+2),
 * donc 14 h Paris = 12 h UTC, 09 h Paris = 07 h UTC, 18 h Paris = 16 h UTC.
 */
const UTC = Date.UTC

// 9 instants le 22 juin 2026 ~14 h Paris (12 h UTC), répartis 14:02–14:55.
const PEAK_MINUTES = [2, 8, 14, 20, 26, 38, 44, 50, 55]
const peakTs = PEAK_MINUTES.map(m => UTC(2026, 5, 22, 12, m))

const timestamps = [
  ...peakTs,                       // 9 — le pic du 22 juin ~14 h Paris
  UTC(2026, 5, 19, 13, 10),        // 1 — 19 juin 15 h Paris
  UTC(2026, 5, 20, 7, 5),          // 1 — 20 juin 09 h Paris
  UTC(2026, 5, 20, 16, 40),        // 1 — 20 juin 18 h Paris
].sort((a, b) => a - b) // 12 timestamps au total

export const SAMPLE_BOOKINGS: BookingTimestamps = {
  name: 'Fête de la lune (la suite)',
  opensAt: '2026-06-10T06:00:00.000Z',
  createdAt: '2026-06-08T09:00:00.000Z',
  endDate: '2026-06-30T20:00:00.000Z',
  totalCapacity: 20, // 12 réservations sur 20 places proposées (démo vue cumulative)
  timestamps,
}
