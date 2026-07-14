import { describe, it, expect, afterEach } from '@jest/globals'
import { frontendBaseUrl, memberEventUrl } from '../../utils/frontendUrl'

/**
 * Tests unitaires purs de frontendBaseUrl / memberEventUrl.
 * Le seul état partagé est process.env.APP_URL — sauvegardé puis restauré.
 */
describe('frontendBaseUrl / memberEventUrl', () => {
  const previousAppUrl = process.env.APP_URL

  afterEach(() => {
    // Restaure l'environnement d'origine après chaque test.
    if (previousAppUrl === undefined) {
      delete process.env.APP_URL
    } else {
      process.env.APP_URL = previousAppUrl
    }
  })

  it('sans APP_URL → fallback localhost:5173', () => {
    delete process.env.APP_URL
    expect(frontendBaseUrl()).toBe('http://localhost:5173')
  })

  it('avec APP_URL=https://x.test → base absolue utilisée', () => {
    process.env.APP_URL = 'https://x.test'
    expect(frontendBaseUrl()).toBe('https://x.test')
  })

  it('memberEventUrl produit <base>/me/events/:uuid (sans APP_URL)', () => {
    delete process.env.APP_URL
    expect(memberEventUrl('abc')).toBe('http://localhost:5173/me/events/abc')
  })

  it('memberEventUrl respecte APP_URL personnalisée', () => {
    process.env.APP_URL = 'https://x.test'
    expect(memberEventUrl('abc')).toBe('https://x.test/me/events/abc')
  })

  it('memberEventUrl conserve un UUID intact', () => {
    process.env.APP_URL = 'https://x.test'
    const uuid = '11111111-2222-3333-4444-555555555555'
    expect(memberEventUrl(uuid)).toBe(`https://x.test/me/events/${uuid}`)
  })
})
