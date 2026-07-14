import { describe, it, expect } from 'vitest'
import { computeRecoveryBanner } from '../recoveryBanner'
import type { RecoveryCodesStatus } from '@/services/recovery.service'

const NOW = new Date('2026-06-01T12:00:00Z')
const status = (o: Partial<RecoveryCodesStatus>): RecoveryCodesStatus => ({
  remaining: 8, expiresAt: null, lastGeneratedAt: null,
  emergencyLoginNotified: true, ...o,
})

describe('computeRecoveryBanner', () => {
  it('null si statut absent', () => {
    expect(computeRecoveryBanner(undefined, false, NOW)).toBeNull()
  })
  it('missing (ambre, non-ignorable) si aucun code restant', () => {
    const b = computeRecoveryBanner(status({ remaining: 0 }), false, NOW)
    expect(b).toMatchObject({ kind: 'missing', tone: 'amber', dismissable: false })
    expect(b?.message).toMatch(/Aucun code/)
  })
  it('low (ambre, non-ignorable) si ≤ 2 codes', () => {
    const b = computeRecoveryBanner(status({ remaining: 2 }), false, NOW)
    expect(b).toMatchObject({ kind: 'low', tone: 'amber', dismissable: false })
    expect(b?.message).toMatch(/2 codes/)
  })
  it('low : singulier à 1 code', () => {
    expect(computeRecoveryBanner(status({ remaining: 1 }), false, NOW)?.message).toMatch(/1 code de secours/)
  })
  it('expiring (ambre, non-ignorable) si expiration ≤ 30 j', () => {
    const expiresAt = new Date(NOW.getTime() + 10 * 86_400_000).toISOString()
    expect(computeRecoveryBanner(status({ remaining: 8, expiresAt }), false, NOW))
      .toMatchObject({ kind: 'expiring', tone: 'amber', dismissable: false })
  })
  it("pas d'alerte expiring si expiration > 30 j", () => {
    const expiresAt = new Date(NOW.getTime() + 40 * 86_400_000).toISOString()
    expect(computeRecoveryBanner(status({ remaining: 8, expiresAt }), false, NOW)).toBeNull()
  })
  it('expiring : borne incluse à exactement 30 j', () => {
    const expiresAt = new Date(NOW.getTime() + 30 * 86_400_000).toISOString()
    expect(computeRecoveryBanner(status({ remaining: 8, expiresAt }), false, NOW)?.kind).toBe('expiring')
  })
  it('emergency (ambre, IGNORABLE) si connexion via code non notifiée', () => {
    expect(computeRecoveryBanner(status({ remaining: 8, emergencyLoginNotified: false }), false, NOW))
      .toMatchObject({ kind: 'emergency', tone: 'amber', dismissable: true })
  })
  it('emergency aussi via le drapeau de session local', () => {
    expect(computeRecoveryBanner(status({ remaining: 8, emergencyLoginNotified: true }), true, NOW)?.kind).toBe('emergency')
  })
  it('null si tout est en ordre', () => {
    expect(computeRecoveryBanner(status({ remaining: 8, emergencyLoginNotified: true }), false, NOW)).toBeNull()
  })
  it("priorité : expiring proche l'emporte sur emergency", () => {
    const expiresAt = new Date(NOW.getTime() + 5 * 86_400_000).toISOString()
    expect(computeRecoveryBanner(status({ remaining: 8, expiresAt, emergencyLoginNotified: false }), true, NOW)?.kind).toBe('expiring')
  })
})
