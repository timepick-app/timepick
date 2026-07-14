/**
 * Unit tests for render-email.service.ts (Story 22.2 / E1.S2).
 *
 * Strategy — uses the project-wide auto-mock at
 *   `server/src/__mocks__/isomorphic-dompurify.ts` (Story 23.1, A4) so the
 *   real package never resolves. Real `isomorphic-dompurify` pulls in jsdom
 *   → @exodus/bytes (pure ESM) which ts-jest's CJS transform cannot parse.
 *   The mocked sanitizer returns input unchanged, which is fine for these
 *   tests — DOMPurify behaviour is tested separately by the existing
 *   `scripts/verify-mjml-sanitizer.mjs` smoke test.
 *
 *   The DB layer is mocked at two layers: `../../db/query` services
 *   `email_templates` / `events` reads, and `../../db/email-brand-settings.db`
 *   is mocked separately so brand reads bypass the snake→camel conversion in
 *   rowToDto() (which is exercised by the DB layer's own tests). All three
 *   give us deterministic canned rows without touching Postgres.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// 1) Stub DOMPurify *before* render-email.service indirectly imports it
//    via mjml-compile.service. Auto-mock at server/src/__mocks__/.
jest.mock('isomorphic-dompurify')

// 2) Stub the centralized query() function so we can drive every code path
//    deterministically. After Story 23.1 (A3), brand reads go through
//    getEmailBrandSettings() in the DB layer, so we mock that module
//    separately at (3) and the query() mock now only services template/event
//    reads.
jest.mock('../../db/query', () => ({
  __esModule: true,
  query: jest.fn(),
}))

// 3) Stub getEmailBrandSettings() so the renderer's getValidatedBrand()
//    receives a deterministic camelCase row without the snake→camel
//    conversion in rowToDto() (which is exercised by the DB layer's own
//    tests). Preserves the runtime EmailBrandSettingsNotFoundError class so
//    the renderer's instanceof re-throw branch works.
jest.mock('../../db/email-brand-settings.db', () => {
  const ActualNotFound = class EmailBrandSettingsNotFoundError extends Error {
    constructor() {
      super('Email brand settings singleton row not found')
      this.name = 'EmailBrandSettingsNotFoundError'
    }
  }
  return {
    __esModule: true,
    EmailBrandSettingsNotFoundError: ActualNotFound,
    getEmailBrandSettings: jest.fn(),
  }
})

// Imports must come AFTER jest.mock calls (hoisted but the variable bindings
// happen at this point in source order).
import { query } from '../../db/query'
import {
  getEmailBrandSettings,
  EmailBrandSettingsNotFoundError,
  type EmailBrandSettings,
} from '../../db/email-brand-settings.db'
import {
  renderEmail,
  renderSmtpTestEmail,
  runRenderEmailHealthcheck,
  InvalidTemplateKeyError,
  BrandSettingsNotFoundError,
  TemplateNotFoundError,
  MjmlCompileError,
  RenderEmailHealthcheckError,
  TEMPLATE_KEYS,
  __testing__,
  type TemplateKey,
} from '../../services/render-email.service'
import { emailNameVariables } from '../../utils/nameUtils'
import {
  INVITATION_FACTORY_HEADER_MJML,
  INVITATION_FACTORY_CONTENT_WRAPPER_MJML,
  INVITATION_FACTORY_MJBODY_MJML,
} from '../../services/shell-parts.service'

const mockedQuery = query as jest.MockedFunction<typeof query>
const mockedGetBrand = getEmailBrandSettings as jest.MockedFunction<typeof getEmailBrandSettings>

// ---------------------------------------------------------------------------
// Canned DB rows
// ---------------------------------------------------------------------------

const FACTORY_BRAND: EmailBrandSettings = {
  logoUrl: null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
  updatedAt: new Date('2026-05-01T00:00:00Z'),
}

const FACTORY_BODIES: Record<TemplateKey, string> = {
  invitation: `<mj-section><mj-column>
    <mj-text>Invitation à {{event_name}}</mj-text>
    <mj-text>{{event_description}}</mj-text>
    <mj-button href="{{magic_link}}">Réserver</mj-button>
    <mj-text>Expire le {{expiration_date}}</mj-text>
  </mj-column></mj-section>`,
  magic_link_login: `<mj-section><mj-column>
    <mj-button href="{{magic_link}}">Connexion</mj-button>
    <mj-text>Expire le {{expiration_date}}</mj-text>
  </mj-column></mj-section>`,
  reservation_confirmation: `<mj-section><mj-column>
    <mj-text>Bonjour {{user_first_name}},</mj-text>
    <mj-text>Réservation {{event_name}} le {{slot_date}} {{slot_time}}</mj-text>
    <mj-button href="{{calendar_url}}">Gérer ma réservation</mj-button>
  </mj-column></mj-section>`,
  cancellation_confirmation: `<mj-section><mj-column>
    <mj-text>Bonjour {{user_first_name}},</mj-text>
    <mj-text>Créneau annulé : {{event_name}} le {{slot_date}} {{slot_time}}</mj-text>
    <mj-text>{{cancellation_reason}}</mj-text>
  </mj-column></mj-section>`,
  account_created: `<mj-section><mj-column>
    <mj-text>Bonjour {{user_first_name}},</mj-text>
    <mj-button href="{{login_url}}">Accéder à mon espace</mj-button>
  </mj-column></mj-section>`,
  slot_modification: `<mj-section><mj-column>
    <mj-text>Bonjour {{user_first_name}},</mj-text>
    <mj-text>{{event_name}} a changé</mj-text>
    <mj-text>{{changes_blocks}}</mj-text>
    <mj-button href="{{calendar_url}}">Gérer ma réservation</mj-button>
  </mj-column></mj-section>`,
  role_promoted: `<mj-section><mj-column>
    <mj-text>Bonjour {{user_first_name}},</mj-text>
    <mj-button href="{{login_url}}">Accéder à mon espace</mj-button>
  </mj-column></mj-section>`,
  role_demoted: `<mj-section><mj-column>
    <mj-text>Bonjour {{user_first_name}},</mj-text>
    <mj-button href="{{login_url}}">Accéder à mon espace</mj-button>
  </mj-column></mj-section>`,
  unregistration_confirmation: `<mj-section><mj-column>
    <mj-text>Bonjour {{user_first_name}},</mj-text>
    <mj-text>Désinscription : {{event_name}} le {{slot_date}} {{slot_time}}</mj-text>
  </mj-column></mj-section>`,
}

const STUB_VARIABLES = {
  event_name: 'My Event',
  event_description: 'desc',
  magic_link: 'https://example.test/link',
  expiration_date: '2026-06-01',
  slot_date: '2026-06-01',
  slot_time: '14:30',
  user_first_name: 'Camille',
  user_last_name: 'Martin',
  user_full_name: 'Camille Martin',
  login_url: 'https://example.test/login',
  changes_blocks: '<p>Changements</p>',
  calendar_url: 'https://example.test/events/evt-uuid',
}

// Coque carte production (migration 018) — owner partagé template[invitation].
// Utilisée pour seedr shell_parts dans les tests renderSmtpTestEmail afin
// d'exercer le VRAI chemin resolveShellParts (carte #e5e7eb + border-radius +
// padding 30px), pas le repli hardcoded.
const PRODUCTION_SHELL_PARTS = [
  { owner_kind: 'template', owner_id: 'invitation', part_kind: 'header', content_mjml: INVITATION_FACTORY_HEADER_MJML },
  { owner_kind: 'template', owner_id: 'invitation', part_kind: 'content-wrapper', content_mjml: INVITATION_FACTORY_CONTENT_WRAPPER_MJML },
  { owner_kind: 'template', owner_id: 'invitation', part_kind: 'mj-body', content_mjml: INVITATION_FACTORY_MJBODY_MJML },
]

/**
 * Drive `query()` reactions based on the SQL string (we don't try to be a real
 * Postgres — we just look at table names). Brand reads are mocked separately
 * via `mockedGetBrand` since they no longer go through `query()` (Story 23.1
 * A3 — getValidatedBrand wraps getEmailBrandSettings in the DB layer).
 */
type MockState = {
  brand: EmailBrandSettings | null
  templates: Partial<Record<TemplateKey, string>>
  eventOverride: string | null
  // shell_parts rows (cascade header/footer/mj-body/content-wrapper). Défaut
  // absent → [] (repli hardcoded, comportement pré-existant préservé pour les
  // tests renderEmail/healthcheck). Seed avec PRODUCTION_SHELL_PARTS pour
  // exercer la coque carte production côté renderSmtpTestEmail.
  shellParts?: Array<{ owner_kind: string; owner_id: string; part_kind: string; content_mjml: string }>
}

function installMocks(state: MockState): void {
  if (state.brand) {
    mockedGetBrand.mockResolvedValue(state.brand)
  } else {
    mockedGetBrand.mockRejectedValue(new EmailBrandSettingsNotFoundError())
  }
  mockedQuery.mockImplementation(((sql: string, params?: unknown[]) => {
    if (/email_templates/i.test(sql)) {
      const key = (params?.[0] as TemplateKey) ?? null
      const body = key ? state.templates[key] : undefined
      return Promise.resolve({
        rows: body !== undefined ? [{ body_mjml: body }] : [],
        command: 'SELECT',
        rowCount: body !== undefined ? 1 : 0,
      })
    }
    if (/FROM events/i.test(sql)) {
      return Promise.resolve({
        rows: [{ invitation_mjml: state.eventOverride }],
        command: 'SELECT',
        rowCount: 1,
      })
    }
    // Story 26.1 — the resolver queries shell_parts for header/footer cascade.
    // Unit tests don't seed any rows; an empty result triggers the hardcoded
    // fallback that reproduces the pre-26-1 buildShell output.
    if (/FROM shell_parts/i.test(sql)) {
      // resolveShellParts filtre côté JS (pickHighestPriority) ; on retourne
      // l'ensemble des rows seedées (défaut []) sans recréer le WHERE SQL.
      const parts = state.shellParts ?? []
      return Promise.resolve({
        rows: parts,
        command: 'SELECT',
        rowCount: parts.length,
      })
    }
    throw new Error(`[mock] unhandled SQL in test: ${sql}`)
  }) as unknown as typeof query)
}

function freshState(overrides: Partial<MockState> = {}): MockState {
  return {
    brand: { ...FACTORY_BRAND },
    templates: { ...FACTORY_BODIES },
    eventOverride: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockedQuery.mockReset()
  mockedGetBrand.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderEmail()', () => {
  it('compiles all four templateKeys to non-empty html + text (smoke)', async () => {
    installMocks(freshState())
    for (const key of TEMPLATE_KEYS) {
      const out = await renderEmail({ templateKey: key, variables: STUB_VARIABLES })
      expect(out.html.length).toBeGreaterThan(0)
      expect(out.text.length).toBeGreaterThan(0)
      expect(out.html).toMatch(/<html/i)
    }
  })

  it('rend slot_modification avec les blocs injectés et un CTA /calendrier absolu', async () => {
    installMocks(freshState())
    const out = await renderEmail({
      templateKey: 'slot_modification',
      variables: {
        ...STUB_VARIABLES,
        changes_blocks: '<p>SENTINELLE_BLOC_TEST</p>',
        calendar_url: 'https://timepick.test/calendrier',
      },
    })
    // Le bloc composite pré-assemblé est bien injecté dans le HTML rendu…
    expect(out.html).toContain('SENTINELLE_BLOC_TEST')
    // …et le CTA pointe vers une URL ABSOLUE /calendrier (substitution post-compile).
    expect(out.html).toMatch(/href="https?:\/\/[^"]*\/calendrier"/)
  })

  it('substitutes brand tokens at runtime via <mj-attributes>', async () => {
    installMocks(
      freshState({
        brand: { ...FACTORY_BRAND, primaryColor: '#ff00ff' },
      }),
    )
    const out = await renderEmail({
      templateKey: 'invitation',
      variables: STUB_VARIABLES,
    })
    expect(out.html.toLowerCase()).toContain('#ff00ff')
  })

  it('substitutes brand buttonTextColor at runtime via <mj-attributes>', async () => {
    installMocks(freshState({ brand: { ...FACTORY_BRAND, buttonTextColor: '#ff00ff' } }))
    const out = await renderEmail({ templateKey: 'invitation', variables: STUB_VARIABLES })
    expect(out.html.toLowerCase()).toContain('#ff00ff')
  })

  it('substitutes payload variables in the compiled HTML', async () => {
    installMocks(freshState())
    const out = await renderEmail({
      templateKey: 'invitation',
      variables: { ...STUB_VARIABLES, event_name: 'Conférence Été' },
    })
    expect(out.html).toContain('Conférence Été')
    // Plain-text fallback also carries the substituted value.
    expect(out.text).toContain('Conférence Été')
  })

  // Real UUIDs — InvalidEventIdError now rejects non-UUID eventId synchronously.
  const VALID_EVENT_ID = '11111111-2222-3333-4444-555555555555'
  const OTHER_EVENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('honors per-event invitation override when invitation_mjml is non-NULL', async () => {
    const overrideBody =
      '<mj-section><mj-column><mj-text>OVERRIDE_TOKEN_4242 {{event_name}}</mj-text></mj-column></mj-section>'
    installMocks(freshState({ eventOverride: overrideBody }))
    const out = await renderEmail({
      templateKey: 'invitation',
      eventId: VALID_EVENT_ID,
      variables: STUB_VARIABLES,
    })
    expect(out.html).toContain('OVERRIDE_TOKEN_4242')
    // Default template body was NOT loaded — stronger assertion than checking
    // for a specific seed string (which would silently pass for the wrong
    // reason if the seed changed).
    const sqls = mockedQuery.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => /FROM email_templates/i.test(s))).toBe(false)
  })

  it('ignores eventId for non-invitation keys (no events query issued)', async () => {
    installMocks(freshState({ eventOverride: 'should-not-appear' }))
    const out = await renderEmail({
      templateKey: 'magic_link_login',
      eventId: OTHER_EVENT_ID,
      variables: STUB_VARIABLES,
    })
    expect(out.html).not.toContain('should-not-appear')
    // Confirm no events query was issued.
    const sqls = mockedQuery.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => /FROM events/i.test(s))).toBe(false)
  })

  it('falls back to default template when override is NULL even for invitation', async () => {
    installMocks(freshState({ eventOverride: null }))
    const out = await renderEmail({
      templateKey: 'invitation',
      eventId: VALID_EVENT_ID,
      variables: STUB_VARIABLES,
    })
    expect(out.html).toContain('Réserver')
  })

  it('rejects non-UUID eventId with InvalidEventIdError before hitting Postgres', async () => {
    installMocks(freshState())
    const { InvalidEventIdError } = await import('../../services/render-email.service')
    await expect(
      renderEmail({
        templateKey: 'invitation',
        eventId: 'not-a-uuid',
        variables: STUB_VARIABLES,
      }),
    ).rejects.toBeInstanceOf(InvalidEventIdError)
    // No events query should have been issued.
    const sqls = mockedQuery.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => /FROM events/i.test(s))).toBe(false)
  })

  it('renders text-fallback header when logoUrl IS NULL (Q3 graceful path)', async () => {
    installMocks(freshState({ brand: { ...FACTORY_BRAND, logoUrl: null } }))
    const out = await renderEmail({
      templateKey: 'invitation',
      variables: STUB_VARIABLES,
    })
    // No <img> for the logo; instead the "TimePick" text header.
    expect(out.html).not.toMatch(/<img[^>]*alt="TimePick"/i)
    expect(out.html).toContain('TimePick')
  })

  it('renders an <img> header when logoUrl IS NOT NULL', async () => {
    installMocks(
      freshState({
        brand: { ...FACTORY_BRAND, logoUrl: '/uploads/logo.png' },
      }),
    )
    const out = await renderEmail({
      templateKey: 'invitation',
      variables: STUB_VARIABLES,
    })
    expect(out.html).toMatch(/<img[^>]*src="\/uploads\/logo\.png"/i)
  })

  it('treats variables containing $1/$& literally (F16 regression)', async () => {
    installMocks(freshState())
    const out = await renderEmail({
      templateKey: 'invitation',
      variables: {
        ...STUB_VARIABLES,
        event_name: 'Pay $50 (50%) and {{magic}}',
      },
    })
    expect(out.html).toContain('Pay $50 (50%) and {{magic}}')
  })

  it('rejects unknown templateKey synchronously without touching the DB', async () => {
    installMocks(freshState())
    await expect(
      renderEmail({
        templateKey: 'newsletter' as TemplateKey,
        variables: STUB_VARIABLES,
      }),
    ).rejects.toBeInstanceOf(InvalidTemplateKeyError)
    expect(mockedQuery).not.toHaveBeenCalled()
  })

  it('throws BrandSettingsNotFoundError when the singleton row is missing', async () => {
    installMocks(freshState({ brand: null }))
    await expect(
      renderEmail({ templateKey: 'invitation', variables: STUB_VARIABLES }),
    ).rejects.toBeInstanceOf(BrandSettingsNotFoundError)
  })

  it.each<[keyof EmailBrandSettings, unknown]>([
    ['primaryColor', 'not-hex'],
    ['primaryColor', '#FFF'],
    ['buttonTextColor', 'not-hex'],
    ['buttonTextColor', '#FFF'],
    ['fontFamily', 'Bad" /><script>alert(1)</script>'],
    ['fontFamily', 'A'.repeat(65)],
    ['buttonBorderRadius', -1],
    ['buttonBorderRadius', 999],
    ['buttonBorderRadius', 1.5],
  ])(
    'throws InvalidBrandSettingsError when %s is %j',
    async (field, value) => {
      const { InvalidBrandSettingsError } = await import(
        '../../services/render-email.service'
      )
      installMocks(
        freshState({
          brand: { ...FACTORY_BRAND, [field]: value as never },
        }),
      )
      await expect(
        renderEmail({ templateKey: 'invitation', variables: STUB_VARIABLES }),
      ).rejects.toBeInstanceOf(InvalidBrandSettingsError)
    },
  )

  it('throws TemplateNotFoundError when the body row is missing', async () => {
    installMocks(
      freshState({
        templates: { ...FACTORY_BODIES, invitation: undefined },
      }),
    )
    await expect(
      renderEmail({ templateKey: 'invitation', variables: STUB_VARIABLES }),
    ).rejects.toBeInstanceOf(TemplateNotFoundError)
  })

  it('throws MjmlCompileError when the body fragment is malformed', async () => {
    installMocks(
      freshState({
        templates: {
          ...FACTORY_BODIES,
          invitation: '<mj-button bad-no-closing',
        },
      }),
    )
    await expect(
      renderEmail({ templateKey: 'invitation', variables: STUB_VARIABLES }),
    ).rejects.toBeInstanceOf(MjmlCompileError)
  })
})

describe('runRenderEmailHealthcheck()', () => {
  it('resolves when all four templates compile (green path)', async () => {
    installMocks(freshState())
    await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
  })

  it('reads email_brand_settings exactly once for the whole healthcheck (H1 fix)', async () => {
    installMocks(freshState())
    await runRenderEmailHealthcheck()
    // Brand reads now go through getEmailBrandSettings() (Story 23.1 / A3),
    // not through the raw query() — assert on the DB-layer mock instead.
    expect(mockedGetBrand).toHaveBeenCalledTimes(1)
  })

  it('propagates BrandSettingsNotFoundError directly when the singleton is missing (no 4× duplicate)', async () => {
    installMocks(freshState({ brand: null }))
    await expect(runRenderEmailHealthcheck()).rejects.toBeInstanceOf(
      BrandSettingsNotFoundError,
    )
  })

  it('aggregates failures across templates (does not short-circuit)', async () => {
    installMocks(
      freshState({
        templates: {
          ...FACTORY_BODIES,
          magic_link_login: undefined,
          reservation_confirmation: undefined,
        },
      }),
    )
    await expect(runRenderEmailHealthcheck()).rejects.toMatchObject({
      name: 'RenderEmailHealthcheckError',
    })
    try {
      await runRenderEmailHealthcheck()
    } catch (err) {
      const e = err as RenderEmailHealthcheckError
      expect(e).toBeInstanceOf(RenderEmailHealthcheckError)
      const failingKeys = e.failures.map((f) => f.key).sort()
      expect(failingKeys).toEqual(['magic_link_login', 'reservation_confirmation'])
    }
  })
})

describe('responsive shell', () => {
  it('emits a 600px @media query in the compiled HTML', async () => {
    installMocks(freshState())
    const { html } = await renderEmail({
      templateKey: 'invitation',
      variables: { ...STUB_VARIABLES },
    })

    expect(html).toMatch(/@media\s+only\s+screen\s+and\s+\(max-width:\s*600px\)/)
  })

  it('emits stacking rules for mj-column under the breakpoint', async () => {
    installMocks(freshState())
    const { html } = await renderEmail({
      templateKey: 'invitation',
      variables: { ...STUB_VARIABLES },
    })

    expect(html).toMatch(/\.mj-column-per-100\s*\{[^}]*width:\s*100%[^}]*\}/)
  })
})

// Plan 4b du 2026-05-24 — helper de détection du padding non nul. Couvre les
// variantes de zéro (string vide, '0', '0px', '0 px') qui doivent toutes
// retourner false pour éviter l'ajout d'un <mj-wrapper> parasite.
//
// Post-review P3 (defense-in-depth) : ne retourne true que pour un entier
// positif strict avec unité `px` optionnelle. Toute autre forme — unités
// non-px, signe, décimal, tentative d'injection — est traitée comme zéro.
// Le validator d'écriture est la première ligne de défense ; ce helper est
// la seconde au render.
describe('__testing__.isNonZeroPx()', () => {
  const { isNonZeroPx } = __testing__

  it.each<[string, boolean]>([
    // Zéros canoniques
    ['', false],
    ['0', false],
    ['0px', false],
    ['0 px', false],
    [' 0 ', false],
    [' 0px ', false],
    // Variantes de zéro défensives (P3)
    ['00', false],
    ['0PX', false],
    ['0 PX', false],
    // Formats invalides (rejetés → false)
    ['0.0', false],
    ['0.0px', false],
    ['-5px', false],
    ['+0px', false],
    ['2em', false],
    ['10%', false],
    ['40px" onerror="x', false],
    ['<script>', false],
    // Valeurs positives valides (true)
    ['1', true],
    ['1px', true],
    ['40px', true],
    ['100px', true],
    ['20', true],
    ['40PX', true],
    [' 40 px ', true],
  ])('isNonZeroPx(%j) === %s', (input, expected) => {
    expect(isNonZeroPx(input)).toBe(expected)
  })
})

// Plan 4b du 2026-05-24 — assertions au niveau **source MJML** (pré-compile)
// pour garantir que la présence/absence du `<mj-wrapper>` est conforme à
// l'intent du fix. Le test integration assertait `padding-top:40px` dans le
// HTML compilé, mais ce match peut être satisfait par n'importe quelle
// `mj-section` ou `mj-text` portant ce padding — c'est-à-dire un faux-vert
// (review P1 + P2). En examinant directement la string générée par
// `buildShell`, on vérifie exactement le wrapper ajouté/non ajouté.
describe('__testing__.buildShell() — mj-body padding wrapping', () => {
  const { buildShell } = __testing__

  const HEADER_FRAGMENT = '<mj-section background-color="#18181b"><mj-column><mj-text>H</mj-text></mj-column></mj-section>'
  const FOOTER_FRAGMENT = '<mj-section padding="0"><mj-column><mj-text>F</mj-text></mj-column></mj-section>'
  const BODY_FRAGMENT = '<!-- BODY -->'

  it('emits no <mj-wrapper> when both paddings are 0', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, {
      backgroundColor: '#ffffff',
      paddingTop: '0',
      paddingBottom: '0',
    })
    expect(src).not.toMatch(/<mj-wrapper/)
  })

  it('emits a header <mj-wrapper padding-top="40px"> when paddingTop is non-zero', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, {
      backgroundColor: '#ffffff',
      paddingTop: '40px',
      paddingBottom: '0',
    })
    expect(src).toMatch(/<mj-wrapper padding-top="40px"[^>]*>[\s\S]*<\/mj-wrapper>/)
    // Exactement un wrapper (header), pas de wrapper footer.
    expect(src.match(/<mj-wrapper/g) ?? []).toHaveLength(1)
  })

  it('emits a footer <mj-wrapper padding-bottom="20px"> when paddingBottom is non-zero', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, {
      backgroundColor: '#ffffff',
      paddingTop: '0',
      paddingBottom: '20px',
    })
    expect(src).toMatch(/<mj-wrapper padding-top="0" padding-bottom="20px"/)
    expect(src.match(/<mj-wrapper/g) ?? []).toHaveLength(1)
  })

  it('emits two wrappers when both paddings are non-zero', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, {
      backgroundColor: '#ffffff',
      paddingTop: '40px',
      paddingBottom: '20px',
    })
    expect(src.match(/<mj-wrapper/g) ?? []).toHaveLength(2)
    expect(src).toMatch(/<mj-wrapper padding-top="40px"/)
    expect(src).toMatch(/padding-bottom="20px"/)
  })

  it('applies mjBody backgroundColor on <mj-body> (overrides brand fallback)', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, {
      backgroundColor: '#fafafa',
      paddingTop: '0',
      paddingBottom: '0',
    })
    expect(src).toMatch(/<mj-body background-color="#fafafa">/)
  })

  it('falls back to HARDCODED_MJ_BODY_ATTRS (background #fafafa, no wrapper) when mjBodyAttrs omitted (2-arg parity call)', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT)
    expect(src).toMatch(/<mj-body background-color="#fafafa">/)
    expect(src).not.toMatch(/<mj-wrapper/)
  })

  it('skips wrapper when header does not start with <mj-section> (defensive P4)', () => {
    // Cas pathologique : row inséré hors validator (raw SQL) qui stocke un
    // <mj-text> à la racine. Le validator d'écriture le refuserait, mais le
    // render n'a pas à crasher MJML — il préfère l'absence de padding au
    // crash transactionnel.
    const malformedHeader = '<mj-text>Hello</mj-text>'
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, malformedHeader, FOOTER_FRAGMENT, {
      backgroundColor: '#ffffff',
      paddingTop: '40px',
      paddingBottom: '0',
    })
    expect(src).not.toMatch(/<mj-wrapper/)
    // Le fragment header lui-même est toujours injecté tel quel.
    expect(src).toContain(malformedHeader)
  })

  // Plan 4b review pass 2 — patches M2 + M3 + M4 + M5.

  it('M2: startsWithMjSection rejects <mj-section-foo> (false-positive prefix)', () => {
    const { startsWithMjSection } = __testing__
    expect(startsWithMjSection('<mj-section-foo>...</mj-section-foo>')).toBe(false)
    expect(startsWithMjSection('<mj-section>...</mj-section>')).toBe(true)
    expect(startsWithMjSection('<mj-section padding="20px">...</mj-section>')).toBe(true)
  })

  it('M4: startsWithMjSection accepts fragments with leading HTML comments', () => {
    const { startsWithMjSection } = __testing__
    expect(startsWithMjSection('<!-- Header v2 --><mj-section>...</mj-section>')).toBe(true)
    expect(startsWithMjSection('<!-- a --><!-- b --><mj-section>...</mj-section>')).toBe(true)
    expect(startsWithMjSection('   <!-- c -->  <mj-section>...</mj-section>')).toBe(true)
  })

  it('M3: normalizePx returns lowercase Npx form (40PX, 40, " 40 px " → "40px")', () => {
    const { normalizePx } = __testing__
    expect(normalizePx('40PX')).toBe('40px')
    expect(normalizePx('40')).toBe('40px')
    expect(normalizePx(' 40 px ')).toBe('40px')
    expect(normalizePx('40px')).toBe('40px')
    expect(normalizePx('0')).toBe('0px')
    expect(normalizePx('2em')).toBe('0') // invalide → fallback '0'
  })

  it('M3: emits normalized lowercase Npx in <mj-wrapper> even when admin stored uppercase', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, {
      backgroundColor: '#ffffff',
      paddingTop: '40PX',
      paddingBottom: '0',
    })
    expect(src).toMatch(/<mj-wrapper padding-top="40px"/)
    expect(src).not.toMatch(/40PX/)
  })

  it('M5: safeBackgroundColor falls back to the provided fallback when mjBody value is malformed', () => {
    const { safeBackgroundColor } = __testing__
    expect(safeBackgroundColor('#ffffff', '#fafafa')).toBe('#ffffff')
    expect(safeBackgroundColor('#fff" onerror="x', '#fafafa')).toBe('#fafafa')
    expect(safeBackgroundColor('red', '#fafafa')).toBe('#fafafa')
    expect(safeBackgroundColor('', '#fafafa')).toBe('#fafafa')
  })

  it('M5: emits the hardcoded fallback (#fafafa) on <mj-body> when mjBodyAttrs.backgroundColor is compromised', () => {
    const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, {
      backgroundColor: '#fff" onerror="x', // tentative d'injection
      paddingTop: '0',
      paddingBottom: '0',
    })
    expect(src).toMatch(/<mj-body background-color="#fafafa">/)
    expect(src).not.toContain('onerror')
  })
})

// ---------------------------------------------------------------------------
// Plan-5b-defer-A L3 (2026-05-25) — consommation runtime du content-wrapper.
// La defense-in-depth render-time (regex miroir validator) est testée ici à
// la fois via les helpers exposés (`extractContentWrapperAttrs`,
// `formatContentWrapperAttrs`, `hasContentWrapperPayload`) et via le wrap
// `<mj-wrapper>` extérieur émis par `buildShell` autour du `bodyFragment`.
// ---------------------------------------------------------------------------

describe('__testing__ — content-wrapper consumption — L3 render', () => {
  const {
    buildShell,
    extractContentWrapperAttrs,
    formatContentWrapperAttrs,
    hasContentWrapperPayload,
    BORDER_RADIUS_RENDER_RE,
  } = __testing__

  const HEADER_FRAGMENT = '<mj-section background-color="#18181b"><mj-column><mj-text>H</mj-text></mj-column></mj-section>'
  const FOOTER_FRAGMENT = '<mj-section padding="0"><mj-column><mj-text>F</mj-text></mj-column></mj-section>'
  const BODY_FRAGMENT = '<!-- BODY -->'
  const ZERO_MJ_BODY_ATTRS = {
    backgroundColor: '#ffffff',
    paddingTop: '0',
    paddingBottom: '0',
  }

  describe('cascade vide — no-op snapshot', () => {
    it('omits <mj-wrapper> autour du body quand contentWrapper === null', () => {
      const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT, HEADER_FRAGMENT, FOOTER_FRAGMENT, ZERO_MJ_BODY_ATTRS, null)
      expect(src).not.toMatch(/<mj-wrapper/)
      // bodyFragment émis tel quel (parité byte-level pré-L3).
      expect(src).toContain(BODY_FRAGMENT)
    })

    it('parité 2-args call : contentWrapper omis = null (préserve la parity guard)', () => {
      const src = buildShell(FACTORY_BRAND, BODY_FRAGMENT)
      expect(src).not.toMatch(/<mj-wrapper/)
      expect(src).toContain(BODY_FRAGMENT)
    })

    it('omits <mj-wrapper> quand la row content-wrapper a un slot d\'attrs vide', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section></mj-section>' },
      )
      expect(src).not.toMatch(/<mj-wrapper/)
      expect(src).toContain(BODY_FRAGMENT)
    })
  })

  describe('brand bg seul', () => {
    it('émet <mj-wrapper background-color="#f9f9f9"> autour du body', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section background-color="#f9f9f9"></mj-section>' },
      )
      expect(src).toMatch(/<mj-wrapper background-color="#f9f9f9"[^>]*>[\s\S]*<\/mj-wrapper>/)
      // Le wrap entoure le bodyFragment (pas le header ni le footer).
      const wrapperMatch = /<mj-wrapper background-color="#f9f9f9"[^>]*>([\s\S]*?)<\/mj-wrapper>/.exec(src)
      expect(wrapperMatch).not.toBeNull()
      expect(wrapperMatch?.[1]).toContain(BODY_FRAGMENT)
      expect(wrapperMatch?.[1]).not.toContain(HEADER_FRAGMENT)
      expect(wrapperMatch?.[1]).not.toContain(FOOTER_FRAGMENT)
    })
  })

  describe('tous attrs', () => {
    // Note : le validator côté écriture `BorderRadiusShell` impose `\d+px`
    // strict (pas de `0` bare). Le render est miroir defensive — il rejette
    // donc aussi `border-radius="0 0 8px 8px"`. La forme stockée admissible
    // pour un border-radius asymétrique est `"0px 0px 8px 8px"`.
    it('émet les 3 attributs normalisés (background-color, padding, border-radius)', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        {
          contentMjml:
            '<mj-section background-color="#f9f9f9" padding="20px" border-radius="0px 0px 8px 8px"></mj-section>',
        },
      )
      expect(src).toMatch(/<mj-wrapper [^>]*background-color="#f9f9f9"/)
      expect(src).toMatch(/<mj-wrapper [^>]*padding="20px"/)
      expect(src).toMatch(/<mj-wrapper [^>]*border-radius="0px 0px 8px 8px"/)
    })

    it('normalise les paddings en lowercase Npx', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        {
          contentMjml: '<mj-section padding="20PX" border-radius="8PX"></mj-section>',
        },
      )
      expect(src).toMatch(/padding="20px"/)
      expect(src).toMatch(/border-radius="8px"/)
      expect(src).not.toMatch(/20PX|8PX/)
    })

    it('accepte le shorthand longhand padding-top/-bottom/-left/-right', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        {
          contentMjml:
            '<mj-section padding-top="10px" padding-bottom="20px" padding-left="5px" padding-right="5px"></mj-section>',
        },
      )
      expect(src).toMatch(/padding-top="10px"/)
      expect(src).toMatch(/padding-bottom="20px"/)
      expect(src).toMatch(/padding-left="5px"/)
      expect(src).toMatch(/padding-right="5px"/)
    })
  })

  describe('attrs invalides defense-in-depth', () => {
    let warnSpy: jest.SpiedFunction<typeof console.warn>

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('bg-color invalide est strippé ; warn DEV-only ; wrap émis seulement si autre attr valide', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        {
          contentMjml: '<mj-section background-color="not-a-hex" padding="20px"></mj-section>',
        },
      )
      expect(src).toMatch(/<mj-wrapper [^>]*padding="20px"/)
      expect(src).not.toMatch(/background-color="not-a-hex"/)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('content-wrapper background-color invalid value stripped'),
      )
    })

    it('bg-color invalide seul ⇒ aucun wrap émis', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section background-color="not-a-hex"></mj-section>' },
      )
      expect(src).not.toMatch(/<mj-wrapper/)
    })

    it('padding non-px (ex. 20rem) strippé ; warn émis', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section padding="20rem" background-color="#f9f9f9"></mj-section>' },
      )
      expect(src).toMatch(/<mj-wrapper [^>]*background-color="#f9f9f9"/)
      expect(src).not.toMatch(/padding="20rem"/)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('content-wrapper padding invalid value stripped'),
      )
    })

    it('border-radius en % strippé ; warn émis', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section border-radius="50%" background-color="#f9f9f9"></mj-section>' },
      )
      expect(src).toMatch(/<mj-wrapper [^>]*background-color="#f9f9f9"/)
      expect(src).not.toMatch(/border-radius="50%"/)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('content-wrapper border-radius invalid value stripped'),
      )
    })

    it('border-radius "auto" strippé', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section border-radius="auto" background-color="#f9f9f9"></mj-section>' },
      )
      expect(src).not.toMatch(/border-radius="auto"/)
      expect(src).toMatch(/<mj-wrapper [^>]*background-color="#f9f9f9"/)
    })

    it('tous attrs invalides ⇒ aucun wrap émis (cascade vide en pratique)', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        {
          contentMjml:
            '<mj-section background-color="rgb(255,0,0)" padding="invalid" border-radius="round"></mj-section>',
        },
      )
      expect(src).not.toMatch(/<mj-wrapper/)
    })

    it('padding="0" considéré comme no-op (parité semantique avec attr absent)', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section padding="0 0 0 0"></mj-section>' },
      )
      expect(src).not.toMatch(/<mj-wrapper/)
    })
  })

  describe('ordre <mj-body> — 3 wrappers consécutifs', () => {
    it('header padding-top + content-wrapper + footer padding-bottom émis dans le bon ordre', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        { backgroundColor: '#ffffff', paddingTop: '40px', paddingBottom: '20px' },
        { contentMjml: '<mj-section background-color="#f9f9f9"></mj-section>' },
      )
      expect(src.match(/<mj-wrapper/g) ?? []).toHaveLength(3)
      const headerWrap = src.indexOf('<mj-wrapper padding-top="40px"')
      const contentWrap = src.indexOf('<mj-wrapper background-color="#f9f9f9"')
      const footerWrap = src.indexOf('<mj-wrapper padding-top="0" padding-bottom="20px"')
      expect(headerWrap).toBeGreaterThanOrEqual(0)
      expect(contentWrap).toBeGreaterThanOrEqual(0)
      expect(footerWrap).toBeGreaterThanOrEqual(0)
      expect(headerWrap).toBeLessThan(contentWrap)
      expect(contentWrap).toBeLessThan(footerWrap)
    })
  })

  describe('helpers isolated', () => {
    it('extractContentWrapperAttrs parse les attrs whitelistés (paddings, radius, bordures) et ignore les autres', () => {
      const attrs = extractContentWrapperAttrs(
        '<mj-section background-color="#f9f9f9" padding="20px" padding-top="10px" padding-bottom="10px" padding-left="5px" padding-right="5px" border-radius="8px" border-left="1px solid #18181b" color="#ff0000"></mj-section>',
      )
      expect(attrs).toEqual({
        backgroundColor: '#f9f9f9',
        padding: '20px',
        paddingTop: '10px',
        paddingBottom: '10px',
        paddingLeft: '5px',
        paddingRight: '5px',
        borderRadius: '8px',
        borderTop: '',
        borderRight: '',
        borderBottom: '',
        borderLeft: '1px solid #18181b',
      })
    })

    it('extractContentWrapperAttrs retourne défauts vides quand mj-section absent', () => {
      const attrs = extractContentWrapperAttrs('<mj-text>plain</mj-text>')
      expect(attrs.backgroundColor).toBe('')
      expect(attrs.padding).toBe('')
      expect(attrs.borderRadius).toBe('')
    })

    it('hasContentWrapperPayload(empty attrs) === false', () => {
      expect(hasContentWrapperPayload({ ...EMPTY_HELPER_ATTRS })).toBe(false)
    })

    it('hasContentWrapperPayload(bg seul) === true', () => {
      expect(hasContentWrapperPayload({ ...EMPTY_HELPER_ATTRS, backgroundColor: '#f9f9f9' })).toBe(true)
    })

    it('formatContentWrapperAttrs(empty) === ""', () => {
      expect(formatContentWrapperAttrs({ ...EMPTY_HELPER_ATTRS })).toBe('')
    })

    it('BORDER_RADIUS_RENDER_RE accepte 1-4 entiers px stricts', () => {
      expect(BORDER_RADIUS_RENDER_RE.test('8px')).toBe(true)
      expect(BORDER_RADIUS_RENDER_RE.test('8px 4px')).toBe(true)
      expect(BORDER_RADIUS_RENDER_RE.test('0px 0px 8px 8px')).toBe(true)
      expect(BORDER_RADIUS_RENDER_RE.test('8PX')).toBe(true)
      expect(BORDER_RADIUS_RENDER_RE.test('8px 4px 2px 1px 0px')).toBe(false)
      expect(BORDER_RADIUS_RENDER_RE.test('50%')).toBe(false)
      expect(BORDER_RADIUS_RENDER_RE.test('auto')).toBe(false)
      expect(BORDER_RADIUS_RENDER_RE.test('8')).toBe(false)
    })
  })

  describe('content-wrapper — passthrough des bordures par côté (Plan 2026-06-08)', () => {
    it('émet border-left/right/bottom quand présents dans la row', () => {
      const raw = extractContentWrapperAttrs(
        '<mj-section background-color="#ffffff" border-left="1px solid #18181b" border-right="1px solid #18181b" border-bottom="1px solid #18181b"></mj-section>',
      )
      const out = formatContentWrapperAttrs(raw)
      expect(out).toContain('background-color="#ffffff"')
      expect(out).toContain('border-left="1px solid #18181b"')
      expect(out).toContain('border-right="1px solid #18181b"')
      expect(out).toContain('border-bottom="1px solid #18181b"')
    })

    it('ignore un border-* absent (chaîne sans la clé)', () => {
      const raw = extractContentWrapperAttrs('<mj-section background-color="#ffffff"></mj-section>')
      const out = formatContentWrapperAttrs(raw)
      expect(out).not.toContain('border-left')
      expect(out).not.toContain('border-top="1px')
    })

    it('strippe une bordure invalide (couleur non-hex) — defense-in-depth', () => {
      const raw = extractContentWrapperAttrs('<mj-section border-top="1px solid black"></mj-section>')
      const out = formatContentWrapperAttrs(raw)
      expect(out).not.toContain('border-top')
    })
  })

  // -------------------------------------------------------------------------
  // Plan post-5b-defer-A L2-B — hardening défensif (findings B.6, B.7, B.8).
  // Pattern miroir des helpers existants ; aucune modification des baselines.
  // -------------------------------------------------------------------------
  describe('B.6 — hasNonZeroBorderRadius : border-radius="0px" no-op', () => {
    it('border-radius="0px" n\'émet pas l\'attribut sur <mj-wrapper>', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        // Combine bg valide + border-radius zéro → seul bg doit être émis.
        { contentMjml: '<mj-section background-color="#f9f9f9" border-radius="0px"></mj-section>' },
      )
      expect(src).toMatch(/<mj-wrapper [^>]*background-color="#f9f9f9"/)
      // Scope strict sur `<mj-wrapper>` — brand.buttonBorderRadius émet
      // déjà `border-radius` sur `<mj-button>` via `<mj-attributes>`.
      expect(src).not.toMatch(/<mj-wrapper [^>]*border-radius/)
    })

    it('border-radius="0px 0px 0px 0px" (shorthand zéro) n\'émet pas l\'attribut', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        {
          contentMjml:
            '<mj-section background-color="#f9f9f9" border-radius="0px 0px 0px 0px"></mj-section>',
        },
      )
      expect(src).not.toMatch(/<mj-wrapper [^>]*border-radius/)
    })

    it('border-radius="0px 0px 8px 8px" (au moins une valeur >0) émet l\'attribut', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section border-radius="0px 0px 8px 8px"></mj-section>' },
      )
      expect(src).toMatch(/<mj-wrapper [^>]*border-radius="0px 0px 8px 8px"/)
    })

    it('border-radius="0px" seul ⇒ aucun wrap émis (no-op total)', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section border-radius="0px"></mj-section>' },
      )
      expect(src).not.toMatch(/<mj-wrapper/)
    })
  })

  describe('B.7 — normalizeContentWrapperBackgroundColor : trim + lowercase', () => {
    it('background-color="#F9F9F9" (uppercase) émis en lowercase #f9f9f9', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section background-color="#F9F9F9"></mj-section>' },
      )
      expect(src).toMatch(/background-color="#f9f9f9"/)
      expect(src).not.toMatch(/#F9F9F9/)
    })

    it('background-color="#AaBbCc" (mixed case) émis en lowercase #aabbcc', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section background-color="#AaBbCc"></mj-section>' },
      )
      expect(src).toMatch(/background-color="#aabbcc"/)
    })

    it('background-color=" #f9f9f9 " (avec whitespace pré/post) émis trim + lowercase', () => {
      const src = buildShell(
        FACTORY_BRAND,
        BODY_FRAGMENT,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section background-color=" #F9F9F9 "></mj-section>' },
      )
      expect(src).toMatch(/background-color="#f9f9f9"/)
      // L'attribut émis ne doit pas contenir de whitespace résiduel.
      expect(src).not.toMatch(/background-color=" /)
    })
  })

  describe('B.8 — warn DEV-only quand bodyFragment ne commence pas par <mj-section>', () => {
    let warnSpy: jest.SpiedFunction<typeof console.warn>

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('bodyFragment commençant par <mj-text> ET contentWrapper non-null ⇒ warn émis, wrap toujours émis', () => {
      const malformedBody = '<mj-text>plain</mj-text>'
      const src = buildShell(
        FACTORY_BRAND,
        malformedBody,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section background-color="#f9f9f9"></mj-section>' },
      )
      // Defense-in-depth : le wrap reste émis (pattern miroir M4 Plan 4b).
      expect(src).toMatch(/<mj-wrapper [^>]*background-color="#f9f9f9"/)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[render-email] content-wrapper requested but body fragment does not start with <mj-section>',
        ),
      )
    })

    it('bodyFragment commençant par <mj-section> ⇒ aucun warn B.8 émis', () => {
      const wellFormedBody = '<mj-section><mj-column><mj-text>ok</mj-text></mj-column></mj-section>'
      buildShell(
        FACTORY_BRAND,
        wellFormedBody,
        HEADER_FRAGMENT,
        FOOTER_FRAGMENT,
        ZERO_MJ_BODY_ATTRS,
        { contentMjml: '<mj-section background-color="#f9f9f9"></mj-section>' },
      )
      const calls = warnSpy.mock.calls.flat().filter(
        (msg) =>
          typeof msg === 'string' &&
          msg.includes('content-wrapper requested but body fragment does not start with'),
      )
      expect(calls).toHaveLength(0)
    })

    it('contentWrapper === null ⇒ aucun warn B.8 même si bodyFragment mal formé', () => {
      const malformedBody = '<mj-text>plain</mj-text>'
      buildShell(FACTORY_BRAND, malformedBody, HEADER_FRAGMENT, FOOTER_FRAGMENT, ZERO_MJ_BODY_ATTRS, null)
      const calls = warnSpy.mock.calls.flat().filter(
        (msg) =>
          typeof msg === 'string' &&
          msg.includes('content-wrapper requested but body fragment does not start with'),
      )
      expect(calls).toHaveLength(0)
    })

    it('warn supprimé en production', () => {
      const previousEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        const malformedBody = '<mj-text>plain</mj-text>'
        buildShell(
          FACTORY_BRAND,
          malformedBody,
          HEADER_FRAGMENT,
          FOOTER_FRAGMENT,
          ZERO_MJ_BODY_ATTRS,
          { contentMjml: '<mj-section background-color="#f9f9f9"></mj-section>' },
        )
        const calls = warnSpy.mock.calls.flat().filter(
          (msg) =>
            typeof msg === 'string' &&
            msg.includes('content-wrapper requested but body fragment does not start with'),
        )
        expect(calls).toHaveLength(0)
      } finally {
        if (previousEnv === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = previousEnv
      }
    })
  })

  describe('content-wrapper A3 — padding vertical neutralisé', () => {
    it('émet padding-top="0" et padding-bottom="0" quand seul background-color est présent', () => {
      const raw = extractContentWrapperAttrs('<mj-section background-color="#f9f9f9"></mj-section>')
      const out = formatContentWrapperAttrs(raw)
      expect(out).toContain('background-color="#f9f9f9"')
      expect(out).toContain('padding-top="0"')
      expect(out).toContain('padding-bottom="0"')
    })

    it("respecte un padding-top admin explicite (pas d'écrasement par 0)", () => {
      const raw = extractContentWrapperAttrs(
        '<mj-section background-color="#f9f9f9" padding-top="12px"></mj-section>',
      )
      const out = formatContentWrapperAttrs(raw)
      expect(out).toContain('padding-top="12px"')
      expect(out).not.toContain('padding-top="0"')
    })

    it('ne wrappe pas un content-wrapper totalement vide (chaîne vide)', () => {
      const raw = extractContentWrapperAttrs('<mj-section></mj-section>')
      expect(formatContentWrapperAttrs(raw)).toBe('')
    })
  })
})

const EMPTY_HELPER_ATTRS = {
  backgroundColor: '',
  padding: '',
  paddingTop: '',
  paddingBottom: '',
  paddingLeft: '',
  paddingRight: '',
  borderRadius: '',
  borderTop: '',
  borderRight: '',
  borderBottom: '',
  borderLeft: '',
}

// ---------------------------------------------------------------------------
// emailNameVariables — unit tests
// ---------------------------------------------------------------------------

describe('emailNameVariables()', () => {
  it('retourne user_first_name, user_last_name, user_full_name quand prénom et nom présents', () => {
    const vars = emailNameVariables('Marie', 'Curie')
    expect(vars.user_first_name).toBe('Marie')
    expect(vars.user_last_name).toBe('Curie')
    expect(vars.user_full_name).toBe('Marie Curie')
  })

  it('user_first_name vide quand le prénom est vide', () => {
    const vars = emailNameVariables('', 'Martin')
    expect(vars.user_first_name).toBe('')
    expect(vars.user_last_name).toBe('Martin')
    expect(vars.user_full_name).toBe('Martin')
  })

  it('toutes les valeurs vides quand le prénom et nom sont null', () => {
    const vars = emailNameVariables(null, null)
    expect(vars.user_first_name).toBe('')
    expect(vars.user_last_name).toBe('')
    expect(vars.user_full_name).toBe('')
  })

  it('user_first_name vide quand le prénom est undefined', () => {
    const vars = emailNameVariables(undefined, undefined)
    expect(vars.user_first_name).toBe('')
  })

  it('trime les espaces en début/fin de prénom et nom', () => {
    const vars = emailNameVariables('  Alice  ', '  Dupont  ')
    expect(vars.user_first_name).toBe('Alice')
    expect(vars.user_last_name).toBe('Dupont')
    expect(vars.user_full_name).toBe('Alice Dupont')
  })

  it('user_full_name = prénom seul quand le nom est absent', () => {
    const vars = emailNameVariables('Luc', null)
    expect(vars.user_full_name).toBe('Luc')
  })

  it('user_full_name = nom seul quand le prénom est absent', () => {
    const vars = emailNameVariables(null, 'Bernard')
    expect(vars.user_full_name).toBe('Bernard')
  })
})

// ---------------------------------------------------------------------------
// renderSmtpTestEmail() — email de test SMTP (2026-06-28)
// ---------------------------------------------------------------------------

describe('renderSmtpTestEmail()', () => {
  it('rend la coque production (carte #e5e7eb + border-radius) SANS footer', async () => {
    installMocks(freshState({ shellParts: PRODUCTION_SHELL_PARTS }))
    const { html, text } = await renderSmtpTestEmail()
    // Coque carte production (migration 018) — discriminants absents du repli
    // hardcoded : bordures + coins arrondis prouvent que resolveShellParts a
    // retourné la coque partagée (fix #2 : content sans contour/radius).
    expect(html.toLowerCase()).toContain('#e5e7eb')
    expect(html.toLowerCase()).toContain('border-radius')
    // Fond de page #fafafa (présent quelle que soit la coque).
    expect(html.toLowerCase()).toContain('#fafafa')
    // Header de marque.
    expect(html).toContain('TimePick')
    // Règle footer-sans-lien : le corps n'a aucun href → pas de footer.
    expect(html).not.toContain('Ce lien est personnel')
    // Message verbatim dans la version plain-text.
    expect(text).toContain(
      'Connexion SMTP réussie ! Si vous recevez cet email, votre configuration SMTP est correcte.',
    )
  })

  it('retombe sur les défauts usine quand la row brand est absente (wizard de setup)', async () => {
    // mockedGetBrand rejette EmailBrandSettingsNotFoundError — loadBrandOrDefault
    // retombe sur EMAIL_BRAND_FACTORY_DEFAULTS sans planter, et rend quand même
    // la coque carte production.
    installMocks(freshState({ brand: null, shellParts: PRODUCTION_SHELL_PARTS }))
    const { html } = await renderSmtpTestEmail()
    expect(html).toContain('TimePick')
    expect(html.toLowerCase()).toContain('#e5e7eb')
    expect(html).not.toContain('Ce lien est personnel')
  })
})

// ---------------------------------------------------------------------------
// Règle footer-sans-lien — helpers + intégration légère (2026-06-28)
// La mention « Ce lien est personnel » ne doit JAMAIS s'afficher si l'email
// ne contient aucun lien. Source unique = effectiveFooter (consommée par
// renderEmailWithBrand pour tous les templates + renderSmtpTestEmail).
// ---------------------------------------------------------------------------

describe('règle footer-sans-lien — effectiveFooter()', () => {
  const { effectiveFooter } = __testing__
  const RESOLVED = 'RESOLVED_FOOTER'

  it('détecte un lien (mj-button/mj-link/<a>, casse + whitespace) → footer résolu conservé', () => {
    const withHref = (b: string) => effectiveFooter(b, RESOLVED)
    expect(withHref('<mj-button href="{{magic_link}}">ok</mj-button>')).toBe(RESOLVED)
    expect(withHref('<mj-link href="https://x.test">ok</mj-link>')).toBe(RESOLVED)
    expect(withHref('<a href="https://x.test">ok</a>')).toBe(RESOLVED)
    expect(withHref('<mj-button HREF="x">ok</mj-button>')).toBe(RESOLVED)
    expect(withHref('<mj-button href = "x">ok</mj-button>')).toBe(RESOLVED)
  })

  it('corps sans lien → footer no-op (non vide, ≠ résolu)', () => {
    const body = '<mj-section><mj-column><mj-text>aucun lien ici</mj-text></mj-column></mj-section>'
    const footer = effectiveFooter(body, RESOLVED)
    expect(footer).not.toBe(RESOLVED)
    expect(footer.length).toBeGreaterThan(0)
  })
})

describe('règle footer-sans-lien — intégration légère', () => {
  it('un template AVEC lien garde son footer ; renderSmtpTestEmail (sans lien) n’en a pas', async () => {
    installMocks(freshState({ shellParts: PRODUCTION_SHELL_PARTS }))

    // invitation porte un <mj-button href> → footer conservé.
    const withLink = await renderEmail({
      templateKey: 'invitation',
      variables: STUB_VARIABLES,
    })
    expect(withLink.html).toContain('Ce lien est personnel')

    // Email de test SMTP : aucun lien → pas de footer.
    const smtp = await renderSmtpTestEmail()
    expect(smtp.html).not.toContain('Ce lien est personnel')
  })
})
