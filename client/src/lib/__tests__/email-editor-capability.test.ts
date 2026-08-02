import { describe, it, expect, afterEach } from 'vitest'
import {
  EDITOR_MIN_SCREEN,
  canDeviceDisplayEmailEditor,
} from '../email-editor-capability'
import { setTestScreen } from '@/test/screenSize'

describe('canDeviceDisplayEmailEditor', () => {
  describe('les bornes du seuil', () => {
    it('accepte un écran exactement au seuil', () => {
      expect(canDeviceDisplayEmailEditor({ width: 800, height: 600 })).toBe(true)
    })

    it('refuse un point de largeur en dessous', () => {
      expect(canDeviceDisplayEmailEditor({ width: 799, height: 600 })).toBe(false)
    })

    it('refuse un point de hauteur en dessous', () => {
      expect(canDeviceDisplayEmailEditor({ width: 800, height: 599 })).toBe(false)
    })

    it('exige les DEUX dimensions — un grand côté seul ne suffit pas', () => {
      expect(canDeviceDisplayEmailEditor({ width: 1200, height: 599 })).toBe(false)
    })
  })

  describe("l'orientation ne change rien", () => {
    it('accepte le seuil couché comme debout', () => {
      expect(canDeviceDisplayEmailEditor({ width: 600, height: 800 })).toBe(true)
      expect(canDeviceDisplayEmailEditor({ width: 800, height: 600 })).toBe(true)
    })

    it('refuse un téléphone dans les deux sens', () => {
      expect(canDeviceDisplayEmailEditor({ width: 393, height: 852 })).toBe(false)
      expect(canDeviceDisplayEmailEditor({ width: 852, height: 393 })).toBe(false)
    })
  })

  describe('les appareils de contrôle de la dérivation du seuil', () => {
    it('refuse un iPhone 15 (393 × 852) — par son petit côté', () => {
      expect(canDeviceDisplayEmailEditor({ width: 393, height: 852 })).toBe(false)
    })

    it('refuse un petit Android (360 × 740) — par son grand côté', () => {
      expect(canDeviceDisplayEmailEditor({ width: 360, height: 740 })).toBe(false)
    })

    it('accepte un iPad mini (744 × 1133)', () => {
      expect(canDeviceDisplayEmailEditor({ width: 744, height: 1133 })).toBe(true)
    })

    it('accepte un iPad 10,9" (820 × 1180)', () => {
      expect(canDeviceDisplayEmailEditor({ width: 820, height: 1180 })).toBe(true)
    })
  })

  describe('le repli ouvert — en cas de doute, ne rien refuser', () => {
    it('accepte quand la mesure est nulle', () => {
      expect(canDeviceDisplayEmailEditor({ width: 0, height: 0 })).toBe(true)
    })

    it('accepte quand la mesure est absente', () => {
      expect(canDeviceDisplayEmailEditor({})).toBe(true)
      expect(canDeviceDisplayEmailEditor({ width: null, height: null })).toBe(true)
    })

    it('accepte quand la mesure est absurde', () => {
      expect(canDeviceDisplayEmailEditor({ width: -1, height: -1 })).toBe(true)
      expect(canDeviceDisplayEmailEditor({ width: Number.NaN, height: 900 })).toBe(true)
    })

    it("n'accepte pas pour autant une petite mesure plausible", () => {
      expect(canDeviceDisplayEmailEditor({ width: 320, height: 480 })).toBe(false)
    })
  })

  describe("l'invariant : le prédicat lit l'ÉCRAN, jamais la FENÊTRE", () => {
    // Rebrancher ce prédicat sur la taille de la fenêtre rendrait le refus
    // variable pendant une session et démonterait l'éditeur — avec sa
    // confirmation « Quitter sans enregistrer ? » — sous les doigts de
    // quelqu'un en train de travailler. Ces deux tests sont là pour que la
    // tentative échoue bruyamment.
    const { innerWidth, innerHeight } = window
    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
    })

    it('une fenêtre étroite ne refuse rien sur un écran capable', () => {
      Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 480, configurable: true })
      setTestScreen(1920, 1080)

      expect(canDeviceDisplayEmailEditor()).toBe(true)
    })

    it('une fenêtre large ne rachète pas un écran incapable', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true })
      setTestScreen(393, 852)

      expect(canDeviceDisplayEmailEditor()).toBe(false)
    })
  })

  it("lit window.screen quand on ne lui passe rien", () => {
    setTestScreen(360, 740)
    expect(canDeviceDisplayEmailEditor()).toBe(false)

    setTestScreen(1440, 900)
    expect(canDeviceDisplayEmailEditor()).toBe(true)
  })

  it('expose le seuil en un seul endroit', () => {
    expect(EDITOR_MIN_SCREEN).toEqual({ width: 800, height: 600 })
  })
})
