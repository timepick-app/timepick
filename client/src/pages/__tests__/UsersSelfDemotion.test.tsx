import { act, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Users from '../Users'

// NOTE: Ce test verrouille l'ORDRE des opérations sur auto-démotion admin
// (F-085, Users.tsx:88-96) : revokeSessionOnServer() DOIT partir AVANT
// logout(). Si l'ordre est inversé, logout() purge `auth_token` du
// localStorage en premier ; le helper sort alors silencieusement par son
// garde `if (!token) return` — zéro requête, zéro erreur, zéro test rouge
// ailleurs. C'est le seul test qui détecte cette régression muette.

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
)

// Mock de react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock des hooks
const mockLogout = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'u1', role: 'admin' },
    token: 'fake-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: mockLogout,
    refreshSession: vi.fn(),
  })),
}))

vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: vi.fn(() => ({ isAuthChecked: true })),
}))

const mockUpdateUser = vi.fn()
vi.mock('@/hooks/useUsers', () => ({
  useUsers: vi.fn(() => ({
    users: [],
    loading: false,
    error: null,
    pagination: null,
    createUser: vi.fn(),
    updateUser: mockUpdateUser,
  })),
  useDeleteUser: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}))

// Mock des composants — UsersDataTable et UserModal sont rendus interactifs
// (contrairement à UsersProtection.test.tsx) pour pouvoir déclencher
// handleUpdateUser depuis un vrai geste utilisateur : édition puis sauvegarde.
vi.mock('@/components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}))

vi.mock('@/components/admin/users/UsersDataTable', () => ({
  UsersDataTable: ({ onEdit }: { onEdit: (u: unknown) => void }) => (
    <button onClick={() => onEdit({ id: 'u1', role: 'admin' })}>edit-row</button>
  ),
}))

vi.mock('@/components/UserModal', () => ({
  UserModal: ({ onSave }: { onSave: (d: unknown) => Promise<void> }) => (
    <button onClick={() => void onSave({ role: 'user' })}>save-modal</button>
  ),
}))

vi.mock('@/components/DeleteConfirmModal', () => ({
  DeleteConfirmModal: () => <div data-testid="delete-modal">DeleteConfirmModal</div>,
}))

vi.mock('@/components/UserDetailsModal', () => ({
  UserDetailsModal: () => <div data-testid="details-modal">UserDetailsModal</div>,
}))

vi.mock('@/components/admin/ExportButton', () => ({
  ExportButton: () => <div data-testid="export-button">ExportButton</div>,
}))

vi.mock('@/components/admin/ImportUsersDialog', () => ({
  ImportUsersDialog: () => <div data-testid="import-users-dialog" />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

// Partial mock — pass through real lucide icons, cf. UsersProtection.test.tsx
// (barrel `@/components/admin` évalue tout module ré-exporté).
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react')
  return { ...actual }
})

describe('Users Page - Auto-démotion admin (F-085)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateUser.mockResolvedValue({ selfDemoted: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()

    window.localStorage.setItem('auth_token', 'fake-token')

    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('révoque la session serveur AVANT le nettoyage local, après le délai de 1500ms', async () => {
    render(
      <TestWrapper>
        <Users />
      </TestWrapper>
    )

    await act(async () => {
      screen.getByText('edit-row').click()
    })
    await act(async () => {
      screen.getByText('save-modal').click()
    })

    // Rien ne se passe avant l'écoulement du délai post-toast.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockLogout).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/logout',
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockLogout).toHaveBeenCalledTimes(1)

    // L'invariant central : la requête de révocation part AVANT le nettoyage
    // local (logout), quel que soit l'ordre d'appel des mocks dans le module.
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(mockLogout.mock.invocationCallOrder[0])
  })
})
