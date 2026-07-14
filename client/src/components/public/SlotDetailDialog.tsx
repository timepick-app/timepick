import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Info } from 'lucide-react'
import { cn, isMultiDaySlot, formatSlotDuration, formatTimeRangeFrench } from '../../lib/utils'
import type { SlotDetailDialogProps } from '../../types/slot'
import { getSlotStatusDescriptor } from '@/lib/slotStatus'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '@/components/ui/button'
import { SlotStatusBadge } from '@/components/ui/SlotStatusBadge'
import { Badge } from '../ui/badge'
import { Banner, BannerTitle, BannerDescription } from '../ui/banner'

/**
 * SlotDetailDialog — dialog de détail / réservation d'un créneau (espace membre).
 *
 * Refonte « ultra-compact » (DS / shadcn-admin) : l'identité du créneau (le
 * « quand ») porte l'en-tête — jour(s) en titre, heures (+ durée multi-jours)
 * en sous-titre. Le corps n'expose qu'UNE zone d'état, choisie par priorité
 * (annulé > passé > consultatif > complet > réservé/disponible), alimentée par
 * la source unique `slotStatus` (statut, libellé, jetons couleur). La jauge de
 * remplissage et l'encart « places restantes » géant ont été retirés : la
 * capacité tient désormais dans une seule phrase accessible (`bannerLabel`).
 */
export function SlotDetailDialog({
  slot,
  open,
  onOpenChange,
  onBook,
  isBooking = false,
  isConsultative = false,
  opensAtDate = null,
  hasBooked = false,
  onCancel,
  isCancelling = false,
}: SlotDetailDialogProps) {
  if (!slot) return null

  // Statut sémantique unifié (palette + libellés + ordre de priorité partagés).
  const { status, bannerLabel, classes } = getSlotStatusDescriptor(slot, { hasBooked })

  // Plage multi-jours (FR12) : libellés enrichis si début et fin tombent des
  // jours calendaires LOCAUX différents (cf. isMultiDaySlot, DST-safe).
  const isMulti = isMultiDaySlot(slot.startTime, slot.endTime)
  // En-tête = identité « quand » : jour(s) en titre, heures en sous-titre.
  const day = (iso: string) => format(new Date(iso), 'eee d MMM', { locale: fr })
  const dayLabel = isMulti ? `${day(slot.startTime)} → ${day(slot.endTime)}` : day(slot.startTime)
  const timeLabel = formatTimeRangeFrench(slot.startTime, slot.endTime)

  // Réservable : créneau ouvert (disponible / partiel) ET inscriptions ouvertes.
  // Les états annulé / passé / complet / réservé excluent déjà disponible|partiel.
  const canBook = (status === 'available' || status === 'partial') && !isConsultative

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="slot-detail-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dayLabel}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>{timeLabel}</span>
            {isMulti && (
              <Badge variant="info">{formatSlotDuration(slot.startTime, slot.endTime)}</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Zone d'état UNIQUE — priorité figée annulé > passé > consultatif > complet > réservé/dispo */}
          {status === 'cancelled' ? (
            <Banner variant="warning" role="status">
              <BannerTitle>Créneau annulé</BannerTitle>
              <BannerDescription>
                L'organisateur a annulé ce créneau. Vous n'avez plus rien à faire.
                {slot.cancellationReason && (
                  <p className="mt-2">
                    <span className="font-medium">Motif : </span>
                    {slot.cancellationReason}
                  </p>
                )}
              </BannerDescription>
            </Banner>
          ) : status === 'past' ? (
            <div className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
              Ce créneau est passé. Les inscriptions et annulations ne sont plus possibles.
            </div>
          ) : isConsultative && !hasBooked ? (
            <Banner variant="warning" role="status">
              <Info className="h-4 w-4" aria-hidden="true" />
              <BannerTitle>Inscriptions non ouvertes</BannerTitle>
              <BannerDescription>
                {opensAtDate
                  ? `Les inscriptions ouvrent le ${opensAtDate}`
                  : 'Les réservations ne sont pas encore ouvertes.'}
              </BannerDescription>
            </Banner>
          ) : status === 'full' ? (
            <div
              data-testid="slot-full-message"
              className={cn('rounded-md border p-3 text-sm', classes.surface)}
            >
              Ce créneau est complet. Veuillez en choisir un autre.
            </div>
          ) : (
            // disponible | partiel | réservé : pastille + une seule phrase d'état.
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <SlotStatusBadge slot={slot} hasBooked={hasBooked} />
              <span className="text-muted-foreground">{bannerLabel}</span>
            </p>
          )}

          {/* Contexte éditorial libre du créneau, si renseigné. */}
          {slot.description && status !== 'cancelled' && status !== 'past' && (
            <p className="text-sm text-muted-foreground">{slot.description}</p>
          )}

        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCancelling}>
            Fermer
          </Button>
          {canBook && onBook && (
            <Button
              data-testid="reserve-slot-button"
              onClick={() => onBook(slot.id)}
              disabled={isBooking || !canBook}
            >
              {isBooking
                ? 'Réservation...'
                : isMulti
                  ? `Réserver les ${formatSlotDuration(slot.startTime, slot.endTime)}`
                  : 'Réserver ce créneau'}
            </Button>
          )}
          {status === 'reserved' && onCancel && (
            <Button
              variant="outline-destructive"
              data-testid="cancel-reservation-button"
              onClick={onCancel}
              disabled={isCancelling}
            >
              {isCancelling ? 'Annulation...' : 'Annuler'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
