/**
 * Unit tests for the constant-time comparison helper in recovery.controller.
 *
 * The bcrypt-compare invariants this function enforces are the core of the
 * anti-enumeration / timing-oracle defence. Breaking any of them re-introduces
 * a vulnerability, so we lock them in here.
 *
 * bcrypt.compare is replaced by a deterministic mock: the fake hash `hash:X`
 * matches exactly the code `X` and nothing else (so DUMMY_HASH never matches,
 * same as production). These tests assert the loop invariants of
 * constantTimeCompare — call count, no short-circuit, returned index — not
 * bcrypt correctness, which is the library's own concern. With real bcrypt,
 * every call meant 8 compares against cost-12 hashes (~4 s per test), which
 * overflowed the 10 s testTimeout on a loaded machine.
 */
import bcrypt from 'bcrypt'
import { RECOVERY_CODES_PER_BATCH } from '../../services/recovery.service'
import { constantTimeCompare } from '../../controllers/recovery.controller'

// DUMMY_HASH is still bcrypt.hashSync'ed (cost 12, ~300-500 ms) when the
// controller module is imported, and CI machines vary — keep a safety net.
jest.setTimeout(30_000)

/** Deterministic stand-in: `hash:X` is "the hash of" code X. */
const fakeHash = (code: string) => `hash:${code}`

describe('recovery.controller — constantTimeCompare', () => {
  // bcrypt.compare has overloaded signatures (promise + callback); use the
  // loosely-typed SpyInstance rather than fighting the overload in test-only code.
  let spy: jest.SpyInstance

  beforeEach(() => {
    spy = jest.spyOn(bcrypt, 'compare')
    spy.mockImplementation(async (code: string, hash: string) => hash === fakeHash(code))
  })

  afterEach(() => {
    spy.mockRestore()
  })

  it('runs exactly RECOVERY_CODES_PER_BATCH (8) bcrypt.compare calls when no hashes provided', async () => {
    const result = await constantTimeCompare('any-code', [])
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
    expect(result).toBeNull()
  })

  it('runs exactly 8 compares when 1 hash is provided (pads with DUMMY_HASH)', async () => {
    const hash = fakeHash('TIMEPICK-AAAA-BBBB')
    spy.mockClear()
    await constantTimeCompare('nope', [hash])
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
  })

  it('does not short-circuit on first match — runs all 8 compares even when the first hash matches', async () => {
    const code = 'TIMEPICK-AAAA-BBBB'
    const hash = fakeHash(code)
    spy.mockClear()
    const matchIdx = await constantTimeCompare(code, [hash])
    expect(matchIdx).toBe(0)
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
  })

  it('truncates to 8 hashes when more are provided (defence-in-depth, never lengthens the loop)', async () => {
    const hashes = new Array(20).fill(fakeHash('dummy'))
    spy.mockClear()
    await constantTimeCompare('nope', hashes)
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
  })

  it('returns null when no hash matches', async () => {
    const matchIdx = await constantTimeCompare('wrong-code', [fakeHash('TIMEPICK-AAAA-BBBB')])
    expect(matchIdx).toBeNull()
  })

  it('returns the index of a matching hash', async () => {
    const code = 'TIMEPICK-CCCC-DDDD'
    const other = fakeHash('other-code')
    const matchIdx = await constantTimeCompare(code, [other, other, fakeHash(code)])
    expect(matchIdx).toBe(2)
  })

  it('never reports a match at a DUMMY_HASH padding position (guard i < hashes.length)', async () => {
    // Force every compare — padding included — to "match" : seul le garde
    // i < hashes.length empêche qu'un hit sur une position de remplissage
    // (le placeholder est une chaîne PUBLIQUE du source) soit reporté.
    spy.mockImplementation(async () => true)
    const matchIdx = await constantTimeCompare('any-code', [])
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
    expect(matchIdx).toBeNull()
  })

  it('returns the FIRST matching index when several hashes match', async () => {
    const code = 'TIMEPICK-EEEE-FFFF'
    const matchIdx = await constantTimeCompare(code, [fakeHash(code), fakeHash(code)])
    expect(matchIdx).toBe(0)
  })

  it('discards a match beyond the batch after truncation (index >= 8 → null)', async () => {
    const code = 'TIMEPICK-GGGG-HHHH'
    const hashes = [...new Array(RECOVERY_CODES_PER_BATCH).fill(fakeHash('other')), fakeHash(code)]
    const matchIdx = await constantTimeCompare(code, hashes)
    expect(matchIdx).toBeNull()
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
  })
})
