import { format, isValid } from 'date-fns'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatFullName } from '@/lib/formatFullName'
import type { User } from '@/types/user'
import { UsersRowActions } from './UsersRowActions'

interface UsersColumnsHandlers {
  onEdit: (user: User) => void
  onViewDetails: (userId: string) => void
  onDelete: (user: User) => void
}

/**
 * Colonnes du tableau Membres. Tri non activé (la liste est triée côté serveur).
 * `meta.className` porte la responsivité (colonnes secondaires masquées sous md/lg)
 * et est appliquée à la fois sur l'en-tête et les cellules.
 */
export function getUsersColumns({
  onEdit,
  onViewDetails,
  onDelete,
}: UsersColumnsHandlers): ColumnDef<User>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Tout sélectionner"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Sélectionner la ligne"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-10' },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.email}</span>
      ),
      meta: { label: 'Email' },
      enableHiding: false,
    },
    {
      id: 'name',
      header: 'Nom',
      accessorFn: (user) => formatFullName(user.firstName, user.lastName) || '-',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue<string>()}</span>
      ),
      meta: { label: 'Nom' },
    },
    {
      accessorKey: 'role',
      header: 'Rôle',
      cell: ({ row }) =>
        row.original.role === 'admin' ? (
          <Badge variant="default" size="sm">Admin</Badge>
        ) : (
          <Badge variant="success" size="sm">Membre</Badge>
        ),
      meta: { label: 'Rôle' },
    },
    {
      accessorKey: 'bookingCount',
      header: 'Réservations',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.bookingCount ?? 0}</span>
      ),
      meta: { label: 'Réservations', className: 'hidden lg:table-cell' },
    },
    {
      accessorKey: 'createdAt',
      header: 'Inscrit le',
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt)
        return (
          <span className="text-muted-foreground">
            {isValid(date) ? format(date, 'dd/MM/yyyy') : '—'}
          </span>
        )
      },
      meta: { label: 'Inscrit le', className: 'hidden md:table-cell' },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <UsersRowActions
          user={row.original}
          onEdit={onEdit}
          onViewDetails={onViewDetails}
          onDelete={onDelete}
        />
      ),
      meta: { className: 'w-12 text-right' },
    },
  ]
}
