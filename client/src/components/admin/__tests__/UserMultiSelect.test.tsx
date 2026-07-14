import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserMultiSelect } from '../UserMultiSelect'
import type { User } from '../../../hooks/useEvents'

// Mock du hook useUsers
vi.mock('../../../hooks/useUsers', () => ({
  useUsers: vi.fn()
}))

import { useUsers } from '../../../hooks/useUsers'

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

const mockUsers: User[] = [
  { id: '1', email: 'alice@test.com', firstName: 'Alice', lastName: 'Dupont', role: 'user', createdAt: '2026-01-19T10:00:00Z', hasMemberAccess: false },
  { id: '2', email: 'bob@test.com', firstName: 'Bob', lastName: 'Martin', role: 'user', createdAt: '2026-01-19T10:00:00Z', hasMemberAccess: false },
  { id: '3', email: 'charlie@test.com', firstName: 'Charlie', lastName: 'Durand', role: 'admin', createdAt: '2026-01-19T10:00:00Z', hasMemberAccess: false }
]

describe('UserMultiSelect', () => {
  const mockOnSelectionChange = vi.fn()
  const defaultProps = {
    eventId: 'test-event-1',
    selectedUserIds: [],
    onSelectionChange: mockOnSelectionChange
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock useUsers pour retourner des utilisateurs par défaut
    vi.mocked(useUsers).mockReturnValue({
      users: mockUsers,
      loading: false,
      error: null,
      pagination: null,
      refetch: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn()
    } as unknown as ReturnType<typeof useUsers>)
  })

  it('affiche la liste des utilisateurs', () => {
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    expect(screen.getByText('Alice Dupont')).toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('Bob Martin')).toBeInTheDocument()
    expect(screen.getByText('Charlie Durand')).toBeInTheDocument()
  })

  it('permet de sélectionner des utilisateurs', async () => {
    const user = userEvent.setup()
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    const aliceCheckbox = screen.getByLabelText(/Alice Dupont/i)
    await user.click(aliceCheckbox)

    expect(mockOnSelectionChange).toHaveBeenCalledWith(['1'])
  })

  it('permet de désélectionner des utilisateurs', async () => {
    const user = userEvent.setup()
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} selectedUserIds={['1', '2']} />, { wrapper })

    const aliceCheckbox = screen.getByLabelText(/Alice Dupont/i)
    await user.click(aliceCheckbox)

    expect(mockOnSelectionChange).toHaveBeenCalledWith(['2'])
  })

  it('permet la recherche par nom', () => {
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    const searchInput = screen.getByPlaceholderText(/Rechercher/i)
    fireEvent.change(searchInput, { target: { value: 'Bob' } })

    expect(screen.getByText('Bob Martin')).toBeInTheDocument()
    expect(screen.queryByText('Alice Dupont')).not.toBeInTheDocument()
    expect(screen.queryByText('Charlie Durand')).not.toBeInTheDocument()
  })

  it('permet la recherche par email', () => {
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    const searchInput = screen.getByPlaceholderText(/Rechercher/i)
    fireEvent.change(searchInput, { target: { value: 'alice@test.com' } })

    expect(screen.getByText('Alice Dupont')).toBeInTheDocument()
    expect(screen.queryByText('Bob Martin')).not.toBeInTheDocument()
  })

  it('bouton "Sélectionner tout" sélectionne tous les utilisateurs visibles', () => {
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    const selectAllButton = screen.getByRole('button', { name: /Sélectionner tout/i })
    fireEvent.click(selectAllButton)

    expect(mockOnSelectionChange).toHaveBeenCalled()
    const selectedIds = mockOnSelectionChange.mock.calls[0][0]
    expect(selectedIds).toHaveLength(3)
    expect(selectedIds).toContain('1')
    expect(selectedIds).toContain('2')
    expect(selectedIds).toContain('3')
  })

  it('bouton "Tout désélectionner" désélectionne tous les utilisateurs visibles', () => {
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} selectedUserIds={['1', '2', '3']} />, { wrapper })

    const deselectAllButton = screen.getByRole('button', { name: /Tout désélectionner/i })
    fireEvent.click(deselectAllButton)

    expect(mockOnSelectionChange).toHaveBeenCalledWith([])
  })

  it('affiche le badge de progression avec le nombre d\'invités sélectionnés', () => {
    const wrapper = createWrapper()
    const { rerender } = render(<UserMultiSelect {...defaultProps} selectedUserIds={[]} />, { wrapper })

    // Badge affiche "0/3" (0 sélectionnés sur 3 disponibles)
    expect(screen.getByText('0/3')).toBeInTheDocument()

    rerender(<UserMultiSelect {...defaultProps} selectedUserIds={['1']} />)
    expect(screen.getByText('1/3')).toBeInTheDocument()

    rerender(<UserMultiSelect {...defaultProps} selectedUserIds={['1', '2']} />)
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('affiche "Aucun invité trouvé" quand la recherche ne retourne rien', () => {
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    const searchInput = screen.getByPlaceholderText(/Rechercher/i)
    fireEvent.change(searchInput, { target: { value: 'Inexistant' } })

    expect(screen.getByText('Aucun invité trouvé')).toBeInTheDocument()
  })

  it('affiche "Les invités apparaîtront ici" quand la liste est vide', () => {
    const wrapper = createWrapper()
    vi.mocked(useUsers).mockReturnValue({
      users: [],
      loading: false,
      error: null,
      pagination: null,
      refetch: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn()
    } as unknown as ReturnType<typeof useUsers>)

    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    expect(screen.getByText('Les invités apparaîtront ici')).toBeInTheDocument()
  })

  it('désactive les contrôles quand disabled est true', () => {
    const wrapper = createWrapper()
    render(<UserMultiSelect {...defaultProps} disabled />, { wrapper })

    const searchInput = screen.getByPlaceholderText(/Rechercher/i)
    expect(searchInput).toBeDisabled()

    const selectAllButton = screen.getByRole('button', { name: /Sélectionner tout/i })
    expect(selectAllButton).toBeDisabled()
  })
})

describe('UserMultiSelect - État de chargement', () => {
  const mockOnSelectionChange = vi.fn()
  const defaultProps = {
    eventId: 'test-event-1',
    selectedUserIds: [],
    onSelectionChange: mockOnSelectionChange
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un état de chargement', () => {
    const wrapper = createWrapper()
    // Configurer le mock pour l'état de chargement AVANT le render
    vi.mocked(useUsers).mockReturnValue({
      users: undefined,
      loading: true,
      error: null,
      pagination: null,
      refetch: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn()
    } as unknown as ReturnType<typeof useUsers>)

    render(<UserMultiSelect {...defaultProps} />, { wrapper })

    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })
})
