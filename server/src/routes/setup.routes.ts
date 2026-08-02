import { ERROR_CODES } from '@timepick/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getSetupStatus, createFirstAdmin, checkSetupNotDone } from '../controllers/setup.controller';
import { saveSmtpSettingsHandler, deleteSmtpSettingsHandler } from '../controllers/settings.controller';
import { getSetupSmtpConfigHandler, testSetupSmtpHandler } from '../controllers/setup-smtp.controller';
import { getEmailProvidersCatalogHandler } from '../controllers/email-providers-catalog.controller';
import { getSetupEncryptionKeyStatus } from '../controllers/setup-encryption-key.controller';
import {
  getOrganizationHandler,
  putOrganizationSettingsHandler,
  uploadOrganizationLogoHandler,
  deleteOrganizationLogoHandler,
} from '../controllers/organization.controller';
import {
  organizationLogoUpload,
  organizationLogoMulterErrorHandler,
} from '../middleware/organizationLogoUpload';

const router = Router();

const setupSmtpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: ERROR_CODES.RATE_LIMITED, message: 'Trop de requêtes.' } },
})

// Les deux routes publiques qui déclenchent un envoi SMTP réel vers une adresse
// choisie par l'appelant. Sans borne, une instance fraîche au SMTP joignable est
// un relais de spam signé du domaine de l'exploitant. Budget commun : c'est un
// quota d'emails sortants, pas un quota par URL. 10 et non 5, mesuré : itérer
// sur un mot de passe SMTP puis corriger son adresse admin épuisait 5.
const setupEmailSendLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: ERROR_CODES.RATE_LIMITED, message: 'Trop de requêtes.' } },
})

// Status GET is a cheap read consumed by the wizard; its own limiter skips in
// test so the shared single-worker MemoryStore can't accumulate spurious 429s.
const setupEncryptionKeyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: ERROR_CODES.RATE_LIMITED, message: 'Trop de requêtes.' } },
})

// Routes publiques (pas d'auth middleware)
// Accessibles uniquement lors de la configuration initiale

/**
 * GET /api/setup/status
 * Retourne l'état de configuration initiale
 * { needsSetup: boolean }
 *
 * NOTE: Cette route n'est PAS protégée par checkSetupNotDone car le frontend
 * a besoin de connaître l'état du setup pour décider d'afficher ou non la page
 * de configuration.
 */
router.get('/status', getSetupStatus);

/**
 * POST /api/setup/create-admin
 * Crée le premier administrateur
 * Body: { email: string, firstName: string, lastName?: string }
 *
 * Protégée par le middleware checkSetupNotDone pour empêcher la création
 * d'un admin après que le setup est déjà terminé.
 */
router.post('/create-admin', checkSetupNotDone, setupEmailSendLimiter, createFirstAdmin);

router.get('/smtp', checkSetupNotDone, setupSmtpLimiter, getSetupSmtpConfigHandler);
router.put('/smtp', checkSetupNotDone, setupSmtpLimiter, saveSmtpSettingsHandler);
router.post('/smtp/test', checkSetupNotDone, setupEmailSendLimiter, testSetupSmtpHandler);
// Sortie de secours du wizard : si une config SMTP injoignable a été
// enregistrée en base, buildTransport() priorise cet hôte non vide sur le
// repli local, emailDeliverable devient false, et l'étape SMTP n'est plus
// sautable — sans ce miroir, l'utilisateur reste bloqué au milieu de son
// installation sans aucun chemin de retour dans l'interface. Réutilise le
// handler admin tel quel (clearSmtpSettings + clearEmailProviderConfig +
// invalidateTransportCache + 204) ; checkSetupNotDone fait disparaître la
// route (404) dès l'installation terminée, comme les autres routes /setup.
router.delete('/smtp', checkSetupNotDone, setupSmtpLimiter, deleteSmtpSettingsHandler);

// Chantier email-providers (B2) — catalogue public (métadonnées statiques,
// aucun secret), gate + rate-limit léger comme les autres routes /setup (contrat §1).
router.get('/email-providers', checkSetupNotDone, setupSmtpLimiter, getEmailProvidersCatalogHandler);

router.get('/encryption-key', checkSetupNotDone, setupEncryptionKeyLimiter, getSetupEncryptionKeyStatus);

// Chantier A1 — miroirs setup des routes admin /api/admin/settings/organization
// (mêmes contrats), gardés checkSetupNotDone + setupSmtpLimiter (même budget
// wizard : un humain seul reste très en dessous de 10 req/min, bucket partagé).
router.get('/organization', checkSetupNotDone, setupSmtpLimiter, getOrganizationHandler);
router.put('/organization', checkSetupNotDone, setupSmtpLimiter, putOrganizationSettingsHandler);
router.post(
  '/organization/logo',
  checkSetupNotDone,
  setupSmtpLimiter,
  organizationLogoUpload.single('logo'),
  uploadOrganizationLogoHandler,
);
router.delete('/organization/logo', checkSetupNotDone, setupSmtpLimiter, deleteOrganizationLogoHandler);

// Multer errors (LIMIT_FILE_SIZE, etc.) on `/organization/logo` reach here via `next(err)`.
router.use(organizationLogoMulterErrorHandler)

export default router;
