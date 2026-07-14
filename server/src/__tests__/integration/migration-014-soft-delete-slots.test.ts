import fs from 'fs'
import path from 'path'
import { query, getClient } from '../../db'

/**
 * Tests d'intégration de la migration 014 (soft-delete slots) sur la vraie base
 * timepick_test (appliquée par globalSetup au démarrage de chaque run jest).
 *
 * Couvre les garanties du plan : présence du schéma, contrainte CHECK de longueur
 * du motif, idempotence.
 *
 * Toutes les opérations mutantes (ré-application du DDL) tournent dans une
 * transaction systématiquement ROLLBACK — la base partagée n'est jamais mutée
 * durablement, ce qui reste sûr en exécution parallèle de suites.
 */

const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/014_soft_delete_slots.sql'),
  'utf8',
)

async function slotColumnExists(column: string): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'slots' AND column_name = $1`,
    [column],
  )
  return rows.length > 0
}

describe('Migration 014 — soft-delete slots (schéma + CHECK + idempotence)', () => {
  let eventId: string
  let slotId: string

  beforeAll(async () => {
    const event = await query(
      `INSERT INTO events (name, description, is_published)
       VALUES ($1, 'migration 014 fixture', false)
       RETURNING id`,
      [`m014-${Date.now()}-${Math.random().toString(36).slice(2)}`],
    )
    eventId = event.rows[0].id
    const slot = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, NOW() + interval '1 day', NOW() + interval '1 day 2 hours', 5)
       RETURNING id`,
      [eventId],
    )
    slotId = slot.rows[0].id
  })

  afterAll(async () => {
    await query(`DELETE FROM slots WHERE event_id = $1`, [eventId])
    await query(`DELETE FROM events WHERE id = $1`, [eventId])
  })

  it('a ajouté les colonnes cancelled_at et cancellation_reason', async () => {
    expect(await slotColumnExists('cancelled_at')).toBe(true)
    expect(await slotColumnExists('cancellation_reason')).toBe(true)
  })

  it("a créé l'index partiel idx_slots_cancelled_at (WHERE cancelled_at IS NOT NULL)", async () => {
    const { rows } = await query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_slots_cancelled_at'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toMatch(/WHERE \(cancelled_at IS NOT NULL\)/i)
  })

  it('a créé la contrainte de longueur slots_cancellation_reason_length', async () => {
    const { rows } = await query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'slots_cancellation_reason_length'`,
    )
    expect(rows).toHaveLength(1)
  })

  it('CHECK rejette un motif de plus de 500 caractères', async () => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      await expect(
        client.query(
          `UPDATE slots SET cancelled_at = NOW(), cancellation_reason = $2 WHERE id = $1`,
          [slotId, 'x'.repeat(501)],
        ),
      ).rejects.toMatchObject({ code: '23514' }) // check_violation PostgreSQL
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
      client.release()
    }
  })

  it('CHECK accepte un motif de 500 caractères et un motif NULL', async () => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const max = await client.query(
        `UPDATE slots SET cancelled_at = NOW(), cancellation_reason = $2 WHERE id = $1`,
        [slotId, 'x'.repeat(500)],
      )
      expect(max.rowCount).toBe(1)
      const nullReason = await client.query(
        `UPDATE slots SET cancelled_at = NOW(), cancellation_reason = NULL WHERE id = $1`,
        [slotId],
      )
      expect(nullReason.rowCount).toBe(1)
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })

  it('est idempotente : la migration peut être rejouée sans erreur', async () => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      // Déjà appliquée par globalSetup ; la rejouer deux fois ne doit pas échouer
      // (ADD COLUMN IF NOT EXISTS, DROP/ADD CONSTRAINT, CREATE INDEX IF NOT EXISTS).
      await client.query(MIGRATION_SQL)
      await client.query(MIGRATION_SQL)
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })
})
