import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UserMultiSelect } from '@/components/admin/UserMultiSelect'
import { useSetEventUsers } from '@/hooks/useEvents'

export interface AddInvitesDialogProps {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sélection courante, pour pré-cocher la liste à l'ouverture. */
  currentSelectedIds: string[]
}

/**
 * Modale « Gérer les invités » : enveloppe UserMultiSelect.
 * Contrat = REMPLACEMENT total via useSetEventUsers : décocher une personne la
 * retire de l'événement. Remplace l'ancien empilement « sélecteur + bouton
 * Enregistrer + liste » de l'onglet Invités.
 */
export function AddInvitesDialog({
  eventId,
  open,
  onOpenChange,
  currentSelectedIds,
}: AddInvitesDialogProps) {
  const { setEventUsers, isSetting } = useSetEventUsers()
  const [selectedIds, setSelectedIds] = useState<string[]>(currentSelectedIds)

  // Resync à la transition d'ouverture seule : dépendre de `currentSelectedIds`
  // laissait un refetch d'arrière-plan écraser la sélection en cours.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSelectedIds(currentSelectedIds)
  }

  const handleSave = async () => {
    try {
      await setEventUsers(eventId, selectedIds)
      onOpenChange(false)
    } catch {
      // Erreur déjà signalée par le toast du hook.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gérer les invités</DialogTitle>
          <DialogDescription>
            Cochez les personnes à inviter. Décocher une personne la retire de l'événement.
          </DialogDescription>
        </DialogHeader>

        <UserMultiSelect
          eventId={eventId}
          selectedUserIds={selectedIds}
          onSelectionChange={setSelectedIds}
          disabled={isSetting}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSetting}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={isSetting}>
            {isSetting ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
