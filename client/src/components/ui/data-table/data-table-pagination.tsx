import type { Table } from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  pageSizeOptions?: number[]
}

/**
 * Construit la liste des numéros de page à afficher (max 5 boutons autour de la
 * page courante), avec ellipses aux extrémités. Repris à l'identique de
 * shadcn-admin (`src/lib/utils.ts` → `getPageNumbers`).
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | "ellipsis")[] {
  const maxVisiblePages = 5
  const pages: (number | "ellipsis")[] = []

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (currentPage <= 3) {
    pages.push(1, 2, 3, 4, "ellipsis", totalPages)
  } else if (currentPage >= totalPages - 2) {
    pages.push(1, "ellipsis")
    for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(
      1,
      "ellipsis",
      currentPage - 1,
      currentPage,
      currentPage + 1,
      "ellipsis",
      totalPages,
    )
  }

  return pages
}

/**
 * Pagination de DataTable, portée fidèlement depuis shadcn-admin.
 *
 * Hiérarchie d'origine : d'un côté l'indicateur « Page X sur Y » + le sélecteur
 * de taille de page ; de l'autre la navigation complète (première / précédente
 * / numéros de page / suivante / dernière).
 *
 * Le responsive est piloté par CONTAINER QUERIES (réagit à la largeur de la
 * TABLE, pas du viewport) : en conteneur étroit (< @2xl) la barre passe en
 * colonne inversée — navigation au-dessus, « Page X sur Y » + sélecteur en
 * dessous (justify-between) — exactement comme le modèle d'origine en
 * tablette/mobile. Les boutons première / dernière page disparaissent (< @md)
 * et le label « Lignes par page » est masqué (< @2xl). Pas de compteur de
 * sélection ici (porté par la barre d'actions groupées), conformément au modèle.
 */
export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 30, 40, 50],
}: DataTablePaginationProps<TData>) {
  const currentPage = table.getState().pagination.pageIndex + 1
  const totalPages = table.getPageCount() || 1
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div className="@container">
      <div className="flex flex-col-reverse items-center gap-4 overflow-x-clip px-2 @2xl:flex-row @2xl:justify-between">
        {/* Indicateur de page + sélecteur de taille (bas en mobile, gauche en desktop) */}
        <div className="flex w-full items-center justify-between gap-4 @2xl:w-auto @2xl:justify-start @2xl:gap-6">
          <div className="text-sm font-medium whitespace-nowrap">
            Page {currentPage} sur {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <p className="hidden text-sm font-medium @2xl:block">
              Lignes par page
            </p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-[72px]">
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Navigation : première / précédente / numéros / suivante / dernière */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden @md:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Première page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {pageNumbers.map((page, index) =>
            page === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1 text-sm text-muted-foreground"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <Button
                key={page}
                variant={page === currentPage ? "default" : "outline"}
                size="sm"
                className="min-w-8 px-2"
                onClick={() => table.setPageIndex(page - 1)}
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? "page" : undefined}
              >
                {page}
              </Button>
            ),
          )}

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden @md:flex"
            onClick={() => table.setPageIndex(totalPages - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Dernière page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
