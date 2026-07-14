import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import type { Event } from '@/hooks/useEvents'
import { EventTable } from '../EventTable'
import type { EventTableRow } from '../EventTable'

// ─── Mocks ───────────────────────────────────────────────────────────────────

/**
 * Mock partiel de useEvents : tous les exports réels sont conservés sauf
 * useBulkDeleteEvents qui est remplacé par un stub sans appel réseau.
 */
vi.mock('@/hooks/useEvents', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/hooks/useEvents')>()
  return {
    ...mod,
    useBulkDeleteEvents: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

/**
 * EventsBulkActions est un composant autonome testé séparément ; ici on le
 * neutralise pour isoler EventTable.
 */
vi.mock('../EventsBulkActions', () => ({
  EventsBulkActions: (_props: { table: Table<EventTableRow> }) => null,
}))

/**
 * EventDeleteDialog est mocké avec un placeholder testable par testid/data-open.
 */
vi.mock('../EventDeleteDialog', () => ({
  EventDeleteDialog: ({
    event,
    open,
    onOpenChange,
    onConfirm,
  }: {
    event: EventTableRow | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: (id: string) => void
    isDeleting?: boolean
  }) => (
    <div data-testid="event-delete-dialog" data-open={String(open)}>
      {open && event && (
        <>
          <span data-event-id={event.id}>Supprimer {event.name}</span>
          <button data-testid="confirm-delete" onClick={() => onConfirm(event.id)}>
            Confirmer
          </button>
          <button data-testid="cancel-delete" onClick={() => onOpenChange(false)}>
            Fermer
          </button>
        </>
      )}
    </div>
  ),
}))

/**
 * EventsRowActions est mocké avec un menu simplifié toujours visible afin de
 * tester les callbacks sans dépendre du DropdownMenu Radix.
 */
vi.mock('../EventsRowActions', () => ({
  EventsRowActions: ({
    event,
    onEdit,
    onDuplicate,
    onDelete,
    disabled,
  }: {
    event: Event
    onEdit: (e: Event) => void
    onDuplicate: (e: Event) => void
    onDelete: (e: Event) => void
    disabled?: boolean
  }) => (
    <div>
      <button aria-label="Actions de l'événement" disabled={disabled}>
        •••
      </button>
      <button onClick={() => onEdit(event)} disabled={disabled}>
        Modifier
      </button>
      <button onClick={() => onDuplicate(event)} disabled={disabled}>
        Dupliquer
      </button>
      <button onClick={() => onDelete(event)} disabled={disabled}>
        Supprimer
      </button>
    </div>
  ),
}))

/**
 * Badge mocké pour simplifier les assertions sur les variants (badge-success,
 * badge-warning…) sans dépendre des classes Tailwind réelles.
 */
vi.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    variant = 'default',
    size: _size,
    'data-testid': dataTestId,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    variant?: string
    size?: string
    'data-testid'?: string
    'aria-label'?: string
  }) => (
    <span
      className={`badge-${variant}`}
      data-testid={dataTestId}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  ),
}))

// ─── Données de test ──────────────────────────────────────────────────────────

const mockEvents: EventTableRow[] = [
  {
    id: 'event-1',
    name: 'Événement A',
    description: null,
    isPublished: true,
    opensAt: null,
    hasCustomInvitation: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    periodStart: null,
    periodEnd: null,
    stats: {
      eventId: 'event-1',
      totalSlots: 10,
      filledSlots: 7,
      vacantSlots: 3,
      fillRate: 70,
      totalCapacity: 20,
      totalBookings: 14,
    },
  },
  {
    id: 'event-2',
    name: 'Événement B',
    description: 'Brouillon',
    isPublished: false,
    opensAt: null,
    hasCustomInvitation: false,
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
    periodStart: null,
    periodEnd: null,
    stats: {
      eventId: 'event-2',
      totalSlots: 5,
      filledSlots: 0,
      vacantSlots: 5,
      fillRate: 0,
      totalCapacity: 10,
      totalBookings: 0,
    },
  },
  {
    id: 'event-3',
    name: 'Événement C',
    description: 'Sans stats',
    isPublished: true,
    opensAt: null,
    hasCustomInvitation: false,
    createdAt: '2024-01-25T10:00:00Z',
    updatedAt: '2024-01-25T10:00:00Z',
    periodStart: null,
    periodEnd: null,
    stats: undefined,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderTable(overrides: Partial<React.ComponentProps<typeof EventTable>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <EventTable data={mockEvents} {...overrides} />
    </QueryClientProvider>
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EventTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. En-têtes de colonnes ─────────────────────────────────────────────────

  it('affiche les en-têtes de colonnes attendus', () => {
    renderTable()

    const headerRow = screen.getAllByRole('row')[0]
    ;['Événement', 'Statut', 'Modèle', 'Créneaux', 'Taux', 'Période'].forEach((label) => {
      expect(within(headerRow).getByText(label)).toBeInTheDocument()
    })
  })

  // ── 2. Noms d'événements ────────────────────────────────────────────────────

  it('affiche les noms de chaque événement', () => {
    renderTable()

    expect(screen.getByText('Événement A')).toBeInTheDocument()
    expect(screen.getByText('Événement B')).toBeInTheDocument()
    expect(screen.getByText('Événement C')).toBeInTheDocument()
  })

  // ── 3. Badges Publié / Brouillon ────────────────────────────────────────────

  it('affiche le badge Publié pour les événements publiés', () => {
    renderTable()

    const publishedBadges = screen.getAllByText('Publié')
    expect(publishedBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('affiche le badge Brouillon pour les événements non publiés', () => {
    renderTable()

    const draftBadges = screen.getAllByText('Brouillon')
    expect(draftBadges.length).toBeGreaterThanOrEqual(1)
  })

  // ── 4. Badge Modèle ─────────────────────────────────────────────────────────

  it('badge Modèle : variant info et aria-label "Template personnalisé" quand hasCustomInvitation=true', () => {
    renderTable({ data: [mockEvents[0]] }) // event-1: hasCustomInvitation=true

    const badge = screen.getByTestId('event-template-badge')
    expect(badge).toHaveTextContent('Personnalisé')
    expect(badge.className).toContain('badge-info')
    expect(badge).toHaveAttribute('aria-label', 'Template personnalisé')
  })

  it('badge Modèle : variant default et aria-label "Template par défaut" quand hasCustomInvitation=false', () => {
    renderTable({ data: [mockEvents[1]] }) // event-2: hasCustomInvitation=false

    const badge = screen.getByTestId('event-template-badge')
    expect(badge).toHaveTextContent('Défaut')
    expect(badge.className).toContain('badge-default')
    expect(badge).toHaveAttribute('aria-label', 'Template par défaut')
  })

  // ── 5. Variants Taux ────────────────────────────────────────────────────────

  it('badge Taux success pour fillRate >= 80 %', () => {
    const event: EventTableRow = {
      ...mockEvents[0],
      stats: { ...mockEvents[0].stats!, fillRate: 85 },
    }
    renderTable({ data: [event] })

    const badge = screen.getByText('85%').closest('span')
    expect(badge?.className).toContain('badge-success')
  })

  it('badge Taux warning pour fillRate entre 50 % et 79 %', () => {
    const event: EventTableRow = {
      ...mockEvents[0],
      stats: { ...mockEvents[0].stats!, fillRate: 60 },
    }
    renderTable({ data: [event] })

    const badge = screen.getByText('60%').closest('span')
    expect(badge?.className).toContain('badge-warning')
  })

  it('badge Taux default pour fillRate < 50 %', () => {
    const event: EventTableRow = {
      ...mockEvents[0],
      stats: { ...mockEvents[0].stats!, fillRate: 30 },
    }
    renderTable({ data: [event] })

    const badge = screen.getByText('30%').closest('span')
    expect(badge?.className).toContain('badge-default')
  })

  // ── 6. Em dash quand stats absentes ────────────────────────────────────────

  it('affiche le tiret cadratin — quand les stats sont absentes', () => {
    renderTable({ data: [mockEvents[2]] }) // event-3: stats=undefined

    const emDashes = screen.getAllByText('—')
    expect(emDashes.length).toBeGreaterThan(0)
  })

  // ── 7. État vide ────────────────────────────────────────────────────────────

  it('affiche "Aucun événement" quand la liste est vide', () => {
    renderTable({ data: [] })

    expect(screen.getByText('Aucun événement')).toBeInTheDocument()
  })

  // ── 8. Skeleton de chargement ───────────────────────────────────────────────

  it('affiche des éléments .animate-pulse pendant le chargement', () => {
    renderTable({ data: [], isLoading: true })

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  // ── 9. Recherche par nom ────────────────────────────────────────────────────

  it('filtre les lignes par saisie dans le champ de recherche', async () => {
    const user = userEvent.setup()
    renderTable()

    // Les 3 événements sont initialement visibles.
    expect(screen.getByText('Événement A')).toBeInTheDocument()
    expect(screen.getByText('Événement B')).toBeInTheDocument()
    expect(screen.getByText('Événement C')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText('Rechercher un événement…')
    await user.type(searchInput, 'A')

    // Seul "Événement A" contient le caractère "A".
    expect(screen.getByText('Événement A')).toBeInTheDocument()
    expect(screen.queryByText('Événement B')).not.toBeInTheDocument()
    expect(screen.queryByText('Événement C')).not.toBeInTheDocument()
  })

  // ── 10. Menu ••• → callbacks ────────────────────────────────────────────────

  it('clic sur le trigger puis Modifier appelle onEdit avec le bon événement', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    renderTable({ onEdit })

    const trigger = screen.getAllByRole('button', { name: "Actions de l'événement" })[0]
    await user.click(trigger)

    await user.click(screen.getAllByRole('button', { name: 'Modifier' })[0])

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(mockEvents[0])
  })

  it('clic sur le trigger puis Dupliquer appelle onDuplicate avec le bon événement', async () => {
    const user = userEvent.setup()
    const onDuplicate = vi.fn()
    renderTable({ onDuplicate })

    const trigger = screen.getAllByRole('button', { name: "Actions de l'événement" })[0]
    await user.click(trigger)

    await user.click(screen.getAllByRole('button', { name: 'Dupliquer' })[0])

    expect(onDuplicate).toHaveBeenCalledTimes(1)
    expect(onDuplicate).toHaveBeenCalledWith(mockEvents[0])
  })

  it('clic sur le trigger puis Supprimer appelle onDelete avec le bon événement', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    renderTable({ onDelete })

    const trigger = screen.getAllByRole('button', { name: "Actions de l'événement" })[0]
    await user.click(trigger)

    await user.click(screen.getAllByRole('button', { name: 'Supprimer' })[0])

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(mockEvents[0])
  })

  // ── 11. Dialog de suppression ouverte quand onConfirmDelete fourni ───────────

  it('clic Supprimer ouvre la dialog de confirmation quand onConfirmDelete est fourni', async () => {
    const user = userEvent.setup()
    const onConfirmDelete = vi.fn()
    renderTable({ onConfirmDelete })

    // La dialog est présente mais fermée initialement.
    expect(screen.queryByTestId('confirm-delete')).not.toBeInTheDocument()

    const trigger = screen.getAllByRole('button', { name: "Actions de l'événement" })[0]
    await user.click(trigger)

    await user.click(screen.getAllByRole('button', { name: 'Supprimer' })[0])

    // Le bouton de confirmation apparaît une fois la dialog ouverte.
    expect(screen.getByTestId('confirm-delete')).toBeInTheDocument()
  })

  // ── 12. Pas de dialog sans onConfirmDelete ──────────────────────────────────

  it("ne rend pas EventDeleteDialog quand onConfirmDelete n'est pas fourni", () => {
    renderTable()

    expect(screen.queryByTestId('event-delete-dialog')).not.toBeInTheDocument()
  })

  // ── 13. Double-clic sur une ligne ───────────────────────────────────────────

  describe('double-clic sur une ligne', () => {
    it('appelle onEdit avec l’événement de la ligne au double-clic', async () => {
      const onEdit = vi.fn()
      const user = userEvent.setup()
      renderTable({ onEdit })
      await user.dblClick(screen.getByText('Événement A'))
      expect(onEdit).toHaveBeenCalledTimes(1)
      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }))
    })

    it('n’appelle pas onEdit au double-clic sur la checkbox de sélection', async () => {
      const onEdit = vi.fn()
      const user = userEvent.setup()
      renderTable({ onEdit })
      await user.dblClick(screen.getAllByLabelText('Sélectionner la ligne')[0])
      expect(onEdit).not.toHaveBeenCalled()
    })

    it('n’appelle pas onEdit au double-clic sur le menu d’actions •••', async () => {
      const onEdit = vi.fn()
      const user = userEvent.setup()
      renderTable({ onEdit })
      await user.dblClick(screen.getAllByLabelText("Actions de l'événement")[0])
      expect(onEdit).not.toHaveBeenCalled()
    })
  })
})
