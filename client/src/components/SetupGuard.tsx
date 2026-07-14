import { type ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useAuth } from '@/hooks/useAuth';
import { Typography } from '@/components/ui/typography';

interface SetupGuardProps {
  children: ReactNode;
}

/**
 * Guard pour la page de configuration initiale (/setup)
 *
 * Comportement:
 * - Si needsSetup est true et pas d'utilisateur connecté → affiche le SetupWizard
 * - Si needsSetup est false → redirige vers /auth/login
 *
 * Note: La redirection des admins connectés est gérée globalement par SetupRedirect
 */
export function SetupGuard({ children }: SetupGuardProps) {
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Ne rien faire pendant le chargement
    if (setupLoading) {
      return;
    }

    // Un utilisateur authentifié n'a rien à faire sur /setup → vers son dashboard.
    // Corrige la page blanche de la course bootstrap (needsSetup encore true en cache
    // mais l'admin vient d'être créé et est déjà connecté).
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : '/me', { replace: true });
      return;
    }

    // Si la configuration est déjà faite, rediriger vers la page de connexion
    if (setupStatus && !setupStatus.needsSetup) {
      navigate('/login', { replace: true });
      return;
    }
  }, [setupStatus, setupLoading, user, navigate]);

  // Écran de chargement : utilisé pendant le fetch ET en fallback (redirection imminente).
  const loadingScreen = (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
        <Typography color="muted" className="mt-4">Chargement...</Typography>
      </div>
    </div>
  );

  // Afficher un indicateur de chargement pendant la vérification
  if (setupLoading) {
    return loadingScreen;
  }

  // Si needsSetup est true et pas d'utilisateur connecté, afficher le SetupWizard
  if (setupStatus?.needsSetup && !user) {
    return <>{children}</>;
  }

  // Fallback — une redirection est imminente (useEffect en cours) : afficher le spinner,
  // jamais un écran vide.
  return loadingScreen;
}
