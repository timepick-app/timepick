/**
 * Database Pool Module
 *
 * This is the low-level module that creates the PostgreSQL pool.
 * Other modules (db.ts and db/query.ts) import from here to avoid circular dependencies.
 *
 * @internal
 */

import { Pool, PoolClient } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// En environnement de test (Jest pose NODE_ENV='test'), Jest isole le registre de
// modules PAR FICHIER → un pool par fichier de test, jamais fermé en cours de run
// (forceExit:true, globalTeardown no-op). Avec idleTimeoutMillis=30000, les connexions
// inactives s'accumulent sur ~73 fichiers et finissent par dépasser max_connections=100
// (limite GLOBALE du serveur PostgreSQL, partagée avec l'app dev) → « too many clients
// already », d'où une suite flaky. En test, on draine vite les connexions inactives (1 s)
// et on borne le pool (10, suffisant pour les tests de concurrence ~7 requêtes
// simultanées) : le pic reste largement sous 100. La config de PRODUCTION est inchangée.
const isTest = process.env.NODE_ENV === 'test'

// Create the pool instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: isTest ? 10 : 20,
  idleTimeoutMillis: isTest ? 1000 : 30000,
  connectionTimeoutMillis: 2000,
})

// Filet de sécurité OBLIGATOIRE : `pg` émet l'événement `error` sur le pool quand
// un client INACTIF tombe (Postgres ferme une connexion idle, coupure réseau,
// reset, redémarrage du serveur DB). Sans listener, Node traite l'événement
// `error` d'un EventEmitter comme une exception non gérée et CRASHE le process
// (symptôme observé : « [nodemon] app crashed » alors que toutes les requêtes
// HTTP répondaient en 304). On journalise et on laisse le pool écarter le client
// fautif ; la requête suivante ré-établit une connexion saine.
pool.on('error', (err) => {
  console.error('[db pool] erreur sur un client inactif (client écarté, pool conservé) :', err)
})

// Export types for use in other modules
export type { PoolClient }
export default pool
