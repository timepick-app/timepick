import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Users from '../Users';

// NOTE: This test file focuses on UX-level protection (client-side redirections).
// The real security is enforced by server-side middleware (requireAdmin).
// This test verifies component rendering with mocked dependencies.

// Wrapper pour React Query
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <MemoryRouter>
      {children}
    </MemoryRouter>
  </QueryClientProvider>
);

// Mock de react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock des hooks
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
  })),
}));

vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: vi.fn(() => ({ isAuthChecked: true })),
}));

vi.mock('@/hooks/useUsers', () => ({
  useUsers: vi.fn(() => ({
    users: [],
    loading: false,
    error: null,
    pagination: null,
    createUser: vi.fn(),
    updateUser: vi.fn(),
  })),
  useDeleteUser: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

// Mock des composants
vi.mock('@/components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

vi.mock('@/components/UserModal', () => ({
  UserModal: () => <div data-testid="user-modal">UserModal</div>,
}));

vi.mock('@/components/DeleteConfirmModal', () => ({
  DeleteConfirmModal: () => <div data-testid="delete-modal">DeleteConfirmModal</div>,
}));

vi.mock('@/components/UserDetailsModal', () => ({
  UserDetailsModal: () => <div data-testid="details-modal">UserDetailsModal</div>,
}));

vi.mock('@/components/admin/users/UsersDataTable', () => ({
  UsersDataTable: () => <div data-testid="users-data-table" />,
}));

vi.mock('@/components/admin/ExportButton', () => ({
  ExportButton: () => <div data-testid="export-button">ExportButton</div>,
}));

vi.mock('@/components/admin/ImportUsersDialog', () => ({
  ImportUsersDialog: () => <div data-testid="import-users-dialog" />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// Partial mock — pass through real lucide icons. The barrel import
// `@/components/admin` in Users.tsx triggers ESM eval of every re-exported
// admin module (incl. EmailSettingsSubtabs which uses Palette/Mail/KeyRound/
// CheckCircle), so an allowlist mock is too brittle.
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react');
  return { ...actual };
});

describe('Users Page - Protection Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('existe et peut être importé', () => {
    expect(Users).toBeDefined();
  });

  it('rend le layout admin et le tableau de gestion des membres', () => {
    render(
      <TestWrapper>
        <Users />
      </TestWrapper>
    );

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    expect(screen.getByTestId('users-data-table')).toBeInTheDocument();
    expect(screen.getByText('Nouveau membre')).toBeInTheDocument();
  });

  // Note: Les tests de redirection sont gérés par useAdminAuth
  // qui est testé séparément dans useAdminAuth.test.ts
});
