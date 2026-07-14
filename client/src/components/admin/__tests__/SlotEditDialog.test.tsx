import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SlotEditDialog } from '../SlotEditDialog'
import type { Slot } from '@/types/slot'
import * as useAdminSlotsModule from '../../../hooks/useAdminSlots'
import * as useInvitationStatusModule from '../../../hooks/useInvitationStatus'

// Mock du hook useAdminSlots avec factory inline
vi.mock('../../../hooks/useAdminSlots', () => ({
  useAdminSlots: vi.fn(),
}))

// Mock du hook useInvitationStatus — par défaut aucun invité (pas de warning)
vi.mock('../../../hooks/useInvitationStatus', () => ({
  useInvitationStatus: vi.fn(),
}))

// Mock SheetShell : évite la chaîne d'import @/components/ui/sheet non résolue en test
vi.mock('../../SheetShell', () => ({
  SheetShell: ({ children, footer, open, title }: {
    children: React.ReactNode
    footer?: React.ReactNode
    open: boolean
    title: React.ReactNode
    onInteractOutside?: (e: Event) => void
    onEscapeKeyDown?: (e: KeyboardEvent) => void
  }) => open ? (
    <div role="dialog" aria-label={typeof title === 'string' ? title : 'dialog'}>
      <div>{title}</div>
      {children}
      {footer}
    </div>
  ) : null,
}))

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

const mockSlot: Slot = {
  id: 'slot-123',
  eventId: 'event-456',
  startTime: '2026-03-15T09:00:00Z',
  endTime: '2026-03-15T11:00:00Z',
  capacity: 5,
  currentBookings: 2,
  createdAt: '2026-01-19T10:00:00Z',
  updatedAt: '2026-01-19T10:00:00Z',
  cancelledAt: null,
  cancellationReason: null,
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    {children}
  </QueryClientProvider>
)

describe('SlotEditDialog', () => {
  const updateSlotMock = vi.fn()

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
    vi.mocked(useAdminSlotsModule.useAdminSlots).mockReturnValue({
      updateSlot: updateSlotMock,
      isUpdating: false,
      slots: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      createSlot: vi.fn(),
      isCreating: false,
      deleteSlot: vi.fn(),
      deleteSlotAsync: vi.fn().mockResolvedValue(undefined),
      isDeleting: false,
    } as unknown as ReturnType<typeof useAdminSlotsModule.useAdminSlots>)
    vi.mocked(useInvitationStatusModule.useInvitationStatus).mockReturnValue({ users: [] } as never)
  })

  it('devrait rendre le dialog avec les valeurs du créneau pré-remplies', () => {
    render(
      <SlotEditDialog
        slot={mockSlot}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper }
    )

    // Vérifier que le titre est affiché
    expect(screen.getByText('Modifier le créneau')).toBeInTheDocument()

    // Vérifier que les champs sont pré-remplis avec les valeurs du slot
    // La conversion ISO vers datetime-local utilise l'heure locale du navigateur
    // Les valeurs dépendent du fuseau horaire du système
    const startInput = screen.getByLabelText(/Date et heure de début/)
    expect(startInput).toHaveTextContent('15 mars 2026')

    const endInput = screen.getByLabelText(/Date et heure de fin/)
    expect(endInput).toHaveTextContent('15 mars 2026')

    const capacityInput = screen.getByLabelText(/Capacité/)
    expect(capacityInput).toHaveValue(5)
  })

  it('indique le plancher de capacité (inscrits actuels) en édition', () => {
    render(
      <SlotEditDialog slot={mockSlot} open onOpenChange={vi.fn()} />,
      { wrapper }
    )

    // Indication neutre (pas une alerte) + champ borné silencieusement au plancher.
    expect(screen.getByText(/Minimum : 2 \(inscrits actuels\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Capacité/i)).toHaveAttribute('min', '2')
    // Le bandeau alarmiste a été retiré (redondant avec le roster).
    expect(screen.queryByText(/ne peut pas être inférieure/i)).not.toBeInTheDocument()
  })

  it("n'affiche pas de plancher et borne à 1 sans réservation", () => {
    const slotWithoutBookings: Slot = {
      ...mockSlot,
      currentBookings: 0,
    }

    render(
      <SlotEditDialog slot={slotWithoutBookings} open onOpenChange={vi.fn()} />,
      { wrapper }
    )

    expect(screen.queryByText(/Minimum/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Capacité/i)).toHaveAttribute('min', '1')
  })

  it('recale la fin en conservant la durée quand le début passe après la fin', async () => {
    // Slot en heure LOCALE naïve (sans Z) → assertions d'heures déterministes (indép. du fuseau).
    const slot: Slot = { ...mockSlot, startTime: '2026-03-15T09:00:00', endTime: '2026-03-15T11:00:00' } // durée 2h
    render(<SlotEditDialog slot={slot} open={true} onOpenChange={vi.fn()} />, { wrapper })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByLabelText(/Date et heure de début/))
    await user.click(
      within(screen.getByRole('listbox', { name: 'Heures' })).getByRole('option', { name: '14' })
    )
    await user.keyboard('{Escape}')

    // Début 14:00 + durée 2h → fin 16:00 (durée CONSERVÉE, pas un +1h fixe).
    expect(screen.getByLabelText(/Date et heure de fin/)).toHaveTextContent('16:00')
    expect(
      screen.getByText(/Fin ajustée automatiquement à 16:00 \(durée conservée\)/)
    ).toBeInTheDocument()
    // L'erreur de plage a disparu et le submit est réactivé.
    expect(screen.queryByText(/doit être après le début/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).not.toBeDisabled()
  })

  it("note l'ajustement avec la date quand la fin bascule au lendemain", async () => {
    // Slot local naïf, durée 1h30, tard le soir → le recalage franchit minuit.
    const slot: Slot = { ...mockSlot, startTime: '2026-03-15T09:15:00', endTime: '2026-03-15T10:45:00' }
    render(<SlotEditDialog slot={slot} open={true} onOpenChange={vi.fn()} />, { wrapper })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByLabelText(/Date et heure de début/))
    // Colonne Heures préserve les minutes (15) → début 23:15.
    await user.click(
      within(screen.getByRole('listbox', { name: 'Heures' })).getByRole('option', { name: '23' })
    )
    await user.keyboard('{Escape}')

    // 23:15 + 1h30 → 00:45 le lendemain (16 mars) : la note inclut la date.
    expect(
      screen.getByText(/Fin ajustée automatiquement au 16 mars 2026 à 00:45 \(durée conservée\)/)
    ).toBeInTheDocument()
    // La plage devient multi-jours → badge présent.
    expect(screen.getByText(/Multi-jours/)).toBeInTheDocument()
  })

  it('devrait soumettre le formulaire avec les données modifiées', async () => {
    const onOpenChange = vi.fn()

    render(
      <SlotEditDialog
        slot={mockSlot}
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper }
    )

    const capacityInput = screen.getByLabelText(/Capacité/)
    const submitButton = screen.getByRole('button', { name: 'Enregistrer' })

    // Modifier la capacité - Utiliser fireEvent pour le changement
    fireEvent.change(capacityInput, { target: { value: '8' } })

    // Soumettre le formulaire
    await userEvent.click(submitButton)

    // Vérifier que updateSlot a été appelé avec le callback onSuccess
    expect(updateSlotMock).toHaveBeenCalledTimes(1)
    expect(updateSlotMock).toHaveBeenCalledWith('slot-123', {
      startTime: expect.any(String),
      endTime: expect.any(String),
      capacity: 8,
      notifyBookings: true, // Switch ON par défaut (slot avec inscrits)
      onSuccess: expect.any(Function), // Le callback onSuccess est maintenant passé
    })

    // Vérifier que le dialog se ferme après soumission (via le callback onSuccess)
    // Note: Le mock de updateSlot n'appelle pas le callback, donc onOpenChange n'est pas appelé
    // Pour tester complètement, il faudrait simuler l'appel du callback onSuccess
  })

  it('devrait fermer le dialog lors du clic sur Fermer', async () => {
    const onOpenChange = vi.fn()

    render(
      <SlotEditDialog
        slot={mockSlot}
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper }
    )

    const cancelButton = screen.getByRole('button', { name: 'Fermer' })
    await userEvent.click(cancelButton)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('devrait avoir le bouton Enregistrer désactivé sans modifications, activé après modification', async () => {
    // En mode édition, le bouton est désactivé tant qu'aucune modification n'a été faite

    render(
      <SlotEditDialog
        slot={mockSlot}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper }
    )

    // Le bouton "Enregistrer" est présent
    const submitButton = screen.getByRole('button', { name: 'Enregistrer' })
    expect(submitButton).toBeInTheDocument()

    // Par défaut, le bouton est désactivé (pas de modifications)
    expect(submitButton).toBeDisabled()

    // Faire une modification
    const capacityInput = screen.getByLabelText(/Capacité/i)
    await userEvent.clear(capacityInput)
    await userEvent.type(capacityInput, '5')

    // Maintenant le bouton est activé
    expect(submitButton).not.toBeDisabled()
  })

  describe('Aperçu inscrits (lecture seule)', () => {
    it('affiche le roster des inscrits en mode édition', () => {
      const slotWithVolunteers: Slot = {
        ...mockSlot,
        currentBookings: 1,
        volunteers: [{ id: 'u1', name: 'Alice Bernard' }],
      }

      render(
        <SlotEditDialog slot={slotWithVolunteers} open onOpenChange={vi.fn()} />,
        { wrapper }
      )

      expect(screen.getByRole('heading', { name: /Inscrits/ })).toBeInTheDocument()
      expect(screen.getByText('Alice Bernard')).toBeInTheDocument()
    })

    it('masque le roster en mode création', () => {
      const newSlot: Slot = { ...mockSlot, id: 'new', currentBookings: 0 }

      render(<SlotEditDialog slot={newSlot} open onOpenChange={vi.fn()} />, { wrapper })

      expect(screen.queryByRole('heading', { name: /Inscrits/ })).not.toBeInTheDocument()
    })
  })

  describe('Story 12.3: Mode création via drag calendrier', () => {
    it('devrait détecter le mode création quand slot.id === "new"', () => {
      const newSlot: Slot = {
        ...mockSlot,
        id: 'new', // ID spécial pour la création
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={newSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      // Le titre doit indiquer la création
      expect(screen.getByText('Nouveau créneau')).toBeInTheDocument()
      expect(screen.queryByText('Modifier le créneau')).not.toBeInTheDocument()
    })

    it('devrait utiliser createSlot en mode création', () => {
      const createSlotMock = vi.fn()
      vi.mocked(useAdminSlotsModule.useAdminSlots).mockReturnValue({
        updateSlot: updateSlotMock,
        createSlot: createSlotMock,
        isCreating: false,
        isUpdating: false,
        slots: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        deleteSlot: vi.fn(),
        deleteSlotAsync: vi.fn().mockResolvedValue(undefined),
        isDeleting: false,
      } as unknown as ReturnType<typeof useAdminSlotsModule.useAdminSlots>)

      const newSlot: Slot = {
        ...mockSlot,
        id: 'new',
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={newSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      const submitButton = screen.getByRole('button', { name: 'Créer' })
      expect(submitButton).toBeInTheDocument()
    })

    it('devrait avoir un bouton "Créer" en mode création', () => {
      const newSlot: Slot = {
        ...mockSlot,
        id: 'new',
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={newSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
    })

    it('devrait avoir un bouton "Enregistrer" en mode édition', () => {
      render(
        <SlotEditDialog
          slot={mockSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Créer' })).not.toBeInTheDocument()
    })

    it('ne devrait pas afficher le message de réservations existantes en mode création', () => {
      const newSlot: Slot = {
        ...mockSlot,
        id: 'new',
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={newSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      expect(
        screen.queryByText(/réservation\(s\) existante\(s\)/)
      ).not.toBeInTheDocument()
    })


    it('devrait avoir la description appropriée en mode édition', () => {
      render(
        <SlotEditDialog
          slot={mockSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      expect(
        screen.getByText(/appliquées immédiatement/i)
      ).toBeInTheDocument()
    })

    it('ne devrait pas valider la capacité min en mode création', () => {
      // En mode création, pas de validation capacity >= currentBookings
      // car il n'y a pas de réservations existantes
      const newSlot: Slot = {
        ...mockSlot,
        id: 'new',
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={newSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      const capacityInput = screen.getByLabelText(/Capacité/)

      // Capacité à 1 est valide en mode création
      expect(capacityInput).toHaveValue(5) // Valeur du slot mock
    })
  })

  describe('Warning capacité > nb invités', () => {
    it('affiche le warning quand capacity > nb invités et invités > 0', () => {
      vi.mocked(useInvitationStatusModule.useInvitationStatus).mockReturnValue({
        users: Array(3).fill(null),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useInvitationStatusModule.useInvitationStatus>)

      const slotWith5: Slot = { ...mockSlot, capacity: 5 }
      render(<SlotEditDialog slot={slotWith5} open onOpenChange={vi.fn()} />, { wrapper })

      expect(screen.getByText(/La capacité dépasse le nombre d'invités \(3\)/)).toBeInTheDocument()
    })

    it("n'affiche pas le warning quand capacity <= nb invités", () => {
      vi.mocked(useInvitationStatusModule.useInvitationStatus).mockReturnValue({
        users: Array(10).fill(null),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useInvitationStatusModule.useInvitationStatus>)

      const slotWith5: Slot = { ...mockSlot, capacity: 5 }
      render(<SlotEditDialog slot={slotWith5} open onOpenChange={vi.fn()} />, { wrapper })

      expect(screen.queryByText(/La capacité dépasse le nombre d'invités/)).not.toBeInTheDocument()
    })

    it('affiche le warning "aucun invité" quand la liste est vide', () => {
      // Par défaut beforeEach: users = [] — warning "aucun invité" affiché
      const slotWith500: Slot = { ...mockSlot, capacity: 500 }
      render(<SlotEditDialog slot={slotWith500} open onOpenChange={vi.fn()} />, { wrapper })

      expect(screen.getByText(/Aucun invité sélectionné pour cet événement/)).toBeInTheDocument()
      expect(screen.queryByText(/La capacité dépasse le nombre d'invités/)).not.toBeInTheDocument()
    })
  })

  describe('Phase 8.1: Slot Deletion Unification', () => {
    it('devrait avoir le bouton Supprimer actif même si des réservations existent (F9/AC9)', () => {
      const slotWithBookings: Slot = {
        ...mockSlot,
        currentBookings: 3,
      }

      render(
        <SlotEditDialog
          slot={slotWithBookings}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      // F9 : « Supprimer » = annulation (soft-delete) — déclenchable même avec
      // des réservations, c'est le cas cible de la fonctionnalité.
      const deleteButton = screen.getByRole('button', { name: /Supprimer/i })
      expect(deleteButton).not.toBeDisabled()
    })

    it('devrait avoir le bouton Supprimer actif si aucune réservation', () => {
      const slotWithoutBookings: Slot = {
        ...mockSlot,
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={slotWithoutBookings}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      const deleteButton = screen.getByRole('button', { name: /Supprimer/i })
      expect(deleteButton).not.toBeDisabled()
    })

    it('ne devrait plus afficher de message « suppression désactivée » avec des réservations (F9)', () => {
      const slotWithBookings: Slot = {
        ...mockSlot,
        currentBookings: 2,
      }

      render(
        <SlotEditDialog
          slot={slotWithBookings}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      // F9 : le blocage sur réservations est levé, le message n'a plus lieu d'être.
      expect(screen.queryByText(/suppression désactivée/i)).not.toBeInTheDocument()
    })

    it("ne devrait pas afficher de message explicatif quand le bouton est actif", () => {
      const slotWithoutBookings: Slot = {
        ...mockSlot,
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={slotWithoutBookings}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      expect(screen.queryByText(/suppression désactivée/i)).not.toBeInTheDocument()
    })

    it('ne devrait pas afficher le bouton Supprimer en mode création', () => {
      const newSlot: Slot = {
        ...mockSlot,
        id: 'new',
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={newSlot}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      expect(screen.queryByRole('button', { name: /Supprimer/i })).not.toBeInTheDocument()
    })

    it('devrait ouvrir SlotDeleteDialog lors du clic sur Supprimer', async () => {
      const slotWithoutBookings: Slot = {
        ...mockSlot,
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={slotWithoutBookings}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      const deleteButton = screen.getByRole('button', { name: /Supprimer/i })
      await userEvent.click(deleteButton)

      // SlotDeleteDialog should open - check for its title (cas 0 inscrit →
      // « Supprimer définitivement ce créneau ? », spec-conditional-slot-cancellation)
      // Use findBy to wait for the dialog to appear
      expect(await screen.findByText(/Supprimer définitivement ce créneau/i)).toBeInTheDocument()
    })

    it('ne devrait pas utiliser window.confirm', async () => {
      const originalConfirm = window.confirm
      window.confirm = vi.fn()

      const slotWithoutBookings: Slot = {
        ...mockSlot,
        currentBookings: 0,
      }

      render(
        <SlotEditDialog
          slot={slotWithoutBookings}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      const deleteButton = screen.getByRole('button', { name: /Supprimer/i })
      await userEvent.click(deleteButton)

      // window.confirm should NOT have been called
      expect(window.confirm).not.toHaveBeenCalled()

      window.confirm = originalConfirm
    })
  })

  describe('Créneau annulé (lecture seule)', () => {
    const cancelledSlot: Slot = {
      ...mockSlot,
      cancelledAt: '2026-03-10T12:00:00Z',
      cancellationReason: 'Salle indisponible',
    }

    it('affiche le badge « Annulé », le motif et désactive les champs', () => {
      render(
        <SlotEditDialog slot={cancelledSlot} open={true} onOpenChange={vi.fn()} />,
        { wrapper }
      )

      expect(screen.getByText('Annulé')).toBeInTheDocument()
      expect(screen.getByText(/Salle indisponible/)).toBeInTheDocument()
      // Tous les champs doivent être en lecture seule, pas seulement la capacité
      expect(screen.getByLabelText(/Date et heure de début/i)).toBeDisabled()
      expect(screen.getByLabelText(/Date et heure de fin/i)).toBeDisabled()
      expect(screen.getByLabelText(/Capacité/i)).toBeDisabled()
      expect(screen.getByLabelText(/Description/i)).toBeDisabled()
    })

    it('ne propose ni Enregistrer ni Supprimer pour un créneau annulé, seulement Fermer', () => {
      render(
        <SlotEditDialog slot={cancelledSlot} open={true} onOpenChange={vi.fn()} />,
        { wrapper }
      )

      expect(screen.queryByRole('button', { name: /Enregistrer/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Supprimer/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Fermer/i })).toBeInTheDocument()
    })
  })

  describe('Story 1.1 — créneaux multi-jours', () => {
    it('création multi-jours : envoie startTime/endTime sur des jours différents', async () => {
      const createSlotAsyncMock = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useAdminSlotsModule.useAdminSlots).mockReturnValue({
        updateSlot: updateSlotMock,
        isUpdating: false,
        createSlotAsync: createSlotAsyncMock,
        isCreating: false,
        slots: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        createSlot: vi.fn(),
        deleteSlot: vi.fn(),
        deleteSlotAsync: vi.fn().mockResolvedValue(undefined),
        isDeleting: false,
      } as unknown as ReturnType<typeof useAdminSlotsModule.useAdminSlots>)

      const newSlot: Slot = {
        ...mockSlot,
        id: 'new',
        startTime: '2026-03-15T09:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        currentBookings: 0,
      }

      render(<SlotEditDialog slot={newSlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      // Allonger la date de fin → multi-jours (ouvrir le DatePicker, choisir le 17 mars).
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(screen.getByLabelText(/Date et heure de fin/))
      await user.click(within(screen.getByRole('grid')).getByText('17'))
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'Créer' }))

      expect(createSlotAsyncMock).toHaveBeenCalledTimes(1)
      const payload = createSlotAsyncMock.mock.calls[0][0] as { startTime: string; endTime: string }
      const start = new Date(payload.startTime)
      const end = new Date(payload.endTime)
      expect(end.getTime()).toBeGreaterThan(start.getTime())
      // Jours calendaires locaux distincts (le payload combine bien endDate≠startDate).
      expect(end.getDate()).not.toBe(start.getDate())
    })

    it('bloque l\'enregistrement et marque le champ de fin en erreur si fin < début', async () => {
      render(<SlotEditDialog slot={mockSlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      const endDateInput = screen.getByLabelText(/Date et heure de fin/)
      // Ouvrir le popover de l'heure de fin et choisir 08h (avant le début) → plage incohérente.
      // (Reculer la date de fin sous la date de début est impossible : minDate désactive ces jours.)
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(endDateInput)
      await user.click(
        within(screen.getByRole('listbox', { name: 'Heures' })).getByRole('option', { name: '08' })
      )
      await user.keyboard('{Escape}')

      const submitButton = screen.getByRole('button', { name: 'Enregistrer' })
      expect(submitButton).toBeDisabled()
      expect(endDateInput).toHaveAttribute('aria-invalid', 'true')
      // a11y (review #3) : le message est relié au champ et exposé comme alerte.
      expect(endDateInput).toHaveAttribute('aria-describedby', 'edit-end-error')
      expect(screen.getByRole('alert')).toHaveTextContent(/après le début/)
      expect(
        screen.getByText(/La date\/heure de fin doit être après le début/)
      ).toBeInTheDocument()
      expect(updateSlotMock).not.toHaveBeenCalled()
    })

    it('affiche le badge « Multi-jours · N jours » et le récap de plage quand fin > début', async () => {
      render(<SlotEditDialog slot={mockSlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(screen.getByLabelText(/Date et heure de fin/))
      await user.click(within(screen.getByRole('grid')).getByText('17'))
      await user.keyboard('{Escape}')

      // 15 → 17 mars = 3 jours calendaires inclusifs.
      expect(screen.getByText(/Multi-jours.*3 jours/)).toBeInTheDocument()
      expect(screen.getByText(/du .*15 mars.*au .*17 mars/)).toBeInTheDocument()
    })

    it('édition d\'un créneau multi-jours : recharge la vraie date de fin (AC5)', () => {
      const multiDaySlot: Slot = {
        ...mockSlot,
        startTime: '2026-03-15T09:00:00Z',
        endTime: '2026-03-17T17:00:00Z',
      }

      render(<SlotEditDialog slot={multiDaySlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      // Avant le fix, seule la date de début était conservée (date de fin perdue).
      expect(screen.getByLabelText(/Date et heure de début/)).toHaveTextContent('15 mars 2026')
      expect(screen.getByLabelText(/Date et heure de fin/)).toHaveTextContent('17 mars 2026')
    })

    it('mono-jour : aucun badge multi-jours ni récap (non-régression FR12)', () => {
      render(<SlotEditDialog slot={mockSlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      // mockSlot est mono-jour (15 mars) : pas de badge ni de récap de plage.
      expect(screen.queryByText(/Multi-jours/)).not.toBeInTheDocument()
      expect(screen.queryByText(/^du .* au /)).not.toBeInTheDocument()
    })

    it('durée > 7 jours : avertissement non bloquant, enregistrement toujours possible (AC4)', async () => {
      render(<SlotEditDialog slot={mockSlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      // 15 → 29 mars = 15 jours (> 7) : warning affiché. Le 29 est un jour non
      // ambigu de mars (le 25, lui, collisionne avec le 25 février hors-mois).
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(screen.getByLabelText(/Date et heure de fin/))
      await user.click(within(screen.getByRole('grid')).getByText('29'))
      await user.keyboard('{Escape}')

      expect(screen.getByText(/Vérifiez la plage avant d'enregistrer/)).toBeInTheDocument()
      // L'avertissement ne bloque pas : la plage reste valide → bouton actif.
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    })

    it('seuil >7j : exactement 7 jours inclusifs (15→21 mars) → badge mais pas de warning', async () => {
      render(<SlotEditDialog slot={mockSlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      // 15 → 21 mars = 7 jours calendaires inclusifs : frontière basse, pile au seuil.
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(screen.getByLabelText(/Date et heure de fin/))
      await user.click(within(screen.getByRole('grid')).getByText('21'))
      await user.keyboard('{Escape}')

      expect(screen.getByText(/Multi-jours.*7 jours/)).toBeInTheDocument()
      // showLongWarning = spannedDays > 7 → 7 ne déclenche PAS le warning.
      expect(screen.queryByText(/Vérifiez la plage avant d'enregistrer/)).not.toBeInTheDocument()
    })

    it('seuil >7j : 8 jours inclusifs (15→22 mars) → warning + comptage exact', async () => {
      render(<SlotEditDialog slot={mockSlot} open={true} onOpenChange={vi.fn()} />, { wrapper })

      // 15 → 22 mars = 8 jours inclusifs : premier cas > 7. Le comptage exact
      // « 8 jours » verrouille toute régression du `+ 1` ou du `>` (vs `>=`).
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(screen.getByLabelText(/Date et heure de fin/))
      await user.click(within(screen.getByRole('grid')).getByText('22'))
      await user.keyboard('{Escape}')

      expect(screen.getByText(/Ce créneau dure 8 jours/)).toBeInTheDocument()
    })
  })

  describe('Switch de notification', () => {
    it('mode édition, currentBookings=0 → Switch absent', () => {
      render(
        <SlotEditDialog
          slot={{ ...mockSlot, currentBookings: 0 }}
          open
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )
      expect(
        screen.queryByRole('switch', { name: /Notifier/i })
      ).not.toBeInTheDocument()
    })

    it('mode édition, currentBookings=3 → Switch présent et coché par défaut', () => {
      render(
        <SlotEditDialog
          slot={{ ...mockSlot, currentBookings: 3 }}
          open
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )
      const sw = screen.getByRole('switch', { name: /Notifier les 3 inscrits/i })
      expect(sw).toBeInTheDocument()
      expect(sw).toHaveAttribute('aria-checked', 'true')
    })

    it('mode création (id="new") → Switch absent', () => {
      render(
        <SlotEditDialog
          slot={{ ...mockSlot, id: 'new', currentBookings: 0 }}
          open
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )
      expect(
        screen.queryByRole('switch', { name: /Notifier/i })
      ).not.toBeInTheDocument()
    })

    it('notifyBookings propagé au payload — true par défaut, false après toggle', async () => {
      render(
        <SlotEditDialog
          slot={{ ...mockSlot, currentBookings: 3 }}
          open
          onOpenChange={vi.fn()}
        />,
        { wrapper }
      )

      // Rendre le formulaire dirty via la description
      fireEvent.change(screen.getByLabelText(/Description/i), {
        target: { value: 'Nouvelle desc' },
      })

      const saveButton = screen.getByRole('button', { name: 'Enregistrer' })
      await userEvent.click(saveButton)

      expect(updateSlotMock).toHaveBeenCalledWith(
        'slot-123',
        expect.objectContaining({ notifyBookings: true })
      )

      // Toggle le Switch → notifyBookings doit être false au prochain submit
      updateSlotMock.mockClear()
      const sw = screen.getByRole('switch', { name: /Notifier les 3 inscrits/i })
      fireEvent.click(sw)

      await userEvent.click(saveButton)

      expect(updateSlotMock).toHaveBeenCalledWith(
        'slot-123',
        expect.objectContaining({ notifyBookings: false })
      )
    })
  })
})
