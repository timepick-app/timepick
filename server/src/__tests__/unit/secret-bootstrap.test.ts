import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Module under test is re-imported fresh per test (jest.resetModules + dynamic
// import) so module state (`encryptionKeySource`) never leaks across cases —
// convention borrowed from `encryption.service.test.ts`, extended with a fresh
// DATA_DIR tmpdir per test so nothing ever touches real `server/data`.
describe('secret-bootstrap', () => {
  const savedEncryptionKey = process.env.ENCRYPTION_KEY
  const savedJwtSecret = process.env.JWT_SECRET
  const savedDataDir = process.env.DATA_DIR
  let dataDir: string

  beforeEach(() => {
    jest.resetModules()
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-bootstrap-test-'))
    process.env.DATA_DIR = dataDir
    delete process.env.ENCRYPTION_KEY
    delete process.env.JWT_SECRET
  })

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true })
    if (savedEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = savedEncryptionKey
    if (savedJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = savedJwtSecret
    if (savedDataDir === undefined) delete process.env.DATA_DIR
    else process.env.DATA_DIR = savedDataDir
  })

  const VALID_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
  const OTHER_VALID_KEY = 'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1'

  const load = () => import('../../utils/secret-bootstrap')

  describe('precedence: env > file', () => {
    it('valid env + divergent file on disk → source=env, env unchanged, warns', async () => {
      const { ensureSecret, ENCRYPTION_KEY_SPEC, resolveDataDir } = await load()
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      fs.mkdirSync(resolveDataDir(), { recursive: true })
      fs.writeFileSync(path.join(resolveDataDir(), ENCRYPTION_KEY_SPEC.fileName), OTHER_VALID_KEY)
      process.env.ENCRYPTION_KEY = VALID_KEY

      const source = ensureSecret(ENCRYPTION_KEY_SPEC)

      expect(source).toBe('env')
      expect(process.env.ENCRYPTION_KEY).toBe(VALID_KEY)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).not.toContain(VALID_KEY)
      expect(warnSpy.mock.calls[0][0]).not.toContain(OTHER_VALID_KEY)

      warnSpy.mockRestore()
    })

    it('ENCRYPTION_KEY env present but invalid → throws (fail-fast)', async () => {
      const { ensureSecret, ENCRYPTION_KEY_SPEC } = await load()
      process.env.ENCRYPTION_KEY = 'not-hex-and-too-short'

      expect(() => ensureSecret(ENCRYPTION_KEY_SPEC)).toThrow(/64 hex characters/)
    })

    it('JWT_SECRET env with an arbitrary non-empty string is accepted → source=env', async () => {
      const { ensureSecret, JWT_SECRET_SPEC } = await load()
      process.env.JWT_SECRET = 'dev_secret'

      const source = ensureSecret(JWT_SECRET_SPEC)

      expect(source).toBe('env')
      expect(process.env.JWT_SECRET).toBe('dev_secret')
    })

    it("ENCRYPTION_KEY='' (empty) is treated as absent → falls through to file generation", async () => {
      const { ensureSecret, ENCRYPTION_KEY_SPEC, resolveDataDir } = await load()
      process.env.ENCRYPTION_KEY = ''

      const source = ensureSecret(ENCRYPTION_KEY_SPEC)

      expect(source).toBe('file')
      expect(process.env.ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/)
      expect(fs.existsSync(path.join(resolveDataDir(), ENCRYPTION_KEY_SPEC.fileName))).toBe(true)
    })

    it('JWT_SECRET with a whitespace-only value is accepted un-trimmed (permissive validator)', async () => {
      const { ensureSecret, JWT_SECRET_SPEC } = await load()
      process.env.JWT_SECRET = '   '

      const source = ensureSecret(JWT_SECRET_SPEC)

      expect(source).toBe('env')
      expect(process.env.JWT_SECRET).toBe('   ')
    })
  })

  describe('generation', () => {
    it('no env, no file → generates a 64-hex file with 0600 perms in a 0700 dir, populates process.env, returns file', async () => {
      const { ensureSecret, ENCRYPTION_KEY_SPEC, resolveDataDir } = await load()

      const source = ensureSecret(ENCRYPTION_KEY_SPEC)

      expect(source).toBe('file')
      const filePath = path.join(resolveDataDir(), ENCRYPTION_KEY_SPEC.fileName)
      const written = fs.readFileSync(filePath, 'utf8').trim()
      expect(written).toMatch(/^[0-9a-f]{64}$/)
      expect(process.env.ENCRYPTION_KEY).toBe(written)

      const fileMode = fs.statSync(filePath).mode & 0o777
      expect(fileMode).toBe(0o600)
      const dirMode = fs.statSync(resolveDataDir()).mode & 0o777
      expect(dirMode).toBe(0o700)
    })

    it('re-read next boot: file present, no env → source=file, env populated from file content', async () => {
      const first = await load()
      const firstSource = first.ensureSecret(first.ENCRYPTION_KEY_SPEC)
      const generated = process.env.ENCRYPTION_KEY
      expect(firstSource).toBe('file')

      jest.resetModules()
      delete process.env.ENCRYPTION_KEY
      const second = await load()
      const secondSource = second.ensureSecret(second.ENCRYPTION_KEY_SPEC)

      expect(secondSource).toBe('file')
      expect(process.env.ENCRYPTION_KEY).toBe(generated)
    })

    it('corrupt file (no env) → throws, file is NOT overwritten', async () => {
      const { ensureSecret, ENCRYPTION_KEY_SPEC, resolveDataDir } = await load()
      fs.mkdirSync(resolveDataDir(), { recursive: true })
      const filePath = path.join(resolveDataDir(), ENCRYPTION_KEY_SPEC.fileName)
      fs.writeFileSync(filePath, 'xyz')

      expect(() => ensureSecret(ENCRYPTION_KEY_SPEC)).toThrow(/malformed/)
      expect(fs.readFileSync(filePath, 'utf8')).toBe('xyz')
    })

    it('wx race (EEXIST on write) → re-reads the winner-written file instead of throwing', async () => {
      const { ensureSecret, ENCRYPTION_KEY_SPEC } = await load()

      const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        const err = new Error('EEXIST: file already exists') as NodeJS.ErrnoException
        err.code = 'EEXIST'
        throw err
      })
      const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => VALID_KEY)

      const source = ensureSecret(ENCRYPTION_KEY_SPEC)

      expect(source).toBe('file')
      expect(process.env.ENCRYPTION_KEY).toBe(VALID_KEY)

      writeSpy.mockRestore()
      readSpy.mockRestore()
    })

    it('two secrets are generated independently into two separate files', async () => {
      const { ensureSecret, ENCRYPTION_KEY_SPEC, JWT_SECRET_SPEC, resolveDataDir } = await load()

      ensureSecret(ENCRYPTION_KEY_SPEC)
      ensureSecret(JWT_SECRET_SPEC)

      const encFile = fs.readFileSync(path.join(resolveDataDir(), ENCRYPTION_KEY_SPEC.fileName), 'utf8').trim()
      const jwtFile = fs.readFileSync(path.join(resolveDataDir(), JWT_SECRET_SPEC.fileName), 'utf8').trim()

      expect(encFile).toMatch(/^[0-9a-f]{64}$/)
      expect(jwtFile).toMatch(/^[0-9a-f]{64}$/)
      expect(encFile).not.toBe(jwtFile)
      expect(process.env.ENCRYPTION_KEY).toBe(encFile)
      expect(process.env.JWT_SECRET).toBe(jwtFile)
    })
  })

  describe('getEncryptionKeySource', () => {
    it('defaults to env before ensureSecret ever runs', async () => {
      const { getEncryptionKeySource } = await load()
      expect(getEncryptionKeySource()).toBe('env')
    })

    it('becomes file after ensureSecret(ENCRYPTION_KEY_SPEC) resolves from disk', async () => {
      const { ensureSecret, getEncryptionKeySource, ENCRYPTION_KEY_SPEC } = await load()
      ensureSecret(ENCRYPTION_KEY_SPEC)
      expect(getEncryptionKeySource()).toBe('file')
    })

    it('becomes env after ensureSecret(ENCRYPTION_KEY_SPEC) resolves from env', async () => {
      const { ensureSecret, getEncryptionKeySource, ENCRYPTION_KEY_SPEC } = await load()
      process.env.ENCRYPTION_KEY = VALID_KEY
      ensureSecret(ENCRYPTION_KEY_SPEC)
      expect(getEncryptionKeySource()).toBe('env')
    })

    it('is NOT changed by ensureSecret(JWT_SECRET_SPEC) (trackSource unset)', async () => {
      const { ensureSecret, getEncryptionKeySource, ENCRYPTION_KEY_SPEC, JWT_SECRET_SPEC } = await load()
      process.env.ENCRYPTION_KEY = VALID_KEY
      ensureSecret(ENCRYPTION_KEY_SPEC)
      expect(getEncryptionKeySource()).toBe('env')

      delete process.env.JWT_SECRET
      ensureSecret(JWT_SECRET_SPEC) // resolves from file — must not flip the encryption-key source
      expect(getEncryptionKeySource()).toBe('env')
    })
  })

  describe('fingerprintKey', () => {
    it('is deterministic, 12 lowercase hex chars, and never equal to the key', async () => {
      const { fingerprintKey } = await load()
      const a = fingerprintKey(VALID_KEY)
      const b = fingerprintKey(VALID_KEY)

      expect(a).toBe(b)
      expect(a).toMatch(/^[0-9a-f]{12}$/)
      expect(a).not.toBe(VALID_KEY)
    })
  })
})
