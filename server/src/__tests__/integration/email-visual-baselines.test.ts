/**
 * Post-E4 visual baselines generation (Story 25-4 / E4.S4, AC1).
 *
 * Calls renderEmail() for each of the 4 template-key variants (magic_link_login
 * has admin + user variants) using the deterministic sample variables from
 * email-baselines/README.md §3, writes the rendered HTML to disk, and asserts
 * non-empty output with expected variable substitutions present.
 *
 * Runs against the real timepick_test DB (globalSetup.js has already applied
 * migration 006 with factory seeds + brand singleton). DOMPurify is mocked via
 * the project-wide auto-mock at server/__mocks__/isomorphic-dompurify.ts.
 *
 * Output: server/src/__tests__/fixtures/email-baselines/post-e4/
 */

jest.mock('isomorphic-dompurify')

import fs from 'fs'
import path from 'path'
import { query } from '../../db'
import { renderEmail, type TemplateKey } from '../../services/render-email.service'
import {
  BRAND_FACTORY_CONTENT_WRAPPER_MJML,
  INVITATION_FACTORY_HEADER_MJML,
  INVITATION_FACTORY_CONTENT_WRAPPER_MJML,
  INVITATION_FACTORY_MJBODY_MJML,
  seedShellPart,
} from '../../services/shell-parts.service'
import type { VariablesPayload } from '../../services/mjml-compile.service'

// ---------------------------------------------------------------------------
// Deterministic sample variables (mirrors email-baselines/README.md §3)
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

// ---------------------------------------------------------------------------
// Baseline definitions
// ---------------------------------------------------------------------------

interface BaselineCase {
  file: string
  templateKey: TemplateKey
  eventId?: string
  variables: VariablesPayload
  /** Substrings that MUST appear in the rendered HTML. */
  mustContain: string[]
}

const BASELINES: BaselineCase[] = [
  {
    file: 'email-magic_link_login-admin-post-e4.html',
    templateKey: 'magic_link_login',
    variables: {
      magic_link: ADMIN_LINK,
      expiration_date: EXPIRATION,
      is_admin: 'true',
      user_first_name: 'Jean',
    },
    mustContain: [ADMIN_LINK, EXPIRATION, 'TimePick', GREETING],
  },
  {
    file: 'email-magic_link_login-user-post-e4.html',
    templateKey: 'magic_link_login',
    variables: {
      magic_link: USER_LINK,
      expiration_date: EXPIRATION,
      is_admin: 'false',
      user_first_name: 'Jean',
    },
    mustContain: [USER_LINK, EXPIRATION, 'TimePick', GREETING],
  },
  {
    file: 'email-invitation-post-e4.html',
    templateKey: 'invitation',
    variables: {
      event_name: EVENT_NAME,
      event_description: EVENT_DESC,
      magic_link: EVENT_LINK,
      expiration_date: EXPIRATION,
      user_first_name: 'Jean',
    },
    mustContain: [EVENT_NAME, EVENT_LINK, EXPIRATION, GREETING],
  },
  {
    file: 'email-reservation_confirmation-post-e4.html',
    templateKey: 'reservation_confirmation',
    variables: {
      event_name: EVENT_NAME,
      slot_date: SLOT_DATE,
      slot_time: SLOT_TIME,
      calendar_url: CALENDAR_LINK,
      user_first_name: 'Jean',
    },
    mustContain: [EVENT_NAME, SLOT_DATE, SLOT_TIME, CALENDAR_LINK, GREETING],
  },
  // Plan 5b defer-A L3-data-F (2026-05-26) — 5ᵉ templateKey ajouté par
  // migration 013. Variables canoniques alignées sur sendSlotCancellationEmail
  // (user_first_name per-recipient, pas de cancel_link). Le motif est
  // pré-formaté côté service en HTML `<strong>Motif :</strong> ${escaped}` ;
  // on simule ici une annulation sans motif (chaîne vide) pour la baseline,
  // ce qui correspond à l'annulation par l'utilisateur (cf. reservation.service).
  {
    file: 'email-cancellation_confirmation-post-e4.html',
    templateKey: 'cancellation_confirmation',
    variables: {
      event_name: EVENT_NAME,
      user_first_name: 'Jean',
      slot_date: SLOT_DATE,
      slot_time: SLOT_TIME,
      cancellation_reason: '',
      calendar_url: CALENDAR_LINK,
    },
    mustContain: [EVENT_NAME, GREETING, SLOT_DATE, SLOT_TIME, CALENDAR_LINK],
  },
]

// ---------------------------------------------------------------------------
// Output path
// ---------------------------------------------------------------------------

const OUTPUT_DIR = path.resolve(
  __dirname,
  '../fixtures/email-baselines/post-e4',
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Post-E4 visual baselines (Story 25-4, AC1)', () => {
  beforeAll(async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    // Coque commune « carte » : modèle d'usine depuis migration 018. Semée
    // explicitement (idempotent) pour que les baselines sur disque reflètent
    // l'état d'usine de production (carte blanche bordée + fond de page gris)
    // indépendamment de l'ordre Jest et même si une suite a wipé shell_parts.
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

  // Hygiène cross-fichier (cf. `email-html-output.test.ts:afterAll`) :
  // nettoyer la row factory pour que `shell-parts.service.test.ts` et
  // autres fichiers de tests post-baselines héritent d'un shell_parts vide.
  afterAll(async () => {
    await query(
      `DELETE FROM shell_parts
         WHERE (owner_kind = 'brand' AND owner_id = '1' AND part_kind = 'content-wrapper')
            OR (owner_kind = 'template' AND owner_id = 'invitation')`,
    )
  })

  test.each(BASELINES.map((b, i) => [b.file, b, i] as const))(
    'generates baseline: %s',
    async (file, baseline) => {
      const result = await renderEmail({
        templateKey: baseline.templateKey,
        eventId: baseline.eventId,
        variables: baseline.variables,
      })

      // Non-empty HTML output
      expect(result.html.length).toBeGreaterThan(0)
      expect(result.text.length).toBeGreaterThan(0)

      // All expected variable substitutions present
      for (const needle of baseline.mustContain) {
        expect(result.html).toContain(needle)
      }

      // Write to disk
      const outPath = path.join(OUTPUT_DIR, file)
      fs.writeFileSync(outPath, result.html, 'utf-8')

      // Sanity: file written and readable
      const stat = fs.statSync(outPath)
      expect(stat.size).toBeGreaterThan(0)
    },
  )

  test('all 5 baselines generated', () => {
    const files = BASELINES.map((b) => b.file)
    expect(files).toHaveLength(5)

    for (const file of files) {
      const outPath = path.join(OUTPUT_DIR, file)
      expect(fs.existsSync(outPath)).toBe(true)
    }
  })
})
