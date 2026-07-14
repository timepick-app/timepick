/**
 * Multi-cascade email HTML output — byte-level snapshots that exercise the
 * shell_parts cascade (event > template > brand > hardcoded). Sibling to
 * `email-html-output.test.ts` (which baselines the empty-table case).
 *
 * Story 26.1 / AC6 + T8 — 5 snapshots:
 *   1. invitation + brand header   → origin=brand
 *   2. invitation + template header→ origin=template
 *   3. invitation + event header   → origin=event
 *   4. invitation + full cascade (event header + brand footer; body row
 *      written but ignored per AC3 gel volontaire)
 *   5. magic_link_login + brand footer → footer cascade verified across
 *      a different templateKey
 *
 * Discrimination strategy: each seeded `content_mjml` carries a unique
 * marker (e.g. "CASCADE-BRAND-HEADER") that surfaces in the compiled HTML.
 * The marker check is a fast assertion that proves the resolver picked
 * the right row; the snapshot is the byte-level audit.
 */

jest.mock('isomorphic-dompurify')

import { query } from '../../db'
import { renderEmail } from '../../services/render-email.service'
import { seedShellPart } from '../../services/shell-parts.service'

const EVENT_ID = '44444444-4444-4444-4444-444444444444'

const VARS_INVITE = {
  event_name: 'Soirée Annuelle 2026',
  event_description: 'Notre événement phare',
  magic_link: 'https://timepick.example.com/event/abc?token=invite789',
  expiration_date: '31 décembre 2026 à 18h00',
}

const VARS_LOGIN = {
  magic_link: 'https://timepick.example.com/auth/verify?token=user789xyz',
  expiration_date: '31 décembre 2026 à 18h00',
  is_admin: 'false',
}

const MARKER_BRAND_HEADER = 'CASCADE-BRAND-HEADER'
const MARKER_TPL_HEADER = 'CASCADE-TEMPLATE-HEADER'
const MARKER_EVT_HEADER = 'CASCADE-EVENT-HEADER'
const MARKER_BRAND_FOOTER = 'CASCADE-BRAND-FOOTER'
const MARKER_TPL_BODY_IGNORED = 'CASCADE-TPL-BODY-IGNORED'
const CONTENT_WRAPPER_BG = '#f9f9f9'

function mkHeader(marker: string): string {
  return `<mj-section background-color="#18181b" padding="20px"><mj-column>
         <mj-text color="#ffffff" font-size="22px" font-weight="bold" align="center">${marker}</mj-text>
       </mj-column></mj-section>`
}

function mkFooter(marker: string): string {
  return `<mj-section padding="20px 20px 0 20px"><mj-column>
        <mj-divider border-color="#dddddd" border-width="1px" padding="0"></mj-divider>
        <mj-text color="#999999" font-size="12px" padding-top="12px">${marker}</mj-text>
      </mj-column></mj-section>`
}

describe('renderEmail() — HTML cascade (Story 26.1 / Epic 26.S1)', () => {
  beforeAll(async () => {
    await query(
      `INSERT INTO events (id, name, description)
       VALUES ($1, $2, 'cascade test event')
       ON CONFLICT (id) DO NOTHING`,
      [EVENT_ID, `cascade-test-${EVENT_ID}`],
    )
  })

  afterAll(async () => {
    await query(`DELETE FROM events WHERE id = $1`, [EVENT_ID])
    // Pas de re-seed factory ici : les autres fichiers de tests intégration
    // (shell-parts.service, shell-resolver.service, etc.) attendent un
    // shell_parts EMPTY au start. Les 2 fichiers qui dépendent de la row
    // factory (`email-html-output.test.ts`, `email-visual-baselines.test.ts`)
    // ont leur propre `beforeAll` qui upsert la row.
  })

  // Isolation forte : chaque test démarre avec shell_parts vide. Nécessaire
  // pour que les snapshots soient déterministes indépendamment de l'ordre
  // d'exécution des fichiers Jest. La row brand factory content-wrapper
  // #f9f9f9 semée par migration 012 (plan-5b-defer-A L3-data, 2026-05-26)
  // est intentionnellement absente de ces tests : la suite cascade
  // valide le routage header/footer/body en isolation, pas l'état
  // post-migration de production.
  beforeEach(async () => {
    await query('DELETE FROM shell_parts')
  })

  afterEach(async () => {
    await query('DELETE FROM shell_parts')
  })

  it('1. invitation + shell_parts(brand, header) — origin brand', async () => {
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'header',
      contentMjml: mkHeader(MARKER_BRAND_HEADER),
    })

    const { html } = await renderEmail({ templateKey: 'invitation', variables: VARS_INVITE })

    expect(html).toContain(MARKER_BRAND_HEADER)
    expect(html).toMatchSnapshot()
  })

  it('2. invitation + shell_parts(template, invitation, header) — origin template', async () => {
    await seedShellPart({
      ownerKind: 'template',
      ownerId: 'invitation',
      partKind: 'header',
      contentMjml: mkHeader(MARKER_TPL_HEADER),
    })

    const { html } = await renderEmail({ templateKey: 'invitation', variables: VARS_INVITE })

    expect(html).toContain(MARKER_TPL_HEADER)
    expect(html).not.toContain(MARKER_BRAND_HEADER)
    expect(html).toMatchSnapshot()
  })

  it('3. invitation + shell_parts(event, UUID, header) — origin event', async () => {
    await seedShellPart({
      ownerKind: 'event',
      ownerId: EVENT_ID,
      partKind: 'header',
      contentMjml: mkHeader(MARKER_EVT_HEADER),
    })

    const { html } = await renderEmail({
      templateKey: 'invitation',
      eventId: EVENT_ID,
      variables: VARS_INVITE,
    })

    expect(html).toContain(MARKER_EVT_HEADER)
    expect(html).toMatchSnapshot()
  })

  it('4. invitation + full cascade (event header + brand footer + ignored brand body row)', async () => {
    await seedShellPart({
      ownerKind: 'event',
      ownerId: EVENT_ID,
      partKind: 'header',
      contentMjml: mkHeader(MARKER_EVT_HEADER),
    })
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'footer',
      contentMjml: mkFooter(MARKER_BRAND_FOOTER),
    })
    // The body cascade is frozen in 26-1: this row IS written (forward-compat
    // for S2/S3) but the resolver MUST ignore it. The compiled HTML must NOT
    // include the marker — body still comes from email_templates.body_mjml.
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'body',
      contentMjml: `<mj-section><mj-column><mj-text>${MARKER_TPL_BODY_IGNORED}</mj-text></mj-column></mj-section>`,
    })

    const { html } = await renderEmail({
      templateKey: 'invitation',
      eventId: EVENT_ID,
      variables: VARS_INVITE,
    })

    expect(html).toContain(MARKER_EVT_HEADER)
    expect(html).toContain(MARKER_BRAND_FOOTER)
    expect(html).not.toContain(MARKER_TPL_BODY_IGNORED)
    expect(html).toMatchSnapshot()
  })

  it('5. magic_link_login + shell_parts(brand, footer) — footer cascade across templateKey', async () => {
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'footer',
      contentMjml: mkFooter(MARKER_BRAND_FOOTER),
    })

    const { html } = await renderEmail({ templateKey: 'magic_link_login', variables: VARS_LOGIN })

    expect(html).toContain(MARKER_BRAND_FOOTER)
    expect(html).toMatchSnapshot()
  })

  // ---------------------------------------------------------------------------
  // Plan-5b-defer-A L3 (2026-05-25) — ordre des 3 wrappers consécutifs dans
  // <mj-body>. Le content-wrapper s'intercale entre le wrapper header
  // padding-top (Plan 4b) et le wrapper footer padding-bottom. Aucune
  // imbrication, juste 3 frères dans <mj-body>.
  // ---------------------------------------------------------------------------
  it('6. ordre HTML : content-wrapper entre header padding-top et footer padding-bottom (3 frères)', async () => {
    // Row mj-body avec padding-top/bottom → wrappers header + footer émis.
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'mj-body',
      contentMjml: '<mj-body padding-top="40px" padding-bottom="20px"></mj-body>',
    })
    // Row header marker + footer marker pour discrimination DOM.
    await seedShellPart({
      ownerKind: 'event',
      ownerId: EVENT_ID,
      partKind: 'header',
      contentMjml: mkHeader(MARKER_EVT_HEADER),
    })
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'footer',
      contentMjml: mkFooter(MARKER_BRAND_FOOTER),
    })
    // Row content-wrapper avec bg unique pour discrimination.
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'content-wrapper',
      contentMjml: `<mj-section background-color="${CONTENT_WRAPPER_BG}"></mj-section>`,
    })

    const { html } = await renderEmail({
      templateKey: 'invitation',
      eventId: EVENT_ID,
      variables: VARS_INVITE,
    })

    // Les 3 markers/signatures apparaissent tous dans le HTML compilé.
    expect(html).toContain(MARKER_EVT_HEADER)
    expect(html).toContain(MARKER_BRAND_FOOTER)
    // Le content-wrapper produit un <table bgcolor="#f9f9f9"> ou un inline
    // `background:#f9f9f9` dans le HTML compilé.
    const contentWrapperBgRe = new RegExp(
      `(?:bgcolor\\s*=\\s*"${CONTENT_WRAPPER_BG}"|background(?:-color)?\\s*:\\s*${CONTENT_WRAPPER_BG})`,
      'i',
    )
    expect(contentWrapperBgRe.test(html)).toBe(true)

    // Assertion d'ordre — utilise la première occurrence de chaque signature.
    const headerIdx = html.indexOf(MARKER_EVT_HEADER)
    const contentMatch = contentWrapperBgRe.exec(html)
    expect(contentMatch).not.toBeNull()
    const contentIdx = contentMatch?.index ?? -1
    const footerIdx = html.indexOf(MARKER_BRAND_FOOTER)

    expect(headerIdx).toBeGreaterThanOrEqual(0)
    expect(contentIdx).toBeGreaterThanOrEqual(0)
    expect(footerIdx).toBeGreaterThanOrEqual(0)
    expect(headerIdx).toBeLessThan(contentIdx)
    expect(contentIdx).toBeLessThan(footerIdx)
  })
})
