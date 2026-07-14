import { useState } from 'react';
import type { FormEvent } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';
import { toast } from 'sonner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { SetupSmtpStep } from '@/components/setup/SetupSmtpStep';
import { SetupStepper } from '@/components/setup/SetupStepper';
import { createFirstAdmin } from '@/services/setup.service';
import type { AxiosError } from 'axios';
import { EMAIL_RE } from '@/lib/email';

type SetupStep = 'smtp' | 'admin' | 'sent';

/**
 * SetupWizard - Page de configuration initiale (multi-étapes)
 * Étape 1 : configuration SMTP
 * Étape 2 : saisie de l'email admin (envoi du lien bootstrap)
 * Étape 3 : confirmation d'envoi
 * Affichée uniquement lorsque needsSetup est true (aucun admin en base).
 */
export function SetupWizard() {
  useDocumentTitle({ title: 'Installation' });
  const [step, setStep] = useState<SetupStep>('smtp');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim()) {
      setFieldError("L'email est requis");
      return;
    }

    if (!EMAIL_RE.test(email.trim())) {
      setFieldError("Format d'email invalide");
      return;
    }

    setFieldError('');
    setIsLoading(true);

    try {
      await createFirstAdmin(email.trim());
      // needsSetup reste true côté serveur jusqu'à ce que le lien soit cliqué —
      // on NE met PAS à jour le cache ici.
      setStep('sent');
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ error?: { message?: string } | string }>;
      const raw = axiosErr.response?.data?.error;
      const errorMessage =
        typeof raw === 'object' && raw !== null
          ? raw.message ?? "Impossible d'envoyer le lien"
          : typeof raw === 'string'
            ? raw
            : "Impossible d'envoyer le lien. Vérifiez la configuration SMTP et réessayez.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <Typography variant="h1">Bienvenue sur TimePick&nbsp;!</Typography>
          <Typography variant="body" color="muted">
            Configurons votre installation
          </Typography>
        </CardHeader>
        <CardContent>
          <SetupStepper current={step} />

          {step === 'smtp' && (
            <SetupSmtpStep onDone={() => setStep('admin')} />
          )}

          {step === 'admin' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@exemple.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldError('');
                  }}
                  required
                  disabled={isLoading}
                  aria-invalid={!!fieldError}
                />
                {fieldError && (
                  <p className="text-sm text-red-600 mt-1" role="alert">{fieldError}</p>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between max-sm:[&>button]:flex-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('smtp')}
                  disabled={isLoading}
                >
                  Précédent
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Envoi en cours...' : 'Devenir administrateur'}
                </Button>
              </div>
            </form>
          )}

          {step === 'sent' && (
            <div className="space-y-4 text-center">
              <Typography variant="body">
                Un lien d'activation a été envoyé à{' '}
                <strong className="font-semibold">{email}</strong>.<br />
                En cliquant ce lien depuis votre boîte mail, votre compte administrateur sera activé et vous accéderez directement à l'interface.
              </Typography>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center max-sm:[&>button]:flex-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('smtp')}
                >
                  Modifier la configuration SMTP
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('admin')}
                >
                  Renvoyer / changer d&apos;email
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
