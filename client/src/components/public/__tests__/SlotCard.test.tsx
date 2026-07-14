import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SlotCard } from '../SlotCard'
import type { Slot } from '../../../types/slot'

const mockSlot: Slot = {
  id: 'slot-1',
  eventId: 'event-1',
  startTime: '2099-02-15T14:00:00Z',
  endTime: '2099-02-15T16:00:00Z',
  capacity: 3,
  currentBookings: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  cancelledAt: null,
  cancellationReason: null,
}

const mockSlotFull: Slot = {
  ...mockSlot,
  id: 'slot-2',
  currentBookings: 3,
}

const mockSlotAvailable: Slot = {
  ...mockSlot,
  id: 'slot-3',
  currentBookings: 0,
}

describe('SlotCard', () => {
  it('affiche les informations du créneau', () => {
    const { container } = render(<SlotCard slot={mockSlot} />)

    // Vérifier l'heure (format canonique « HHhmm → HHhmm »)
    // Note: date-fns convertit l'UTC en heure locale, donc on vérifie le contenu textuel
    expect(container.textContent).toContain('15h00')
    expect(container.textContent).toContain('17h00')

    // Vérifier la date et le nombre d'inscrits via le contenu textuel
    expect(container.textContent).toContain('15 février 2099')
    expect(container.textContent).toContain('1/3 inscrit')
  })

  it('affiche le badge de disponibilité "Partiel" pour les créneaux partiellement remplis', () => {
    render(<SlotCard slot={mockSlot} />)
    expect(screen.getByText('Partiel')).toBeInTheDocument()
  })

  it('affiche le badge de disponibilité "Complet" pour les créneaux complets', () => {
    render(<SlotCard slot={mockSlotFull} />)
    expect(screen.getByText('Complet')).toBeInTheDocument()
    expect(screen.getByText(/3\/3 inscrits/)).toBeInTheDocument()
  })

  it('affiche le badge de disponibilité "Disponible" pour les créneaux disponibles', () => {
    render(<SlotCard slot={mockSlotAvailable} />)
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('appelle onSelect lors du clic sur un créneau disponible', () => {
    const onSelect = vi.fn()
    render(<SlotCard slot={mockSlot} onSelect={onSelect} />)

    const button = screen.getByRole('button')
    button.click()
    expect(onSelect).toHaveBeenCalledWith('slot-1')
  })

  it('n\'appelle pas onSelect pour un créneau complet', () => {
    const onSelect = vi.fn()
    render(<SlotCard slot={mockSlotFull} onSelect={onSelect} />)

    const button = screen.getByRole('button')
    button.click()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('n\'appelle pas onSelect quand disabled=true', () => {
    const onSelect = vi.fn()
    render(<SlotCard slot={mockSlot} onSelect={onSelect} disabled={true} />)

    const button = screen.getByRole('button')
    button.click()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('affiche la barre de progression avec le bon pourcentage', () => {
    const { container } = render(<SlotCard slot={mockSlot} />)

    // Le slot a 1/3 réservations = ~33% de remplissage
    const progressBar = container.querySelector('[role="progressbar"]') as HTMLElement
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '1')
    expect(progressBar).toHaveAttribute('aria-valuemin', '0')
    expect(progressBar).toHaveAttribute('aria-valuemax', '3')
    // Vérifier la largeur de la barre de progression (approximation pourcentage)
    const innerBar = progressBar.querySelector('div') as HTMLElement
    expect(innerBar.style.width).toMatch(/33\.?\d*%/)
  })

  describe('Visualisation de la disponibilité (Story 6.3)', () => {
    it('affiche le code couleur vert (green) pour un créneau disponible', () => {
      const { container } = render(<SlotCard slot={mockSlotAvailable} />)

      const button = container.querySelector('button') as HTMLElement
      // Vérifier la bordure verte (palette unifiée)
      expect(button.className).toContain('border-l-green-500')
    })

    it('affiche le code couleur ambre pour un créneau partiel', () => {
      const { container } = render(<SlotCard slot={mockSlot} />)

      const button = container.querySelector('button') as HTMLElement
      // Vérifier la bordure ambre
      expect(button.className).toContain('border-l-amber-500')
    })

    it('affiche le code couleur orange pour un créneau complet', () => {
      const { container } = render(<SlotCard slot={mockSlotFull} />)

      const button = container.querySelector('button') as HTMLElement
      // Vérifier la bordure orange (Complet = orange, distinct du rouge Annulé)
      expect(button.className).toContain('border-l-orange-400')
    })

    it('affiche le badge avec la bonne couleur de fond (vert pour disponible)', () => {
      render(<SlotCard slot={mockSlotAvailable} />)

      const badge = screen.getByText('Disponible')
      expect(badge.className).toContain('bg-green-50')
      expect(badge.className).toContain('text-green-800')
    })

    it('affiche le badge avec la bonne couleur de fond (ambre pour partiel)', () => {
      render(<SlotCard slot={mockSlot} />)

      const badge = screen.getByText('Partiel')
      expect(badge.className).toContain('bg-amber-50')
      expect(badge.className).toContain('text-amber-800')
    })

    it('affiche le badge avec la bonne couleur de fond (orange pour complet)', () => {
      render(<SlotCard slot={mockSlotFull} />)

      const badge = screen.getByText('Complet')
      expect(badge.className).toContain('bg-orange-50')
      expect(badge.className).toContain('text-orange-800')
    })

    it('affiche "2/3 inscrits" au pluriel pour plusieurs inscriptions', () => {
      const slotMultipleBookings: Slot = {
        ...mockSlot,
        id: 'slot-4',
        capacity: 3,
        currentBookings: 2,
      }
      render(<SlotCard slot={slotMultipleBookings} />)

      expect(screen.getByText(/2\/3 inscrits/)).toBeInTheDocument()
    })

    it('affiche la barre de progression avec couleur verte pour disponible', () => {
      const { container } = render(<SlotCard slot={mockSlotAvailable} />)

      const progressBar = container.querySelector('[role="progressbar"]') as HTMLElement
      const innerBar = progressBar.querySelector('div') as HTMLElement
      // Pour un slot disponible (0/3), la barre est verte
      expect(innerBar.className).toContain('bg-green-500')
    })

    it('affiche la barre de progression avec couleur ambre pour partiel', () => {
      const { container } = render(<SlotCard slot={mockSlot} />)

      const progressBar = container.querySelector('[role="progressbar"]') as HTMLElement
      const innerBar = progressBar.querySelector('div') as HTMLElement
      // Pour un slot partiel (1/3), la barre est ambre
      expect(innerBar.className).toContain('bg-amber-500')
    })

    it('affiche la barre de progression avec couleur orange pour complet', () => {
      const { container } = render(<SlotCard slot={mockSlotFull} />)

      const progressBar = container.querySelector('[role="progressbar"]') as HTMLElement
      const innerBar = progressBar.querySelector('div') as HTMLElement
      // Pour un slot complet (3/3), la barre est orange
      expect(innerBar.className).toContain('bg-orange-500')
    })

    it('affiche le libellé ARIA correct pour la barre de progression', () => {
      const { container } = render(<SlotCard slot={mockSlot} />)

      const progressBar = container.querySelector('[role="progressbar"]') as HTMLElement
      expect(progressBar).toHaveAttribute(
        'aria-label',
        '1 participant(s) inscrit(s) sur 3'
      )
    })
  })

  describe('Slot description', () => {
    it('should not render when description is undefined', () => {
      const slotWithoutDescription: Slot = {
        ...mockSlot,
        description: undefined
      }

      const { container } = render(<SlotCard slot={slotWithoutDescription} />)

      // Verify no description text is rendered
      expect(container.textContent).not.toContain('Description test')
    })

    it('should display short description without truncation', () => {
      const slotWithShortDescription: Slot = {
        ...mockSlot,
        description: 'Short desc'
      }

      render(<SlotCard slot={slotWithShortDescription} />)

      expect(screen.getByText('Short desc')).toBeInTheDocument()
    })

    it('should truncate long description with ellipsis', () => {
      const longDesc = 'B'.repeat(60)
      const slotWithLongDescription: Slot = {
        ...mockSlot,
        description: longDesc
      }

      render(<SlotCard slot={slotWithLongDescription} />)

      // Should show first 50 chars + ellipsis
      const expectedTruncated = 'B'.repeat(50) + '...'
      expect(screen.getByText(expectedTruncated)).toBeInTheDocument()
    })

    it('should not truncate description exactly 50 characters', () => {
      const fiftyCharDesc = 'C'.repeat(50)
      const slotWithFiftyCharDescription: Slot = {
        ...mockSlot,
        description: fiftyCharDesc
      }

      render(<SlotCard slot={slotWithFiftyCharDescription} />)

      // Should show exact description without ellipsis
      expect(screen.getByText(fiftyCharDesc)).toBeInTheDocument()
    })
  })

  describe('Duration display (Phase 15)', () => {
    it('affiche la durée "2h00" pour un créneau de 2 heures', () => {
      const twoHourSlot: Slot = {
        ...mockSlot,
        id: 'slot-duration-2h',
        startTime: '2099-02-15T14:00:00Z',
        endTime: '2099-02-15T16:00:00Z',
      }
      const { container } = render(<SlotCard slot={twoHourSlot} />)
      expect(container.textContent).toContain('2h00')
    })

    it('affiche la durée "1h30" pour un créneau de 90 minutes', () => {
      const ninetyMinSlot: Slot = {
        ...mockSlot,
        id: 'slot-duration-1h30',
        startTime: '2099-02-15T14:00:00Z',
        endTime: '2099-02-15T15:30:00Z',
      }
      const { container } = render(<SlotCard slot={ninetyMinSlot} />)
      expect(container.textContent).toContain('1h30')
    })

    it('affiche la durée "0h15" pour un créneau de 15 minutes', () => {
      const fifteenMinSlot: Slot = {
        ...mockSlot,
        id: 'slot-duration-0h15',
        startTime: '2099-02-15T14:00:00Z',
        endTime: '2099-02-15T14:15:00Z',
      }
      const { container } = render(<SlotCard slot={fifteenMinSlot} />)
      expect(container.textContent).toContain('0h15')
    })

    it('affiche la durée avec le séparateur •', () => {
      const { container } = render(<SlotCard slot={mockSlot} />)
      expect(container.textContent).toContain('•')
    })
  })

  describe('Participant count display (Phase 15)', () => {
    it('affiche "1/5 inscrit" au singulier pour une seule inscription', () => {
      const slotSingleBooking: Slot = {
        ...mockSlot,
        id: 'slot-single-booking',
        capacity: 5,
        currentBookings: 1,
      }
      render(<SlotCard slot={slotSingleBooking} />)
      expect(screen.getByText(/1\/5 inscrit/)).toBeInTheDocument()
    })

    it('affiche "3/5 inscrits" au pluriel pour plusieurs inscriptions', () => {
      const slotMultipleBookings: Slot = {
        ...mockSlot,
        id: 'slot-multiple-bookings',
        capacity: 5,
        currentBookings: 3,
      }
      render(<SlotCard slot={slotMultipleBookings} />)
      expect(screen.getByText(/3\/5 inscrits/)).toBeInTheDocument()
    })

    it('affiche "5/5 inscrits" pour un créneau complet', () => {
      render(<SlotCard slot={mockSlotFull} />)
      expect(screen.getByText(/3\/3 inscrits/)).toBeInTheDocument()
    })

    it('affiche le nombre d\'inscrits même quand hasBooked=true', () => {
      render(<SlotCard slot={mockSlot} hasBooked={true} />)
      expect(screen.getByText(/1\/3 inscrit/)).toBeInTheDocument()
    })

    it("n'affiche plus le texte 'places restantes'", () => {
      render(<SlotCard slot={mockSlot} />)
      expect(screen.queryByText(/places restantes/)).not.toBeInTheDocument()
    })
  })

  describe('List variant (Phase 17)', () => {
    it('applique le style simplifié quand variant="list"', () => {
      const { container } = render(<SlotCard slot={mockSlot} variant="list" />)

      const button = container.querySelector('button') as HTMLElement
      // Vérifier le padding responsive (mobile: p-3, desktop: md:p-4)
      expect(button.className).toContain('p-3')
      expect(button.className).toContain('md:p-4')
      // Vérifier la bordure plus légère
      expect(button.className).toContain('border-l-2')
      // Ne doit pas avoir la bordure calendar
      expect(button.className).not.toContain('border-l-4')
    })

    it('masque la date complète en variant list', () => {
      const { container } = render(<SlotCard slot={mockSlot} variant="list" />)

      // La date ne devrait pas s'afficher en mode liste
      expect(container.textContent).not.toContain('15 février 2099')
    })

    it('masque la barre de progression en variant list', () => {
      const { container } = render(<SlotCard slot={mockSlot} variant="list" />)

      // Pas de barre de progression en mode liste
      const progressBar = container.querySelector('[role="progressbar"]')
      expect(progressBar).not.toBeInTheDocument()
    })

    it('utilise par défaut le variant calendar', () => {
      const { container } = render(<SlotCard slot={mockSlot} />)

      const button = container.querySelector('button') as HTMLElement
      // Styles responsive par défaut (mobile: p-3, desktop: md:p-4)
      expect(button.className).toContain('p-3')
      expect(button.className).toContain('md:p-4')
      expect(button.className).toContain('border-l-4')
    })

    it('affiche toujours l\'heure et la durée en variant list', () => {
      const { container } = render(<SlotCard slot={mockSlot} variant="list" />)

      // L'heure et la durée doivent toujours être affichées
      expect(container.textContent).toContain('15h00')
      expect(container.textContent).toContain('17h00')
      expect(container.textContent).toContain('2h00')
    })

    it('affiche toujours le badge de disponibilité en variant list', () => {
      render(<SlotCard slot={mockSlot} variant="list" />)
      expect(screen.getByText('Partiel')).toBeInTheDocument()
    })

    it('affiche toujours le nombre d\'inscrits en variant list', () => {
      const { container } = render(<SlotCard slot={mockSlot} variant="list" />)

      expect(container.textContent).toContain('1/3 inscrit')
    })

    it('liste variant conserve les bordures de couleur de disponibilité', () => {
      const { container } = render(<SlotCard slot={mockSlotAvailable} variant="list" />)

      const button = container.querySelector('button') as HTMLElement
      // Vérifier la bordure verte pour disponible (palette unifiée)
      expect(button.className).toContain('border-l-green-500')
    })

    it('appelle onSelect correctement en variant list', () => {
      const onSelect = vi.fn()
      render(<SlotCard slot={mockSlot} variant="list" onSelect={onSelect} />)

      const button = screen.getByRole('button')
      button.click()
      expect(onSelect).toHaveBeenCalledWith('slot-1')
    })
  })

  describe('Créneau annulé (soft-delete)', () => {
    const cancelledSlot: Slot = {
      ...mockSlot,
      id: 'slot-cancelled',
      cancelledAt: '2026-01-10T12:00:00Z',
      cancellationReason: 'Salle indisponible',
    }

    it('affiche le badge « Annulé »', () => {
      render(<SlotCard slot={cancelledSlot} />)
      expect(screen.getByText('Annulé')).toBeInTheDocument()
    })

    it('reste cliquable pour ouvrir le détail (lire le motif)', () => {
      const onSelect = vi.fn()
      render(<SlotCard slot={cancelledSlot} onSelect={onSelect} />)

      const button = screen.getByRole('button')
      button.click()
      expect(onSelect).toHaveBeenCalledWith('slot-cancelled')
    })

    it('applique un rendu grisé', () => {
      const { container } = render(<SlotCard slot={cancelledSlot} />)
      const button = container.querySelector('button') as HTMLElement
      expect(button.className).toContain('opacity-70')
    })

    it('prime sur le badge « Réservé » même quand hasBooked=true', () => {
      render(<SlotCard slot={cancelledSlot} hasBooked={true} />)
      expect(screen.getByText('Annulé')).toBeInTheDocument()
      expect(screen.queryByText('Réservé')).not.toBeInTheDocument()
    })
  })

  describe('Créneaux multi-jours (Story 1.4)', () => {
    // 3 jours calendaires inclusifs (15→17). date-fns N'est PAS mocké ici et le
    // runner épingle TZ=Europe/Paris → durée exacte (« 3 jours », sans `format`)
    // + structure de plage (« du … au … ») fiables.
    const multiDaySlot: Slot = {
      ...mockSlot,
      id: 'slot-md',
      startTime: '2099-02-15T09:00:00Z',
      endTime: '2099-02-17T17:00:00Z',
    }

    it('affiche la durée « N jours » et la plage formatSlotRange', () => {
      const { container } = render(<SlotCard slot={multiDaySlot} />)
      expect(container.textContent).toContain('3 jours')
      expect(container.textContent).toContain('du ')
      expect(container.textContent).toContain(' au ')
    })

    it('variante list + multi-jours : plage « du … au » + « N jours », barre de progression masquée (AC5, L-4)', () => {
      // Lacune revue 1.4 (L-4) : la variante `list` n'était testée qu'en mono-jour
      // et le multi-jours qu'en variante `calendar`. On vérifie ici leur croisement.
      const { container } = render(<SlotCard slot={multiDaySlot} variant="list" />)
      expect(container.textContent).toContain('3 jours')
      expect(container.textContent).toContain('du ')
      expect(container.textContent).toContain(' au ')
      const button = container.querySelector('button') as HTMLElement
      // Bordure légère propre à la variante list + barre de progression masquée.
      expect(button.className).toContain('border-l-2')
      expect(button.className).not.toContain('border-l-4')
      expect(container.querySelector('[role="progressbar"]')).not.toBeInTheDocument()
    })

    it('mono-jour : durée horaire inchangée, pas de « jours » (FR12)', () => {
      const { container } = render(<SlotCard slot={mockSlot} />)
      expect(container.textContent).toContain('2h00')
      expect(container.textContent).not.toContain('jours')
    })
  })
})
