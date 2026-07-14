import { describe, it, expect } from 'vitest'
import { isSafeInternalPath } from '../safeRedirect'

describe('isSafeInternalPath', () => {
  it.each(['/me', '/me/events/u1', '/admin', '/me/events/abc'])(
    'accepte un chemin interne absolu : %s',
    (value) => {
      expect(isSafeInternalPath(value)).toBe(true)
    },
  )

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['relatif sans slash', 'me/x'],
    ['protocol-relative', '//evil.com'],
    ['backslash', '/\\evil'],
    ['scheme http', 'http://evil'],
    ['scheme javascript', 'javascript:alert(1)'],
    ['controle \\u0001', '/x\u0001y'],
  ])('rejette : %s', (_label, value) => {
    expect(isSafeInternalPath(value)).toBe(false)
  })
})
