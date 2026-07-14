import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY

  if (!keyHex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production')
    }
    console.warn('[EncryptionService] ENCRYPTION_KEY not set — encryption unavailable')
    throw new Error('ENCRYPTION_KEY is not configured')
  }

  if (keyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${keyHex.length} chars` +
      (keyHex.length === 64 ? ' containing non-hex characters' : '')
    )
  }

  return Buffer.from(keyHex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    iv,
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
    cipher.getAuthTag()
  ])
  return encrypted.toString('base64')
}

export function decrypt(encrypted: string): string {
  const key = getEncryptionKey()
  const buffer = Buffer.from(encrypted, 'base64')

  const minSize = IV_LENGTH + AUTH_TAG_LENGTH
  if (buffer.length < minSize) {
    throw new Error(`Invalid encrypted data: expected at least ${minSize} bytes, got ${buffer.length}`)
  }

  const iv = buffer.subarray(0, IV_LENGTH)
  const authTag = buffer.subarray(buffer.length - AUTH_TAG_LENGTH)
  const ciphertext = buffer.subarray(IV_LENGTH, buffer.length - AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
