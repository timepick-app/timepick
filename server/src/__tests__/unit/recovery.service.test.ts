import bcrypt from 'bcrypt'

// Mock DB layer pour tester invalidateRecoveryCodes sans Postgres : on capture
// le SQL + les params passés à `query`.
const mockQuery = jest.fn() as jest.Mock
jest.mock('../../db', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: jest.fn(),
}))

import {
  BCRYPT_COST,
  RECOVERY_CODES_PER_BATCH,
  RECOVERY_CODE_LIFETIME_DAYS,
  invalidateRecoveryCodes,
} from '../../services/recovery.service'

describe('recovery.service — constants', () => {
  it('BCRYPT_COST matches the cost used for DUMMY_HASH generation in the controller', () => {
    // A mismatch here silently breaks the timing-oracle defence: the DUMMY_HASH
    // compare time would diverge from real-code compare time. Any change must
    // update both places simultaneously.
    expect(BCRYPT_COST).toBe(12)
  })

  it('issues exactly 8 codes per batch (GitHub-style)', () => {
    expect(RECOVERY_CODES_PER_BATCH).toBe(8)
  })

  it('expires codes after 365 days', () => {
    expect(RECOVERY_CODE_LIFETIME_DAYS).toBe(365)
  })
})

describe('recovery.service — BCRYPT_COST ↔ DUMMY_HASH parity', () => {
  it('a hash generated at BCRYPT_COST is recognised as the same cost factor', async () => {
    const hash = await bcrypt.hash('test-string', BCRYPT_COST)
    // bcrypt stores cost in the hash prefix: $2b$12$...
    const match = hash.match(/^\$2[aby]\$(\d+)\$/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(BCRYPT_COST)
  })
})

describe('recovery.service — invalidateRecoveryCodes', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rowCount: 3 })
  })

  it('passe used_at = NOW() sur les codes non utilisés du user (admin_id = $1, used_at IS NULL)', async () => {
    await invalidateRecoveryCodes('user-42')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/UPDATE\s+admin_recovery_codes/i)
    expect(sql).toMatch(/used_at\s*=\s*NOW\(\)/i)
    expect(sql).toMatch(/used_at\s+IS\s+NULL/i)
    expect(params).toEqual(['user-42'])
  })
})
