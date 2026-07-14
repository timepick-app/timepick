import { useEffect, useMemo, useState } from 'react'
import {
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type VisibilityState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTableContent, DataTablePagination, DataTableViewOptions } from '@/components/ui/data-table'
import type { User } from '@/types/user'
import { getUsersColumns } from './usersColumns'
import { UsersBulkActions } from './UsersBulkActions'

const ROLE_ALL = 'all'

export interface UsersDataTableProps {
  users: User[]
  /** Index de page (0-based). */
  pageIndex: number
  pageSize: number
  pageCount: number
  isLoading?: boolean
  /** Message d'erreur de chargement ; rendu dans la table avec « Réessayer ». */
  error?: string | null
  onRetry?: () => void
  search: string
  onSearchChange: (value: string) => void
  role: '' | 'user' | 'admin'
  onRoleChange: (value: '' | 'user' | 'admin') => void
  onPaginationChange: (next: PaginationState) => void
  onEdit: (user: User) => void
  onViewDetails: (userId: string) => void
  onDelete: (user: User) => void
}

/**
 * Tableau Membres basé sur le DataTable du design system, en mode serveur :
 * recherche / filtre rôle / pagination pilotés par l'API ; sélection multiple
 * (page courante) + suppression en masse + visibilité des colonnes côté client.
 */
export function UsersDataTable({
  users,
  pageIndex,
  pageSize,
  pageCount,
  isLoading = false,
  search,
  onSearchChange,
  role,
  onRoleChange,
  onPaginationChange,
  onEdit,
  onViewDetails,
  onDelete,
  error,
  onRetry,
}: UsersDataTableProps) {
  const columns = useMemo(
    () => getUsersColumns({ onEdit, onViewDetails, onDelete }),
    [onEdit, onViewDetails, onDelete]
  )

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const pagination: PaginationState = { pageIndex, pageSize }

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater
    onPaginationChange(next)
  }

  const table = useReactTable({
    data: users,
    columns,
    state: { rowSelection, columnVisibility, pagination },
    manualPagination: true,
    pageCount,
    enableRowSelection: true,
    getRowId: (row) => row.id,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })

  // La sélection est limitée à la page courante : on la réinitialise dès que la
  // liste chargée change (changement de page, de recherche ou de filtre rôle).
  useEffect(() => {
    table.resetRowSelection()
  }, [users, table])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* Barre d'outils */}
      <div className="border-b p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              size="sm"
              className="pl-9 pr-9"
              placeholder="Rechercher par email ou nom..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSearchChange('')}
                className="absolute right-1.5 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
                aria-label="Effacer la recherche"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={role === '' ? ROLE_ALL : role}
              onValueChange={(value) =>
                onRoleChange(value === ROLE_ALL ? '' : (value as 'user' | 'admin'))
              }
            >
              <SelectTrigger size="sm" className="w-full sm:w-48" aria-label="Filtrer par rôle">
                <SelectValue placeholder="Tous les rôles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROLE_ALL}>Tous les rôles</SelectItem>
                <SelectItem value="user">Membres</SelectItem>
                <SelectItem value="admin">Administrateurs</SelectItem>
              </SelectContent>
            </Select>
            <Separator orientation="vertical" className="hidden h-6 lg:block" />
            <DataTableViewOptions table={table} />
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTableContent
        table={table}
        columnCount={columns.length}
        isLoading={isLoading}
        error={error || undefined}
        onRetry={onRetry}
        emptyMessage={
          search ? `Aucun membre trouvé pour "${search}"` : 'Aucun membre trouvé'
        }
        onRowActivate={onEdit}
      />

      {/* Pagination */}
      <div className="border-t p-3">
        <DataTablePagination table={table} />
      </div>

      <UsersBulkActions table={table} />
    </div>
  )
}
