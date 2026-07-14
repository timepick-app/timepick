import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import type { Event } from '@/hooks/useEvents'

interface EventDeleteDialogProps {
  event: Event | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (eventId: string) => void
  isDeleting?: boolean
}

/**
 * EventDeleteDialog Component
 *
 * Dialog de confirmation pour supprimer un événement
 * - Affiche un message d'avertissement avec le nom de l'événement
 * - Avertit sur la suppression en cascade (créneaux + réservations)
 * - Bouton de suppression destructif
 * - Gestion de l'état de chargement pendant la suppression
 *
 * Note: La gestion des erreurs est assurée par le hook useDeleteEvent (toast notifications),
 * ce composant ne gère que l'état local d'ouverture/fermeture de la dialog.
 *
 * AC2: Message "Êtes-vous sûr de vouloir supprimer l'événement [Nom] ?" avec avertissement
 * AC4: Bouton « Fermer » ferme la dialog sans supprimer
 */
export function EventDeleteDialog({
  event,
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: EventDeleteDialogProps) {
  const handleConfirm = async () => {
    if (!event) return
    try {
      await onConfirm(event.id)
      // Fermer la dialog uniquement après succès
      onOpenChange(false)
    } catch {
      // Ne pas fermer en cas d'erreur - le hook useDeleteEvent gère le toast d'erreur
    }
  }

  // Empêcher la fermeture pendant la suppression (overlay clic, ESC)
  const handleOpenChange = (newOpen: boolean) => {
    // Autoriser le changement si : OUverture demandée OU pas de suppression en cours
    if (newOpen || !isDeleting) {
      onOpenChange(newOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            Supprimer l'événement
          </DialogTitle>
          <DialogDescription>
            {event ? (
              <>Êtes-vous sûr de vouloir supprimer l'événement <strong>{event.name}</strong> ?</>
            ) : (
              <>Êtes-vous sûr de vouloir supprimer cet événement ?</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Cette action est <strong>irréversible</strong>.
          </p>
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-destructive">
              <p className="font-medium">Attention : Cette suppression va également supprimer :</p>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                <li>Tous les créneaux horaires associés</li>
                <li>Toutes les réservations confirmées</li>
                <li>Les utilisateurs autorisés</li>
                <li>Les invitations envoyées</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Fermer
          </Button>
          <Button
            type="button"
            variant="outline-destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
