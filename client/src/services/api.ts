import axios from 'axios';

/**
 * Type générique pour les réponses API standardisées
 * Le backend renvoie toujours { data: T, error?: string }
 */
export interface ApiResponse<T> {
  data: T
}

/**
 * Échappatoire RÉSERVÉE aux tests e2e (voir
 * tests/e2e/error-messages-user-facing.spec.ts) : un test ne peut pas faire
 * avancer la minuterie native d'un XHR, donc pour exercer la branche délai
 * sans attendre 60 s réelles, le test pose ce global AVANT le chargement du
 * bundle (`page.addInitScript`). `window` ne porte jamais cette propriété
 * hors d'un run Playwright qui la définit explicitement — le comportement
 * réel des utilisateurs n'est jamais modifié.
 */
declare global {
  interface Window {
    __E2E_API_TIMEOUT_MS__?: number
  }
}

const DEFAULT_TIMEOUT_MS = 60_000

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  // Sans `timeout`, une requête dont la connexion meurt en vol ne déclenche
  // JAMAIS `ECONNABORTED`/`ETIMEDOUT` : le navigateur attend indéfiniment (ou
  // jusqu'au timeout OS, des minutes), et la seule branche atteignable côté
  // client reste `ERR_NETWORK` — celle qui ne peut PAS affirmer que le
  // serveur a traité la demande. 60 s est délibérément généreux : couper
  // plus tôt tuerait des requêtes légitimes (rendu de gros modèles d'email,
  // recherches larges) et ferait passer un simple ralentissement pour une
  // coupure. Les routes identifiées comme structurellement plus lentes
  // (envoi d'invitations en masse, import CSV avec invitations) posent leur
  // propre `timeout` plus généreux au niveau de l'appel — voir leurs
  // services respectifs.
  timeout: window.__E2E_API_TIMEOUT_MS__ ?? DEFAULT_TIMEOUT_MS,
});

// Intercepteur de request - ajouter le token si disponible
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur de response - sur 401 (session expirée), déconnexion propre + redirection.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // On ne déclenche le teardown global que pour un utilisateur qui se croyait
      // authentifié (token présent), HORS flux magic-link (/auth/*, géré localement
      // par Login et refreshSession) et HORS page de login. La présence du token
      // assure l'unicité : le 1er 401 le retire, les 401 concurrents (polling) voient
      // hadToken=false et passent → pas de redirections multiples.
      const hadToken = !!localStorage.getItem('auth_token');
      const requestUrl = error.config?.url ?? '';
      const isAuthRoute = requestUrl.includes('/auth/');
      const onLoginPage = window.location.pathname === '/login';
      if (hadToken && !isAuthRoute && !onLoginPage) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('loginTime');
        localStorage.removeItem('sessionTTL');
        window.location.href = '/login?reason=session_expired';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
