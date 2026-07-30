import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAdmin } from '../middleware/adminAuth'
import { adminActionLimiter, testSendLimiter } from '../middleware/adminActionLimiter'
import {
  getSmtpSettingsHandler,
  saveSmtpSettingsHandler,
  testSmtpConnectionHandler,
  deleteSmtpSettingsHandler
} from '../controllers/settings.controller'
import { getEmailProvidersCatalogHandler } from '../controllers/email-providers-catalog.controller'
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
import {
  getOrganizationHandler,
  putOrganizationSettingsHandler,
  uploadOrganizationLogoHandler,
  deleteOrganizationLogoHandler,
} from '../controllers/organization.controller'
import {
  organizationLogoUpload,
  organizationLogoMulterErrorHandler,
} from '../middleware/organizationLogoUpload'

const router = Router()

// Toutes les routes settings nécessitent l'authentification admin
router.use(requireAdmin)

// SMTP settings CRUD + test
router.get('/smtp', getSmtpSettingsHandler)
router.put('/smtp', saveSmtpSettingsHandler)
router.delete('/smtp', deleteSmtpSettingsHandler)
router.post('/smtp/test', testSmtpConnectionHandler)

// Chantier email-providers (B2) — catalogue des fournisseurs HTTP (contrat §1/§3.1), aucun secret
router.get('/email-providers', getEmailProvidersCatalogHandler)

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

// Chantier A1 — identité de l'organisation (contrat §Q1-Q4)
router.get('/organization', getOrganizationHandler)
router.put('/organization', putOrganizationSettingsHandler)

// Même profil que `uploadLimiter` (uploads.routes.ts:18-24) — 30 requêtes/min/IP.
const organizationLogoLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute' },
})

router.post(
  '/organization/logo',
  organizationLogoLimiter,
  organizationLogoUpload.single('logo'),
  uploadOrganizationLogoHandler,
)
router.delete('/organization/logo', deleteOrganizationLogoHandler)

// Multer errors (LIMIT_FILE_SIZE, etc.) on `/organization/logo` reach here via
// `next(err)`. Every other route above already try/catches internally.
router.use(organizationLogoMulterErrorHandler)

export default router
