import { z } from 'zod';

/**
 * Schéma de validation pour la demande de magic link (public)
 * Utilisé pour l'endpoint POST /api/auth/login
 */
export const requestMagicLinkSchema = z.object({
  email: z.string().email('Format d\'email invalide'),
  next: z.string().optional(),
});

/**
 * Schéma de validation pour la vérification du magic link (public)
 * Utilisé pour l'endpoint POST /api/auth/verify
 */
export const verifyMagicLinkSchema = z.object({
  token: z.string().min(1, 'Token requis'),
});
