import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/ui/data-table'
import { calculatePeriodRange, formatPeriodCompact } from '@/lib/utils'
import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'
import { EventsRowActions } from './EventsRowActions'

/** Ligne du tableau Événements : combine Event et ses statistiques. */
export interface EventTableRow extends Event {
  stats?: EventStats
}

interface GetEventsColumnsHandlers {
  onEdit: (event: Event) => void
  onDuplicate: (event: Event) => void
  onDelete: (event: Event) => void
  isBusy?: boolean
}

/**
 * Colonnes du tableau Événements.
 * `meta.className` porte la responsivité (colonnes secondaires masquées sous sm/md/xl).
 */
export function getEventsColumns({
  onEdit,
  onDuplicate,
  onDelete,
  isBusy,
}: GetEventsColumnsHandlers): ColumnDef<EventTableRow>[] {
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
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Événement" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
      meta: { label: 'Événement' },
      enableHiding: false,
    },
    {
      id: 'isPublished',
      accessorFn: (event) => (event.isPublished ? 'published' : 'draft'),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Statut" />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.isPublished ? 'success' : 'draft'}>
          {row.original.isPublished ? 'Publié' : 'Brouillon'}
        </Badge>
      ),
      meta: { label: 'Statut' },
      filterFn: (row, id, value) =>
        (value as string[]).includes(row.getValue(id)),
    },
    {
      id: 'hasCustomInvitation',
      accessorFn: (event) =>
        event.hasCustomInvitation ? 'custom' : 'default',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Modèle" />
      ),
      cell: ({ row }) => {
        const isCustom = row.original.hasCustomInvitation
        return (
          <Badge
            variant={isCustom ? 'info' : 'default'}
            data-testid="event-template-badge"
            aria-label={
              isCustom ? 'Template personnalisé' : 'Template par défaut'
            }
          >
            {isCustom ? 'Personnalisé' : 'Défaut'}
          </Badge>
        )
      },
      meta: { label: 'Modèle', className: 'hidden sm:table-cell' },
      filterFn: (row, id, value) =>
        (value as string[]).includes(row.getValue(id)),
    },
    {
      id: 'slots',
      accessorFn: (event) => event.stats?.filledSlots ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Créneaux" />
      ),
      cell: ({ row }) => {
        const stats = row.original.stats
        if (!stats) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <span className="text-muted-foreground">
            {stats.filledSlots}/{stats.totalSlots}
          </span>
        )
      },
      meta: { label: 'Créneaux', className: 'hidden md:table-cell' },
    },
    {
      id: 'fillRate',
      accessorFn: (event) => event.stats?.fillRate ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Taux" />
      ),
      cell: ({ row }) => {
        const stats = row.original.stats
        if (!stats || stats.totalSlots === 0) {
          return <span className="text-muted-foreground">—</span>
        }
        const pct = stats.fillRate
        let variant: 'success' | 'warning' | 'default' = 'default'
        if (pct >= 80) variant = 'success'
        else if (pct >= 50) variant = 'warning'
        return (
          <Badge variant={variant} size="sm">
            {pct}%
          </Badge>
        )
      },
      meta: { label: 'Taux', className: 'hidden md:table-cell' },
    },
    {
      id: 'period',
      accessorFn: (event) => event.periodStart ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Période" />
      ),
      cell: ({ row }) => {
        const { periodStart, periodEnd } = row.original
        if (!periodStart || !periodEnd) {
          return <span className="text-muted-foreground">—</span>
        }
        const range = calculatePeriodRange([
          { startTime: periodStart, endTime: periodEnd },
        ])
        return (
          <>
            <span className="text-body-sm text-muted-foreground hidden xl:inline">
              {range?.formatted ?? '—'}
            </span>
            <span className="text-body-sm text-muted-foreground xl:hidden">
              {formatPeriodCompact(periodStart, periodEnd)}
            </span>
          </>
        )
      },
      meta: { label: 'Période', className: 'hidden sm:table-cell' },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <EventsRowActions
          event={row.original}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          disabled={isBusy}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-12 text-right' },
    },
  ]
}
