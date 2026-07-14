import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventList } from '../EventList'
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

describe('EventList', () => {
  const mockEvents: Event[] = [
    {
      id: '1',
      name: 'Événement 1',
      description: 'Description 1',
      isPublished: true,
      opensAt: '2026-02-01T10:00:00Z',
      hasCustomInvitation: false,
      periodStart: null,
      periodEnd: null,
      createdAt: '2026-01-19T10:00:00Z',
      updatedAt: '2026-01-19T10:00:00Z'
    },
    {
      id: '2',
      name: 'Événement 2',
      description: 'Description 2',
      isPublished: false,
      opensAt: null,
      hasCustomInvitation: false,
      periodStart: null,
      periodEnd: null,
      createdAt: '2026-01-19T10:00:00Z',
      updatedAt: '2026-01-19T10:00:00Z'
    }
  ]

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

  it('rend la liste des événements', () => {
    const wrapper = createWrapper()
    render(<EventList events={mockEvents} isLoading={false} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Événement 1')).toBeInTheDocument()
    expect(screen.getByText('Événement 2')).toBeInTheDocument()
    expect(screen.getByText('Description 1')).toBeInTheDocument()
    expect(screen.getByText('Description 2')).toBeInTheDocument()
  })

  it('affiche le badge "Publié" pour les événements publiés', () => {
    const wrapper = createWrapper()
    render(<EventList events={mockEvents} isLoading={false} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Publié')).toBeInTheDocument()
  })

  it('affiche le badge "Brouillon" pour les événements non publiés', () => {
    const wrapper = createWrapper()
    render(<EventList events={mockEvents} isLoading={false} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Brouillon')).toBeInTheDocument()
  })

  it('affiche l\'état de chargement pendant isLoading', () => {
    const wrapper = createWrapper()
    render(<EventList events={[]} isLoading={true} onEdit={mockOnEdit} />, { wrapper })

    // Vérifier la présence des skeletons (3 par défaut)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('affiche un message vide quand il n\'y a pas d\'événements', () => {
    const wrapper = createWrapper()
    render(<EventList events={[]} isLoading={false} onEdit={mockOnEdit} />, { wrapper })

    expect(screen.getByText('Aucun événement')).toBeInTheDocument()
    expect(screen.getByText('Créez votre premier événement pour commencer.')).toBeInTheDocument()
  })

  it('appelle onEdit lors du clic sur le bouton modifier', () => {
    const wrapper = createWrapper()
    render(<EventList events={mockEvents} isLoading={false} onEdit={mockOnEdit} />, { wrapper })

    const editButtons = screen.getAllByTitle('Modifier l\'événement')
    fireEvent.click(editButtons[0])

    expect(mockOnEdit).toHaveBeenCalledWith(mockEvents[0])
  })

  it('affiche la date d\'ouverture des inscriptions si définie', () => {
    const wrapper = createWrapper()
    render(<EventList events={mockEvents} isLoading={false} onEdit={mockOnEdit} />, { wrapper })

    // Le mock affiche "Ouvre le" pour les événements avec date
    expect(screen.getByText(/Ouvre le/)).toBeInTheDocument()
  })

  it('affiche la date de mise à jour', () => {
    const wrapper = createWrapper()
    render(<EventList events={mockEvents} isLoading={false} onEdit={mockOnEdit} />, { wrapper })

    // Il y a 2 événements, donc 2 occurrences de "Mis à jour le"
    const updateTexts = screen.getAllByText(/Mis à jour le/i)
    expect(updateTexts.length).toBe(2)
  })
})
