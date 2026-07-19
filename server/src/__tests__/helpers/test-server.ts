import type { Server } from 'http'
import app from '../../app'

/**
 * Serveur HTTP partagé par fichier de test (remplace les serveurs éphémères de supertest).
 *
 * Pourquoi : avant, chaque requête supertest sur l'app démarrait un serveur neuf via
 * `app.listen(0)`. Sur la suite complète (~680 requêtes, maxWorkers:1) ce churn de bind/close
 * provoquait un flake 405 rare (réassignation de port OS en TIME_WAIT pendant qu'un socket
 * résiduel était en transit). Ici on démarre UN serveur par fichier, réutilisé via
 * `request(testServer())`.
 *
 * IN-PROCESS (non négociable) : le serveur tourne dans le process de test, donc les
 * jest.spyOn/jest.mock (notamment les mocks email) continuent d'intercepter. Un serveur dans
 * un process séparé contournerait les mocks → vrais envois vers Mailpit.
 *
 * Jest réinitialise le module registry entre fichiers : `server`, `closed` et le hook afterAll
 * sont réinitialisés par fichier (≤ 32 serveurs sur la suite, au lieu de ~680).
 *
 * CONTRAT : ne pas appeler testServer() depuis un afterAll/afterEach. Le hook afterAll du helper
 * (enregistré à l'import → exécuté en premier, FIFO) ferme le serveur en fin de fichier ; un appel
 * post-fermeture lève une erreur explicite plutôt que de recréer un serveur orphelin (fuite de handle).
 */
let server: Server | undefined
let closed = false

export function testServer(): Server {
  if (closed) {
    throw new Error(
      '[test-server] testServer() appelé après la fermeture du serveur partagé (afterAll). ' +
        'Les hooks afterAll/afterEach ne doivent pas requêter le serveur partagé.',
    )
  }
  if (!server) {
    server = app.listen(0)
  }
  return server
}

// Enregistré à l'import du helper : les globals Jest (afterAll) sont injectés avant l'évaluation
// du fichier de test et de ses imports. Ferme le serveur en fin de fichier.
afterAll((done) => {
  if (server) {
    server.close(() => {
      closed = true
      done()
    })
  } else {
    done()
  }
})
