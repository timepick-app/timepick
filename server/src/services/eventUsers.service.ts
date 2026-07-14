import { getClient, query } from '../db'
import { NotFoundError } from '../errors/NotFoundError'

/**
 * Type User pour les réponses API (camelCase)
 * Note: La DB retourne du snake_case (first_name, last_name, created_at, etc.)
 * La conversion snake_case → camelCase est faite manuellement dans getEventUsers()
 */
export interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  createdAt: string
}

/**
 * Service de gestion des utilisateurs d'événements
 * Gère la relation many-to-many entre événements et utilisateurs autorisés
 */
export const eventUsersService = {
  /**
   * Définir les utilisateurs autorisés pour un événement
   * Remplace complètement la sélection existante (transaction DELETE + INSERT)
   * @param eventId - UUID de l'événement
   * @param userIds - Tableau d'UUIDs des utilisateurs autorisés
   * @throws NotFoundError si l'événement n'existe pas
   */
  async setEventUsers(eventId: string, userIds: string[]): Promise<void> {
    // Vérifier que l'événement existe
    const eventCheck = await query('SELECT id FROM events WHERE id = $1', [eventId])
    if (eventCheck.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }

    // Vérifier que tous les utilisateurs existent
    if (userIds.length > 0) {
      const uniqueUserIds = [...new Set(userIds)] // Dédououblonner
      const usersCheck = await query(
        `SELECT id FROM users WHERE id = ANY($1)`,
        [uniqueUserIds]
      )
      if (usersCheck.rows.length !== uniqueUserIds.length) {
        throw new NotFoundError('Un ou plusieurs utilisateurs non trouvés')
      }
    }

    // Transaction : DELETE tout, puis INSERT les nouveaux
    const client = await getClient()
    try {
      await client.query('BEGIN')

      // Supprimer les associations existantes
      await client.query('DELETE FROM event_users WHERE event_id = $1', [eventId])

      // Insérer les nouvelles associations une par une
      if (userIds.length > 0) {
        const uniqueUserIds = [...new Set(userIds)] // Dédoublonner
        for (const userId of uniqueUserIds) {
          await client.query(
            'INSERT INTO event_users (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [eventId, userId]
          )
        }
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  /**
   * Obtenir les utilisateurs autorisés pour un événement
   * @param eventId - UUID de l'événement
   * @returns Liste des utilisateurs autorisés (camelCase)
   */
  async getEventUsers(eventId: string): Promise<User[]> {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at
       FROM users u
       INNER JOIN event_users eu ON u.id = eu.user_id
       WHERE eu.event_id = $1
       ORDER BY u.last_name ASC NULLS LAST, u.first_name ASC, u.email`,
      [eventId]
    )
    // Conversion snake_case DB → camelCase API
    return result.rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      createdAt: row.created_at
    }))
  },

  /**
   * Ajouter un utilisateur à la sélection
   * @param eventId - UUID de l'événement
   * @param userId - UUID de l'utilisateur à ajouter
   * @throws NotFoundError si l'utilisateur ou l'événement n'existe pas
   */
  async addEventUser(eventId: string, userId: string): Promise<void> {
    // Vérifier que l'utilisateur existe
    const userCheck = await query('SELECT id FROM users WHERE id = $1', [userId])
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('Utilisateur non trouvé')
    }

    // Vérifier que l'événement existe
    const eventCheck = await query('SELECT id FROM events WHERE id = $1', [eventId])
    if (eventCheck.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }

    try {
      await query(
        'INSERT INTO event_users (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [eventId, userId]
      )
    } catch (err) {
      // Gérer les erreurs de foreign key (bien que vérifié au-dessus)
      if ((err as any).code === '23503') {
        throw new NotFoundError('Événement ou utilisateur non trouvé')
      }
      throw err
    }
  },

  /**
   * Retirer un utilisateur de la sélection
   * @param eventId - UUID de l'événement
   * @param userId - UUID de l'utilisateur à retirer
   * @throws NotFoundError si l'association n'existe pas
   */
  async removeEventUser(eventId: string, userId: string): Promise<void> {
    const result = await query(
      'DELETE FROM event_users WHERE event_id = $1 AND user_id = $2 RETURNING *',
      [eventId, userId]
    )
    if (result.rows.length === 0) {
      throw new NotFoundError('Association utilisateur-événement non trouvée')
    }
  },

  /**
   * Vérifier si un utilisateur est autorisé pour un événement
   * @param eventId - UUID de l'événement
   * @param userId - UUID de l'utilisateur
   * @returns true si l'utilisateur est autorisé, false sinon
   */
  async isUserAuthorizedForEvent(eventId: string, userId: string): Promise<boolean> {
    const result = await query(
      'SELECT 1 FROM event_users WHERE event_id = $1 AND user_id = $2',
      [eventId, userId]
    )
    return result.rows.length > 0
  },

  /**
   * Compter le nombre d'utilisateurs autorisés pour un événement
   * @param eventId - UUID de l'événement
   * @returns Nombre d'utilisateurs autorisés
   */
  async countEventUsers(eventId: string): Promise<number> {
    const result = await query(
      'SELECT COUNT(*) as count FROM event_users WHERE event_id = $1',
      [eventId]
    )
    return parseInt(result.rows[0].count, 10)
  }
}
