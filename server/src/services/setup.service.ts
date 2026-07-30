import jwt from 'jsonwebtoken'
import { getClient, getTransactionClient } from '../db'
import { ADVISORY_LOCKS } from '../db/advisory-locks'
import { frontendBaseUrl } from '../utils/frontendUrl'

const JWT_SECRET = process.env.JWT_SECRET!
const BOOTSTRAP_TTL_SECONDS = 24 * 60 * 60

export function generateBootstrapAdminLink(
  email: string,
  firstName: string,
  lastName?: string,
): { link: string; expirationDate: Date } {
  const exp = Math.floor(Date.now() / 1000) + BOOTSTRAP_TTL_SECONDS
  const token = jwt.sign({ bootstrap: true, email, firstName, lastName, role: 'admin', exp }, JWT_SECRET)
  return { link: `${frontendBaseUrl()}/login?token=${token}`, expirationDate: new Date(exp * 1000) }
}

export type CreateAdminResult = { id: string } | 'locked' | 'exists'

export async function createFirstAdminAtomic(
  email: string,
  firstName?: string,
  lastName?: string,
): Promise<CreateAdminResult> {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const lock = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) as acquired',
      [ADVISORY_LOCKS.SETUP_FIRST_ADMIN]
    )
    if (!lock.rows[0].acquired) {
      await client.query('ROLLBACK')
      return 'locked'
    }
    const cnt = await client.query(
      "SELECT COUNT(*)::int as count FROM users WHERE role = 'admin'"
    )
    if (cnt.rows[0].count > 0) {
      await client.query('ROLLBACK')
      return 'exists'
    }
    // `users.first_name` est NOT NULL : un appel sans prénom (token bootstrap
    // antérieur au wizard nominatif) doit connecter la personne, pas rendre 500.
    const r = await client.query(
      "INSERT INTO users (email, first_name, last_name, role) VALUES ($1, $2, $3, 'admin') RETURNING id",
      [email, firstName?.trim() || 'Administrateur', lastName?.trim() || null]
    )
    await client.query('COMMIT')
    return { id: r.rows[0].id }
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (rbErr) { console.error('[setup] ROLLBACK after createFirstAdmin failure also failed:', rbErr) }
    throw e
  } finally {
    if (getTransactionClient() === null) client.release()
  }
}
