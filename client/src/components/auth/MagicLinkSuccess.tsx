import { CheckCircle2 } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Typography } from '@/components/ui/typography';

export function MagicLinkSuccess() {
  return (
    <AuthShell>
      <div className="text-center" role="status">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-green-600" />
        <Typography variant="body" color="muted">Connexion réussie ! Redirection...</Typography>
      </div>
    </AuthShell>
  );
}
