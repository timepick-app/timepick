import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

/**
 * Génère un token JWT pour les tests
 * @param userId - ID de l'utilisateur
 * @param expiresIn - Expiration (défaut: '1h')
 * @returns Token JWT valide
 */
export function generateTestToken(userId: string, expiresIn = '1h'): string {
  // Cast to any to bypass incorrect type definitions in @types/jsonwebtoken
  // The expiresIn option is valid but types are incorrect
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn } as any
  )
}

/**
 * Génère un magic link JWT pour les tests
 * @param userId - ID de l'utilisateur
 * @param ttl - TTL en secondes (défaut: 3600 = 1h)
 * @returns Token JWT valide pour magic link
 */
export function generateTestMagicLinkToken(userId: string, ttl: number = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttl
  return jwt.sign(
    { userId, exp },
    JWT_SECRET
  )
}
