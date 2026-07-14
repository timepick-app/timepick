import type { ReactNode } from "react"
import type { Table } from "@tanstack/react-table"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import type { DataTableFacetedFilterConfig } from "./types"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  /** Si défini, la recherche filtre cette colonne ; sinon, filtre global. */
  searchColumnId?: string
  searchPlaceholder?: string
  facetedFilters?: DataTableFacetedFilterConfig[]
  /** Actions additionnelles à droite (Export, Nouveau…). */
  actions?: ReactNode
}

export function DataTableToolbar<TData>({
  table,
  searchColumnId,
  searchPlaceholder = "Rechercher…",
  facetedFilters = [],
  actions,
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    Boolean(table.getState().globalFilter)

  const searchValue = searchColumnId
    ? ((table.getColumn(searchColumnId)?.getFilterValue() as string) ?? "")
    : ((table.getState().globalFilter as string) ?? "")

  const setSearchValue = (value: string) => {
    if (searchColumnId) {
      table.getColumn(searchColumnId)?.setFilterValue(value)
    } else {
      table.setGlobalFilter(value)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        size="sm"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        className="w-full sm:w-[200px] lg:w-[260px]"
      />
      {facetedFilters.map((filter) => {
        const column = table.getColumn(filter.columnId)
        if (!column) return null
        return (
          <DataTableFacetedFilter
            key={filter.columnId}
            column={column}
            title={filter.title}
            options={filter.options}
          />
        )
      })}
      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            table.resetColumnFilters()
            table.setGlobalFilter("")
          }}
          className="h-8 px-2 lg:px-3"
        >
          Réinitialiser
          <X className="ml-2 h-4 w-4" />
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {actions}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}
