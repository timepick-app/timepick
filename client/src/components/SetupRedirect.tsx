import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useAuth } from '@/hooks/useAuth';

/**
 * Composant invisible qui redirige automatiquement vers /setup si nécessaire
 *
 * Ce composant vérifie si la configuration initiale est nécessaire (needsSetup = true)
 * et redirige l'utilisateur vers la page /setup dans ce cas.
 *
 * Doit être placé au niveau racine de l'application pour s'exécuter à chaque changement d'état.
 *
 * NOTE: Ce composant ne gère que la redirection /setup. La redirection des admin
 * connectés est gérée au niveau des routes protégées par AuthProvider.
 */
export function SetupRedirect() {
  const { data: setupStatus, isLoading } = useSetupStatus();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Ne rien faire pendant le chargement initial
    if (isLoading) {
      return;
    }

    // Un utilisateur authentifié ne doit JAMAIS être renvoyé vers /setup
    // (un admin existe forcément) : le flux login légitime n'est jamais
    // redirigé vers /setup.
    if (user) return;

    const currentPath = location.pathname;

    // Si la configuration est nécessaire, rediriger vers /setup depuis n'importe quelle page
    // (sauf /setup lui-même, les URLs publiques /events/, et /design-system en dev).
    if (setupStatus?.needsSetup && currentPath !== '/setup' && !currentPath.startsWith('/events/') && !currentPath.startsWith('/design-system')) {
      navigate('/setup', { replace: true });
    }
  }, [setupStatus, isLoading, navigate, location.pathname, user]);

  // Ce composant n'affiche rien
  return null;
}
