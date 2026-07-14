import request from 'supertest'
import { testServer } from '../helpers/test-server'

/**
 * Filet de sécurité global (app.ts) : une erreur async NON catchée dans un
 * handler doit être transformée en réponse 500 propre par le middleware
 * d'erreur (Express 5 transmet les rejets de promesses au handler d'erreur),
 * et non laisser la requête sans réponse.
 *
 * La route /api/test/boom lève volontairement une erreur non gérée.
 */
describe('Global error handler (app.ts)', () => {
  const previous = process.env.ALLOW_TEST_ROUTES

  beforeAll(() => {
    process.env.ALLOW_TEST_ROUTES = 'true'
  })

  afterAll(() => {
    process.env.ALLOW_TEST_ROUTES = previous
  })

  it('convertit une erreur async non gérée en 500 propre', async () => {
    const response = await request(testServer())
      .get('/api/test/boom')
      .expect(500)

    expect(response.body).toEqual({ error: 'Server Error' })
  })
})
