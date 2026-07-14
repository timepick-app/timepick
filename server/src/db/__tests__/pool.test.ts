import pool from '../pool'

/**
 * Régression : un client INACTIF du pool pg qui tombe (Postgres ferme une
 * connexion idle, coupure réseau, reset) fait émettre `error` sur le pool.
 * Sous Node, un événement `error` d'EventEmitter SANS listener est jeté comme
 * exception non gérée → crash du process (« [nodemon] app crashed »).
 *
 * Le polling admin (refetch périodique des créneaux/stats) maintient un flux
 * continu de connexions qui cyclent en idle, ce qui expose ce crash latent.
 * Ces tests verrouillent l'invariant : un listener `error` existe et absorbe
 * l'erreur sans la propager.
 */
describe('db/pool — résilience aux erreurs de clients inactifs', () => {
  it('attache au moins un listener "error" sur le pool (anti-crash process)', () => {
    expect(pool.listenerCount('error')).toBeGreaterThan(0)
  })

  it("journalise l'erreur d'un client inactif sans la propager (pas de crash)", () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Sans listener, emit('error') jette de façon synchrone (comportement
      // EventEmitter de Node) ; avec le listener du fix, l'erreur est absorbée.
      expect(() =>
        pool.emit('error', new Error('connexion idle terminée'), undefined as never),
      ).not.toThrow()
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
