import { useState, type ReactNode } from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type InitialTableState,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { DataTableContent } from "./data-table-content"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableToolbar } from "./data-table-toolbar"
import type { DataTableFacetedFilterConfig } from "./types"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Si défini, la recherche filtre cette colonne ; sinon, filtre global. */
  searchColumnId?: string
  searchPlaceholder?: string
  facetedFilters?: DataTableFacetedFilterConfig[]
  /** Actions de la barre d'outils, à droite (Export, Nouveau…). */
  toolbarActions?: ReactNode
  /** Rendu de la barre flottante d'actions groupées (reçoit l'instance table). */
  renderBulkActions?: (table: TanstackTable<TData>) => ReactNode
  /** Identité de ligne stable (recommandé pour la sélection). */
  getRowId?: (originalRow: TData, index: number) => string
  initialState?: InitialTableState
  emptyMessage?: string
  pageSizeOptions?: number[]
}

/**
 * DataTable client : tri / filtres / facettes / pagination / sélection gérés
 * côté client par TanStack Table. Pour un mode serveur (pagination/recherche
 * pilotées par l'API), composer directement les parties génériques exportées
 * (`DataTableToolbar`, `DataTablePagination`, …) autour d'un `useReactTable`
 * configuré en mode manuel.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumnId,
  searchPlaceholder,
  facetedFilters,
  toolbarActions,
  renderBulkActions,
  getRowId,
  initialState,
  emptyMessage = "Aucun résultat.",
  pageSizeOptions,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
    },
    initialState,
    getRowId,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchColumnId={searchColumnId}
        searchPlaceholder={searchPlaceholder}
        facetedFilters={facetedFilters}
        actions={toolbarActions}
      />
      <div className="rounded-lg border">
        <DataTableContent
          table={table}
          columnCount={columns.length}
          emptyMessage={emptyMessage}
        />
      </div>
      <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
      {renderBulkActions?.(table)}
    </div>
  )
}
