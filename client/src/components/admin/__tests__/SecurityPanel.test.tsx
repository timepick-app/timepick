import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SecurityPanel } from '../SecurityPanel'
import type { RecoveryCodesStatus, RegenerateCodesResponse } from '@/services/recovery.service'

// Mock the recovery service module so we don't hit the axios-URL issue in
// jsdom. Follows the same pattern as EmergencyLogin.test.tsx.
const mockGetRecoveryCodesStatus = vi.fn()
const mockRegenerateCodes = vi.fn()
vi.mock('@/services/recovery.service', () => ({
  getRecoveryCodesStatus: () => mockGetRecoveryCodesStatus(),
  regenerateCodes: () => mockRegenerateCodes(),
}))

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderPanel = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <SecurityPanel />
    </QueryClientProvider>
  )

const firstTimeStatus: RecoveryCodesStatus = {
  remaining: 0,
  expiresAt: null,
  lastGeneratedAt: null,
  emergencyLoginNotified: true,
}

const exhaustedStatus: RecoveryCodesStatus = {
  remaining: 0,
  expiresAt: '2027-04-01T00:00:00.000Z',
  lastGeneratedAt: '2026-04-01T00:00:00.000Z',
  emergencyLoginNotified: true,
}

describe('SecurityPanel — first-time admin CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the first-time notice and generate button when remaining=0 and lastGeneratedAt=null', async () => {
    mockGetRecoveryCodesStatus.mockResolvedValue(firstTimeStatus)

    renderPanel()

    // Notice block is rendered with its testid + role="status"
    const notice = await screen.findByTestId('recovery-first-time-notice')
    expect(notice).toBeInTheDocument()
    expect(notice).toHaveAttribute('role', 'status')

    // Dedicated generate button is rendered
    expect(screen.getByTestId('recovery-first-time-generate')).toBeInTheDocument()

    // The alarming destructive "Aucun code" badge MUST NOT be shown in this
    // onboarding state — showing it would regress the UX fix.
    expect(screen.queryByText('Aucun code')).not.toBeInTheDocument()
  })

  it('invokes the regenerate mutation when the first-time generate button is clicked', async () => {
    mockGetRecoveryCodesStatus.mockResolvedValue(firstTimeStatus)
    const regenResponse: RegenerateCodesResponse = { codes: ['CODE-1', 'CODE-2', 'CODE-3', 'CODE-4', 'CODE-5', 'CODE-6', 'CODE-7', 'CODE-8'] }
    mockRegenerateCodes.mockResolvedValue(regenResponse)

    renderPanel()

    const generateBtn = await screen.findByTestId('recovery-first-time-generate')
    fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(mockRegenerateCodes).toHaveBeenCalledTimes(1)
    })
  })

  it('does NOT render the CTA block when codes were exhausted after prior generation (regression guard)', async () => {
    // Admin has used all their codes — lastGeneratedAt is set. We must fall
    // through to the normal panel and show the red "Aucun code" badge, NOT
    // the friendlier onboarding block.
    mockGetRecoveryCodesStatus.mockResolvedValue(exhaustedStatus)

    renderPanel()

    // Wait for the normal panel to render (badge is a reliable marker).
    expect(await screen.findByText('Aucun code')).toBeInTheDocument()

    // And the first-time onboarding block MUST be absent.
    expect(screen.queryByTestId('recovery-first-time-notice')).not.toBeInTheDocument()
    expect(screen.queryByTestId('recovery-first-time-generate')).not.toBeInTheDocument()
  })
})

describe('SecurityPanel — regenerate flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('confirms via a simple AlertDialog (no email field) and regenerates on confirm', async () => {
    mockGetRecoveryCodesStatus.mockResolvedValue(exhaustedStatus)
    const regenResponse: RegenerateCodesResponse = { codes: ['CODE-1', 'CODE-2'] }
    mockRegenerateCodes.mockResolvedValue(regenResponse)

    renderPanel()

    // Normal panel (post-onboarding) renders the regenerate CTA.
    const regenBtn = await screen.findByRole('button', { name: /Régénérer les codes/i })
    fireEvent.click(regenBtn)

    // A confirmation AlertDialog appears — and it is a SIMPLE confirm: the
    // email type-to-confirm input was removed (option B), so no textbox.
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()

    // Confirming fires the mutation.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Régénérer' }))
    await waitFor(() => {
      expect(mockRegenerateCodes).toHaveBeenCalledTimes(1)
    })
  })
})
