import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpeningDateInput } from '../OpeningDateInput'
import type { Event } from '../../../hooks/useEvents'

// Mock du hook useUpdateOpeningDate
const mockUpdateOpeningDate = vi.fn()
vi.mock('../../../hooks/useEvents', () => ({
  useUpdateOpeningDate: () => ({
    updateOpeningDate: mockUpdateOpeningDate,
    isUpdating: false,
  }),
  // Preserve other exports
  useUpdateEvent: vi.fn(),
  getEventPublicUrl: vi.fn(),
  type: { Event: {} },
}))

describe('OpeningDateInput', () => {
  const mockEventWithoutDate: Event = {
    id: '123',
    name: 'Test Event',
    description: 'Test description',
    isPublished: false,
    opensAt: null,
    hasCustomInvitation: false,
    periodStart: null,
    periodEnd: null,
    createdAt: '2026-01-19T10:00:00Z',
    updatedAt: '2026-01-19T10:00:00Z',
  }

  const mockEventWithDate: Event = {
    ...mockEventWithoutDate,
    opensAt: '2026-02-01T09:00:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Mode affichage (EventCard)', () => {
    it('affiche "+ Ajouter une date d\'ouverture" si pas de date', () => {
      render(<OpeningDateInput event={mockEventWithoutDate} />)

      expect(screen.getByText("+ Ajouter une date d'ouverture")).toBeInTheDocument()
    })

    it('affiche la date formatée si définie', () => {
      render(<OpeningDateInput event={mockEventWithDate} />)

      expect(screen.getByText(/Ouvre le/)).toBeInTheDocument()
      // Note: L'heure est convertie en heure locale (UTC+1), donc 09h00 UTC devient 10h00
      expect(screen.getByText(/1er février 2026 à 10h00/)).toBeInTheDocument()
    })

    it('affiche l\'heure formatée avec "h"', () => {
      const eventWithTime: Event = {
        ...mockEventWithoutDate,
        opensAt: '2026-02-01T14:30:00Z',
      }

      render(<OpeningDateInput event={eventWithTime} />)

      // Note: L'heure est convertie en heure locale (UTC+1), donc 14h30 UTC devient 15h30
      expect(screen.getByText(/15h30/)).toBeInTheDocument()
    })

    it('affiche le bouton Modifier quand une date est définie', () => {
      render(<OpeningDateInput event={mockEventWithDate} />)

      expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    })

    it('n\'affiche pas le bouton Modifier quand aucune date n\'est définie', () => {
      render(<OpeningDateInput event={mockEventWithoutDate} />)

      expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    })
  })

  describe('Mode édition', () => {
    it('ouvre le mode édition quand on clique sur Modifier', async () => {
      const user = userEvent.setup()
      render(<OpeningDateInput event={mockEventWithDate} />)

      const modifierButton = screen.getByRole('button', { name: 'Modifier' })
      await user.click(modifierButton)

      expect(screen.getByLabelText(/Date d'ouverture des inscriptions/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
    })

    it('ouvre le mode édition quand on clique sur Ajouter', async () => {
      const user = userEvent.setup()
      render(<OpeningDateInput event={mockEventWithoutDate} />)

      const ajouterButton = screen.getByText("+ Ajouter une date d'ouverture")
      await user.click(ajouterButton)

      expect(screen.getByLabelText(/Date d'ouverture des inscriptions/)).toBeInTheDocument()
    })

    it('appelle updateOpeningDate après sauvegarde avec une date', async () => {
      // Fige Date pour que le calendrier ouvre sur février 2026 et que
      // « aujourd'hui » soit déterministe.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-02-10T12:00:00'))
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<OpeningDateInput event={mockEventWithoutDate} />)

        // Ouvrir le mode édition
        const ajouterButton = screen.getByText("+ Ajouter une date d'ouverture")
        await user.click(ajouterButton)

        // Ouvrir le popover du DateTimePicker
        const trigger = screen.getByLabelText(/Date d'ouverture des inscriptions/)
        await user.click(trigger)

        // Sélectionner le 15 février (jour non ambigu : les jours hors mois
        // affichés sont seulement fin janvier et le 1er mars).
        await user.click(within(screen.getByRole('grid')).getByText('15'))

        // Régler l'heure à 09:00 via les colonnes du popover
        await user.click(
          within(screen.getByRole('listbox', { name: 'Heures' })).getByRole('option', { name: '09' })
        )

        // Sauvegarder
        const enregistrerButton = screen.getByRole('button', { name: /Enregistrer/ })
        await user.click(enregistrerButton)

        await waitFor(() => {
          // Note: L'heure locale 09h00 est convertie en UTC (08h00 pour UTC+1)
          expect(mockUpdateOpeningDate).toHaveBeenCalledWith('123', '2026-02-15T08:00:00.000Z')
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('appelle updateOpeningDate avec null pour supprimer la date', async () => {
      const user = userEvent.setup()
      render(<OpeningDateInput event={mockEventWithDate} />)

      // Ouvrir le mode édition
      const modifierButton = screen.getByRole('button', { name: 'Modifier' })
      await user.click(modifierButton)

      // Supprimer
      const supprimerButton = screen.getByRole('button', { name: /Supprimer/ })
      await user.click(supprimerButton)

      await waitFor(() => {
        expect(mockUpdateOpeningDate).toHaveBeenCalledWith('123', null)
      })
    })
  })
})
