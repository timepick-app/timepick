import { query, withTransaction } from '../db'
import type { CreateEventInput, UpdateEventInput } from '../validators/event.validator'
import { NotFoundError } from '../errors/NotFoundError'
import { NotPublishedError } from '../errors/NotPublishedError'
import { ValidationError } from '../errors/ValidationError'
import { deleteShellPartsForOwner } from './shell-parts.service'
import { ERROR_CODES } from '@timepick/shared'

/**
 * Constante pour le suffixe de duplication d'événement
 * DOIT être synchronisée avec la constante frontend DUPLICATE_SUFFIX
 */
const DUPLICATE_SUFFIX = ' (copie)'

/**
 * Type Event pour les réponses API (camelCase)
 * Note: Les données retournées par la DB sont en snake_case (is_published, opens_at, etc.)
 * Le middleware snakeToCamelMiddleware (app.ts) convertit automatiquement en camelCase
 * donc ce type représente la forme APRES conversion (ce que le client reçoit)
 */
export interface Event {
  id: string
  name: string
  description: string | null
  isPublished: boolean
  opensAt: string | null
  hasCustomInvitation: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Service de gestion des événements
 * Gère les opérations CRUD pour les événements de participation
 */
export const eventService = {
  /**
   * Créer un nouvel événement (brouillon par défaut)
   * @param data - Données de l'événement (name requis, description et opensAt optionnels)
   * @returns L'événement créé
   */
  async createEvent(data: CreateEventInput): Promise<Event> {
    const result = await query(
      `INSERT INTO events (name, description, is_published, opens_at)
       VALUES ($1, $2, false, $3)
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
      [data.name, data.description || null, data.opensAt ?? null]
    )
    return result.rows[0] as Event
  },

  /**
   * Lister tous les événements (admin uniquement)
   * @returns Liste des événements triés par date de création décroissante
   */
  async getEvents(): Promise<Event[]> {
    const result = await query(
      `SELECT e.*, (e.invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = e.id::text)) AS has_custom_invitation,
              MIN(s.start_time) as period_start, MAX(s.end_time) as period_end
       FROM events e
       LEFT JOIN slots s ON s.event_id = e.id
       GROUP BY e.id
       ORDER BY e.created_at DESC`
    )
    return result.rows as Event[]
  },

  /**
   * Récupérer un événement par UUID
   * @param id - UUID de l'événement
   * @returns L'événement trouvé
   * @throws Error si l'événement n'existe pas
   */
  async getEventById(id: string): Promise<Event> {
    const result = await query(
      `SELECT *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation
       FROM events WHERE id = $1`,
      [id]
    )
    if (result.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }
    return result.rows[0] as Event
  },

  /**
   * Récupérer un événement publié par UUID (accès public)
   * @param id - UUID de l'événement
   * @returns L'événement publié
   * @throws NotFoundError si l'événement n'existe pas ou n'est pas publié
   */
  async getPublicEvent(id: string): Promise<Event> {
    const check = await query(
      `SELECT id, is_published FROM events WHERE id = $1`,
      [id]
    )
    if (check.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }
    if (!check.rows[0].is_published) {
      throw new NotPublishedError("Cet événement n'est pas encore accessible")
    }
    const result = await query(
      `SELECT id, name, description, is_published, opens_at,
              (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation,
              created_at, updated_at
         FROM events WHERE id = $1`,
      [id]
    )
    return result.rows[0] as Event
  },

  /**
   * Lister les événements publiés (accès public)
   * @returns Liste des événements publiés triés par date de création décroissante
   */
  async getPublicEvents(): Promise<Event[]> {
    const result = await query(
      `SELECT id, name, description, is_published, opens_at,
              (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation,
              created_at, updated_at
         FROM events WHERE is_published = true ORDER BY created_at DESC`
    )
    return result.rows as Event[]
  },

  /**
   * Récupérer un événement public par UUID avec vérification is_published
   * Utilise uuid comme paramètre (qui est en réalité la colonne id)
   * @param uuid - UUID de l'événement
   * @returns L'événement publié
   * @throws NotFoundError si l'événement n'existe pas ou n'est pas publié
   */
  async getPublicEventByUuid(uuid: string): Promise<Event> {
    const check = await query(
      `SELECT id, is_published FROM events WHERE id = $1`,
      [uuid]
    )
    if (check.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }
    if (!check.rows[0].is_published) {
      throw new NotPublishedError("Cet événement n'est pas encore accessible")
    }
    const result = await query(
      `SELECT id, name, description, is_published, opens_at,
              (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation,
              created_at, updated_at
         FROM events WHERE id = $1`,
      [uuid]
    )
    return result.rows[0] as Event
  },

  /**
   * Mettre à jour un événement
   * @param id - UUID de l'événement
   * @param data - Champs à mettre à jour
   * @returns L'événement mis à jour
   * @throws Error si l'événement n'existe pas
   */
  async updateEvent(id: string, data: UpdateEventInput): Promise<Event> {
    const { name, description, isPublished, opensAt } = data
    const updates: string[] = []
    const values: (string | boolean | Date | null)[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(name)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(description)
    }
    if (isPublished !== undefined) {
      updates.push(`is_published = $${paramIndex++}`)
      values.push(isPublished)
    }
    if (opensAt !== undefined) {
      updates.push(`opens_at = $${paramIndex++}`)
      values.push(opensAt)
    }

    if (updates.length === 0) {
      // `ValidationError` typée, et non un `Error` nu reconnu par comparaison de
      // chaîne dans le contrôleur : renommer le message ne casse plus la
      // détection en silence. Formulation alignée sur les deux autres émetteurs
      // du même code (`admin.controller`, `me.service`).
      throw new ValidationError(
        'Aucune donnée à mettre à jour. Modifiez au moins une information avant d\'enregistrer.',
        ERROR_CODES.NO_FIELDS_TO_UPDATE,
      )
    }

    values.push(id)
    const result = await query(
      `UPDATE events SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
      values
    )
    if (result.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }
    return result.rows[0] as Event
  },

  /**
   * Supprimer un événement
   * @param id - UUID de l'événement
   * @returns true si supprimé, false si non trouvé
   */
  async deleteEvent(id: string): Promise<boolean> {
    // Story 26.1 / AC2 — wrap the parent DELETE + child shell_parts cleanup
    // in a single transaction so the rows can never become orphaned. The
    // shell-parts service participates via its optional `client` parameter
    // (pattern hérité de email-brand-settings.db.ts:115 `withTransaction`).
    return withTransaction(async (client) => {
      await deleteShellPartsForOwner('event', id, client)
      const result = await client.query<{ id: string }>(
        `DELETE FROM events WHERE id = $1 RETURNING id`,
        [id],
      )
      return (result.rowCount ?? 0) > 0
    })
  },

  /**
   * Publier un événement
   * @param id - UUID de l'événement
   * @returns L'événement publié (is_published = true)
   * @throws NotFoundError si l'événement n'existe pas, ValidationError si le nom est vide
   */
  async publishEvent(id: string): Promise<Event> {
    // First, check if the event exists and has a valid name
    const event = await this.getEventById(id)

    if (!event.name || event.name.trim() === '') {
      // `ValidationError` et non `Error` : le refus est actionnable — l'admin
      // doit nommer son événement — donc son message doit pouvoir s'afficher,
      // ce qui suppose un code nommé plutôt que le défaut VALIDATION_ERROR.
      throw new ValidationError(
        'Le nom de l\'événement est requis pour la publication',
        ERROR_CODES.EVENT_NAME_REQUIRED,
      )
    }

    const result = await query(
      `UPDATE events
       SET is_published = true
       WHERE id = $1
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
      [id]
    )

    if (result.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }

    return result.rows[0] as Event
  },

  /**
   * Dépublier un événement
   * @param id - UUID de l'événement
   * @returns L'événement dépublié (is_published = false)
   * @throws NotFoundError si l'événement n'existe pas
   */
  async unpublishEvent(id: string): Promise<Event> {
    const result = await query(
      `UPDATE events
       SET is_published = false
       WHERE id = $1
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
      [id]
    )

    if (result.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }

    return result.rows[0] as Event
  },

  /**
   * Définir la date d'ouverture des inscriptions
   * @param id - UUID de l'événement
   * @param opensAt - Date d'ouverture (ISO string) ou null pour supprimer
   * @returns L'événement mis à jour
   * @throws NotFoundError si l'événement n'existe pas
   */
  async setOpeningDate(id: string, opensAt: string | null): Promise<Event> {
    const result = await query(
      `UPDATE events
       SET opens_at = $1
       WHERE id = $2
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
      [opensAt, id]
    )

    if (result.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }

    return result.rows[0] as Event
  },

  /**
   * Dupliquer un événement
   * @param id - UUID de l'événement à dupliquer
   * @returns Le nouvel événement créé
   * @throws NotFoundError si l'événement n'existe pas
   *
   * Comportement:
   * - Le nom est suffixé de " (copie)" (constante DUPLICATE_SUFFIX)
   * - L'état est forcé à "Brouillon" (is_published = false)
   * - opens_at est réinitialisé à NULL
   * - Les créneaux (slots) ne sont PAS copiés
   * - Les utilisateurs autorisés (event_users) ne sont PAS copiés
   */
  async duplicateEvent(id: string): Promise<Event> {
    // 1. Récupérer l'événement original
    const original = await this.getEventById(id)

    // 2. Créer une copie avec le nom suffixé et état brouillon
    const result = await query(
      `INSERT INTO events (name, description, is_published, opens_at)
       VALUES ($1, $2, false, NULL)
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
      [`${original.name}${DUPLICATE_SUFFIX}`, original.description]
    )

    return result.rows[0] as Event
  },

  /**
   * Supprimer plusieurs événements en masse (bulk-delete)
   * @param ids - UUIDs des événements à supprimer (déjà dédupliqués ou non)
   * @returns Résultat : nombre supprimés, réservations impactées, introuvables
   */
  async bulkDeleteEvents(ids: string[]): Promise<{ deleted: number; deletedBookings: number; notFound: number }> {
    const uniqueIds = [...new Set(ids)]

    return withTransaction(async (client) => {
      // Verrou pessimiste pour éviter les suppressions concurrentes
      const found = await client.query<{ id: string }>(
        'SELECT id FROM events WHERE id = ANY($1) FOR UPDATE',
        [uniqueIds]
      )
      const foundIds = found.rows.map((r) => r.id)
      const notFound = uniqueIds.length - foundIds.length

      let deleted = 0
      let deletedBookings = 0

      if (foundIds.length > 0) {
        const countResult = await client.query<{ count: string }>(
          `SELECT COUNT(*) FROM bookings b
           JOIN slots s ON b.slot_id = s.id
           WHERE s.event_id = ANY($1)`,
          [foundIds]
        )
        deletedBookings = parseInt(countResult.rows[0].count)

        // shell_parts a un owner_id polymorphe SANS FK (migration 009) : la
        // suppression de l'événement ne les cascade pas. On les purge
        // explicitement par owner, comme deleteEvent (Story 26.1), pour ne pas
        // laisser de rows orphelines.
        for (const id of foundIds) {
          await deleteShellPartsForOwner('event', id, client)
        }
        // La cascade FK supprime ensuite slots et bookings automatiquement.
        await client.query('DELETE FROM events WHERE id = ANY($1)', [foundIds])
        deleted = foundIds.length
      }

      return { deleted, deletedBookings, notFound }
    })
  }
}
