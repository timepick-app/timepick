import { useState } from 'react'
import type { Table } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DataTableBulkActions } from '@/components/ui/data-table'
import { useBulkDeleteUsers } from '@/hooks/useUsers'
import type { User } from '@/types/user'

interface UsersBulkActionsProps {
  table: Table<User>
}

/**
 * Barre flottante d'actions groupées du tableau Membres : suppression multiple
 * avec confirmation. La portée de sélection est la page courante.
 */
export function UsersBulkActions({ table }: UsersBulkActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { mutate: bulkDelete, isPending } = useBulkDeleteUsers()

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const count = selectedRows.length

  const handleConfirm = () => {
    const ids = selectedRows.map((row) => row.original.id)
    bulkDelete(ids, {
      onSuccess: (data) => {
        // Ne fermer / réinitialiser que si une suppression a eu lieu ; sinon
        // (tout ignoré) laisser l'utilisateur corriger sa sélection.
        if (data.deleted > 0) {
          table.resetRowSelection()
          setConfirmOpen(false)
        }
      },
    })
  }

  return (
    <>
      <DataTableBulkActions table={table} entityName="membre(s)">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Supprimer
        </Button>
      </DataTableBulkActions>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {count} membre(s) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible : les réservations associées seront
              aussi supprimées. Votre propre compte et le dernier administrateur
              ne peuvent pas être supprimés et seront ignorés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault()
                handleConfirm()
              }}
            >
              {isPending ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
