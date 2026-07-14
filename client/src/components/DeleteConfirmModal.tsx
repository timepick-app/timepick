import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import type { User } from '../types/user'

export interface DeleteConfirmModalProps {
  user: User
  onConfirm: () => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export const DeleteConfirmModal = ({ user, onConfirm, onCancel, isLoading = false }: DeleteConfirmModalProps) => {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } catch {
      // Échec déjà signalé à l'utilisateur par le toast du hook (useDeleteUser.onError).
      // On l'avale ici pour éviter une rejection non gérée ; le modal reste ouvert
      // (le parent ne clear deletingUser que sur succès) pour permettre un nouvel essai.
    } finally {
      setLoading(false)
    }
  }

  // Sync loading state with parent prop
  const isCurrentlyLoading = loading || isLoading

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => { if (isCurrentlyLoading) e.preventDefault() }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex items-start gap-4">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"
            aria-hidden="true"
          >
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <AlertDialogDescription asChild>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                Êtes-vous sûr de vouloir supprimer le membre{' '}
                <span className="font-semibold">{user.email}</span> ?
              </p>
              {(user.bookingCount ?? 0) > 0 && (
                <p className="mt-2 text-sm text-red-600">
                  ⚠️ Ce membre a {user.bookingCount} réservation(s) qui seront également supprimées.
                </p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Cette action est irréversible.
              </p>
            </div>
          </AlertDialogDescription>
        </div>


        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCurrentlyLoading}>Fermer</AlertDialogCancel>
          <Button
            variant="outline-destructive"
            onClick={handleConfirm}
            disabled={isCurrentlyLoading}
          >
            {isCurrentlyLoading ? 'Suppression...' : 'Supprimer'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
