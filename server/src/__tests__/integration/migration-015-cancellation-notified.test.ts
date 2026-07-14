import fs from 'fs'
import path from 'path'
import { query, getClient } from '../../db'

/**
 * Tests d'intégration de la migration 015 (marqueur cancellation_notified_at)
 * sur la vraie base timepick_test (appliquée par globalSetup au démarrage).
 *
 * Couvre : présence de la colonne + de l'index partiel, invariant de backfill
 * (les réservations de créneaux DÉJÀ annulés héritent de slots.cancelled_at,
 * les actives restent NULL), idempotence.
 *
 * Toutes les opérations mutantes (fixtures, backfill, ré-application du DDL)
 * tournent dans une transaction systématiquement ROLLBACK — la base partagée
 * n'est jamais mutée durablement.
 */

const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/015_add_booking_cancellation_notified.sql'),
  'utf8'
)

async function bookingColumnExists(column: string): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'bookings' AND column_name = $1`,
    [column]
  )
  return rows.length > 0
}

describe('Migration 015 — marqueur cancellation_notified_at (schéma + backfill + idempotence)', () => {
  it('a ajouté la colonne bookings.cancellation_notified_at', async () => {
    expect(await bookingColumnExists('cancellation_notified_at')).toBe(true)
  })

  it('a créé l\'index partiel idx_bookings_cancellation_notified_at (WHERE ... IS NULL)', async () => {
    const { rows } = await query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_bookings_cancellation_notified_at'`
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toMatch(/WHERE \(cancellation_notified_at IS NULL\)/i)
  })

  it('backfill : hérite cancelled_at pour les bookings de créneaux annulés, laisse NULL les actifs', async () => {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const user = await client.query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, 'M015 User', 'user') RETURNING id`,
        [`m015-${stamp}@local.dev`]
      )
      const userId = user.rows[0].id
      const event = await client.query(
        `INSERT INTO events (name, description, is_published) VALUES ($1, 'm015 fixture', true) RETURNING id`,
        [`m015-event-${stamp}`]
      )
      const eventId = event.rows[0].id

      // Créneau DÉJÀ annulé (cancelled_at posé) + sa réservation (notified_at NULL).
      const cancelledSlot = await client.query(
        `INSERT INTO slots (event_id, start_time, end_time, capacity, cancelled_at)
         VALUES ($1, NOW() + interval '1 day', NOW() + interval '1 day 2 hours', 5, NOW() - interval '2 days')
         RETURNING id`,
        [eventId]
      )
      const cancelledBooking = await client.query(
        `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2) RETURNING id`,
        [userId, cancelledSlot.rows[0].id]
      )
      // Créneau ACTIF + sa réservation (témoin : doit rester NULL).
      const activeSlot = await client.query(
        `INSERT INTO slots (event_id, start_time, end_time, capacity)
         VALUES ($1, NOW() + interval '3 days', NOW() + interval '3 days 2 hours', 5)
         RETURNING id`,
        [eventId]
      )
      const activeBooking = await client.query(
        `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2) RETURNING id`,
        [userId, activeSlot.rows[0].id]
      )

      // Pré-condition : les deux bookings sont à NULL.
      await client.query(`UPDATE bookings SET cancellation_notified_at = NULL WHERE id = ANY($1)`, [
        [cancelledBooking.rows[0].id, activeBooking.rows[0].id],
      ])

      // Rejouer la migration (idempotente) exécute le backfill.
      await client.query(MIGRATION_SQL)

      const cancelled = await client.query(
        `SELECT cancellation_notified_at, (SELECT cancelled_at FROM slots WHERE id = b.slot_id) AS slot_cancelled_at
           FROM bookings b WHERE id = $1`,
        [cancelledBooking.rows[0].id]
      )
      expect(cancelled.rows[0].cancellation_notified_at).not.toBeNull()
      expect(new Date(cancelled.rows[0].cancellation_notified_at).getTime()).toBe(
        new Date(cancelled.rows[0].slot_cancelled_at).getTime()
      )

      const active = await client.query(
        `SELECT cancellation_notified_at FROM bookings WHERE id = $1`,
        [activeBooking.rows[0].id]
      )
      expect(active.rows[0].cancellation_notified_at).toBeNull()

      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })

  it('est idempotente : la migration peut être rejouée sans erreur', async () => {
    const client = await getClient()
    try {
      await client.query('BEGIN')
      await client.query(MIGRATION_SQL)
      await client.query(MIGRATION_SQL)
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })
})
