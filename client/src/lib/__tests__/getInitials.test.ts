import { describe, it, expect } from 'vitest'
import { getInitials } from '../getInitials'

describe('getInitials', () => {
  it('compose les deux initiales quand prénom et nom sont fournis', () => {
    expect(getInitials('Sophie', 'Martin')).toBe('SM')
  })

  it('rend une seule initiale pour un mononyme (lastName vide)', () => {
    expect(getInitials('Cher', '')).toBe('C')
  })

  it('rend une seule initiale pour un mononyme (lastName null)', () => {
    expect(getInitials('Cher', null)).toBe('C')
  })

  it('rend une seule initiale pour un mononyme (lastName undefined)', () => {
    expect(getInitials('Cher', undefined)).toBe('C')
  })

  it('prend le premier caractère brut des noms composés (Jean-Pierre → J, pas JP)', () => {
    expect(getInitials('Jean-Pierre', 'Dupont-Leblanc')).toBe('JD')
  })

  it('met les accents en majuscules (uppercasing Unicode)', () => {
    expect(getInitials('Élodie', 'Ångström')).toBe('ÉÅ')
  })

  it('met en majuscules une saisie en minuscules accentuée', () => {
    expect(getInitials('élodie', 'ångström')).toBe('ÉÅ')
  })

  it('retombe sur « ? » quand prénom et nom sont vides', () => {
    expect(getInitials('', '')).toBe('?')
  })

  it('retombe sur « ? » quand prénom est vide et nom null', () => {
    expect(getInitials('', null)).toBe('?')
  })

  it('ignore les espaces de tête', () => {
    expect(getInitials('  Sophie', '  Martin')).toBe('SM')
  })

  it('retombe sur « ? » quand les champs ne contiennent que des espaces', () => {
    expect(getInitials('   ', '   ')).toBe('?')
  })
})
