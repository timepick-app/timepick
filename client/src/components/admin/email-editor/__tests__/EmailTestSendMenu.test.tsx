import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EmailTestSendMenu } from '../EmailTestSendMenu'

// Services mockés — on vérifie l'appel, pas le réseau.
const mockTestSendEmailTemplate = vi.fn().mockResolvedValue(undefined)
const mockTestSendEventEmailTemplate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/services/email-templates.service', () => ({
  testSendEmailTemplate: (...args: unknown[]) => mockTestSendEmailTemplate(...args),
}))
vi.mock('@/services/event-email-templates.service', () => ({
  testSendEventEmailTemplate: (...args: unknown[]) => mockTestSendEventEmailTemplate(...args),
}))

// useAuth mocké — fournit l'email admin pour le pré-remplissage.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@timepick.fr' } }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}))

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EmailTestSendMenu', () => {
  it('pré-remplit le champ avec l\u2019email admin à l\u2019ouverture', async () => {
    const user = userEvent.setup()
    render(<EmailTestSendMenu templateKey="invitation" ownerKind="template" ownerId="invitation" />, {
      wrapper: Wrapper,
    })
    await user.click(screen.getByTestId('email-test-send-trigger'))
    const input = screen.getByTestId('email-test-send-input') as HTMLInputElement
    expect(input.value).toBe('admin@timepick.fr')
  })

  it('appelle le service système avec templateKey + to', async () => {
    const user = userEvent.setup()
    render(<EmailTestSendMenu templateKey="magic_link_login" ownerKind="template" ownerId="magic_link_login" />, {
      wrapper: Wrapper,
    })
    await user.click(screen.getByTestId('email-test-send-trigger'))
    await user.click(screen.getByTestId('email-test-send-submit'))
    await waitFor(() => {
      expect(mockTestSendEmailTemplate).toHaveBeenCalledWith('magic_link_login', 'admin@timepick.fr')
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('appelle le service per-event quand ownerKind === "event"', async () => {
    const user = userEvent.setup()
    render(<EmailTestSendMenu templateKey="invitation" ownerKind="event" ownerId="evt-42" />, {
      wrapper: Wrapper,
    })
    await user.click(screen.getByTestId('email-test-send-trigger'))
    await user.click(screen.getByTestId('email-test-send-submit'))
    await waitFor(() => {
      expect(mockTestSendEventEmailTemplate).toHaveBeenCalledWith('evt-42', 'admin@timepick.fr')
    })
  })

  it('désactive l\u2019envoi pour une adresse invalide', async () => {
    const user = userEvent.setup()
    render(<EmailTestSendMenu templateKey="invitation" ownerKind="template" ownerId="invitation" />, {
      wrapper: Wrapper,
    })
    await user.click(screen.getByTestId('email-test-send-trigger'))
    const input = screen.getByTestId('email-test-send-input')
    await user.clear(input)
    await user.type(input, 'pas-un-email')
    expect(screen.getByTestId('email-test-send-submit')).toBeDisabled()
    expect(screen.getByTestId('email-test-send-error')).toBeInTheDocument()
  })

  it('rend le trigger désactivé quand disabled', () => {
    render(<EmailTestSendMenu templateKey="invitation" ownerKind="template" ownerId="invitation" disabled />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('email-test-send-trigger')).toBeDisabled()
  })

  it('affiche un toast d\u2019erreur quand l\u2019envoi échoue', async () => {
    mockTestSendEmailTemplate.mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    render(<EmailTestSendMenu templateKey="invitation" ownerKind="template" ownerId="invitation" />, {
      wrapper: Wrapper,
    })
    await user.click(screen.getByTestId('email-test-send-trigger'))
    await user.click(screen.getByTestId('email-test-send-submit'))
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled()
    })
  })
})
