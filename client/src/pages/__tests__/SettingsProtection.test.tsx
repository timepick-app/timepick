import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from '../Settings';

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
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: vi.fn(() => ({ isAuthChecked: true })),
}));

// Mock des composants admin
vi.mock('@/components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}));

vi.mock('@/components/admin/PollingConfigPanel', () => ({
  PollingConfigPanel: () => <div data-testid="polling-config">PollingConfigPanel</div>,
}));

vi.mock('@/components/admin/MagicLinkTTLCard', () => ({
  MagicLinkTTLCard: () => <div data-testid="magic-link-ttl-card">MagicLinkTTLCard</div>,
}));

vi.mock('@/components/admin/SessionTTLCard', () => ({
  SessionTTLCard: () => <div data-testid="session-ttl-card">SessionTTLCard</div>,
}));

vi.mock('@/components/admin/SmtpConfigPanel', () => ({
  SmtpConfigPanel: () => <div data-testid="smtp-config">SmtpConfigPanel</div>,
}));

vi.mock('@/components/admin/SecurityPanel', () => ({
  SecurityPanel: () => <div data-testid="security-panel">SecurityPanel</div>,
}));

vi.mock('@/components/admin/EmailSettingsSubtabs', () => ({
  EmailSettingsSubtabs: () => (
    <div data-testid="email-settings-subtabs">EmailSettingsSubtabs</div>
  ),
  VALID_EMAIL_SUBTABS: [
    'template-invitation',
    'emails-systeme-magic-link-login',
    'emails-systeme-confirmation',
  ],
  DEFAULT_EMAIL_SUBTAB: 'template-invitation',
  LEGACY_EMAIL_SUBTAB_REDIRECTS: {
    'identite-visuelle': 'template-invitation',
    'emails-systeme-magic-links': 'emails-systeme-magic-link-login',
  },
}));

describe('Settings Page - Protection Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('existe et peut être importé', () => {
    expect(Settings).toBeDefined();
  });

  it('rend le layout admin et les panneaux de configuration', () => {
    render(
      <TestWrapper>
        <Settings />
      </TestWrapper>
    );

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    expect(screen.getByTestId('polling-config')).toBeInTheDocument();
    expect(screen.getByTestId('magic-link-ttl-card')).toBeInTheDocument();
    expect(screen.getByTestId('session-ttl-card')).toBeInTheDocument();
    expect(screen.getByTestId('smtp-config')).toBeInTheDocument();
  });

  // Note: Les tests de redirection sont gérés par useAdminAuth
  // qui est testé séparément dans useAdminAuth.test.ts
});
