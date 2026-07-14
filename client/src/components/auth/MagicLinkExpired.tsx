import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Mail } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Banner, BannerTitle, BannerDescription } from '@/components/ui/banner'
import { AuthShell, AuthBrand } from './AuthShell'

function formatExpirationDate(dateString: string): string {
  try {
    return format(new Date(dateString), "d MMMM yyyy 'à' HH'h'mm", { locale: fr })
  } catch {
    return dateString
  }
}

interface MagicLinkExpiredProps {
  variant?: 'expired' | 'setup-already-done';
  expiredContext: {
    eventName?: string;
    eventId?: string;
    expiredAt?: string;
    canResend: boolean;
    isAdmin?: boolean;
  } | null;
  resendStatus: 'idle' | 'sending' | 'sent' | 'rate_limited' | 'error';
  resendError: string | null;
  showEmergencyLink: boolean;
  onResend: () => void;
  onBackToLogin: () => void;
}

export function MagicLinkExpired({
  variant = 'expired',
  expiredContext,
  resendStatus,
  resendError,
  showEmergencyLink,
  onResend,
  onBackToLogin,
}: MagicLinkExpiredProps) {
  const isSetupDone = variant === 'setup-already-done';
  const title = isSetupDone ? 'Configuration déjà effectuée' : 'Lien expiré';
  const headerDescription = isSetupDone
    ? "Ce lien d'installation a déjà servi à créer le compte administrateur. Recevez un lien de connexion pour accéder au tableau de bord."
    : expiredContext?.canResend
      ? 'Pour votre sécurité, les liens de connexion expirent après un délai. Demandez-en un nouveau ci-dessous.'
      : 'Pour votre sécurité, les liens de connexion expirent après un délai. Retournez à la page de connexion pour en recevoir un nouveau.';
  const idleButtonLabel = isSetupDone ? 'Recevoir un lien de connexion' : 'Demander un nouveau lien';
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <AuthBrand />
          <Typography variant="h3" as="h2" className="tracking-tight">{title}</Typography>
          <CardDescription>{headerDescription}</CardDescription>
        </CardHeader>

        {(expiredContext?.eventName || expiredContext?.canResend) && (
          <CardContent className="space-y-4">
            {expiredContext?.eventName && (
              <div className="space-y-0.5">
                <Typography variant="body-xs" color="muted">Événement</Typography>
                <Typography variant="body-sm" weight="medium">{expiredContext.eventName}</Typography>
                {expiredContext.expiredAt && (
                  <Typography variant="body-xs" color="muted">
                    Expirait le {formatExpirationDate(expiredContext.expiredAt)}
                  </Typography>
                )}
              </div>
            )}

            {expiredContext?.canResend && (
              resendStatus === 'sent' ? (
                <Banner variant="success" role="status" aria-live="polite">
                  <CheckCircle2 className="h-4 w-4" />
                  <BannerTitle>Un nouveau lien vous a été envoyé par email</BannerTitle>
                  <BannerDescription>Vérifiez votre boîte de réception (et vos spams).</BannerDescription>
                </Banner>
              ) : resendStatus === 'rate_limited' ? (
                <Banner variant="warning" role="status" aria-live="polite">
                  <Clock className="h-4 w-4" />
                  <BannerTitle>Un lien a déjà été envoyé récemment</BannerTitle>
                  <BannerDescription>Veuillez patienter une minute avant de demander un nouveau lien.</BannerDescription>
                </Banner>
              ) : resendStatus === 'error' ? (
                <>
                  <Banner variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <BannerDescription>{resendError}</BannerDescription>
                  </Banner>
                  <Button onClick={onResend} className="w-full">
                    <Mail />
                    Réessayer
                  </Button>
                  {showEmergencyLink && (
                    <Typography variant="body-xs" color="muted">
                      <Link to="/emergency-login" className="underline hover:text-foreground">Utiliser un code de secours →</Link>
                    </Typography>
                  )}
                </>
              ) : (
                <>
                  <Button onClick={onResend} disabled={resendStatus === 'sending'} className="w-full">
                    {resendStatus === 'sending' ? (
                      <>
                        <Mail className="animate-pulse" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Mail />
                        {idleButtonLabel}
                      </>
                    )}
                  </Button>
                  {resendStatus === 'idle' && (
                    <Typography variant="body-xs" color="muted">Le lien sera envoyé à votre adresse email.</Typography>
                  )}
                </>
              )
            )}
          </CardContent>
        )}

        {!expiredContext?.canResend && (
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={onBackToLogin}>
              <ArrowLeft />
              Retour à la connexion
            </Button>
          </CardFooter>
        )}
      </Card>
    </AuthShell>
  );
}
