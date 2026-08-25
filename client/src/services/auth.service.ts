// Même source que `api.ts` pour la base d'API, trimmée du slash terminal :
// `fetch` ne normalise pas la concaténation (axios le faisait via `combineURLs`),
// et un `VITE_API_URL` terminé par `/` produirait `/api//auth/logout`, qu'Express
// ne route pas — 404 avalé en silence.
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '')

/**
 * F-085 : notifie le serveur de la révocation de session (toutes les sessions
 * du compte, cf. `POST /api/auth/logout` → `users.token_version`).
 *
 * Pourquoi `fetch` + `keepalive` et pas `api.post` : deux des trois appelants
 * (`NavUser`, `PublicUserMenu`) enchaînent immédiatement
 * `window.location.href = '/login'`. Un XHR axios n'est envoyé qu'à la
 * micro-tâche suivante — la navigation l'annule AVANT qu'il ne parte (vérifié :
 * le jeton restait valide côté serveur). `keepalive` fait porter la requête par
 * le navigateur au-delà du déchargement de la page. Le troisième appelant
 * (`Users.tsx`) navigue en SPA : `keepalive` y est simplement sans effet.
 * `navigator.sendBeacon` ne convient pas — il ne permet pas de poser
 * `Authorization`. Limite connue : Firefox < 133 ignore `keepalive` et retombe
 * sur le comportement annulé.
 *
 * Le jeton est lu et passé explicitement : l'intercepteur de requête d'axios
 * lirait `localStorage` au moment de l'envoi, donc après le nettoyage local.
 *
 * Best-effort : rien ici ne doit empêcher la déconnexion locale — aucun `await`,
 * aucune erreur propagée.
 */
export function revokeSessionOnServer(): void {
  const token = localStorage.getItem('auth_token')
  // Pas de jeton = rien à révoquer (l'appel serait un 401 stérile).
  if (!token) return

  void fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    keepalive: true,
    headers: { Authorization: `Bearer ${token}` },
  })
    // `fetch` ne rejette QUE sur échec transport : un 404 (endpoint renommé, base
    // mal construite) ou un 500 résolvent normalement. Sans ce test, la seule
    // panne DURABLE de la révocation serait totalement invisible — l'utilisateur
    // atterrit sur /login exactement comme en cas de succès. DEV uniquement
    // (convention QueryProvider) : en prod la branche est éliminée au build.
    .then((response) => {
      if (!response.ok && import.meta.env.DEV) {
        console.warn('[auth] révocation serveur non confirmée —', response.status)
      }
    })
    .catch((error: unknown) => {
      // Réseau coupé, hors-ligne, CORS : attendu et non actionnable.
      if (import.meta.env.DEV) console.warn('[auth] révocation serveur injoignable —', error)
    })
}
