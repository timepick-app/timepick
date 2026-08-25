import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { AuthProvider, useAuth } from '../useAuth';
import api from '@/services/api';

// Note: localStorage.clear() is called in src/test/setup.ts before each test
// No need to call it here

describe('useAuth Hook', () => {
  // Réarme les mocks (api, fetch) après chaque test. Sans ce filet, un
  // mockRejectedValue* ou un vi.stubGlobal('fetch', ...) posé dans un test
  // continue de s'appliquer aux suivants si une assertion échoue avant
  // d'atteindre le nettoyage en fin de corps de test — un échec réel se
  // transforme alors en cascade de faux échecs.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fournit le contexte d\'authentification', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current).toBeDefined();
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('login stocke le token et l\'user', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    const mockUser = {
      id: '123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      phone: '1234567890',
      role: 'user' as const,
      hasMemberAccess: false,
    };

    act(() => {
      result.current.login('test-token', mockUser);
    });

    expect(result.current.token).toBe('test-token');
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);

    // Vérifier localStorage
    expect(localStorage.getItem('auth_token')).toBe('test-token');
    expect(localStorage.getItem('auth_user')).toBe(JSON.stringify(mockUser));
  });

  it('logout nettoie le storage', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    const mockUser = {
      id: '123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      phone: '1234567890',
      role: 'user' as const,
      hasMemberAccess: false,
    };

    // D'abord login
    act(() => {
      result.current.login('test-token', mockUser);
    });

    expect(result.current.isAuthenticated).toBe(true);

    // Ensuite logout
    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);

    // Vérifier localStorage est vidé
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('refreshSession en échec déconnecte localement sans appeler /auth/logout', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('network'));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    const mockUser = {
      id: '123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      phone: '1234567890',
      role: 'user' as const,
      hasMemberAccess: false,
    };

    act(() => {
      result.current.login('test-token', mockUser);
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await expect(result.current.refreshSession()).rejects.toThrow();
    });

    // Déconnexion locale déclenchée par l'échec du refresh
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();

    // Déconnexion automatique (échec technique) : jamais de révocation serveur F-085,
    // réservée aux gestes de déconnexion initiés par l'utilisateur (voir @/services/auth.service).
    // Assertion suivante en apparence tautologique (le helper n'utilise plus axios) : c'est un
    // garde-fou contre un retour à l'implémentation `api.post('/auth/logout')` du plan initial.
    expect(api.post).toHaveBeenCalledWith('/auth/refresh');
    expect(api.post).not.toHaveBeenCalledWith('/auth/logout');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('récupère l\'utilisateur au montage si token et user sont valides', async () => {
    // Pré-remplir localStorage avec un JWT bien formé et un user complet
    const mockUser = {
      id: '123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      phone: '1234567890',
      role: 'user' as const,
      hasMemberAccess: false,
    };

    localStorage.setItem('auth_token', 'aaa.bbb.ccc');
    localStorage.setItem('auth_user', JSON.stringify(mockUser));

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    // Attendre que le chargement soit terminé
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.token).toBe('aaa.bbb.ccc');
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('purge localStorage si le role est invalide', async () => {
    // User avec role non reconnu → doit être purgé
    const badUser = {
      id: '456',
      email: 'admin@example.com',
      role: 'superadmin',
      hasMemberAccess: true,
    };

    localStorage.setItem('auth_token', 'aaa.bbb.ccc');
    localStorage.setItem('auth_user', JSON.stringify(badUser));

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Données corrompues → session non hydratée + localStorage purgé
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('purge localStorage si hasMemberAccess est manquant', async () => {
    // User sans hasMemberAccess → doit être purgé
    const badUser = {
      id: '789',
      email: 'user@example.com',
      role: 'user',
      // hasMemberAccess absent intentionnellement
    };

    localStorage.setItem('auth_token', 'aaa.bbb.ccc');
    localStorage.setItem('auth_user', JSON.stringify(badUser));

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('hydrate correctement un admin valide (régression bootstrap)', async () => {
    // Cas cible : admin créé via /auth/verify bootstrap, JWT bien formé, champs complets
    const adminUser = {
      id: 'admin-1',
      email: 'admin@timepick.com',
      role: 'admin' as const,
      hasMemberAccess: true,
    };

    localStorage.setItem('auth_token', 'aaa.bbb.ccc');
    localStorage.setItem('auth_user', JSON.stringify(adminUser));

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(adminUser);
    expect(result.current.token).toBe('aaa.bbb.ccc');
  });

  it('gère les données localStorage invalides', async () => {
    // Mettre des données invalides dans localStorage
    localStorage.setItem('auth_token', 'some-token');
    localStorage.setItem('auth_user', 'invalid-json{');

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    // Attendre que le hook se stabilise
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Les données invalides doivent être nettoyées
    // Le token est aussi nettoyé car le user est invalide
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('lance une erreur si utilisé sans AuthProvider', () => {
    // Supprimer les avertissements console pour ce test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});
