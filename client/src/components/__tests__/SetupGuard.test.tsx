import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SetupStatusResponse } from '@/hooks/useSetupStatus';
import type { AuthUser } from '@/hooks/useAuth';

// Contrôle total sur useSetupStatus.
vi.mock('@/hooks/useSetupStatus', () => ({
  useSetupStatus: vi.fn(),
}));

// État pilotable de useAuth.
const authState = vi.hoisted(() => ({ user: null as AuthUser | null }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authState.user }),
}));

// Capture les appels navigate().
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { SetupGuard } from '../SetupGuard';
import { useSetupStatus } from '@/hooks/useSetupStatus';

const mockStatus = (data: Partial<SetupStatusResponse> | undefined, isLoading: boolean) =>
  vi.mocked(useSetupStatus).mockReturnValue({
    data,
    isLoading,
  } as unknown as UseQueryResult<SetupStatusResponse, Error>);

const renderGuard = () =>
  render(
    <MemoryRouter initialEntries={['/setup']}>
      <SetupGuard>
        <div>setup-wizard-stub</div>
      </SetupGuard>
    </MemoryRouter>
  );

describe('SetupGuard — contrat de redirection et rendu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
  });

  it("needsSetup=true, user=null → affiche les children (SetupWizard visible)", () => {
    mockStatus({ needsSetup: true }, false);

    renderGuard();

    expect(screen.getByText('setup-wizard-stub')).toBeInTheDocument();
  });

  it('needsSetup=false, user=null → navigate vers /login', () => {
    mockStatus({ needsSetup: false }, false);

    renderGuard();

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('user admin, needsSetup=true (cache stale) → navigate vers /admin (corrige la race bootstrap)', () => {
    authState.user = { id: 'u1', email: 'admin@timepick.fr', role: 'admin', hasMemberAccess: true };
    mockStatus({ needsSetup: true }, false);

    renderGuard();

    expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true });
  });

  it("user role='user', needsSetup=true → navigate vers /me", () => {
    authState.user = { id: 'u2', email: 'user@timepick.fr', role: 'user', hasMemberAccess: true };
    mockStatus({ needsSetup: true }, false);

    renderGuard();

    expect(mockNavigate).toHaveBeenCalledWith('/me', { replace: true });
  });

  it('isLoading=true → affiche le spinner (jamais null)', () => {
    mockStatus(undefined, true);

    renderGuard();

    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    expect(screen.queryByText('setup-wizard-stub')).not.toBeInTheDocument();
  });

  it('user authentifié + needsSetup=true → affiche le spinner en attendant la redirection (pas de rendu vide)', () => {
    authState.user = { id: 'u1', email: 'admin@timepick.fr', role: 'admin', hasMemberAccess: true };
    mockStatus({ needsSetup: true }, false);

    renderGuard();

    // Le fallback doit rendre le spinner, pas un écran vide.
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    expect(screen.queryByText('setup-wizard-stub')).not.toBeInTheDocument();
  });
});
