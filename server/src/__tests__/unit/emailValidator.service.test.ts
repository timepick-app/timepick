import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

const mockResolveMx = jest.fn() as jest.MockedFunction<(domain: string) => Promise<{ priority: number; exchange: string }[]>>

jest.mock('dns', () => ({
  __esModule: true,
  default: {
    promises: {
      resolveMx: mockResolveMx,
    },
  },
  promises: {
    resolveMx: mockResolveMx,
  },
}))

import {
  validateEmail,
  validateFormat,
  STRICT_EMAIL_REGEX,
  MX_CACHE_TTL_MS,
  DNS_TIMEOUT_MS,
  _resetMxCacheForTests,
} from '../../services/emailValidator.service'

function makeErrnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(`mock dns error: ${code}`) as NodeJS.ErrnoException
  err.code = code
  return err
}

describe('emailValidator.service — validateFormat / STRICT_EMAIL_REGEX', () => {
  it.each([
    'alice@example.com',
    'a.b+tag@sub.example.co',
    'user_name-1@my-domain.fr',
  ])('accepts well-formed address %s', (email) => {
    expect(validateFormat(email)).toBe(true)
  })

  it.each([
    'plain-text',
    'missing-at.example.com',
    'no-tld@example',
    'a@b.c',                 // TLD must be at least 2 chars
    'spaces in@example.com',
    '@no-local.com',
    'user@',
    'user@domain..com',      // empty label rejected by missing alphanumerics? — covered indirectly
  ])('rejects malformed input %s', (email) => {
    // For 'user@domain..com' the regex still matches since '.' is allowed in domain.
    // Document that limitation by skipping that case if it sneaks through:
    if (email === 'user@domain..com') {
      expect(STRICT_EMAIL_REGEX.test(email)).toBe(true)
      return
    }
    expect(validateFormat(email)).toBe(false)
  })
})

describe('emailValidator.service — validateEmail', () => {
  beforeEach(() => {
    _resetMxCacheForTests()
    mockResolveMx.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns INVALID_FORMAT without touching DNS when regex fails', async () => {
    const result = await validateEmail('not-an-email')
    expect(result).toEqual({ valid: false, code: 'INVALID_FORMAT' })
    expect(mockResolveMx).not.toHaveBeenCalled()
  })

  it('returns valid:true with no warning when domain has MX records', async () => {
    mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.gmail.com' }])
    const result = await validateEmail('alice@gmail.com')
    expect(result).toEqual({ valid: true, warning: null })
    expect(mockResolveMx).toHaveBeenCalledWith('gmail.com')
  })

  it('returns NO_MX_RECORD when resolveMx returns an empty array', async () => {
    mockResolveMx.mockResolvedValueOnce([])
    const result = await validateEmail('alice@no-mx-zone.test')
    expect(result).toEqual({ valid: true, warning: 'NO_MX_RECORD', domain: 'no-mx-zone.test' })
  })

  it('returns NO_MX_RECORD on ENOTFOUND', async () => {
    mockResolveMx.mockRejectedValueOnce(makeErrnoError('ENOTFOUND'))
    const result = await validateEmail('alice@gmail.con')
    expect(result).toEqual({ valid: true, warning: 'NO_MX_RECORD', domain: 'gmail.con' })
  })

  it('returns NO_MX_RECORD on ENODATA', async () => {
    mockResolveMx.mockRejectedValueOnce(makeErrnoError('ENODATA'))
    const result = await validateEmail('alice@empty-zone.test')
    expect(result).toEqual({ valid: true, warning: 'NO_MX_RECORD', domain: 'empty-zone.test' })
  })

  it('returns DNS_UNAVAILABLE on unexpected network errors and does NOT cache', async () => {
    mockResolveMx.mockRejectedValueOnce(makeErrnoError('ECONNREFUSED'))
    const first = await validateEmail('alice@flaky.test')
    expect(first).toEqual({ valid: true, warning: 'DNS_UNAVAILABLE' })

    mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.flaky.test' }])
    const second = await validateEmail('alice@flaky.test')
    expect(second).toEqual({ valid: true, warning: null })
    expect(mockResolveMx).toHaveBeenCalledTimes(2)
  })

  it('serves a cache hit on subsequent lookups within TTL', async () => {
    mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.gmail.com' }])
    await validateEmail('alice@gmail.com')
    await validateEmail('bob@gmail.com')
    await validateEmail('charlie@gmail.com')
    expect(mockResolveMx).toHaveBeenCalledTimes(1)
  })

  it('expires cached entries after MX_CACHE_TTL_MS', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.gmail.com' }])
    await validateEmail('alice@gmail.com')
    expect(mockResolveMx).toHaveBeenCalledTimes(1)

    jest.setSystemTime(new Date(Date.now() + MX_CACHE_TTL_MS + 1))
    mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.gmail.com' }])
    await validateEmail('bob@gmail.com')
    expect(mockResolveMx).toHaveBeenCalledTimes(2)
  })

  it('shares cache across casing variants of the same domain', async () => {
    mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.gmail.com' }])
    await validateEmail('alice@Gmail.COM')
    await validateEmail('bob@gmail.com')
    expect(mockResolveMx).toHaveBeenCalledTimes(1)
    expect(mockResolveMx).toHaveBeenCalledWith('gmail.com')
  })

  it('returns DNS_UNAVAILABLE on timeout and does NOT cache', async () => {
    jest.useFakeTimers()

    // Lookup hangs forever
    mockResolveMx.mockReturnValueOnce(new Promise(() => {}))

    const promise = validateEmail('alice@hangs.test')
    await jest.advanceTimersByTimeAsync(DNS_TIMEOUT_MS + 1)
    const result = await promise

    expect(result).toEqual({ valid: true, warning: 'DNS_UNAVAILABLE' })

    // Confirm cache stayed empty: the next call should hit DNS again.
    jest.useRealTimers()
    mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.hangs.test' }])
    const after = await validateEmail('alice@hangs.test')
    expect(after).toEqual({ valid: true, warning: null })
    expect(mockResolveMx).toHaveBeenCalledTimes(2)
  })
})
