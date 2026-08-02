import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
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
  /**
   * Identifiant unique de ce lien (RFC 7519 « JWT ID »). Sans lui, deux émissions
   * faites dans la même seconde pour le même couple (utilisateur, événement)
   * produisent un payload identique, donc un JWT au bit près identique : un renvoi
   * ne renverrait pas un nouveau lien, il renverrait le même — et sous l'usage
   * unique, un lien déjà consommé. Le `jti` garantit qu'émettre, c'est créer.
   */
  jti: string;
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
    jti: randomUUID(),
    ...(eventId && { eventId }),
  };

  const token = jwt.sign(payload, JWT_SECRET);

  await persistMagicLinkToken(userId, token, exp);

  const frontendUrl = frontendBaseUrl();
  const link = `${frontendUrl}/login?token=${token}`;

  return { link, expirationDate };
}

/**
 * Empreinte de recherche d'un lien magique. C'est ELLE qui est stockée, jamais le
 * jeton : une fuite de `magic_link_tokens` ne livre alors aucun lien utilisable.
 *
 * sha256 nu, sans sel ni facteur de coût — contrairement aux codes de secours, qui
 * sont en bcrypt. Le secret protégé ici n'est pas un mot de passe humain mais un JWT
 * signé : sa seule signature HMAC-SHA256 porte plus de 128 bits d'entropie, donc ni
 * dictionnaire ni table arc-en-ciel n'ont prise, et un hachage lent ne ferait que
 * ralentir chaque connexion.
 *
 * Exportée parce que les tests en ont besoin pour retrouver la ligne d'un lien émis :
 * l'empreinte est le seul chemin d'un jeton vers sa trace en base, par construction.
 */
export function magicLinkTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Enregistre un lien magique émis, pour qu'il puisse être consommé UNE fois.
 *
 * Un enregistrement par lien, jamais un par utilisateur : plusieurs liens vivants
 * pour le même membre est le cas nominal (invitations à deux événements, relance
 * des non-répondants), et chacun doit se consommer séparément. C'est précisément
 * ce que l'ancienne colonne `users.magic_link_token` ne pouvait pas faire.
 *
 * Le jeton entre ici en clair et n'en ressort pas : seule son empreinte est écrite.
 */
export async function persistMagicLinkToken(userId: string, token: string, exp: number): Promise<void> {
  await query(
    `INSERT INTO magic_link_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, to_timestamp($3))`,
    [userId, magicLinkTokenHash(token), exp]
  );
}

/**
 * Consomme un lien magique : le marque utilisé et renvoie l'identifiant de son
 * propriétaire, ou `null` si le lien est inconnu (jamais émis par cette instance)
 * ou déjà consommé.
 *
 * L'UPDATE conditionnel se suffit à lui-même — ni transaction, ni `SELECT … FOR
 * UPDATE`. Sur deux `/auth/verify` simultanés portant le même lien, la seconde
 * requête attend le verrou de ligne, puis réévalue son `WHERE` sur la version
 * commitée par la première : `consumed_at` n'y est plus NULL, elle ne matche plus
 * rien et reçoit `null`. Exactement une session émise, sans code de synchronisation.
 *
 * Le `user_id` renvoyé vient de la BASE, pas du jeton : c'est lui qui fait foi.
 */
export async function consumeMagicLinkToken(token: string): Promise<string | null> {
  const result = await query(
    `UPDATE magic_link_tokens
     SET consumed_at = NOW()
     WHERE token_hash = $1 AND consumed_at IS NULL
     RETURNING user_id`,
    [magicLinkTokenHash(token)]
  );

  return result.rows[0]?.user_id ?? null;
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
