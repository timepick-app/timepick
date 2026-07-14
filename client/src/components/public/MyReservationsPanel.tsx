import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { differenceInMinutes } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { cn, formatSlotRangeCompact, isMultiDaySlot } from '../../lib/utils'
import { Button } from '../ui/button'
import { SlotStatusBadge } from '@/components/ui/SlotStatusBadge'
import { isActiveBooking } from '../../types/booking'
import type { Booking } from '../../types/booking'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '../../components/ui/accordion'

/**
 * Props pour le composant MyReservationsPanel
 */
export interface MyReservationsPanelProps {
  /** Liste des réservations de l'utilisateur */
  reservations: Booking[]
  /** Callback quand l'utilisateur clique sur annuler */
  onCancel?: (slotId: string) => void
  /** Callback quand l'utilisateur veut voir les détails du créneau */
  onViewSlot?: (slotId: string) => void
  /** ID du slot en cours d'annulation (pour afficher l'état de chargement) */
  isCancelling?: string
  /**
   * Variante de rendu (Story 1.6).
   * - `'full'` (défaut) : panneau complet (accordion mobile + bloc desktop)
   *   — rendu public `/event/:uuid` byte-identique.
   * - `'compact'` : liste condensée 1 ligne/réservation + récap, pour montage
   *   dans un Popover/Sheet (header membre Story 1.6). Aucun chrome externe
   *   (l'overlay hôte fournit le conteneur).
   */
  variant?: 'full' | 'compact'
  /** Classe CSS additionnelle */
  className?: string
}

/**
 * Composant MyReservationsPanel
 *
 * Affiche la liste des réservations de l'utilisateur connecté avec:
 * - Compteur de réservations
 * - Liste triée par date chronologique
 * - Badge "Réservé" pour chaque réservation
 * - Boutons d'action (Annuler, Voir détails)
 *
 * Story 6.7 - Consulter Mes Réservations
 */
export function MyReservationsPanel({
  reservations,
  onCancel,
  onViewSlot,
  isCancelling,
  variant = 'full',
  className,
}: MyReservationsPanelProps) {
  // Trier les réservations par date chronologique
  // Note: Si slot est undefined (réservation orpheline), on utilise 0 pour la mettre en premier
  const sortedReservations = [...reservations].sort((a, b) => {
    const dateA = a.slot ? new Date(a.slot.startTime).getTime() : 0
    const dateB = b.slot ? new Date(b.slot.startTime).getTime() : 0
    return dateA - dateB
  })

  const hasReservations = sortedReservations.length > 0
  // Réservations actives (slot présent + NON annulé par l'organisateur) et
  // décompte des créneaux annulés. Le récap compact (durée + compte) et les
  // chips full ne comptabilisent QUE les actifs ; les annulés apparaissent à
  // part (pastille « Annulé » dans les lignes, « N annulé(s) » dans le récap).
  const activeReservations = sortedReservations.filter(isActiveBooking)
  const activeCount = activeReservations.length
  const cancelledCount = sortedReservations.filter((b) => b.slot?.cancelledAt != null).length

  // Calculer le temps total de participation
  const totalMinutes = activeReservations.reduce((total, booking) => {
    if (!booking.slot) return total // Ignorer les réservations orphelines
    const slotDuration = differenceInMinutes(
      new Date(booking.slot.endTime),
      new Date(booking.slot.startTime)
    )
    return total + slotDuration
  }, 0)

  const totalHours = Math.floor(totalMinutes / 60)
  const totalMinutesRemainder = totalMinutes % 60
  const totalTimeLabel = `${totalHours}h${totalMinutesRemainder.toString().padStart(2, '0')}`

  // Shared reservations list content (rendered in both mobile accordion and desktop panel)
  const reservationsList = (
    <>
      {!hasReservations ? (
        // État vide
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <svg
            className="h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Aucune réservation
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Réservez votre premier créneau pour voir vos réservations ici.
          </p>
        </div>
      ) : (
        // Liste des réservations
        <div className="space-y-3">
          {sortedReservations.map((booking) => {
            const cancelling = isCancelling === booking.slotId
            const slot = booking.slot
            const slotCancelled = slot?.cancelledAt != null

            return (
              <div
                key={booking.id}
                data-testid={`reservation-item-${booking.slotId}`}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 transition-colors hover:bg-gray-100"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Informations de la réservation */}
                  <div className="flex-1">
                    {/* Nom de l'événement */}
                    <p className="text-sm font-medium text-gray-900">
                      {booking.eventName}
                    </p>

                    {/* Date et heure */}
                    {slot ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <span>
                          {format(new Date(slot.startTime), 'dd MMMM yyyy', {
                            locale: fr,
                          })}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span>
                          {format(new Date(slot.startTime), 'HH:mm', { locale: fr })} -{' '}
                          {format(new Date(slot.endTime), 'HH:mm', { locale: fr })}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">
                        Détails du créneau non disponibles
                      </p>
                    )}

                    {/* Pastille statut : « Annulé » si l'organisateur a annulé le créneau, sinon « Réservé ».
                        booking.slot ne porte pas currentBookings → on force le statut. */}
                    <SlotStatusBadge
                      status={slotCancelled ? 'cancelled' : 'reserved'}
                      className="mt-2"
                    />

                    {/* Motif d'annulation (si saisi) */}
                    {slotCancelled && slot?.cancellationReason && (
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-medium">Motif : </span>
                        {slot.cancellationReason}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Bouton Voir les détails */}
                    {onViewSlot && slot && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewSlot(booking.slotId)}
                        disabled={cancelling}
                      >
                        Voir les détails
                      </Button>
                    )}

                    {/* Bouton Annuler — masqué si le créneau est déjà annulé (rien à faire) */}
                    {onCancel && !slotCancelled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onCancel(booking.slotId)}
                        disabled={cancelling}
                        className="hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        {cancelling ? 'Annulation...' : 'Annuler'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  // ----------------------------------------------------------------------
  // Variante compact (Story 1.6) — liste condensée pour Popover/Sheet membre.
  // Aucun chrome externe (l'overlay hôte fournit le conteneur). Récap bilatéral
  // (actifs/durée + « N annulé(s) »), séparateurs internes (divide-y), 1
  // ligne/réservation : créneau actif → bouton « Annuler » neutre + hover
  // destructif ; créneau annulé → pastille « Annulé » + heure barrée +
  // « par l'organisateur ». Durée/comptes calculés sur les actifs uniquement.
  // ----------------------------------------------------------------------
  if (variant === 'compact') {
    return (
      <div data-testid="my-reservations-panel-compact" className={cn('space-y-1', className)}>
        {/* Récap bilatéral : actifs/durée (gauche) + annulés (droite, si > 0) */}
        <div className="flex items-center justify-between gap-2 border-b px-2 pb-2 text-xs">
          <span className="font-medium text-foreground">
            {activeCount > 0
              ? `${activeCount} créneau${activeCount > 1 ? 'x' : ''} · ${totalTimeLabel}`
              : 'Aucun créneau actif'}
          </span>
          {cancelledCount > 0 && (
            <span className="text-muted-foreground">
              {cancelledCount} annulé{cancelledCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {/* Liste condensée — 1 ligne/réservation, séparateurs internes */}
        <ul className="divide-y divide-border">
          {sortedReservations.map((booking) => {
            const slot = booking.slot
            const cancelling = isCancelling === booking.slotId
            const slotCancelled = slot?.cancelledAt != null
            return (
              <li
                key={booking.id}
                data-testid={`reservation-compact-${booking.slotId}`}
                className={cn(
                  'flex items-center justify-between gap-3 px-2 py-2.5',
                  !slotCancelled && 'hover:bg-muted/50',
                )}
              >
                <div className="min-w-0 flex-1 truncate text-sm">
                  {slot ? (
                      <span className="block truncate">
                        {isMultiDaySlot(slot.startTime, slot.endTime) ? (
                          <span
                            className={cn(
                              'whitespace-nowrap text-muted-foreground tabular-nums',
                              slotCancelled && 'line-through',
                            )}
                          >
                            {formatSlotRangeCompact(slot.startTime, slot.endTime)}
                          </span>
                        ) : (
                          <>
                            <span className="font-medium text-foreground">
                              {format(new Date(slot.startTime), 'd MMM', { locale: fr })}
                            </span>
                            <span
                              className={cn(
                                'ml-2 whitespace-nowrap text-muted-foreground tabular-nums',
                                slotCancelled && 'line-through',
                              )}
                            >
                              {formatSlotRangeCompact(slot.startTime, slot.endTime)}
                            </span>
                          </>
                        )}
                      </span>
                  ) : (
                    <span className="text-muted-foreground">Créneau indisponible</span>
                  )}
                </div>
                {slotCancelled ? (
                  <SlotStatusBadge status="cancelled" className="shrink-0" />
                ) : onCancel && slot ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0 hover:border-red-300 hover:bg-red-50 hover:text-red-700 md:h-8"
                    aria-label={`Annuler la réservation du ${format(new Date(slot.startTime), 'd MMM', { locale: fr })}`}
                    onClick={() => onCancel(booking.slotId)}
                    disabled={cancelling}
                    data-testid={`reservation-cancel-${booking.slotId}`}
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Annulation…
                      </>
                    ) : (
                      'Annuler'
                    )}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <>
      {/* Mobile: Accordion version (< 768px) */}
      <Accordion
        type="single"
        collapsible
        defaultValue="reservations"
        className="md:hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <AccordionItem value="reservations" className="border-none">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50">
            <div className="flex items-center justify-between w-full pr-4">
              <h3 className="text-lg font-semibold text-gray-900">Mes réservations</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  Total : {totalTimeLabel}
                </span>
                {activeCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {activeCount} réservation{activeCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {reservationsList}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Desktop: Standard panel version (>= 768px) */}
      <div
        data-testid="my-reservations-panel"
        className={cn('hidden md:block rounded-lg border border-gray-200 bg-white shadow-sm', className)}
      >
        {/* En-tête avec compteur */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6">
          <h3 className="text-lg font-semibold text-gray-900">Mes réservations</h3>
          <div className="flex items-center gap-2">
            {/* Total time - always visible */}
            <span className="text-sm text-gray-600">
              Total : {totalTimeLabel}
            </span>
            {activeCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {activeCount} réservation{activeCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Contenu */}
        <div className="p-4 sm:p-6">
          {reservationsList}
        </div>
      </div>
    </>
  )
}
