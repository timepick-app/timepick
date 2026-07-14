import { useMemo } from 'react'
import type { Slot } from '../types/slot'

/**
 * Constantes pour le calcul du statut d'événement
 */
const URGENCY_THRESHOLD = 80 // Pourcentage de remplissage déclenchant l'urgence

/**
 * États possibles pour les bannières de statut
 * - ended: Les inscriptions ne sont plus possibles (tous les créneaux sont passés)
 * - upcoming: L'événement commence dans plus de 24h
 * - full: Tous les créneaux sont complets
 * - urgency: Plus de 80% des places sont prises
 * - null: Aucun état ne s'applique (pas de bannière)
 */
type BannerState = 'ended' | 'upcoming' | 'full' | 'urgency' | null

/**
 * Résultat du calcul de statut d'événement
 */
export interface EventStatus {
  type: BannerState
  ariaRole: 'alert' | 'status'
}

/**
 * Hook useEventStatus
 *
 * Calcule le statut d'un événement pour l'affichage de bannières de communication
 * basé sur les données des créneaux (slots) et la date d'ouverture des inscriptions.
 *
 * La hiérarchie des priorités est la suivante :
 * 1. upcoming basé sur opensAt (priorité 3) - L'ouverture des inscriptions est dans le futur
 * 2. ended (priorité 4) - Les inscriptions ne sont plus possibles
 * 3. upcoming basé sur les créneaux (priorité 3) - Le premier créneau commence dans le futur
 * 4. full (priorité 2) - Tous les créneaux sont complets
 * 5. urgency (priorité 1) - Plus de 80% des places sont prises
 *
 * Note: opensAt prend la priorité sur ended - si les inscriptions ne sont pas encore ouvertes,
 * l'événement est considéré comme "à venir" même si les créneaux sont dans le passé
 * (cas où l'événement a été reprogrammé).
 *
 * Seul l'état avec la priorité la plus élevée est retourné.
 *
 * @param slots - Tableau des créneaux de l'événement
 * @param opensAt - Date d'ouverture des inscriptions (optionnel, format ISO)
 * @returns EventStatus avec le type, la priorité et le rôle ARIA
 *
 * @example
 * const status = useEventStatus(slots, event.opensAt)
 * if (status.type) {
 *   // Afficher la bannière appropriée
 *   return <Alert role={status.ariaRole}>{getMessage(status.type)}</Alert>
 * }
 */
export function useEventStatus(slots: Slot[], opensAt?: string | null): EventStatus {
  return useMemo(() => {
    // Retourner null si pas de créneaux
    if (slots.length === 0) {
      return { type: null, ariaRole: 'status' }
    }

    const now = new Date()

    // PRIORITY 1 (highest): upcoming based on opensAt
    // Si l'ouverture des inscriptions est dans le futur, c'est "upcoming"
    // Cela prend la priorité même sur "ended" - si les inscriptions ne sont pas ouvertes,
    // l'événement est considéré comme à venir, même si les créneaux sont dans le passé
    // (cas où l'événement a été reprogrammé)
    const opensAtDate = opensAt ? new Date(opensAt) : null
    if (opensAtDate && opensAtDate > now) {
      return { type: 'upcoming', ariaRole: 'status' }
    }

    // PRIORITY 2: ended
    // Vérifier si TOUS les créneaux sont passés
    const latestEnd = slots.reduce((latest, slot) => {
      const endTime = new Date(slot.endTime)
      return endTime > latest ? endTime : latest
    }, new Date(slots[0].endTime))

    if (latestEnd < now) {
      return { type: 'ended', ariaRole: 'alert' }
    }

    // PRIORITY 3: upcoming based on slot dates
    // REMOVED: The slot-based upcoming check has been removed.
    // The upcoming banner now ONLY shows when opensAt is defined and in the future.
    // When opensAt is null/undefined or in the past, the event is immediately open (no banner).
    // This fixes the issue where the banner was showing even when opensAt was not configured.

    // PRIORITY 3: full
    // Vérifier si TOUS les créneaux sont complets
    // Ignorer les créneaux avec capacité 0 (invalides)
    const slotsWithCapacity = slots.filter(s => s.capacity > 0)
    const allFull = slotsWithCapacity.length > 0 && slotsWithCapacity.every(s => (s.currentBookings ?? 0) >= s.capacity)
    if (allFull) {
      return { type: 'full', ariaRole: 'status' }
    }

    // PRIORITY 4: urgency
    // Vérifier si le taux de remplissage global est >= 80%
    // Utiliser les créneaux avec capacité > 0 uniquement
    const relevantSlots = slots.filter(s => s.capacity > 0)
    const totalCapacity = relevantSlots.reduce((sum, slot) => sum + slot.capacity, 0)
    const totalBookings = relevantSlots.reduce((sum, slot) => sum + (slot.currentBookings ?? 0), 0)
    const fillPercentage = totalCapacity > 0 ? (totalBookings / totalCapacity) * 100 : 0

    if (fillPercentage >= URGENCY_THRESHOLD) {
      return { type: 'urgency', ariaRole: 'status' }
    }

    // DEFAULT: Aucun état ne s'applique
      return { type: null, ariaRole: 'status' }
  }, [slots, opensAt])
}
