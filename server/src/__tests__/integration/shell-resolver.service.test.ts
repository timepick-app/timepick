/**
 * Integration tests for shell-resolver.service.ts — cascade event → template
 * → brand → hardcoded fallback for header/footer, special-cased body
 * resolution.
 *
 * Story 26.1 / T3.8.
 */

import { query } from '../../db'
import {
  resolveShellParts,
  ShellResolverError,
  TemplateBodyMissingError,
  HARDCODED_MJ_BODY_ATTRS,
} from '../../services/shell-resolver.service'
import { seedShellPart } from '../../services/shell-parts.service'
import {
  HARDCODED_FOOTER,
  HARDCODED_HEADER_TEXT,
  hardcodedHeaderLogo,
} from '../../services/shell-hardcoded-fallback'
import type { TemplateKey } from '../../services/render-email.service'

const TEST_EVENT_ID = '11111111-2222-3333-4444-555555555555'

const TEMPLATES: TemplateKey[] = [
  'invitation',
  'magic_link_login',
  'account_created',
  'reservation_confirmation',
]

const NO_LOGO_BRAND = { logoUrl: null }
const LOGO_BRAND = { logoUrl: 'https://example.com/logo.png' }

const MJML = {
  brandHeader: '<mj-section><mj-column><mj-text>BRAND HEADER</mj-text></mj-column></mj-section>',
  brandFooter: '<mj-section><mj-column><mj-text>BRAND FOOTER</mj-text></mj-column></mj-section>',
  tplHeader: '<mj-section><mj-column><mj-text>TEMPLATE HEADER</mj-text></mj-column></mj-section>',
  tplFooter: '<mj-section><mj-column><mj-text>TEMPLATE FOOTER</mj-text></mj-column></mj-section>',
  eventHeader: '<mj-section><mj-column><mj-text>EVENT HEADER</mj-text></mj-column></mj-section>',
  eventFooter: '<mj-section><mj-column><mj-text>EVENT FOOTER</mj-text></mj-column></mj-section>',
  ignoredBody: '<mj-section><mj-column><mj-text>IGNORED BODY OVERRIDE</mj-text></mj-column></mj-section>',
}

async function seedTestEvent(): Promise<void> {
  await query(
    `INSERT INTO events (id, name, description)
     VALUES ($1, $2, 'Resolver test event description')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_EVENT_ID, `Resolver test event ${TEST_EVENT_ID}`],
  )
}

async function deleteTestEvent(): Promise<void> {
  await query(`DELETE FROM events WHERE id = $1`, [TEST_EVENT_ID])
}

async function clearInvitationOverride(): Promise<void> {
  await query(`UPDATE events SET invitation_mjml = NULL WHERE id = $1`, [TEST_EVENT_ID])
}

describe('shell-resolver.service', () => {
  beforeAll(async () => {
    await seedTestEvent()
  })

  afterAll(async () => {
    await deleteTestEvent()
  })

  // Wipe avant chaque test (cf. `shell-parts.service.test.ts:beforeEach`) :
  // la migration 012 (plan-5b-defer-A L3-data, 2026-05-26) sème une row
  // brand factory content-wrapper au boot DB ; ce fichier teste la cascade
  // depuis un shell_parts strictement vide pour valider les fallbacks
  // hardcoded sans interférence avec la factory.
  beforeEach(async () => {
    await query('DELETE FROM shell_parts')
  })

  afterEach(async () => {
    await query('DELETE FROM shell_parts')
    await clearInvitationOverride()
  })

  describe('header + footer cascade — per templateKey', () => {
    describe.each(TEMPLATES)('templateKey=%s', (templateKey) => {
      it('hardcoded-only — falls back to HARDCODED_HEADER_TEXT + HARDCODED_FOOTER when no row exists', async () => {
        const resolved = await resolveShellParts({ templateKey, brand: NO_LOGO_BRAND })

        expect(resolved.header).toEqual({ contentMjml: HARDCODED_HEADER_TEXT, origin: 'hardcoded' })
        expect(resolved.footer).toEqual({ contentMjml: HARDCODED_FOOTER, origin: 'hardcoded' })
      })

      it('hardcoded with logo — picks hardcodedHeaderLogo when brand.logoUrl is non-null', async () => {
        const resolved = await resolveShellParts({ templateKey, brand: LOGO_BRAND })

        expect(resolved.header.origin).toBe('hardcoded')
        expect(resolved.header.contentMjml).toBe(hardcodedHeaderLogo(LOGO_BRAND.logoUrl))
      })

      it('brand-only — picks brand row when only brand row exists', async () => {
        await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: MJML.brandHeader })
        await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'footer', contentMjml: MJML.brandFooter })

        const resolved = await resolveShellParts({ templateKey, brand: NO_LOGO_BRAND })

        expect(resolved.header).toEqual({ contentMjml: MJML.brandHeader, origin: 'brand' })
        expect(resolved.footer).toEqual({ contentMjml: MJML.brandFooter, origin: 'brand' })
      })

      it('template-override — template row beats brand row', async () => {
        await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: MJML.brandHeader })
        await seedShellPart({ ownerKind: 'template', ownerId: templateKey, partKind: 'header', contentMjml: MJML.tplHeader })
        await seedShellPart({ ownerKind: 'template', ownerId: templateKey, partKind: 'footer', contentMjml: MJML.tplFooter })

        const resolved = await resolveShellParts({ templateKey, brand: NO_LOGO_BRAND })

        expect(resolved.header).toEqual({ contentMjml: MJML.tplHeader, origin: 'template' })
        expect(resolved.footer).toEqual({ contentMjml: MJML.tplFooter, origin: 'template' })
      })

      it('event-override — event row beats template + brand', async () => {
        await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: MJML.brandHeader })
        await seedShellPart({ ownerKind: 'template', ownerId: templateKey, partKind: 'header', contentMjml: MJML.tplHeader })
        await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'header', contentMjml: MJML.eventHeader })
        await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'footer', contentMjml: MJML.eventFooter })

        const resolved = await resolveShellParts({
          templateKey,
          eventId: TEST_EVENT_ID,
          brand: NO_LOGO_BRAND,
        })

        expect(resolved.header).toEqual({ contentMjml: MJML.eventHeader, origin: 'event' })
        expect(resolved.footer).toEqual({ contentMjml: MJML.eventFooter, origin: 'event' })
      })
    })
  })

  describe('header logo re-coupling — Drawbridge #29', () => {
    // A template header override that baked the brand logo into <mj-image src>
    // (how GrapesJS serialized the resolved logo header). The logo is a brand
    // token, so it must follow brand.logoUrl rather than stay frozen here.
    const BAKED_LOGO_HEADER =
      '<mj-section background-color="#18181b" padding="20px" data-part-kind="header">' +
      '<mj-column><mj-image src="https://cdn.example.com/old-logo.webp" alt="TimePick" width="160px"></mj-image></mj-column>' +
      '</mj-section>'

    it('logoUrl null — overridden header falls back to the TimePick text (the reset bug)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: BAKED_LOGO_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      // Override row still wins the cascade (origin stays 'template' so the UI
      // keeps offering « Réinitialiser l'en-tête commun »)…
      expect(resolved.header.origin).toBe('template')
      // …but the frozen logo is gone — header reads as the TimePick text.
      expect(resolved.header.contentMjml).not.toContain('<mj-image')
      expect(resolved.header.contentMjml).not.toContain('old-logo.webp')
      expect(resolved.header.contentMjml).toContain('>TimePick</mj-text>')
      // Structural override attrs preserved (no blind erase).
      expect(resolved.header.contentMjml).toContain(
        '<mj-section background-color="#18181b" padding="20px" data-part-kind="header">',
      )
    })

    it('logoUrl changed — overridden header tracks the new brand logo (the propagation bug)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: BAKED_LOGO_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: LOGO_BRAND })

      expect(resolved.header.origin).toBe('template')
      expect(resolved.header.contentMjml).toContain(`src="${LOGO_BRAND.logoUrl}"`)
      expect(resolved.header.contentMjml).not.toContain('old-logo.webp')
    })
  })

  describe('cross-templateKey isolation', () => {
    // Plans 3b (2026-05-23) + 5b (2026-05-24) — Sous cascade γ, la propagation
    // template[invitation] s'applique au header ET au mj-body (couverte par
    // les describe « header cascade — promotion » et « mj-body cascade —
    // promotion » ci-dessous). Seul le footer reste strictement isolé par
    // templateKey ; la régression d'isolation footer est vérifiée ici.

    it('footer row on invitation does NOT propagate to other templates (regression check γ)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'footer',
        contentMjml: MJML.tplFooter,
      })

      const inviteResolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })
      const loginResolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(inviteResolved.footer).toEqual({ contentMjml: MJML.tplFooter, origin: 'template' })
      expect(loginResolved.footer).toEqual({ contentMjml: HARDCODED_FOOTER, origin: 'hardcoded' })
    })

    it('event row keyed to a different eventId is ignored', async () => {
      await seedShellPart({
        ownerKind: 'event',
        ownerId: '99999999-9999-9999-9999-999999999999',
        partKind: 'header',
        contentMjml: MJML.eventHeader,
      })

      const resolved = await resolveShellParts({
        templateKey: 'invitation',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      expect(resolved.header.origin).toBe('hardcoded')
    })
  })

  // Plan 3b du 2026-05-23 — cascade γ : pour part_kind='header' uniquement,
  // le row (template, 'invitation', 'header') sert de fallback inter-templates.
  // Cf. la politique de personnalisation de la coque email, section « Promotion
  // de l'en-tête invitation (2026-05-23) ».
  describe('header cascade — promotion template[invitation] fallback (γ)', () => {
    const INVITE_HEADER =
      '<mj-section><mj-column><mj-text>INVITATION HEADER (shared)</mj-text></mj-column></mj-section>'
    const OWN_HEADER =
      '<mj-section><mj-column><mj-text>OWN TEMPLATE HEADER</mj-text></mj-column></mj-section>'
    const EVENT_HEADER =
      '<mj-section><mj-column><mj-text>EVENT-LEVEL HEADER</mj-text></mj-column></mj-section>'

    it('magic_link_login without own header consumes invitation.header', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: INVITE_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: INVITE_HEADER, origin: 'template' })
    })

    it('magic_link_login with own header wins over invitation.header (template-current > template-invitation)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: INVITE_HEADER,
      })
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'magic_link_login',
        partKind: 'header',
        contentMjml: OWN_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: OWN_HEADER, origin: 'template' })
    })

    it('account_created without own header consumes invitation.header', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: INVITE_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'account_created', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: INVITE_HEADER, origin: 'template' })
    })

    it('reservation_confirmation without own header consumes invitation.header', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: INVITE_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'reservation_confirmation', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: INVITE_HEADER, origin: 'template' })
    })

    it('invitation itself consumes its own row — no double-counting', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: INVITE_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: INVITE_HEADER, origin: 'template' })
    })

    it('event override wins over invitation.header for any template', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: INVITE_HEADER,
      })
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'header',
        contentMjml: EVENT_HEADER,
      })

      const resolved = await resolveShellParts({
        templateKey: 'magic_link_login',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      expect(resolved.header).toEqual({ contentMjml: EVENT_HEADER, origin: 'event' })
    })

    it('brand-level header wins when no template-level row exists at all', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: MJML.brandHeader,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: MJML.brandHeader, origin: 'brand' })
    })

    it('invitation.header wins over brand-level header (template-invitation > brand)', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: MJML.brandHeader,
      })
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: INVITE_HEADER,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: INVITE_HEADER, origin: 'template' })
    })

    it('no row anywhere — hardcoded fallback preserved (regression check)', async () => {
      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.header).toEqual({ contentMjml: HARDCODED_HEADER_TEXT, origin: 'hardcoded' })
    })
  })

  describe('body resolution', () => {
    it('returns origin=template when templateKey is non-invitation', async () => {
      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })
      expect(resolved.body.origin).toBe('template')
      expect(resolved.body.contentMjml.length).toBeGreaterThan(0)
    })

    it('returns origin=template for invitation when no eventId is provided', async () => {
      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })
      expect(resolved.body.origin).toBe('template')
    })

    it('returns origin=template for invitation when events.invitation_mjml is NULL', async () => {
      const resolved = await resolveShellParts({
        templateKey: 'invitation',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })
      expect(resolved.body.origin).toBe('template')
    })

    it('returns origin=event when events.invitation_mjml is non-null', async () => {
      const customBody = '<mj-section><mj-column><mj-text>EVENT-SPECIFIC BODY</mj-text></mj-column></mj-section>'
      await query(`UPDATE events SET invitation_mjml = $1 WHERE id = $2`, [customBody, TEST_EVENT_ID])

      const resolved = await resolveShellParts({
        templateKey: 'invitation',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      expect(resolved.body).toEqual({ contentMjml: customBody, origin: 'event' })
    })

    it('IGNORES shell_parts rows with part_kind=body (gel volontaire 26-1)', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'body',
        contentMjml: MJML.ignoredBody,
      })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      // Body origin remains 'template' (from email_templates), NOT 'brand'.
      expect(resolved.body.origin).toBe('template')
      expect(resolved.body.contentMjml).not.toContain('IGNORED BODY OVERRIDE')
    })
  })

  // ---------------------------------------------------------------------------
  // Plan 1 du 2026-05-22 — cascade mj-body (4 origins) + extraction d'attrs
  // ---------------------------------------------------------------------------

  describe('mj-body cascade (Plan 1 du 2026-05-22)', () => {
    const HARDCODED = HARDCODED_MJ_BODY_ATTRS
    const BRAND_ATTRS = `<mj-body background-color="#fafafa" padding-top="10px" padding-bottom="10px"></mj-body>`
    const TEMPLATE_ATTRS = `<mj-body background-color="#eeeeee" padding-top="20px" padding-bottom="20px"></mj-body>`
    const EVENT_ATTRS = `<mj-body background-color="#dddddd" padding-top="30px" padding-bottom="30px"></mj-body>`

    it('returns hardcoded defaults when no mj-body row exists at any level', async () => {
      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })
      expect(resolved.mjBody).toEqual({ attrs: HARDCODED, origin: 'hardcoded' })
    })

    it('picks the brand row when only brand-level mj-body exists', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'mj-body', contentMjml: BRAND_ATTRS })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody).toEqual({
        attrs: { backgroundColor: '#fafafa', paddingTop: '10px', paddingBottom: '10px' },
        origin: 'brand',
      })
    })

    it('template row beats brand row', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'mj-body', contentMjml: BRAND_ATTRS })
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'mj-body', contentMjml: TEMPLATE_ATTRS })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody).toEqual({
        attrs: { backgroundColor: '#eeeeee', paddingTop: '20px', paddingBottom: '20px' },
        origin: 'template',
      })
    })

    it('event row beats template + brand', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'mj-body', contentMjml: BRAND_ATTRS })
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'mj-body', contentMjml: TEMPLATE_ATTRS })
      await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'mj-body', contentMjml: EVENT_ATTRS })

      const resolved = await resolveShellParts({
        templateKey: 'invitation',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      expect(resolved.mjBody).toEqual({
        attrs: { backgroundColor: '#dddddd', paddingTop: '30px', paddingBottom: '30px' },
        origin: 'event',
      })
    })

    it('event row keyed to a different eventId is ignored (cascade isolation)', async () => {
      await seedShellPart({
        ownerKind: 'event',
        ownerId: '99999999-9999-9999-9999-999999999999',
        partKind: 'mj-body',
        contentMjml: EVENT_ATTRS,
      })

      const resolved = await resolveShellParts({
        templateKey: 'invitation',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      // The event row does NOT belong to TEST_EVENT_ID — cascade falls through to hardcoded.
      expect(resolved.mjBody.origin).toBe('hardcoded')
      expect(resolved.mjBody.attrs).toEqual(HARDCODED)
    })

    it('partial attrs row fills missing values with hardcoded defaults', async () => {
      // Cas réaliste : admin n'a touché que le background-color.
      const partial = `<mj-body background-color="#abcdef"></mj-body>`
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'mj-body', contentMjml: partial })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody.origin).toBe('template')
      expect(resolved.mjBody.attrs.backgroundColor).toBe('#abcdef')
      // padding non-précisés retombent sur le filet hardcodé
      expect(resolved.mjBody.attrs.paddingTop).toBe('0')
      expect(resolved.mjBody.attrs.paddingBottom).toBe('0')
    })

    // Note Plan 5b (2026-05-24) — l'ancien test « cross-templateKey isolation
    // — mj-body for invitation does not leak to magic_link_login » a été
    // retiré : la promotion γ étend désormais la propagation au mj-body. Le
    // comportement inverse est asserté dans le describe « mj-body cascade —
    // promotion template[invitation] fallback (γ) » ci-dessous.
  })

  // Plan 5b du 2026-05-24 — cascade γ étendue : pour part_kind='mj-body', le
  // row (template, 'invitation', 'mj-body') sert également de fallback inter-
  // templates (symétrique à la promotion header de Plan 3b). Cf. la politique
  // de personnalisation de la coque email, section « Promotion de l'en-tête
  // et du mj-body invitation ». Le footer reste strictement isolé (régression
  // vérifiée plus haut dans `describe('cross-templateKey isolation')`).
  describe('mj-body cascade — promotion template[invitation] fallback (γ)', () => {
    const INVITE_MJBODY =
      '<mj-body background-color="#abcdef" padding-top="40px" padding-bottom="40px"></mj-body>'
    const OWN_MJBODY =
      '<mj-body background-color="#fedcba" padding-top="10px" padding-bottom="10px"></mj-body>'
    const EVENT_MJBODY =
      '<mj-body background-color="#123456" padding-top="60px" padding-bottom="60px"></mj-body>'
    const BRAND_MJBODY =
      '<mj-body background-color="#111111" padding-top="20px" padding-bottom="20px"></mj-body>'

    it('magic_link_login without own mj-body consumes invitation.mj-body', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: INVITE_MJBODY,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody.origin).toBe('template')
      expect(resolved.mjBody.attrs).toEqual({
        backgroundColor: '#abcdef',
        paddingTop: '40px',
        paddingBottom: '40px',
      })
    })

    it('account_created without own mj-body consumes invitation.mj-body', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: INVITE_MJBODY,
      })

      const resolved = await resolveShellParts({ templateKey: 'account_created', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody.origin).toBe('template')
      expect(resolved.mjBody.attrs.paddingTop).toBe('40px')
    })

    it('reservation_confirmation without own mj-body consumes invitation.mj-body', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: INVITE_MJBODY,
      })

      const resolved = await resolveShellParts({ templateKey: 'reservation_confirmation', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody.origin).toBe('template')
      expect(resolved.mjBody.attrs.paddingTop).toBe('40px')
    })

    it('magic_link_login with own mj-body wins over invitation.mj-body (template-current > template-invitation)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: INVITE_MJBODY,
      })
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'magic_link_login',
        partKind: 'mj-body',
        contentMjml: OWN_MJBODY,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody.origin).toBe('template')
      expect(resolved.mjBody.attrs.paddingTop).toBe('10px')
    })

    it('event mj-body override wins over invitation.mj-body for any template', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: INVITE_MJBODY,
      })
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'mj-body',
        contentMjml: EVENT_MJBODY,
      })

      const resolved = await resolveShellParts({
        templateKey: 'magic_link_login',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      expect(resolved.mjBody.origin).toBe('event')
      expect(resolved.mjBody.attrs.paddingTop).toBe('60px')
    })

    it('invitation.mj-body wins over brand-level mj-body (template-invitation > brand)', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'mj-body',
        contentMjml: BRAND_MJBODY,
      })
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: INVITE_MJBODY,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      // Couvre plan-4b-defer-B (CLOSED 2026-05-24 par Plan 5b) : la branche
      // owner_kind='brand' du résolveur mj-body était jusqu'ici reachable
      // uniquement via raw SQL ; ce cas exerce explicitement l'ordre 4-bucket
      // sur mj-body et garantit que brand reste sous template-invitation.
      expect(resolved.mjBody.origin).toBe('template')
      expect(resolved.mjBody.attrs.paddingTop).toBe('40px')
    })

    it('invitation itself consumes its own mj-body — no double-counting', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: INVITE_MJBODY,
      })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody.origin).toBe('template')
      expect(resolved.mjBody.attrs.paddingTop).toBe('40px')
    })

    // Review pass 2026-05-24 (BH I6) — l'asymétrie de la promotion γ est
    // strictement orientée invitation → templates système. La direction
    // inverse (un template système qui aurait sa propre surcharge mj-body) ne
    // doit JAMAIS remonter vers le gabarit d'invitation ni vers d'autres
    // templates système.
    it('mj-body row on magic_link_login does NOT propagate to invitation (inverse direction)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'magic_link_login',
        partKind: 'mj-body',
        contentMjml: OWN_MJBODY,
      })

      const inviteResolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })
      const recoveryResolved = await resolveShellParts({ templateKey: 'account_created', brand: NO_LOGO_BRAND })

      // Pour invitation et account_created, aucun row template[currentKey]
      // ni template[invitation] n'existe — la cascade tombe sur hardcoded (la
      // surcharge magic_link_login est invisible cross-templateKey).
      expect(inviteResolved.mjBody.origin).toBe('hardcoded')
      expect(recoveryResolved.mjBody.origin).toBe('hardcoded')
    })

    // Review pass 2026-05-24 (EC7) — couverture explicite de la branche
    // brand-only mj-body pour un templateKey système quand AUCUN row
    // template[currentKey] ni template[invitation] n'existe : la 4e bucket
    // (brand) doit primer.
    it('brand-level mj-body wins for magic_link_login when no template row exists at any level', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'mj-body',
        contentMjml: BRAND_MJBODY,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.mjBody.origin).toBe('brand')
      expect(resolved.mjBody.attrs.paddingTop).toBe('20px')
    })

    // Review pass 2026-05-24 (EC8) — couverture explicite de la branche
    // event-only mj-body sur templateKey système quand AUCUN row
    // template[invitation].mj-body n'existe : le row event prime directement
    // sur le filet hardcoded, sans s'appuyer sur la promotion γ.
    it('event mj-body alone wins for magic_link_login when no invitation row exists', async () => {
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'mj-body',
        contentMjml: EVENT_MJBODY,
      })

      const resolved = await resolveShellParts({
        templateKey: 'magic_link_login',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      expect(resolved.mjBody.origin).toBe('event')
      expect(resolved.mjBody.attrs.paddingTop).toBe('60px')
    })
  })

  // ---------------------------------------------------------------------------
  // Plan-5b-defer-A L2 (2026-05-25) — cascade content-wrapper (promotion γ).
  // Cf. la politique de personnalisation de la coque email, § « Le content-wrapper transversal (hors-bloc) ».
  // Pattern miroir de la cascade γ header/mj-body, mais le filet hardcoded
  // renvoie `null` (« aucun encadrement par défaut »).
  // ---------------------------------------------------------------------------

  describe('content-wrapper cascade — promotion γ template[invitation] fallback', () => {
    const INVITE_WRAPPER =
      '<mj-section background-color="#f9f9f9" padding="20px" border-radius="8px"></mj-section>'
    const OWN_WRAPPER =
      '<mj-section background-color="#eeeeee" padding="10px"></mj-section>'
    const EVENT_WRAPPER =
      '<mj-section background-color="#dddddd" padding="30px"></mj-section>'
    const BRAND_WRAPPER =
      '<mj-section background-color="#fafafa" padding="15px"></mj-section>'

    it('returns null when no content-wrapper row exists at any level (« aucun encadrement par défaut »)', async () => {
      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })
      expect(resolved.contentWrapper).toBeNull()
    })

    it('returns null on system templates too when cascade is empty', async () => {
      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })
      expect(resolved.contentWrapper).toBeNull()
    })

    it('returns null on account_created and reservation_confirmation when cascade is empty', async () => {
      const recovery = await resolveShellParts({ templateKey: 'account_created', brand: NO_LOGO_BRAND })
      const confirmation = await resolveShellParts({ templateKey: 'reservation_confirmation', brand: NO_LOGO_BRAND })
      expect(recovery.contentWrapper).toBeNull()
      expect(confirmation.contentWrapper).toBeNull()
    })

    it('picks the brand row when only brand-level content-wrapper exists', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'content-wrapper', contentMjml: BRAND_WRAPPER })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.contentWrapper).toEqual({ contentMjml: BRAND_WRAPPER, origin: 'brand' })
    })

    it('magic_link_login without own row consumes invitation.content-wrapper (template-invitation bucket)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
        contentMjml: INVITE_WRAPPER,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.contentWrapper).toEqual({ contentMjml: INVITE_WRAPPER, origin: 'template' })
    })

    it('account_created and reservation_confirmation also consume invitation.content-wrapper', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
        contentMjml: INVITE_WRAPPER,
      })

      const recovery = await resolveShellParts({ templateKey: 'account_created', brand: NO_LOGO_BRAND })
      const confirmation = await resolveShellParts({ templateKey: 'reservation_confirmation', brand: NO_LOGO_BRAND })

      expect(recovery.contentWrapper).toEqual({ contentMjml: INVITE_WRAPPER, origin: 'template' })
      expect(confirmation.contentWrapper).toEqual({ contentMjml: INVITE_WRAPPER, origin: 'template' })
    })

    it('magic_link_login with own row wins over invitation.content-wrapper (template-current > template-invitation)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
        contentMjml: INVITE_WRAPPER,
      })
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'magic_link_login',
        partKind: 'content-wrapper',
        contentMjml: OWN_WRAPPER,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.contentWrapper).toEqual({ contentMjml: OWN_WRAPPER, origin: 'template' })
    })

    it('invitation itself consumes its own row — no double-counting', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
        contentMjml: INVITE_WRAPPER,
      })

      const resolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })

      expect(resolved.contentWrapper).toEqual({ contentMjml: INVITE_WRAPPER, origin: 'template' })
    })

    it('event override wins over invitation.content-wrapper for any template (event > template-invitation)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
        contentMjml: INVITE_WRAPPER,
      })
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'content-wrapper',
        contentMjml: EVENT_WRAPPER,
      })

      const resolved = await resolveShellParts({
        templateKey: 'magic_link_login',
        eventId: TEST_EVENT_ID,
        brand: NO_LOGO_BRAND,
      })

      expect(resolved.contentWrapper).toEqual({ contentMjml: EVENT_WRAPPER, origin: 'event' })
    })

    it('invitation.content-wrapper wins over brand row (template-invitation > brand)', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'content-wrapper', contentMjml: BRAND_WRAPPER })
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
        contentMjml: INVITE_WRAPPER,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.contentWrapper).toEqual({ contentMjml: INVITE_WRAPPER, origin: 'template' })
    })

    // Asymétrie γ : aucune fuite cross-template depuis une surcharge système.
    it('content-wrapper row on magic_link_login does NOT propagate to invitation (inverse direction)', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'magic_link_login',
        partKind: 'content-wrapper',
        contentMjml: OWN_WRAPPER,
      })

      const inviteResolved = await resolveShellParts({ templateKey: 'invitation', brand: NO_LOGO_BRAND })
      const recoveryResolved = await resolveShellParts({ templateKey: 'account_created', brand: NO_LOGO_BRAND })

      expect(inviteResolved.contentWrapper).toBeNull()
      expect(recoveryResolved.contentWrapper).toBeNull()
    })

    // Cross-axe : aucune fuite content-wrapper vers d'autres part_kinds (et
    // inversement). Le pick par part_kind reste hermétique.
    it('does not leak across part_kinds: an invitation content-wrapper row does not affect header/footer/mjBody', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
        contentMjml: INVITE_WRAPPER,
      })

      const resolved = await resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND })

      expect(resolved.contentWrapper).toEqual({ contentMjml: INVITE_WRAPPER, origin: 'template' })
      expect(resolved.header.origin).toBe('hardcoded')
      expect(resolved.footer.origin).toBe('hardcoded')
      expect(resolved.mjBody.origin).toBe('hardcoded')
    })
  })

  describe('error cases', () => {
    it('throws ShellResolverError for an unknown templateKey', async () => {
      await expect(
        resolveShellParts({
          // @ts-expect-error — testing rejection of invalid templateKey at the resolver boundary
          templateKey: 'newsletter',
          brand: NO_LOGO_BRAND,
        }),
      ).rejects.toThrow(ShellResolverError)
    })

    it('throws TemplateBodyMissingError if email_templates row is absent', async () => {
      // Temporarily remove the row to simulate a corrupted DB; restore after the assertion.
      const { rows: backup } = await query<{ body_mjml: string; default_body_mjml: string }>(
        `SELECT body_mjml, default_body_mjml FROM email_templates WHERE template_key = 'magic_link_login'`,
      )
      await query(`DELETE FROM email_templates WHERE template_key = 'magic_link_login'`)
      try {
        await expect(
          resolveShellParts({ templateKey: 'magic_link_login', brand: NO_LOGO_BRAND }),
        ).rejects.toThrow(TemplateBodyMissingError)
      } finally {
        await query(
          `INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
           VALUES ('magic_link_login', $1, $2)
           ON CONFLICT (template_key) DO UPDATE SET body_mjml = EXCLUDED.body_mjml, default_body_mjml = EXCLUDED.default_body_mjml`,
          [backup[0].body_mjml, backup[0].default_body_mjml],
        )
      }
    })
  })
})
