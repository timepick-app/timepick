/**
 * Email HTML output — strict regression guard (Story 26-0 / Epic 26.S0).
 *
 * 5 byte-level snapshots of renderEmail() output across the 4 templateKeys
 * currently wired through buildShell + magic_link_login's admin/user variant.
 *
 * Three layers of protection, intentionally distinct:
 *   1. Jest snapshots (AC2)         — byte-level audit; any drift in mjml/
 *                                     buildShell/sanitizer output fails.
 *   2. Cheerio structural assertions (AC3) — semantic invariants that
 *                                     survive cosmetic compiler changes.
 *   3. Parity with 25-4 baselines (AC6) — guards against drift between this
 *                                     suite and the post-E4 reference HTML
 *                                     written by email-visual-baselines.test.ts.
 *
 * Runs against the real timepick_test DB (globalSetup.js applied migration
 * 006 with factory seeds + brand singleton). DOMPurify is mocked via the
 * project-wide auto-mock at src/__mocks__/isomorphic-dompurify.ts — without
 * it ts-jest cannot import the @exodus/bytes ESM dependency.
 *
 * Sample variables mirror Story 25-4's email-visual-baselines.test.ts so
 * that the renderEmail() output is byte-identical to the post-e4 reference
 * HTML on disk (AC6 by construction).
 */

jest.mock('isomorphic-dompurify')

import fs from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'
import { query } from '../../db'
import { renderEmail, renderSetupAdminEmail, type TemplateKey } from '../../services/render-email.service'
import {
  BRAND_FACTORY_CONTENT_WRAPPER_MJML,
  INVITATION_FACTORY_HEADER_MJML,
  INVITATION_FACTORY_CONTENT_WRAPPER_MJML,
  INVITATION_FACTORY_MJBODY_MJML,
  seedShellPart,
} from '../../services/shell-parts.service'
import type { VariablesPayload } from '../../services/mjml-compile.service'

// ---------------------------------------------------------------------------
// Deterministic sample variables (same constants as Story 25-4 baselines)
// ---------------------------------------------------------------------------

const ADMIN_LINK = 'https://timepick.example.com/auth/verify?token=abc123def456&ctx=admin'
const USER_LINK = 'https://timepick.example.com/auth/verify?token=user789xyz'
const EVENT_LINK = 'https://timepick.example.com/event/abc?token=invite789'
const CALENDAR_LINK = 'https://timepick.example.com/events/abc'
const EXPIRATION = '31 décembre 2026 à 18h00'
const SLOT_DATE = '15 juin 2026'
const SLOT_TIME = '14h00 → 15h00'
const EVENT_NAME = 'Soirée Annuelle 2026'
const EVENT_DESC = 'Notre événement phare'
const GREETING = 'Bonjour Jean,'

interface BaselineCase {
  label: string
  baselineFile: string
  templateKey: TemplateKey
  eventId?: string
  variables: VariablesPayload
}

const BASELINES: ReadonlyArray<BaselineCase> = [
  {
    label: 'invitation — brand-only (no event override)',
    baselineFile: 'email-invitation-post-e4.html',
    templateKey: 'invitation',
    variables: {
      event_name: EVENT_NAME,
      event_description: EVENT_DESC,
      magic_link: EVENT_LINK,
      expiration_date: EXPIRATION,
      user_first_name: 'Jean',
    },
  },
  {
    label: 'magic_link_login — admin variant (is_admin=true)',
    baselineFile: 'email-magic_link_login-admin-post-e4.html',
    templateKey: 'magic_link_login',
    variables: {
      magic_link: ADMIN_LINK,
      expiration_date: EXPIRATION,
      is_admin: 'true',
      user_first_name: 'Jean',
    },
  },
  {
    label: 'magic_link_login — user variant (is_admin=false)',
    baselineFile: 'email-magic_link_login-user-post-e4.html',
    templateKey: 'magic_link_login',
    variables: {
      magic_link: USER_LINK,
      expiration_date: EXPIRATION,
      is_admin: 'false',
      user_first_name: 'Jean',
    },
  },
  {
    label: 'reservation_confirmation',
    baselineFile: 'email-reservation_confirmation-post-e4.html',
    templateKey: 'reservation_confirmation',
    variables: {
      event_name: EVENT_NAME,
      slot_date: SLOT_DATE,
      slot_time: SLOT_TIME,
      calendar_url: CALENDAR_LINK,
      user_first_name: 'Jean',
    },
  },
  // Plan 5b defer-A L3-data-F (2026-05-26) — 5ᵉ templateKey ajouté par
  // migration 013. Variables alignées sur sendSlotCancellationEmail
  // (user_first_name per-recipient, motif vide pour la baseline).
  {
    label: 'cancellation_confirmation',
    baselineFile: 'email-cancellation_confirmation-post-e4.html',
    templateKey: 'cancellation_confirmation',
    variables: {
      event_name: EVENT_NAME,
      user_first_name: 'Jean',
      slot_date: SLOT_DATE,
      slot_time: SLOT_TIME,
      cancellation_reason: '',
      calendar_url: CALENDAR_LINK,
    },
  },
]

const POST_E4_DIR = path.resolve(
  __dirname,
  '../fixtures/email-baselines/post-e4',
)

const HEADER_BLACK = '#18181b'
// Brand chrome = brand black #18181b reaching the rendered DOM via a `style`
// declaration that is either a background OR a border — NOT a text `color:`
// (the dark header band became, post migration 018, a white card with a
// #18181b border; the border is the universal chrome signal on every template,
// while the button background is template-dependent — cancellation a désormais un CTA `{{calendar_url}}`).
const HEADER_BG_RE = new RegExp(
  `(?:background(?:-color)?|border[a-z-]*)\\s*:[^;"]*${HEADER_BLACK}`,
  'i',
)
const FORBIDDEN_TAGS = ['script', 'iframe', 'object', 'embed'] as const

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderEmail() — HTML compilé (Story 26-0 / Epic 26.S0)', () => {
  // Garantit la présence de la row brand factory content-wrapper #f9f9f9
  // semée par migration 012 (plan-5b-defer-A L3-data, 2026-05-26) au start
  // de ce fichier. Les fichiers de tests `__tests__/integration/` qui font
  // `DELETE FROM shell_parts` à un grain plus large que la migration-state
  // (audit grep `DELETE FROM shell_parts` : `email-html-output-cascade`,
  // `editor-context`, `render-email-healthcheck`, `shell-resolver.service`,
  // `shell-parts.service`, `shell-parts-delete`, `shell-parts-cleanup`)
  // peuvent s'exécuter avant ce fichier OU laisser la table vide en cas
  // d'échec intermédiaire. L'upsert idempotent restaure l'état post-migration
  // nécessaire à AC2, AC6 et AC L3-data. `beforeAll` (plutôt que `beforeEach`)
  // évite la pression sur le pool PG (`maxWorkers=1` + 26 tests/fichier =
  // 26 DB ops superflues qui exhauster max_connections en cas d'idle hangs).
  // L'`afterEach` du bloc AC L3 ci-dessous est par ailleurs restreint aux
  // rows seedées par ses tests, préservant la row factory intra-fichier.
  beforeAll(async () => {
    // Coque commune « carte » : modèle d'usine depuis migration 018. On la sème
    // explicitement (idempotent) pour que les snapshots AC2 et les baselines AC6
    // reflètent l'état d'usine de façon déterministe, indépendamment de l'ordre
    // Jest (d'autres suites font `DELETE FROM shell_parts` à grain large).
    await seedShellPart({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'content-wrapper',
      contentMjml: BRAND_FACTORY_CONTENT_WRAPPER_MJML,
    })
    await seedShellPart({
      ownerKind: 'template',
      ownerId: 'invitation',
      partKind: 'header',
      contentMjml: INVITATION_FACTORY_HEADER_MJML,
    })
    await seedShellPart({
      ownerKind: 'template',
      ownerId: 'invitation',
      partKind: 'content-wrapper',
      contentMjml: INVITATION_FACTORY_CONTENT_WRAPPER_MJML,
    })
    await seedShellPart({
      ownerKind: 'template',
      ownerId: 'invitation',
      partKind: 'mj-body',
      contentMjml: INVITATION_FACTORY_MJBODY_MJML,
    })
  })

  // Hygiène cross-fichier : nettoyer la row brand factory à la sortie afin
  // que les fichiers de tests qui suivent (notamment `shell-parts.service`
  // qui asserte un état shell_parts vide en début de test) n'héritent pas
  // d'une row inattendue. Ce fichier devient self-contained vis-à-vis de
  // shell_parts.
  afterAll(async () => {
    await query(
      `DELETE FROM shell_parts
         WHERE (owner_kind = 'brand' AND owner_id = '1' AND part_kind = 'content-wrapper')
            OR (owner_kind = 'template' AND owner_id = 'invitation')`,
    )
  })

  describe('AC2 — Snapshots byte-level', () => {
    // 5 snapshots, one per BaselineCase. Snapshots are stored next to this
    // file in __snapshots__/email-html-output.test.ts.snap (Jest convention).
    // Any drift in mjml/buildShell/sanitizer output fails immediately.
    test.each(BASELINES.map((b) => [b.label, b] as const))(
      'produit un HTML déterministe pour: %s',
      async (_label, baseline) => {
        const { html } = await renderEmail({
          templateKey: baseline.templateKey,
          eventId: baseline.eventId,
          variables: baseline.variables,
        })
        expect(html).toMatchSnapshot()
      },
    )

    it('produit le même HTML sur 3 exécutions consécutives (déterminisme strict)', async () => {
      const baseline = BASELINES.find((b) => b.templateKey === 'invitation')
      if (!baseline) throw new Error('invitation baseline missing from BASELINES')
      const r1 = await renderEmail({
        templateKey: baseline.templateKey,
        variables: baseline.variables,
      })
      const r2 = await renderEmail({
        templateKey: baseline.templateKey,
        variables: baseline.variables,
      })
      const r3 = await renderEmail({
        templateKey: baseline.templateKey,
        variables: baseline.variables,
      })
      expect(r1.html).toBe(r2.html)
      expect(r2.html).toBe(r3.html)
    })
  })

  describe('AC3 — Invariants structurels (cheerio)', () => {
    // Cheerio is intentionally distinct from the byte-level snapshot above:
    // a cosmetic compiler change (attribute reorder, whitespace) can drift
    // a snapshot while keeping these invariants green. They cover the
    // semantic contract of the shell (header colour, no dangerous tags).
    //
    // Story 26-0 deviation note: AC3 wording mentions "<table> avec bgcolor"
    // but modern MJML compiles section background-color into inline style
    // (style="background:#18181b") on a <div>/<table>, and only emits the
    // bgcolor attribute on the inner <td> of <mj-button> and inside MSO
    // conditional HTML comments (not visible to a DOM parser). Cheerio cannot
    // see comments, so we keep the spirit of the assertion ("brand chrome
    // colour reaches the rendered DOM") by matching either bgcolor=#18181b
    // anywhere OR style*=18181b.
    test.each(BASELINES.map((b) => [b.label, b] as const))(
      'invariants structurels pour: %s',
      async (_label, baseline) => {
        const { html } = await renderEmail({
          templateKey: baseline.templateKey,
          eventId: baseline.eventId,
          variables: baseline.variables,
        })
        const $ = cheerio.load(html)

        // <title>TimePick</title>
        expect($('title').text()).toBe('TimePick')

        // Brand chrome (#18181b) present on at least one DOM element, via a
        // `bgcolor` attribute (button <td>) or an inline `style` background OR
        // border declaration. Post migration 018 the shell is a white card with
        // a #18181b border: the border is the universal signal (every template),
        // the button background is template-dependent (cancellation a désormais
        // un CTA {{calendar_url}}).
        // Text-color matches are deliberately NOT counted.
        const headerChromeElements = $('*').filter((_i, el) => {
          const node = $(el)
          const bg = (node.attr('bgcolor') ?? '').toLowerCase()
          if (bg === HEADER_BLACK) return true
          const style = node.attr('style') ?? ''
          return HEADER_BG_RE.test(style)
        })
        expect(headerChromeElements.length).toBeGreaterThan(0)

        // No <mj-raw> survives compilation (defence in depth — MJML strict
        // already rejects them at compile, but a future Zod validator at the
        // API boundary needs to be the only enforcement point per Epic 26
        // policy).
        expect($('mj-raw').length).toBe(0)

        // No dangerous wrapper tags
        for (const tag of FORBIDDEN_TAGS) {
          expect($(tag).length).toBe(0)
        }
      },
    )
  })

  describe('AC6 — Parité avec baselines post-e4 (Story 25-4)', () => {
    // The post-e4/*.html files are the canonical reference produced by
    // email-visual-baselines.test.ts. Our renderEmail() output MUST match
    // them byte-for-byte: same pipeline, same sample variables, same mock.
    // Any divergence flagged here means S1-S4 silently mutated HTML
    // output — exactly the silent failure mode Epic 26 must prevent.
    test.each(BASELINES.map((b) => [b.label, b] as const))(
      'HTML compilé matche le baseline post-e4 pour: %s',
      async (_label, baseline) => {
        const baselinePath = path.join(POST_E4_DIR, baseline.baselineFile)
        expect(fs.existsSync(baselinePath)).toBe(true)
        const expectedHtml = fs.readFileSync(baselinePath, 'utf-8')

        const { html } = await renderEmail({
          templateKey: baseline.templateKey,
          eventId: baseline.eventId,
          variables: baseline.variables,
        })
        expect(html).toBe(expectedHtml)
      },
    )
  })

  // ---------------------------------------------------------------------------
  // Plan-5b-defer-A L3 (2026-05-25) — promotion γ du content-wrapper.
  //
  // Une row content-wrapper seedée sur (template, 'invitation') doit se
  // propager runtime aux 4 templateKeys (invitation + 3 systèmes) via la
  // cascade γ déjà livrée en L2. La vérification se fait sur le HTML compilé :
  // le `<mj-wrapper background-color="#f9f9f9">` est compilé par MJML en une
  // table extérieure portant la couleur de fond, donc le hex `#f9f9f9` doit
  // apparaître dans le HTML compilé (bgcolor ou inline style) pour les 4
  // templateKeys quand la row est seedée, et pour aucun quand elle ne l'est
  // pas (parité byte-level pré-L3 préservée — déjà couvert par AC2/AC6).
  // ---------------------------------------------------------------------------
  describe('AC L3 — content-wrapper promotion γ (template[invitation])', () => {
    // Discriminateur volontairement distinct de la factory brand #f9f9f9
    // semée par migration 012 (plan-5b-defer-A L3-data) : sans cette
    // distinction, l'assertion `html contient #f9f9f9` matcherait aussi
    // la cascade brand → l'override template ne serait pas prouvé. Utiliser
    // une couleur clairement hors-factory garantit que le wrap observé
    // provient bien du seed template-level.
    const WRAPPER_BG = '#aabbcc'
    const WRAPPER_BG_RE = new RegExp(
      `(?:bgcolor\\s*=\\s*"${WRAPPER_BG}"|background(?:-color)?\\s*:\\s*${WRAPPER_BG})`,
      'i',
    )

    // Cleanup ciblé sur la seule row seedée par ces tests. Migration 012
    // (plan-5b-defer-A L3-data, 2026-05-26) sème une row brand factory
    // content-wrapper #f9f9f9 au boot DB ; un `DELETE FROM shell_parts`
    // global la wiperait et polluerait les workers Jest suivants.
    afterEach(async () => {
      await query(
        `DELETE FROM shell_parts
           WHERE owner_kind = 'template'
             AND owner_id = 'invitation'
             AND part_kind = 'content-wrapper'`,
      )
    })

    test.each(BASELINES.map((b) => [b.label, b] as const))(
      'row content-wrapper(template, invitation) propagée au HTML compilé pour: %s',
      async (_label, baseline) => {
        await seedShellPart({
          ownerKind: 'template',
          ownerId: 'invitation',
          partKind: 'content-wrapper',
          contentMjml: `<mj-section background-color="${WRAPPER_BG}"></mj-section>`,
        })

        const { html } = await renderEmail({
          templateKey: baseline.templateKey,
          eventId: baseline.eventId,
          variables: baseline.variables,
        })

        // Preuve runtime de la propagation γ : la couleur de fond du
        // content-wrapper apparaît dans le HTML compilé (via bgcolor ou
        // inline style sur la <table> extérieure générée par <mj-wrapper>).
        expect(WRAPPER_BG_RE.test(html)).toBe(true)
      },
    )
  })

  // ---------------------------------------------------------------------------
  // Plan-5b-defer-A L3-data (2026-05-26) — seed brand factory content-wrapper.
  //
  // Migration 012 sème une row ('brand', '1', 'content-wrapper', <mj-section
  // background-color="#f9f9f9"></mj-section>) qui active la cascade γ niveau
  // brand sans aucune action admin. Le bloc AC L3 ci-dessus seed une row
  // (template, invitation) avec un discriminateur distinct (#aabbcc) qui
  // prime sur la brand factory ; ce bloc-ci vérifie le scénario nu : aucune
  // row template/event ne masque la factory, donc la cascade γ promeut la
  // valeur brand sur les 4 templateKeys et le HTML compilé doit contenir
  // `#f9f9f9` sur les 5 BASELINES sans appel à `seedShellPart` préalable.
  //
  // Note de test isolation : l'afterEach du bloc AC L3 ci-dessus est ciblé
  // sur la seule row (template, invitation, content-wrapper) ; la row
  // brand factory survit donc à toute exécution antérieure dans le même
  // worker Jest.
  // ---------------------------------------------------------------------------
  describe('AC L3-data — brand content-wrapper γ propagation', () => {
    // Discriminateur brand-level volontairement distinct du défaut usine
    // (désormais #ffffff via migration 017 — trop ubiquitaire pour prouver la
    // propagation : le blanc apparaît déjà dans le mj-body, les boutons, etc.).
    // On seed une couleur brand hors-factory et on prouve sa propagation γ aux
    // 4 templateKeys. Robuste à toute évolution future du défaut usine.
    const BRAND_BG = '#abcdef'
    const BRAND_BG_RE = new RegExp(
      `(?:bgcolor\\s*=\\s*"${BRAND_BG}"|background(?:-color)?\\s*:\\s*${BRAND_BG})`,
      'i',
    )

    beforeAll(async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'content-wrapper',
        contentMjml: `<mj-section background-color="${BRAND_BG}"></mj-section>`,
      })
    })

    afterAll(async () => {
      // Restaure la row factory courante (#ffffff) pour les blocs suivants.
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'content-wrapper',
        contentMjml: BRAND_FACTORY_CONTENT_WRAPPER_MJML,
      })
    })

    test.each(BASELINES.map((b) => [b.label, b] as const))(
      'row brand content-wrapper propagée au HTML compilé pour: %s',
      async (_label, baseline) => {
        const { html } = await renderEmail({
          templateKey: baseline.templateKey,
          eventId: baseline.eventId,
          variables: baseline.variables,
        })

        expect(BRAND_BG_RE.test(html)).toBe(true)
      },
    )
  })

  // ---------------------------------------------------------------------------
  // Plan 5b defer-A L3-data-F (2026-05-26) — Patch step-04 finding BH7
  // (couverture motif non-vide). Vérifie qu'un cancellation_reason pré-formaté
  // côté service (`<strong>Motif :</strong> ${escaped}`) survit au pipeline
  // substituteVariables → sanitizeEmailHtml → htmlToText. Le `<strong>` doit
  // apparaître dans l'HTML compilé ; le texte utilisateur doit être présent
  // tel qu'injecté.
  // ---------------------------------------------------------------------------
  describe('AC L3-data-F — cancellation_confirmation avec motif pré-formaté', () => {
    it('le HTML compilé contient le wrapper Motif + le texte utilisateur', async () => {
      const motifHtml = '<strong>Motif :</strong> Événement reporté'
      const { html } = await renderEmail({
        templateKey: 'cancellation_confirmation',
        variables: {
          event_name: 'Soirée Annuelle 2026',
          user_first_name: 'Jean',
          slot_date: '15 juin 2026',
          slot_time: '14h00 → 15h00',
          cancellation_reason: motifHtml,
        },
      })

      expect(html).toContain('<strong>Motif :</strong>')
      expect(html).toContain('Événement reporté')
    })

    it('le HTML compilé préserve `<br>` pour les retours à la ligne multilignes', async () => {
      const multilineMotif = '<strong>Motif :</strong> Ligne un<br>Ligne deux'
      const { html } = await renderEmail({
        templateKey: 'cancellation_confirmation',
        variables: {
          event_name: 'Soirée',
          user_first_name: 'Jean',
          slot_date: '15 juin',
          slot_time: '14h',
          cancellation_reason: multilineMotif,
        },
      })

      expect(html).toContain('Ligne un<br>Ligne deux')
    })
  })

  // ---------------------------------------------------------------------------
  // Email de setup du premier admin (2026-07-27) — corps dédié hors templates
  // DB (renderSetupAdminEmail). Contrat : salutation NOMINATIVE (le prénom vient
  // du formulaire du wizard via le JWT bootstrap), 2 conseils de première
  // configuration, lien magique et expiration substitués. Rendu réel (MJML
  // compile + sanitize) — les unit tests d'email.service mockent cette
  // fonction, ce bloc est la seule couverture du corps MJML.
  // ---------------------------------------------------------------------------
  describe('renderSetupAdminEmail — email de setup du premier admin', () => {
    it('compile le corps dédié : salutation nominative, 2 conseils, lien et expiration', async () => {
      const { html, text } = await renderSetupAdminEmail({
        magic_link: ADMIN_LINK,
        expiration_date: EXPIRATION,
        user_first_name: 'Camille',
        user_last_name: 'Martin',
        user_full_name: 'Camille Martin',
      })

      // Salutation nominative — jamais « Bonjour Administrateur »
      expect(text).toContain('Bonjour Camille,')
      expect(html).not.toContain('Administrateur')

      // Exactement 2 conseils : le « Complétez votre profil » est mort avec la
      // collecte prénom/nom au wizard.
      expect(text).not.toContain('Complétez votre profil')
      expect(text).toContain('membres')
      expect(text).toContain('premier événement')
      expect((html.match(/&bull;|•/g) ?? []).length).toBe(2)

      // Variables substituées (aucun placeholder résiduel)
      expect(html).toContain(`href="${ADMIN_LINK}"`)
      expect(html).toContain(`Ce lien expire le ${EXPIRATION}.`)
      expect(html).not.toContain('{{')
    })
  })
})
