import { ERROR_CODES } from '@timepick/shared';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { sendSetupAdminEmail } from '../services/email.service';
import { adminEmailSchema } from '../utils/email-validation';
import { generateBootstrapAdminLink } from '../services/setup.service';

/**
 * Validation schema pour la création du premier admin
 */
const createAdminSchema = z.object({
  email: adminEmailSchema,
  // `.trim()` AVANT `.min(1)` : sinon un prénom d'espaces passe, l'email dit
  // « Bonjour , » et le repli D4 stocke « Administrateur ».
  firstName: z
    .string({ error: (issue) => issue.input === undefined ? 'Le prénom est requis' : undefined })
    .trim()
    .min(1, 'Le prénom est requis')
    .max(100, 'Le prénom ne peut pas dépasser 100 caractères'),
  lastName: z
    .string()
    .trim()
    .max(100, 'Le nom ne peut pas dépasser 100 caractères')
    .optional(),
});


/**
 * GET /api/setup/status
 * Retourne le statut de configuration initiale
 * @param req - Request Express
 * @param res - Response Express
 */
export const getSetupStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      "SELECT COUNT(*)::int as count FROM users WHERE role = 'admin'"
    );
    const needsSetup = result.rows[0].count === 0;
    res.json({ needsSetup });
  } catch (err) {
    console.error('Error checking setup status:', err);
    res.status(500).json({ error: 'Server Error' });
  }
};

/**
 * Middleware qui vérifie si le setup n'est pas déjà terminé
 *
 * Ce middleware protège uniquement la route POST /create-admin pour empêcher
 * la création d'un admin après que le setup est déjà terminé.
 *
 * Si un admin existe déjà, retourne 404 pour ne pas révéler d'informations.
 */
export async function checkSetupNotDone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await query(
      "SELECT COUNT(*)::int as count FROM users WHERE role = 'admin'"
    );

    if (result.rows[0].count > 0) {
      // Setup déjà terminé - retourner 404 pour ne pas révéler d'informations
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    next();
  } catch (err) {
    console.error('Error checking setup status in middleware:', err);
    // En cas d'erreur, on bloque la route par sécurité
    res.status(500).json({ error: 'Server Error' });
    return;
  }
}

/**
 * POST /api/setup/create-admin
 * Émet un lien bootstrap admin par email (aucun user créé ici).
 * La création réelle a lieu dans POST /api/auth/verify quand le token bootstrap est vérifié.
 * @param req - Request Express avec { email: string, firstName: string, lastName?: string }
 * @param res - Response Express
 */
export const createFirstAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, firstName, lastName } = createAdminSchema.parse(req.body)
    const { link, expirationDate } = generateBootstrapAdminLink(email, firstName, lastName)
    const sent = await sendSetupAdminEmail(email, link, expirationDate, firstName, lastName)
    if (!sent) {
      res.status(500).json({ error: { code: ERROR_CODES.EMAIL_SEND_FAILED, message: "Échec de l'envoi du lien. Vérifiez la configuration SMTP de l'étape précédente." } })
      return
    }
    res.status(202).json({ data: { message: 'Lien de connexion envoyé. Vérifiez votre boîte mail.' } })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0].message, details: err.issues })
      return
    }
    console.error('Error issuing first-admin bootstrap link:', err)
    res.status(500).json({ error: 'Erreur lors de la création du compte administrateur' })
  }
}
