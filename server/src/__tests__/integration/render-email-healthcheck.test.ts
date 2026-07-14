/**
 * Integration tests for runRenderEmailHealthcheck() (Story 22.2 / E1.S2).
 *
 * Runs against the real `timepick_test` DB (managed by globalSetup.js, which
 * has already applied migration 006 with the four factory seeds and the
 * brand singleton). The healthcheck pipeline is exercised end-to-end against
 * Postgres: pg pool → email_brand_settings + email_templates → buildShell →
 * compileMjml → htmlToText, plus the failure modes (missing row, malformed
 * MJML body).
 *
 * Pattern reference: integration/email-refactoring-migration.test.ts (E1.S1).
 *
 * The DOMPurify step is mocked via the project-wide auto-mock at
 * `server/__mocks__/isomorphic-dompurify.ts` (Story 23.1, A4). The real
 * package pulls in `@exodus/bytes` (ESM) via jsdom, which ts-jest's CJS
 * transform cannot parse. Sanitizer correctness is covered by
 * `scripts/verify-mjml-sanitizer.mjs`.
 */

jest.mock('isomorphic-dompurify')

import { query } from '../../db'
import {
  renderEmail,
  runRenderEmailHealthcheck,
  RenderEmailHealthcheckError,
  type TemplateKey,
} from '../../services/render-email.service'

const ALL_KEYS: TemplateKey[] = [
  'invitation',
  'magic_link_login',
  'reservation_confirmation',
  'cancellation_confirmation',
  'account_created',
  'slot_modification',
  'role_promoted',
  'role_demoted',
  'unregistration_confirmation',
]

/**
 * Restore every email_templates row to its default_body_mjml. Cheap because
 * the table has exactly four rows. Re-inserts any row that was deleted
 * during a test using the same default_body_mjml as both columns.
 */
async function restoreEmailTemplates(): Promise<void> {
  // Fast path: rows that survived a DELETE are reset to default.
  await query(`UPDATE email_templates SET body_mjml = default_body_mjml`)

  // Slow path: any row deleted by a test is restored from a peer row's
  // factory body. Since the four rows are independent, we cannot copy
  // across keys — instead, re-applying migration 006's seed clause via
  // ON CONFLICT DO NOTHING resurrects missing rows from the migration file.
  // We avoid re-reading the file here because the integration suite already
  // does that in email-refactoring-migration.test.ts; instead we use a
  // per-key fallback that re-runs the original VALUES list when needed.
  const { rows } = await query<{ template_key: TemplateKey }>(
    `SELECT template_key FROM email_templates`,
  )
  const present = new Set(rows.map((r) => r.template_key))
  const missing = ALL_KEYS.filter((k) => !present.has(k))
  if (missing.length === 0) return

  // Re-run the migration's seed insert. The migration is idempotent (ON
  // CONFLICT DO NOTHING); rows that survived will be untouched, missing
  // rows will be re-seeded with body_mjml = default_body_mjml.
  //
  // Story 26-0 fix: also re-apply migration 007 so re-seeded rows pick up
  // the INTRO:START/END + SIG:START/END markers (Story 23-2). Without this,
  // deleting and restoring magic_link_login (or any system templateKey)
  // silently reverts it to pre-007 state, causing email-visual-baselines
  // snapshots to drift between test runs depending on jest worker order.
  // Both migrations are idempotent (ON CONFLICT DO NOTHING / WHERE INTRO:START NOT IN).
  const fs = await import('fs')
  const path = await import('path')
  const migrationsDir = path.resolve(__dirname, '../../migrations')
  // Plan 5b defer-A L3-data-F : 013 ajoute le 5ᵉ templateKey
  // 'cancellation_confirmation'. Idempotent (DROP/ADD CHECK + ON CONFLICT DO
  // NOTHING). Restaure la row si un test l'a supprimée.
  // V0.1 — le seed brand de 006 cite background_color, retiré par 022 (schéma
  // live). On restaure la colonne le temps du replay de 006, puis on re-applique
  // 022 pour rétablir l'état live (pas de replay incrémental en prod).
  await query(
    `ALTER TABLE email_brand_settings ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) NOT NULL DEFAULT '#ffffff'`,
  )

  // account_created (023), slot_modification (025), role_promoted/role_demoted
  // (026) et unregistration_confirmation (028) : ces rows seedées par globalSetup
  // violent le ré-ADD des CHECK plus étroites de 013 (5 valeurs) et 023 (6 valeurs)
  // lors du replay. On les retire avant le replay ; les migrations concernées
  // ré-élargissent la CHECK et ré-insèrent les rows factory.
  await query(
    `DELETE FROM email_templates WHERE template_key IN ('account_created', 'slot_modification', 'role_promoted', 'role_demoted', 'unregistration_confirmation')`,
  )
  // 027 retire magic_link_recovery de la CHECK (9→8 valeurs). Le replay de 006
  // ci-dessous re-seed magic_link_recovery (ON CONFLICT DO NOTHING) — il faut
  // donc ré-élargir la CHECK à 9 valeurs AVANT le replay pour que l'INSERT de
  // 006 soit valide. La migration 027 (ajoutée en fin de replay) re-supprimera
  // la row et rétrécira la CHECK à 8, restaurant l'état post-027 exact.
  await query(
    `ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_template_key_check`,
  )
  await query(
    `ALTER TABLE email_templates ADD CONSTRAINT email_templates_template_key_check
      CHECK (template_key IN (
        'invitation',
        'magic_link_login',
        'magic_link_recovery',
        'reservation_confirmation',
        'cancellation_confirmation',
        'account_created',
        'slot_modification',
        'role_promoted',
        'role_demoted'
      ))`,
  )
  for (const file of [
    '006_email_refactoring.sql',
    '007_email_templates_system_markers.sql',
    '013_extend_email_templates_cancellation.sql',
    '024_restructure_cancellation_template_for_ui.sql',
    '023_add_account_created_template.sql',
    '025_add_slot_modification_email_template.sql',
    '026_add_role_change_templates.sql',
    '022_drop_email_brand_background_color.sql',
    '027_drop_magic_link_recovery.sql',
    '028_add_unregistration_template.sql',
    '029_email_greeting_first_name.sql',
    '031_email_greeting_into_intro_zone.sql',
    '032_add_cta_to_cancellation_confirmation.sql',
    '033_add_cta_to_unregistration_confirmation.sql',
    '034_remove_timepick_mentions_from_templates.sql',
  ]) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await query(sql)
  }
}

async function restoreBrandSettings(): Promise<void> {
  await query(
    `UPDATE email_brand_settings
     SET logo_url = NULL,
         primary_color = '#18181b',
         font_family = 'Inter, Arial, sans-serif',
         button_border_radius = 4
     WHERE id = 1`,
  )
}

describe('runRenderEmailHealthcheck() — integration (E1.S2)', () => {
  afterEach(async () => {
    await restoreEmailTemplates()
    await restoreBrandSettings()
    // Plan 3b — la cascade γ peut être exercée par un row template[invitation]
    // header seedé dans un test ; on nettoie pour ne pas polluer les suivants.
    await query(`DELETE FROM shell_parts`)
  })

  describe('green path', () => {
    it('resolves cleanly when migration-006 seeds and brand singleton are intact', async () => {
      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })

    // Plan 3b du 2026-05-23 — cascade γ : valide que le healthcheck reste vert
    // quand un row (template, 'invitation', 'header') custom est présent. Les
    // 3 templates système consomment alors ce row via la promotion (vérifiée
    // séparément dans shell-resolver.service.test.ts) ; ici on s'assure que
    // le pipeline boot ne lève pas d'exception sur le MJML composé résultant.
    it('resolves cleanly when a custom invitation.header is seeded (cascade γ)', async () => {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'header', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [
          `<mj-section background-color="#0f172a" padding="20px"><mj-column>
             <mj-text color="#ffffff" font-size="22px" font-weight="bold" align="center">CUSTOM HEADER 3B</mj-text>
           </mj-column></mj-section>`,
        ],
      )

      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })
  })

  describe('failure: missing template row', () => {
    it('rejects with the deleted templateKey listed in failures', async () => {
      await query(
        `DELETE FROM email_templates WHERE template_key = 'magic_link_login'`,
      )
      await expect(runRenderEmailHealthcheck()).rejects.toMatchObject({
        name: 'RenderEmailHealthcheckError',
      })

      try {
        await runRenderEmailHealthcheck()
      } catch (err) {
        expect(err).toBeInstanceOf(RenderEmailHealthcheckError)
        const e = err as RenderEmailHealthcheckError
        expect(e.failures.map((f) => f.key)).toContain('magic_link_login')
        expect(e.failures.find((f) => f.key === 'magic_link_login')!.error.name)
          .toBe('TemplateNotFoundError')
      }
    })
  })

  describe('failure: malformed MJML body', () => {
    it('rejects with MjmlCompileError listed for the affected templateKey', async () => {
      // Replace the invitation body with malformed MJML (unclosed tag).
      await query(
        `UPDATE email_templates SET body_mjml = $1 WHERE template_key = 'invitation'`,
        ['<mj-button bad-no-closing'],
      )

      await expect(runRenderEmailHealthcheck()).rejects.toMatchObject({
        name: 'RenderEmailHealthcheckError',
      })

      try {
        await runRenderEmailHealthcheck()
      } catch (err) {
        expect(err).toBeInstanceOf(RenderEmailHealthcheckError)
        const e = err as RenderEmailHealthcheckError
        expect(e.failures.map((f) => f.key)).toContain('invitation')
      }
    })
  })

  describe('dev tolerance: localhost logoUrl from upload endpoint', () => {
    // L'endpoint /admin/uploads/email-image (uploads.routes.ts) construit une
    // URL absolue préfixée par `req.protocol://req.host` ; en dev ça produit
    // `http://localhost:PORT/uploads/...`. Sans tolérance dev, le healthcheck
    // boot crashait sur toute DB locale ayant un logo uploadé via l'UI.
    it('accepts http://localhost:PORT/uploads/... when NODE_ENV !== production', async () => {
      await query(
        `UPDATE email_brand_settings
         SET logo_url = $1
         WHERE id = 1`,
        ['http://localhost:3000/uploads/emails/2026/05/test-logo.webp'],
      )

      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })

    it('still rejects http:// URLs to non-localhost hosts even in dev', async () => {
      await query(
        `UPDATE email_brand_settings
         SET logo_url = $1
         WHERE id = 1`,
        ['http://evil.example/uploads/anything.webp'],
      )

      // L'erreur remonte en `InvalidBrandSettingsError` directement (avant
      // d'être wrappée dans `RenderEmailHealthcheckError`) parce que la
      // lecture du brand row valide en amont du rendu par template.
      await expect(runRenderEmailHealthcheck()).rejects.toMatchObject({
        name: 'InvalidBrandSettingsError',
        field: 'logoUrl',
      })
    })

    // Plan 5a du 2026-05-24 (clarifié review pass) — assertion de résilience du
    // pipeline render quand un row `shell_parts` contient une URL localhost
    // dans un `<mj-image src>` (output normal du write-path en dev après le
    // patch validator). Le healthcheck ne ré-exécute PAS la validation de
    // contenu (`shell-content.validator.ts`) sur les rows lus — la couverture
    // dev/prod du validator vit dans le suite unit de `validators/__tests__/`.
    // Ici on garde un filet de sécurité contre une régression render-time
    // hypothétique qui parserait/casserait ce shape de fragment.
    it('render pipeline stays green when a shell-part header embeds a localhost logo src', async () => {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'header', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [
          `<mj-section background-color="#0f172a" padding="20px" data-part-kind="header"><mj-column width="100%">
            <mj-image src="http://localhost:3000/uploads/emails/2026/05/test-logo.webp" alt="TimePick" width="200px" align="center"/>
          </mj-column></mj-section>`,
        ],
      )

      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })
  })

  describe('resilience: brand singleton with extreme but valid values', () => {
    it('still resolves when brand colors / radius are unusual but well-formed strings', async () => {
      // The DB-level constraints (varchar lengths) are the validation; the
      // renderer treats the values as raw strings. Any well-formed brand row
      // should compile, even if the values are visually ugly.
      await query(
        `UPDATE email_brand_settings
         SET primary_color = '#abcdef',
             button_border_radius = 0
         WHERE id = 1`,
      )
      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })
  })

  describe('post-007 sanity: migration 007 markers do not break MJML compile', () => {
    it('healthcheck still passes with INTRO/SIG markers in system template bodies', async () => {
      // Migration 007 adds <!-- INTRO:START/END --> and <!-- SIG:START/END --> comments
      // to the three system templates' body_mjml. This test verifies those HTML comments
      // do not break MJML compilation or the renderEmail pipeline.
      //
      // Finding (OPEN-Q-2): MJML strips HTML comments during mjml→HTML compilation,
      // so the markers do NOT appear in the rendered HTML output. This is harmless — the
      // parser reads from body_mjml (DB), not from compiled HTML. The markers are an
      // internal-only contract for the parseSystemTemplate/composeSystemTemplate pair.
      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })
  })

  // Plan 4b du 2026-05-24 — la cascade `shell_parts(mj-body)` extrait correctement
  // `padding-top` / `padding-bottom` (cf. shell-resolver) mais avant ce plan le
  // pipeline de render jetait `resolved.mjBody` sans l'appliquer. L'admin éditait
  // 40 px de padding-top, l'email reçu n'avait aucun espacement. Le fix
  // enveloppe header / footer dans une `<mj-section>` extérieure ; ces tests
  // valident que le HTML compilé porte effectivement la valeur — assertion
  // explicite, contrairement au green-path qui n'asserte que `resolves
  // .toBeUndefined()`.
  describe('Plan 4b — mj-body padding render', () => {
    it('injects padding-top from shell_parts(mj-body) into the compiled HTML', async () => {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'mj-body', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [`<mj-body background-color="#ffffff" padding-top="40px" padding-bottom="20px"></mj-body>`],
      )

      const { html } = await renderEmail({
        templateKey: 'invitation',
        variables: {
          event_name: 'Plan 4b smoke',
          event_description: 'render assertion',
          magic_link: 'https://example.invalid/4b',
          expiration_date: '2099-12-31',
        },
      })

      // MJML compile `mj-section padding-top="40px"` → `<td>` portant
      // `padding-top:40px` (parfois mis dans un attribut HTML legacy
      // `padding-top="40"`). Regex tolérante : on cherche la valeur 40 dans un
      // contexte padding-top, qu'elle soit en style inline ou attribut.
      expect(html).toMatch(/padding-top:\s*40px|padding-top="40"/i)
      expect(html).toMatch(/padding-bottom:\s*20px|padding-bottom="20"/i)
    })

    it('emits no extra mj-section wrapper when padding is 0/0 (Outlook regression guard)', async () => {
      // Baseline cascade vide (`origin: 'hardcoded'`, paddingTop='0' /
      // paddingBottom='0' via HARDCODED_MJ_BODY_ATTRS) — invariant testé :
      // insérer un row explicite padding-top="0" padding-bottom="0" ne doit
      // PAS générer un `<mj-wrapper>` parasite. Les deux appels passent par le
      // même code post-Plan 4b ; le test prouve que `row absent ≡ row 0/0`
      // produit le même HTML compilé, ce qui ferme la régression Outlook 2016
      // (les sections vides ont leur propre comportement de rendu).
      const baseline = await renderEmail({
        templateKey: 'invitation',
        variables: {
          event_name: 'Plan 4b regression',
          event_description: 'no padding',
          magic_link: 'https://example.invalid/4b-0',
          expiration_date: '2099-12-31',
        },
      })

      // Maintenant on insère un row mj-body explicite avec padding-top="0" et
      // padding-bottom="0" — la cascade le résout (`origin: 'template'`) mais
      // `isNonZeroPx` doit retourner `false` sur les deux paddings, donc
      // aucun `<mj-wrapper>` n'est ajouté. HTML byte-identique au baseline.
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'mj-body', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [`<mj-body background-color="#fafafa" padding-top="0" padding-bottom="0"></mj-body>`],
      )

      const withZeroPadding = await renderEmail({
        templateKey: 'invitation',
        variables: {
          event_name: 'Plan 4b regression',
          event_description: 'no padding',
          magic_link: 'https://example.invalid/4b-0',
          expiration_date: '2099-12-31',
        },
      })

      expect(withZeroPadding.html).toEqual(baseline.html)
    })

    it('healthcheck passes when a non-zero mj-body padding row is seeded', async () => {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'mj-body', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [`<mj-body background-color="#ffffff" padding-top="40px" padding-bottom="0"></mj-body>`],
      )

      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })
  })

  // Plan 5b du 2026-05-24 — la cascade γ s'étend désormais au part_kind
  // 'mj-body' : un row (template, 'invitation', 'mj-body') sert de fallback
  // inter-templates pour magic_link_login / reservation_confirmation. Ce test E2E valide que la propagation traverse
  // bien le pipeline résolveur → buildShell → MJML compile, et que le padding
  // apparaît dans le HTML reçu par le destinataire.
  describe('Plan 5b — mj-body promotion γ render', () => {
    it('magic_link_login inherits invitation mj-body padding via promotion γ', async () => {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'mj-body', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [`<mj-body background-color="#ffffff" padding-top="40px" padding-bottom="20px"></mj-body>`],
      )

      const { html } = await renderEmail({
        templateKey: 'magic_link_login',
        variables: {
          magic_link: 'https://example.invalid/5b-promotion',
          expiration_date: '2099-12-31',
        },
      })

      // Aucun row mj-body propre à magic_link_login : la promotion γ doit
      // résoudre le row invitation et le render doit appliquer le padding
      // exactement comme pour l'invitation (cf. tests Plan 4b padding render).
      expect(html).toMatch(/padding-top:\s*40px|padding-top="40"/i)
      expect(html).toMatch(/padding-bottom:\s*20px|padding-bottom="20"/i)
    })

    it('magic_link_login own mj-body row overrides invitation promotion', async () => {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'mj-body', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [`<mj-body background-color="#ffffff" padding-top="40px" padding-bottom="40px"></mj-body>`],
      )
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'magic_link_login', 'mj-body', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [`<mj-body background-color="#ffffff" padding-top="10px" padding-bottom="10px"></mj-body>`],
      )

      const { html } = await renderEmail({
        templateKey: 'magic_link_login',
        variables: {
          magic_link: 'https://example.invalid/5b-override',
          expiration_date: '2099-12-31',
        },
      })

      // Surcharge locale priorise — le HTML doit refléter 10px (template-
      // current) et non 40px (template-invitation).
      expect(html).toMatch(/padding-top:\s*10px|padding-top="10"/i)
      expect(html).not.toMatch(/padding-top:\s*40px|padding-top="40"/i)
    })

    it('healthcheck stays green when invitation.mj-body is promoted to system templates', async () => {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'mj-body', $1)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [`<mj-body background-color="#ffffff" padding-top="40px" padding-bottom="0"></mj-body>`],
      )

      // Les 3 modèles système consomment le row invitation via promotion γ ;
      // le pipeline boot ne doit pas crasher sur le MJML composé résultant.
      await expect(runRenderEmailHealthcheck()).resolves.toBeUndefined()
    })
  })
})
