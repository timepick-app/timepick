import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSmtpSettings, saveSmtpSettings, testSmtpConnection } from '../../services/settings.service'

// Mock the api module
const mockGet = vi.fn()
const mockPut = vi.fn()
const mockPost = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

describe('settings.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSmtpSettings', () => {
    it('calls GET /admin/settings/smtp and returns data', async () => {
      const mockData = {
        data: {
          smtpHost: 'smtp.example.org',
          smtpPort: '465',
          smtpSecure: true,
          smtpUser: 'admin@example.com',
          smtpPassword: '****',
          smtpFromName: 'TimePick',
          smtpFromEmail: 'noreply@example.com',
        },
      }
      mockGet.mockResolvedValue({ data: mockData })

      const result = await getSmtpSettings()

      expect(mockGet).toHaveBeenCalledWith('/admin/settings/smtp')
      expect(result).toEqual(mockData.data)
    })
  })

  describe('saveSmtpSettings', () => {
    it('calls PUT /admin/settings/smtp with correct payload', async () => {
      const payload = {
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpSecure: false,
      }
      const mockResponse = { data: { message: 'Paramètres SMTP sauvegardés avec succès' } }
      mockPut.mockResolvedValue({ data: mockResponse })

      const result = await saveSmtpSettings(payload)

      expect(mockPut).toHaveBeenCalledWith('/admin/settings/smtp', payload)
      expect(result).toEqual(mockResponse.data)
    })

    it('sends port as number', async () => {
      const payload = {
        smtpHost: 'smtp.example.com',
        smtpPort: 465,
        smtpSecure: true,
      }
      mockPut.mockResolvedValue({ data: { data: { message: 'ok' } } })

      await saveSmtpSettings(payload)

      expect(mockPut).toHaveBeenCalledWith('/admin/settings/smtp', expect.objectContaining({
        smtpPort: 465,
      }))
    })
  })

  describe('testSmtpConnection', () => {
    it('calls POST /admin/settings/smtp/test with payload', async () => {
      const payload = {
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpPassword: 'real-password',
      }
      const mockResponse = { success: true, message: 'Connexion réussie' }
      mockPost.mockResolvedValue({ data: mockResponse })

      const result = await testSmtpConnection(payload)

      expect(mockPost).toHaveBeenCalledWith('/admin/settings/smtp/test', payload)
      expect(result).toEqual(mockResponse)
    })
  })
})
