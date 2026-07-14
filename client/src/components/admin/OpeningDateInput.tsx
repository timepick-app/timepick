import { useState } from 'react'
import { useUpdateOpeningDate } from '../../hooks/useEvents'
import type { Event } from '../../hooks/useEvents'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '../ui/button'
import { DateTimePicker } from '../ui/date-time-picker'
import { Label } from '../ui/label'
import { parseLocalDateTime, formatLocalDateTime } from '../../lib/datetime'

interface OpeningDateInputProps {
  event: Event
}

/**
 * Formatage de date lisible en français selon l'AC: "1er février 2026 à 09h00"
 * @param dateString - Date ISO 8601
 * @returns Date formatée (ex: "1er février 2026 à 09h00")
 */
const formatOpeningDate = (dateString: string): string => {
  const date = new Date(dateString)
  const day = date.getDate()
  const month = format(date, 'MMMM', { locale: fr })
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  // Gestion du "1er" pour le premier jour du mois
  const dayStr = day === 1 ? '1er' : `${day}`

  return `${dayStr} ${month} ${year} à ${hours}h${minutes}`
}

/**
 * OpeningDateInput Component
 *
 * Affichage en mode liste pour EventCard.
 * Montre un badge avec la date d'ouverture et un bouton Modifier.
 *
 * NOTE: Ce composant n'a PAS de mode inline - c'est uniquement pour l'affichage.
 * EventDetailsTab utilise ToggleSwitch directement pour l'édition.
 */
export function OpeningDateInput({ event }: OpeningDateInputProps) {
  const { updateOpeningDate, isUpdating } = useUpdateOpeningDate()
  const [isOpen, setIsOpen] = useState(false)

  // Convertir la date existante (ISO) en chaîne locale datetime-local pour l'état
  const getDateTimeLocalValue = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const [localValue, setLocalValue] = useState(getDateTimeLocalValue(event.opensAt))

  const handleSave = async () => {
    try {
      if (localValue) {
        const date = new Date(localValue)
        await updateOpeningDate(event.id, date.toISOString())
      } else {
        await updateOpeningDate(event.id, null)
      }
      setIsOpen(false)
    } catch {
      // Erreur gérée dans le hook
    }
  }

  const handleClear = async () => {
    try {
      await updateOpeningDate(event.id, null)
      setLocalValue('')
      setIsOpen(false)
    } catch {
      // Erreur gérée dans le hook
    }
  }

  // Mode affichage (toujours affiché dans EventCard)
  if (!isOpen) {
    if (event.opensAt) {
      return (
        <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
          <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm text-amber-800">
            Ouvre le <strong>{formatOpeningDate(event.opensAt)}</strong>
          </span>
          <Button
            variant="link"
            size="sm"
            onClick={() => setIsOpen(true)}
            disabled={isUpdating}
            className="ml-auto text-xs text-amber-700 hover:text-amber-900"
          >
            Modifier
          </Button>
        </div>
      )
    }
    return (
      <Button
        variant="link"
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        + Ajouter une date d&apos;ouverture
      </Button>
    )
  }

  // Mode édition
  return (
    <div className="space-y-2 p-3 border rounded-md bg-gray-50">
      <Label htmlFor="opening-date-input">
        Date d&apos;ouverture des inscriptions
      </Label>

      <DateTimePicker
        id="opening-date-input"
        value={parseLocalDateTime(localValue)}
        onChange={(d) => setLocalValue(formatLocalDateTime(d))}
        disabled={isUpdating}
        aria-label="Date d'ouverture des inscriptions"
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {event.opensAt && (
          <Button
            variant="ghost"
            onClick={handleClear}
            disabled={isUpdating}
            size="sm"
            className="mr-auto text-red-600 hover:text-red-800"
          >
            Supprimer
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            setIsOpen(false)
            setLocalValue(getDateTimeLocalValue(event.opensAt))
          }}
          disabled={isUpdating}
          size="sm"
        >
          Fermer
        </Button>
        <Button
          onClick={handleSave}
          disabled={isUpdating || !localValue}
          size="sm"
        >
          {isUpdating ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}
