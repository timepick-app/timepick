import type { ColumnDef } from '@tanstack/react-table'
import type { LucideIcon } from 'lucide-react'
import {
  Clock,
  Info,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  MoreHorizontal,
} from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/ui/data-table'
import type { DataTableFacetOption } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatFullName } from '@/lib/formatFullName'
import type { InvitationStatusType, InvitationStatusUser } from '@/types/invitation'

export interface InvitesColumnsCallbacks {
  /** Renvoi (ou 1er envoi si pending) pour un invité. */
  onResend: (userId: string) => void
  /** Retrait d'un invité de l'événement. */
  onRemove: (userId: string) => void
  /** Désactive les actions de ligne pendant une mutation en vol. */
  isMutating: boolean
}

const STATUS_META: Record<
  InvitationStatusType,
  { label: string; variant: BadgeVariant; Icon: LucideIcon }
> = {
  pending: { label: 'En attente', variant: 'default', Icon: Clock },
  sent: { label: 'Envoyée', variant: 'info', Icon: Mail },
  clicked: { label: 'Cliquée', variant: 'success', Icon: CheckCircle2 },
  failed: { label: 'Échouée', variant: 'destructive', Icon: AlertCircle },
}

/** Options du filtre à facettes « Statut », dérivées de STATUS_META. */
export const INVITE_STATUS_OPTIONS: DataTableFacetOption[] = Object.entries(STATUS_META).map(
  ([value, m]) => ({ value, label: m.label, icon: m.Icon }),
)

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'

const fmtDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

/**
 * Colonnes du tableau « Invités » fusionné (Drawbridge #42/#43/#44).
 * Source : InvitationStatusUser (statut + dates + compteur d'envois).
 * La colonne « Dernier envoi » porte toute la trace d'envoi : date au repos,
 * indicateur ↻N si renvoyé, et tooltip détaillé (1er/dernier envoi, clic).
 */
export function getInvitesColumns(cb: InvitesColumnsCallbacks): ColumnDef<InvitationStatusUser>[] {
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
      id: 'name',
      accessorFn: (u) => formatFullName(u.firstName, u.lastName) || 'Sans nom',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invité" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
      meta: { label: 'Invité' },
      enableHiding: false,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
      meta: { label: 'Email', className: 'hidden md:table-cell' },
    },
    {
      id: 'role',
      accessorFn: (u) => u.role,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rôle" />,
      cell: ({ row }) => (
        <Badge size="sm" variant={row.original.role === 'admin' ? 'default' : 'success'}>
          {row.original.role === 'admin' ? 'Admin' : 'Membre'}
        </Badge>
      ),
      meta: { label: 'Rôle', className: 'hidden sm:table-cell' },
    },
    {
      accessorKey: 'selectedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ajouté le" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{fmtDate(row.original.selectedAt)}</span>
      ),
      meta: { label: 'Ajouté le', className: 'hidden lg:table-cell' },
    },
    {
      id: 'lastSent',
      accessorFn: (u) => u.sentAt,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dernier envoi" />,
      cell: ({ row }) => {
        const u = row.original
        if (u.sendCount < 1) {
          return <span className="text-muted-foreground">—</span>
        }
        const tooltip = `Envoyée ${u.sendCount}× · 1re le ${fmtDate(u.firstSentAt)} · dernière le ${fmtDateTime(u.sentAt)} · ${
          u.clickedAt ? `Cliquée le ${fmtDateTime(u.clickedAt)}` : 'non cliquée'
        }`
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                {fmtDate(u.sentAt)}
                {u.sendCount > 1 && (
                  <span className="inline-flex items-center gap-0.5 text-xs">
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    {u.sendCount}
                  </span>
                )}
                <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
          </Tooltip>
        )
      },
      meta: { label: 'Dernier envoi', className: 'hidden xl:table-cell' },
    },
    {
      accessorKey: 'invitationStatus',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Statut" />,
      cell: ({ row }) => {
        const meta = STATUS_META[row.original.invitationStatus]
        const Icon = meta.Icon
        return (
          <Badge size="sm" variant={meta.variant}>
            <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
            {meta.label}
          </Badge>
        )
      },
      meta: { label: 'Statut' },
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const u = row.original
        const name = formatFullName(u.firstName, u.lastName) || u.email
        const sendLabel =
          u.invitationStatus === 'pending' ? "Envoyer l'invitation" : "Renvoyer l'invitation"
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={cb.isMutating} onClick={() => cb.onResend(u.id)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {sendLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={cb.isMutating}
                onClick={() => cb.onRemove(u.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Retirer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-12 text-right' },
    },
  ]
}
