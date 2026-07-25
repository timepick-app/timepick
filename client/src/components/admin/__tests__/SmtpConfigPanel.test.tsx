import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SmtpConfigPanel } from '../SmtpConfigPanel'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SmtpSettings, AdminHealthResponse, ProviderMeta } from '../../../services/settings.service'

// Mock the hooks — all 6 are required by the component
const mockUseSmtpSettings = vi.fn()
const mockUseSaveSmtpSettings = vi.fn()
const mockUseTestSmtpConnection = vi.fn()
const mockUseClearSmtpSettings = vi.fn()
const mockUseAdminHealth = vi.fn()
const mockUseEmailProvidersCatalog = vi.fn()

vi.mock('../../../hooks/useSmtpSettings', () => ({
  useSmtpSettings: () => mockUseSmtpSettings(),
  useSaveSmtpSettings: () => mockUseSaveSmtpSettings(),
  useTestSmtpConnection: () => mockUseTestSmtpConnection(),
  useClearSmtpSettings: () => mockUseClearSmtpSettings(),
  useAdminHealth: () => mockUseAdminHealth(),
  useEmailProvidersCatalog: () => mockUseEmailProvidersCatalog(),
}))

// Fixture stub du catalogue (conforme contrat §3.1) — mono-champ (Brevo),
// multi-secret (Mailjet), champ à options (Scaleway région). EU-first,
// resend en dernier, exactement comme le catalogue réel (contrat §0/§3.1).
const catalogFixture: ProviderMeta[] = [
  {
    id: 'brevo',
    label: 'Brevo',
    region: 'eu',
    freeTierNote: '≈ 300 emails/jour (gratuit)',
    credentialFields: [
      { key: 'apiKey', label: 'Clé API', secret: true, placeholder: 'xkeysib-…' },
    ],
  },
  {
    id: 'mailjet',
    label: 'Mailjet',
    region: 'eu',
    freeTierNote: '6 000 emails/mois (gratuit)',
    credentialFields: [
      { key: 'apiKey', label: 'Clé API', secret: true },
      { key: 'secretKey', label: 'Clé secrète', secret: true },
    ],
  },
  {
    id: 'scaleway',
    label: 'Scaleway',
    region: 'eu',
    freeTierNote: '300 emails/mois (gratuit)',
    credentialFields: [
      { key: 'secretKey', label: 'Clé secrète', secret: true },
      { key: 'projectId', label: 'ID de projet', secret: false },
      {
        key: 'region',
        label: 'Région',
        secret: false,
        options: [
          { value: 'fr-par', label: 'Paris (fr-par)' },
          { value: 'nl-ams', label: 'Amsterdam (nl-ams)' },
          { value: 'pl-waw', label: 'Varsovie (pl-waw)' },
        ],
      },
    ],
  },
  {
    id: 'sweego',
    label: 'Sweego',
    region: 'eu',
    freeTierNote: '100 emails/jour (gratuit)',
    credentialFields: [
      { key: 'apiKey', label: 'Clé API', secret: true },
    ],
  },
  {
    id: 'resend',
    label: 'Resend',
    region: 'us',
    freeTierNote: '3 000 emails/mois (gratuit)',
    credentialFields: [
      { key: 'apiKey', label: 'Clé API', secret: true },
    ],
  },
]

const sampleSettings: SmtpSettings = {
  smtpHost: 'smtp.example.org',
  smtpPort: '465',
  smtpSecure: true,
  smtpUser: 'admin@example.com',
  smtpPassword: 'real-secret-password',
  smtpFromName: 'TimePick',
  smtpFromEmail: 'noreply@example.com',
  emailProvider: 'smtp',
  emailApiKey: '',
}

const emptySettings: SmtpSettings = {
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: '',
  smtpFromEmail: '',
  emailProvider: 'smtp',
  emailApiKey: '',
}

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderPanel = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <SmtpConfigPanel />
    </QueryClientProvider>
  )

// Default healthy admin health payload
const healthyHealth: AdminHealthResponse = {
  status: 'ok',
  timestamp: '2026-04-19T00:00:00Z',
  services: {
    database: { status: 'ok' },
    smtp: { status: 'ok', healthy: true },
  },
}

const unhealthyHealth: AdminHealthResponse = {
  status: 'degraded',
  timestamp: '2026-04-19T00:00:00Z',
  services: {
    database: { status: 'ok' },
    smtp: { status: 'error', healthy: false },
  },
}

describe('SmtpConfigPanel', () => {
  const mockSave = vi.fn()
  const mockTest = vi.fn()
  const mockClear = vi.fn()
  const mockRefetchHealth = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseSmtpSettings.mockReturnValue({
      data: sampleSettings,
      isLoading: false,
      error: null,
    })

    mockUseSaveSmtpSettings.mockReturnValue({
      mutate: mockSave,
      isPending: false,
    })

    mockUseTestSmtpConnection.mockReturnValue({
      mutate: mockTest,
      isPending: false,
    })

    mockUseClearSmtpSettings.mockReturnValue({
      mutate: mockClear,
      isPending: false,
      error: null,
    })

    mockUseAdminHealth.mockReturnValue({
      data: healthyHealth,
      isLoading: false,
      refetch: mockRefetchHealth,
    })

    mockUseEmailProvidersCatalog.mockReturnValue({
      data: catalogFixture,
      isLoading: false,
    })
  })

  // T5.1: Test form renders all 7 fields
  it('renders all 7 SMTP fields', () => {
    renderPanel()

    expect(screen.getByTestId('smtp-host')).toBeInTheDocument()
    expect(screen.getByTestId('smtp-port')).toBeInTheDocument()
    expect(screen.getByTestId('smtp-secure')).toBeInTheDocument()
    expect(screen.getByTestId('smtp-user')).toBeInTheDocument()
    expect(screen.getByTestId('smtp-password')).toBeInTheDocument()
    expect(screen.getByTestId('smtp-from-name')).toBeInTheDocument()
    expect(screen.getByTestId('smtp-from-email')).toBeInTheDocument()
  })

  // T5.2: Test form pre-fills from API data
  it('pre-fills form from API data', () => {
    renderPanel()

    expect((screen.getByTestId('smtp-host') as HTMLInputElement).value).toBe('smtp.example.org')
    expect((screen.getByTestId('smtp-port') as HTMLInputElement).value).toBe('465')
    expect((screen.getByTestId('smtp-user') as HTMLInputElement).value).toBe('admin@example.com')
    expect((screen.getByTestId('smtp-password') as HTMLInputElement).value).toBe('real-secret-password')
    expect((screen.getByTestId('smtp-from-name') as HTMLInputElement).value).toBe('TimePick')
    expect((screen.getByTestId('smtp-from-email') as HTMLInputElement).value).toBe('noreply@example.com')
  })

  // T5.3: Test save calls mutation with correct payload
  it('calls save mutation with correct payload on save', async () => {
    renderPanel()

    // Rendre le formulaire dirty avant de sauvegarder
    fireEvent.change(screen.getByTestId('smtp-from-name'), { target: { value: 'TimePick Updated' } })

    const saveBtn = screen.getByTestId('smtp-save-btn')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        {
          smtpHost: 'smtp.example.org',
          smtpPort: 465,
          smtpSecure: true,
          smtpUser: 'admin@example.com',
          smtpPassword: 'real-secret-password',
          smtpFromName: 'TimePick Updated',
          smtpFromEmail: 'noreply@example.com',
          provider: 'smtp',
        },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    })
  })

  // T5.4: Test password hint handling
  it('shows hint when password exists', () => {
    renderPanel()

    expect(screen.getByText(/Mot de passe configuré/)).toBeInTheDocument()
  })

  it('does not show password hint when password is empty', () => {
    mockUseSmtpSettings.mockReturnValue({
      data: emptySettings,
      isLoading: false,
      error: null,
    })

    renderPanel()

    expect(screen.queryByText(/Mot de passe configuré/)).not.toBeInTheDocument()
  })

  // T5.5: Test "Tester la connexion" button behavior
  it('calls test mutation on test button click', async () => {
    mockUseSmtpSettings.mockReturnValue({
      data: { ...sampleSettings, smtpPassword: 'real-password' },
      isLoading: false,
      error: null,
    })

    renderPanel()

    const testBtn = screen.getByTestId('smtp-test-btn')
    fireEvent.click(testBtn)

    await waitFor(() => {
      expect(mockTest).toHaveBeenCalledWith(
        expect.objectContaining({ smtpHost: 'smtp.example.org' })
      )
    })
  })

  it('calls test mutation with real password when test is clicked', async () => {
    renderPanel()

    const testBtn = screen.getByTestId('smtp-test-btn')
    fireEvent.click(testBtn)

    await waitFor(() => {
      expect(mockTest).toHaveBeenCalledWith(
        expect.objectContaining({ smtpPassword: 'real-secret-password' })
      )
    })
  })

  // T5.6: Test client-side validation errors
  // NOTE: Empty host no longer throws a validation error — it now triggers clearSettings
  // (DELETE flow). See "Désactiver SMTP" tests below for blank-host-on-save behavior.
  it('triggers clearSettings (not save) when host is cleared on save', () => {
    renderPanel()

    // Effacer le champ host (dirty + hôte vide → DELETE flow)
    fireEvent.change(screen.getByTestId('smtp-host'), { target: { value: '' } })

    const saveBtn = screen.getByTestId('smtp-save-btn')
    fireEvent.click(saveBtn)

    expect(mockSave).not.toHaveBeenCalled()
    expect(mockClear).toHaveBeenCalled()
  })

  it('shows error when port is invalid', () => {
    mockUseSmtpSettings.mockReturnValue({
      data: { ...sampleSettings, smtpPort: '99999' },
      isLoading: false,
      error: null,
    })

    renderPanel()

    // Rendre le formulaire dirty pour activer le bouton
    fireEvent.change(screen.getByTestId('smtp-host'), { target: { value: 'new-host.com' } })

    const saveBtn = screen.getByTestId('smtp-save-btn')
    fireEvent.click(saveBtn)

    expect(screen.getByText(/Le port doit être entre 1 et 65535/)).toBeInTheDocument()
  })

  it('shows error when sender email format is invalid', () => {
    renderPanel()

    const emailInput = screen.getByTestId('smtp-from-email')
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } })

    const saveBtn = screen.getByTestId('smtp-save-btn')
    fireEvent.click(saveBtn)

    expect(screen.getByText(/Format d'email invalide/)).toBeInTheDocument()
  })

  it('shows error and blocks save when sender email is empty with a host set', () => {
    renderPanel()

    // Host déjà renseigné par défaut (sampleSettings) — on vide uniquement l'email
    const emailInput = screen.getByTestId('smtp-from-email')
    fireEvent.change(emailInput, { target: { value: '' } })

    const saveBtn = screen.getByTestId('smtp-save-btn')
    fireEvent.click(saveBtn)

    expect(screen.getByText(/L'email de l'expéditeur est requis/)).toBeInTheDocument()
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('clears validation error when invalid port field is corrected', () => {
    mockUseSmtpSettings.mockReturnValue({
      data: { ...sampleSettings, smtpPort: '99999' },
      isLoading: false,
      error: null,
    })

    renderPanel()

    // Rendre le formulaire dirty pour activer le bouton
    fireEvent.change(screen.getByTestId('smtp-host'), { target: { value: 'new-host.com' } })

    // Déclencher l'erreur de validation
    const saveBtn = screen.getByTestId('smtp-save-btn')
    fireEvent.click(saveBtn)
    expect(screen.getByText(/Le port doit être entre 1 et 65535/)).toBeInTheDocument()

    // Corriger le port
    const portInput = screen.getByTestId('smtp-port')
    fireEvent.change(portInput, { target: { value: '587' } })

    expect(screen.queryByText(/Le port doit être entre 1 et 65535/)).not.toBeInTheDocument()
  })

  // Additional: loading error state
  it('displays error message when loading fails', () => {
    mockUseSmtpSettings.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network error'),
    })

    renderPanel()

    expect(screen.getByText(/Erreur de chargement de la configuration/)).toBeInTheDocument()
  })

  // Dirty state — Sauvegarder et Réinitialiser désactivés sans modification
  it('désactive Sauvegarder et Réinitialiser si aucune modification', () => {
    renderPanel()

    expect(screen.getByTestId('smtp-save-btn')).toBeDisabled()
    expect(screen.getByTestId('smtp-reset-btn')).toBeDisabled()
  })

  it('active Sauvegarder et Réinitialiser après une modification', () => {
    renderPanel()

    fireEvent.change(screen.getByTestId('smtp-host'), { target: { value: 'new.host.com' } })

    expect(screen.getByTestId('smtp-save-btn')).not.toBeDisabled()
    expect(screen.getByTestId('smtp-reset-btn')).not.toBeDisabled()
  })

  // Additional: reset button
  it('restores original values on reset and disables buttons', () => {
    renderPanel()

    // Modifier un champ → dirty → boutons actifs
    const hostInput = screen.getByTestId('smtp-host')
    fireEvent.change(hostInput, { target: { value: 'modified.host.com' } })
    expect((hostInput as HTMLInputElement).value).toBe('modified.host.com')

    // Réinitialiser → valeurs restaurées, isDirty = false, boutons désactivés
    const resetBtn = screen.getByTestId('smtp-reset-btn')
    fireEvent.click(resetBtn)

    expect((screen.getByTestId('smtp-host') as HTMLInputElement).value).toBe('smtp.example.org')
    expect(screen.getByTestId('smtp-save-btn')).toBeDisabled()
    expect(resetBtn).toBeDisabled()
  })

  // T3.4: Password visibility toggle
  it('renders password visibility toggle button', () => {
    renderPanel()

    expect(screen.getByLabelText(/Afficher le mot de passe/)).toBeInTheDocument()
  })

  it('toggles password field between hidden and visible', () => {
    renderPanel()

    const passwordInput = screen.getByTestId('smtp-password') as HTMLInputElement
    const toggleBtn = screen.getByLabelText(/Afficher le mot de passe/)

    expect(passwordInput.type).toBe('password')

    fireEvent.click(toggleBtn)

    expect(passwordInput.type).toBe('text')
    expect(screen.getByLabelText(/Masquer le mot de passe/)).toBeInTheDocument()
  })

  it('keeps password visible when typing after toggle', () => {
    renderPanel()

    const passwordInput = screen.getByTestId('smtp-password') as HTMLInputElement
    const toggleBtn = screen.getByLabelText(/Afficher le mot de passe/)

    fireEvent.click(toggleBtn)
    expect(passwordInput.type).toBe('text')

    fireEvent.change(passwordInput, { target: { value: 'new-password' } })
    expect(passwordInput.type).toBe('text')
  })

  // Additional: save button shows loading state
  it('shows loading text on save button when saving', () => {
    mockUseSaveSmtpSettings.mockReturnValue({
      mutate: mockSave,
      isPending: true,
    })

    renderPanel()

    expect(screen.getByText('Sauvegarde...')).toBeInTheDocument()
  })

  it('shows loading text on test button when testing', () => {
    mockUseTestSmtpConnection.mockReturnValue({
      mutate: mockTest,
      isPending: true,
    })

    renderPanel()

    expect(screen.getByText('Test en cours...')).toBeInTheDocument()
  })

  // SmtpStatusBadge — 4 states (Non configuré / Opérationnel / Non joignable / Statut inconnu)
  describe('SmtpStatusBadge — 4 states', () => {
    it('shows "Non configuré" when no smtpHost', () => {
      mockUseSmtpSettings.mockReturnValue({
        data: emptySettings,
        isLoading: false,
        error: null,
      })

      renderPanel()

      expect(screen.getByText('Non configuré')).toBeInTheDocument()
    })

    it('shows "Opérationnel" when host + healthy=true', () => {
      mockUseAdminHealth.mockReturnValue({
        data: healthyHealth,
        isLoading: false,
        refetch: mockRefetchHealth,
      })

      renderPanel()

      expect(screen.getByText('Opérationnel')).toBeInTheDocument()
    })

    it('shows "Non joignable" and warning banner when healthy=false', () => {
      mockUseAdminHealth.mockReturnValue({
        data: unhealthyHealth,
        isLoading: false,
        refetch: mockRefetchHealth,
      })

      renderPanel()

      expect(screen.getByText('Non joignable')).toBeInTheDocument()
      expect(screen.getByTestId('smtp-health-warning')).toBeInTheDocument()
    })
  })

  // "Désactiver SMTP" button — visibility and confirmation modal
  describe('"Désactiver SMTP" button', () => {
    it('not shown when smtpHost is empty', () => {
      mockUseSmtpSettings.mockReturnValue({
        data: emptySettings,
        isLoading: false,
        error: null,
      })

      renderPanel()

      expect(screen.queryByTestId('smtp-disable-btn')).not.toBeInTheDocument()
    })

    it('shown when smtpHost is set', () => {
      renderPanel()

      expect(screen.getByTestId('smtp-disable-btn')).toBeInTheDocument()
    })

    it('opens confirmation modal on click and calls clearSettings on confirm', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('smtp-disable-btn'))

      expect(screen.getByText(/Désactiver la configuration SMTP/)).toBeInTheDocument()

      await user.click(screen.getByTestId('smtp-disable-confirm-btn'))

      expect(mockClear).toHaveBeenCalled()
    })
  })

  // 15s UI timeout — badge transitions to "Statut inconnu" when health check stalls
  describe('15s timeout → "Statut inconnu" badge', () => {
    it('shows "Statut inconnu" after 15s with host but loading health', () => {
      vi.useFakeTimers()
      try {
        mockUseAdminHealth.mockReturnValue({
          data: undefined,
          isLoading: true,
          refetch: mockRefetchHealth,
        })

        renderPanel()

        act(() => {
          vi.advanceTimersByTime(15_001)
        })

        expect(screen.getByText('Statut inconnu')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // Fournisseurs HTTP (catalogue) — sélecteur 2 niveaux + formulaire dynamique,
  // remplace l'ancien bloc "Provider Resend" en dur (data-driven, contrat §1/§3.1).
  describe('Fournisseurs HTTP (catalogue)', () => {
    const selectCategory = async (user: UserEvent, label: string) => {
      await user.click(screen.getByTestId('email-category-select'))
      await user.click(await screen.findByRole('option', { name: label }))
    }

    const selectProvider = async (user: UserEvent, label: string) => {
      await user.click(screen.getByTestId('email-provider-select'))
      await user.click(await screen.findByRole('option', { name: new RegExp(`^${label}`) }))
    }

    it('bascule vers "Envoi par API (HTTP)" affiche le sous-menu EU-first (resend en dernier) et masque les champs SMTP', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')

      await user.click(screen.getByTestId('email-provider-select'))
      const options = await screen.findAllByRole('option')
      expect(options.map(o => o.textContent)).toEqual(['Brevo', 'Mailjet', 'Scaleway', 'Sweego', 'Resend'])

      expect(screen.queryByTestId('smtp-host')).not.toBeInTheDocument()
      expect(screen.queryByTestId('smtp-port')).not.toBeInTheDocument()
      expect(screen.queryByTestId('smtp-user')).not.toBeInTheDocument()
      expect(screen.queryByTestId('smtp-password')).not.toBeInTheDocument()
      // Les champs expéditeur communs restent affichés
      expect(screen.getByTestId('smtp-from-name')).toBeInTheDocument()
    })

    it('fournisseur mono-champ (Brevo) affiche exactement 1 champ credential', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Brevo')

      expect(screen.getByTestId('credential-apiKey')).toBeInTheDocument()
      expect(screen.queryByTestId('credential-secretKey')).not.toBeInTheDocument()
      expect(screen.queryByTestId('credential-projectId')).not.toBeInTheDocument()
    })

    it('fournisseur multi-secret (Mailjet) affiche 2 champs credential, secrets masqués', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Mailjet')

      const apiKeyInput = screen.getByTestId('credential-apiKey') as HTMLInputElement
      const secretKeyInput = screen.getByTestId('credential-secretKey') as HTMLInputElement
      expect(apiKeyInput.type).toBe('password')
      expect(secretKeyInput.type).toBe('password')
    })

    it('fournisseur avec options (Scaleway) rend un <select> pour la région et 3 champs uniques', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Scaleway')

      expect(screen.getByTestId('credential-secretKey')).toBeInTheDocument()
      expect(screen.getByTestId('credential-projectId')).toBeInTheDocument()
      const regionTrigger = screen.getByTestId('credential-region')
      expect(regionTrigger).toHaveAttribute('role', 'combobox')

      // a11y : aucun id dupliqué sur ce fournisseur multi-champ (3 champs)
      const ids = [
        screen.getByTestId('credential-secretKey').id,
        screen.getByTestId('credential-projectId').id,
        regionTrigger.id,
      ]
      expect(new Set(ids).size).toBe(3)
      expect(ids.every(Boolean)).toBe(true)
    })

    it('aucun id dupliqué dans tout le document pour un fournisseur multi-champ (Scaleway)', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Scaleway')

      const allIds = Array.from(document.querySelectorAll('[id]')).map(el => el.id).filter(Boolean)
      expect(new Set(allIds).size).toBe(allIds.length)
    })

    it('sélectionner une option de région met à jour la valeur du champ', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Scaleway')

      await user.click(screen.getByTestId('credential-region'))
      await user.click(await screen.findByRole('option', { name: /Amsterdam/ }))

      expect(screen.getByTestId('credential-region')).toHaveTextContent('Amsterdam')
    })

    it('sauvegarde envoie { provider, credentials } avec les valeurs saisies pour un nouveau fournisseur', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Brevo')

      fireEvent.change(screen.getByTestId('credential-apiKey'), { target: { value: 'xkeysib-real-key' } })

      const saveBtn = screen.getByTestId('smtp-save-btn')
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          {
            provider: 'brevo',
            credentials: { apiKey: 'xkeysib-real-key' },
            smtpFromName: 'TimePick',
            smtpFromEmail: 'noreply@example.com',
          },
          expect.objectContaining({ onSuccess: expect.any(Function) })
        )
      })
    })

    it('sentinelle préservée quand le fournisseur ne change pas', async () => {
      mockUseSmtpSettings.mockReturnValue({
        data: {
          ...emptySettings,
          smtpFromName: 'TimePick',
          smtpFromEmail: 'noreply@example.com',
          emailProvider: 'mailjet',
          credentials: { apiKey: '****', secretKey: '****' },
        },
        isLoading: false,
        error: null,
      })

      renderPanel()

      // Formulaire déjà sur mailjet (chargé depuis les settings) — dirty via from-name
      fireEvent.change(screen.getByTestId('smtp-from-name'), { target: { value: 'TimePick Updated' } })
      fireEvent.click(screen.getByTestId('smtp-save-btn'))

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          {
            provider: 'mailjet',
            credentials: { apiKey: '****', secretKey: '****' },
            smtpFromName: 'TimePick Updated',
            smtpFromEmail: 'noreply@example.com',
          },
          expect.objectContaining({ onSuccess: expect.any(Function) })
        )
      })
    })

    it('sentinelle scopée au provider : changer de fournisseur vide les champs secrets (anti-fuite) et force une saisie réelle', async () => {
      mockUseSmtpSettings.mockReturnValue({
        data: {
          ...emptySettings,
          smtpFromName: 'TimePick',
          smtpFromEmail: 'noreply@example.com',
          emailProvider: 'resend',
          credentials: { apiKey: '****' },
        },
        isLoading: false,
        error: null,
      })

      const user = userEvent.setup()
      renderPanel()

      // Le champ affiche bien la sentinelle tant qu'on reste sur resend
      expect((screen.getByTestId('credential-apiKey') as HTMLInputElement).value).toBe('****')

      // Changement de fournisseur → la sentinelle N'EST PAS reportée
      await selectProvider(user, 'Brevo')
      expect((screen.getByTestId('credential-apiKey') as HTMLInputElement).value).toBe('')

      // Sauvegarder sans saisir de vraie clé → erreur de validation, pas d'appel save
      fireEvent.click(screen.getByTestId('smtp-save-btn'))
      expect(screen.getByText(/Le champ « Clé API » est requis/)).toBeInTheDocument()
      expect(mockSave).not.toHaveBeenCalled()

      // Avec une vraie valeur, la sauvegarde envoie la valeur saisie (jamais '****' de resend)
      fireEvent.change(screen.getByTestId('credential-apiKey'), { target: { value: 'xkeysib-new-real-key' } })
      fireEvent.click(screen.getByTestId('smtp-save-btn'))

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({ provider: 'brevo', credentials: { apiKey: 'xkeysib-new-real-key' } }),
          expect.objectContaining({ onSuccess: expect.any(Function) })
        )
      })
    })

    it('aria-invalid + role=alert sur les champs requis manquants (Mailjet)', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Mailjet')

      fireEvent.click(screen.getByTestId('smtp-save-btn'))

      const apiKeyInput = screen.getByTestId('credential-apiKey')
      const secretKeyInput = screen.getByTestId('credential-secretKey')
      expect(apiKeyInput).toHaveAttribute('aria-invalid', 'true')
      expect(secretKeyInput).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getAllByRole('alert').some(el => /Clé API/.test(el.textContent ?? ''))).toBe(true)
      expect(screen.getAllByRole('alert').some(el => /Clé secrète/.test(el.textContent ?? ''))).toBe(true)
      expect(mockSave).not.toHaveBeenCalled()
    })

    it('aria-label distinct par toggle de visibilité (Mailjet, 2 champs secrets)', async () => {
      const user = userEvent.setup()
      renderPanel()

      await selectCategory(user, 'Envoi par API (HTTP)')
      await selectProvider(user, 'Mailjet')

      expect(screen.getByLabelText('Afficher Clé API')).toBeInTheDocument()
      expect(screen.getByLabelText('Afficher Clé secrète')).toBeInTheDocument()
    })

    it('badge, bannière et dialog restent neutres — aucune occurrence "Resend"', async () => {
      const user = userEvent.setup()
      mockUseSmtpSettings.mockReturnValue({
        data: {
          ...emptySettings,
          smtpFromName: 'TimePick',
          smtpFromEmail: 'noreply@example.com',
          emailProvider: 'resend',
          credentials: { apiKey: '****' },
        },
        isLoading: false,
        error: null,
      })
      mockUseAdminHealth.mockReturnValue({
        data: unhealthyHealth,
        isLoading: false,
        refetch: mockRefetchHealth,
      })

      renderPanel()

      // Badge
      expect(screen.getByText('Non joignable')).toBeInTheDocument()

      // Bannière santé
      const warning = screen.getByTestId('smtp-health-warning')
      expect(warning.textContent).not.toMatch(/Resend/)

      // Dialog de désactivation
      await user.click(screen.getByTestId('smtp-disable-btn'))
      const dialog = screen.getByRole('alertdialog')
      expect(dialog.textContent).toMatch(/Désactiver l'envoi d'emails/)
      expect(dialog.textContent).not.toMatch(/Resend/)
    })

    it('badge "Non configuré" pour un fournisseur HTTP sans identifiants stockés', () => {
      mockUseSmtpSettings.mockReturnValue({
        data: { ...emptySettings, emailProvider: 'brevo', credentials: { apiKey: '' } },
        isLoading: false,
        error: null,
      })

      renderPanel()

      expect(screen.getByText('Non configuré')).toBeInTheDocument()
    })

    it('badge "Opérationnel" pour un fournisseur HTTP configuré + healthy', () => {
      mockUseSmtpSettings.mockReturnValue({
        data: {
          ...emptySettings,
          smtpFromName: 'TimePick',
          smtpFromEmail: 'noreply@example.com',
          emailProvider: 'resend',
          credentials: { apiKey: '****' },
        },
        isLoading: false,
        error: null,
      })

      renderPanel()

      expect(screen.getByText('Opérationnel')).toBeInTheDocument()
    })
  })
})
