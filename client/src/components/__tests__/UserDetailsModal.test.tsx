import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserDetailsModal } from '../UserDetailsModal'
import type { UserWithBookings } from '../../types/user'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn()
  }
}))

import api from '../../services/api'

// La fiche rend un <Link> (titre d'événement) → wrapper Router obligatoire.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const mockUser: UserWithBookings = {
  id: '123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  phone: '+33612345678',
  role: 'user',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  bookingCount: 2,
  hasMemberAccess: false,
  bookings: [
    {
      id: 'b1',
      slotId: 's1',
      eventId: 'event-1',
      eventName: 'Fête de la musique',
      startTime: '2026-01-15T09:00:00',
      endTime: '2026-01-15T10:00:00',
      createdAt: '2026-01-10T00:00:00'
    },
    {
      id: 'b2',
      slotId: 's2',
      eventId: 'event-2',
      eventName: 'Vendanges nocturnes',
      startTime: '2026-01-20T14:00:00',
      endTime: '2026-01-20T15:00:00',
      createdAt: '2026-01-10T00:00:00'
    }
  ]
}

describe('UserDetailsModal', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock implementation par défaut de l'API
    ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockUser })
  })

  describe('Render', () => {
    it('affiche le titre du modal', () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)
      expect(screen.getByText('Détails du membre')).toBeInTheDocument()
    })

    it('affiche un état de chargement initial', () => {
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {})) // Pending promise
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)
      expect(screen.getByText('Chargement...')).toBeInTheDocument()
    })

    it('affiche les informations de l\'utilisateur après chargement', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument()
        expect(screen.getByText('test@example.com')).toBeInTheDocument()
      })
    })

    it('affiche les initiales du membre dans l\'avatar unifié', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        // Test User → TU
        expect(screen.getByText('TU')).toBeInTheDocument()
      })
    })

    it('affiche le badge de rôle admin', async () => {
      const adminUser = { ...mockUser, role: 'admin' as const }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: adminUser })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Administrateur')).toBeInTheDocument()
      })
    })

    it('affiche le badge de rôle utilisateur', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Membre')).toBeInTheDocument()
      })
    })

    it('affiche "Sans nom" quand le nom est absent', async () => {
      const userWithoutName = { ...mockUser, firstName: null, lastName: null }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userWithoutName })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Sans nom')).toBeInTheDocument()
      })
    })

    it('affiche "-" quand phone est null', async () => {
      const userWithoutPhone = { ...mockUser, phone: null }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userWithoutPhone })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        const phoneElement = screen.getByText('Téléphone').parentElement?.querySelector('p')
        expect(phoneElement).toHaveTextContent('-')
      })
    })

    it('affiche profession si renseignée', async () => {
      const userWithProfession = { ...mockUser, profession: 'Comptable', informations: null }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userWithProfession })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Profession')).toBeInTheDocument()
        expect(screen.getByText('Comptable')).toBeInTheDocument()
      })
    })

    it('n\'affiche pas le label Profession si vide', async () => {
      const userWithoutProfession = { ...mockUser, profession: null, informations: null }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userWithoutProfession })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Profession')).not.toBeInTheDocument()
      })
    })

    it('affiche informations si renseignées', async () => {
      const userWithInfo = { ...mockUser, profession: null, informations: 'Notes importantes\nsur ce membre' }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userWithInfo })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Informations')).toBeInTheDocument()
        expect(screen.getByText('Notes importantes sur ce membre')).toBeInTheDocument()
      })
    })

    it('n\'affiche pas le label Informations si vide', async () => {
      const userWithoutInfo = { ...mockUser, profession: null, informations: null }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userWithoutInfo })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Informations')).not.toBeInTheDocument()
      })
    })
  })

  describe('Réservations', () => {
    it('affiche le nombre de réservations', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument() // bookingCount = 2
      })
    })

    it('affiche la liste des réservations avec le nom de l\'événement', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Historique des réservations')).toBeInTheDocument()
        expect(screen.getByText('Fête de la musique')).toBeInTheDocument()
        expect(screen.getByText('Vendanges nocturnes')).toBeInTheDocument()
      })
    })

    it('affiche la date et la plage horaire (séparateur flèche)', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText(/15 janv\. · 09h00 → 10h00/)).toBeInTheDocument()
        expect(screen.getByText(/20 janv\. · 14h00 → 15h00/)).toBeInTheDocument()
      })
    })

    it('le nom de l\'événement est un lien vers la fiche événement', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'Fête de la musique' })
        expect(link).toHaveAttribute('href', '/admin/events/event-1/edit')
      })
    })

    it('réservation multi-jours : affiche les deux dates reliées par la flèche', async () => {
      const userMultiDay: UserWithBookings = {
        ...mockUser,
        bookingCount: 1,
        bookings: [
          {
            id: 'bmd',
            slotId: 'smd',
            eventId: 'event-9',
            eventName: 'Nuit blanche',
            startTime: '2026-06-17T22:00:00',
            endTime: '2026-06-18T05:00:00',
            createdAt: '2026-06-01T00:00:00'
          }
        ]
      }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userMultiDay })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText(/17 juin 22h00 → 18 juin 05h00/)).toBeInTheDocument()
      })
    })

    it('affiche "Aucune réservation" quand pas de réservations', async () => {
      const userWithoutBookings = { ...mockUser, bookings: [], bookingCount: 0 }
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: userWithoutBookings })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Aucune réservation')).toBeInTheDocument()
      })
    })
  })

  describe('Gestion des erreurs', () => {
    it('affiche une erreur quand l\'API échoue', async () => {
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue({
        response: { data: { error: 'Utilisateur non trouvé' } }
      })

      render(<UserDetailsModal userId="999" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Utilisateur non trouvé')).toBeInTheDocument()
      })
    })

    it('affiche un message d\'erreur générique quand l\'erreur n\'a pas de détails', async () => {
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Erreur lors du chargement')).toBeInTheDocument()
      })
    })
  })

  describe('Corps vide', () => {
    it('affiche le fallback quand l\'API renvoie un corps falsy', async () => {
      ;(api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null })

      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(screen.getByText('Aucune donnée disponible.')).toBeInTheDocument()
      })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('appelle l\'API avec le bon userId', async () => {
      render(<UserDetailsModal userId="test-user-id" onClose={mockOnClose} />)

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/admin/users/test-user-id')
      })
    })

    it('ferme le modal avec la touche Escape (onClose est appelé)', async () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })
  })

  describe('Accessibilité', () => {
    it('expose un dialog accessible nommé par son titre', () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      const modal = screen.getByRole('dialog')
      expect(modal).toBeInTheDocument()
      expect(modal).toHaveAccessibleName('Détails du membre')
    })

    it('le bouton de fermeture intégré est présent', () => {
      render(<UserDetailsModal userId="123" onClose={mockOnClose} />)

      expect(screen.getByText('Close')).toBeInTheDocument()
    })
  })
})
