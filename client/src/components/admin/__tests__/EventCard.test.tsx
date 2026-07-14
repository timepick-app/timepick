import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventCard } from '../EventCard'
import type { Event } from '../../../hooks/useEvents'
import * as useEventsHook from '../../../hooks/useEvents'

// Mock du hook useEvents
vi.mock('../../../hooks/useEvents')

// Mock OpeningDateInput pour éviter les problèmes de QueryClient
vi.mock('../OpeningDateInput', () => ({
  OpeningDateInput: ({ event }: { event: Event }) => (
    <div data-testid="opening-date-input" data-opens-at={event.opensAt}>
      {event.opensAt ? `Ouvre le ${new Date(event.opensAt).toLocaleDateString('fr-FR')}` : '+ Ajouter une date d\'ouverture'}
    </div>
  ),
}))

// Mock PublishButton pour éviter les problèmes de QueryClient
vi.mock('../PublishButton', () => ({
  PublishButton: ({ event }: { event: Event }) => (
    <button data-testid="publish-button" data-published={event.isPublished}>
      {event.isPublished ? 'Dépublier' : 'Publier'}
    </button>
  ),
}))

// Wrapper pour React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('EventCard', () => {
  const mockEvent: Event = {
    id: '123',
    name: 'Test Event',
    description: 'Test description for the event',
    isPublished: false,
    opensAt: null,
    hasCustomInvitation: false,
    periodStart: null,
    periodEnd: null,
    createdAt: '2026-01-19T10:00:00Z',
    updatedAt: '2026-01-19T10:00:00Z'
  }

  const mockOnEdit = vi.fn()
  const mockUseEventUsers = {
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock useEventUsers hook
    vi.spyOn(useEventsHook, 'useEventUsers').mockReturnValue(mockUseEventUsers as unknown as ReturnType<typeof useEventsHook.useEventUsers>)
  })

  it('rend les informations de l\'événement', () => {
    const wrapper = createWrapper()
    render(<EventCard event={mockEvent} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Test Event')).toBeInTheDocument()
    expect(screen.getByText('Test description for the event')).toBeInTheDocument()
  })

  it('affiche le badge "Brouillon" pour les événements non publiés', () => {
    const wrapper = createWrapper()
    render(<EventCard event={mockEvent} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Brouillon')).toBeInTheDocument()
  })

  it('affiche le badge "Publié" pour les événements publiés', () => {
    const wrapper = createWrapper()
    const publishedEvent = { ...mockEvent, isPublished: true }

    render(<EventCard event={publishedEvent} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Publié')).toBeInTheDocument()
  })

  it('affiche la date d\'ouverture des inscriptions si définie', () => {
    const wrapper = createWrapper()
    const eventWithDate = {
      ...mockEvent,
      opensAt: '2026-02-01T10:00:00Z'
    }

    render(<EventCard event={eventWithDate} onEdit={mockOnEdit} />, { wrapper })

    // Le mock affiche "Ouvre le" pour les événements avec date
    expect(screen.getByText(/Ouvre le/)).toBeInTheDocument()
  })

  it('n\'affiche pas la date d\'ouverture si non définie', () => {
    const wrapper = createWrapper()
    render(<EventCard event={mockEvent} onEdit={mockOnEdit} />, { wrapper })

    // Le mock affiche le texte pour ajouter une date quand opensAt est null
    expect(screen.getByText(/ajouter une date d'ouverture/i)).toBeInTheDocument()
  })

  it('affiche la date de mise à jour', () => {
    const wrapper = createWrapper()
    render(<EventCard event={mockEvent} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText(/Mis à jour le/i)).toBeInTheDocument()
  })

  it('appelle onEdit lors du clic sur le bouton modifier', () => {
    const wrapper = createWrapper()
    render(<EventCard event={mockEvent} onEdit={mockOnEdit} />, { wrapper })

    const editButton = screen.getByTitle('Modifier l\'événement')
    fireEvent.click(editButton)

    expect(mockOnEdit).toHaveBeenCalledWith(mockEvent)
  })

  it('affiche la description avec line-clamp-2 pour les textes longs', () => {
    const wrapper = createWrapper()
    const longDescriptionEvent = {
      ...mockEvent,
      description: 'This is a very long description that should be truncated to two lines using the line-clamp-2 utility class from Tailwind CSS.'
    }

    render(<EventCard event={longDescriptionEvent} onEdit={mockOnEdit} />, { wrapper })

    const descriptionElement = screen.getByText(/This is a very long description/)
    expect(descriptionElement).toHaveClass('line-clamp-2')
  })

  it('affiche le badge "Email personnalisé" quand hasCustomInvitation est true', () => {
    const wrapper = createWrapper()
    const customEvent = { ...mockEvent, hasCustomInvitation: true }

    render(<EventCard event={customEvent} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Email personnalisé')).toBeInTheDocument()
  })

  it('n\'affiche pas le badge "Email personnalisé" quand hasCustomInvitation est false', () => {
    const wrapper = createWrapper()
    render(<EventCard event={mockEvent} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.queryByText('Email personnalisé')).not.toBeInTheDocument()
  })

  it('ne rend pas la description si elle est null', () => {
    const wrapper = createWrapper()
    const eventWithoutDescription = {
      ...mockEvent,
      description: null
    }

    render(<EventCard event={eventWithoutDescription} onEdit={mockOnEdit} />, { wrapper })

    // Vérifier que seule la carte avec le nom est rendue
    expect(screen.getByText('Test Event')).toBeInTheDocument()
    // La description ne devrait pas s'afficher
    expect(screen.queryByText(/description/i)).not.toBeInTheDocument()
  })
})
