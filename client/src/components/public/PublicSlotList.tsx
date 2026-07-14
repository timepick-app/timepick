import { CalendarX } from 'lucide-react'
import type { Slot } from '@/types/slot'
import { SlotAgendaList } from '@/components/slots/SlotAgendaList'
import { MemberSlotAction } from './MemberSlotAction'
import { MemberSlotExtra } from './MemberSlotExtra'
import { Typography } from '@/components/ui/typography'

/**
 * Props pour le composant PublicSlotList.
 *
 * Signature consommée par `EventCalendarContent.tsx` (vue Liste membre).
 * Migrée vers le composant partagé `SlotAgendaList` (Direction A-E2).
 */
export interface PublicSlotListProps {
  slots: Slot[]
  allSlotsCount?: number // Nombre total de slots (pour indicateur de filtrage)
  isFiltered?: boolean // Indique si l'affichage est filtré
  /** Réserver → réservation directe (remarque #29), sans fenêtre de détail. */
  onReserveSlot?: (slotId: string) => void
  /** Annulation d'une réservation (créneau réservé) — flow partagé `handleCancelFromPanel`. */
  onCancelSlot?: (slotId: string) => void
  disabled?: boolean
  bookedSlotIds?: Set<string> // IDs des créneaux réservés par l'utilisateur
}

/**
 * Liste « agenda » des créneaux publics (vue membre).
 *
 * Délègue le rendu groupé par jour, la gouttière de date (container queries),
 * le badge E2 (places fusionnées au statut) et la description COMPLÈTE au
 * composant partagé `SlotAgendaList`. L'action membre (Réserver / Annuler /
 * Complet / Terminé) est fournie par `MemberSlotAction`.
 */
export function PublicSlotList({
  slots,
  allSlotsCount,
  isFiltered = false,
  onReserveSlot,
  onCancelSlot,
  disabled = false,
  bookedSlotIds,
}: PublicSlotListProps) {
  return (
    <div data-testid="public-slot-list" className="space-y-6">
      {/* Indicateur de filtrage */}
      {isFiltered && allSlotsCount ? (
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {slots.length} / {allSlotsCount} créneaux
          </span>
        </div>
      ) : null}

      {/* État vide */}
      {slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-12 text-center">
          <CalendarX className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <Typography variant="h3" as="h2" className="mt-2">
            Aucun créneau disponible
          </Typography>
          <Typography variant="body-sm" color="muted" className="mt-1">
            Les créneaux de participation seront affichés ici.
          </Typography>
        </div>
      ) : (
        <SlotAgendaList
          slots={slots}
          getHasBooked={(s) => bookedSlotIds?.has(s.id) ?? false}
          renderExtra={(slot) => <MemberSlotExtra slot={slot} />}
          renderAction={(slot) => (
            <MemberSlotAction
              slot={slot}
              hasBooked={bookedSlotIds?.has(slot.id) ?? false}
              disabled={disabled}
              onReserve={onReserveSlot}
              onCancel={onCancelSlot}
            />
          )}
        />
      )}
    </div>
  )
}
