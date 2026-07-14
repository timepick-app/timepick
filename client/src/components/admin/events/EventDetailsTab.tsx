import { useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { parseLocalDateTime, formatLocalDateTime } from '@/lib/datetime'
import { ToggleSwitch } from '@/components/admin/ToggleSwitch'
import { useUpdateEvent, type Event, getEventPublicUrl } from '@/hooks/useEvents'
import type { UseUpdateEventOptions } from '@/hooks/useEvents'
import { isRichTextEmpty, normalizeStoredDescription } from '@/lib/richText'

/**
 * Props pour EventDetailsTab
 */
interface EventDetailsTabProps {
  /** Données de l'événement à modifier */
  event: Event
  /** Callback appelé après sauvegarde réussie */
  onSaved?: () => void
  /** Callback appelé quand l'état dirty change (pour protection hasUnsavedChanges) */
  onDirtyChange?: (isDirty: boolean) => void
  /** Callback appelé quand le nom change dans le formulaire (pour validation temps réel) */
  onNameChange?: (name: string) => void
}

/**
 * Interface pour les méthodes exposées via ref
 * Story 18.6: Permet au parent de déclencher la sauvegarde et l'annulation
 */
export interface EventDetailsTabRef {
  /** Sauvegarde les modifications, retourne true si succès */
  save: () => Promise<boolean>
  /** Annule les modifications (réinitialise le formulaire) */
  cancel: () => void
  /** Retourne true si le formulaire a des modifications non sauvegardées */
  isDirty: () => boolean
}

/**
 * Longueurs maximales des champs
 * Exporté pour permettre aux tests de vérifier la cohérence
 */
export const FIELD_MAX_LENGTHS = {
  NAME: 200,
  DESCRIPTION: 5000
} as const

/**
 * Initialise les données du formulaire avec trim uniforme
 * @param event - L'événement source contenant les données à initialiser
 * @returns Les données du formulaire initialisées avec les valeurs trimées
 */
function initializeFormData(event: Event): EventFormData {
  return {
    name: event.name.trim(),
    description: normalizeStoredDescription(event.description),
    opensAt: event.opensAt ? getDateTimeLocalValue(event.opensAt) : null
  }
}

/**
 * Convertit une date ISO en valeur datetime-local (YYYY-MM-DDTHH:mm)
 */
function getDateTimeLocalValue(isoString: string): string {
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Retourne la date/heure actuelle au format datetime-local
 */
function getCurrentDateTimeLocal(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Données du formulaire pour l'édition d'un événement
 * Note: isPublished est géré hors de ce formulaire (EventEditActions en édition / EventCreateBanner en création), pas par ce formulaire
 */
interface EventFormData {
  name: string
  description: string
  opensAt: string | null  // Single source of truth - null means OFF, value means ON
}

/**
 * EventDetailsTab Component
 *
 * Onglet Détails de la page d'édition d'un événement.
 * Formulaire avec champs : Nom, Description, Date ouverture
 *
 * Story 18.6: Boutons supprimés (gérés par EventFormPage footer)
 * Story 18.6: Sauvegarde et annulation exposées via ref
 *
 * Note: Le champ État (isPublished) a été déplacé hors de ce formulaire — EventEditActions (édition) / EventCreateBanner (création) (Story 18.1)
 *
 * @see Story 11.2: Onglet Détails - Formulaire Événement
 * @see Story 18.1: Extraction Publication Transversale
 */
export const EventDetailsTab = forwardRef<EventDetailsTabRef, EventDetailsTabProps>(
  function EventDetailsTab({ event, onSaved, onDirtyChange, onNameChange }: EventDetailsTabProps, ref) {
    // Clé unique basée sur l'identité de l'event (id + updatedAt) pour détecter les remplacements d'objet
    // Utiliser updatedAt garantit que le useEffect se déclenche après chaque mise à jour via mutation
    const eventKey = `${event.id}-${event.updatedAt}`

    // État local du formulaire (trim les valeurs pour éviter les bugs de comparaison)
    const [formData, setFormData] = useState<EventFormData>(() => initializeFormData(event))

    // État original pour détecter les modifications et réinitialiser
    const [originalData, setOriginalData] = useState<EventFormData>(() => initializeFormData(event))

    // État pour le feedback visuel lors de la copie du lien
    const [copiedToClipboard, setCopiedToClipboard] = useState(false)

    // Derived state: toggle is ON when opensAt has a value
    const isScheduled = !!formData.opensAt

    // Resync du formulaire quand l'identité de l'event change (ex: après sauvegarde réussie).
    // Ajustement pendant le rendu (pattern React) plutôt qu'un setState dans un effet : React
    // relance le rendu avec les nouvelles valeurs, sans double affichage. eventKey (id+updatedAt)
    // détecte le remplacement de l'objet event après mutation.
    const [prevEventKey, setPrevEventKey] = useState(eventKey)
    if (eventKey !== prevEventKey) {
      setPrevEventKey(eventKey)
      const newData = initializeFormData(event)
      setFormData(newData)
      setOriginalData(newData)
    }

    // Notifier le parent du nom courant (onNameChange = setState parent → doit rester hors
    // du rendu, donc dans un effet ; déclenché au montage et à chaque changement d'event).
    useEffect(() => {
      onNameChange?.(initializeFormData(event).name)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `event` volontairement omis : eventKey (id+updatedAt) est le détecteur de remplacement de l'event ; ajouter `event` re-déclencherait onNameChange à chaque rendu (identité d'objet instable).
    }, [eventKey, onNameChange])

    // Options pour useUpdateEvent avec callbacks après succès/erreur
    const updateEventOptions: UseUpdateEventOptions = {
      onSuccess: (_updatedEvent) => {
        // onDirtyChange(false) sera appelé automatiquement quand l'event sera rechargé :
        // 1. L'invalidation du cache déclenche useEventDetails dans EventFormPage
        // 2. EventFormPage rerender avec le nouvel event (updatedAt différent)
        // 3. Le useEffect avec eventKey met à jour originalData = formData
        // 4. isDirty devient false, ce qui déclenche le useEffect onDirtyChange
        onSaved?.()
      },
      onError: () => {
        // En cas d'erreur, les modifications sont conservées dans le formulaire (comportement par défaut)
        // Le toast d'erreur est déjà affiché par le hook useUpdateEvent
      }
    }

    const { updateEvent, isUpdating } = useUpdateEvent(updateEventOptions)

    /**
     * Détecte si le formulaire a des modifications non sauvegardées
     * Note: isPublished n'est pas inclus car géré hors de ce formulaire (EventEditActions en édition / EventCreateBanner en création)
     */
    const isDirtyState = useMemo(() => {
      return (
        formData.name !== originalData.name ||
        formData.description !== originalData.description ||
        formData.opensAt !== (originalData.opensAt || null)
      )
    }, [formData, originalData])

    // Notifier le parent des changements d'état dirty
    useEffect(() => {
      onDirtyChange?.(isDirtyState)
    }, [isDirtyState, onDirtyChange])

    /**
     * Mise à jour d'un champ du formulaire
     */
    const handleChange = useCallback((field: keyof EventFormData, value: string | boolean | null) => {
      setFormData(prev => {
        if (field === 'opensAt') {
          // When opensAt changes directly, update it
          return { ...prev, [field]: value as string | null }
        }
        return { ...prev, [field]: value }
      })
      // Notifier le parent quand le nom change (pour validation temps réel du bouton Créer)
      if (field === 'name' && typeof value === 'string') {
        onNameChange?.(value)
      }
    }, [onNameChange])

    /**
     * Handler pour le toggle de programmation d'ouverture
     */
    const handleScheduledToggle = useCallback((checked: boolean) => {
      setFormData(prev => ({
        ...prev,
        opensAt: checked ? (prev.opensAt || getCurrentDateTimeLocal()) : null
      }))
    }, [])

    /**
     * Handler pour copier l'URL publique de l'événement
     */
    const handleCopyUrl = useCallback(async () => {
      try {
        const publicUrl = getEventPublicUrl(event.id)
        await navigator.clipboard.writeText(publicUrl)
        setCopiedToClipboard(true)
        // Reset the "copied" state after 2 seconds
        setTimeout(() => setCopiedToClipboard(false), 2000)
      } catch {
        // Fallback for older browsers or if clipboard API fails
        const publicUrl = getEventPublicUrl(event.id)
        const textArea = document.createElement('textarea')
        textArea.value = publicUrl
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        try {
          document.execCommand('copy')
          setCopiedToClipboard(true)
          setTimeout(() => setCopiedToClipboard(false), 2000)
        } catch {
          toast.error('Impossible de copier le lien')
        }
        document.body.removeChild(textArea)
      }
    }, [event.id])

    /**
     * Handler Sauvegarder : envoyer les modifications via mutation
     * Story 18.6: Exposé via ref pour être appelé depuis le footer de EventFormPage
     * Note: onSaved() sera appelé via le callback onSuccess de useUpdateEvent,
     * une fois la mutation réussie et le cache invalidé.
     * Note: isPublished est géré hors de ce formulaire (EventEditActions en édition / EventCreateBanner en création), pas par ce formulaire.
     */
    const handleSave = useCallback(async (): Promise<boolean> => {
      if (!formData.name.trim()) {
        toast.error('Le nom de l\'événement est obligatoire')
        return false
      }

      // Calculer opensAt pour l'API
      const opensAtChanged = formData.opensAt !== (originalData.opensAt || null)
      const opensAtToSend = formData.opensAt
        ? new Date(formData.opensAt).toISOString()
        : null

      // Construire l'objet de données - n'inclure opensAt que s'il a changé
      const updateData: { name: string; description: string | null; opensAt?: string | null } = {
        name: formData.name.trim(),
        description: isRichTextEmpty(formData.description) ? null : formData.description,
      }

      // N'envoyer opensAt que s'il a changé (pour éviter les erreurs de validation)
      if (opensAtChanged) {
        updateData.opensAt = opensAtToSend
      }

      try {
        await updateEvent(event.id, updateData)

        // IMPORTANT: Ne PAS mettre à jour originalData ici
        // Laisser le useEffect avec eventKey gérer la mise à jour quand l'event sera rechargé
        // Cela évite une race condition où originalData est mis à jour avant le rechargement

        // Note: onSaved() sera appelé automatiquement par le callback onSuccess
        // quand la mutation réussira et que l'event sera rechargé depuis l'API
        return true
      } catch (error) {
        console.error('[EventDetailsTab] Save failed:', error)
        return false
      }
    }, [event.id, formData, originalData, updateEvent])

    /**
     * Handler Annuler : réinitialiser le formulaire aux valeurs originales
     * Story 18.6: Exposé via ref pour être appelé depuis le footer de EventFormPage
     */
    const handleCancel = useCallback(() => {
      setFormData(originalData)
      onDirtyChange?.(false)
    }, [originalData, onDirtyChange])

    // Expose les méthodes via ref
    useImperativeHandle(ref, () => ({
      save: handleSave,
      cancel: handleCancel,
      isDirty: () => isDirtyState
    }), [handleSave, handleCancel, isDirtyState])

    return (
      <div className="space-y-6">
        {/* Champ Nom */}
        <div className="space-y-2 mb-4">
          <Label htmlFor="name">
            Nom de l&apos;événement <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            aria-describedby="name-counter"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Ex: Fête de l&apos;école 2026"
            maxLength={FIELD_MAX_LENGTHS.NAME}
            disabled={isUpdating}
            required
          />
          <p id="name-counter" className="text-xs text-muted-foreground">
            {formData.name.length}/{FIELD_MAX_LENGTHS.NAME} caractères
          </p>
        </div>

        {/* Champ Description */}
        <div className="space-y-2 mb-4">
          <Label htmlFor="description" id="description-label">Description</Label>
          <RichTextEditor
            id="description"
            aria-labelledby="description-label"
            value={formData.description}
            onChange={(html) => handleChange('description', isRichTextEmpty(html) ? '' : html)}
            placeholder="Décrivez votre événement..."
            maxLength={FIELD_MAX_LENGTHS.DESCRIPTION}
            disabled={isUpdating}
            resizable
          />
        </div>

        {/* Champ Date ouverture des inscriptions */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="opensAt" className="cursor-pointer">
              Date d&apos;ouverture des inscriptions
            </Label>
            <ToggleSwitch
              id="isScheduled"
              checked={isScheduled}
              onCheckedChange={handleScheduledToggle}
              disabled={isUpdating}
            />
          </div>

          <div className="space-y-1">
            <DateTimePicker
              id="opensAt"
              value={parseLocalDateTime(formData.opensAt)}
              onChange={(d) => handleChange('opensAt', formatLocalDateTime(d) || null)}
              minDate={new Date()}
              disabled={isUpdating || !isScheduled}
              className="w-full"
              aria-label="Date et heure d'ouverture des inscriptions"
              data-testid="opensAt-input"
            />
            <p className="text-xs text-muted-foreground">
              {isScheduled
                ? 'Les inscriptions ouvriront à cette date et heure'
                : 'Activez le toggle pour programmer l\'ouverture des inscriptions'}
            </p>
          </div>
        </div>

        {/* Champ URL publique */}
        <div className="space-y-2 mb-4">
          <Label htmlFor="publicUrl">Lien de l&apos;événement</Label>
          <div className="flex gap-2">
            <Input
              id="publicUrl"
              value={getEventPublicUrl(event.id)}
              readOnly
              className="bg-muted text-muted-foreground cursor-text select-all"
              aria-describedby="copy-hint"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopyUrl}
              aria-label="Copier le lien"
              title="Copier le lien"
            >
              {copiedToClipboard ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              asChild
              variant="outline"
              size="icon"
              aria-label="Ouvrir le lien dans un nouvel onglet"
              title="Ouvrir le lien dans un nouvel onglet"
            >
              <a
                href={getEventPublicUrl(event.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
          <p id="copy-hint" className="text-xs text-muted-foreground">
            {copiedToClipboard
              ? 'Lien copié !'
              : 'Partagez ce lien avec les participants pour leur permettre de réserver des créneaux.'}
          </p>
        </div>

        {/* Story 18.6: Boutons supprimés - gérés par EventFormPage footer */}
      </div>
    )
  }
)
