import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDomModule from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SmtpSettings } from '../../services/settings.service';
import type { OrganizationSettings } from '../../services/organization.service';
import type { SetupEncryptionKeyStatus } from '../../services/encryption-key.service';

// Tiptap/ProseMirror est inutilisable sous jsdom — cf. @/test/mockRichTextEditor.
vi.mock('@/components/ui/rich-text-editor', () => import('@/test/mockRichTextEditor'));

// Mock du service setup — AVANT tout import du composant.
vi.mock('../../services/setup.service', () => ({
  getSetupSmtp: vi.fn(),
  saveSetupSmtp: vi.fn(),
  testSetupSmtp: vi.fn(),
  clearSetupSmtp: vi.fn(),
  createFirstAdmin: vi.fn(),
  getSetupOrganization: vi.fn(),
  saveSetupOrganization: vi.fn(),
  uploadSetupOrganizationLogo: vi.fn(),
  deleteSetupOrganizationLogo: vi.fn(),
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
  const actual = await vi.importActual<typeof ReactRouterDomModule>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { SetupWizard } from '../SetupWizard';
import {
  getSetupSmtp,
  saveSetupSmtp,
  testSetupSmtp,
  clearSetupSmtp,
  createFirstAdmin,
  getSetupOrganization,
  saveSetupOrganization,
  uploadSetupOrganizationLogo,
  deleteSetupOrganizationLogo,
} from '../../services/setup.service';
import { getSetupEncryptionKey } from '../../services/encryption-key.service';

const mockedGetSetupSmtp = vi.mocked(getSetupSmtp);
const mockedSaveSetupSmtp = vi.mocked(saveSetupSmtp);
const mockedTestSetupSmtp = vi.mocked(testSetupSmtp);
const mockedClearSetupSmtp = vi.mocked(clearSetupSmtp);
const mockedCreateFirstAdmin = vi.mocked(createFirstAdmin);
const mockedGetSetupEncryptionKey = vi.mocked(getSetupEncryptionKey);
const mockedGetSetupOrganization = vi.mocked(getSetupOrganization);
const mockedSaveSetupOrganization = vi.mocked(saveSetupOrganization);
const mockedUploadSetupOrganizationLogo = vi.mocked(uploadSetupOrganizationLogo);
const mockedDeleteSetupOrganizationLogo = vi.mocked(deleteSetupOrganizationLogo);

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

const emptyOrganization: OrganizationSettings = {
  name: '',
  logo: '',
  description: '',
  homepageFacade: true,
};

/** Statut de clé nominal : source `env`, aucun transport e-mail détecté. */
const defaultKeyStatus: SetupEncryptionKeyStatus = {
  configured: true,
  source: 'env',
  fingerprint: 'abc123def456',
  emailDeliverable: false,
  emailTransportSource: null,
};

/**
 * Amorce les dix mocks de service dans leur état nominal, `vi.clearAllMocks()`
 * compris. **Un seul endroit** pour ajouter ou changer une valeur par défaut :
 * les cinq `beforeEach` recopiés qu'il remplace divergeaient dès qu'on n'en
 * modifiait qu'un. Chaque suite ne déclare plus que son écart.
 *
 * Les tests restent libres de réamorcer un mock : un `mockResolvedValueOnce` ou
 * un `mockRejectedValue` posé dans le test l'emporte sur l'amorçage.
 */
const primeSetupMocks = (keyStatus: SetupEncryptionKeyStatus = defaultKeyStatus) => {
  vi.clearAllMocks();
  mockedGetSetupSmtp.mockResolvedValue(emptySmtp);
  mockedSaveSetupSmtp.mockResolvedValue(undefined);
  mockedTestSetupSmtp.mockResolvedValue({ success: true, message: 'Connexion réussie' });
  mockedClearSetupSmtp.mockResolvedValue(undefined);
  mockedCreateFirstAdmin.mockResolvedValue(undefined);
  mockedGetSetupOrganization.mockResolvedValue(emptyOrganization);
  mockedSaveSetupOrganization.mockResolvedValue(undefined);
  mockedUploadSetupOrganizationLogo.mockResolvedValue({ logo: '' });
  mockedDeleteSetupOrganizationLogo.mockResolvedValue(undefined);
  mockedGetSetupEncryptionKey.mockResolvedValue(keyStatus);
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

// L'étape organisation (facultative, cf. SetupOrganizationStep) précède
// désormais l'étape SMTP dans tous les flux. Il n'existe plus qu'un seul
// bouton d'avancement : ce raccourci clique "Continuer" sur un formulaire
// vide, ce qui n'écrit rien puisque l'écran est déjà identique à l'état
// enregistré vide (cf. le test dédié qui l'assert explicitement plus bas).
// Le bouton reste désactivé tant que l'hydratation (getSetupOrganization)
// n'a pas abouti : attendre qu'il soit activé avant de cliquer, sinon la
// suite devient instable.
const skipOrganizationStep = async (user: UserEvent) => {
  await waitFor(() => expect(screen.getByTestId('org-continue-btn')).toBeEnabled());
  await user.click(screen.getByTestId('org-continue-btn'));
  await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
};

// Depuis le correctif du blocage (plan 2026-07-28, tableau §3 ligne 4),
// « Continuer » exige un test de connexion réussi sur les valeurs saisies :
// plus aucune avance après un échec explicite. Les tests dont l'étape SMTP
// n'est qu'un passage obligé empruntent ce raccourci.
const passSmtpStep = async (user: UserEvent) => {
  await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
  await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
  await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
  await user.click(screen.getByTestId('smtp-test-btn'));
  await waitFor(() => expect(screen.getByTestId('smtp-continue-btn')).toBeEnabled());
  await user.click(screen.getByTestId('smtp-continue-btn'));
};

describe('SetupWizard — source env (flux à 3 étapes : organisation, smtp, admin)', () => {
  beforeEach(() => primeSetupMocks());

  // ── Étape 0 : organisation ───────────────────────────────────────────────

  it('affiche l\'étape organisation au montage (pas d\'étape clé) et appelle getSetupOrganization', async () => {
    renderWizard();
    await waitFor(() => {
      expect(screen.getByTestId('org-name-input')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockedGetSetupOrganization).toHaveBeenCalledTimes(1);
    });
    // Pas d'étape "Clé de chiffrement" quand source==='env'
    expect(screen.queryByText('Clé de chiffrement')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument();
  });

  it('"Continuer" (organisation) sur formulaire vide avance vers SMTP sans appeler saveSetupOrganization', async () => {
    const user = userEvent.setup();
    renderWizard();

    await skipOrganizationStep(user);

    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockedGetSetupSmtp).toHaveBeenCalledTimes(1);
    });
  });

  it('"Continuer" (organisation) avec un nom rempli appelle saveSetupOrganization puis avance vers SMTP', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeEnabled());
    await user.type(screen.getByTestId('org-name-input'), 'Club de padel');
    await user.click(screen.getByTestId('org-continue-btn'));

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: 'Club de padel',
        description: '',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('smtp-host')).toBeInTheDocument();
    });
  });

  // ── Étape 1 : SMTP ──────────────────────────────────────────────────────────

  it('pré-remplit les champs si getSetupSmtp retourne des données', async () => {
    const user = userEvent.setup();
    mockedGetSetupSmtp.mockResolvedValue({
      ...emptySmtp,
      smtpHost: 'smtp.exemple.com',
      smtpPort: '465',
      smtpFromEmail: 'noreply@exemple.com',
    });
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => {
      expect((screen.getByTestId('smtp-host') as HTMLInputElement).value).toBe('smtp.exemple.com');
    });
    expect((screen.getByTestId('smtp-port') as HTMLInputElement).value).toBe('465');
  });

  it('"Continuer" appelle saveSetupSmtp puis passe à l\'étape admin', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await passSmtpStep(user);

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
    await skipOrganizationStep(user);

    // Passer à l'étape admin (le test de connexion conditionne « Continuer »)
    await passSmtpStep(user);
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    // Remplir et soumettre le formulaire admin
    await user.type(screen.getByLabelText('Prénom'), 'Camille');
    await user.type(screen.getByLabelText('Nom (optionnel)'), 'Martin');
    await user.type(screen.getByLabelText('Email'), 'admin@exemple.com');
    await user.click(screen.getByRole('button', { name: 'Devenir administrateur' }));

    await waitFor(() => {
      expect(mockedCreateFirstAdmin).toHaveBeenCalledWith('admin@exemple.com', 'Camille', 'Martin');
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
    await skipOrganizationStep(user);

    // Passer à l'étape admin
    await passSmtpStep(user);
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    // Soumettre
    await user.type(screen.getByLabelText('Prénom'), 'Camille');
    await user.type(screen.getByLabelText('Email'), 'admin@exemple.com');
    await user.click(screen.getByRole('button', { name: 'Devenir administrateur' }));
    await waitFor(() => expect(screen.getByText(/lien d'activation a été envoyé/i)).toBeInTheDocument());

    // Cliquer "Renvoyer"
    await user.click(screen.getByRole('button', { name: /renvoyer/i }));

    // Retour à l'étape admin
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('sans nom de famille, createFirstAdmin est appelé avec lastName undefined', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await passSmtpStep(user);
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Prénom'), 'Camille');
    await user.type(screen.getByLabelText('Email'), 'admin@exemple.com');
    await user.click(screen.getByRole('button', { name: 'Devenir administrateur' }));

    await waitFor(() => {
      expect(mockedCreateFirstAdmin).toHaveBeenCalledWith('admin@exemple.com', 'Camille', undefined);
    });
  });

  // Le formulaire est `noValidate` (SetupWizard.tsx) : la validation JS est
  // seule en piste. Depuis l'alignement sur la convention de l'application, le
  // bouton est DÉSACTIVÉ tant que le formulaire est invalide — il n'y a donc
  // plus de clic à intercepter, et le motif doit rester lisible sans clic.
  it('prénom en blancs : bouton désactivé, motif rattaché au champ, aucun appel réseau', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);
    await passSmtpStep(user);
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    // Trois espaces : `trim()` les réduit à vide. La garde ne doit pas se
    // laisser satisfaire par l'attribut `required` du navigateur (piège de
    // discrimination relevé dans le plan).
    await user.type(screen.getByLabelText('Prénom'), '   ');
    await user.type(screen.getByLabelText('Email'), 'admin@exemple.com');

    // Champ touché ⇒ le motif est rendu ET rattaché au champ.
    await waitFor(() =>
      expect(screen.getByLabelText('Prénom')).toHaveAccessibleDescription('Le prénom est requis'),
    );
    expect(screen.getByRole('button', { name: 'Devenir administrateur' })).toBeDisabled();
    expect(mockedCreateFirstAdmin).not.toHaveBeenCalled();
  });

  it('prénom vide et jamais touché : motif porté par la ligne du bouton, bouton désactivé', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);
    await passSmtpStep(user);
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Email'), 'admin@exemple.com');

    // On ne gronde pas un champ vierge : pas de rouge sous le prénom. Mais le
    // motif du blocage reste affiché ET rattaché au bouton — c'est ce qui rend
    // le grisage honnête plutôt que muet.
    await waitFor(() =>
      expect(screen.getByTestId('admin-gate-reason')).toHaveTextContent('Le prénom est requis'),
    );
    const submit = screen.getByRole('button', { name: 'Devenir administrateur' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription('Le prénom est requis');
    expect(screen.getByLabelText('Prénom')).not.toHaveAccessibleDescription();
    expect(mockedCreateFirstAdmin).not.toHaveBeenCalled();
  });

  it('email vide : motif porté par la ligne du bouton, bouton désactivé', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);
    await passSmtpStep(user);
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    // Prénom rempli pour que la garde e-mail soit bien celle qui bloque.
    await user.type(screen.getByLabelText('Prénom'), 'Camille');

    await waitFor(() =>
      expect(screen.getByTestId('admin-gate-reason')).toHaveTextContent("L'email est requis"),
    );
    expect(screen.getByRole('button', { name: 'Devenir administrateur' })).toBeDisabled();
    expect(mockedCreateFirstAdmin).not.toHaveBeenCalled();
  });

  // ── Test SMTP ────────────────────────────────────────────────────────────────

  it('"Tester" appelle testSetupSmtp avec le recipient', async () => {
    const user = userEvent.setup();
    mockedTestSetupSmtp.mockResolvedValue({ success: true, message: 'Email envoyé avec succès' });
    renderWizard();
    await skipOrganizationStep(user);

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
    await skipOrganizationStep(user);

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
    await skipOrganizationStep(user);

    await passSmtpStep(user);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Limite de requêtes atteinte');
    });
  });

  it('hôte renseigné sans email expéditeur : "Continuer" désactivé, motif visible, aucun appel réseau', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    // smtp-from-email volontairement laissé vide (emptySmtp)

    // Le champ n'a pas été touché : pas de rouge sous lui (R12a), mais le motif
    // exact reste lisible sur la ligne du bouton et rattaché à celui-ci (R12b).
    await waitFor(() =>
      expect(screen.getByTestId('smtp-continue-reason')).toHaveTextContent(
        /email de l'expéditeur est requis/i,
      ),
    );
    const continueBtn = screen.getByTestId('smtp-continue-btn');
    expect(continueBtn).toBeDisabled();
    expect(continueBtn).toHaveAccessibleDescription(/email de l'expéditeur est requis/i);
    // C'est cette assertion qui défend le filtrage par `touched` : sans lui, le
    // motif apparaîtrait aussi sous un champ que l'utilisateur n'a jamais ouvert.
    expect(screen.getByTestId('smtp-from-email')).not.toHaveAccessibleDescription();
    expect(mockedSaveSetupSmtp).not.toHaveBeenCalled();
  });

  it('étape SMTP : hôte et port fautifs sont signalés ensemble et rattachés à leur champ', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    // Les deux champs sont touchés puis laissés fautifs : les motifs sont
    // calculés et affichés ENSEMBLE, pas l'un après l'autre.
    await waitFor(() => expect(screen.getByTestId('smtp-port')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'x');
    await user.clear(screen.getByTestId('smtp-host'));
    await user.clear(screen.getByTestId('smtp-port'));

    await waitFor(() => {
      expect(screen.getByTestId('smtp-host')).toHaveAccessibleDescription(/hôte smtp est requis/i);
    });
    expect(screen.getByTestId('smtp-port')).toHaveAccessibleDescription(/port doit être entre 1 et 65535/i);
    expect(screen.getByTestId('smtp-continue-btn')).toBeDisabled();
    expect(mockedSaveSetupSmtp).not.toHaveBeenCalled();
  });
});

describe('SetupWizard — source file (étape clé de chiffrement conditionnelle)', () => {
  beforeEach(() =>
    primeSetupMocks({ ...defaultKeyStatus, source: 'file', fingerprint: 'fedcba987654' }),
  );

  it("affiche l'étape clé en premier avec l'empreinte, sans jamais afficher une clé hex 64 caractères", async () => {
    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('fedcba987654')).toBeInTheDocument();
    });
    // Pas de champ organisation ni SMTP tant que l'étape clé n'est pas passée
    expect(screen.queryByTestId('org-name-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument();

    const hex64 = /\b[0-9a-f]{64}\b/i;
    expect(document.body.textContent ?? '').not.toMatch(hex64);
  });

  it('cliquer "Continuer" sur l\'étape clé avance vers organisation, puis "Continuer" sur formulaire vide avance vers SMTP', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => {
      expect(screen.getByTestId('encryption-key-continue-btn')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('encryption-key-continue-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('org-name-input')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument();

    await skipOrganizationStep(user);

    await waitFor(() => {
      expect(screen.getByTestId('smtp-host')).toBeInTheDocument();
    });
  });
});

// Le brouillon organisation vit désormais dans SetupWizard (plan
// 2026-07-29) : ces garde-fous ne pouvaient pas exister avant, puisque
// l'état vivait dans l'étape et mourrait à chaque démontage. Chacun
// reproduit un défaut réellement observé le 2026-07-29 (plan §1) et doit
// échouer si la régression revient.
describe('SetupWizard — brouillon organisation persistant entre étapes (plan 2026-07-29)', () => {
  beforeEach(() => primeSetupMocks());

  it('après une sauvegarde réussie, revenir sur l\'étape organisation affiche les valeurs enregistrées, pas les précédentes (garde-fou D4)', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeEnabled());
    await user.type(screen.getByTestId('org-name-input'), 'Club de padel');
    await user.click(screen.getByTestId('org-continue-btn'));

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: 'Club de padel',
        description: '',
      });
    });
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());

    await user.click(screen.getByTestId('smtp-back-btn'));

    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeInTheDocument());
    expect((screen.getByTestId('org-name-input') as HTMLInputElement).value).toBe('Club de padel');
  });

  it('revenir puis "Continuer" sans rien changer ne rappelle pas saveSetupOrganization : une sauvegarde réussie n\'est plus annulée par un aller-retour (garde-fou D5, défaut central)', async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeEnabled());
    await user.type(screen.getByTestId('org-name-input'), 'Club de padel');
    await user.click(screen.getByTestId('org-continue-btn'));

    await waitFor(() => expect(mockedSaveSetupOrganization).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());

    await user.click(screen.getByTestId('smtp-back-btn'));
    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeInTheDocument());

    await user.click(screen.getByTestId('org-continue-btn'));

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    expect(mockedSaveSetupOrganization).toHaveBeenCalledTimes(1);
  });

  it('une saisie non enregistrée survit à un aller-retour vers l\'étape clé de chiffrement, sans écriture (angle mort n°1)', async () => {
    const user = userEvent.setup();
    mockedGetSetupEncryptionKey.mockResolvedValue({
      configured: true,
      source: 'file',
      fingerprint: 'fedcba987654',
      emailDeliverable: false,
      emailTransportSource: null,
    });
    renderWizard();

    await waitFor(() =>
      expect(screen.getByTestId('encryption-key-continue-btn')).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId('encryption-key-continue-btn'));

    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeEnabled());
    await user.type(screen.getByTestId('org-name-input'), 'Brouillon jamais enregistré');

    await user.click(screen.getByTestId('org-back-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('encryption-key-continue-btn')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('encryption-key-continue-btn'));
    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeInTheDocument());

    expect((screen.getByTestId('org-name-input') as HTMLInputElement).value).toBe(
      'Brouillon jamais enregistré',
    );
    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled();
  });

  it('un logo téléversé survit à un aller-retour : l\'aperçu montre le logo téléversé, pas celui de la lecture initiale (garde-fou D1)', async () => {
    const user = userEvent.setup();
    mockedGetSetupOrganization.mockResolvedValue({
      ...emptyOrganization,
      logo: 'https://cdn.exemple.com/ancien-logo.png',
    });
    mockedUploadSetupOrganizationLogo.mockResolvedValue({
      logo: 'https://cdn.exemple.com/nouveau-logo.png',
    });
    renderWizard();

    await waitFor(() =>
      expect(screen.getByTestId('org-logo-preview')).toHaveAttribute(
        'src',
        'https://cdn.exemple.com/ancien-logo.png',
      ),
    );

    const file = new File(['fake-image'], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('org-logo-input'), file);

    await waitFor(() =>
      expect(screen.getByTestId('org-logo-preview')).toHaveAttribute(
        'src',
        'https://cdn.exemple.com/nouveau-logo.png',
      ),
    );

    await user.click(screen.getByTestId('org-continue-btn'));
    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());

    await user.click(screen.getByTestId('smtp-back-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('org-logo-preview')).toHaveAttribute(
        'src',
        'https://cdn.exemple.com/nouveau-logo.png',
      ),
    );
  });

  it('un refetch d\'arrière-plan de getSetupOrganization après hydratation n\'écrase pas une saisie en cours (I5)', async () => {
    const user = userEvent.setup();
    mockedGetSetupOrganization
      .mockResolvedValueOnce(emptyOrganization)
      .mockResolvedValue({ ...emptyOrganization, name: 'Valeur serveur tardive' });
    const { queryClient } = renderWizard();

    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeEnabled());
    await user.type(screen.getByTestId('org-name-input'), 'Saisie en cours');

    await queryClient.refetchQueries({ queryKey: ['setup', 'organization'] });

    await waitFor(() =>
      expect(queryClient.getQueryData(['setup', 'organization'])).toEqual({
        ...emptyOrganization,
        name: 'Valeur serveur tardive',
      }),
    );
    expect((screen.getByTestId('org-name-input') as HTMLInputElement).value).toBe(
      'Saisie en cours',
    );
  });

  // ECH-1 (revue 2026-07-29, sévérité Critical) : sur une instance dont
  // needsSetup est redevenu vrai alors que l'identité est déjà en base, un GET
  // en échec laissait la saisie s'ouvrir sur un formulaire VIDE, et « Continuer »
  // faisait un upsert inconditionnel qui écrasait les valeurs réelles.
  it("lecture de l'identité en échec : la saisie est verrouillée et « Continuer » n'écrit rien (ECH-1)", async () => {
    const user = userEvent.setup();
    mockedGetSetupOrganization.mockRejectedValue(new Error('boom'));
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('org-load-error')).toBeInTheDocument());
    expect(screen.getByTestId('org-name-input')).toBeDisabled();

    await user.click(screen.getByTestId('org-continue-btn'));

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeInTheDocument());
    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled();
  });

  // ECH-2 (revue 2026-07-29, sévérité High) : le verrou d'hydratation n'étant
  // posé qu'au SUCCÈS, un échec initial suivi d'une réussite tardive hydratait
  // par-dessus une saisie en cours. Champs verrouillés sur échec ⇒ plus de
  // saisie à écraser, et « Réessayer » hydrate proprement.
  it("« Réessayer » après un échec de lecture hydrate les valeurs serveur et déverrouille la saisie (ECH-2)", async () => {
    const user = userEvent.setup();
    mockedGetSetupOrganization
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ ...emptyOrganization, name: 'Identité déjà en base' });
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('org-load-error')).toBeInTheDocument());

    await user.click(screen.getByTestId('org-load-retry-btn'));

    await waitFor(() =>
      expect((screen.getByTestId('org-name-input') as HTMLInputElement).value).toBe(
        'Identité déjà en base',
      ),
    );
    expect(screen.getByTestId('org-name-input')).toBeEnabled();
    expect(screen.queryByTestId('org-load-error')).not.toBeInTheDocument();
  });
});

describe('SetupWizard — SMTP sautable (emailDeliverable=true)', () => {
  beforeEach(() =>
    primeSetupMocks({ ...defaultKeyStatus, emailDeliverable: true, emailTransportSource: 'fallback' }),
  );

  it('affiche quand même l\'étape SMTP (A1 : jamais masquée) avec un message source précis et "Passer cette étape"', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

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
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });
    expect(mockedSaveSetupSmtp).not.toHaveBeenCalled();
  });

  it('renseigner un hôte redemande une config valide ET testée : "Continuer" sauvegarde normalement', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    // Dès qu'un hôte est saisi, le bouton redevient "Continuer" (plus "Passer")
    // ET redevient bloquant tant que la joignabilité n'est pas prouvée.
    expect(screen.getByTestId('smtp-continue-btn')).toHaveTextContent('Continuer');
    expect(screen.getByTestId('smtp-continue-btn')).toBeDisabled();

    await user.click(screen.getByTestId('smtp-test-btn'));
    await waitFor(() => expect(screen.getByTestId('smtp-continue-btn')).toBeEnabled());
    await user.click(screen.getByTestId('smtp-continue-btn'));

    await waitFor(() => {
      expect(mockedSaveSetupSmtp).toHaveBeenCalledWith(
        expect.objectContaining({ smtpHost: 'smtp.exemple.com' }),
      );
    });
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
  });
});

// Tableau §3 du plan 2026-07-28 : les cinq états de l'étape SMTP, un cas
// chacun, plus l'expiration de la preuve de joignabilité et la navigation
// arrière. Chaque test doit échouer si l'on retire le correctif qu'il défend.
describe('SetupWizard — étape SMTP : blocage sur configuration injoignable et sortie de secours', () => {
  const keyStatus = (emailDeliverable: boolean) => ({
    configured: true,
    source: 'env' as const,
    fingerprint: 'abc123def456',
    emailDeliverable,
    emailTransportSource: emailDeliverable ? ('fallback' as const) : null,
  });

  beforeEach(() => primeSetupMocks(keyStatus(false)));

  // Ligne 1 — champs vides + transport local détecté → autorisé, sans test.
  it('champs vides et transport détecté : "Passer cette étape" actif et sans motif de blocage', async () => {
    const user = userEvent.setup();
    mockedGetSetupEncryptionKey.mockResolvedValue(keyStatus(true));
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    const continueBtn = screen.getByTestId('smtp-continue-btn');
    expect(continueBtn).toHaveTextContent('Passer cette étape');
    expect(continueBtn).toBeEnabled();
    expect(screen.queryByTestId('smtp-continue-reason')).not.toBeInTheDocument();
  });

  // Ligne 2 — champs vides + rien détecté → bloqué (déjà le cas avant le correctif).
  it('champs vides et aucun transport : "Continuer" désactivé, hôte réclamé', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    expect(screen.getByTestId('smtp-continue-btn')).toBeDisabled();
    expect(screen.getByTestId('smtp-continue-reason')).toHaveTextContent(/hôte smtp est requis/i);
    expect(mockedSaveSetupSmtp).not.toHaveBeenCalled();
  });

  // Ligne 4 — LE correctif : syntaxiquement valide, mais injoignable.
  it('test de connexion échoué : "Continuer" reste bloqué et rien n\'est enregistré', async () => {
    const user = userEvent.setup();
    mockedTestSetupSmtp.mockResolvedValue({
      success: false,
      message: 'Connexion refusée : rien n\'écoute sur ce port (ECONNREFUSED)',
    });
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), '127.0.0.1');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    await user.click(screen.getByTestId('smtp-test-btn'));

    // L'erreur du serveur est affichée…
    await waitFor(() =>
      expect(screen.getByTestId('smtp-test-result')).toHaveTextContent(/ECONNREFUSED/),
    );
    // …et « Continuer » refuse d'avancer. C'est exactement ce que l'ancien
    // comportement laissait passer en silence (plan §1) : la configuration
    // fautive partait en base et l'échec ne tombait qu'à l'étape suivante.
    const continueBtn = screen.getByTestId('smtp-continue-btn');
    expect(continueBtn).toBeDisabled();
    expect(screen.getByTestId('smtp-continue-reason')).toHaveTextContent(/la connexion a échoué/i);
    await user.click(continueBtn);
    expect(mockedSaveSetupSmtp).not.toHaveBeenCalled();
    expect(screen.getByTestId('smtp-host')).toBeInTheDocument();
  });

  // Ligne 5 — condition de sûreté de la ligne 4 : sortir d'une configuration
  // injoignable DÉJÀ enregistrée, sans intervention hors interface.
  it('configuration enregistrée injoignable : "Effacer" rend la main au transport local et rouvre le saut', async () => {
    const user = userEvent.setup();
    mockedGetSetupSmtp.mockResolvedValue({
      ...emptySmtp,
      smtpHost: '127.0.0.1',
      smtpPort: '1026',
      smtpFromEmail: 'noreply@exemple.com',
    });
    // Premier statut : la config fautive en base masque le repli local. Après
    // effacement, la sonde serveur retrouve l'intercepteur local — c'est le
    // rafraîchissement du signal qui est testé ici, pas seulement le DELETE.
    mockedGetSetupEncryptionKey
      .mockResolvedValueOnce(keyStatus(false))
      .mockResolvedValue(keyStatus(true));
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-clear-btn')).toBeInTheDocument());
    expect(screen.getByTestId('smtp-continue-btn')).toHaveTextContent('Continuer');

    await user.click(screen.getByTestId('smtp-clear-btn'));

    await waitFor(() => expect(mockedClearSetupSmtp).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('smtp-continue-btn')).toHaveTextContent('Passer cette étape'),
    );
    expect((screen.getByTestId('smtp-host') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('smtp-continue-btn')).toBeEnabled();
    // Plus rien à effacer : le bouton de sortie disparaît avec la config.
    expect(screen.queryByTestId('smtp-clear-btn')).not.toBeInTheDocument();
  });

  it('aucune configuration en base : aucun bouton d\'effacement', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    expect(screen.queryByTestId('smtp-clear-btn')).not.toBeInTheDocument();
  });

  // Le préremplissage peut échouer (429 sur le bucket partagé, réseau) : le
  // formulaire vide qui en résulte laisse croire qu'aucune configuration
  // n'existe ET masque la sortie de secours, puisque `hasStoredConfig` reste
  // faux. Ne pas le dire serait le même échec silencieux que celui qu'on corrige.
  it('préremplissage en échec : l\'état dégradé est annoncé, pas masqué', async () => {
    const user = userEvent.setup();
    mockedGetSetupSmtp.mockRejectedValue({ response: { status: 429 } });
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() =>
      expect(screen.getByTestId('smtp-load-failed')).toHaveTextContent(/rechargez la page/i),
    );
    // La bannière est le canal correct pour une condition persistante non
    // rattachable à un champ (R7), donc annoncée par `role="alert"`.
    expect(screen.getByTestId('smtp-load-failed')).toHaveAttribute('role', 'alert');
  });

  // La preuve ne vaut que pour les valeurs testées, sinon il suffirait de
  // tester une bonne configuration puis de saisir n'importe quoi.
  it('modifier un champ après un test réussi re-bloque "Continuer"', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    await user.click(screen.getByTestId('smtp-test-btn'));
    await waitFor(() => expect(screen.getByTestId('smtp-continue-btn')).toBeEnabled());

    await user.type(screen.getByTestId('smtp-host'), '.invalide');

    expect(screen.getByTestId('smtp-continue-btn')).toBeDisabled();
    expect(screen.getByTestId('smtp-continue-reason')).toHaveTextContent(/testez la connexion/i);
    // Le bandeau du test précédent disparaît : il ne décrit plus ce qui est à
    // l'écran, et un vert périmé serait le pire des affichages.
    expect(screen.queryByTestId('smtp-test-result')).not.toBeInTheDocument();
  });

  it('test refusé pour quota (429) : motif distinct d\'un échec de connexion', async () => {
    const user = userEvent.setup();
    mockedTestSetupSmtp.mockRejectedValue({
      response: { status: 429, data: { error: { message: 'Trop de requêtes.' } } },
    });
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-host')).toBeEnabled());
    await user.type(screen.getByTestId('smtp-host'), 'smtp.exemple.com');
    await user.type(screen.getByTestId('smtp-from-email'), 'noreply@exemple.com');
    await user.click(screen.getByTestId('smtp-test-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('smtp-continue-reason')).toHaveTextContent(/patientez une minute/i),
    );
    // Ne jamais envoyer l'utilisateur corriger une configuration qui n'a jamais
    // été essayée : un quota n'est pas un diagnostic de connexion.
    expect(screen.getByTestId('smtp-continue-reason')).not.toHaveTextContent(/la connexion a échoué/i);
    expect(screen.getByTestId('smtp-continue-btn')).toBeDisabled();
  });

  // Tâche moat 6 — retour arrière depuis l'étape SMTP.
  it('« Précédent » ramène de l\'étape SMTP à l\'étape organisation', async () => {
    const user = userEvent.setup();
    renderWizard();
    await skipOrganizationStep(user);

    await waitFor(() => expect(screen.getByTestId('smtp-back-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('smtp-back-btn'));

    await waitFor(() => expect(screen.getByTestId('org-name-input')).toBeInTheDocument());
    // L'organisation est la première étape du flux « source env » : le modèle
    // ne fabrique pas de bouton mort là où il n'y a rien derrière.
    expect(screen.queryByTestId('org-back-btn')).not.toBeInTheDocument();
  });

  it('flux avec étape clé : l\'étape organisation gagne un « Précédent » vers la clé', async () => {
    const user = userEvent.setup();
    mockedGetSetupEncryptionKey.mockResolvedValue({
      configured: true,
      source: 'file' as const,
      fingerprint: 'fedcba987654',
      emailDeliverable: false,
      emailTransportSource: null,
    });
    renderWizard();

    await waitFor(() => expect(screen.getByTestId('encryption-key-continue-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('encryption-key-continue-btn'));

    await waitFor(() => expect(screen.getByTestId('org-back-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('org-back-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('encryption-key-continue-btn')).toBeInTheDocument(),
    );
  });
});

describe('SetupWizard — échec du chargement du statut de la clé', () => {
  // Amorçage nominal compris : le test réamorce lui-même
  // `getSetupEncryptionKey` en échec, ce qui l'emporte.
  beforeEach(() => primeSetupMocks());

  it('affiche un message d\'erreur et un bouton "Réessayer" quand getSetupEncryptionKey rejette', async () => {
    mockedGetSetupEncryptionKey.mockRejectedValue(new Error('network error'));
    renderWizard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('org-name-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument();
  });
});
