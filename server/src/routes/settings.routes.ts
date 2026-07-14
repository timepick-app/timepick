import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { adminActionLimiter, testSendLimiter } from '../middleware/adminActionLimiter'
import {
  getSmtpSettingsHandler,
  saveSmtpSettingsHandler,
  testSmtpConnectionHandler,
  deleteSmtpSettingsHandler
} from '../controllers/settings.controller'
import {
  getEmailBrandSettingsHandler,
  patchEmailBrandSettingsHandler,
  resetEmailBrandSettingsHandler,
} from '../controllers/email-brand-settings.controller'
import {
  getEmailTemplateHandler,
  patchEmailTemplateHandler,
  resetAllEmailTemplatesHandler,
  testSendEmailTemplateHandler,
} from '../controllers/email-templates.controller'

const router = Router()

// Toutes les routes settings nécessitent l'authentification admin
router.use(requireAdmin)

// SMTP settings CRUD + test
router.get('/smtp', getSmtpSettingsHandler)
router.put('/smtp', saveSmtpSettingsHandler)
router.delete('/smtp', deleteSmtpSettingsHandler)
router.post('/smtp/test', testSmtpConnectionHandler)

// Email brand identity (singleton — used by renderEmail() shell)
router.get('/email-brand', getEmailBrandSettingsHandler)
router.patch('/email-brand', patchEmailBrandSettingsHandler)
router.post('/email-brand/reset', adminActionLimiter, resetEmailBrandSettingsHandler)

// Email templates (per-key bodies — used by E2.S4 and E2.S5 admin UI)
router.post('/email-templates/reset-all', adminActionLimiter, resetAllEmailTemplatesHandler)
router.get('/email-templates/:templateKey', getEmailTemplateHandler)
router.patch('/email-templates/:templateKey', patchEmailTemplateHandler)
router.post(
  '/email-templates/:templateKey/test-send',
  testSendLimiter,
  testSendEmailTemplateHandler,
)

export default router
