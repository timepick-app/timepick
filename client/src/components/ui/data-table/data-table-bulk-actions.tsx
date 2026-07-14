import { useEffect, type ReactNode } from "react"
import type { Table } from "@tanstack/react-table"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface DataTableBulkActionsProps<TData> {
  table: Table<TData>
  /** Libellé d'entité au pluriel, ex. « membre(s) ». */
  entityName?: string
  /** Boutons d'actions groupées injectés par le consommateur. */
  children?: ReactNode
  className?: string
}

/**
 * Barre flottante d'actions groupées. Invisible tant qu'aucune ligne n'est
 * sélectionnée. `Échap` désélectionne tout.
 */
export function DataTableBulkActions<TData>({
  table,
  entityName = "élément(s)",
  children,
  className,
}: DataTableBulkActionsProps<TData>) {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length

  useEffect(() => {
    if (selectedCount === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") table.resetRowSelection()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedCount, table])

  if (selectedCount === 0) return null

  return (
    <div
      role="toolbar"
      aria-label="Actions groupées"
      aria-orientation="horizontal"
      className={cn(
        "fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border bg-card px-3 py-2 text-card-foreground shadow-lg",
        className
      )}
    >
      <span aria-live="polite" className="whitespace-nowrap text-sm font-medium">
        {selectedCount} {entityName} sélectionné(s)
      </span>
      <Separator orientation="vertical" className="h-5" />
      {children}
      <Separator orientation="vertical" className="h-5" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => table.resetRowSelection()}
        aria-label="Désélectionner tout"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
