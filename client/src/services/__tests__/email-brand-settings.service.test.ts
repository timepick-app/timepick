import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getEmailBrandSettings,
  patchEmailBrandSettings,
  resetEmailBrandSettings,
  type EmailBrandSettings,
} from '../email-brand-settings.service'

const mockGet = vi.fn()
const mockPatch = vi.fn()
const mockPost = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

const factoryDto: EmailBrandSettings = {
  logoUrl: null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
  updatedAt: '2026-06-06T10:00:00Z',
}

describe('email-brand-settings.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getEmailBrandSettings', () => {
    it('appelle GET /admin/settings/email-brand et renvoie la DTO', async () => {
      mockGet.mockResolvedValue({ data: { data: factoryDto } })

      const result = await getEmailBrandSettings()

      expect(mockGet).toHaveBeenCalledWith('/admin/settings/email-brand')
      expect(result).toEqual(factoryDto)
    })
  })

  describe('patchEmailBrandSettings', () => {
    it('appelle PATCH /admin/settings/email-brand avec le patch et renvoie la DTO', async () => {
      const patch = { primaryColor: '#ff0000' }
      mockPatch.mockResolvedValue({ data: { data: factoryDto } })

      const result = await patchEmailBrandSettings(patch)

      expect(mockPatch).toHaveBeenCalledWith('/admin/settings/email-brand', patch)
      expect(result).toEqual(factoryDto)
    })
  })

  describe('resetEmailBrandSettings', () => {
    it('appelle POST /admin/settings/email-brand/reset (sans body) et renvoie la DTO factory', async () => {
      mockPost.mockResolvedValue({ data: { data: factoryDto } })

      const result = await resetEmailBrandSettings()

      expect(mockPost).toHaveBeenCalledWith('/admin/settings/email-brand/reset')
      expect(result).toEqual(factoryDto)
    })

    it('propage le rejet du POST (erreur serveur)', async () => {
      const err = new Error('boom')
      mockPost.mockRejectedValue(err)

      await expect(resetEmailBrandSettings()).rejects.toBe(err)
    })
  })
})
