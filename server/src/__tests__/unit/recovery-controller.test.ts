/**
 * Unit tests for the constant-time comparison helper in recovery.controller.
 *
 * The bcrypt-compare invariants this function enforces are the core of the
 * anti-enumeration / timing-oracle defence. Breaking any of them re-introduces
 * a vulnerability, so we lock them in here.
 */
import bcrypt from 'bcrypt'
import { BCRYPT_COST, RECOVERY_CODES_PER_BATCH } from '../../services/recovery.service'
import { constantTimeCompare } from '../../controllers/recovery.controller'

describe('recovery.controller — constantTimeCompare', () => {
  // bcrypt.compare has overloaded signatures (promise + callback); use any here
  // rather than fighting the type overload in test-only code.
  let spy: jest.SpyInstance

  beforeEach(() => {
    spy = jest.spyOn(bcrypt, 'compare')
  })

  afterEach(() => {
    spy.mockRestore()
  })

  it('runs exactly RECOVERY_CODES_PER_BATCH (8) bcrypt.compare calls when no hashes provided', async () => {
    const result = await constantTimeCompare('any-code', [])
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
    expect(result).toBeNull()
  })

  it('runs exactly 8 compares when 1 real hash is provided (pads with DUMMY_HASH)', async () => {
    const hash = await bcrypt.hash('TIMEPICK-AAAA-BBBB', BCRYPT_COST)
    spy.mockClear()
    await constantTimeCompare('nope', [hash])
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
  })

  it('does not short-circuit on first match — runs all 8 compares even when the first hash matches', async () => {
    const code = 'TIMEPICK-AAAA-BBBB'
    const hash = await bcrypt.hash(code, BCRYPT_COST)
    spy.mockClear()
    const matchIdx = await constantTimeCompare(code, [hash])
    expect(matchIdx).toBe(0)
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
  })

  it('truncates to 8 hashes when more are provided (defence-in-depth, never lengthens the loop)', async () => {
    const dummy = await bcrypt.hash('dummy', BCRYPT_COST)
    const hashes = new Array(20).fill(dummy)
    spy.mockClear()
    await constantTimeCompare('nope', hashes)
    expect(spy).toHaveBeenCalledTimes(RECOVERY_CODES_PER_BATCH)
  })

  it('returns null when no hash matches', async () => {
    const hash = await bcrypt.hash('TIMEPICK-AAAA-BBBB', BCRYPT_COST)
    const matchIdx = await constantTimeCompare('wrong-code', [hash])
    expect(matchIdx).toBeNull()
  })

  it('returns the index of a matching hash', async () => {
    const code = 'TIMEPICK-CCCC-DDDD'
    const other = await bcrypt.hash('other-code', BCRYPT_COST)
    const real = await bcrypt.hash(code, BCRYPT_COST)
    const matchIdx = await constantTimeCompare(code, [other, other, real])
    expect(matchIdx).toBe(2)
  })
})
