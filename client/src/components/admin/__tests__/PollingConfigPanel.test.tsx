import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PollingConfigPanel } from '../PollingConfigPanel'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
