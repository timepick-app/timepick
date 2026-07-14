/**
 * Integration tests for migration 006_email_refactoring.sql
 *
 * Story: E1.S1 / 22.1 — Email Refactoring Foundation
 *
 * Covers ACs 1, 3, 4, 5, 6, 7. Uses the existing timepick_test database
 * (managed by globalSetup.js) which has already applied migration 006 by the
 * time these tests run.
 *
 */

import fs from 'fs'
import path from 'path'
import mjml2html from 'mjml'
import { query } from '../../db'

// We deliberately import `mjml2html` directly rather than the project's
// `compileMjml()` from services/mjml-compile.service.ts, because that module
// pulls in isomorphic-dompurify → jsdom → @exodus/bytes (ESM-only) which
// Jest's CJS transform cannot parse. See unit/mjml-compile.service.test.ts
// for the same workaround. The MJML compile sanity check below validates
// only that the seed bodies are syntactically valid MJML — the DOMPurify
// pass is exercised in production code paths, not here.

const MIGRATION_PATH = path.resolve(__dirname, '../../migrations/006_email_refactoring.sql')
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8')

// Migration 022 retire email_brand_settings.background_color. La SQL est chargée
// ici pour re-retirer la colonne dans l'afterAll de la suite 006 (qui l'avait
// temporairement restaurée via beforeAll pour valider l'idempotence du SQL 006).
const MIGRATION_022_PATH = path.resolve(__dirname, '../../migrations/022_drop_email_brand_background_color.sql')
const MIGRATION_022_SQL = fs.readFileSync(MIGRATION_022_PATH, 'utf8')


const EXPECTED_TEMPLATE_KEYS = [
  'invitation',
  'magic_link_login',
  'reservation_confirmation',
  'cancellation_confirmation',
  'account_created',
  'slot_modification',
  'role_promoted',
  'role_demoted',
  'unregistration_confirmation',
] as const

// Migration 022 — couverture forward : la colonne background_color est absente
// du schéma live (globalSetup applique 006→022 ; 022 l'a retirée). Déclaré AVANT
// le describe 006, dont le beforeAll ré-ajoute temporairement la colonne.
describe('Migration 022 — Drop email_brand_settings.background_color', () => {
  it('forward : la colonne background_color est absente du schéma live', async () => {
    const { rows } = await query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'email_brand_settings'
         AND column_name = 'background_color'`,
    )
    expect(rows).toEqual([])
  })
})

describe('Migration 006 — Email Refactoring (E1.S1)', () => {
  afterAll(async () => {
    // Retire la colonne background_color ajoutée par beforeAll pour rétablir l'état live (post-022).
    await query(MIGRATION_022_SQL)
  })

  // V0.1 — le schéma est reconstruit à neuf (init-db / prepare-test-db jouent
  // TOUTES les migrations dans l'ordre 006→022) ; il n'existe pas de replay
  // incrémental en prod. Ce describe valide la migration 006 contre SON schéma :
  // 022 (globalSetup) ayant déjà retiré background_color, on la restaure le temps
  // de rejouer 006 (dont le seed brand cite la colonne). L'afterAll ré-applique
  // 022 pour rétablir l'état live.
  beforeAll(async () => {
    await query(
      `ALTER TABLE email_brand_settings ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) NOT NULL DEFAULT '#ffffff'`,
    )
  })

  describe('Schema — email_brand_settings', () => {
    it('exposes the expected columns with correct types, nullability, and varchar lengths', async () => {
      const { rows } = await query(
        `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
         FROM information_schema.columns
         WHERE table_name = 'email_brand_settings'
         ORDER BY ordinal_position`
      )
      const byName = Object.fromEntries(rows.map((r: any) => [r.column_name, r]))

      expect(byName.id).toMatchObject({ data_type: 'integer', is_nullable: 'NO' })
      expect(byName.logo_url).toMatchObject({ data_type: 'text', is_nullable: 'YES' })
      expect(byName.primary_color).toMatchObject({
        data_type: 'character varying',
        is_nullable: 'NO',
        character_maximum_length: 7,
      })
      expect(byName.font_family).toMatchObject({
        data_type: 'character varying',
        is_nullable: 'NO',
        character_maximum_length: 64,
      })
      expect(byName.button_border_radius).toMatchObject({
        data_type: 'smallint',
        is_nullable: 'NO',
      })
      expect(byName.created_at).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      })
      expect(byName.updated_at).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      })
    })

    it('enforces the singleton invariant via CHECK (id = 1)', async () => {
      const { rows } = await query(
        `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'email_brand_settings'
           AND c.conname = 'email_brand_settings_singleton'`
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].def).toMatch(/CHECK \(\(?id = 1\)?\)/)

      // Functional check: trying to insert id=2 must fail.
      await expect(
        query(
          `INSERT INTO email_brand_settings (id, primary_color, font_family, button_border_radius)
           VALUES (2, '#000000', 'Arial', 4)`
        )
      ).rejects.toThrow()
    })
  })

  describe('Schema — email_templates', () => {
    it('exposes the expected columns with correct types, nullability, and varchar lengths', async () => {
      const { rows } = await query(
        `SELECT column_name, data_type, is_nullable, character_maximum_length
         FROM information_schema.columns
         WHERE table_name = 'email_templates'
         ORDER BY ordinal_position`
      )
      const byName = Object.fromEntries(rows.map((r: any) => [r.column_name, r]))

      expect(byName.template_key).toMatchObject({
        data_type: 'character varying',
        is_nullable: 'NO',
        character_maximum_length: 64,
      })
      expect(byName.body_mjml).toMatchObject({ data_type: 'text', is_nullable: 'NO' })
      expect(byName.default_body_mjml).toMatchObject({
        data_type: 'text',
        is_nullable: 'NO',
      })
    })

    it('declares template_key as the primary key', async () => {
      const { rows } = await query(
        `SELECT a.attname AS column_name
         FROM pg_index i
         JOIN pg_class t ON t.oid = i.indrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
         WHERE t.relname = 'email_templates' AND i.indisprimary`
      )
      expect(rows.map((r: any) => r.column_name)).toEqual(['template_key'])
    })

    it('rejects unknown template_key values via CHECK constraint', async () => {
      await expect(
        query(
          `INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
           VALUES ('not_a_real_key', '<mj-text>x</mj-text>', '<mj-text>x</mj-text>')`
        )
      ).rejects.toThrow()
    })
  })

  describe('Schema — events.invitation_mjml', () => {
    it('adds events.invitation_mjml as nullable TEXT (legacy invitation_template dropped in migration 008)', async () => {
      const { rows } = await query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'events'
           AND column_name IN ('invitation_mjml', 'invitation_template')`
      )
      const byName = Object.fromEntries(rows.map((r: any) => [r.column_name, r]))

      expect(byName.invitation_mjml).toMatchObject({
        data_type: 'text',
        is_nullable: 'YES',
      })
      // Story 25-3 / E4.S3: the legacy column is dropped by migration 008.
      expect(byName.invitation_template).toBeUndefined()
    })
  })

  describe('Seeds', () => {
    it('seeds exactly one row in email_brand_settings with factory defaults', async () => {
      const count = await query(`SELECT COUNT(*)::int AS c FROM email_brand_settings`)
      expect(count.rows[0].c).toBe(1)

      const { rows } = await query(`SELECT * FROM email_brand_settings WHERE id = 1`)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        id: 1,
        logo_url: null,
        primary_color: '#18181b',
        font_family: 'Inter, Arial, sans-serif',
        button_border_radius: 4,
      })
    })

    it('seeds exactly nine rows in email_templates with body_mjml = default_body_mjml', async () => {
      const count = await query(`SELECT COUNT(*)::int AS c FROM email_templates`)
      expect(count.rows[0].c).toBe(9)

      const { rows } = await query(
        `SELECT template_key, body_mjml, default_body_mjml
         FROM email_templates
         ORDER BY template_key`
      )
      expect(rows.map((r: any) => r.template_key).sort()).toEqual(
        [...EXPECTED_TEMPLATE_KEYS].sort()
      )
      for (const row of rows) {
        expect(row.body_mjml).toBe(row.default_body_mjml)
        expect(row.body_mjml.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Idempotency', () => {
    it('re-running 006 SQL post-027 raises (magic_link_recovery violates the shrunk CHECK) and preserves row count', async () => {
      // 027 a retiré 'magic_link_recovery' de la CHECK et supprimé sa row ; 028 a
      // ajouté 'unregistration_confirmation' → email_templates compte 9 rows.
      // Re-run du SQL 006 (qui seed magic_link_recovery via ON CONFLICT DO NOTHING) :
      // la row ayant été supprimée, il n'y a pas de conflit → INSERT tenté → rejeté
      // par la CHECK (sans magic_link_recovery). L'INSERT atomique échoue ; 9 rows préservées.
      await expect(query(MIGRATION_SQL)).rejects.toThrow()

      const brand = await query(`SELECT COUNT(*)::int AS c FROM email_brand_settings`)
      const tmpl = await query(`SELECT COUNT(*)::int AS c FROM email_templates`)
      expect(brand.rows[0].c).toBe(1)
      expect(tmpl.rows[0].c).toBe(9)
    })
  })

  describe('Seed MJML compiles cleanly', () => {
    it('every factory body wraps into a valid MJML document under strict validation', async () => {
      const { rows } = await query(
        `SELECT template_key, default_body_mjml FROM email_templates`
      )
      for (const row of rows) {
        // Strip le marqueur d'éditeur `data-part-kind` AVANT de valider, comme le
        // fait la production `compileMjml` (mjml-compile.service.ts) : MJML 5.x
        // rejette ce data-* sur mj-section même en soft, et il n'a aucun rôle de
        // rendu. La validation strict couvre alors le vrai MJML du seed factory.
        const cleaned = row.default_body_mjml.replace(
          /\s+data-part-kind="(?:header|body|footer)"/g,
          '',
        )
        const wrapped = `<mjml><mj-body>${cleaned}</mj-body></mjml>`
        const result = await mjml2html(wrapped, { validationLevel: 'strict' })
        expect(result.errors ?? []).toEqual([])
        expect(result.html.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Documentation — COMMENT ON (AC8)', () => {
    it('attaches a non-trivial COMMENT ON TABLE for each new table', async () => {
      for (const table of ['email_brand_settings', 'email_templates']) {
        const { rows } = await query(
          `SELECT pgd.description
           FROM pg_description pgd
           JOIN pg_class pc ON pc.oid = pgd.objoid
           WHERE pc.relname = $1
             AND pgd.objsubid = 0`,
          [table]
        )
        expect(rows).toHaveLength(1)
        expect(rows[0].description).toBeTruthy()
        expect(rows[0].description.length).toBeGreaterThan(20)
      }
    })

    it('attaches a non-trivial COMMENT ON COLUMN for each documented column', async () => {
      const documentedColumns: Array<[string, string]> = [
        ['email_brand_settings', 'id'],
        ['email_brand_settings', 'logo_url'],
        ['email_brand_settings', 'primary_color'],
        ['email_brand_settings', 'font_family'],
        ['email_brand_settings', 'button_border_radius'],
        ['email_templates', 'template_key'],
        ['email_templates', 'body_mjml'],
        ['email_templates', 'default_body_mjml'],
        ['events', 'invitation_mjml'],
      ]
      for (const [table, column] of documentedColumns) {
        const { rows } = await query(
          `SELECT pgd.description
           FROM pg_description pgd
           JOIN pg_class pc ON pc.oid = pgd.objoid
           JOIN pg_attribute pa ON pa.attrelid = pc.oid AND pa.attnum = pgd.objsubid
           WHERE pc.relname = $1 AND pa.attname = $2`,
          [table, column]
        )
        expect(rows).toHaveLength(1)
        expect(rows[0].description).toBeTruthy()
        expect(rows[0].description.length).toBeGreaterThan(10)
      }
    })
  })
})
