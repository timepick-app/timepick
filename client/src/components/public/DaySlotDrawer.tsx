import { useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet'
import { SlotCard } from './SlotCard'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { Slot } from '../../types/slot'
import { getAvailabilityStatus } from '../../types/slot'

/**
 * Props pour le composant DaySlotDrawer
 */
export interface DaySlotDrawerProps {
  /** État d'ouverture du drawer */
  open: boolean
  /** Callback appelé lors du changement d'état d'ouverture */
  onOpenChange: (open: boolean) => void
  /** Date du jour sélectionné */
  date: Date | null
  /** Liste des créneaux du jour */
  slots: Slot[]
  /** IDs des créneaux réservés par l'utilisateur */
  bookedSlotIds?: Set<string>
  /** Callback appelé lors de la sélection d'un créneau */
  onSelectSlot?: (slotId: string) => void
}

/**
 * Composant DaySlotDrawer - Drawer latéral affichant les créneaux du jour
 *
 * Fonctionnalités:
 * - Affichage responsive: drawer latéral sur desktop, bottom sheet sur mobile
 * - Liste des créneaux avec SlotCard (variant="list")
 * - Résumé de disponibilité (X disponibles sur Y)
 * - Accessibilité: ESC pour fermer, focus trap
 *
 * @see Story 19.3: Drawer Créneaux du Jour Public
 */
export function DaySlotDrawer({
  open,
  onOpenChange,
  date,
  slots,
  bookedSlotIds = new Set(),
  onSelectSlot,
}: DaySlotDrawerProps) {
  // Détecte si on est sur mobile pour le responsive
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Calcule le nombre de créneaux disponibles
  const { availableCount, totalCount } = useMemo(() => {
    const total = slots.length
    const available = slots.filter((slot) => {
      const status = getAvailabilityStatus(slot)
      return status !== 'full'
    }).length
    return { availableCount: available, totalCount: total }
  }, [slots])

  // Formate la date pour l'en-tête
  const formattedDate = useMemo(() => {
    if (!date) return ''
    return format(date, 'EEEE d MMMM yyyy', { locale: fr })
  }, [date])

  // Description pour l'accessibilité
  const description = useMemo(() => {
    if (totalCount === 0) return 'Aucun créneau ce jour'
    return `${availableCount} créneau${availableCount > 1 ? 'x' : ''} disponible${availableCount > 1 ? 's' : ''} sur ${totalCount}`
  }, [availableCount, totalCount])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'h-[85vh] rounded-t-lg'
            : 'w-full sm:max-w-md'
        }
        data-testid="day-slot-drawer"
      >
        <SheetHeader>
          <SheetTitle className="capitalize">
            {formattedDate}
          </SheetTitle>
          <SheetDescription>
            {description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
          {slots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg
                className="h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                role="img"
                aria-label="Aucun créneau"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-500">
                Aucun créneau disponible ce jour
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {slots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  variant="list"
                  hasBooked={bookedSlotIds.has(slot.id)}
                  onSelect={onSelectSlot}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
