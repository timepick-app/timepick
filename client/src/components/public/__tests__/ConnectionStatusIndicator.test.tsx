import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionStatusIndicator } from '../ConnectionStatusIndicator'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ConnectionStatusIndicator', () => {
  it('ne rien afficher quand il n y a pas d erreur', () => {
    const wrapper = createWrapper()
    render(
      <ConnectionStatusIndicator error={null} isRefetching={false} onRetry={vi.fn()} />,
      { wrapper }
    )

    expect(screen.queryByText(/mise à jour/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reconnexion/i)).not.toBeInTheDocument()
  })

  it('affiche un indicateur de reconnexion pendant le retry', () => {
    const wrapper = createWrapper()
    render(
      <ConnectionStatusIndicator error={null} isRefetching={true} onRetry={vi.fn()} />,
      { wrapper }
    )

    expect(screen.getByText(/reconnexion/i)).toBeInTheDocument()
  })

  it('affiche un indicateur de reconnexion avec compteur pendant les tentatives (1-2)', () => {
    const wrapper = createWrapper()
    const error = new Error('Network error')

    // Pour afficher le compteur, il faut: error + failureCount > 0 et < 3, mais PAS isRefetching
    // L'état "error && failureCount > 0 && failureCount < 3" affiche le compteur
    render(
      <ConnectionStatusIndicator
        error={error}
        isRefetching={false} // Pas en cours de rechargement actif
        onRetry={vi.fn()}
        failureCount={1}
      />,
      { wrapper }
    )

    expect(screen.getByText(/Reconnexion... \(1\/3\)/i)).toBeInTheDocument()
  })

  it('affiche un message d erreur et un bouton réessayer après échecs', () => {
    const wrapper = createWrapper()
    const onRetry = vi.fn()
    const error = new Error('Network error')

    render(
      <ConnectionStatusIndicator
        error={error}
        isRefetching={false}
        onRetry={onRetry}
        failureCount={3}
      />,
      { wrapper }
    )

    expect(screen.getByText(/mise à jour indisponible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument()
  })

  it('appelle onRetry quand on clique sur le bouton réessayer', async () => {
    const wrapper = createWrapper()
    const onRetry = vi.fn()
    const error = new Error('Network error')

    render(
      <ConnectionStatusIndicator
        error={error}
        isRefetching={false}
        onRetry={onRetry}
        failureCount={3}
      />,
      { wrapper }
    )

    const retryButton = screen.getByRole('button', { name: /réessayer/i })
    fireEvent.click(retryButton)

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('affiche l âge des données si lastUpdateDate est fourni', () => {
    const wrapper = createWrapper()
    const error = new Error('Network error')
    const lastUpdate = new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago

    render(
      <ConnectionStatusIndicator
        error={error}
        isRefetching={false}
        onRetry={vi.fn()}
        lastUpdateDate={lastUpdate}
        failureCount={3}
      />,
      { wrapper }
    )

    // Vérifier que le texte "il y a X minutes" est présent
    expect(screen.getByText(/il y a.*minutes/i)).toBeInTheDocument()
  })

  it('désactive le bouton quand isRefetching est true', () => {
    const wrapper = createWrapper()
    const onRetry = vi.fn()
    const error = new Error('Network error')

    render(
      <ConnectionStatusIndicator
        error={error}
        isRefetching={true}
        onRetry={onRetry}
        failureCount={3}
      />,
      { wrapper }
    )

    const retryButton = screen.getByRole('button', { name: /réessayer/i })
    expect(retryButton).toBeDisabled()
  })

  it('affiche l âge des données format correct pour date récente', () => {
    const wrapper = createWrapper()
    const error = new Error('Network error')
    const lastUpdate = new Date(Date.now() - 30 * 1000) // 30 secondes

    render(
      <ConnectionStatusIndicator
        error={error}
        isRefetching={false}
        onRetry={vi.fn()}
        lastUpdateDate={lastUpdate}
        failureCount={3}
      />,
      { wrapper }
    )

    // Vérifier la présence du texte "il y a" pour une date récente
    expect(screen.getByText(/il y a/)).toBeInTheDocument()
  })
})
