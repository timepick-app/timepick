import request from 'supertest'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import {
  initializeTestTransactions,
  startTestTransaction,
  rollbackTestTransaction,
  cleanupTestTransactions,
} from '../helpers/transaction'

describe('GET /api/setup/encryption-key - Integration Tests', () => {
  beforeAll(async () => {
    await initializeTestTransactions()
  })

  afterAll(async () => {
    await cleanupTestTransactions()
  })

  beforeEach(async () => {
    await startTestTransaction()
    // Ces tests requièrent un état propre (aucun admin) pour couvrir la branche
    // publique de checkSetupNotDone.
    await query("DELETE FROM users WHERE role = 'admin'")
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  it('returns 200 with configured/source/fingerprint, never the raw key, when no admin exists', async () => {
    const res = await request(testServer()).get('/api/setup/encryption-key')

    expect(res.status).toBe(200)
    expect(res.body.data).toBeDefined()
    expect(typeof res.body.data.configured).toBe('boolean')
    expect(['env', 'file']).toContain(res.body.data.source)
    expect(res.body.data.fingerprint).toMatch(/^[0-9a-f]{12}$/)
    expect(typeof res.body.data.emailDeliverable).toBe('boolean')
    // Contrat : la source n'est renseignée que lorsque l'email est délivrable
    // (dépend de l'environnement : intercepteur local présent ou non).
    if (res.body.data.emailDeliverable) {
      expect(['db', 'env', 'fallback']).toContain(res.body.data.emailTransportSource)
    } else {
      expect(res.body.data.emailTransportSource).toBeNull()
    }
    expect(res.body.data.key).toBeUndefined()
  })

  it('returns 404 when an admin already exists (checkSetupNotDone)', async () => {
    await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3)`,
      ['test-setup-encryption-key-admin@example.com', 'Admin', 'admin'],
    )

    const res = await request(testServer()).get('/api/setup/encryption-key')

    expect(res.status).toBe(404)
  })
})
