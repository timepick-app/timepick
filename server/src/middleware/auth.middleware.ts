import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../db'

const JWT_SECRET = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production')
}

interface JwtPayload {
  userId: string
  role: string
  hasMemberAccess?: boolean   // présent dans le session JWT (émis par verify/refresh, D2) — non trusté, recalculé depuis la DB ci-dessous
}


/**
 * Middleware pour vérifier que l'utilisateur est authentifié
 * Ne vérifie PAS le rôle - seulement la validité du token
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: "Token d'authentification requis" })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload

    // Verify the user still exists in database
    const result = await query(
      'SELECT id, role, EXISTS(SELECT 1 FROM event_users WHERE user_id = $1) AS has_member_access FROM users WHERE id = $1',
      [decoded.userId]
    )

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Utilisateur non trouvé' })
      return
    }

    // Add user info to request for downstream handlers
    req.user = { userId: decoded.userId, role: result.rows[0].role, hasMemberAccess: Boolean(result.rows[0].has_member_access) }
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expiré' })
      return
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Token invalide' })
      return
    }
    res.status(401).json({ error: 'Token invalide ou expiré' })
  }
}

/**
 * Middleware d'authentification optionnelle
 * Tente de décoder le token et définir req.user, mais ne bloque pas si pas de token
 * Utile pour les routes publiques qui ont un comportement différent selon l'auth
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization

  // Pas de header Authorization = pas d'utilisateur, continuer
  if (!authHeader?.startsWith('Bearer ')) {
    next()
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload

    // Verify the user still exists in database
    const result = await query(
      'SELECT id, role, EXISTS(SELECT 1 FROM event_users WHERE user_id = $1) AS has_member_access FROM users WHERE id = $1',
      [decoded.userId]
    )

    if (result.rows.length > 0) {
      // Add user info to request for downstream handlers
      req.user = { userId: decoded.userId, role: result.rows[0].role, hasMemberAccess: Boolean(result.rows[0].has_member_access) }
    }
    // Si utilisateur non trouvé, on continue sans req.user (token invalide = mode anonyme)
  } catch (err) {
    // Token invalide ou expiré = mode anonyme, on continue sans erreur
    // Le client recevra un 200 avec canReserve: false
  }

  next()
}
