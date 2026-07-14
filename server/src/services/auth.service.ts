import jwt from 'jsonwebtoken';
import { query } from '../db';
import { frontendBaseUrl } from '../utils/frontendUrl';

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

interface GenerateMagicLinkOptions {
  userId: string;
  eventId?: string;
  ttl?: number; // TTL en secondes
}

interface MagicLinkPayload {
  userId: string;
  exp: number;
  eventId?: string;
}

interface MagicLinkResult {
  link: string;
  expirationDate: Date;
}

/**
 * Génère un magic link JWT pour un utilisateur
 * @param options - userId obligatoire, eventId et ttl optionnels
 * @returns Le magic link complet avec sa date d'expiration
 * @throws Error si ttl absent
 */
export async function generateMagicLink(options: GenerateMagicLinkOptions): Promise<MagicLinkResult> {
  const { userId, eventId, ttl } = options;

  let exp: number;
  let expirationDate: Date;
  if (ttl) {
    exp = Math.floor(Date.now() / 1000) + ttl;
    expirationDate = new Date(exp * 1000);
  } else {
    throw new Error('ttl must be provided to generate a magic link');
  }

  const payload: MagicLinkPayload = {
    userId,
    exp,
    ...(eventId && { eventId }),
  };

  const token = jwt.sign(payload, JWT_SECRET);

  await query(
    `UPDATE users
     SET magic_link_token = $1, token_expires_at = to_timestamp($2)
     WHERE id = $3`,
    [token, exp, userId]
  );

  const frontendUrl = frontendBaseUrl();
  const link = `${frontendUrl}/login?token=${token}`;

  return { link, expirationDate };
}

/**
 * Vérifie un magic link token
 * (Pour la story 2.7 - Connexion via Magic Link)
 */
export async function verifyToken(token: string): Promise<MagicLinkPayload | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as MagicLinkPayload;
    return payload;
  } catch (error) {
    return null;
  }
}
