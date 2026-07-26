import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventDetailsTab, type EventDetailsTabRef } from '../EventDetailsTab'
import { createRef } from 'react'
import type { Event, UseUpdateEventOptions } from '@/hooks/useEvents'
import { getEventPublicUrl } from '@/hooks/useEvents'
// Toast is auto-mocked via global setup (vi.mock('sonner'))

// Mock du hook useUpdateEvent
const mockUpdateEvent = vi.fn()
const mockIsUpdating = false


vi.mock('@/hooks/useEvents', () => ({
  useUpdateEvent: (_options?: UseUpdateEventOptions) => {
    return {
      updateEvent: mockUpdateEvent,
      isUpdating: mockIsUpdating
    }
  },
  getEventPublicUrl: (eventId: string) => `${window.location.origin}/events/${eventId}`,
  type: {
    Event: {}
  }
}))

// Mock ToggleSwitch component
vi.mock('@/components/admin/ToggleSwitch', () => ({
  ToggleSwitch: ({ id, checked, onCheckedChange, disabled }: {
    id: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      disabled={disabled}
      data-testid={`toggle-${id}`}
    />
  )
}))

// Mock NavigationBlockerContext pour éviter l'erreur "must be used within NavigationBlockerProvider"
vi.mock('@/contexts/NavigationBlockerContext', () => ({
  useNavigationBlocker: () => ({
    blockNavigation: vi.fn(),
    unblockNavigation: vi.fn(),
    isBlocked: false,
    requestNavigation: vi.fn(() => true),
    confirmAndLeave: vi.fn(),
    cancelAndStay: vi.fn(),
    showConfirmDialog: false,
    pendingPath: null,
    triggerBlocker: vi.fn(),
  }),
}))

// Mock RichTextEditor (Tiptap) — ProseMirror requiert des API de layout absentes
// de jsdom ; on substitue un <textarea> contrôlé reflétant le contrat observable
// (value HTML, onChange, disabled, compteur, association aria-labelledby).
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ id, value, onChange, disabled, maxLength, placeholder, 'aria-labelledby': ariaLabelledby }: {
    id?: string
    value: string
    onChange: (html: string) => void
    disabled?: boolean
    maxLength?: number
    placeholder?: string
    'aria-labelledby'?: string
  }) => (
    <div>
      <textarea
        id={id}
        aria-labelledby={ariaLabelledby}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {maxLength !== undefined && <p>{value.length}/{maxLength} caractères</p>}
    </div>
  ),
}))

describe('EventDetailsTab', () => {
  const mockEvent: Event = {
    id: '123',
    name: 'Événement Test',
    description: 'Description test',
    isPublished: false,
    opensAt: null,
    hasCustomInvitation: false,
    periodStart: null,
    periodEnd: null,
    createdAt: '2026-01-26T10:00:00Z',
    updatedAt: '2026-01-26T10:00:00Z'
  }

  // updatedAt renvoyé par une sauvegarde réussie. Le composant compare cette clé
  // à celle de l'event rechargé : les deux DOIVENT rester couplées.
  const SAVED_AT = '2026-01-26T12:00:00Z'

  const mockOnSaved = vi.fn()
  const mockOnDirtyChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Le vrai `updateEvent` résout avec l'Event mis à jour (useEvents: mutateAsync).
    // Le composant en dérive la clé serveur attendue — le mock doit tenir ce contrat.
    mockUpdateEvent.mockResolvedValue({ ...mockEvent, name: 'Nom sauvegardé', updatedAt: SAVED_AT })
  })

  it('devrait rendre le formulaire avec les valeurs pré-remplies', () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    expect(screen.getByDisplayValue('Événement Test')).toBeInTheDocument()
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toContain('Description test')
    // Note: Le champ État a été retiré de ce formulaire (Story 18.1)
    // Il est maintenant géré hors de ce formulaire (EventEditActions en édition / EventCreateBanner en création)
  })


  it('devrait afficher le nom normal pour les événements non-draft', () => {
    const normalEvent = {
      ...mockEvent,
      name: 'Fête de fin d\'année'
    }

    render(
      <EventDetailsTab
        event={normalEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    const nameInput = screen.getByLabelText(/nom de l'événement/i)
    expect(nameInput).toHaveValue('Fête de fin d\'année')
  })

  // NOTE: Tests pour l'avertissement "événement publié" supprimés (Story 18.6)
  // Le composant ne gère plus cet avertissement — déplacé vers EventEditActions (édition) / EventCreateBanner (création)

  it('devrait mettre à jour les valeurs du formulaire lors de la saisie', async () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    const nameInput = screen.getByLabelText(/nom de l'événement/i)
    fireEvent.change(nameInput, { target: { value: 'Nouveau nom' } })

    expect(nameInput).toHaveValue('Nouveau nom')

    // Vérifier que le parent est notifié du changement dirty
    await waitFor(() => {
      expect(mockOnDirtyChange).toHaveBeenCalledWith(true)
    })
  })

  // NOTE: Tests pour les boutons Sauvegarder/Annuler supprimés (Story 18.6)
  // Les boutons sont maintenant gérés par EventFormPage via l'API imperative (ref)

  it('devrait afficher le compteur de caractères pour le nom', () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    // Le compteur affiche la longueur actuelle du nom avec un maximum de 200
    expect(screen.getByText(/\/200 caractères/)).toBeInTheDocument()
  })

  it('devrait afficher le sélecteur de date d\'ouverture avec toggle activé', () => {
    const eventWithDate = {
      ...mockEvent,
      opensAt: '2026-02-01T00:00:00Z'
    }

    render(
      <EventDetailsTab
        event={eventWithDate}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    // Vérifier que le ToggleSwitch pour la planification est présent et activé
    expect(screen.getByTestId('toggle-isScheduled')).toBeChecked()
    // Vérifier que le trigger affiche la date opensAt convertie en heure locale (TZ Europe/Paris)
    expect(screen.getByLabelText(/date d'ouverture des inscriptions/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/date d'ouverture des inscriptions/i)).toHaveTextContent('1 février 2026 à 01:00')
  })

  // Note: Le test "devrait afficher 'Publié' si l'événement est publié" a été retiré (Story 18.1)
  // Le champ État est maintenant géré hors de ce formulaire (EventEditActions en édition / EventCreateBanner en création)

  it('devrait être accessible : labels associés aux champs', () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    expect(screen.getByLabelText(/nom de l'événement/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
    // Note: Le champ État a été retiré (Story 18.1) - géré hors de ce formulaire (EventEditActions en édition / EventCreateBanner en création)
  })

  it('devrait gérer la description vide', () => {
    const eventWithoutDescription = { ...mockEvent, description: null }

    render(
      <EventDetailsTab
        event={eventWithoutDescription}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    const descriptionInput = screen.getByLabelText(/description/i)
    expect(descriptionInput).toHaveValue('')
  })

  it('devrait afficher le sélecteur de date pour les événements avec une date d\'ouverture', () => {
    const eventWithDate = {
      ...mockEvent,
      opensAt: '2026-02-01T00:00:00Z'
    }

    render(
      <EventDetailsTab
        event={eventWithDate}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    // Vérifier que le ToggleSwitch est activé quand opensAt est défini
    expect(screen.getByTestId('toggle-isScheduled')).toBeChecked()
    // Vérifier que le trigger affiche la date opensAt convertie en heure locale (TZ Europe/Paris)
    expect(screen.getByLabelText(/date d'ouverture des inscriptions/i)).toHaveTextContent('1 février 2026 à 01:00')
  })

  it('devrait afficher le sélecteur de date pour les événements sans date d\'ouverture', () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    // Vérifier que le ToggleSwitch est désactivé quand opensAt est null
    expect(screen.getByTestId('toggle-isScheduled')).not.toBeChecked()
    // Vérifier que le trigger affiche le placeholder quand aucune date
    expect(screen.getByLabelText(/date d'ouverture des inscriptions/i)).toHaveTextContent('Choisir date et heure')
  })

  it('devrait afficher le compteur de caractères pour la description', () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    // Le compteur affiche la longueur actuelle de la description avec un maximum de 5000
    expect(screen.getByText(/\/5000 caractères/)).toBeInTheDocument()
  })

  it('devrait resynchroniser le formulaire quand un nouvel event est fourni', () => {
    const { rerender } = render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    expect(screen.getByDisplayValue('Événement Test')).toBeInTheDocument()
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toContain('Description test')

    // Nouvel objet event (updatedAt différent → eventKey change) : le formulaire doit
    // refléter les nouvelles valeurs sans interaction (resync pendant le rendu).
    const updatedEvent: Event = {
      ...mockEvent,
      name: 'Événement Modifié',
      description: 'Nouvelle description',
      updatedAt: '2026-01-26T11:00:00Z',
    }

    rerender(
      <EventDetailsTab
        event={updatedEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    expect(screen.getByDisplayValue('Événement Modifié')).toBeInTheDocument()
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toContain('Nouvelle description')
  })

  it("ne réinitialise pas le formulaire quand l'event change côté serveur pendant une saisie", () => {
    const { rerender } = render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    fireEvent.change(screen.getByLabelText(/nom de l'événement/i), {
      target: { value: 'Saisie en cours' },
    })
    expect(screen.getByLabelText(/nom de l'événement/i)).toHaveValue('Saisie en cours')

    // Modification concurrente ramenée par un rafraîchissement d'arrière-plan
    // (retour d'onglet, invalidation de cache) : updatedAt change sans que l'utilisateur
    // ait sauvegardé. La saisie en cours doit survivre.
    rerender(
      <EventDetailsTab
        event={{ ...mockEvent, name: 'Modifié ailleurs', updatedAt: '2026-01-26T12:00:00Z' }}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    expect(screen.getByLabelText(/nom de l'événement/i)).toHaveValue('Saisie en cours')
  })

  it('adopte la version serveur après notre propre sauvegarde, formulaire modifié inclus', async () => {
    const ref = createRef<EventDetailsTabRef>()
    const { rerender } = render(
      <EventDetailsTab
        ref={ref}
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    fireEvent.change(screen.getByLabelText(/nom de l'événement/i), {
      target: { value: 'Nom sauvegardé' },
    })
    await act(async () => {
      await ref.current?.save()
    })
    expect(mockUpdateEvent).toHaveBeenCalled()

    // L'event rechargé après mutation porte un updatedAt neuf : ici la resync DOIT
    // avoir lieu, sinon originalData reste en arrière et le formulaire reste dirty.
    rerender(
      <EventDetailsTab
        ref={ref}
        event={{ ...mockEvent, name: 'Nom sauvegardé', updatedAt: SAVED_AT }}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    expect(screen.getByLabelText(/nom de l'événement/i)).toHaveValue('Nom sauvegardé')
    await waitFor(() => {
      expect(mockOnDirtyChange).toHaveBeenLastCalledWith(false)
    })
  })

  it("une sauvegarde échouée n'autorise pas l'adoption d'une version tierce", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdateEvent.mockRejectedValueOnce(new Error('réseau'))
    const ref = createRef<EventDetailsTabRef>()
    const { rerender } = render(
      <EventDetailsTab
        ref={ref}
        event={mockEvent}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    fireEvent.change(screen.getByLabelText(/nom de l'événement/i), {
      target: { value: 'Saisie en cours' },
    })
    await act(async () => {
      expect(await ref.current?.save()).toBe(false)
    })

    // La sauvegarde a échoué : aucune clé serveur n'a été posée. Un `updatedAt`
    // arrivant ensuite ne peut venir que d'un tiers — il ne doit rien écraser.
    rerender(
      <EventDetailsTab
        ref={ref}
        event={{ ...mockEvent, name: 'Modifié ailleurs', updatedAt: '2026-01-26T13:00:00Z' }}
        onSaved={mockOnSaved}
        onDirtyChange={mockOnDirtyChange}
      />
    )

    expect(screen.getByLabelText(/nom de l'événement/i)).toHaveValue('Saisie en cours')
  })
})

describe('Event Public URL', () => {
  const mockEvent: Event = {
    id: 'test-event-123',
    name: 'Événement Test',
    description: 'Description test',
    isPublished: false,
    opensAt: null,
    hasCustomInvitation: false,
    periodStart: null,
    periodEnd: null,
    createdAt: '2026-01-26T10:00:00Z',
    updatedAt: '2026-01-26T10:00:00Z'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate correct public URL for event', () => {
    const eventId = 'test-event-123'
    const url = getEventPublicUrl(eventId)
    expect(url).toContain('/events/')
    expect(url).toContain(eventId)
  })

  it('should include current origin in public URL', () => {
    const eventId = 'test-event-456'
    const url = getEventPublicUrl(eventId)
    expect(url).toContain(window.location.origin)
  })

  it('should render URL field with copy button', async () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    )

    const urlInput = screen.getByRole('textbox', { name: /lien de l'événement/i })
    expect(urlInput).toBeInTheDocument()
    expect(urlInput).toHaveAttribute('readOnly')

    // Check for copy button
    const copyButton = screen.getByRole('button', { name: /copier le lien/i })
    expect(copyButton).toBeInTheDocument()
  })

  it('should render a button opening the public URL in a new tab', () => {
    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    )

    // asChild => <a> rendu en bouton : rôle « link ».
    const openLink = screen.getByRole('link', { name: /ouvrir le lien dans un nouvel onglet/i })
    expect(openLink).toHaveAttribute('href', getEventPublicUrl(mockEvent.id))
    expect(openLink).toHaveAttribute('target', '_blank')
    expect(openLink).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('should copy URL to clipboard when copy button is clicked', async () => {
    const user = userEvent.setup()
    const mockEvent = {
      id: 'test-copy-event',
      name: 'Test Event',
      description: null,
      isPublished: false,
      opensAt: null,
      hasCustomInvitation: false,
      periodStart: null,
      periodEnd: null,
      createdAt: '2026-01-26T10:00:00Z',
      updatedAt: '2026-01-26T10:00:00Z'
    }

    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()

    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    )

    const copyButton = screen.getByRole('button', { name: /copier le lien/i })
    await user.click(copyButton)

    expect(writeTextSpy).toHaveBeenCalled()
    expect(writeTextSpy.mock.calls[0][0]).toContain(mockEvent.id)

    // Check for "Lien copié !" text
    await waitFor(() => {
      expect(screen.getByText('Lien copié !')).toBeInTheDocument()
    })

    writeTextSpy.mockRestore()
  })

  it('should show Check icon after successful copy', async () => {
    const user = userEvent.setup()
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()

    render(
      <EventDetailsTab
        event={mockEvent}
        onSaved={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    )

    const copyButton = screen.getByRole('button', { name: /copier le lien/i })
    await user.click(copyButton)

    await waitFor(() => {
      const checkIcon = copyButton.querySelector('.text-green-600')
      expect(checkIcon).toBeInTheDocument()
    })

    writeTextSpy.mockRestore()
  })
})
