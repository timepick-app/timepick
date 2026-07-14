import { useMemo, useState } from 'react'
import { Mail, UserPlus, AlertTriangle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DataTable, DataTableBulkActions } from '@/components/ui/data-table'
import { EventCancellationNotificationsSection } from '@/components/admin/EventCancellationNotificationsSection'
import { getInvitesColumns, INVITE_STATUS_OPTIONS } from './invitesColumns'
import { AddInvitesDialog } from './AddInvitesDialog'
import { useInvitationStatus } from '@/hooks/useInvitationStatus'
import { useInvitations } from '@/hooks/useInvitations'
import { useInvitationEligibility } from '@/hooks/useInvitationEligibility'
import { useAdminSlots } from '@/hooks/useAdminSlots'
import { useRemoveEventUser } from '@/hooks/useEvents'

interface EventInvitesTabProps {
  eventId: string
  isPublished?: boolean
}

/**
 * Onglet « Invités » fusionné (Drawbridge #42/#43/#44).
 * Hub unique du cycle d'invitation : ajouter → envoyer → suivre → relancer →
 * retirer, sur une seule source (useInvitationStatus) et un seul tableau DS.
 * Remplace l'ancien empilement Invités + Emails→Invitations→(Envoyer|Statut).
 */
export function EventInvitesTab({ eventId, isPublished }: EventInvitesTabProps) {
  const { users, isLoading, error, refetch } = useInvitationStatus(eventId)
  const { sendInvitations, isSending, resendInvitation, isResending } = useInvitations(eventId)
  const { data: eligibility, isLoading: isCheckingEligibility } = useInvitationEligibility(eventId)
  const { slots = [] } = useAdminSlots(eventId)
  const { removeEventUser, isRemoving } = useRemoveEventUser()

  const [addOpen, setAddOpen] = useState(false)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<string[] | null>(null)

  const counts = useMemo(() => {
    const c = { total: users.length, pending: 0, sent: 0, clicked: 0, failed: 0 }
    for (const u of users) c[u.invitationStatus] += 1
    return c
  }, [users])

  const pendingIds = useMemo(
    () => users.filter((u) => u.invitationStatus === 'pending').map((u) => u.id),
    [users]
  )
  const currentIds = useMemo(() => users.map((u) => u.id), [users])

  const isMutating = isSending || isResending || isRemoving

  const showNotPublished = isPublished === false
  const showNoSlots = slots.length === 0
  const sendDisabledReason =
    eligibility && !eligibility.canSend
      ? eligibility.errorMessage || "Impossible d'envoyer des invitations"
      : null

  const columns = useMemo(
    () =>
      getInvitesColumns({
        onResend: resendInvitation,
        onRemove: (userId) => setRemoveTarget([userId]),
        isMutating,
      }),
    [resendInvitation, isMutating]
  )

  const toolbarActions = (
    <>
      <Button
        size="sm"
        onClick={() => setConfirmSendOpen(true)}
        disabled={
          pendingIds.length === 0 || isSending || isCheckingEligibility || !!sendDisabledReason
        }
        title={sendDisabledReason || undefined}
        aria-label={`Envoyer une invitation aux ${pendingIds.length} invités en attente`}
      >
        <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
        Envoyer ({pendingIds.length})
      </Button>
      <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} aria-label="Ajouter des invités">
        <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
        Ajouter
      </Button>
    </>
  )

  return (
    <div className="space-y-4">
      <EventCancellationNotificationsSection eventId={eventId} />

      {(showNotPublished || showNoSlots) && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {showNotPublished && showNoSlots
              ? 'Événement non publié et sans créneaux'
              : showNotPublished
                ? 'Événement non publié'
                : 'Aucun créneau défini'}
          </AlertTitle>
          <AlertDescription>
            Vous pouvez envoyer les invitations en avance, mais les invités ne pourront pas
            {showNotPublished ? ' accéder à l\'événement' : ''}
            {showNotPublished && showNoSlots ? ' ni' : ''}
            {showNoSlots ? ' réserver de créneau' : ''} tant que ce n'est pas corrigé.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <Typography variant="h3" as="h2">
          Invités &amp; invitations
        </Typography>
        <p className="text-sm text-muted-foreground">
          {counts.total} invité{counts.total > 1 ? 's' : ''} · {counts.pending} en attente ·{' '}
          {counts.sent} envoyée{counts.sent > 1 ? 's' : ''} · {counts.clicked} cliquée
          {counts.clicked > 1 ? 's' : ''} ·{' '}
          <span className={counts.failed > 0 ? 'font-medium text-destructive' : ''}>
            {counts.failed} échec{counts.failed > 1 ? 's' : ''}
          </span>
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Réessayer
          </Button>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            Aucun invité pour le moment. Ajoutez des invités pour commencer.
          </p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Ajouter des invités
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={users}
          getRowId={(u) => u.id}
          searchPlaceholder="Rechercher par nom ou email…"
          facetedFilters={[
            { columnId: 'invitationStatus', title: 'Statut', options: INVITE_STATUS_OPTIONS },
          ]}
          toolbarActions={toolbarActions}
          emptyMessage="Aucun invité avec ce statut."
          renderBulkActions={(table) => {
            const selected = table.getFilteredSelectedRowModel().rows
            const ids = selected.map((r) => r.original.id)
            return (
              <DataTableBulkActions table={table} entityName="invité(s)">
                <Button
                  size="sm"
                  disabled={isMutating}
                  onClick={() => {
                    sendInvitations({ userIds: ids })
                    table.resetRowSelection()
                  }}
                >
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  Envoyer ({ids.length})
                </Button>
                <Button
                  variant="outline-destructive"
                  size="sm"
                  disabled={isMutating}
                  onClick={() => setRemoveTarget(ids)}
                >
                  Retirer ({ids.length})
                </Button>
              </DataTableBulkActions>
            )
          }}
        />
      )}

      <AddInvitesDialog
        eventId={eventId}
        open={addOpen}
        onOpenChange={setAddOpen}
        currentSelectedIds={currentIds}
      />

      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envoyer les invitations</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point d'envoyer {pendingIds.length} invitation
              {pendingIds.length > 1 ? 's' : ''} par email.
              {(showNotPublished || showNoSlots) && (
                <span className="mt-2 block text-amber-600">
                  Attention :
                  {showNotPublished && " l'événement n'est pas encore publié."}
                  {showNoSlots && ' aucun créneau n\'est défini.'}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSendOpen(false)} disabled={isSending}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                sendInvitations({ userIds: pendingIds })
                setConfirmSendOpen(false)
              }}
              disabled={isSending || pendingIds.length === 0}
            >
              {isSending ? 'Envoi en cours...' : "Confirmer l'envoi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Retirer {removeTarget?.length ?? 0} invité{(removeTarget?.length ?? 0) > 1 ? 's' : ''} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(removeTarget?.length ?? 0) > 1 ? 'Ces personnes' : 'Cette personne'} n'auront plus
              accès à l'événement. Vous pourrez les ré-ajouter ensuite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeTarget?.forEach((id) => removeEventUser(eventId, id))
                setRemoveTarget(null)
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
