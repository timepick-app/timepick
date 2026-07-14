import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const mockQuery = jest.fn() as any
jest.mock('../../db/query', () => ({
  query: mockQuery
}))

const mockEncrypt = jest.fn() as any
const mockDecrypt = jest.fn() as any
jest.mock('../../services/encryption.service', () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt
}))

import { getSmtpSettings, saveSmtpSettings } from '../../db/settings.db'

describe('settings.db', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSmtpSettings()', () => {
    it('should return decrypted SMTP settings from app_config', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { key: 'smtp_host', value: 'smtp.example.org' },
          { key: 'smtp_port', value: '465' },
          { key: 'smtp_secure', value: 'true' },
          { key: 'smtp_user', value: 'user@example.com' },
          { key: 'smtp_password', value: 'encrypted-password' },
          { key: 'smtp_from_name', value: 'TimePick' },
          { key: 'smtp_from_email', value: 'noreply@example.com' }
        ]
      })
      mockDecrypt.mockReturnValue('decrypted-password')

      const settings = await getSmtpSettings()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT key, value FROM app_config WHERE key IN'),
        expect.arrayContaining(['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password', 'smtp_from_name', 'smtp_from_email'])
      )
      expect(mockDecrypt).toHaveBeenCalledWith('encrypted-password')
      expect(settings).toEqual({
        smtpHost: 'smtp.example.org',
        smtpPort: '465',
        smtpSecure: true,
        smtpUser: 'user@example.com',
        smtpPassword: 'decrypted-password',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com'
      })
    })

    it('should return defaults when no config exists', async () => {
      mockQuery.mockResolvedValue({ rows: [] })
      mockDecrypt.mockReturnValue('')

      const settings = await getSmtpSettings()

      expect(settings).toEqual({
        smtpHost: '',
        smtpPort: '',
        smtpSecure: false,
        smtpUser: '',
        smtpPassword: '',
        smtpFromName: 'TimePick',
        smtpFromEmail: ''
      })
      // Should NOT call decrypt when password is empty
      expect(mockDecrypt).not.toHaveBeenCalled()
    })
  })

  describe('saveSmtpSettings()', () => {
    it('should encrypt password and upsert all values', async () => {
      mockEncrypt.mockReturnValue('encrypted-new-password')
      mockQuery.mockResolvedValue({ rowCount: 1 })

      await saveSmtpSettings({
        smtpHost: 'smtp.example.com',
        smtpPort: '587',
        smtpSecure: false,
        smtpUser: 'user@example.com',
        smtpPassword: 'new-secret',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com'
      })

      expect(mockEncrypt).toHaveBeenCalledWith('new-secret')
      expect(mockQuery).toHaveBeenCalled()
    })

    it('should preserve existing password when sentinel value "****" is provided', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 })

      await saveSmtpSettings({
        smtpHost: 'smtp.example.com',
        smtpPort: '587',
        smtpSecure: false,
        smtpUser: 'user@example.com',
        smtpPassword: '****',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com'
      })

      expect(mockEncrypt).not.toHaveBeenCalled()
      // Verify that smtp_password is NOT in the upsert
      const call = mockQuery.mock.calls[0]
      expect(call[1]).not.toContain('smtp_password')
    })

    it('should preserve existing password when empty string is provided', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 })

      await saveSmtpSettings({
        smtpHost: 'smtp.example.com',
        smtpPort: '587',
        smtpSecure: false,
        smtpUser: 'user@example.com',
        smtpPassword: '',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com'
      })

      expect(mockEncrypt).not.toHaveBeenCalled()
      const call = mockQuery.mock.calls[0]
      expect(call[1]).not.toContain('smtp_password')
    })
  })
})
