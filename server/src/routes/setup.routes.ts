import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getSetupStatus, createFirstAdmin, checkSetupNotDone } from '../controllers/setup.controller';
import { saveSmtpSettingsHandler } from '../controllers/settings.controller';
import { getSetupSmtpConfigHandler, testSetupSmtpHandler } from '../controllers/setup-smtp.controller';

const router = Router();

const setupSmtpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Trop de requêtes.' } },
})

const setupSmtpTestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Trop de requêtes.' } },
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
 * Body: { email: string }
 *
 * Protégée par le middleware checkSetupNotDone pour empêcher la création
 * d'un admin après que le setup est déjà terminé.
 */
router.post('/create-admin', checkSetupNotDone, createFirstAdmin);

router.get('/smtp', checkSetupNotDone, setupSmtpLimiter, getSetupSmtpConfigHandler);
router.put('/smtp', checkSetupNotDone, setupSmtpLimiter, saveSmtpSettingsHandler);
router.post('/smtp/test', checkSetupNotDone, setupSmtpTestLimiter, testSetupSmtpHandler);

export default router;
