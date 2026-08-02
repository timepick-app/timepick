import { describe, it, expect } from 'vitest'
import { userFacingErrorMessage } from '../userFacingErrorMessage'

/**
 * Ces tests étaient l'inverse : ils affirmaient que le message brut du serveur
 * ou celui d'axios DEVAIT s'afficher. Ils affirment maintenant la règle en
 * vigueur — un message serveur n'atteint l'écran que sous un code de la liste
 * blanche, et aucun texte d'axios ne l'atteint jamais.
 */
describe('userFacingErrorMessage', () => {
  describe('règle 1 — aucune réponse HTTP', () => {
    it('une coupure réseau donne la phrase réseau, jamais le texte d\'axios', () => {
      const err = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
      const message = userFacingErrorMessage(err, 'fallback')
      expect(message).toContain('Connexion interrompue avant la réponse du serveur')
      expect(message).not.toContain('Network Error')
    })

    it('la phrase réseau n\'affirme pas que rien n\'a été envoyé — une coupure peut survenir après un envoi traité par le serveur', () => {
      const err = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
      const message = userFacingErrorMessage(err, 'fallback')
      expect(message.toLowerCase()).not.toContain("rien n'a été envoyé")
    })

    it('un délai dépassé donne une phrase distincte, qui n\'affirme aucun état', () => {
      const err = Object.assign(new Error('timeout of 30000ms exceeded'), {
        code: 'ECONNABORTED',
      })
      const message = userFacingErrorMessage(err, 'fallback')
      expect(message).toContain("n'a pas répondu à temps")
      expect(message).not.toContain('timeout of')
    })

    it('réseau et délai ne disent pas la même chose', () => {
      const network = userFacingErrorMessage(
        Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
        'fb',
      )
      const timeout = userFacingErrorMessage(
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
        'fb',
      )
      expect(network).not.toBe(timeout)
    })

    it('une Error locale sans code de transport donne la phrase de l\'appelant', () => {
      expect(userFacingErrorMessage(new Error('Network down'), 'fallback')).toBe('fallback')
    })
  })

  describe('règle 2 — code de la liste blanche', () => {
    it('affiche le message du serveur tel quel', () => {
      const err = {
        response: {
          data: {
            error: {
              code: 'SLOT_FULL',
              message: "Désolé, ce créneau vient d'être pris. Choisissez un autre créneau.",
            },
          },
        },
      }
      expect(userFacingErrorMessage(err, 'fb')).toBe(
        "Désolé, ce créneau vient d'être pris. Choisissez un autre créneau.",
      )
    })

    it('lit aussi le code frère de la forme plate', () => {
      const err = {
        response: {
          data: { error: "Cet événement n'est pas encore accessible", code: 'EVENT_NOT_PUBLISHED' },
        },
      }
      expect(userFacingErrorMessage(err, 'fb')).toBe("Cet événement n'est pas encore accessible")
    })

    it('retombe sur l\'appelant si le message est vide malgré un code valide', () => {
      const err = { response: { data: { error: { code: 'SLOT_FULL', message: '' } } } }
      expect(userFacingErrorMessage(err, 'fb')).toBe('fb')
    })
  })

  describe('règle 3 — tout le reste', () => {
    it('un message serveur sans code n\'est pas affiché', () => {
      const err = { response: { data: { error: 'Slot is full' } } }
      expect(userFacingErrorMessage(err, 'fb')).toBe('fb')
    })

    it('un code hors liste blanche n\'affiche pas son message', () => {
      const err = {
        response: {
          data: {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'bodyMjml doit contenir les marqueurs <!-- BODY:START --> … (D-ext6)',
            },
          },
        },
      }
      const message = userFacingErrorMessage(err, "Erreur lors de l'enregistrement")
      expect(message).toBe("Erreur lors de l'enregistrement")
      expect(message).not.toContain('bodyMjml')
    })

    it('INTERNAL_ERROR n\'affiche pas son repli serveur', () => {
      const err = {
        response: { data: { error: { code: 'INTERNAL_ERROR', message: 'Une erreur est survenue.' } } },
      }
      expect(userFacingErrorMessage(err, 'phrase appelante')).toBe('phrase appelante')
    })

    it('une réponse sans corps d\'erreur donne la phrase de l\'appelant', () => {
      expect(userFacingErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback')
    })

    it('null, undefined, une chaîne ou un objet vide donnent la phrase de l\'appelant', () => {
      expect(userFacingErrorMessage(null, 'fallback')).toBe('fallback')
      expect(userFacingErrorMessage(undefined, 'fallback')).toBe('fallback')
      expect(userFacingErrorMessage('plain string error', 'fallback')).toBe('fallback')
      expect(userFacingErrorMessage({}, 'fallback')).toBe('fallback')
    })
  })
})
