import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UsersDataTable, type UsersDataTableProps } from '../UsersDataTable'
import type { User } from '@/types/user'

// useBulkDeleteUsers est mocké pour tous les tests afin d'éviter les appels réseau.
// mockMutate est réinitialisé via beforeEach ; T1 injecte son implémentation inline.
const mockMutate = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useUsers', () => ({
  useBulkDeleteUsers: () => ({ mutate: mockMutate, isPending: false }),
}))

const USERS: User[] = [
  {
    id: 'u1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Martin',
    role: 'user',
    createdAt: '2026-06-12T10:00:00Z',
    bookingCount: 2,
    hasMemberAccess: false,
  },
  {
    id: 'u2',
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Durand',
    role: 'admin',
    createdAt: '2026-06-12T10:00:00Z',
    bookingCount: 0,
    hasMemberAccess: false,
  },
]

function baseProps(): UsersDataTableProps {
  return {
    users: USERS,
    pageIndex: 0,
    pageSize: 20,
    pageCount: 3,
    isLoading: false,
    search: '',
    onSearchChange: vi.fn(),
    role: '',
    onRoleChange: vi.fn(),
    onPaginationChange: vi.fn(),
    onEdit: vi.fn(),
    onViewDetails: vi.fn(),
    onDelete: vi.fn(),
  }
}

function renderTable(overrides: Partial<UsersDataTableProps> = {}) {
  const props: UsersDataTableProps = { ...baseProps(), ...overrides }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <UsersDataTable {...props} />
    </QueryClientProvider>
  )
  return { ...utils, props }
}

describe('UsersDataTable', () => {
  beforeEach(() => {
    mockMutate.mockReset()
  })

  // ─── Tests existants ─────────────────────────────────────────────────────────

  it('affiche les lignes (nom, badge rôle, date)', () => {
    const { container } = renderTable()
    expect(container.textContent).toContain('Alice Martin')
    expect(container.textContent).toContain('Membre')
    expect(container.textContent).toContain('Admin')
    expect(container.textContent).toContain('12/06/2026')
  })

  it('affiche le message vide quand la liste est vide et non en chargement', () => {
    const { container } = renderTable({ users: [] })
    expect(container.textContent).toContain('Aucun membre trouvé')
  })

  it("n'affiche pas le message vide pendant le chargement", () => {
    const { container } = renderTable({ users: [], isLoading: true })
    expect(container.textContent).not.toContain('Aucun membre trouvé')
  })

  it('remonte la saisie de recherche via onSearchChange', () => {
    const { props } = renderTable()
    fireEvent.change(
      screen.getByPlaceholderText('Rechercher par email ou nom...'),
      { target: { value: 'ali' } }
    )
    expect(props.onSearchChange).toHaveBeenCalledWith('ali')
  })

  it('révèle la barre d\u2019actions groupées après sélection d\u2019une ligne', async () => {
    renderTable()
    fireEvent.click(screen.getAllByLabelText('Sélectionner la ligne')[0])
    const bar = await screen.findByRole('toolbar', { name: 'Actions groupées' })
    expect(bar).toBeInTheDocument()
    expect(bar.textContent).toContain('1 membre(s) sélectionné(s)')
  })

  it('remonte le changement de page via onPaginationChange', () => {
    const { props } = renderTable({ pageCount: 3 })
    fireEvent.click(screen.getByLabelText('Page suivante'))
    expect(props.onPaginationChange).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 20 })
  })

  // ─── Nouveaux tests ──────────────────────────────────────────────────────────

  it('T1 - suppression en masse E2E : dialog, confirmation et reset de sélection', async () => {
    mockMutate.mockImplementation(
      (ids: string[], opts: { onSuccess: (d: { deleted: number; deletedBookings: number; skipped: [] }) => void }) => {
        opts.onSuccess({ deleted: ids.length, deletedBookings: 0, skipped: [] })
      }
    )
    renderTable()

    // Cocher les 2 lignes
    const checkboxes = screen.getAllByLabelText('Sélectionner la ligne')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])

    // Cliquer 'Supprimer' dans la barre d'actions groupées
    const toolbar = await screen.findByRole('toolbar', { name: 'Actions groupées' })
    fireEvent.click(within(toolbar).getByRole('button', { name: /Supprimer/ }))

    // L'AlertDialog doit apparaître avec le bon titre
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Supprimer 2 membre(s) ?')).toBeInTheDocument()

    // Cliquer le bouton de confirmation
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }))

    // mockMutate doit être appelé avec les deux ids dans l'ordre de la table
    expect(mockMutate).toHaveBeenCalledWith(
      ['u1', 'u2'],
      expect.objectContaining({ onSuccess: expect.any(Function) })
    )

    // La barre disparaît : onSuccess avec deleted>0 déclenche resetRowSelection
    await waitFor(() => {
      expect(screen.queryByRole('toolbar', { name: 'Actions groupées' })).not.toBeInTheDocument()
    })
  })

  it('T2 - réinitialise la sélection quand la référence users change', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const props = baseProps()
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <UsersDataTable {...props} />
      </QueryClientProvider>
    )

    // Sélectionner la première ligne (Alice)
    fireEvent.click(screen.getAllByLabelText('Sélectionner la ligne')[0])
    expect(screen.getByRole('toolbar', { name: 'Actions groupées' })).toBeInTheDocument()

    // Rerendre avec une NOUVELLE référence de tableau (même contenu, nouvelle instance)
    const newUsers: User[] = [
      { ...USERS[0] },
      { id: 'u3', email: 'carol@example.com', role: 'user', createdAt: '2026-06-12T10:00:00Z', hasMemberAccess: false },
    ]
    rerender(
      <QueryClientProvider client={client}>
        <UsersDataTable {...props} users={newUsers} />
      </QueryClientProvider>
    )

    // useEffect([users]) → resetRowSelection → toolbar disparaît
    await waitFor(() => {
      expect(screen.queryByRole('toolbar', { name: 'Actions groupées' })).not.toBeInTheDocument()
    })
  })

  it('état erreur : affiche le message, le bouton Réessayer, et masque le message vide', () => {
    const onRetry = vi.fn()
    renderTable({ error: 'Boom', onRetry, users: [] })

    expect(screen.getByText('Boom')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Réessayer' })
    expect(retryBtn).toBeInTheDocument()
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
    // L'erreur prime sur le message vide (branches mutuellement exclusives)
    expect(screen.queryByText('Aucun membre trouvé')).not.toBeInTheDocument()
  })

  it('T7 - trigger du filtre rôle affiche "Administrateurs" quand role=admin', () => {
    // Repli jsdom : on vérifie la valeur affichée sans ouvrir le popover Radix
    renderTable({ role: 'admin' })
    expect(screen.getByLabelText('Filtrer par rôle')).toHaveTextContent('Administrateurs')
  })

  it('T7 - trigger du filtre rôle affiche "Tous les rôles" quand role vide', () => {
    renderTable({ role: '' })
    expect(screen.getByLabelText('Filtrer par rôle')).toHaveTextContent('Tous les rôles')
  })

  it('T8 - cellule Nom affiche "-" et Réservations "0" pour un user sans nom ni bookingCount', () => {
    const edgeUser: User = {
      id: 'u3',
      email: 'edge@example.com',
      firstName: null,
      lastName: null,
      role: 'user',
      createdAt: '2026-06-12T10:00:00Z',
      hasMemberAccess: false,
      // bookingCount absent → undefined → ?? 0
    }
    const { container } = renderTable({ users: [edgeUser] })
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(1)
    const rowText = rows[0].textContent ?? ''
    // formatFullName(null, null) → '' → accessorFn || '-'
    expect(rowText).toContain('-')
    // bookingCount ?? 0
    expect(rowText).toContain('0')
  })

  it('T11 - affiche au moins 5 lignes squelette quand isLoading=true', () => {
    const { container } = renderTable({ users: [], isLoading: true })
    // DataTableContent(skeletonRows=5) génère 5 <tr> dans <tbody>
    const skeletonRows = container.querySelectorAll('tbody tr')
    expect(skeletonRows.length).toBeGreaterThanOrEqual(5)
  })

  it('T12 - le bouton Effacer la recherche appelle onSearchChange avec chaîne vide', () => {
    const { props } = renderTable({ search: 'alice' })
    fireEvent.click(screen.getByLabelText('Effacer la recherche'))
    expect(props.onSearchChange).toHaveBeenCalledWith('')
  })

  it('T12 - Escape réinitialise la sélection et ferme la barre groupée', async () => {
    renderTable()
    fireEvent.click(screen.getAllByLabelText('Sélectionner la ligne')[0])
    expect(screen.getByRole('toolbar', { name: 'Actions groupées' })).toBeInTheDocument()

    // DataTableBulkActions écoute keydown sur window ; act() évite l'avertissement React
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('toolbar', { name: 'Actions groupées' })).not.toBeInTheDocument()
    })
  })
})
