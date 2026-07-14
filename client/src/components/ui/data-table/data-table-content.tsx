import { type ReactNode } from "react"
import { type Table as TanstackTable, flexRender } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTableContentProps<TData> {
  table: TanstackTable<TData>
  /** Nombre de colonnes, pour le colSpan des lignes pleine largeur. */
  columnCount: number
  isLoading?: boolean
  skeletonRows?: number
  /** Message d'erreur ; s'il est défini, il prime sur le chargement et le vide. */
  error?: ReactNode
  /** Action de réessai affichée sous le message d'erreur. */
  onRetry?: () => void
  emptyMessage?: ReactNode
  /** Active la ligne au double-clic souris (row.original). undefined = inactif. Ignoré depuis un contrôle interactif. */
  onRowActivate?: (row: TData) => void
}

/**
 * Corps de table partagé (en-têtes + lignes) avec états erreur / chargement /
 * vide. Mutualisé entre le DataTable client (design system) et les tableaux en
 * mode serveur (ex. UsersDataTable). N'inclut pas le conteneur bordé : chaque
 * consommateur l'enveloppe selon son contexte.
 */
export function DataTableContent<TData>({
  table,
  columnCount,
  isLoading = false,
  skeletonRows = 5,
  error,
  onRetry,
  emptyMessage = "Aucun résultat.",
  onRowActivate,
}: DataTableContentProps<TData>) {
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                colSpan={header.colSpan}
                className={cn(header.column.columnDef.meta?.className)}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {error ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="h-24 text-center">
              <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>{error}</span>
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    Réessayer
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ) : isLoading ? (
          Array.from({ length: skeletonRows }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              {table.getVisibleLeafColumns().map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(column.columnDef.meta?.className)}
                >
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
              className={cn(onRowActivate && "cursor-cell")}
              onDoubleClick={
                onRowActivate
                  ? (event) => {
                      // Ignore le double-clic depuis un contrôle interactif (checkbox, menu).
                      if ((event.target as HTMLElement).closest('button, a')) return
                      onRowActivate(row.original)
                    }
                  : undefined
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(cell.column.columnDef.meta?.className)}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columnCount}
              className="h-24 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
