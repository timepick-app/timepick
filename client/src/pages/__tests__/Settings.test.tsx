import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Settings from '../Settings'

// Story 23.1 / A2 — Settings > Emails sub-navigation deep-link + URL sync.
// Extended in S2 (Post-E4 cluster) — covers the email-template top-level tab
// extraction and the legacy ?tab=email&subtab=* deep-link redirect.
// Auth-flow assertions live in `SettingsProtection.test.tsx`.

vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({ isAuthChecked: true }),
}))

vi.mock('@/components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}))

vi.mock('@/components/admin/PollingConfigPanel', () => ({
  PollingConfigPanel: () => <div data-testid="polling-config" />,
}))
vi.mock('@/components/admin/MagicLinkTTLCard', () => ({
  MagicLinkTTLCard: () => <div data-testid="magic-link-ttl-card" />,
}))
vi.mock('@/components/admin/SessionTTLCard', () => ({
  SessionTTLCard: () => <div data-testid="session-ttl-card" />,
}))
vi.mock('@/components/admin/SmtpConfigPanel', () => ({
  SmtpConfigPanel: () => <div data-testid="smtp-config" />,
}))

// Stub EmailSettingsSubtabs to a minimal harness that exposes the active
// sub-tab id via a data attribute and lets us click through to verify
// onSubtabChange wiring + URL sync.
//
// ⚠️ The module is fully mocked (not partial via importActual) on purpose: the
// real EmailSettingsSubtabs transitively imports the GrapesJS editor through the
// invitation panel, which we do not want to load in this routing-focused suite.
// The constants below are a COPY of the real source — they MUST mirror
// EmailSettingsSubtabs.tsx. Drift of the real VALID_EMAIL_SUBTABS /
// LEGACY_EMAIL_SUBTAB_REDIRECTS is guarded by EmailSettingsSubtabs.test.tsx
// (toEqual on the list + per-entry redirect assertions), which imports the real
// module; keep this copy in sync when those change.
vi.mock('@/components/admin/EmailSettingsSubtabs', () => {
  const VALID_EMAIL_SUBTABS = [
    'template-invitation',
    'emails-systeme-magic-link-login',
    'emails-systeme-confirmation',
  ]
  type EmailSubtabId = (typeof VALID_EMAIL_SUBTABS)[number]
  const DEFAULT_EMAIL_SUBTAB: EmailSubtabId = 'template-invitation'
  const LEGACY_EMAIL_SUBTAB_REDIRECTS: Record<string, EmailSubtabId> = {
    'identite-visuelle': 'template-invitation',
    'emails-systeme-magic-links': 'emails-systeme-magic-link-login',
  }
  const EmailSettingsSubtabs = ({
    activeSubtab,
    onSubtabChange,
  }: {
    activeSubtab: EmailSubtabId
    onSubtabChange: (s: EmailSubtabId) => void
  }) => (
    <div data-testid="email-subtabs-stub" data-active={activeSubtab}>
      {VALID_EMAIL_SUBTABS.map((id) => (
        <button
          key={id}
          data-testid={`subtab-trigger-${id}`}
          onClick={() => onSubtabChange(id as EmailSubtabId)}
        >
          {id}
        </button>
      ))}
    </div>
  )
  return {
    EmailSettingsSubtabs,
    VALID_EMAIL_SUBTABS,
    DEFAULT_EMAIL_SUBTAB,
    LEGACY_EMAIL_SUBTAB_REDIRECTS,
  }
})

function UrlSpy() {
  const [params] = useSearchParams()
  const location = useLocation()
  return (
    <div
      data-testid="url-spy"
      data-search={location.search}
      data-tab={params.get('tab') ?? ''}
      data-subtab={params.get('subtab') ?? ''}
    />
  )
}

function renderAt(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Settings />
        <UrlSpy />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Settings page — sub-tab URL routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults the email-template sub-tab to template-invitation when no subtab is in the URL', () => {
    renderAt('/admin/settings?tab=email-template')
    expect(screen.getByTestId('email-subtabs-stub')).toHaveAttribute(
      'data-active',
      'template-invitation',
    )
  })

  it('honors a deep-link to the magic-link login sub-tab via the subtab query param', () => {
    renderAt(
      '/admin/settings?tab=email-template&subtab=emails-systeme-magic-link-login',
    )
    expect(screen.getByTestId('email-subtabs-stub')).toHaveAttribute(
      'data-active',
      'emails-systeme-magic-link-login',
    )
  })

  // L2 — the grouped `emails-systeme-magic-links` id was split in two; legacy
  // deep-links to it must land on the login sub-tab rather than 404.
  it('redirects the legacy grouped magic-links subtab to the login sub-tab', async () => {
    renderAt(
      '/admin/settings?tab=email-template&subtab=emails-systeme-magic-links',
    )
    const spy = await screen.findByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email-template')
    expect(spy).toHaveAttribute('data-subtab', 'emails-systeme-magic-link-login')
    expect(screen.getByTestId('email-subtabs-stub')).toHaveAttribute(
      'data-active',
      'emails-systeme-magic-link-login',
    )
  })

  it('falls back to template-invitation when the subtab param is unknown', () => {
    renderAt('/admin/settings?tab=email-template&subtab=not-a-real-subtab')
    expect(screen.getByTestId('email-subtabs-stub')).toHaveAttribute(
      'data-active',
      'template-invitation',
    )
  })

  // Plan 2 (2026-05-23) — the identite-visuelle subtab has been dissolved
  // into the email editor's Popover menu. Any legacy URL pointing to it
  // must redirect to the new default rather than 404.
  it('redirects legacy ?subtab=identite-visuelle to template-invitation', async () => {
    renderAt('/admin/settings?tab=email-template&subtab=identite-visuelle')
    const spy = await screen.findByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email-template')
    expect(spy).toHaveAttribute('data-subtab', 'template-invitation')
    expect(screen.getByTestId('email-subtabs-stub')).toHaveAttribute(
      'data-active',
      'template-invitation',
    )
  })

  it('updates the active sub-tab when a trigger is clicked', async () => {
    const user = userEvent.setup()
    renderAt('/admin/settings?tab=email-template')
    await user.click(
      screen.getByTestId('subtab-trigger-emails-systeme-magic-link-login'),
    )
    expect(screen.getByTestId('email-subtabs-stub')).toHaveAttribute(
      'data-active',
      'emails-systeme-magic-link-login',
    )
  })
})

describe('Settings page — email-template tab extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Template email top-level entry alongside Email and Calendrier', () => {
    renderAt('/admin/settings?tab=calendar')
    const templateEmailTrigger = screen.getByRole('radio', { name: /modèle d'email/i })
    expect(templateEmailTrigger).toBeInTheDocument()
    // Sanity: the SMTP-only entry still exists alongside Template email.
    // (Top-level "Email" tab was renamed to "Serveur d'email".)
    expect(screen.getByRole('radio', { name: /serveur d'email/i })).toBeInTheDocument()
  })

  it('renders only SmtpConfigPanel when ?tab=email (template subtabs are hidden)', () => {
    renderAt('/admin/settings?tab=email')
    expect(screen.getByTestId('smtp-config')).toBeInTheDocument()
    // The template subtabs panel is forceMount-kept-alive but flagged hidden;
    // verify its parent TabsContent carries the `hidden` class.
    const templatePanel = screen
      .getByTestId('email-subtabs-stub')
      .closest('[role="tabpanel"]')
    expect(templatePanel).toHaveClass('hidden')
  })

  // The sidebar sub-items are NavLinks to `/admin/settings?tab=X`; the top-level
  // ToggleGroup must keep `?tab=` as the single source of truth so both stay in
  // sync. Clicking a top-level entry must rewrite the URL (not just local state).
  it('writes the selected top-level tab to ?tab= so the URL drives the active panel', async () => {
    const user = userEvent.setup()
    renderAt('/admin/settings?tab=email')
    await user.click(screen.getByRole('radio', { name: /calendrier/i }))
    const spy = await screen.findByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'calendar')
    const calendarPanel = screen.getByTestId('polling-config').closest('[role="tabpanel"]')
    expect(calendarPanel).not.toHaveClass('hidden')
  })

  // Switching away from the modèle-d'email tab drops the now-irrelevant subtab.
  it('clears ?subtab when switching from email-template to another top-level tab', async () => {
    const user = userEvent.setup()
    renderAt('/admin/settings?tab=email-template&subtab=emails-systeme-magic-link-login')
    await user.click(screen.getByRole('radio', { name: /serveur d'email/i }))
    const spy = await screen.findByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email')
    expect(spy).toHaveAttribute('data-subtab', '')
  })
})

describe('Settings page — legacy ?tab=email&subtab=* redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rewrites ?tab=email&subtab=identite-visuelle to ?tab=email-template&subtab=template-invitation (Plan 2 redirect)', async () => {
    renderAt('/admin/settings?tab=email&subtab=identite-visuelle')
    const spy = await screen.findByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email-template')
    expect(spy).toHaveAttribute('data-subtab', 'template-invitation')
    // The Template email tab is the one selected, not Email.
    expect(screen.getByTestId('email-subtabs-stub')).toHaveAttribute(
      'data-active',
      'template-invitation',
    )
  })

  it('rewrites legacy template-invitation deep-link to email-template', async () => {
    renderAt('/admin/settings?tab=email&subtab=template-invitation')
    const spy = await screen.findByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email-template')
    expect(spy).toHaveAttribute('data-subtab', 'template-invitation')
  })

  it('rewrites legacy emails-systeme-magic-links deep-link to email-template + login subtab', async () => {
    renderAt('/admin/settings?tab=email&subtab=emails-systeme-magic-links')
    const spy = await screen.findByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email-template')
    expect(spy).toHaveAttribute('data-subtab', 'emails-systeme-magic-link-login')
  })

  it('does NOT rewrite ?tab=email when no subtab is present (SMTP-only view)', () => {
    renderAt('/admin/settings?tab=email')
    const spy = screen.getByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email')
    expect(spy).toHaveAttribute('data-subtab', '')
    // Regression guard: ?tab=email lands on SMTP, template panel must remain hidden.
    expect(screen.getByTestId('smtp-config')).toBeInTheDocument()
    const templatePanel = screen
      .getByTestId('email-subtabs-stub')
      .closest('[role="tabpanel"]')
    expect(templatePanel).toHaveClass('hidden')
  })

  it('does NOT rewrite ?tab=email&subtab=garbage when subtab is unknown', () => {
    renderAt('/admin/settings?tab=email&subtab=garbage')
    const spy = screen.getByTestId('url-spy')
    expect(spy).toHaveAttribute('data-tab', 'email')
    expect(spy).toHaveAttribute('data-subtab', 'garbage')
  })
})
