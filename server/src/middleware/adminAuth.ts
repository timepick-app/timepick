import { Request, Response, NextFunction } from 'express'
import { ERROR_CODES } from '@timepick/shared'
import { requireAuth } from './auth.middleware'

/**
 * Admin guard = requireAuth (token + user-exists + role/has_member_access from DB)
 * puis vérification du rôle. Délègue tout le flux d'authentification à requireAuth
 * (plus de vérification de token ni de requête SQL dupliquées).
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await requireAuth(req, res, () => {
    if (req.user?.role === 'admin') {
      next()
    } else {
      res.status(403).json({ error: 'Accès réservé aux administrateurs. Demandez les droits à un administrateur de votre organisation.', code: ERROR_CODES.ADMIN_ONLY })
    }
  })
}
