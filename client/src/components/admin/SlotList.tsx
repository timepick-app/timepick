import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Pencil, Trash2, CalendarDays, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { SlotAgendaList } from '@/components/slots/SlotAgendaList'
import { useAdminSlots } from '../../hooks/useAdminSlots'
import { SlotEditDialog } from './SlotEditDialog'
import { SlotDeleteDialog } from './events/SlotDeleteDialog'
import { isSlotCancelled, type Slot } from '@/types/slot'

interface SlotListProps {
  eventId: string
}

/**
 * SlotList — wrapper admin autour de `SlotAgendaList` (vue « agenda » partagée,
 * Direction A-E2). Conserve `useAdminSlots`, les dialogs Modifier/Supprimer et
 * les états vide/chargement. Le rendu des rangées (gouttière de date, badge E2
 * « N places », atténuation passé, tri/groupement chronologique) est délégué au
 * composant partagé ; l'admin n'apporte que ses actions (`renderAction` :
 * Modifier + Supprimer, lecture seule si annulé) et son bloc d'info
 * (`renderExtra` : motif d'annulation / « Y réservation(s) »).
 */
export function SlotList({ eventId }: SlotListProps) {
  const { slots, isLoading, deleteSlotAsync, isDeleting } = useAdminSlots(eventId)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [slotToDelete, setSlotToDelete] = useState<Slot | null>(null)

  // Handlers
  const handleEditClick = (slot: Slot) => {
    setSelectedSlot(slot)
    setDialogOpen(true)
  }

  const handleDeleteClick = (slot: Slot) => {
    setSlotToDelete(slot)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async (slotId: string, cancellationReason?: string, hadReservations?: boolean) => {
    try {
      await deleteSlotAsync(slotId, cancellationReason, hadReservations)
      setDeleteDialogOpen(false)
      setSlotToDelete(null)
    } catch {
      // Error handled by hook
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  // Empty state
  if (slots.length === 0) {
    return (
      <div className="text-center py-12 px-4 bg-muted/50 rounded-lg border border-dashed border-border">
        <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground" />
        <Typography variant="body" weight="medium" className="mt-2">
          Aucun créneau créé
        </Typography>
        <Typography variant="body-sm" color="muted" className="mt-1">
          Commencez par créer votre premier créneau horaire.
        </Typography>
      </div>
    )
  }

  // Actions : Modifier + Supprimer (les deux préservés). Annulé → lecture
  // seule (« Voir ») ; la suppression est remplacée par la date d'annulation
  // affichée dans `renderExtra`. Cible tactile 44px en conteneur étroit, 36px
  // en large (variante @2xl/agenda: active car le bouton est rendu dans
  // `@container/agenda`).
  const renderAction = (slot: Slot) => {
    if (isSlotCancelled(slot)) {
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleEditClick(slot)}
          aria-label="Voir le créneau"
          className="min-h-11 @xl/agenda:min-h-9"
        >
          <Eye />
        </Button>
      )
    }

    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleEditClick(slot)}
          aria-label="Modifier le créneau"
          className="min-h-11 @xl/agenda:min-h-9"
        >
          <Pencil />
        </Button>
        {/* F9 : l'annulation est déclenchable même avec des réservations */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleDeleteClick(slot)}
          aria-label="Supprimer le créneau"
          className="text-red-600 hover:text-red-800 hover:bg-red-50 min-h-11 @xl/agenda:min-h-9"
        >
          <Trash2 />
        </Button>
      </div>
    )
  }

  // Bloc info optionnel sous la description. L'indicateur de places est porté
  // par le badge E2 interne à SlotAgendaList (ne pas le redoubler ici).
  const renderExtra = (slot: Slot) => {
    if (isSlotCancelled(slot)) {
      return (
        <div className="space-y-0.5">
          {slot.cancellationReason && (
            <Typography variant="body-sm" color="muted">
              Motif : {slot.cancellationReason}
            </Typography>
          )}
          {slot.cancelledAt && (
            <Typography variant="body-sm" color="muted">
              Annulé le {format(new Date(slot.cancelledAt), 'dd/MM/yyyy', { locale: fr })}
            </Typography>
          )}
        </div>
      )
    }

    if ((slot.currentBookings ?? 0) > 0) {
      return (
        <Typography variant="body-sm" color="muted">
          {slot.currentBookings ?? 0} réservation{(slot.currentBookings ?? 0) > 1 ? 's' : ''}
        </Typography>
      )
    }

    return null
  }

  return (
    <>
      {/* Liste « agenda » — tri/groupement chronologique délégué au composant partagé. */}
      <SlotAgendaList slots={slots} renderAction={renderAction} renderExtra={renderExtra} />

      {/* Edit Dialog */}
      {selectedSlot && (
        <SlotEditDialog
          slot={selectedSlot}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setSelectedSlot(null)
          }}
        />
      )}

      {/* Delete Dialog */}
      <SlotDeleteDialog
        slot={slotToDelete}
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setSlotToDelete(null)
        }}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </>
  )
}
