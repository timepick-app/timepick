import { describe, it, expect } from 'vitest'
import { formatFullName } from '../formatFullName'

describe('formatFullName', () => {
  it('compose « Prénom Nom » quand les deux sont fournis', () => {
    expect(formatFullName('Jean', 'Dupont')).toBe('Jean Dupont')
  })

  it('rend le prénom seul pour un mononyme (lastName null)', () => {
    expect(formatFullName('Madonna', null)).toBe('Madonna')
  })

  it('rend le prénom seul pour un mononyme (lastName vide)', () => {
    expect(formatFullName('Madonna', '')).toBe('Madonna')
  })

  it('ne laisse pas d\'espace de fin quand lastName est undefined', () => {
    expect(formatFullName('Madonna', undefined)).toBe('Madonna')
  })

  it('préserve les noms composés', () => {
    expect(formatFullName('Jean-Pierre', 'Martin')).toBe('Jean-Pierre Martin')
  })

  it('préserve les accents', () => {
    expect(formatFullName('Élodie', 'Lefèvre')).toBe('Élodie Lefèvre')
  })

  it('détrime les espaces parasites des deux champs', () => {
    expect(formatFullName('  Jean  ', '  Dupont  ')).toBe('Jean Dupont')
  })

  it('rend le prénom seul si le nom est uniquement des espaces', () => {
    expect(formatFullName('Jean', '   ')).toBe('Jean')
  })

  it('rend une chaîne vide si les deux champs sont uniquement des espaces', () => {
    expect(formatFullName('   ', '   ')).toBe('')
  })

  it('ne rend jamais « undefined » ni « null »', () => {
    const result = formatFullName(undefined, undefined)
    expect(result).toBe('')
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('null')
  })

  it('retombe sur le nom seul si le prénom est absent (cas dégradé)', () => {
    expect(formatFullName(null, 'Dupont')).toBe('Dupont')
  })
})
