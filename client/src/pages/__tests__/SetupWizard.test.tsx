import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SmtpSettings } from '../../services/settings.service';

// Mock du service setup — AVANT tout import du composant.
vi.mock('../../services/setup.service', () => ({
  getSetupSmtp: vi.fn(),
  saveSetupSmtp: vi.fn(),
  testSetupSmtp: vi.fn(),
  createFirstAdmin: vi.fn(),
}));

// Mock sonner pour capturer les toasts d'erreur (vi.hoisted évite le problème de TDZ).
const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mockToastError, success: vi.fn() } }));

// Capture navigate pour vérifier qu'il n'est JAMAIS appelé après create-admin.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { SetupWizard } from '../SetupWizard';
import {
  getSetupSmtp,
  saveSetupSmtp,
  testSetupSmtp,
  createFirstAdmin,
} from '../../services/setup.service';

const mockedGetSetupSmtp = vi.mocked(getSetupSmtp);
const mockedSaveSetupSmtp = vi.mocked(saveSetupSmtp);
const mockedTestSetupSmtp = vi.mocked(testSetupSmtp);
const mockedCreateFirstAdmin = vi.mocked(createFirstAdmin);

const emptySmtp: SmtpSettings = {
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: '',
  smtpFromEmail: '',
};

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderWizard = () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(['setup-status'], { needsSetup: true });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SetupWizard />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
};

describe('SetupWizard — multi-étapes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSetupSmtp.mockResolvedValue(emptySmtp);
    mockedSaveSetupSmtp.mockResolvedValue(undefined);
    mockedCreateFirstAdmin.mockResolvedValue(undefined);
  });

  // ── Étape 1 : SMTP ──────────────────────────────────────────────────────────

  it('affiche l\'étape SMTP au montage et appelle getSetupSmtp', async () => {
    renderWizard();
    // L'étape SMTP doit être visible
    expect(screen.getByTestId('smtp-host')).toBeInTheDocument();
    // getSetupSmtp appelé au montage du SetupSmtpStep
    await waitFor(() => {
      expect(mockedGetSetupSmtp).toHaveBeenCalledTimes(1);
    });
    // L'étape admin n'est pas encore visible
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('pré-remplit les champs si getSetupSmtp retourne des données', async () => {
    mockedGetSetupSmtp.mockResolvedValue({
      ...emptySmtp,
      smtpHost: 'smtp.exemple.com',
      smtpPort: '465',
      smtpFromEmail: 'noreply@exemple.com',
    });
    renderWizard();
    await waitFor(() => {
      expect((screen.getByTestId('smtp-host') as HTMLInputElement).value).toBe('smtp.exemple.com');
    });
    expect((screen.getByTestId('smtp-port') as HTMLInputElement).value).toBe('465');
  });

  it('"Continuer" appelle saveSetupSmtp puis passe à l\'étape admin', async () => {
    const user = userEvent.setup();
    renderWizard();

    // Remplir le champ requis (host)
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(mockedSaveSetupSmtp).toHaveBeenCalledWith(
        expect.objectContaining({ smtpHost: 'smtp.exemple.com' }),
      );
    });

    // L'étape admin est maintenant visible
    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });
    // L'étape SMTP n'est plus visible
    expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument();
  });

  // ── Étape 2 : admin ─────────────────────────────────────────────────────────

  it('soumission admin appelle createFirstAdmin et affiche l\'écran "envoyé"', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWizard();

    // Passer à l'étape admin via "Continuer" SMTP
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.click(screen.getByTestId('smtp-continue-btn'));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    // Remplir et soumettre le formulaire admin
    await user.type(screen.getByLabelText('Email'), 'admin@exemple.com');
    await user.click(screen.getByRole('button', { name: 'Devenir administrateur' }));

    await waitFor(() => {
      expect(mockedCreateFirstAdmin).toHaveBeenCalledWith('admin@exemple.com');
    });

    // Écran de confirmation visible
    await waitFor(() => {
      expect(screen.getByText(/lien d'activation a été envoyé/i)).toBeInTheDocument();
    });
    expect(screen.getByText('admin@exemple.com')).toBeInTheDocument();

    // AUCUN navigate('/login')
    expect(mockNavigate).not.toHaveBeenCalled();

    // needsSetup reste true (on ne met pas à jour le cache)
    expect(queryClient.getQueryData(['setup-status'])).toEqual({ needsSetup: true });
  });

  it('"Renvoyer / changer d\'email" revient à l\'étape admin depuis l\'écran sent', async () => {
    const user = userEvent.setup();
    renderWizard();

    // Passer à l'étape admin
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.click(screen.getByTestId('smtp-continue-btn'));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    // Soumettre
    await user.type(screen.getByLabelText('Email'), 'admin@exemple.com');
    await user.click(screen.getByRole('button', { name: 'Devenir administrateur' }));
    await waitFor(() => expect(screen.getByText(/lien d'activation a été envoyé/i)).toBeInTheDocument());

    // Cliquer "Renvoyer"
    await user.click(screen.getByRole('button', { name: /renvoyer/i }));

    // Retour à l'étape admin
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  // ── Test SMTP ────────────────────────────────────────────────────────────────

  it('"Tester" appelle testSetupSmtp avec le recipient', async () => {
    const user = userEvent.setup();
    mockedTestSetupSmtp.mockResolvedValue({ success: true, message: 'Email envoyé avec succès' });
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    // Remplir un recipient valide
    await user.clear(screen.getByTestId('smtp-recipient'));
    await user.type(screen.getByTestId('smtp-recipient'), 'test@exemple.com');

    await user.click(screen.getByTestId('smtp-test-btn'));

    await waitFor(() => {
      expect(mockedTestSetupSmtp).toHaveBeenCalledWith(
        expect.objectContaining({
          smtpHost: 'smtp.exemple.com',
          recipient: 'test@exemple.com',
        }),
      );
    });
  });

  // ── Remontée des erreurs serveur (Finding B) ─────────────────────────────

  it('handleTest affiche le message serveur quand testSetupSmtp rejette', async () => {
    const user = userEvent.setup();
    const axiosError = {
      response: { data: { error: { message: 'Saisissez le vrai mot de passe' } } },
    };
    mockedTestSetupSmtp.mockRejectedValue(axiosError);
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.clear(screen.getByTestId('smtp-recipient'));
    await user.type(screen.getByTestId('smtp-recipient'), 'test@exemple.com');
    await user.click(screen.getByTestId('smtp-test-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('smtp-test-result')).toHaveTextContent('Saisissez le vrai mot de passe');
    });
  });

  it('handleContinue affiche le message serveur quand saveSetupSmtp rejette', async () => {
    const user = userEvent.setup();
    const axiosError = {
      response: { data: { error: { message: 'Limite de requêtes atteinte' } } },
    };
    mockedSaveSetupSmtp.mockRejectedValue(axiosError);
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Limite de requêtes atteinte');
    });
  });
});
