import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Typage pour les mocks
type QueryResult = { rows: Record<string, unknown>[] }
type PoolClient = {
  query: jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>,
  release: jest.Mock
}
const mockQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
const mockGetClient = jest.fn() as jest.MockedFunction<() => Promise<PoolClient>>

jest.mock('../../db', () => ({
  query: mockQuery,
  getClient: mockGetClient
}))

// Importer après le mock
import { eventUsersService } from '../../services/eventUsers.service'
import { NotFoundError } from '../../errors/NotFoundError'

describe('eventUsersService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('setEventUsers', () => {
    it('[P0] définit les utilisateurs autorisés pour un événement', async () => {
      const eventId = 'event-123'
      const userIds = ['user-1', 'user-2']

      // Mock vérification événement
      mockQuery.mockResolvedValueOnce({ rows: [{ id: eventId }] })
      // Mock vérification utilisateurs
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }, { id: 'user-2' }] })

      // Mock client de transaction
      const mockClientQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({ rows: [] }) // INSERT user-1
        .mockResolvedValueOnce({ rows: [] }) // INSERT user-2
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
      const mockClient = {
        query: mockClientQuery,
        release: jest.fn()
      } as PoolClient
      mockGetClient.mockResolvedValue(mockClient)

      await eventUsersService.setEventUsers(eventId, userIds)

      // Vérifier que l'événement existe
      expect(mockQuery).toHaveBeenCalledWith('SELECT id FROM events WHERE id = $1', [eventId])
      // Vérifier que les utilisateurs existent
      expect(mockQuery).toHaveBeenCalledWith(
        `SELECT id FROM users WHERE id = ANY($1)`,
        [userIds]
      )
      // Vérifier transaction
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM event_users WHERE event_id = $1', [eventId])
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalled()
    })

    it('[P0] dédoublonne les userIds avant insertion', async () => {
      const eventId = 'event-123'
      const userIds = ['user-1', 'user-1', 'user-2'] // user-1 en double

      mockQuery.mockResolvedValueOnce({ rows: [{ id: eventId }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }, { id: 'user-2' }] })

      const mockClientQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({ rows: [] }) // INSERT user-1 (une seule fois grâce au dédoublonnage)
        .mockResolvedValueOnce({ rows: [] }) // INSERT user-2
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
      const mockClient = {
        query: mockClientQuery,
        release: jest.fn()
      } as PoolClient
      mockGetClient.mockResolvedValue(mockClient)

      await eventUsersService.setEventUsers(eventId, userIds)

      // Vérifier que le query utilise ANY avec le tableau dédoublonné
      const uniqueUserIds = [...new Set(userIds)]
      expect(mockQuery).toHaveBeenCalledWith(
        `SELECT id FROM users WHERE id = ANY($1)`,
        [uniqueUserIds]
      )
    })

    it('[P0] gère le rollback en cas d\'erreur', async () => {
      const eventId = 'event-123'
      const userIds = ['user-1']

      mockQuery.mockResolvedValueOnce({ rows: [{ id: eventId }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })

      const mockClientQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB Error')) // DELETE échoue
      const mockClient = {
        query: mockClientQuery,
        release: jest.fn()
      } as PoolClient
      mockGetClient.mockResolvedValue(mockClient)

      await expect(eventUsersService.setEventUsers(eventId, userIds))
        .rejects.toThrow('DB Error')

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalled()
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventUsersService.setEventUsers('invalid-event', ['user-1']))
        .rejects.toThrow('Événement non trouvé')
    })

    it('[P0] lance NotFoundError si un utilisateur n\'existe pas', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] }) // Un seul utilisateur trouvé sur 2

      await expect(eventUsersService.setEventUsers('event-123', ['user-1', 'user-2']))
        .rejects.toThrow('Un ou plusieurs utilisateurs non trouvés')
    })

    it('[P1] autorise une liste vide d\'utilisateurs', async () => {
      const eventId = 'event-123'
      const userIds: string[] = []

      mockQuery.mockResolvedValueOnce({ rows: [{ id: eventId }] })
      // Pas de vérification utilisateurs car tableau vide

      const mockClientQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({ rows: [] }) // COMMIT (pas d'INSERT car tableau vide)
      const mockClient = {
        query: mockClientQuery,
        release: jest.fn()
      } as PoolClient
      mockGetClient.mockResolvedValue(mockClient)

      await eventUsersService.setEventUsers(eventId, userIds)

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })
  })

  describe('getEventUsers', () => {
    it('[P0] retourne les utilisateurs autorisés pour un événement', async () => {
      const mockRows = [
        { id: 'user-1', email: 'user1@example.com', first_name: 'User One', last_name: null, role: 'user', created_at: new Date() },
        { id: 'user-2', email: 'user2@example.com', first_name: 'User Two', last_name: null, role: 'user', created_at: new Date() }
      ]

      mockQuery.mockResolvedValue({ rows: mockRows })

      const result = await eventUsersService.getEventUsers('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at'),
        ['event-123']
      )
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: 'user-1',
        email: 'user1@example.com',
        firstName: 'User One',
        role: 'user'
      })
    })

    it('[P0] convertit snake_case en camelCase', async () => {
      const mockRows = [{
        id: 'user-1',
        email: 'user1@example.com',
        first_name: 'User One',
        last_name: null,
        role: 'user',
        created_at: new Date()
      }]

      mockQuery.mockResolvedValue({ rows: mockRows })

      const result = await eventUsersService.getEventUsers('event-123')

      expect(result[0]).toHaveProperty('firstName') // pas first_name
      expect(result[0]).toHaveProperty('lastName')
      expect(result[0]).toHaveProperty('createdAt') // pas created_at
      expect(result[0]).not.toHaveProperty('first_name')
      expect(result[0]).not.toHaveProperty('created_at')
    })

    it('[P1] retourne un tableau vide si aucun utilisateur', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await eventUsersService.getEventUsers('event-123')

      expect(result).toEqual([])
    })

    it('[P1] trie par last_name/first_name NULLS LAST puis email', async () => {
      const mockRows = [
        { id: 'user-2', email: 'b@example.com', first_name: 'B', last_name: 'User', role: 'user', created_at: new Date() },
        { id: 'user-1', email: 'a@example.com', first_name: 'A', last_name: null, role: 'user', created_at: new Date() },
        { id: 'user-3', email: 'c@example.com', first_name: 'C', last_name: 'User', role: 'user', created_at: new Date() }
      ]

      mockQuery.mockResolvedValue({ rows: mockRows })

      const result = await eventUsersService.getEventUsers('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY u.last_name ASC NULLS LAST, u.first_name ASC, u.email'),
        ['event-123']
      )
    })
  })

  describe('addEventUser', () => {
    it('[P0] ajoute un utilisateur à la sélection', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] }) // User exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] }) // Event exists
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT

      await eventUsersService.addEventUser('event-123', 'user-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO event_users (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        ['event-123', 'user-1']
      )
    })

    it('[P0] utilise ON CONFLICT DO NOTHING pour éviter les doublons', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await eventUsersService.addEventUser('event-123', 'user-1')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT DO NOTHING'),
        expect.any(Array)
      )
    })

    it('[P0] lance NotFoundError si utilisateur inexistant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await expect(eventUsersService.addEventUser('event-123', 'invalid-user'))
        .rejects.toThrow('Utilisateur non trouvé')
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await expect(eventUsersService.addEventUser('invalid-event', 'user-1'))
        .rejects.toThrow('Événement non trouvé')
    })
  })

  describe('removeEventUser', () => {
    it('[P0] retire un utilisateur de la sélection', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'event-123', user_id: 'user-1' }] })

      await eventUsersService.removeEventUser('event-123', 'user-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM event_users WHERE event_id = $1 AND user_id = $2 RETURNING *',
        ['event-123', 'user-1']
      )
    })

    it('[P0] lance NotFoundError si l\'association n\'existe pas', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventUsersService.removeEventUser('event-123', 'user-1'))
        .rejects.toThrow(NotFoundError)
      await expect(eventUsersService.removeEventUser('event-123', 'user-1'))
        .rejects.toThrow('Association utilisateur-événement non trouvée')
    })
  })

  describe('isUserAuthorizedForEvent', () => {
    it('[P0] retourne true si utilisateur autorisé', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '1' }] })

      const result = await eventUsersService.isUserAuthorizedForEvent('event-123', 'user-1')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT 1 FROM event_users WHERE event_id = $1 AND user_id = $2',
        ['event-123', 'user-1']
      )
      expect(result).toBe(true)
    })

    it('[P0] retourne false si utilisateur non autorisé', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await eventUsersService.isUserAuthorizedForEvent('event-123', 'user-1')

      expect(result).toBe(false)
    })
  })

  describe('countEventUsers', () => {
    it('[P0] retourne le nombre d\'utilisateurs autorisés', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '3' }] })

      const result = await eventUsersService.countEventUsers('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM event_users WHERE event_id = $1',
        ['event-123']
      )
      expect(result).toBe(3)
    })

    it('[P0] retourne 0 si aucun utilisateur', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '0' }] })

      const result = await eventUsersService.countEventUsers('event-123')

      expect(result).toBe(0)
    })

    it('[P1] parse correctement le count en entier', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '42' }] })

      const result = await eventUsersService.countEventUsers('event-123')

      expect(result).toBe(42)
      expect(typeof result).toBe('number')
    })
  })
})
