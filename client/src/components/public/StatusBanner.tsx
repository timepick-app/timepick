import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, CheckCircle2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { BadgeVariant } from '@/components/ui/badge'
import { useEventStatus, type EventStatus } from '@/hooks/useEventStatus'
import { cn } from '@/lib/utils'
import type { Slot } from '@/types/slot'

/**
 * Type pour les messages de bannière (statique ou fonction avec slots et opensAt)
 */
type BannerMessage = string | ((slots: Slot[], opensAt?: string | null) => string)

/**
 * Configuration pour un état de bannière
 */
interface BannerConfig {
  /** Variant Badge (ton soft) */
  variant: BadgeVariant
  /** Icône à afficher */
  icon: LucideIcon
  /** Message de la bannière (statique ou fonction) */
  message: BannerMessage
}

/**
 * Configuration pour chaque état de bannière
 * Définit l'icône et le message pour chaque état
 */
const BANNER_CONFIG: Record<string, BannerConfig> = {
  ended: {
    variant: 'error',
    icon: AlertCircle,
    message: 'Les inscriptions ne sont plus possibles',
  },
  upcoming: {
    variant: 'info',
    icon: CalendarClock,
    message: (slots: Slot[], opensAt?: string | null) => {
      // Utiliser opensAt seulement s'il est dans le futur, sinon utiliser la date du créneau
      const openingDate = (opensAt && new Date(opensAt) > new Date()) ? opensAt : getEarliestSlotStart(slots)
      return openingDate ? formatOpeningDateTime(openingDate) : 'Les inscriptions pour cet événement ouvrent bientôt'
    },
  },
  full: {
    variant: 'warning',
    icon: CheckCircle2,
    message: 'Tous les créneaux sont complets',
  },
  urgency: {
    variant: 'warning',
    icon: AlertCircle,
    message: 'Plus que quelques places disponibles',
  },
} as const

/**
 * Délai de fondu lors de la disparition d'une bannière (en millisecondes)
 * Dans la plage acceptable de 2-3 secondes spécifiée dans les exigences
 */
const FADE_OUT_DELAY = 2500

/**
 * Formate la date et l'heure d'ouverture des inscriptions pour la bannière "upcoming"
 *
 * @param slotStartTime - Date ISO string du début d'ouverture
 * @returns Message formaté en français
 */
function formatOpeningDateTime(slotStartTime: string): string {
  const openingDate = new Date(slotStartTime)

  // Formatage de la date en français avec gestion du "1er" du mois
  const day = openingDate.getDate()
  const formattedDate = format(openingDate, 'd MMMM yyyy', { locale: fr })
  const datePart = day === 1
    ? formattedDate.replace(/^1\s/, '1er ')
    : formattedDate

  // Formatage de l'heure uniquement si pas à minuit
  const hours = openingDate.getHours()
  const minutes = openingDate.getMinutes()
  const timePart = (hours === 0 && minutes === 0)
    ? ''
    : format(openingDate, ' à HH\'h\'mm', { locale: fr })

  return `Les inscriptions ouvrent le ${datePart}${timePart}`
}

/**
 * Trouve la date de début la plus ancienne parmi tous les créneaux
 *
 * @param slots - Tableau des créneaux
 * @returns Date de début ISO string la plus ancienne, ou null si pas de créneaux
 */
function getEarliestSlotStart(slots: Slot[]): string | null {
  if (slots.length === 0) {
    return null
  }

  return slots.reduce((earliest, slot) => {
    if (!earliest || slot.startTime < earliest) {
      return slot.startTime
    }
    return earliest
  }, '' as string)
}

/**
 * Props pour StatusBanner
 */
interface StatusBannerProps {
  /** Tableau des créneaux de l'événement */
  slots: Slot[]
  /** Date d'ouverture des inscriptions (optionnel) */
  opensAt?: string | null
}

/**
 * Composant StatusBanner
 *
 * Affiche un chip Badge soft contextuel pour communiquer l'état de l'événement :
 * - ended : Les inscriptions ne sont plus possibles (tous les créneaux sont passés)
 * - upcoming : L'événement commence dans plus de 24h
 * - full : Tous les créneaux sont complets
 * - urgency : Plus de 80% des places sont prises
 *
 * Caractéristiques :
 * - Un seul état affiché à la fois (hiérarchie de priorité)
 * - Animation de fondu (2.5s) lors de la résolution de l'état
 * - role="alert" pour l'annonce immédiate par les lecteurs d'écran
 * - Retourne null si aucun état ne s'applique
 */
export function StatusBanner({ slots, opensAt }: StatusBannerProps) {
  const status = useEventStatus(slots, opensAt)
  const [fadingStatus, setFadingStatus] = useState<EventStatus | null>(null)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStatusRef = useRef<EventStatus | null>(null)
  const hasStartedFadeRef = useRef(false)

  // Gérer l'animation de fondu lors du changement d'état
  useEffect(() => {
    const hasActiveStatus = status.type !== null
    const prevStatus = prevStatusRef.current
    const hadActiveStatus = prevStatus?.type !== null

    // Cas 1: Un nouveau statut est actif (ou reste actif)
    if (hasActiveStatus) {
      // Annuler tout fondu en cours
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
      // Animation de fondu pilotée par timer : on remet l'animation à zéro quand un
      // nouveau statut arrive (annule un fondu en cours, ré-arme la transition d'opacité).
      // setState synchrone légitime ici — dériver au rendu ne peut pas déclencher la
      // transition CSS opacity 1->0 ni mémoriser le statut sortant après sa disparition.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFadingStatus(null)
      setIsFadingOut(false)
      hasStartedFadeRef.current = false
      prevStatusRef.current = status
      return
    }

    // Cas 2: Aucun statut actif
    if (!hasActiveStatus) {
      // Si on n'a pas encore commencé le fondu et qu'on avait un statut actif
      if (!hasStartedFadeRef.current && hadActiveStatus && prevStatus && !fadingStatus) {
        // Démarrer le fondu
        hasStartedFadeRef.current = true
        setFadingStatus(prevStatus)
        setIsFadingOut(true)
        fadeTimerRef.current = setTimeout(() => {
          setFadingStatus(null)
          setIsFadingOut(false)
          hasStartedFadeRef.current = false
        }, FADE_OUT_DELAY)
        prevStatusRef.current = null
      }
      // Si le fondu est déjà en cours ou terminé, ne rien faire
    }
  }, [status, fadingStatus])

  // Déterminer quel état afficher (actuel ou en fondu)
  const displayStatus = status.type ? status : fadingStatus

  // Retourner null si aucun état à afficher
  if (!displayStatus?.type) {
    return null
  }

  const config = BANNER_CONFIG[displayStatus.type]
  const Icon = config.icon
  const message = typeof config.message === 'function' ? config.message(slots, opensAt) : config.message

  return (
    <Badge
      appearance="soft"
      variant={config.variant}
      role="alert"
      data-testid="status-banner"
      icon={<Icon className="h-4 w-4" data-testid="banner-icon" aria-hidden="true" />}
      className={cn('transition-opacity duration-300 ease-in-out', isFadingOut && 'opacity-0')}
    >
      <span className="truncate md:truncate-none">{message}</span>
    </Badge>
  )
}
