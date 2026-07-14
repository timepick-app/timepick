/**
 * Routes for `PUT /api/admin/shell-parts/:ownerKind/:ownerId/:partKind`.
 *
 * `requireAdmin` is wired per-route rather than via `router.use(...)` so a
 * future handler added before this line cannot accidentally inherit the
 * router-level middleware order and ship without auth (defence-in-depth
 * against a fragile Express pattern).
 *
 * CORS preflight: `cors()` is mounted globally at the top of `app.ts`, so
 * `OPTIONS` requests respond before reaching this router and never hit
 * `requireAdmin` — cross-origin clients are not blocked at preflight.
 */

import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import {
  deleteShellPartHandler,
  putShellPartHandler,
} from '../controllers/shell-parts.controller'

const router = Router()

router.put('/:ownerKind/:ownerId/:partKind', requireAdmin, putShellPartHandler)
router.delete('/:ownerKind/:ownerId/:partKind', requireAdmin, deleteShellPartHandler)

export default router
