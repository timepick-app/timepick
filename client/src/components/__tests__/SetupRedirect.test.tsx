import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SetupStatusResponse } from '@/hooks/useSetupStatus';
import type { AuthUser } from '@/hooks/useAuth';

// Contrôle total sur useSetupStatus pour piloter needsSetup/isLoading par test.
vi.mock('@/hooks/useSetupStatus', () => ({
  useSetupStatus: vi.fn(),
}));

// État pilotable de useAuth : null par défaut (utilisateur non connecté).
const authState = vi.hoisted(() => ({ user: null as AuthUser | null }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authState.user }),
}));

// Capture les appels navigate() ; on préserve le reste du module réel.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { SetupRedirect } from '../SetupRedirect';
import { useSetupStatus } from '@/hooks/useSetupStatus';

// Raccourci typé pour éviter la répétition du cast.
// Justification : UseQueryResult<SetupStatusResponse> contient ~30 champs optionnels ;
// seuls data + isLoading sont consommés par SetupRedirect — cast partiel inévitable.
const mockStatus = (data: Partial<SetupStatusResponse> | undefined, isLoading: boolean) =>
  vi.mocked(useSetupStatus).mockReturnValue({
    data,
    isLoading,
  } as unknown as UseQueryResult<SetupStatusResponse, Error>);

describe('SetupRedirect — contrat de redirection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
  });

  it("needsSetup=true, /login, user=null → redirige vers /setup", async () => {
    mockStatus({ needsSetup: true }, false);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <SetupRedirect />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/setup', { replace: true });
    });
  });

  it('needsSetup=false, /login → navigate non appelé (vrai login non bloqué)', () => {
    mockStatus({ needsSetup: false }, false);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <SetupRedirect />
      </MemoryRouter>
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('isLoading=true, /login → navigate non appelé (chargement en cours)', () => {
    mockStatus(undefined, true);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <SetupRedirect />
      </MemoryRouter>
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('needsSetup=true MAIS user authentifié → navigate("/setup") jamais appelé (garde A2)', async () => {
    authState.user = { id: 'u1', email: 'admin@timepick.fr', role: 'admin', hasMemberAccess: true };
    mockStatus({ needsSetup: true }, false);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <SetupRedirect />
      </MemoryRouter>
    );

    // Laisser les micro-tâches se résoudre ; le guard doit rester silencieux.
    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
