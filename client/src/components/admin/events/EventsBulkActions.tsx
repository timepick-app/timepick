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
import { useBulkDeleteEvents } from '@/hooks/useEvents'
import type { EventTableRow } from './eventsColumns'

interface EventsBulkActionsProps {
  table: Table<EventTableRow>
}

/**
 * Barre flottante d'actions groupées du tableau Événements : suppression multiple
 * avec confirmation. Les créneaux et réservations associés sont aussi supprimés.
 */
export function EventsBulkActions({ table }: EventsBulkActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { mutate: bulkDelete, isPending } = useBulkDeleteEvents()

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const count = selectedRows.length

  const handleConfirm = () => {
    const ids = selectedRows.map((row) => row.original.id)
    bulkDelete(ids, {
      onSuccess: (data) => {
        // Ne fermer / réinitialiser que si une suppression a eu lieu.
        if (data.deleted > 0) {
          table.resetRowSelection()
          setConfirmOpen(false)
        }
      },
    })
  }

  return (
    <>
      <DataTableBulkActions table={table} entityName="événement(s)">
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
            <AlertDialogTitle>Supprimer {count} événement(s) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible : les créneaux et réservations associés
              seront aussi supprimés.
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
