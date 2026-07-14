import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';
import type { User } from '@/types/user';
import { initializeSessionData, clearSessionData } from './useSessionTimeout';
import api from '@/services/api';
import { DEFAULT_SESSION_TTL } from './useMagicLinkConfig';

// AuthUser represents the minimal user data stored in localStorage
// (a subset of the full User type from types/user.ts)
export type AuthUser = Omit<User, 'createdAt' | 'updatedAt' | 'bookingCount'>;

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: AuthUser, sessionTTL?: number) => void;
  logout: () => void;
  refreshSession: () => Promise<void>;
  updateAuthUser: (partial: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

/**
 * Garde de forme pour AuthUser parsé depuis le localStorage.
 * Durcissement contre un état localStorage périmé/partiel (résidus de tests, ancienne version) —
 * évite d'hydrater une session corrompue et d'attacher un Bearer invalide.
 */
function isValidStoredAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' && v.id.length > 0 &&
    typeof v.email === 'string' &&
    (v.role === 'admin' || v.role === 'user') &&
    typeof v.hasMemberAccess === 'boolean'
  );
}

/**
 * Provider pour l'authentification
 * Gère le stockage du token et des infos utilisateur
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Au montage, vérifier si un token existe
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (!isValidStoredAuthUser(parsedUser)) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          clearSessionData();
        } else {
          // Réhydratation unique au montage depuis localStorage : rendre cet effet
          // conforme imposerait d'initialiser isLoading à false d'emblée, ce qui
          // supprimerait l'écran de chargement (cf. Booking.tsx) et risquerait une
          // régression du flux d'authentification. setState au montage assumé ici.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setToken(storedToken);
          setUser(parsedUser);
        }
      } catch {
        // Données JSON invalides, purger
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        clearSessionData();
      }
    }

    setIsLoading(false);
  }, []);

  const login = (newToken: string, userData: AuthUser, sessionTTL: number = DEFAULT_SESSION_TTL) => {
    setToken(newToken);
    setUser(userData);

    // Stocker dans localStorage
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));

    // Initialiser les données de session pour useSessionTimeout
    initializeSessionData(sessionTTL);
  };

  const refreshSession = async (): Promise<void> => {
    try {
      // Utiliser api au lieu de fetch pour bénéficier de l'intercepteur
      const response = await api.post<{ data: { token: string; expiresAt: number } }>(
        '/auth/refresh'
      );

      const { token: newToken, expiresAt } = response.data.data;

      // Mettre à jour le token et les données de session
      // Calculer le nouveau loginTime en utilisant le TTL actuel depuis localStorage
      const currentSessionTTL = parseInt(localStorage.getItem('sessionTTL') || String(DEFAULT_SESSION_TTL), 10);
      const newLoginTime = expiresAt - currentSessionTTL;

      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem('loginTime', newLoginTime.toString());

      setToken(newToken);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement de la session:', error);
      // En cas d'erreur, déconnecter l'utilisateur
      logout();
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);

    // Nettoyer localStorage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    clearSessionData();

    // Clear emergency-session flag so a subsequent login on the same tab
    // doesn't inherit a stale banner trigger from a previous emergency session.
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('emergencySession');
    }
  };

  // Met à jour l'utilisateur courant (contexte + localStorage) sans toucher au
  // token ni aux données de session. Utilisé après une modification de profil
  // pour que la carte NavUser reflète immédiatement le nouveau nom.
  const updateAuthUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    refreshSession,
    updateAuthUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook pour accéder au contexte d'authentification
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook d'accès au contexte, co-localisé avec AuthProvider ; l'extraire imposerait une migration d'imports massive et casserait les mocks par chemin (~5 fichiers de test) pour un gain HMR nul sur ce fichier de base rarement édité.
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
