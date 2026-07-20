import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Mock the settings service BEFORE importing Login so the real module (which
// constructs an axios instance at import time) never loads. setup.ts overrides
// the global URL, which breaks axios's isURLSameOrigin helper.
vi.mock('../../services/settings.service', () => ({
  getPublicHealth: vi.fn(),
}));

// Capture les appels navigate() pour asserter la destination post-login (D4).
// On préserve le reste du module réel (MemoryRouter, Link, useSearchParams…).
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import Login from '../Login';
import { AuthProvider } from '../../hooks/useAuth';
import api from '../../services/api';
import { getPublicHealth } from '../../services/settings.service';

// NOTE: `../services/api` is auto-mocked in src/test/setup.ts (vi.mock with default export).
// We still import it here to use vi.mocked for per-test behavior.

const mockedApiPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockedGetPublicHealth = vi.mocked(getPublicHealth);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderLogin = (route: string = '/login') => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Login — SMTP degraded banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render the banner when health reports smtp:ok', async () => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });

    renderLogin();

    // Wait for the form to render (health query is async; banner must not appear).
    await screen.findByRole('button', { name: /recevoir mon lien de connexion/i });

    // Give the health query a tick to resolve before asserting absence.
    await waitFor(() => {
      expect(mockedGetPublicHealth).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('smtp-degraded-banner')).not.toBeInTheDocument();
  });

  it('renders the banner when health reports smtp:degraded', async () => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: { smtp: 'degraded' },
    });

    renderLogin();

    const banner = await screen.findByTestId('smtp-degraded-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/service email dégradé/i);
  });
});

describe('Login — 503 persistent error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Default health ok so the banner doesn't get in our way.
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a persistent error mentioning "temporairement indisponible" on 503 EMAIL_SERVICE_UNAVAILABLE', async () => {
    const user = userEvent.setup();

    mockedApiPost.mockRejectedValueOnce({
      response: {
        status: 503,
        data: {
          error: {
            code: 'EMAIL_SERVICE_UNAVAILABLE',
            message: "Le service d'envoi d'email est temporairement indisponible.",
          },
        },
      },
    });

    renderLogin();

    const emailInput = await screen.findByPlaceholderText('votre@email.com');
    await user.type(emailInput, 'user@example.com');

    const submit = screen.getByRole('button', { name: /recevoir mon lien de connexion/i });
    await user.click(submit);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/temporairement indisponible/i);

    // Ensure it persists (not a toast that auto-dismisses) — still present after a tick.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/temporairement indisponible/i);
    });

    expect(mockedApiPost).toHaveBeenCalledWith('/auth/login', { email: 'user@example.com' });
  });
});

describe('Login — emergency-login reveal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT render any link to /emergency-login in the default state', async () => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });

    const { container } = renderLogin();

    await screen.findByRole('button', { name: /recevoir mon lien de connexion/i });
    await waitFor(() => {
      expect(mockedGetPublicHealth).toHaveBeenCalled();
    });

    expect(container.querySelector('a[href="/emergency-login"]')).toBeNull();
    expect(screen.queryByText(/code de secours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accès de secours/i)).not.toBeInTheDocument();
  });

  it('renders the neutral user footer in the default state', async () => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });

    renderLogin();

    expect(
      await screen.findByText(/vérifiez vos spams ou contactez votre administrateur/i)
    ).toBeInTheDocument();
  });

  it('renders the admin sub-CTA inside the SMTP-degraded banner', async () => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: { smtp: 'degraded' },
    });

    renderLogin();

    const banner = await screen.findByTestId('smtp-degraded-banner');
    const recoveryLink = banner.querySelector('a[href="/emergency-login"]');
    expect(recoveryLink).not.toBeNull();
    expect(banner).toHaveTextContent(/vous êtes administrateur/i);
  });

  it('renders the admin sub-CTA on the post-submit success state', async () => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
    mockedApiPost.mockResolvedValueOnce({ data: { message: 'ok' } });

    const user = userEvent.setup();
    renderLogin();

    const emailInput = await screen.findByPlaceholderText('votre@email.com');
    await user.type(emailInput, 'admin@example.com');
    const submit = screen.getByRole('button', { name: /recevoir mon lien de connexion/i });
    await user.click(submit);

    const successBlock = await screen.findByTestId('login-success');
    expect(successBlock).toHaveTextContent(/si cet email est enregistré/i);
    expect(successBlock).toHaveTextContent(/vous êtes administrateur/i);
    // Scope link assertion to the success block so a future persistent layout
    // link outside the success container cannot satisfy this test (F13).
    expect(
      within(successBlock).getByRole('link', { name: /code de secours/i })
    ).toHaveAttribute('href', '/emergency-login');
  });

  it('renders the admin sub-CTA on the default form when ?ctx=admin is in the URL', async () => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });

    const { container } = renderLogin('/login?ctx=admin');

    await screen.findByRole('button', { name: /recevoir mon lien de connexion/i });
    const recoveryLink = container.querySelector('a[href="/emergency-login"]');
    expect(recoveryLink).not.toBeNull();
    expect(screen.getByText(/administrateur en panne d'email/i)).toBeInTheDocument();
  });

  it.each([
    ['/login?ctx=Admin', 'mixed-case'],
    ['/login?ctx=ADMIN', 'uppercase'],
    ['/login?ctx=', 'empty'],
    ['/login?ctx=true', 'truthy non-admin'],
    ['/login?ctx=admin&ctx=admin', 'doubled-admin'],
    ['/login?ctx=bogus&ctx=admin', 'bogus-then-admin'],
    ['/login?ctx=admin&ctx=bogus', 'admin-then-bogus'],
  ])('ignores invalid ctx values (fail-closed): %s (%s)', async (route) => {
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });

    const { container } = renderLogin(route);

    await screen.findByRole('button', { name: /recevoir mon lien de connexion/i });
    // Fail-closed: the CTA is only revealed when ctx appears exactly once
    // and equals the literal 'admin'. Any other shape is ignored.
    expect(container.querySelector('a[href="/emergency-login"]')).toBeNull();
  });
});

describe('Login — magic link one-shot verify', () => {
  // Régression : sans le garde verifiedTokenRef, l'effet de vérification boucle
  // (~500ms d'oscillation loading/success) car login() re-rend AuthProvider
  // (nouvelle identité de verifyAndLogin) et fait basculer isAuthenticated —
  // tous deux en deps — et /auth/verify étant stateless chaque re-vérif réussit.
  // Ce test s'assure qu'un token donné n'appelle /auth/verify qu'une seule fois.

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appelle /auth/verify exactement une fois pour un même token de magic link', async () => {
    mockedApiPost.mockResolvedValue({
      data: {
        data: {
          user: { id: 'u1', email: 'admin@timepick.fr', firstName: 'A', lastName: 'D', role: 'admin' },
          token: 'session-token',
          sessionTTL: 7200,
        },
        message: 'ok',
      },
    });

    renderLogin('/login?token=valid-token');

    // Attendre l'écran de succès — confirme que la vérification a abouti.
    await screen.findByText(/Redirection/i);

    // Laisser les micro-tâches en attente se résoudre (re-rendus d'AuthProvider).
    await waitFor(() => {
      const verifyCalls = mockedApiPost.mock.calls.filter((c) => c[0] === '/auth/verify');
      expect(verifyCalls).toHaveLength(1);
    });

    // Laisser le setTimeout(500) de redirection se déclencher DANS le scope act
    // (sinon il fuit après le teardown → warning act). Vérifie au passage que la
    // fenêtre de ~500ms n'engendre aucune 2e vérif (anti-régression de la boucle).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(
      mockedApiPost.mock.calls.filter((c) => c[0] === '/auth/verify'),
    ).toHaveLength(1);
  });
});

describe('Login — redirection post-login (priorité D4 : eventId > redirectAfterLogin > rôle)', () => {
  // Forme minimale du payload /auth/verify (reflète AuthLoginResponse de Login.tsx).
  type VerifyResponseData = {
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string | null;
      role: 'admin' | 'user';
      hasMemberAccess: boolean;
    };
    token: string;
    sessionTTL?: number;
    eventId?: string;
    redirectAfterLogin?: string;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Déclenche la vérification du magic link puis attend le setTimeout(500) de
  // redirection (même harnais que le test one-shot ci-dessus : timers réels).
  const triggerRedirect = async (data: VerifyResponseData) => {
    mockedApiPost.mockResolvedValue({ data: { data, message: 'ok' } });
    renderLogin('/login?token=valid-token');
    await screen.findByText(/Redirection/i);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
  };

  it('eventId présent → redirige vers /me/events/:id (prime sur redirectAfterLogin, AC1)', async () => {
    await triggerRedirect({
      user: { id: 'u1', email: 'user@timepick.fr', firstName: 'U', lastName: 'S', role: 'user', hasMemberAccess: true },
      token: 'session-token',
      eventId: 'evt-123',
      redirectAfterLogin: '/me',
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/me/events/evt-123', { replace: true });
  });

  it("pas d'eventId, redirectAfterLogin présent → redirige vers cette URL (D4)", async () => {
    await triggerRedirect({
      user: { id: 'u1', email: 'user@timepick.fr', firstName: 'U', lastName: 'S', role: 'user', hasMemberAccess: true },
      token: 'session-token',
      redirectAfterLogin: '/me',
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/me', { replace: true });
  });

  it('ni eventId ni redirectAfterLogin, rôle admin → redirige vers /admin (AC2)', async () => {
    await triggerRedirect({
      user: { id: 'u1', email: 'admin@timepick.fr', firstName: 'A', lastName: 'D', role: 'admin', hasMemberAccess: true },
      token: 'session-token',
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true });
  });

  it('ni eventId ni redirectAfterLogin, rôle user → redirige vers /me (AC2)', async () => {
    await triggerRedirect({
      user: { id: 'u1', email: 'user@timepick.fr', firstName: 'U', lastName: 'S', role: 'user', hasMemberAccess: true },
      token: 'session-token',
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/me', { replace: true });
  });
});

describe("renvoi d'invitation expirée", () => {
  /** Erreur renvoyée par /auth/verify pour un token expiré avec renvoi autorisé. */
  const tokenExpiredError = {
    response: {
      data: {
        error: {
          code: 'TOKEN_EXPIRED',
          context: { canResend: true },
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Amène le composant dans l'état « lien expiré + canResend » et retourne le bouton. */
  const renderAndGetResendButton = async () => {
    mockedApiPost.mockRejectedValueOnce(tokenExpiredError);
    renderLogin('/login?token=expired-token');
    return screen.findByRole('button', { name: /demander un nouveau lien/i });
  };

  it('succès → alerte verte "Un nouveau lien vous a été envoyé par email"', async () => {
    const user = userEvent.setup();
    const button = await renderAndGetResendButton();

    mockedApiPost.mockResolvedValueOnce({ data: { message: 'ok' } });
    await user.click(button);

    expect(
      await screen.findByText(/un nouveau lien vous a été envoyé par email/i),
    ).toBeInTheDocument();
    // Le bouton « Demander » disparaît (état 'sent').
    expect(
      screen.queryByRole('button', { name: /demander un nouveau lien/i }),
    ).not.toBeInTheDocument();
  });

  it('EMAIL_SERVICE_UNAVAILABLE → message indisponible + bouton Réessayer présent', async () => {
    const user = userEvent.setup();
    const button = await renderAndGetResendButton();

    mockedApiPost.mockRejectedValueOnce({
      response: { data: { error: { code: 'EMAIL_SERVICE_UNAVAILABLE' } } },
    });
    await user.click(button);

    expect(
      await screen.findByText(/temporairement indisponible/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /réessayer/i }),
    ).toBeInTheDocument();
  });

  it('RESEND_NOT_AVAILABLE → message "Impossible de renvoyer … administrateur"', async () => {
    const user = userEvent.setup();
    const button = await renderAndGetResendButton();

    mockedApiPost.mockRejectedValueOnce({
      response: { data: { error: { code: 'RESEND_NOT_AVAILABLE' } } },
    });
    await user.click(button);

    expect(
      await screen.findByText(/impossible de renvoyer un lien pour cette invitation/i),
    ).toBeInTheDocument();
  });

  it('RATE_LIMITED → message "Un lien a déjà été envoyé récemment"', async () => {
    const user = userEvent.setup();
    const button = await renderAndGetResendButton();

    mockedApiPost.mockRejectedValueOnce({
      response: { data: { error: { code: 'RATE_LIMITED' } } },
    });
    await user.click(button);

    expect(
      await screen.findByText(/un lien a déjà été envoyé récemment/i),
    ).toBeInTheDocument();
  });

  it('erreur sans code connu → message générique, pas de retour silencieux au bouton initial', async () => {
    const user = userEvent.setup();
    const button = await renderAndGetResendButton();

    mockedApiPost.mockRejectedValueOnce({
      response: { data: { error: { code: 'UNEXPECTED_CODE' } } },
    });
    await user.click(button);

    expect(
      await screen.findByText(/une erreur est survenue/i),
    ).toBeInTheDocument();
    // Le composant doit afficher un feedback d'erreur, pas silencieusement
    // retomber sur le bouton « Demander un nouveau lien ».
    expect(
      screen.queryByRole('button', { name: /demander un nouveau lien/i }),
    ).not.toBeInTheDocument();
  });
});

describe("renvoi d'invitation expirée — lien admin (isAdmin)", () => {
  /** Erreur TOKEN_EXPIRED avec isAdmin:true et canResend:true */
  const tokenExpiredAdminError = {
    response: {
      data: {
        error: {
          code: 'TOKEN_EXPIRED',
          context: { canResend: true, isAdmin: true },
        },
      },
    },
  };

  /** Erreur TOKEN_EXPIRED sans isAdmin (utilisateur standard) */
  const tokenExpiredUserError = {
    response: {
      data: {
        error: {
          code: 'TOKEN_EXPIRED',
          context: { canResend: true, isAdmin: false },
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) token expiré admin → bouton "Demander un nouveau lien" + helper "envoyé à votre adresse email" visibles', async () => {
    mockedApiPost.mockRejectedValueOnce(tokenExpiredAdminError);
    renderLogin('/login?token=expired-admin-token');

    const button = await screen.findByRole('button', { name: /demander un nouveau lien/i });
    expect(button).toBeInTheDocument();
    expect(
      await screen.findByText(/envoyé à votre adresse email/i),
    ).toBeInTheDocument();
  });

  it('(b) clic → POST /auth/resend-invitation, succès → message "Un nouveau lien vous a été envoyé par email"', async () => {
    const user = userEvent.setup();
    mockedApiPost.mockRejectedValueOnce(tokenExpiredAdminError);
    renderLogin('/login?token=expired-admin-token');

    const button = await screen.findByRole('button', { name: /demander un nouveau lien/i });
    mockedApiPost.mockResolvedValueOnce({ data: { message: 'ok' } });
    await user.click(button);

    expect(
      await screen.findByText(/un nouveau lien vous a été envoyé par email/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /demander un nouveau lien/i }),
    ).not.toBeInTheDocument();
  });

  it('(c) erreur 503 EMAIL_SERVICE_UNAVAILABLE + isAdmin → lien /emergency-login visible', async () => {
    const user = userEvent.setup();
    mockedApiPost.mockRejectedValueOnce(tokenExpiredAdminError);
    renderLogin('/login?token=expired-admin-token');

    const button = await screen.findByRole('button', { name: /demander un nouveau lien/i });
    mockedApiPost.mockRejectedValueOnce({
      response: { data: { error: { code: 'EMAIL_SERVICE_UNAVAILABLE' } } },
    });
    await user.click(button);

    const emergencyLink = await screen.findByRole('link', { name: /code de secours/i });
    expect(emergencyLink).toBeInTheDocument();
    expect(emergencyLink).toHaveAttribute('href', '/emergency-login');
  });

  it('(d) erreur 503 SANS isAdmin → PAS de lien /emergency-login', async () => {
    const user = userEvent.setup();
    mockedApiPost.mockRejectedValueOnce(tokenExpiredUserError);
    renderLogin('/login?token=expired-user-token');

    const button = await screen.findByRole('button', { name: /demander un nouveau lien/i });
    mockedApiPost.mockRejectedValueOnce({
      response: { data: { error: { code: 'EMAIL_SERVICE_UNAVAILABLE' } } },
    });
    await user.click(button);

    await screen.findByText(/temporairement indisponible/i);
    expect(
      screen.queryByRole('link', { name: /code de secours/i }),
    ).not.toBeInTheDocument();
  });
});

describe('Login — préservation du lien profond via next', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('transmet next au POST /auth/login lors de la soumission du formulaire email', async () => {
    const user = userEvent.setup();
    mockedApiPost.mockResolvedValue({ data: { message: 'ok' } });
    renderLogin('/login?next=/me/events/abc');

    await user.type(screen.getByLabelText(/adresse email/i), 'membre@timepick.fr');
    await user.click(screen.getByRole('button', { name: /recevoir mon lien de connexion/i }));

    expect(mockedApiPost).toHaveBeenCalledWith('/auth/login', {
      email: 'membre@timepick.fr',
      next: '/me/events/abc',
    });
  });

  it('sans next → POST /auth/login sans le champ next', async () => {
    const user = userEvent.setup();
    mockedApiPost.mockResolvedValue({ data: { message: 'ok' } });
    renderLogin('/login');

    await user.type(screen.getByLabelText(/adresse email/i), 'membre@timepick.fr');
    await user.click(screen.getByRole('button', { name: /recevoir mon lien de connexion/i }));

    expect(mockedApiPost).toHaveBeenCalledWith('/auth/login', {
      email: 'membre@timepick.fr',
    });
  });

  it('déjà authentifié avec next sûr → navigue vers la destination membre', async () => {
    localStorage.setItem('auth_token', 'header.payload.signature');
    localStorage.setItem(
      'auth_user',
      JSON.stringify({
        id: 'u1',
        email: 'user@timepick.fr',
        firstName: 'U',
        lastName: 'S',
        role: 'user',
        hasMemberAccess: true,
      }),
    );
    renderLogin('/login?next=/me/events/abc');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/me/events/abc', { replace: true });
    });
  });
});

describe('lien de setup déjà utilisé — SETUP_ALREADY_DONE', () => {
  /** Erreur renvoyée par /auth/verify pour un token bootstrap déjà consommé. */
  const setupAlreadyDoneError = {
    response: {
      data: {
        error: {
          code: 'SETUP_ALREADY_DONE',
          message: 'La configuration est déjà terminée. Connectez-vous via la page de connexion.',
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetPublicHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { smtp: 'ok' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche le titre "Configuration déjà effectuée" et le bouton "Recevoir un lien de connexion"', async () => {
    mockedApiPost.mockRejectedValueOnce(setupAlreadyDoneError);
    renderLogin('/login?token=boot.tok.en');

    expect(
      await screen.findByText(/configuration déjà effectuée/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /recevoir un lien de connexion/i }),
    ).toBeInTheDocument();
  });

  it('clic sur le bouton → POST /auth/resend-invitation avec le token bootstrap → bannière succès', async () => {
    const user = userEvent.setup();

    // 1er appel (api.post) : /auth/verify → SETUP_ALREADY_DONE
    mockedApiPost.mockRejectedValueOnce(setupAlreadyDoneError);
    renderLogin('/login?token=boot.tok.en');

    const button = await screen.findByRole('button', { name: /recevoir un lien de connexion/i });

    // 2e appel (api.post) : /auth/resend-invitation → succès
    mockedApiPost.mockResolvedValueOnce({ data: { message: 'ok' } });
    await user.click(button);

    expect(mockedApiPost).toHaveBeenCalledWith('/auth/resend-invitation', { token: 'boot.tok.en' });
    expect(
      await screen.findByText(/un nouveau lien vous a été envoyé par email/i),
    ).toBeInTheDocument();
  });
});
