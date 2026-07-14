import { Router } from 'express';
import { generateToken, requestMagicLink, verifyMagicLink, refreshSession, resendInvitation } from '../controllers/auth.controller';
import { requireAdmin } from '../middleware/adminAuth';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// POST /api/auth/login - Demande de magic link (public)
router.post('/login', requestMagicLink);

// POST /api/auth/verify - Vérification du magic link (public)
router.post('/verify', verifyMagicLink);

// POST /api/auth/resend-invitation - Renvoyer une invitation expirée (public)
router.post('/resend-invitation', resendInvitation);

// POST /api/auth/refresh - Rafraîchissement de session (authentifié)
router.post('/refresh', requireAuth, refreshSession);

// POST /api/auth/generate-token - Générer un magic link pour un utilisateur (admin only)
router.post('/generate-token', requireAdmin, generateToken);

export default router;
