import { Link } from 'react-router-dom'
import { AlertCircle, Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Banner, BannerTitle, BannerDescription } from '@/components/ui/banner'
import { AuthShell, AuthBrand } from './AuthShell'

interface EmailLoginFormProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  email: string;
  smtpDegraded: boolean;
  isAdminContext: boolean;
  reason: string | null;
  onEmailChange: (email: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function EmailLoginForm({
  status,
  error,
  email,
  smtpDegraded,
  isAdminContext,
  reason,
  onEmailChange,
  onSubmit,
}: EmailLoginFormProps) {
  if (status === 'success') {
    return (
      <AuthShell>
        <Card data-testid="login-success" role="status" aria-live="polite">
          <CardHeader>
            <AuthBrand />
            <Typography variant="h3" as="h2" className="tracking-tight">Email envoyé !</Typography>
            <CardDescription>Vérifiez votre boîte de réception (et vos spams).</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Typography variant="body-xs" color="muted">
              Vous êtes administrateur ?{' '}
              <Link to="/emergency-login" className="underline underline-offset-4 hover:text-foreground">
                Utiliser un code de secours →
              </Link>
            </Typography>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  // Default: show email form
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <AuthBrand />
          <Typography variant="h3" as="h2" className="tracking-tight">Connexion à votre espace</Typography>
          <CardDescription>Entrez votre email pour recevoir un lien de connexion.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Message contextuel selon la raison */}
          {reason === 'session_expired' && (
            <Banner variant="warning" role="status">
              <Clock className="h-4 w-4" />
              <BannerTitle>Session expirée</BannerTitle>
              <BannerDescription>Votre session a expiré. Veuillez vous reconnecter pour continuer.</BannerDescription>
            </Banner>
          )}

          {/* SMTP degraded banner — shown when /health reports smtp:degraded */}
          {smtpDegraded && (
            <Banner variant="warning" role="alert" data-testid="smtp-degraded-banner">
              <AlertTriangle className="h-4 w-4" />
              <BannerDescription className="flex flex-col gap-1">
                <span>Service email dégradé. La réception des liens de connexion peut être perturbée.</span>
                <span className="text-xs">
                  Vous êtes administrateur ?{' '}
                  <Link to="/emergency-login" className="underline hover:text-amber-900">
                    Accès de secours →
                  </Link>
                </span>
              </BannerDescription>
            </Banner>
          )}

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="login-email">Adresse Email</Label>
              <Input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="votre@email.com"
              />
            </div>

            {status === 'error' && (
              <Banner variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <BannerDescription>
                  {error || 'Une erreur est survenue. Vérifiez votre email et réessayez.'}
                </BannerDescription>
              </Banner>
            )}

            <Button type="submit" className="w-full" disabled={status === 'loading'}>
              {status === 'loading' ? 'Envoi...' : 'Recevoir mon lien de connexion'}
            </Button>
          </form>

          <Typography variant="body-xs" color="muted">
            Vous ne recevez pas l'email ? Vérifiez vos spams ou contactez votre administrateur.
          </Typography>
        </CardContent>

        {isAdminContext && (
          <CardFooter>
            <Typography variant="body-xs" color="muted">
              Administrateur en panne d'email ?{' '}
              <Link to="/emergency-login" className="underline underline-offset-4 hover:text-foreground">
                Utiliser un code de secours →
              </Link>
            </Typography>
          </CardFooter>
        )}
      </Card>
    </AuthShell>
  );
}
