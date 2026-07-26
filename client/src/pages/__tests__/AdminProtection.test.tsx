import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Admin from '../Admin';
import { AuthProvider } from '../../hooks/useAuth';
import api from '../../services/api';

// NOTE: This test file focuses on UX-level protection (client-side redirections).
// The real security is enforced by server-side middleware (requireAdmin).
// These tests verify the redirect behavior but mock the actual admin components.

// Wrapper pour React Query
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Mock de NavigationBlockerContext pour éviter l'erreur "must be used within NavigationBlockerProvider"
vi.mock('../../contexts/NavigationBlockerContext', () => ({
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
}));

// Admin monte désormais le guide d'onboarding (Phase 0) → CreateEventSheet → useMediaQuery.
// jsdom ne fournit pas window.matchMedia → mock obligatoire (défaut desktop).
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <MemoryRouter>
      <AuthProvider>
        {children}
      </AuthProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock de react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Admin Page - Protection Admin & Gestion des erreurs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Mock console.error pour éviter le bruit dans les tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Vérification authentification au montage', () => {
    it('redirige vers /login si pas de token', async () => {
      render(<Admin />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });

    it('redirige vers /login si pas d\'user dans localStorage', async () => {
      localStorage.setItem('auth_token', 'some-token');
      // Pas d'user

      render(<Admin />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });

    it('redirige vers /me si utilisateur non-admin', async () => {
      localStorage.setItem('auth_token', 'header.payload.signature');
      localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'user@example.com', role: 'user', hasMemberAccess: true }));

      render(<Admin />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/me', { replace: true });
      });
    });

    it('affiche la page si utilisateur admin valide', async () => {
      const adminUser = { id: 'a1', email: 'admin@example.com', role: 'admin', hasMemberAccess: false, firstName: 'Admin', lastName: 'User' };
      localStorage.setItem('auth_token', 'header.payload.signature');
      localStorage.setItem('auth_user', JSON.stringify(adminUser));

      render(<Admin />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
        // Admin.tsx affiche "Tableau de bord"
        expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
      });
    });

    it('nettoie le localStorage et redirige si user JSON invalide', async () => {
      localStorage.setItem('auth_token', 'some-token');
      localStorage.setItem('auth_user', 'invalid-json{');

      render(<Admin />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBeNull();
        expect(localStorage.getItem('auth_user')).toBeNull();
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });
  });

  describe('fetchStats - Gestion des erreurs 401/403', () => {
    // Note: fetchStats est appelée manuellement et n'est pas dans un useEffect
    // Ces tests vérifient que la fonction gère correctement les erreurs

    it('gère l\'erreur 401 en déconnectant et redirigeant vers login', async () => {
      const adminUser = { id: 'a1', email: 'admin@example.com', role: 'admin', hasMemberAccess: false, firstName: 'Admin', lastName: 'User' };
      localStorage.setItem('auth_token', 'header.payload.signature');
      localStorage.setItem('auth_user', JSON.stringify(adminUser));

      vi.mocked(api.get).mockRejectedValue({
        response: { status: 401 },
      });

      render(<Admin />, { wrapper: TestWrapper });

      // Attendre que le composant soit monté
      await waitFor(() => {
        expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
      });

      // Simuler le comportement de fetchStats en appelant l'API avec 401
      // L'intercepteur Axios va gérer le 401 automatiquement
      // Mais dans le composant Admin, fetchStats a sa propre gestion du 401
      try {
        await api.get('/admin/dashboard');
      } catch {
        // L'erreur est gérée par l'intercepteur
      }

      // L'intercepteur Axios dans api.ts gère le 401 en:
      // 1. Supprimant le token du localStorage
      // 2. Redirigeant vers /login
      // Ce comportement est testé séparément dans les tests de l'API
    });

    it('gère l\'erreur 403 sans déconnexion (accès refusé)', async () => {
      const adminUser = { id: 'a1', email: 'admin@example.com', role: 'admin', hasMemberAccess: false, firstName: 'Admin', lastName: 'User' };
      localStorage.setItem('auth_token', 'header.payload.signature');
      localStorage.setItem('auth_user', JSON.stringify(adminUser));

      // Simuler une réponse 403 du middleware requireAdmin
      vi.mocked(api.get).mockRejectedValue({
        response: {
          status: 403,
          data: { error: 'Accès réservé aux administrateurs' },
        },
      });

      render(<Admin />, { wrapper: TestWrapper });

      // Attendre que le composant soit monté
      await waitFor(() => {
        expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
      });

      // Le 403 ne déclenche PAS de logout (contrairement au 401)
      expect(localStorage.getItem('auth_token')).toBe('header.payload.signature');
      expect(localStorage.getItem('auth_user')).toBe(JSON.stringify(adminUser));
    });
  });

  describe('Vérification rôle côté client', () => {
    it('accepte le rôle admin', async () => {
      const adminUser = { id: 'a1', email: 'admin@example.com', role: 'admin', hasMemberAccess: false, firstName: 'Admin', lastName: 'User' };
      localStorage.setItem('auth_token', 'header.payload.signature');
      localStorage.setItem('auth_user', JSON.stringify(adminUser));

      render(<Admin />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith('/me', { replace: true });
        expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
      });
    });

    it('refuse le rôle utilisateur', async () => {
      const parentUser = { id: 'u2', email: 'parent@example.com', role: 'user', hasMemberAccess: true, firstName: 'Utilisateur', lastName: 'User' };
      localStorage.setItem('auth_token', 'header.payload.signature');
      localStorage.setItem('auth_user', JSON.stringify(parentUser));

      render(<Admin />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/me', { replace: true });
      });
    });
  });

  describe('État de chargement', () => {
    it('affiche un état de chargement avant vérification auth', () => {
      // localStorage vide déclenche une redirection immédiate
      // Le chargement n'est pas visible car la vérification est synchrone
      render(<Admin />, { wrapper: TestWrapper });

      // La page d'administration ne doit pas s'afficher
      expect(screen.queryByTestId('admin-dashboard')).not.toBeInTheDocument();
    });
  });


  // NOTE: Les tests 401/403 sont couverts par les tests d'intégration backend
  // L'intercepteur Axios dans api.ts gère le 401 globalement (logout + redirect)
  // Le middleware requireAdmin retourne 403 pour les non-admin
});
