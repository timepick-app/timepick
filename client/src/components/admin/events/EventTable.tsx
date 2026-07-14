import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { Event } from '@/hooks/useEvents'
import type { DataTableFacetedFilterConfig } from '@/components/ui/data-table'
import type { EventTableRow } from './eventsColumns'
import { getEventsColumns } from './eventsColumns'
import { EventDeleteDialog } from './EventDeleteDialog'
import { EventsBulkActions } from './EventsBulkActions'
import {
  DataTableContent,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/ui/data-table'

// Ré-export pour préserver l'import existant de EventsListPage.
export type { EventTableRow }

/**
 * Props pour le composant EventTable
 */
interface EventTableProps {
  /** Liste des événements avec leurs stats */
  data: EventTableRow[]
  /** État de chargement */
  isLoading?: boolean
  /** État de suppression (disabled state des boutons) */
  isDeleting?: boolean
  /** État de duplication (disabled state des boutons) */
  isDuplicating?: boolean
  /** Callback pour l'action Éditer */
  onEdit?: (event: Event) => void
  /** Callback pour l'action Dupliquer */
  onDuplicate?: (event: Event) => void
  /** Callback pour l'action Supprimer — ouvre la dialog si onConfirmDelete est fourni */
  onDelete?: (event: Event) => void
  /** Callback pour confirmer la suppression après dialog */
  onConfirmDelete?: (eventId: string) => void | Promise<void>
}

const FACETED_FILTERS: DataTableFacetedFilterConfig[] = [
  {
    columnId: 'isPublished',
    title: 'Statut',
    options: [
      { label: 'Publié', value: 'published' },
      { label: 'Brouillon', value: 'draft' },
    ],
  },
  {
    columnId: 'hasCustomInvitation',
    title: 'Modèle',
    options: [
      { label: 'Personnalisé', value: 'custom' },
      { label: 'Défaut', value: 'default' },
    ],
  },
]

/**
 * Tableau Événements basé sur le DataTable du design system, en mode client :
 * recherche par nom / filtres à facettes (Statut, Modèle) / pagination côté
 * client ; sélection multiple + suppression en masse + visibilité des colonnes.
 */
export function EventTable({
  data,
  isLoading = false,
  isDeleting = false,
  isDuplicating = false,
  onEdit,
  onDuplicate,
  onDelete,
  onConfirmDelete,
}: EventTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = useState('')

  // État de la dialog de suppression d'événement
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  /**
   * Ouvre la dialog de suppression avec l'événement à supprimer.
   * Guard clause contre le spam-click pendant isDeleting.
   */
  const handleDeleteClick = useCallback(
    (event: Event): void => {
      if (isDeleting) return
      setEventToDelete(event)
      setIsDeleteDialogOpen(true)
      if (onDelete) onDelete(event)
    },
    [isDeleting, onDelete]
  )

  /**
   * Confirme la suppression de l'événement.
   */
  const handleConfirmDelete = async (eventId: string): Promise<void> => {
    if (onConfirmDelete) {
      await onConfirmDelete(eventId)
    }
  }

  const columns = useMemo(
    () =>
      getEventsColumns({
        onEdit: (e) => onEdit?.(e),
        onDuplicate: (e) => onDuplicate?.(e),
        onDelete: handleDeleteClick,
        isBusy: isDeleting || isDuplicating,
      }),
    [onEdit, onDuplicate, handleDeleteClick, isDeleting, isDuplicating]
  )

  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable (TanStack) renvoie des fonctions non mémoïsables ; rien à corriger côté app, le React Compiler ignore ce composant en toute sécurité.
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    enableRowSelection: true,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  // Réinitialise la sélection quand les données changent (changement de page,
  // de recherche ou de filtre côté serveur).
  useEffect(() => {
    table.resetRowSelection()
  }, [data, table])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-3">
        <DataTableToolbar
          table={table}
          searchColumnId="name"
          searchPlaceholder="Rechercher un événement…"
          facetedFilters={FACETED_FILTERS}
        />
      </div>
      <DataTableContent
        table={table}
        columnCount={columns.length}
        isLoading={isLoading}
        emptyMessage="Aucun événement"
        onRowActivate={onEdit}
      />
      <div className="border-t p-3">
        <DataTablePagination table={table} />
      </div>
      <EventsBulkActions table={table} />
      {onConfirmDelete && (
        <EventDeleteDialog
          event={eventToDelete}
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}
