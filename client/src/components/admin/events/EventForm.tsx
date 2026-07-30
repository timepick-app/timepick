import { useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { parseLocalDateTime, formatLocalDateTime } from '@/lib/datetime'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Label } from '@/components/ui/label'
import { ToggleSwitch } from '@/components/admin/ToggleSwitch'
import { FIELD_MAX_LENGTHS } from '@/components/admin/events/EventDetailsTab'
import { isRichTextEmpty } from '@/lib/richText'

/**
 * Props pour EventForm
 *
 * Story 18.6: Interface simplifiée - boutons gérés par le parent (EventFormPage)
 */
export interface EventFormProps {
  /** État de chargement pour désactiquer le formulaire pendant la soumission */
  isSubmitting?: boolean
  /**
   * Callback appelé à chaque changement du formulaire
   * Permet au parent de suivre les données pour des actions alternatives
   */
  onFormChange?: (data: EventFormData) => void
  /**
   * Erreur externe à afficher sur le champ nom (ex: nom dupliqué)
   * Utile pour afficher les erreurs serveur côté champ
   */
  nameError?: string | null
  /** Callback pour effacer l'erreur externe */
  onClearNameError?: () => void
}

/**
 * Données du formulaire de création d'événement
 *
 * Story 18.6: isPublished retiré (géré hors de ce formulaire — EventEditActions en édition / EventCreateBanner en création)
 * Story 18.2: opensAt reste configurable lors de la création
 */
export interface EventFormData {
  name: string
  description: string
  opensAt: string | null    // Story 18.2: Date d'ouverture (défaut: null)
}

/**
 * Interface pour les méthodes exposées via ref
 * Story 18.6: Permet au parent de déclencher la soumission et la validation
 */
export interface EventFormRef {
  /** Retourne true si le formulaire est valide */
  validate: () => boolean
  /** Soumet le formulaire si valide, retourne les données ou null si invalide */
  submit: () => EventFormData | null
  /** Retourne les données actuelles du formulaire */
  getData: () => EventFormData
}

/**
 * Retourne la date/heure actuelle au format datetime-local (YYYY-MM-DDTHH:mm)
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
 * EventForm
 *
 * Composant de formulaire pour la création d'événements.
 * Utilise des inputs contrôlés avec useState pour le state local.
 *
 * Features :
 * - Champ Nom (requis)
 * - Champ Description (optionnel)
 * - Champ Date d'ouverture des inscriptions (optionnel) - Story 18.2
 *
 * Story 18.6: Boutons supprimés (gérés par EventFormPage footer)
 * Story 18.6: Champ État supprimé (géré hors de ce formulaire — EventEditActions en édition / EventCreateBanner en création)
 * Story 18.6: Validation et soumission exposées via ref
 */
export const EventForm = forwardRef<EventFormRef, EventFormProps>(
  function EventForm({ isSubmitting = false, onFormChange, nameError: externalNameError, onClearNameError }: EventFormProps, ref) {
    // État local du formulaire avec valeurs par défaut
    const [formData, setFormData] = useState<EventFormData>({
      name: '',
      description: '',
      opensAt: null
    })

    // État de validation pour afficher les erreurs (null = pas d'erreur)
    const [localNameError, setLocalNameError] = useState<string | null>(null)

    // L'erreur affichée est soit l'erreur externe (serveur), soit l'erreur locale (validation)
    const nameError = externalNameError || localNameError

    // Derived state: toggle Date d'ouverture is ON when opensAt has a value
    const isScheduled = !!formData.opensAt

    /**
     * Notifie le parent des changements de données du formulaire
     */
    const notifyFormChange = useCallback((data: EventFormData) => {
      onFormChange?.(data)
    }, [onFormChange])

    /**
     * Gère le changement des champs texte/textarea
     * Masque l'erreur de validation lorsque l'utilisateur modifie le champ nom
     */
    const handleFieldChange = (field: keyof EventFormData, value: string) => {
      // Masquer l'erreur lorsque l'utilisateur modifie le champ nom
      if (field === 'name') {
        if (localNameError) {
          setLocalNameError(null)
        }
        if (externalNameError && onClearNameError) {
          onClearNameError()
        }
      }
      setFormData((prev) => {
        const newData = { ...prev, [field]: value }
        notifyFormChange(newData)
        return newData
      })
    }

    /**
     * Handler pour le toggle de programmation d'ouverture
     */
    const handleScheduledToggle = useCallback((checked: boolean) => {
      setFormData(prev => {
        const newData = {
          ...prev,
          opensAt: checked ? (prev.opensAt || getCurrentDateTimeLocal()) : null
        }
        notifyFormChange(newData)
        return newData
      })
    }, [notifyFormChange])

    /**
     * Valide le formulaire
     * @returns true si le formulaire est valide
     */
    const validate = useCallback((): boolean => {
      const trimmedName = formData.name.trim()
      if (!trimmedName) {
        setLocalNameError('Le nom de l\'événement est requis')
        return false
      }
      return true
    }, [formData.name])

    /**
     * Soumet le formulaire si valide
     * @returns Les données du formulaire si valide, null sinon
     */
    const submit = useCallback((): EventFormData | null => {
      if (!validate()) {
        return null
      }
      return {
        ...formData,
        // Normaliser l'éditeur vide (ex: <p></p>) en chaîne vide avant soumission
        description: isRichTextEmpty(formData.description) ? '' : formData.description,
      }
    }, [validate, formData])

    /**
     * Retourne les données actuelles du formulaire
     */
    const getData = useCallback((): EventFormData => {
      return formData
    }, [formData])

    // Expose les méthodes via ref
    useImperativeHandle(ref, () => ({
      validate,
      submit,
      getData
    }), [validate, submit, getData])

    return (
      <div className="space-y-6">
        {/* Champ Nom */}
        <div className="space-y-2">
          <Label htmlFor="event-name">
            Nom <span className="text-destructive">*</span>
          </Label>
          <Input
            id="event-name"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            placeholder="Ex: Tournoi de Tennis 2026"
            disabled={isSubmitting}
            required
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? 'name-error' : undefined}
            className={nameError ? 'border-destructive focus-visible:ring-destructive' : undefined}
          />
          {/* E1 — erreur rattachée à ce champ : inline, pas une bannière. */}
          {nameError && (
            <p id="name-error" className="text-xs text-destructive" role="alert">
              {nameError}
            </p>
          )}
        </div>

        {/* Champ Description */}
        <div className="space-y-2">
          <Label htmlFor="event-description" id="event-description-label">Description</Label>
          <RichTextEditor
            id="event-description"
            aria-labelledby="event-description-label"
            value={formData.description}
            onChange={(html) => handleFieldChange('description', isRichTextEmpty(html) ? '' : html)}
            placeholder="Décrivez votre événement..."
            maxLength={FIELD_MAX_LENGTHS.DESCRIPTION}
            disabled={isSubmitting}
            resizable
          />
        </div>

        {/* Champ Date d'ouverture des inscriptions - Story 18.2 */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="isScheduled" className="cursor-pointer min-w-0">
                Date d&apos;ouverture des inscriptions différée
              </Label>
              <ToggleSwitch
                id="isScheduled"
                checked={isScheduled}
                onCheckedChange={handleScheduledToggle}
                disabled={isSubmitting}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Les utilisateurs ne pourront réserver qu&apos;à partir de la date définie.
            </p>
          </div>
          <DateTimePicker
            id="opensAt"
            value={parseLocalDateTime(formData.opensAt)}
            onChange={(d) => {
              const newOpensAt = formatLocalDateTime(d) || null
              setFormData(prev => {
                const newData = { ...prev, opensAt: newOpensAt }
                notifyFormChange(newData)
                return newData
              })
            }}
            minDate={new Date()}
            disabled={isSubmitting || !isScheduled}
            className="w-full"
            aria-label="Date et heure d'ouverture des inscriptions"
            data-testid="opensAt-input"
          />
        </div>

        {/* Story 18.6: Boutons supprimés - gérés par EventFormPage footer */}
      </div>
    )
  }
)
