import { AuthShell } from './AuthShell';
import { Typography } from '@/components/ui/typography';

export function MagicLinkLoading() {
  return (
    <AuthShell>
      <div className="text-center" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <Typography variant="body" color="muted">Connexion en cours...</Typography>
      </div>
    </AuthShell>
  );
}
