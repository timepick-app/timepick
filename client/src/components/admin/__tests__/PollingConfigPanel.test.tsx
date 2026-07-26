import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PollingConfigPanel } from '../PollingConfigPanel'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

// Mock des hooks - utiliser le chemin relatif depuis __tests__/ vers hooks/
const mockUsePollingConfig = vi.fn()
const mockUseUpdatePollingConfig = vi.fn()
const mockMsToSeconds = (ms: number) => Math.round(ms / 1000)

vi.mock('../../../hooks/usePollingConfig', () => ({
  usePollingConfig: () => mockUsePollingConfig(),
  useUpdatePollingConfig: () => mockUseUpdatePollingConfig(),
  msToSeconds: (ms: number) => mockMsToSeconds(ms)
}))

const mockRefetch = vi.fn()

const createMockQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

const renderWithQueryClient = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={createMockQueryClient()}>
      {component}
    </QueryClientProvider>
  )
}

describe('PollingConfigPanel', () => {
  const mockUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockUsePollingConfig.mockReturnValue({
      data: { interval: 30000 },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    mockUseUpdatePollingConfig.mockReturnValue({
      mutate: mockUpdate,
      isPending: false,
    })
  })

  it('affiche la valeur actuelle de polling en secondes', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    expect(screen.getByText('(actuel: 30s)')).toBeInTheDocument()
    const input = screen.getByTestId('polling-input') as HTMLInputElement
    expect(input.value).toBe('30')
  })

  it('affiche un état de chargement pendant le chargement', () => {
    mockUsePollingConfig.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    })

    renderWithQueryClient(<PollingConfigPanel />)

    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })

  it('affiche un message d\'erreur en cas d\'erreur de chargement', () => {
    mockUsePollingConfig.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to fetch'),
      refetch: mockRefetch,
    })

    renderWithQueryClient(<PollingConfigPanel />)

    expect(screen.getByText(/Erreur de chargement de la configuration/)).toBeInTheDocument()
  })

  it('permet de modifier la valeur via l\'input', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '60' } })

    expect(input.value).toBe('60')
  })

  it('impose une valeur minimum de 10 secondes', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input') as HTMLInputElement
    // Le slider (input range) clampe automatiquement toute valeur sous le min
    fireEvent.change(input, { target: { value: '5' } })

    expect(parseInt(input.value, 10)).toBeGreaterThanOrEqual(10)
  })

  it('impose une valeur maximum de 120 secondes', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input') as HTMLInputElement
    // Le slider (input range) clampe automatiquement toute valeur au-dessus du max
    fireEvent.change(input, { target: { value: '150' } })

    expect(parseInt(input.value, 10)).toBeLessThanOrEqual(120)
  })

  it('produit une valeur numérique entière par pas de 10', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '40' } })

    expect(input.value).toBe('40')
  })

  it('appelle la mutation avec la bonne valeur lors de la sauvegarde', async () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input')
    fireEvent.change(input, { target: { value: '60' } })

    const saveButton = screen.getByTestId('save-polling-button')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(60)
    })
  })

  it('garde le bouton de sauvegarde activé pour une valeur valide', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input')
    fireEvent.change(input, { target: { value: '60' } })

    const saveButton = screen.getByTestId('save-polling-button')
    expect(saveButton).not.toBeDisabled()
  })

  it('désactive Sauvegarder et Réinitialiser si aucune modification', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    expect(screen.getByTestId('save-polling-button')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled()
  })

  it('réactive les deux boutons après une modification', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input')
    fireEvent.change(input, { target: { value: '60' } })

    expect(screen.getByTestId('save-polling-button')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).not.toBeDisabled()
  })

  it('désactive le bouton de sauvegarde pendant la mutation', () => {
    mockUseUpdatePollingConfig.mockReturnValue({
      mutate: mockUpdate,
      isPending: true,
    })

    renderWithQueryClient(<PollingConfigPanel />)

    const saveButton = screen.getByTestId('save-polling-button')
    expect(saveButton).toBeDisabled()
  })

  it('réinitialise la valeur et désactive les boutons quand on clique sur Réinitialiser', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    const input = screen.getByTestId('polling-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '60' } })
    expect(input.value).toBe('60')

    const resetButton = screen.getByRole('button', { name: 'Réinitialiser' })
    fireEvent.click(resetButton)

    expect(input.value).toBe('30')
    // Après reset, isDirty = false → boutons désactivés
    expect(screen.getByTestId('save-polling-button')).toBeDisabled()
    expect(resetButton).toBeDisabled()
  })

  it('affiche le titre et la description corrects', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    expect(screen.getByText('Rafraîchissement calendrier')).toBeInTheDocument()
    expect(screen.getByText(/Fréquence de mise à jour automatique du calendrier public/)).toBeInTheDocument()
    expect(screen.getByLabelText("Plus d'informations")).toBeInTheDocument()
  })

  it('affiche les bornes min et max', () => {
    renderWithQueryClient(<PollingConfigPanel />)

    expect(screen.getByText('10s')).toBeInTheDocument()
    expect(screen.getByText('120s')).toBeInTheDocument()
  })

  it('convertit correctement les millisecondes en secondes pour l\'affichage', () => {
    mockUsePollingConfig.mockReturnValue({
      data: { interval: 60000 }, // 60 secondes en ms
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    renderWithQueryClient(<PollingConfigPanel />)

    expect(screen.getByText('(actuel: 60s)')).toBeInTheDocument()
    const input = screen.getByTestId('polling-input') as HTMLInputElement
    expect(input.value).toBe('60')
  })
})

describe('PollingConfigPanel — garde anti-écrasement (refetch d\'arrière-plan, staleTime 5 min)', () => {
  const POLLING_KEY = ['config', 'polling-interval']
  const mockUpdateGuard = vi.fn()
  // Prouve que ces tests ne déclenchent jamais un vrai fetch réseau : toute la
  // simulation passe par `queryClient.setQueryData`, jamais par `queryFn`.
  const unexpectedFetch = vi.fn(() => Promise.reject(new Error('unexpected fetch in test')))

  // Ces tests pilotent la vraie query (`useQuery` réel, porté par un QueryClient
  // réel) au lieu du `mockUsePollingConfig.mockReturnValue` statique des tests
  // ci-dessus : c'est le seul moyen de simuler fidèlement, via
  // `queryClient.setQueryData`, le refetch d'arrière-plan que déclenche
  // `refetchOnWindowFocus` au retour d'onglet (staleTime 5 min).
  beforeEach(() => {
    unexpectedFetch.mockClear()
    mockUsePollingConfig.mockImplementation(() =>
      useQuery({
        queryKey: POLLING_KEY,
        queryFn: unexpectedFetch,
        staleTime: 5 * 60 * 1000,
      })
    )
    mockUseUpdatePollingConfig.mockReturnValue({
      mutate: mockUpdateGuard,
      isPending: false,
    })
  })

  const renderWithClient = (queryClient: QueryClient) =>
    render(
      <QueryClientProvider client={queryClient}>
        <PollingConfigPanel />
      </QueryClientProvider>
    )

  it("n'écrase pas une saisie non sauvegardée quand un refetch d'arrière-plan ramène une config tierce", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(POLLING_KEY, { interval: 30000 }) // hydratation initiale : 30s

    renderWithClient(queryClient)

    const input = screen.getByTestId('polling-input') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('30'))

    // L'utilisateur modifie le formulaire sans sauvegarder
    fireEvent.change(input, { target: { value: '50' } })
    expect(input.value).toBe('50')

    // Un autre admin modifie la config pendant que l'onglet est en arrière-plan ;
    // au retour, refetchOnWindowFocus ramène une NOUVELLE référence (90s), différente
    // à la fois de la saisie en cours (50s) et de la valeur initiale (30s)
    act(() => {
      queryClient.setQueryData(POLLING_KEY, { interval: 90000 })
    })

    // Preuve que la nouvelle référence a bien atteint le composant (sinon le test
    // passerait aussi si le refetch n'avait jamais été traité)
    await waitFor(() => expect(screen.getByText('(actuel: 90s)')).toBeInTheDocument())

    // La saisie de l'utilisateur reste affichée — pas écrasée par le refetch tiers
    expect(input.value).toBe('50')
    expect(unexpectedFetch).not.toHaveBeenCalled()
  })

  it("adopte la config serveur après une sauvegarde réussie : l'instantané avance et Sauvegarder redevient désactivé", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(POLLING_KEY, { interval: 30000 })

    renderWithClient(queryClient)

    const input = screen.getByTestId('polling-input') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('30'))

    fireEvent.change(input, { target: { value: '50' } })
    expect(screen.getByTestId('save-polling-button')).not.toBeDisabled()

    // Simule la résolution de notre propre sauvegarde : invalidation + refetch
    // renvoyant exactement ce que le formulaire affiche déjà (50s)
    act(() => {
      queryClient.setQueryData(POLLING_KEY, { interval: 50000 })
    })

    await waitFor(() => expect(screen.getByTestId('save-polling-button')).toBeDisabled())
    expect(input.value).toBe('50')
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled()

    // Preuve que l'instantané a réellement avancé à 50s (et pas seulement que isDirty
    // se recalcule sur le pollingConfig live) : un refetch pristine ultérieur doit
    // désormais être adopté, sinon le formulaire resterait figé sur 50
    act(() => {
      queryClient.setQueryData(POLLING_KEY, { interval: 80000 })
    })
    await waitFor(() => expect(input.value).toBe('80'))
    expect(unexpectedFetch).not.toHaveBeenCalled()
  })
})
