import { useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Type de retour du hook useEventMode
 */
export interface EventModeResult {
  /** true si l'événement est en mode consultatif (ouvert non encore atteint) */
  isConsultative: boolean
  /** Date d'ouverture brute (ISO string ou null) */
  opensAt: string | null
  /** Date d'ouverture formatée en français (ex: "1er février 2026") */
  opensAtDate: string | null
  /** Heure d'ouverture formatée (ex: "09:30") ou null si à minuit */
  opensAtTime: string | null
}

/**
 * Hook useEventMode pour détecter le mode consultatif d'un événement
 *
 * Le mode consultatif est activé quand la date actuelle est antérieure à
 * la date d'ouverture des inscriptions (opensAt).
 *
 * @param opensAt - Date d'ouverture ISO string ou null (null = ouverture immédiate)
 * @returns Objet avec les informations sur le mode de l'événement
 *
 * @example
 * const { isConsultative, opensAtDate, opensAtTime } = useEventMode(event.opensAt)
 */
export function useEventMode(opensAt: string | null): EventModeResult {
  return useMemo(() => {
    // Pas de date d'ouverture = ouverture immédiate (pas consultatif)
    if (!opensAt) {
      return {
        isConsultative: false,
        opensAt: null,
        opensAtDate: null,
        opensAtTime: null,
      }
    }

    const openingDate = new Date(opensAt)
    const now = new Date()

    // Mode consultatif si la date d'ouverture est dans le futur
    const isConsultative = openingDate > now

    // Formatage de la date en français avec gestion du "1er" du mois
    const day = openingDate.getDate()
    const formattedDate = format(openingDate, 'd MMMM yyyy', { locale: fr })
    const opensAtDate = day === 1
      ? formattedDate.replace(/^1\s/, '1er ')
      : formattedDate

    // Formatage de l'heure uniquement si pas à minuit
    const hours = openingDate.getHours()
    const minutes = openingDate.getMinutes()
    const opensAtTime = (hours === 0 && minutes === 0)
      ? null
      : format(openingDate, 'HH:mm', { locale: fr })

    return {
      isConsultative,
      opensAt,
      opensAtDate,
      opensAtTime,
    }
  }, [opensAt])
}
