import { cn } from '@/lib/utils'
import { RichTextContent } from '@/components/ui/rich-text-content'

/**
 * Props pour le composant PublicEventHeader
 */
export interface PublicEventHeaderProps {
  /** Description de l'événement (optionnel) */
  eventDescription?: string
  /** Badge de statut (optionnel, rendu par StatusBanner) */
  statusBanner?: React.ReactNode
  /** Classe CSS additionnelle */
  className?: string
}

/**
 * PublicEventHeader - Status banner + description block
 *
 * The event title and period have been moved to PublicNavHeader (sticky)
 * to maximize calendar viewport. This component now renders only:
 * 1. StatusBanner (pills: ended, upcoming, full, urgency)
 * 2. Description (if present)
 *
 * @example
 * ```tsx
 * <PublicEventHeader
 *   statusBanner={<StatusBanner slots={slots} variant="inline" />}
 *   eventDescription="Description de l'événement"
 * />
 * ```
 */
export function PublicEventHeader({
  eventDescription,
  statusBanner,
  className,
}: PublicEventHeaderProps) {
  // Don't render empty container if nothing to show
  if (!statusBanner && !eventDescription) {
    return null
  }

  return (
    <div className={cn('mb-4 space-y-2', className)}>
      {/* Status banner (pills) */}
      {statusBanner}

      {/* Description (optionnel) — rendu HTML sanitisé */}
      <RichTextContent html={eventDescription} />
    </div>
  )
}
