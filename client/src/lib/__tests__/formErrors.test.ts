import { describe, it, expect } from 'vitest'
import { visibleFieldErrors } from '../formErrors'

// Le piège est l'espace de noms des clés : les champs d'un fournisseur email
// HTTP portent des erreurs `credentials.<champ>` alors que le formulaire ne
// suit qu'une seule clé `credentials`. Une régression sur ce repli est
// invisible à l'œil — elle ne casse rien, elle fait juste disparaître tous les
// motifs du bloc HTTP et leur `aria-invalid`. Le cas nominal (champ touché ou
// non) est couvert de bout en bout par SetupWizard.test.tsx.
describe('visibleFieldErrors', () => {
  it('révèle les motifs `credentials.<champ>` dès que le bloc credentials est touché', () => {
    const errors = {
      'credentials.apiKey': 'Le champ « Clé API » est requis',
      'credentials.secretKey': 'Le champ « Clé secrète » est requis',
    }
    expect(visibleFieldErrors(errors, { credentials: true })).toEqual(errors)
  })

  it('les masque tant que le bloc credentials n\'a pas été touché', () => {
    const errors = { 'credentials.apiKey': 'Le champ « Clé API » est requis' }
    expect(visibleFieldErrors(errors, { smtpHost: true })).toEqual({})
  })
})
