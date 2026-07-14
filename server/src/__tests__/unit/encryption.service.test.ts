import { describe, it, expect, beforeEach } from '@jest/globals'

// Set up ENCRYPTION_KEY before importing the service
const TEST_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'

describe('encryption.service', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY
  })

  describe('encrypt → decrypt round-trip', () => {
    it('should encrypt and decrypt a string back to original', async () => {
      // Need dynamic import to pick up env var
      const { encrypt, decrypt } = await import('../../services/encryption.service')

      const plaintext = 'my-secret-password'
      const encrypted = encrypt(plaintext)

      expect(typeof encrypted).toBe('string')
      expect(encrypted).not.toBe(plaintext)

      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('should handle empty string', async () => {
      const { encrypt, decrypt } = await import('../../services/encryption.service')

      const encrypted = encrypt('')
      expect(decrypt(encrypted)).toBe('')
    })

    it('should handle unicode characters', async () => {
      const { encrypt, decrypt } = await import('../../services/encryption.service')

      const plaintext = 'pässwörd-ç spécial'
      const encrypted = encrypt(plaintext)
      expect(decrypt(encrypted)).toBe(plaintext)
    })
  })

  describe('different plaintexts produce different ciphertexts (random IV)', () => {
    it('should produce different ciphertext for same plaintext', async () => {
      const { encrypt, decrypt } = await import('../../services/encryption.service')

      const plaintext = 'same-password'
      const encrypted1 = encrypt(plaintext)
      const encrypted2 = encrypt(plaintext)

      // Different due to random IV
      expect(encrypted1).not.toBe(encrypted2)

      // But both decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext)
      expect(decrypt(encrypted2)).toBe(plaintext)
    })
  })

  describe('tampered ciphertext throws', () => {
    it('should throw when ciphertext is tampered', async () => {
      const { encrypt, decrypt } = await import('../../services/encryption.service')

      const encrypted = encrypt('secret')

      // Tamper with the base64 string (flip a byte)
      const buf = Buffer.from(encrypted, 'base64')
      buf[buf.length - 2] ^= 0xff
      const tampered = buf.toString('base64')

      expect(() => decrypt(tampered)).toThrow()
    })
  })

  describe('missing key error', () => {
    it('should throw when ENCRYPTION_KEY is missing', async () => {
      delete process.env.ENCRYPTION_KEY

      // Clear module cache to get fresh import
      jest.resetModules()

      const { encrypt } = await import('../../services/encryption.service')

      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY')
    })

    it('should throw when ENCRYPTION_KEY has wrong length', async () => {
      process.env.ENCRYPTION_KEY = 'tooshort'
      jest.resetModules()

      const { encrypt } = await import('../../services/encryption.service')

      expect(() => encrypt('test')).toThrow('64 hex characters')
    })

    it('should throw when ENCRYPTION_KEY contains non-hex characters', async () => {
      // Exactly 64 chars (passes length check) but contains non-hex chars
      process.env.ENCRYPTION_KEY = 'z'.repeat(64)
      jest.resetModules()

      const { encrypt } = await import('../../services/encryption.service')

      expect(() => encrypt('test')).toThrow('non-hex characters')
    })
  })

  describe('buffer validation', () => {
    it('should throw with clear error when encrypted data is too short', async () => {
      const { decrypt } = await import('../../services/encryption.service')

      expect(() => decrypt('dGVzdA==')).toThrow('Invalid encrypted data')
    })

    it('should throw with clear error when encrypted data is empty', async () => {
      const { decrypt } = await import('../../services/encryption.service')

      expect(() => decrypt('')).toThrow('Invalid encrypted data')
    })
  })
})
