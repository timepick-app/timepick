import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPublicOrganization, type OrganizationSettings } from '../organization.service'

const mockGet = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

const identity: OrganizationSettings = {
  name: 'Chorale du Marais',
  logo: 'https://cdn.exemple.org/uploads/organization/logo.webp',
  description: 'Répétitions hebdomadaires, ouvertes à tous',
  homepageFacade: true,
}

describe('organization.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('appelle GET /public/organization et déballe l’enveloppe { data }', async () => {
    mockGet.mockResolvedValue({ data: { data: identity } })

    const result = await getPublicOrganization()

    expect(mockGet).toHaveBeenCalledWith('/public/organization')
    expect(result).toEqual(identity)
  })

  it('propage le rejet (repli géré par les consommateurs)', async () => {
    const err = new Error('network')
    mockGet.mockRejectedValue(err)

    await expect(getPublicOrganization()).rejects.toBe(err)
  })
})
