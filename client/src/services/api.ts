import axios from 'axios';

/**
 * Type générique pour les réponses API standardisées
 * Le backend renvoie toujours { data: T, error?: string }
 */
export interface ApiResponse<T> {
  data: T
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
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
