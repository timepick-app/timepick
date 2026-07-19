/**
 * Side-effect secret bootstrap entrypoint.
 *
 * MUST be imported on the FIRST line of `index.ts` and `prepare-db.ts` — before
 * any module that reads `process.env` at load time: `auth.service`/`auth.middleware`
 * throw immediately if `JWT_SECRET` is missing, and `db/pool` reads `DATABASE_URL`.
 * Importing this first guarantees `ENCRYPTION_KEY` and `JWT_SECRET` are already
 * populated in `process.env` (read from or generated into `server/data/`) before
 * those modules load.
 *
 * Side-effect only — the resolution logic itself lives in the pure module
 * `./utils/secret-bootstrap`.
 */
import dotenv from 'dotenv'
import { ensureSecret, ENCRYPTION_KEY_SPEC, JWT_SECRET_SPEC } from './utils/secret-bootstrap'

dotenv.config()
ensureSecret(ENCRYPTION_KEY_SPEC)
ensureSecret(JWT_SECRET_SPEC)
