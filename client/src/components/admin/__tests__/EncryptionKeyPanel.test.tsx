import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EncryptionKeyPanel } from '../EncryptionKeyPanel'
import type { AdminEncryptionKeyStatus } from '@/services/encryption-key.service'

const mockGetAdminEncryptionKey = vi.fn()
const mockRevealEncryptionKey = vi.fn()
vi.mock('@/services/encryption-key.service', () => ({
  getAdminEncryptionKey: () => mockGetAdminEncryptionKey(),
  revealEncryptionKey: () => mockRevealEncryptionKey(),
}))

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderPanel = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <EncryptionKeyPanel />
    </QueryClientProvider>
  )

const fileStatus: AdminEncryptionKeyStatus = { source: 'file', fingerprint: 'abc123def456' }
const envStatus: AdminEncryptionKeyStatus = { source: 'env', fingerprint: 'fedcba987654' }
const rawKey = 'a1b2'.repeat(16) // 64 hex chars

describe('EncryptionKeyPanel — source=file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAdminEncryptionKey.mockResolvedValue(fileStatus)
    mockRevealEncryptionKey.mockResolvedValue({ key: rawKey })
  })

  it('affiche l\'empreinte et le bouton "Révéler la clé"', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('abc123def456')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /révéler la clé/i })).toBeInTheDocument()
  })

  it('cliquer "Révéler la clé" affiche la clé brute renvoyée par revealEncryptionKey', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('abc123def456')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /révéler la clé/i }))

    await waitFor(() => {
      expect(mockRevealEncryptionKey).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByTestId('encryption-key-revealed')).toHaveValue(rawKey)
    })
    expect(screen.getByRole('button', { name: /masquer la clé/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('le bouton Copier copie la clé brute (état) via navigator.clipboard.writeText', async () => {
    const user = userEvent.setup()
    const writeTextSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextSpy },
      configurable: true,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('abc123def456')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /révéler la clé/i }))
    await waitFor(() => expect(screen.getByTestId('encryption-key-revealed')).toHaveValue(rawKey))

    await user.click(screen.getByRole('button', { name: /^copier$/i }))

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(rawKey)
    })
  })
})

describe('EncryptionKeyPanel — source=env', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAdminEncryptionKey.mockResolvedValue(envStatus)
  })

  it("n'affiche pas de bouton de révélation et affiche le message géré par l'environnement", async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('fedcba987654')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /révéler la clé/i })).not.toBeInTheDocument()
    expect(screen.getByText(/gérée via une variable d'environnement/i)).toBeInTheDocument()
  })
})
