import { StrictMode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EmergencyLogin from '../EmergencyLogin'

// The AuthProvider login function we want to observe
const mockLogin = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    logout: vi.fn(),
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    refreshSession: vi.fn(),
  }),
}))

// Mock the service module so we don't hit the axios-URL issue in jsdom.
const mockEmergencyLogin = vi.fn()
vi.mock('@/services/recovery.service', () => ({
  emergencyLogin: (email: string, code: string) => mockEmergencyLogin(email, code),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const makeWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('EmergencyLogin page', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    mockEmergencyLogin.mockReset()
    mockNavigate.mockReset()
    sessionStorage.clear()
  })

  it('renders email + code fields with helper text', () => {
    render(<EmergencyLogin />, { wrapper: makeWrapper() })
    expect(screen.getByLabelText(/Adresse email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Code de secours/i)).toBeInTheDocument()
    expect(screen.getByText(/Entrez l'un de vos codes de secours/i)).toBeInTheDocument()
  })

  it('shows generic "Identifiants incorrects" on 401 — never discloses whether email or code was wrong', async () => {
    mockEmergencyLogin.mockRejectedValue({
      response: { status: 401, data: { code: 'INVALID_CREDENTIALS' } },
    })

    render(<EmergencyLogin />, { wrapper: makeWrapper() })
    fireEvent.change(screen.getByLabelText(/Adresse email/i), { target: { value: 'x@test.com' } })
    fireEvent.change(screen.getByLabelText(/Code de secours/i), { target: { value: 'TIMEPICK-AAAA-BBBB' } })
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }))

    await waitFor(() => {
      expect(screen.getByText(/Identifiants incorrects/i)).toBeInTheDocument()
    })
  })

  it('disables the submit button while a request is in flight (double-submit prevention)', async () => {
    let resolve: (v: unknown) => void = () => {}
    mockEmergencyLogin.mockImplementation(() => new Promise((r) => { resolve = r }))

    render(<EmergencyLogin />, { wrapper: makeWrapper() })
    fireEvent.change(screen.getByLabelText(/Adresse email/i), { target: { value: 'x@test.com' } })
    fireEvent.change(screen.getByLabelText(/Code de secours/i), { target: { value: 'TIMEPICK-AAAA-BBBB' } })

    const button = screen.getByRole('button', { name: /Se connecter/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })
    expect(mockEmergencyLogin).toHaveBeenCalledTimes(1)

    // Clicking again while submitting must not re-fire the request.
    fireEvent.click(button)
    expect(mockEmergencyLogin).toHaveBeenCalledTimes(1)

    resolve({
      token: 'tok', user: { id: 'u', email: 'x@test.com', firstName: null, lastName: null, role: 'admin' },
      remainingCodes: 7, isLastCode: false, sessionTtl: 7200,
    })
  })

  it('on success, sets sessionStorage.emergencySession and navigates to dashboard', async () => {
    mockEmergencyLogin.mockResolvedValue({
      token: 'tok',
      user: { id: 'u', email: 'x@test.com', firstName: 'Admin', lastName: null, role: 'admin' },
      remainingCodes: 7,
      isLastCode: false,
      sessionTtl: 7200,
    })

    render(<EmergencyLogin />, { wrapper: makeWrapper() })
    fireEvent.change(screen.getByLabelText(/Adresse email/i), { target: { value: 'x@test.com' } })
    fireEvent.change(screen.getByLabelText(/Code de secours/i), { target: { value: 'TIMEPICK-AAAA-BBBB' } })
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('tok', expect.objectContaining({ role: 'admin' }), 7200)
    })
    expect(sessionStorage.getItem('emergencySession')).toBe('true')
    expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true })
  })
})

describe('EmergencyLogin — head meta tags', () => {
  const purgeMetas = () => {
    document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove())
    document.head.querySelectorAll('meta[name="referrer"]').forEach((m) => m.remove())
  }

  beforeEach(() => {
    mockLogin.mockReset()
    mockEmergencyLogin.mockReset()
    mockNavigate.mockReset()
    // Deterministic starting state.
    purgeMetas()
  })

  // Prevent leakage into subsequent describe blocks if test order ever shifts
  // (post-adversarial F14).
  afterEach(() => {
    purgeMetas()
  })

  it('injects exactly one robots=noindex and one referrer=same-origin meta while mounted', () => {
    render(<EmergencyLogin />, { wrapper: makeWrapper() })

    const robotsMetas = document.head.querySelectorAll('meta[name="robots"]')
    expect(robotsMetas).toHaveLength(1)
    expect(robotsMetas[0].getAttribute('content')).toBe('noindex')

    const referrerMetas = document.head.querySelectorAll('meta[name="referrer"]')
    expect(referrerMetas).toHaveLength(1)
    expect(referrerMetas[0].getAttribute('content')).toBe('same-origin')
  })

  it('removes the injected meta tags on unmount', () => {
    const { unmount } = render(<EmergencyLogin />, { wrapper: makeWrapper() })

    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="referrer"]')).toHaveLength(1)

    unmount()

    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(0)
    expect(document.head.querySelectorAll('meta[name="referrer"]')).toHaveLength(0)
  })

  it('does NOT accumulate meta tags across re-renders', () => {
    const { rerender } = render(<EmergencyLogin />, { wrapper: makeWrapper() })

    rerender(<EmergencyLogin />)
    rerender(<EmergencyLogin />)

    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="referrer"]')).toHaveLength(1)
  })

  it('does NOT accumulate under StrictMode double-mount (post-adversarial F8)', () => {
    const Wrapper = makeWrapper()
    // StrictMode in development double-mounts effects: setup → cleanup → setup.
    // The closure-reference cleanup must keep exactly one of each meta after
    // the dust settles, even when the effect fires twice.
    render(
      <StrictMode>
        <Wrapper>
          <EmergencyLogin />
        </Wrapper>
      </StrictMode>
    )

    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="referrer"]')).toHaveLength(1)
  })
})
