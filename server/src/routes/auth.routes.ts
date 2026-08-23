import { ERROR_CODES } from '@timepick/shared';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { generateToken, requestMagicLink, verifyMagicLink, refreshSession, resendInvitation, logout } from '../controllers/auth.controller';
import { requireAdmin } from '../middleware/adminAuth';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * F-083 (bis, pentest 2026-08-19) : le limiter ci-dessous protège la CIBLE (clé email) mais
 * laisse un attaquant unique itérer sur des emails DIFFÉRENTS sans jamais être freiné —
 * chaque email ouvre son propre bucket. Second étage, monté EN SÉRIE avant `loginLimiter` :
 * clé IP (même fallback `ipKeyGenerator` que ci-dessous), profil plus large (30/min) car il
 * couvre TOUTE requête de cette IP, pas une cible unique. Orthogonal au premier étage :
 * celui-ci contient l'attaquant (par IP), l'autre protège la victime (par email visé).
 */
const loginIpLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Trop de demandes de connexion pour cet email. Veuillez patienter avant de réessayer.',
    },
  },
});

/**
 * F-083 (pentest 2026-08-19) : `/login` n'avait aucun rate-limit, permettant un
 * mail-bombing non authentifié de n'importe quelle adresse enregistrée (chaque appel
 * réussi déclenche un envoi SMTP réel). Clé par email cible (pas par IP) : c'est
 * l'adresse spammée qui doit être protégée, pas l'IP de l'attaquant (qui peut tourner) —
 * même logique que `resendInvitation` (auth.controller.ts). Profil 5/min aligné sur
 * `testSendLimiter` (adminActionLimiter.ts), le limiter existant le plus proche d'un
 * endpoint « envoie un email vers une cible arbitraire ».
 */
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || ipKeyGenerator(req.ip ?? '');
  },
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Trop de demandes de connexion pour cet email. Veuillez patienter avant de réessayer.',
    },
  },
});

// POST /api/auth/login - Demande de magic link (public)
router.post('/login', loginIpLimiter, loginLimiter, requestMagicLink);

// POST /api/auth/verify - Vérification du magic link (public)
router.post('/verify', verifyMagicLink);

// POST /api/auth/resend-invitation - Renvoyer une invitation expirée (public)
router.post('/resend-invitation', resendInvitation);

// POST /api/auth/refresh - Rafraîchissement de session (authentifié)
router.post('/refresh', requireAuth, refreshSession);

// POST /api/auth/logout - Révoque la session courante (F-085, authentifié)
router.post('/logout', requireAuth, logout);

// POST /api/auth/generate-token - Générer un magic link pour un utilisateur (admin only)
router.post('/generate-token', requireAdmin, generateToken);

export default router;
