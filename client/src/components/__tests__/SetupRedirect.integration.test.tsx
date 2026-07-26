import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';

// Test d'INTÉGRATION (≠ unitaire) : on monte l'arbre réel — AuthProvider +
// SetupRedirect + les vraies routes /, /login, /setup — sans mocker
// useNavigate ni useSetupStatus. Seuls `api` (src/test/setup.ts) et `sonner`
// sont mockés globalement. But : reproduire la race d'origine que les tests
// unitaires (hook mocké) ne peuvent pas exercer — redirect SYNCHRONE de RootRedirect
// vers /login qui précède la résolution ASYNC de GET /setup/status, puis
// sauvetage /login → /setup par SetupRedirect.
import { SetupRedirect } from '../SetupRedirect';
import { SetupGuard } from '../SetupGuard';
import { AuthProvider } from '../../hooks/useAuth';
import { SetupWizard } from '../../pages/SetupWizard';
import { RootRedirect } from '../RootRedirect';
import api from '../../services/api';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

// Promesse pilotable à la main : permet de figer GET /setup/status en attente
// (fenêtre de race) puis de la résoudre quand on veut.
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const renderApp = (initialPath: string, queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <SetupRedirect />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<div>login-stub</div>} />
            <Route
              path="/setup"
              element={
                <SetupGuard>
                  <SetupWizard />
                </SetupGuard>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

const WIZARD_HEADING = 'Bienvenue sur TimePick !';

describe('SetupRedirect — intégration : race de redirection setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('base vierge : "/" redirige vers /login (RootRedirect) puis vers /setup une fois needsSetup résolu', async () => {
    // GET /setup/status reste EN ATTENTE → SetupRedirect ne peut pas encore agir.
    const deferred = createDeferred<AxiosResponse>();
    vi.mocked(api.get).mockReturnValue(deferred.promise as unknown as Promise<AxiosResponse>);

    const queryClient = createTestQueryClient();
    renderApp('/', queryClient);

    // Fenêtre de race : non authentifié, RootRedirect a déjà renvoyé vers /login
    // AVANT que le statut setup n'arrive. Le wizard n'est pas encore là.
    expect(await screen.findByText('login-stub')).toBeInTheDocument();
    expect(screen.queryByText(WIZARD_HEADING)).not.toBeInTheDocument();

    // Le statut arrive : needsSetup=true. SetupRedirect doit SAUVER depuis /login
    // vers /setup (c'est précisément ce que l'exclusion /login empêchait).
    await act(async () => {
      deferred.resolve({ data: { needsSetup: true } } as AxiosResponse);
    });

    expect(await screen.findByText(WIZARD_HEADING)).toBeInTheDocument();
    expect(screen.queryByText('login-stub')).not.toBeInTheDocument();
  });

  it('après envoi du lien bootstrap : écran de confirmation, needsSetup inchangé (P3)', async () => {
    const user = userEvent.setup();

    // Statut frais en cache → SetupGuard affiche le wizard sans fetch.
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['setup-status'], { needsSetup: true });
    // GET /setup/smtp → config vide pour le prefill de l'étape SMTP
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { smtpHost: '', smtpPort: '587', smtpSecure: false, smtpUser: '', smtpPassword: '', smtpFromName: 'TimePick', smtpFromEmail: '' } },
    } as unknown as AxiosResponse);
    vi.mocked(api.put).mockResolvedValue({ data: {} } as unknown as AxiosResponse);
    vi.mocked(api.post).mockResolvedValue({ data: { data: { message: 'ok' } } } as unknown as AxiosResponse);

    renderApp('/setup', queryClient);

    // Étape 1 — SMTP : saisir un hôte minimal et continuer
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.test.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    await user.click(screen.getByTestId('smtp-continue-btn'));

    // Étape 2 — admin : saisir l'email et soumettre
    await user.type(await screen.findByLabelText('Email'), 'admin@exemple.com');
    await user.click(screen.getByRole('button', { name: 'Devenir administrateur' }));

    // P3 : le wizard affiche la confirmation d'envoi du lien bootstrap.
    // needsSetup reste true (aucun admin créé en base avant vérification du lien).
    expect(await screen.findByText(/lien d'activation a été envoyé/i)).toBeInTheDocument();
    expect(screen.queryByText('login-stub')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['setup-status'])).toEqual({ needsSetup: true });
  });

  it("permet de revenir à l'étape SMTP depuis l'étape admin via « Précédent »", async () => {
    const user = userEvent.setup();

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['setup-status'], { needsSetup: true });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { smtpHost: '', smtpPort: '587', smtpSecure: false, smtpUser: '', smtpPassword: '', smtpFromName: 'TimePick', smtpFromEmail: '' } },
    } as unknown as AxiosResponse);
    vi.mocked(api.put).mockResolvedValue({ data: {} } as unknown as AxiosResponse);

    renderApp('/setup', queryClient);

    // Étape 1 (SMTP) → étape 2 (admin)
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.test.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    await user.click(screen.getByTestId('smtp-continue-btn'));
    expect(await screen.findByRole('button', { name: 'Devenir administrateur' })).toBeInTheDocument();

    // « Précédent » → retour à l'étape SMTP (le formulaire revient, l'étape admin disparaît)
    await user.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(await screen.findByTestId('smtp-continue-btn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Devenir administrateur' })).not.toBeInTheDocument();
  });
});

describe('SetupRedirect + SetupGuard — non-régression : race bootstrap admin (A2+A3)', () => {
  // Reproduit la fenêtre de race diagnostiquée APRÈS le login (page reload ou
  // hydratation différée de AuthProvider) :
  // - cache ['setup-status'] encore needsSetup:true MAIS user en localStorage.
  // - SetupRedirect peut naviguer vers /setup avant que AuthProvider hydrate l'user.
  // - A3 : SetupGuard voit le user → redirige vers /admin (pas de page blanche).
  // - A2 : SetupRedirect ne re-redirige pas dès que user est chargé.

  // Jeton minimal valide pour isWellFormedJwt (3 segments non vides).
  const FAKE_JWT = 'header.payload.signature';
  const ADMIN_USER = { id: 'u1', email: 'admin@timepick.fr', role: 'admin', hasMemberAccess: true };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('A2+A3 : user connecté en localStorage + cache stale → atterrit sur /admin sans page blanche', async () => {
    // Simuler l'état post-bootstrap : user valide en localStorage, cache stale.
    localStorage.setItem('auth_token', FAKE_JWT);
    localStorage.setItem('auth_user', JSON.stringify(ADMIN_USER));

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['setup-status'], { needsSetup: true });

    // GET /setup/status (si refetch) → simuler la réponse needsSetup:false après que
    // l'admin a été créé côté serveur (staleTime=60s, ce mock ne devrait pas s'exécuter).
    vi.mocked(api.get).mockResolvedValue({
      data: { needsSetup: false },
    } as unknown as AxiosResponse);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <SetupRedirect />
            <Routes>
              <Route path="/admin" element={<div>admin-stub</div>} />
              <Route
                path="/setup"
                element={
                  <SetupGuard>
                    <div>{WIZARD_HEADING}</div>
                  </SetupGuard>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // A3 assure que le user finit sur /admin (SetupGuard le redirige si user authentifié).
    // Le wizard n'est jamais visible (l'admin n'a rien à faire sur /setup).
    expect(await screen.findByText('admin-stub')).toBeInTheDocument();
    expect(screen.queryByText(WIZARD_HEADING)).not.toBeInTheDocument();
  });

  it('A3 : SetupGuard avec user connecté + cache needsSetup:true → spinner visible + navigue vers /admin', async () => {
    // Simuler l'état post-login juste avant que navigate('/admin') de Login.tsx
    // ne se déclenche (les 500ms de délai) : user connecté, cache stale.
    localStorage.setItem('auth_token', FAKE_JWT);
    localStorage.setItem('auth_user', JSON.stringify(ADMIN_USER));

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['setup-status'], { needsSetup: true });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/setup']}>
          <AuthProvider>
            <Routes>
              <Route
                path="/setup"
                element={
                  <SetupGuard>
                    <div>{WIZARD_HEADING}</div>
                  </SetupGuard>
                }
              />
              <Route path="/admin" element={<div>admin-stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // A3 : pas d'écran vide — le spinner est rendu en attendant la redirection.
    expect(container.firstChild).not.toBeNull();
    // Le wizard ne s'affiche pas (l'admin n'a pas à passer par le setup).
    expect(screen.queryByText(WIZARD_HEADING)).not.toBeInTheDocument();

    // La redirection vers /admin doit finalement s'effectuer (useEffect).
    expect(await screen.findByText('admin-stub')).toBeInTheDocument();
  });
});
