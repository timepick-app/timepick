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

// Mock du service clé de chiffrement — AVANT tout import du composant.
vi.mock('../../services/encryption-key.service', () => ({
  getSetupEncryptionKey: vi.fn(),
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
import { getSetupEncryptionKey } from '../../services/encryption-key.service';

const mockedGetSetupSmtp = vi.mocked(getSetupSmtp);
const mockedSaveSetupSmtp = vi.mocked(saveSetupSmtp);
const mockedTestSetupSmtp = vi.mocked(testSetupSmtp);
const mockedCreateFirstAdmin = vi.mocked(createFirstAdmin);
const mockedGetSetupEncryptionKey = vi.mocked(getSetupEncryptionKey);

const emptySmtp: SmtpSettings = {
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: '',
  smtpFromEmail: '',
  emailProvider: 'smtp',
  emailApiKey: '',
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

describe('SetupWizard — source env (flux à 2 étapes, inchangé)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSetupSmtp.mockResolvedValue(emptySmtp);
    mockedSaveSetupSmtp.mockResolvedValue(undefined);
    mockedCreateFirstAdmin.mockResolvedValue(undefined);
    mockedGetSetupEncryptionKey.mockResolvedValue({
      configured: true,
      source: 'env',
      fingerprint: 'abc123def456',
      emailDeliverable: false,
      emailTransportSource: null,
    });
  });

  // ── Étape 1 : SMTP ──────────────────────────────────────────────────────────

  it('affiche l\'étape SMTP au montage (pas d\'étape clé) et appelle getSetupSmtp', async () => {
    renderWizard();
    await waitFor(() => {
      expect(screen.getByTestId('smtp-host')).toBeInTheDocument();
    });
    // getSetupSmtp appelé au montage du SetupSmtpStep
    await waitFor(() => {
      expect(mockedGetSetupSmtp).toHaveBeenCalledTimes(1);
    });
    // Pas d'étape "Clé de chiffrement" quand source==='env'
    expect(screen.queryByText('Clé de chiffrement')).not.toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
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
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
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
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
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

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
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

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
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

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Limite de requêtes atteinte');
    });
  });

  it('"Continuer" bloqué (aucun appel réseau) quand le host est renseigné sans email expéditeur', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    // smtp-from-email volontairement laissé vide (emptySmtp)
    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(screen.getByText(/email de l'expéditeur est requis/i)).toBeInTheDocument();
    });
    expect(mockedSaveSetupSmtp).not.toHaveBeenCalled();
  });
});

describe('SetupWizard — source file (étape clé de chiffrement conditionnelle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSetupSmtp.mockResolvedValue(emptySmtp);
    mockedSaveSetupSmtp.mockResolvedValue(undefined);
    mockedCreateFirstAdmin.mockResolvedValue(undefined);
    mockedGetSetupEncryptionKey.mockResolvedValue({
      configured: true,
      source: 'file',
      fingerprint: 'fedcba987654',
      emailDeliverable: false,
      emailTransportSource: null,
    });
  });

  it("affiche l'étape clé en premier avec l'empreinte, sans jamais afficher une clé hex 64 caractères", async () => {
    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('fedcba987654')).toBeInTheDocument();
    });
    // Pas de champ SMTP tant que l'étape clé n'est pas passée
    expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument();

    const hex64 = /\b[0-9a-f]{64}\b/i;
    expect(document.body.textContent ?? '').not.toMatch(hex64);
  });

  it('cliquer "Continuer" sur l\'étape clé avance vers SMTP', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => {
      expect(screen.getByTestId('encryption-key-continue-btn')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('encryption-key-continue-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('smtp-host')).toBeInTheDocument();
    });
  });
});

describe('SetupWizard — SMTP sautable (emailDeliverable=true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSetupSmtp.mockResolvedValue(emptySmtp);
    mockedSaveSetupSmtp.mockResolvedValue(undefined);
    mockedCreateFirstAdmin.mockResolvedValue(undefined);
    mockedGetSetupEncryptionKey.mockResolvedValue({
      configured: true,
      source: 'env',
      fingerprint: 'abc123def456',
      emailDeliverable: true,
      emailTransportSource: 'fallback',
    });
  });

  it('affiche quand même l\'étape SMTP (A1 : jamais masquée) avec un message source précis et "Passer cette étape"', async () => {
    renderWizard();
    await waitFor(() => {
      expect(screen.getByTestId('smtp-host')).toBeInTheDocument();
    });
    // Message précis selon la source détectée (ici fallback : intercepteur local).
    expect(screen.getByText(/127\.0\.0\.1:1025/)).toBeInTheDocument();
    // Anti-régression UX : UNE seule boîte info (la description du stepper) —
    // pas de second bandeau redondant empilé dans le formulaire.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByTestId('smtp-continue-btn')).toHaveTextContent('Passer cette étape');
  });

  it('"Passer cette étape" avance vers admin sans appeler saveSetupSmtp (rien à sauvegarder)', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });
    expect(mockedSaveSetupSmtp).not.toHaveBeenCalled();
  });

  it('renseigner un hôte redemande une config valide : "Continuer" sauvegarde normalement', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    // Dès qu'un hôte est saisi, le bouton redevient "Continuer" (plus "Passer").
    expect(screen.getByTestId('smtp-continue-btn')).toHaveTextContent('Continuer');

    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(mockedSaveSetupSmtp).toHaveBeenCalledWith(
        expect.objectContaining({ smtpHost: 'smtp.exemple.com' }),
      );
    });
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
  });
});

describe('SetupWizard — échec du chargement du statut de la clé', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSetupSmtp.mockResolvedValue(emptySmtp);
  });

  it('affiche un message d\'erreur et un bouton "Réessayer" quand getSetupEncryptionKey rejette', async () => {
    mockedGetSetupEncryptionKey.mockRejectedValue(new Error('network error'));
    renderWizard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument();
  });
});
