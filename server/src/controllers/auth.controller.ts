import { ERROR_CODES } from '@timepick/shared';
import { Request, Response } from 'express';
import { query } from '../db';
import { consumeMagicLinkToken, generateMagicLink, persistMagicLinkToken } from '../services/auth.service';
import { configService } from '../services/config.service';
import { sendAdminMagicLinkEmail, sendUserMagicLinkEmail } from '../services/email.service';
import { requestMagicLinkSchema, verifyMagicLinkSchema } from '../validators/auth.validator';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { invitationsService } from '../services/invitations.service';
import { NotFoundError } from '../errors/NotFoundError';
import { EmailDeliveryError } from '../errors/EmailDeliveryError';
import { frontendBaseUrl } from '../utils/frontendUrl';
import { isSafeInternalPath } from '../utils/safeRedirect';
import { createFirstAdminAtomic } from '../services/setup.service';

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

// Format UUID, partagé par verifyMagicLink et resendInvitation.
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nom d'un événement, pour le contexte d'un lien rejeté. Best-effort : une erreur
 * DB laisse le contexte partiel plutôt que de masquer la cause réelle du rejet.
 */
const fetchEventName = async (eventId: string): Promise<string | undefined> => {
  try {
    const result = await query('SELECT name FROM events WHERE id = $1', [eventId]);
    return result.rows[0]?.name;
  } catch (queryError) {
    console.error('Error fetching event name for rejected token:', queryError);
    return undefined;
  }
};

/**
 * Rôle DÉRIVÉ de la base, jamais lu d'un claim du token. Pilote le repli « code de
 * secours » côté client. false si l'utilisateur est introuvable ou la requête échoue.
 */
const isUserAdmin = async (userId: string): Promise<boolean> => {
  try {
    const result = await query('SELECT role FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.role === 'admin';
  } catch (queryError) {
    console.error('Error fetching user role for rejected token:', queryError);
    return false;
  }
};

/**
 * Journalise le motif d'un lien de connexion refusé.
 *
 * Le corps de la réponse porte déjà le code exact, mais rien de ce corps n'atteint
 * les journaux : morgan n'y met que méthode, URL et statut. Un refus y apparaît donc
 * comme un `401` indifférencié, alors que les motifs appellent des remèdes opposés —
 * lien déjà utilisé : la session est trop courte face au lien ; expiré : le TTL du
 * lien est trop court ; invalide : un client mail tronque le lien, ou quelqu'un essaie.
 *
 * JAMAIS le jeton, pas même un préfixe : un lien de connexion EST une session, c'est
 * la raison d'être du masquage posé sur le journal d'accès (app.ts).
 */
const logRejectedMagicLink = (code: string, reason?: string): void => {
  console.warn('[Auth][verify] lien refusé', reason ? { code, reason } : { code });
};

/**
 * Interface commune pour le payload du magic link JWT
 * Contient tous les champs possibles qui peuvent être inclus lors de la génération
 */
interface MagicLinkPayload {
  userId: string;
  exp: number;
  /** Unicité du lien émis — voir MagicLinkPayload dans auth.service.ts. Absent des
   *  jetons bootstrap, qui ne sont pas enregistrés. */
  jti?: string;
  role?: 'admin' | 'user';
  redirectAfterLogin?: string;
  eventId?: string;
  bootstrap?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
}

// Schéma de validation pour generate-token
const generateTokenSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  eventId: z.string().uuid().optional(),
});

/**
 * POST /api/auth/generate-token
 * Génère un magic link pour un utilisateur (endpoint interne pour les admins)
 *
 * @security Admin only (à vérifier via middleware requireAdmin)
 */
export const generateToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validation
    const { userId, eventId } = generateTokenSchema.parse(req.body);

    // Vérifier que l'utilisateur existe
    const userResult = await query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'Utilisateur non trouvé',
        },
      });
      return;
    }

    const magicLinkConfig = await configService.getMagicLinkConfig();

    // Générer le magic link
    const { link: magicLink } = await generateMagicLink({
      userId,
      eventId,
      ttl: magicLinkConfig.adminTTL,
    });

    res.status(200).json({
      data: {
        magicLink,
        userId,
        ...(eventId && { eventId }),
      },
      message: 'Magic link généré avec succès',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: error.issues[0].message,
        },
      });
      return;
    }

    console.error('Error generating magic link:', error);
    res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Erreur lors de la génération du magic link',
      },
    });
  }
};

/**
 * POST /api/auth/verify
 * Vérifie un magic link et connecte l'utilisateur
 *
 * @security Pas d'authentification requise (endpoint public)
 *
 * Flow:
 * 1. Valide le token JWT du magic link
 * 2. Vérifie que l'utilisateur existe toujours
 * 3. Crée un nouveau token de session avec expiration configurée (via admin panel, défaut: 2h)
 * 4. Retourne le token de session + infos utilisateur + redirection
 */
export const verifyMagicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validation du body
    const { token } = verifyMagicLinkSchema.parse(req.body);

    // Vérifier et décoder le JWT

    let magicLinkPayload: MagicLinkPayload;
    try {
      magicLinkPayload = jwt.verify(token, JWT_SECRET) as MagicLinkPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        // Tenter de décoder le token expiré pour fournir du contexte
        // jwt.decode() est sûr ici car on ne prend aucune décision d'authentification basée sur ce résultat
        const decoded = jwt.decode(token) as { userId?: string; eventId?: string; exp?: number } | null;

        let eventName: string | undefined;
        let eventId: string | undefined;
        let expiredAt: string | undefined;
        let canResend = false;
        let isAdmin = false;

        if (decoded?.eventId) {
          eventId = decoded.eventId;
          eventName = await fetchEventName(eventId);
          canResend = true;
          // Best-effort : enregistrer le clic même sur lien expiré (signature JWT valide).
          // Ne lève jamais — markAsClicked absorbe toute erreur DB.
          if (decoded.userId && uuidRegex.test(decoded.userId)) {
            await invitationsService.markAsClicked(decoded.eventId!, decoded.userId);
          }
        } else if (decoded?.userId && uuidRegex.test(decoded.userId)) {
          // Token de connexion sans eventId (lien admin/user émis par /auth/login) :
          // le renvoi par identité est possible. Dans la branche TokenExpiredError, la
          // signature est DÉJÀ validée par jwt.verify (jwt ne lève TokenExpiredError que
          // si signature OK + exp dépassée), donc le userId de jwt.decode est fiable ici.
          // isAdmin est DÉRIVÉ du rôle DB (jamais lu du token) ; false si user introuvable.
          canResend = true;
          isAdmin = await isUserAdmin(decoded.userId);
        }

        if (decoded?.exp) {
          expiredAt = new Date(decoded.exp * 1000).toISOString();
        }

        logRejectedMagicLink(ERROR_CODES.TOKEN_EXPIRED);
        res.status(401).json({
          error: {
            code: ERROR_CODES.TOKEN_EXPIRED,
            message: 'Ce lien a expiré.',
            context: {
              eventName,
              eventId,
              expiredAt,
              canResend,
              isAdmin,
            },
          },
        });
        return;
      }
      if (err instanceof jwt.JsonWebTokenError) {
        // `reason` vient de jsonwebtoken (« jwt malformed », « invalid signature »…) :
        // un libellé fixe, qui ne contient jamais le jeton. C'est lui qui distingue
        // un lien tronqué par un client mail d'une signature qui ne colle pas.
        logRejectedMagicLink(ERROR_CODES.INVALID_TOKEN, err.message);
        res.status(401).json({
          error: {
            code: ERROR_CODES.INVALID_TOKEN,
            message: 'Lien de connexion invalide.',
          },
        });
        return;
      }
      if (err instanceof jwt.NotBeforeError) {
        logRejectedMagicLink(ERROR_CODES.TOKEN_NOT_ACTIVE);
        res.status(401).json({
          error: {
            code: ERROR_CODES.TOKEN_NOT_ACTIVE,
            message: 'Ce lien n\'est pas encore actif.',
          },
        });
        return;
      }
      // Pour toute autre erreur JWT, retourner 401
      logRejectedMagicLink(ERROR_CODES.INVALID_TOKEN, 'erreur jwt non typée');
      res.status(401).json({
        error: {
          code: ERROR_CODES.INVALID_TOKEN,
          message: 'Lien de connexion invalide.',
        },
      });
      return;
    }

    // Branche bootstrap : token émis par generateBootstrapAdminLink (setup initial).
    // Crée l'admin atomiquement ici (advisory lock + INSERT), puis laisse le flux
    // normal (chargement user + émission session) continuer avec le nouvel userId.
    if (magicLinkPayload.bootstrap) {
      if (!magicLinkPayload.email) {
        logRejectedMagicLink(ERROR_CODES.INVALID_TOKEN, 'bootstrap sans email')
        res.status(401).json({ error: { code: ERROR_CODES.INVALID_TOKEN, message: 'Lien de connexion invalide.' } })
        return
      }
      const created = await createFirstAdminAtomic(
        magicLinkPayload.email,
        magicLinkPayload.firstName,
        magicLinkPayload.lastName,
      )
      if (created === 'locked') {
        logRejectedMagicLink(ERROR_CODES.SETUP_IN_PROGRESS)
        res.status(409).json({ error: { code: ERROR_CODES.SETUP_IN_PROGRESS, message: 'Configuration en cours, réessayez.' } })
        return
      }
      if (created === 'exists') {
        logRejectedMagicLink(ERROR_CODES.SETUP_ALREADY_DONE)
        res.status(401).json({ error: { code: ERROR_CODES.SETUP_ALREADY_DONE, message: 'La configuration est déjà terminée. Connectez-vous via la page de connexion.' } })
        return
      }
      magicLinkPayload.userId = created.id
    }

    // Valider que le userId est un UUID valide avant la requête BDD
    if (!magicLinkPayload.userId || !uuidRegex.test(magicLinkPayload.userId)) {
      logRejectedMagicLink(ERROR_CODES.INVALID_TOKEN, 'userId absent ou mal formé');
      res.status(401).json({
        error: {
          code: ERROR_CODES.INVALID_TOKEN,
          message: 'Lien de connexion invalide.',
        },
      });
      return;
    }

    // Consommer le lien : il ne vaut que pour UNE connexion. C'est la ligne renvoyée
    // par la base qui fait foi — un JWT correctement signé mais absent de
    // magic_link_tokens (jamais émis par cette instance, ou déjà consommé) n'ouvre
    // plus de session, quelle que soit sa date d'expiration.
    //
    // EXEMPTION BOOTSTRAP — ce n'est pas un oubli. Le lien du premier administrateur
    // est signé par setup.service.ts alors que le compte n'existe pas encore : il ne
    // peut pas avoir de ligne dans magic_link_tokens, dont user_id référence users.
    // Son usage unique est garanti autrement, et depuis toujours : au second clic,
    // createFirstAdminAtomic trouve l'admin déjà créé, renvoie 'exists', et le flux
    // répond 401 SETUP_ALREADY_DONE une trentaine de lignes plus haut.
    if (!magicLinkPayload.bootstrap) {
      const consumedUserId = await consumeMagicLinkToken(token);

      if (!consumedUserId) {
        const usedEventId = magicLinkPayload.eventId;
        logRejectedMagicLink(ERROR_CODES.TOKEN_ALREADY_USED);
        res.status(401).json({
          error: {
            code: ERROR_CODES.TOKEN_ALREADY_USED,
            message: 'Ce lien de connexion a déjà été utilisé.',
            context: {
              eventName: usedEventId ? await fetchEventName(usedEventId) : undefined,
              eventId: usedEventId,
              canResend: true,
              isAdmin: await isUserAdmin(magicLinkPayload.userId),
            },
          },
        });
        return;
      }

      // L'identité vient désormais de la base, plus du seul porteur du lien.
      magicLinkPayload.userId = consumedUserId;
    }

    // Vérifier que l'utilisateur existe toujours
    const userResult = await query(
      'SELECT id, email, first_name, last_name, role, EXISTS(SELECT 1 FROM event_users WHERE user_id = $1) AS has_member_access FROM users WHERE id = $1',
      [magicLinkPayload.userId]
    );

    if (userResult.rows.length === 0) {
      logRejectedMagicLink(ERROR_CODES.USER_NOT_FOUND);
      res.status(401).json({
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'Utilisateur non trouvé.',
        },
      });
      return;
    }

    const user = userResult.rows[0];

    // Récupérer le TTL de session depuis la configuration
    // NOTE: Ce changement n'affecte que les NOUVELLES sessions créées après ce moment.
    // Les sessions existantes continuent avec leur expiration originale. C'est le
    // comportement attendu (AC7) - la configuration s'applique immédiatement aux
    // nouvelles connexions, mais ne déconnecte pas les utilisateurs déjà connectés.
    const sessionTTL = await configService.getSessionTTL();

    // Créer un nouveau token de session avec expiration dynamique
    const sessionPayload: { userId: string; role: string; hasMemberAccess: boolean } = {
      userId: user.id,
      role: user.role,
      hasMemberAccess: Boolean(user.has_member_access),
    };
    const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: sessionTTL });

    // Construire la réponse
    const responseData: {
      token: string;
      sessionTTL: number;
      user: {
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        role: string;
        has_member_access: boolean;
      };
      redirectAfterLogin?: string;
      eventId?: string;
    } = {
      token: sessionToken,
      sessionTTL,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        has_member_access: Boolean(user.has_member_access),
      },
    };

    // Inclure redirectAfterLogin si présent dans le magic link
    if (magicLinkPayload.redirectAfterLogin) {
      responseData.redirectAfterLogin = magicLinkPayload.redirectAfterLogin;
    }

    // Inclure eventId si présent (pour accès événement)
    if (magicLinkPayload.eventId) {
      responseData.eventId = magicLinkPayload.eventId;
      // Best-effort: tracking du clic d'invitation. N'échoue jamais (géré dans le service).
      await invitationsService.markAsClicked(magicLinkPayload.eventId, user.id);
    }

    res.status(200).json({
      data: responseData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: error.issues[0].message,
        },
      });
      return;
    }

    console.error('Error verifying magic link:', error);
    res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Une erreur est survenue lors de la connexion.',
      },
    });
  }
};

/**
 * POST /api/auth/refresh
 * Rafraîchit une session active (prolonge le token)
 *
 * @security Nécessite un token JWT valide (non expiré)
 *
 * Flow:
 * 1. Vérifie que le token actuel est valide (non expiré)
 * 2. Génère un nouveau token avec le même TTL configuré
 * 3. Retourne le nouveau token et sa timestamp d'expiration
 */
export const refreshSession = async (req: Request, res: Response): Promise<void> => {
  try {
    // L'utilisateur est déjà vérifié par le middleware requireAuth
    // req.user est disponible grâce au middleware
    const userId = req.user?.userId;
    const role = req.user?.role;

    if (!userId || !role) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.INVALID_TOKEN,
          message: 'Token invalide.',
        },
      });
      return;
    }

    // Vérifier que l'utilisateur existe toujours
    const userResult = await query(
      'SELECT id, role, EXISTS(SELECT 1 FROM event_users WHERE user_id = $1) AS has_member_access FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'Utilisateur non trouvé.',
        },
      });
      return;
    }

    // Récupérer le TTL de session depuis la configuration
    const sessionTTL = await configService.getSessionTTL();
    const now = Math.floor(Date.now() / 1000);

    // Générer un nouveau token de session avec un iat pour garantir l'unicité
    const sessionPayload = {
      userId,
      role,
      hasMemberAccess: Boolean(userResult.rows[0].has_member_access),
      iat: now, // Ajouter iat pour garantir un token différent à chaque appel
    };

    const newToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: sessionTTL });
    res.status(200).json({
      data: {
        token: newToken,
        expiresAt: now + sessionTTL,
      },
    });
  } catch (error) {
    console.error('Error refreshing session:', error);
    res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Une erreur est survenue lors du rafraîchissement de la session.',
      },
    });
  }
};

/**
 * Émet un magic link frais pour un utilisateur et l'envoie par email.
 *
 * SOURCE UNIQUE de génération d'un lien de connexion « par identité » : utilisée par
 * requestMagicLink (flux /auth/login) ET par le renvoi par identité de resendInvitation
 * (token sans eventId). Tout — TTL/exp selon le rôle, redirect, claim `role` du payload,
 * email destinataire — est DÉRIVÉ de la ligne `users` fournie par l'appelant (jamais
 * d'un claim de token côté renvoi).
 *
 * @returns true si l'email a été envoyé, false sinon (service email indisponible).
 */
const issueAndSendMagicLinkForUser = async (user: {
  id: string;
  email: string;
  role: 'admin' | 'user';
  first_name: string | null;
  last_name: string | null;
}, next?: string): Promise<boolean> => {
  const role = user.role;

  // Récupérer la configuration des magic links
  const magicLinkConfig = await configService.getMagicLinkConfig();

  // Calculer l'expiration selon le rôle
  const now = Math.floor(Date.now() / 1000);
  const ttl = role === 'admin' ? magicLinkConfig.adminTTL : magicLinkConfig.userTTL;
  const exp = now + ttl;
  const ttlMinutes = Math.round(ttl / 60); // Convertir en minutes pour l'email

  // Redirection post-login : préserve `next` s'il est sûr (chemin interne),
  // sinon défaut selon le rôle (admin → /admin, user → /me). D5 story 1.4.
  const redirectAfterLogin = isSafeInternalPath(next) ? next : role === 'admin' ? '/admin' : '/me';

  // Créer le payload JWT avec redirect (utilise l'interface MagicLinkPayload unifiée)
  const payload: MagicLinkPayload = {
    userId: user.id,
    exp,
    jti: randomUUID(),
    role,
    redirectAfterLogin,
  };

  // Générer le token
  const token = jwt.sign(payload, JWT_SECRET);

  // Enregistrer le lien pour qu'il ne serve qu'une fois (cf. auth.service).
  await persistMagicLinkToken(user.id, token, exp);

  // Générer le magic link complet
  // Base URL frontend via APP_URL (source unique — cf. utils/frontendUrl).
  const frontendUrl = frontendBaseUrl();
  const magicLink = `${frontendUrl}/login?token=${token}`;

  // Envoyer l'email approprié selon le rôle
  const emailSent = role === 'admin'
    ? await sendAdminMagicLinkEmail(user.email, magicLink, ttlMinutes, undefined, true, user.first_name, user.last_name)
    : await sendUserMagicLinkEmail(user.email, magicLink, ttlMinutes, undefined, user.first_name, user.last_name);

  return emailSent;
};

/**
 * POST /api/auth/login
 * Demande de magic link (public)
 *
 * @security Pas d'authentification requise (endpoint public)
 * @security Pas de disclosure d'email (même réponse si trouvé ou non)
 */
export const requestMagicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validation
    const { email, next } = requestMagicLinkSchema.parse(req.body);

    // Chercher l'utilisateur par email (case-insensitive)
    const userResult = await query(
      'SELECT id, email, role, first_name, last_name FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );

    // IMPORTANT: Même réponse si utilisateur trouvé ou non (sécurité - pas de disclosure)
    if (userResult.rows.length === 0) {
      // Email non trouvé - on retourne 200 quand même pour éviter l'énumération
      res.status(200).json({
        data: {
          message: 'Si cet email est enregistré, vous recevrez un lien de connexion.'
        }
      });
      return;
    }

    const user = userResult.rows[0];
    const emailSent = await issueAndSendMagicLinkForUser(user, next);

    if (!emailSent) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] Failed to send magic link email to ${user.email} - userId: ${user.id}`);
      res.status(503).json({
        error: {
          code: ERROR_CODES.EMAIL_SERVICE_UNAVAILABLE,
          message: "Le service d'envoi d'email est temporairement indisponible. Veuillez réessayer dans quelques minutes."
        }
      });
      return;
    }

    // Réponse succès (même message que si email non trouvé)
    res.status(200).json({
      data: {
        message: 'Si cet email est enregistré, vous recevrez un lien de connexion.'
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: error.issues[0].message,
        },
      });
      return;
    }

    console.error('Error requesting magic link:', error);
    res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Une erreur est survenue. Veuillez réessayer.',
      },
    });
  }
};

// Rate limiting in-memory pour resendInvitation
// Clé: `${userId}:${eventId}`, Valeur: timestamp de la dernière requête
const resendRateLimitMap = new Map<string, number>();
const RESEND_RATE_LIMIT_MS = 60 * 1000; // 60 secondes
const RESEND_CLEANUP_MS = 120 * 1000; // 120 secondes

/**
 * Rate-limit partagé du renvoi (in-memory). Purge les entrées périmées puis :
 * renvoie les secondes restantes si `key` est encore dans la fenêtre, sinon
 * enregistre `now` et renvoie null (requête autorisée).
 */
const resendRateLimitRemaining = (key: string, now: number): number | null => {
  for (const [k, ts] of resendRateLimitMap.entries()) {
    if (now - ts > RESEND_CLEANUP_MS) resendRateLimitMap.delete(k);
  }
  const last = resendRateLimitMap.get(key);
  if (last && now - last < RESEND_RATE_LIMIT_MS) {
    return Math.ceil((RESEND_RATE_LIMIT_MS - (now - last)) / 1000);
  }
  resendRateLimitMap.set(key, now);
  return null;
};

/**
 * Réémet un lien de connexion « par identité » pour une ligne users déjà résolue :
 * rate-limit (clé `${id}:identity`), puis issueAndSendMagicLinkForUser, puis réponse
 * générique. Partagé par le renvoi par identité (token /auth/login) et le renvoi
 * post-setup (token bootstrap résolu par email). Rôle/TTL/redirect/email re-dérivés DB.
 */
const reissueMagicLinkForUserRow = async (
  row: { id: string; email: string; role: 'admin' | 'user'; first_name: string | null; last_name: string | null },
  res: Response,
): Promise<void> => {
  const wait = resendRateLimitRemaining(`${row.id}:identity`, Date.now());
  if (wait !== null) {
    res.status(429).json({ error: { code: ERROR_CODES.RATE_LIMITED, message: `Un lien a déjà été envoyé récemment. Veuillez patienter ${wait} seconde${wait > 1 ? 's' : ''}.` } });
    return;
  }
  const sent = await issueAndSendMagicLinkForUser(row);
  if (!sent) {
    res.status(503).json({ error: { code: ERROR_CODES.EMAIL_SERVICE_UNAVAILABLE, message: "Le service d'envoi d'email est temporairement indisponible. Veuillez réessayer plus tard." } });
    return;
  }
  res.status(200).json({ data: { message: 'Un nouveau lien vous a été envoyé par email.' } });
};

/**
 * POST /api/auth/resend-invitation
 * Renvoie une invitation expirée (endpoint public)
 *
 * @security Pas d'authentification requise (endpoint public)
 * @security Signature du token vérifiée (jwt.verify, expiration tolérée) : seul un token authentique aboutit, d'où un retour générique pour un token forgé (pas d'énumération) mais honnête pour un token valide
 * @security Rate limiting: 1 requête par minute par userId+eventId
 */
export const resendInvitation = async (req: Request, res: Response): Promise<void> => {
  // Schéma de validation
  const resendSchema = z.object({
    token: z.string().min(1, 'Token requis'),
  });

  try {
    const { token } = resendSchema.parse(req.body);

    // Vérifier la signature du token en tolérant l'expiration
    let decoded: { userId?: string; eventId?: string; bootstrap?: boolean; email?: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as { userId?: string; eventId?: string; bootstrap?: boolean; email?: string };
    } catch (verifyError) {
      // Signature invalide ou token malformé → réponse générique 200, pas d'énumération
      console.error('Resend invitation: signature de token invalide:', verifyError);
      res.status(200).json({ data: { message: 'Un nouveau lien vous a été envoyé par email.' } });
      return;
    }

    // Token bootstrap (setup déjà fait) : pas de userId, email signé de confiance.
    // Réémet un lien de connexion normal pour l'admin résolu par email.
    if (decoded.bootstrap && decoded.email) {
      const adminResult = await query(
        'SELECT id, email, role, first_name, last_name FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [decoded.email]
      );
      if (adminResult.rows.length === 0) {
        res.status(200).json({ data: { message: 'Un nouveau lien vous a été envoyé par email.' } });
        return;
      }
      await reissueMagicLinkForUserRow(adminResult.rows[0], res);
      return;
    }

    // Sans userId fiable dans le token → succès générique (anti-énumération)
    if (!decoded.userId) {
      res.status(200).json({ data: { message: 'Un nouveau lien vous a été envoyé par email.' } });
      return;
    }

    // Chemin « renvoi par identité » : token de connexion SANS eventId (lien admin/user
    // émis par /auth/login). On ne fait JAMAIS confiance au role/redirect du token —
    // issueAndSendMagicLinkForUser re-dérive tout (rôle, redirect, email) depuis la ligne
    // users canonique. Ne JAMAIS router ce cas via invitationsService.resendInvitation.
    if (!decoded.eventId) {
      const identityUserId = decoded.userId;

      // Valider le format UUID avant toute requête DB : un token authentique porte un
      // userId UUID ; sinon → succès générique (et on évite une erreur de cast UUID SQL).
      if (!uuidRegex.test(identityUserId)) {
        res.status(200).json({ data: { message: 'Un nouveau lien vous a été envoyé par email.' } });
        return;
      }

      // Charger la ligne users canonique — seule source de vérité (email/rôle/redirect dérivés DB)
      const identityUserResult = await query(
        'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1',
        [identityUserId]
      );

      // User introuvable (signature valide mais ligne absente/supprimée) → succès générique
      // SANS email (anti-énumération : ni existence ni rôle divulgués).
      if (identityUserResult.rows.length === 0) {
        res.status(200).json({ data: { message: 'Un nouveau lien vous a été envoyé par email.' } });
        return;
      }

      await reissueMagicLinkForUserRow(identityUserResult.rows[0], res);
      return;
    }

    const { userId, eventId } = decoded;

    const wait = resendRateLimitRemaining(`${userId}:${eventId}`, Date.now());
    if (wait !== null) {
      res.status(429).json({
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: `Un lien a déjà été envoyé récemment. Veuillez patienter ${wait} seconde${wait > 1 ? 's' : ''}.`,
        },
      });
      return;
    }

    // Tenter de renvoyer l'invitation
    try {
      await invitationsService.resendInvitation(eventId, userId);
    } catch (resendError) {
      if (resendError instanceof NotFoundError) {
        res.status(422).json({ error: { code: ERROR_CODES.RESEND_NOT_AVAILABLE, message: "Impossible de renvoyer un lien pour cette invitation. Contactez l'administrateur." } });
        return;
      }
      if (resendError instanceof EmailDeliveryError) {
        console.error('Resend invitation: échec envoi email:', resendError);
        res.status(503).json({ error: { code: ERROR_CODES.EMAIL_SERVICE_UNAVAILABLE, message: "Le service d'envoi d'email est temporairement indisponible. Veuillez réessayer plus tard." } });
        return;
      }
      console.error('Resend invitation: erreur inattendue:', resendError);
      res.status(500).json({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Une erreur est survenue.' } });
      return;
    }

    res.status(200).json({ data: { message: 'Un nouveau lien vous a été envoyé par email.' } });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: error.issues[0].message,
        },
      });
      return;
    }

    console.error('Error resending invitation:', error);
    res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Une erreur est survenue.',
      },
    });
  }
};
