import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { getTransportStatus, checkSmtpConnection, getEncryptionKeyMismatch } from '../services/email.service'
import { query } from '../db'

const router = Router()

// GET /api/admin/health — detailed status for authenticated admins (DB + SMTP)
router.get('/health', requireAdmin, async (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'ok'
  try {
    await query('SELECT 1')
  } catch {
    dbStatus = 'error'
  }

  let smtpHealthy = getTransportStatus().healthy
  if (smtpHealthy === null) {
    smtpHealthy = await checkSmtpConnection()
  }

  const smtpStatus: 'ok' | 'error' | 'unknown' =
    smtpHealthy === true ? 'ok' : smtpHealthy === false ? 'error' : 'unknown'

  const encryptionKeyMismatch = getEncryptionKeyMismatch()

  res.json({
    status: dbStatus === 'ok' && smtpHealthy !== false && !encryptionKeyMismatch ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus },
      smtp: { status: smtpStatus, healthy: smtpHealthy },
      encryptionKey: { mismatch: encryptionKeyMismatch },
    },
  })
})

export default router
