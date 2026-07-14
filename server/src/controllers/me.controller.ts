import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import { meService } from '../services/me.service'
import { NotFoundError } from '../errors/NotFoundError'
import { ValidationError } from '../errors/ValidationError'
import {
  patchMeProfileSchema,
  formatZodError
} from '../validators/user.validator'

/**
 * Lister les événements du membre courant.
 * GET /api/me/events
 *
 * L'authentification (401) est déléguée au middleware `requireAuth` monté au
 * niveau du routeur — ce contrôleur NE réimplémente PAS le check de token (AC2).
 * `req.user.userId` est garanti présent par `requireAuth` (non-null assertion).
 */
export const getMyEvents = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId
    const events = await meService.getMyEvents(userId)
    res.json({ data: events })
  } catch (error) {
    console.error('[MeEvents] Error fetching member events:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des événements' })
  }
}

/**
 * Récupérer le profil complet du membre courant.
 * GET /api/me/profile
 *
 * Le GET est requis : le payload de login omet `phone`/`profession`/
 * `informations`, donc la page membre doit récupérer ces champs ici pour
 * pré-remplir le formulaire (smoke CP4). 401 délégué à `requireAuth`.
 */
export const getMyProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId
    const profile = await meService.getMyProfile(userId)
    if (!profile) {
      res.status(404).json({ error: 'Utilisateur non trouvé' })
      return
    }
    res.json({ data: profile })
  } catch (error) {
    console.error('[MeProfile] Error fetching profile:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' })
  }
}

/**
 * Mettre à jour le profil du membre courant.
 * PATCH /api/me/profile
 *
 * `patchMeProfileSchema` strip `role` et `email` (mass-assignment impossible,
 * AC6) et valide le téléphone (AC7). `userId` vient du token, jamais du body.
 * ZodError est capturée AVANT le catch générique pour renvoyer un 400 explicite.
 */
export const updateMyProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId
    const validated = patchMeProfileSchema.parse(req.body)
    const updated = await meService.updateMyProfile(userId, validated)
    res.json({ data: updated })
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: formatZodError(err) })
      return
    }
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message })
      return
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message })
      return
    }
    console.error('[MeProfile] Error updating profile:', err)
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' })
  }
}

/**
 * Lister les créneaux réservés du membre courant (à venir + passés paginés) et
 * le total d'heures réalisées.
 * GET /api/me/slots?cursor=<ISO>|<uuid>
 *
 * Curseur composite optionnel : STRING OPAQUE `"<ISO 8601 UTC>|<slot-uuid>"` du dernier
 * élément `past` de la page précédente. Absent = page 1. Format invalide → 400
 * « Curseur invalide » (AC7). 401 délégué à `requireAuth`.
 */
export const getMySlots = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId
    const cursor = parseCursor(req.query.cursor)
    const result = await meService.getMySlots(userId, cursor)
    res.json({ data: result })
  } catch (err) {
    // ValidationError = curseur invalide (AC7) → 400 explicite.
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message })
      return
    }
    console.error('[MeSlots] Error fetching member slots:', err)
    res
      .status(500)
      .json({ error: 'Erreur lors de la récupération des créneaux' })
  }
}

/**
 * Lister les créneaux futurs libres dans les événements du membre courant.
 * GET /api/me/available-slots
 *
 * Aucun paramètre de requête (pas de curseur, pas de fenêtre). 401 délégué à
 * `requireAuth`. Réponse `{ data: MyAvailableSlot[] }` (max 10).
 */
export const getMyAvailableSlots = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId
    const slots = await meService.getMyAvailableSlots(userId)
    res.json({ data: slots })
  } catch (err) {
    console.error('[MeAvailableSlots] Error fetching available slots:', err)
    res
      .status(500)
      .json({ error: 'Erreur lors de la récupération des créneaux disponibles' })
  }
}

/**
 * Parse le curseur de pagination `?cursor=<ISO>|<uuid>` en `{ start: Date; id: string } | null`.
 *
 * - `undefined` / `null` / `''` → `null` (page 1, pas de curseur).
 * - Valeur non-string → lève `ValidationError('Curseur invalide')` (rejette `?cursor[0]=`).
 * - Format attendu : `<ISO 8601 UTC stricte>|<id non vide>`. Toute autre forme →
 *   `ValidationError('Curseur invalide')` → 400.
 *
 * Helper privé (hors export) — seul `getMySlots` l'utilise.
 */
function parseCursor(raw: unknown): { start: Date; id: string } | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') throw new ValidationError('Curseur invalide')
  const pipeIdx = raw.indexOf('|')
  if (pipeIdx === -1) throw new ValidationError('Curseur invalide')
  const isoPart = raw.slice(0, pipeIdx)
  const idPart = raw.slice(pipeIdx + 1)
  if (!idPart) throw new ValidationError('Curseur invalide')
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
  if (!ISO_RE.test(isoPart)) throw new ValidationError('Curseur invalide')
  const date = new Date(isoPart)
  if (Number.isNaN(date.getTime())) throw new ValidationError('Curseur invalide')
  return { start: date, id: idPart }
}
