import { useState, useEffect } from 'react'
import { SheetShell } from '../SheetShell'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { Switch } from '@/components/ui/switch'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { useAdminSlots } from '../../hooks/useAdminSlots'
import { useInvitationStatus } from '../../hooks/useInvitationStatus'
import { isSlotCancelled, type Slot } from '@/types/slot'
import { AlertTriangle } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Badge } from '../ui/badge'
import { cn, isMultiDaySlot, formatSlotRange, formatSlotDuration } from '@/lib/utils'
import { parseLocalDate, parseLocalDateTime, formatLocalDateTime } from '@/lib/datetime'
import { SlotDeleteDialog } from './events/SlotDeleteDialog'
import { SlotRoster } from './SlotRoster'

type DialogMode = 'create' | 'edit'

interface SlotEditDialogProps {
  slot: Slot
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Helper pour convertir une date ISO en format datetime-local
 * Format attendu par input HTML: "YYYY-MM-DDTHH:mm"
 */
const toDateTimeLocal = (isoString: string): string => {
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * SlotEditDialog Component
 * Dialog pour créer ou modifier un créneau horaire
 *
 * Mode création (slot.id === 'new'):
 * - Utilise createSlot pour créer un nouveau créneau
 * - Pré-rempli avec les valeurs de la sélection calendrier
 * - Validation des champs (end_time > start_time, capacity > 0)
 *
 * Mode édition (slot.id !== 'new'):
 * - Utilise updateSlot pour modifier un créneau existant
 * - Pré-rempli avec les valeurs du créneau
 * - Affichage du nombre de réservations actuelles si > 0
 * - Validation: capacity >= current_bookings (si réservations existantes)
 */
export function SlotEditDialog({ slot, open, onOpenChange }: SlotEditDialogProps) {
  // Détecter automatiquement le mode: création si l'ID est 'new'
  const mode: DialogMode = slot.id === 'new' ? 'create' : 'edit'
  // Soft-delete : un créneau annulé est en lecture seule (aucune mutation possible)
  const cancelled = isSlotCancelled(slot)

  const { updateSlot, isUpdating, createSlotAsync, isCreating, deleteSlotAsync, isDeleting } = useAdminSlots(slot.eventId)
  const isPending = mode === 'create' ? isCreating : isUpdating || isDeleting
  const { users: invitees } = useInvitationStatus(slot.eventId)
  // Plancher de capacité : jamais sous le nombre d'inscrits (édition) ; 1 sinon.
  const minCapacity = Math.max(1, slot.currentBookings ?? 0)
  // Date d'annulation : parse défensif. `cancelledAt` peut être une chaîne
  // invalide ; date-fns throw sur une date invalide → on éviterait un crash écran.
  const cancelledAtDate = slot.cancelledAt ? new Date(slot.cancelledAt) : null
  const cancelledAtLabel =
    cancelledAtDate && !Number.isNaN(cancelledAtDate.getTime())
      ? format(cancelledAtDate, 'dd MMMM yyyy', { locale: fr })
      : 'date inconnue'

  // `date` = date de DÉBUT ; `endDate` = date de FIN (multi-jours).
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [capacity, setCapacity] = useState(slot.capacity)
  const [description, setDescription] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [autoAdjustNote, setAutoAdjustNote] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [notifyBookings, setNotifyBookings] = useState(true)

  // État original pour détecter les modifications (dirty state)
  const [originalValues, setOriginalValues] = useState({
    date: '',
    endDate: '',
    startTime: '',
    endTime: '',
    capacity: 1,
    description: ''
  })

  // Initialiser les champs avec les valeurs du slot lors de l'ouverture
  useEffect(() => {
    if (slot && open) {
      const startDateTime = toDateTimeLocal(slot.startTime)
      const endDateTime = toDateTimeLocal(slot.endTime)

      // Séparer date et heures — préserver la VRAIE date de fin (AC5 : avant,
      // seul `datePart` du début était conservé → date de fin perdue en édition
      // d'un créneau multi-jours).
      const [datePart, startPart] = startDateTime.split('T')
      const [endDatePart, endPart] = endDateTime.split('T')

      setDate(datePart)
      setEndDate(endDatePart)
      setStartTime(startPart)
      setEndTime(endPart)
      setCapacity(slot.capacity)
      setDescription(slot.description || '')
      setValidationError(null)
      setAutoAdjustNote(null)
      setNotifyBookings(true)

      // Sauvegarder les valeurs originales pour le dirty state
      setOriginalValues({
        date: datePart,
        endDate: endDatePart,
        startTime: startPart,
        endTime: endPart,
        capacity: slot.capacity,
        description: slot.description || ''
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.id, slot.startTime, slot.endTime, slot.capacity, open])

  // Détecter si des modifications ont été faites (dirty state)
  const hasChanges =
    date !== originalValues.date ||
    endDate !== originalValues.endDate ||
    startTime !== originalValues.startTime ||
    endTime !== originalValues.endTime ||
    capacity !== originalValues.capacity ||
    description !== originalValues.description

  const validateForm = (): boolean => {
    if (!date || !endDate || !startTime || !endTime) {
      setValidationError('Tous les champs sont obligatoires')
      return false
    }

    // Créer les objets Date complets pour une validation correcte
    const startDateTime = new Date(`${date}T${startTime}`)
    const endDateTime = new Date(`${endDate}T${endTime}`)

    // Valider que la date/heure de fin est après la date/heure de début
    if (endDateTime <= startDateTime) {
      setValidationError('La date/heure de fin doit être après le début')
      return false
    }

    if (capacity <= 0) {
      setValidationError('La capacité doit être supérieure à 0')
      return false
    }

    if (description.length > 500) {
      setValidationError('La description ne peut pas dépasser 500 caractères')
      return false
    }

    // En mode édition uniquement, vérifier que la capacité n'est pas réduite
    // en dessous des réservations existantes
    if (mode === 'edit' && capacity < minCapacity) {
      setValidationError(
        `La capacité ne peut pas être inférieure à ${minCapacity} (${slot.currentBookings ?? 0} réservation(s) existante(s)).`
      )
      return false
    }

    setValidationError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Lecture seule : un créneau annulé ne peut pas être modifié (garde-fou en
    // plus du bouton masqué et des champs désactivés ; le serveur renvoie 409).
    if (cancelled) {
      return
    }

    if (!validateForm()) {
      return
    }

    // Combiner date et heures pour créer des objets Date complets
    const startDateTime = new Date(`${date}T${startTime}`)
    const endDateTime = new Date(`${endDate}T${endTime}`)

    try {
      // Mode création: utiliser createSlotAsync et attendre le succès
      if (mode === 'create') {
        await createSlotAsync({
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          capacity,
          description: description || undefined,
        })
        // Fermer le dialog uniquement après succès de la création
        onOpenChange(false)
      } else {
        // Mode édition: utiliser updateSlot avec onSuccess callback
        updateSlot(slot.id, {
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          capacity,
          description: description || undefined,
          notifyBookings,
          onSuccess: () => onOpenChange(false), // Fermer le dialog uniquement après succès
        })
      }
    } catch {
      // Les erreurs sont gérées par le hook (toast), ne rien faire ici
    }
  }

  // Plage combinée (datetime local naïf : `YYYY-MM-DDTHH:mm`).
  const startISO = date && startTime ? `${date}T${startTime}` : ''
  const endISO = endDate && endTime ? `${endDate}T${endTime}` : ''
  const bothComplete = !!(startISO && endISO)
  const startValue = parseLocalDateTime(startISO)
  const endValue = parseLocalDateTime(endISO)

  // Incohérence de plage (fin <= début) → surligne le champ de fin en temps réel.
  const endBeforeStart = bothComplete && new Date(endISO) <= new Date(startISO)
  // Multi-jours : badge + récap. Jamais affichés en mono-jour (FR12) ni sur une
  // plage incohérente (on montre l'erreur, pas un badge trompeur).
  const isMultiDay = bothComplete && !endBeforeStart && isMultiDaySlot(startISO, endISO)
  const rangeLabel = isMultiDay ? formatSlotRange(startISO, endISO) : ''
  const durationLabel = isMultiDay ? formatSlotDuration(startISO, endISO) : ''
  // Avertissement non bloquant : durée anormalement longue (> 7 jours).
  const spannedDays = isMultiDay
    ? differenceInCalendarDays(new Date(endISO), new Date(startISO)) + 1
    : 0
  const showLongWarning = spannedDays > 7

  const isFormValid =
    !!(date && endDate && startTime && endTime) &&
    capacity > 0 &&
    new Date(endISO) > new Date(startISO)

  // Saisie d'une date de début : pré-remplir la date de fin si elle était
  // synchronisée (mono-jour) — défaut zéro-friction (AC1). Si l'utilisateur a
  // déjà fixé une date de fin distincte, on ne l'écrase pas.
  const handleStartDateChange = (value: string) => {
    setEndDate((prev) => (prev === '' || prev === date ? value : prev))
    setDate(value)
  }

  // Adaptateurs DateTimePicker (valeurs `Date`) ↔ état interne (chaînes locales).
  const handleStartChange = (d: Date | null) => {
    if (!d) {
      handleStartDateChange('')
      setStartTime('')
      setAutoAdjustNote(null)
      return
    }
    const [datePart, timePart] = formatLocalDateTime(d).split('T')
    handleStartDateChange(datePart)
    setStartTime(timePart)

    // Zéro-friction : si la fin (après le sync de date ci-dessus) tombe <= début,
    // la recaler en CONSERVANT la durée précédente (repli 1 h) — évite de re-saisir
    // la fin. On n'agit JAMAIS sur une fin encore valide (préserve le contrôle).
    const syncedEndDate = endDate === '' || endDate === date ? datePart : endDate
    const currentEnd = syncedEndDate && endTime ? new Date(`${syncedEndDate}T${endTime}`) : null
    if (currentEnd && currentEnd <= d) {
      const prevStart = date && startTime ? new Date(`${date}T${startTime}`) : null
      const durationMs =
        prevStart && currentEnd.getTime() > prevStart.getTime()
          ? currentEnd.getTime() - prevStart.getTime()
          : 60 * 60 * 1000
      const bumped = new Date(d.getTime() + durationMs)
      const [bumpedDate, bumpedTime] = formatLocalDateTime(bumped).split('T')
      setEndDate(bumpedDate)
      setEndTime(bumpedTime)
      const when =
        bumpedDate !== datePart
          ? `au ${format(bumped, "d MMMM yyyy 'à' HH:mm", { locale: fr })}`
          : `à ${format(bumped, 'HH:mm', { locale: fr })}`
      setAutoAdjustNote(`Fin ajustée automatiquement ${when} (durée conservée).`)
    } else {
      setAutoAdjustNote(null)
    }
  }
  const handleEndChange = (d: Date | null) => {
    setAutoAdjustNote(null)
    if (!d) {
      setEndDate('')
      setEndTime('')
      return
    }
    const [datePart, timePart] = formatLocalDateTime(d).split('T')
    setEndDate(datePart)
    setEndTime(timePart)
  }

  return (
    <>
      {/* Gardes onInteractOutside/onEscapeKeyDown : empêchent le Sheet de se
          fermer pendant que l'AlertDialog de suppression est ouvert (sibling
          dialogs, portails Radix indépendants). */}
      <SheetShell
        open={open}
        onOpenChange={onOpenChange}
        title={
          cancelled ? (
            <span className="flex items-center gap-2">
              Créneau annulé
              <Badge variant="error" size="sm">Annulé</Badge>
            </span>
          ) : mode === 'create' ? (
            'Nouveau créneau'
          ) : (
            'Modifier le créneau'
          )
        }
        onInteractOutside={(e) => { if (deleteDialogOpen) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (deleteDialogOpen) e.preventDefault() }}
        footer={
          <div className="flex w-full flex-col gap-3">
            {/* Erreur de validation générale — dans le footer figé, toujours visible
                au clic (le corps scrollable la cachait jusqu'ici). */}
            {validationError && (
              <Banner variant="destructive" density="compact">
                <BannerDescription>{validationError}</BannerDescription>
              </Banner>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Supprimer (= annuler) — édition, créneau non annulé. Déclenchable
                  même avec des réservations (soft-delete). */}
              {mode === 'edit' && !cancelled && (
                <Button
                  type="button"
                  variant="outline-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isPending}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Supprimer
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Fermer
              </Button>

              {/* Enregistrer hors du <form> (footer du shell) → soumission via
                  l'attribut form="slot-form". Masqué en lecture seule. */}
              {!cancelled && (
                <Button
                  type="submit"
                  form="slot-form"
                  disabled={!isFormValid || isPending || (mode === 'edit' && !hasChanges)}
                >
                  {isPending
                    ? 'Enregistrement...'
                    : mode === 'create'
                      ? 'Créer'
                      : 'Enregistrer'}
                </Button>
              )}
            </div>

            {/* Conséquence de l'action, en caption sous les boutons (remplace l'intro). */}
            {!cancelled && mode === 'edit' && (
              <p className="text-xs text-muted-foreground">
                Les modifications sont appliquées immédiatement.
              </p>
            )}
          </div>
        }
      >
        <form id="slot-form" onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Bandeau lecture seule pour un créneau annulé (soft-delete) */}
          {cancelled && (
            <Banner role="status">
              <BannerDescription>
                <p>
                  Annulé le {cancelledAtLabel}.
                </p>
                {slot.cancellationReason && (
                  <p className="mt-1">
                    Motif : {slot.cancellationReason}
                  </p>
                )}
              </BannerDescription>
            </Banner>
          )}

          {/* Groupe « Plage horaire » : début + fin + feedbacks de plage collés. */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-start">Date et heure de début *</Label>
                <DateTimePicker
                  id="edit-start"
                  value={startValue}
                  onChange={handleStartChange}
                  disabled={cancelled}
                  compact
                  aria-label="Date et heure de début"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-end">Date et heure de fin *</Label>
                <DateTimePicker
                  id="edit-end"
                  value={endValue}
                  onChange={handleEndChange}
                  minDate={parseLocalDate(date) ?? undefined}
                  disabled={cancelled}
                  compact
                  aria-label="Date et heure de fin"
                  aria-invalid={endBeforeStart || undefined}
                  aria-describedby={endBeforeStart ? 'edit-end-error' : autoAdjustNote ? 'edit-end-autoadjust' : undefined}
                  className={cn(endBeforeStart && 'border-destructive focus-visible:ring-destructive')}
                />
              </div>
            </div>

            {/* Incohérence de plage : message clair sous les champs (AC3). */}
            {endBeforeStart && (
              <p id="edit-end-error" role="alert" aria-live="polite" className="text-xs text-destructive">
                La date/heure de fin doit être après le début.
              </p>
            )}

            {/* Confirmation neutre du recalage auto de la fin (a11y : annoncée poliment).
                Calque la grammaire du message d'erreur ci-dessus, en ton neutre. */}
            {autoAdjustNote && (
              <p id="edit-end-autoadjust" role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {autoAdjustNote}
              </p>
            )}

            {/* Badge multi-jours + récap de plage (jamais en mono-jour → FR12). */}
            {isMultiDay && (
              <div className="flex flex-col gap-1.5">
                <Badge variant="info" className="self-start">
                  Multi-jours · {durationLabel}
                </Badge>
                <p className="text-sm text-muted-foreground">{rangeLabel}</p>
              </div>
            )}

            {/* Avertissement non bloquant : durée anormalement longue (> 7 jours). */}
            {showLongWarning && (
              <Banner variant="warning" role="status">
                <AlertTriangle aria-hidden="true" />
                <BannerDescription>
                  Ce créneau dure {spannedDays} jours. Vérifiez la plage avant d'enregistrer.
                </BannerDescription>
              </Banner>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* Groupe « Capacité & occupation » : champ → avertissement plancher →
              preuve (roster). Proximité cause → contrainte → preuve. */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="edit-capacity">Capacité (nombre de participants) *</Label>
              <Input
                id="edit-capacity"
                type="number"
                min={minCapacity}
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10) || minCapacity)}
                onBlur={() => setCapacity((c) => Math.max(minCapacity, c || minCapacity))}
                required
                disabled={cancelled}
              />
              {/* Plancher silencieux : la capacité est bornée au nombre d'inscrits.
                  Indication neutre (pas une alerte) ; le roster ci-dessous fait foi. */}
              {mode === 'edit' && (slot.currentBookings ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Minimum : {slot.currentBookings ?? 0} (inscrits actuels)
                </p>
              )}
              {invitees.length > 0 && capacity > invitees.length && (
                <p className="text-xs text-muted-foreground">
                  La capacité dépasse le nombre d'invités ({invitees.length})
                </p>
              )}
              {invitees.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Aucun invité sélectionné pour cet événement
                </p>
              )}
            </div>

            {/* Roster des inscrits (lecture seule) — édition uniquement. */}
            {mode === 'edit' && (
              <SlotRoster
                volunteers={slot.volunteers}
                currentBookings={slot.currentBookings ?? 0}
                capacity={capacity}
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              placeholder="Ajouter une description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              className="min-h-[80px] resize-none"
              disabled={cancelled}
            />
            {/* Compteur discret : visible seulement à l'approche de la limite (> 80 %). */}
            {description.length >= 400 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {description.length}/500 caractères
                </p>
                {description.length >= 475 && (
                  <p className="text-xs text-muted-foreground">Limite de caractères presque atteinte</p>
                )}
              </div>
            )}
          </div>

          {mode === 'edit' && (slot.currentBookings ?? 0) > 0 && (
            <>
              <div className="h-px bg-border" />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="notify-bookings">
                    Notifier les {slot.currentBookings ?? 0} inscrit{(slot.currentBookings ?? 0) > 1 ? 's' : ''}
                  </Label>
                  <Switch
                    id="notify-bookings"
                    checked={notifyBookings}
                    onCheckedChange={setNotifyBookings}
                    disabled={cancelled}
                    aria-describedby="notify-bookings-help"
                  />
                </div>
                <p id="notify-bookings-help" className="text-xs text-muted-foreground">
                  {notifyBookings
                    ? 'Les inscrits seront prévenus des modifications d\u2019horaire et de description.'
                    : 'Aucune notification ne sera envoyée.'}
                </p>
              </div>
            </>
          )}
        </form>
      </SheetShell>
      {mode === 'edit' && (
        <SlotDeleteDialog
          slot={slot}
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open)
            if (!open) onOpenChange(false) // Close edit dialog after delete
          }}
          onConfirm={async (slotId, cancellationReason, hadReservations) => {
            try {
              await deleteSlotAsync(slotId, cancellationReason, hadReservations)
              setDeleteDialogOpen(false)
              onOpenChange(false)
            } catch {
              // Error handled by hook
            }
          }}
          isDeleting={isDeleting}
        />
      )}
    </>
  )
}
