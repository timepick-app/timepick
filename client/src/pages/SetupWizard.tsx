import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';
import { toast } from 'sonner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { SetupOrganizationStep, toSavedOrganization } from '@/components/setup/SetupOrganizationStep';
import type {
  SetupOrganizationDraft,
  SetupOrganizationSaved,
} from '@/components/setup/SetupOrganizationStep';
import { SetupSmtpStep } from '@/components/setup/SetupSmtpStep';
import { SetupEncryptionKeyStep } from '@/components/setup/SetupEncryptionKeyStep';
import { SetupStepper } from '@/components/setup/SetupStepper';
import type { SetupStepKey } from '@/components/setup/SetupStepper';
import { createFirstAdmin, getSetupOrganization } from '@/services/setup.service';
import { getSetupEncryptionKey } from '@/services/encryption-key.service';
import type { AxiosError } from 'axios';
import { EMAIL_RE } from '@/lib/email';

type SetupStep = SetupStepKey;

/**
 * SetupWizard - Page de configuration initiale (multi-étapes)
 * Étape 0 (conditionnelle) : clé de chiffrement générée (uniquement si source==='file')
 * Étape 1 : identité de l'organisation (nom, logo, description) — facultative
 * Étape 2 : configuration SMTP
 * Étape 3 : identité de l'admin (prénom, nom, email) — envoi du lien bootstrap.
 *           Les noms voyagent dans le JWT du lien : le compte n'est créé qu'au clic.
 * Étape 4 : confirmation d'envoi
 * Affichée uniquement lorsque needsSetup est true (aucun admin en base).
 *
 * Le wizard détient les champs de saisie des étapes qui en ont (admin,
 * organisation) : les étapes sont rendues en conditionnel, donc un état porté
 * par l'étape mourrait à chaque navigation — saisie perdue, et « Continuer »
 * réécrivant ensuite une photo périmée par-dessus une sauvegarde réussie.
 */
export function SetupWizard() {
  useDocumentTitle({ title: 'Installation' });
  const [step, setStep] = useState<SetupStep | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Champs déjà touchés : pilote l'AFFICHAGE des motifs. Le blocage du bouton,
  // lui, tient compte de toutes les erreurs dès le départ.
  const [adminTouched, setAdminTouched] = useState<{ firstName?: boolean; email?: boolean }>({});

  const {
    data: keyStatus,
    isLoading: isKeyStatusLoading,
    isError: isKeyStatusError,
    refetch: refetchKeyStatus,
  } = useQuery({
    queryKey: ['setup', 'encryption-key'],
    queryFn: getSetupEncryptionKey,
  });

  // Étape organisation : brouillon affiché + référence « dernier état
  // enregistré », tous deux portés par le wizard (cf. JSDoc). La référence sert
  // à n'écrire que ce qui a changé ; le logo n'y figure pas, il est persisté dès
  // son dépôt et « Continuer » n'y touche jamais.
  const [organization, setOrganization] = useState<SetupOrganizationDraft>({
    name: '',
    description: '',
    logo: '',
  });
  const [savedOrganization, setSavedOrganization] = useState<SetupOrganizationSaved | null>(null);

  const {
    data: organizationSettings,
    isLoading: isOrganizationLoading,
    isError: isOrganizationError,
    refetch: refetchOrganization,
  } = useQuery({
    queryKey: ['setup', 'organization'],
    queryFn: getSetupOrganization,
  });

  // Hydratation unique : `savedOrganization` fait office de verrou (non-null dès
  // la première arrivée des données), donc un refetch d'arrière-plan n'écrase
  // jamais une saisie en cours. Le verrou n'est posé qu'au SUCCÈS — d'où
  // `isOrganizationError` transmis à l'étape : sur échec de lecture la saisie
  // reste verrouillée, sinon une hydratation tardive (retry, refetch au focus)
  // écraserait ce que l'utilisateur a tapé entre-temps.
  // La référence passe par `toSavedOrganization`, la MÊME normalisation que le
  // payload envoyé : sans ça la comparaison « rien n'a changé » se désynchronise.
  useEffect(() => {
    if (!organizationSettings || savedOrganization) return;
    setOrganization({
      name: organizationSettings.name,
      description: organizationSettings.description,
      logo: organizationSettings.logo,
    });
    setSavedOrganization(toSavedOrganization(organizationSettings));
  }, [organizationSettings, savedOrganization]);

  const steps = keyStatus
    ? (keyStatus.source === 'file' ? (['key', 'organization', 'smtp', 'admin'] as const) : (['organization', 'smtp', 'admin'] as const))
    : null;
  // A1 : l'étape SMTP reste toujours visible dans `steps` (jamais retirée comme
  // `key` peut l'être) ; seul son caractère bloquant dépend du signal serveur.
  const smtpSkippable = keyStatus?.emailDeliverable === true;
  const smtpTransportSource = smtpSkippable ? (keyStatus?.emailTransportSource ?? null) : null;

  // Navigation arrière : un seul modèle pour tout le wizard. L'étape précédente
  // se lit dans `steps`, déjà source de vérité de l'ordre — `undefined` sur la
  // première étape, donc aucun bouton « Précédent » rendu là.
  const previousStep = steps && step ? (steps as readonly SetupStep[])[(steps as readonly SetupStep[]).indexOf(step) - 1] : undefined;
  const onBack = previousStep ? () => setStep(previousStep) : undefined;

  // Étape admin alignée sur la convention de l'application : bouton désactivé tant
  // que le formulaire n'est pas valide, motifs révélés au fil de la saisie (R12a).
  const firstNameIssue = firstName.trim() ? undefined : 'Le prénom est requis';
  const emailIssue = !email.trim()
    ? "L'email est requis"
    : EMAIL_RE.test(email.trim()) ? undefined : "Format d'email invalide";
  const adminGateReason = firstNameIssue ?? emailIssue ?? null;
  const firstNameError = adminTouched.firstName ? firstNameIssue : undefined;
  const emailError = adminTouched.email ? emailIssue : undefined;

  useEffect(() => {
    if (steps && step === null) {
      setStep(steps[0]);
    }
  }, [steps, step]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (adminGateReason) return;

    setIsLoading(true);

    try {
      await createFirstAdmin(email.trim(), firstName.trim(), lastName.trim() || undefined);
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
          {isKeyStatusLoading && (
            <div className="py-8 text-center">
              <Typography variant="body" color="muted">Chargement…</Typography>
            </div>
          )}

          {isKeyStatusError && (
            <div className="space-y-4 py-8 text-center">
              <Typography variant="body" color="muted">
                Impossible de vérifier la configuration de la clé de chiffrement.
              </Typography>
              <Button type="button" variant="outline" onClick={() => refetchKeyStatus()}>
                Réessayer
              </Button>
            </div>
          )}

          {steps && step && (
            <>
              <SetupStepper current={step} steps={[...steps]} smtpSkippable={smtpSkippable} smtpTransportSource={smtpTransportSource} />

              {step === 'key' && keyStatus && (
                <SetupEncryptionKeyStep
                  fingerprint={keyStatus.fingerprint}
                  onDone={() => setStep('organization')}
                />
              )}

              {step === 'organization' && (
                <SetupOrganizationStep
                  onDone={() => setStep('smtp')}
                  onBack={onBack}
                  draft={organization}
                  onDraftChange={(patch) => setOrganization((prev) => ({ ...prev, ...patch }))}
                  saved={savedOrganization}
                  onSaved={setSavedOrganization}
                  isLoading={isOrganizationLoading}
                  loadFailed={isOrganizationError}
                  onRetryLoad={() => void refetchOrganization()}
                />
              )}

              {step === 'smtp' && (
                <SetupSmtpStep
                  onDone={() => setStep('admin')}
                  onBack={onBack}
                  skippable={smtpSkippable}
                  onConfigChanged={refetchKeyStatus}
                />
              )}

              {step === 'admin' && (
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="admin-firstname">Prénom</Label>
                      <Input
                        id="admin-firstname"
                        autoComplete="given-name"
                        placeholder="Jean"
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          setAdminTouched((prev) => (prev.firstName ? prev : { ...prev, firstName: true }));
                        }}
                        required
                        maxLength={100}
                        disabled={isLoading}
                        aria-invalid={!!firstNameError}
                        aria-describedby={firstNameError ? 'admin-firstname-error' : undefined}
                      />
                      {firstNameError && (
                        <p id="admin-firstname-error" className="text-xs text-destructive" role="alert">{firstNameError}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-lastname">Nom (optionnel)</Label>
                      <Input
                        id="admin-lastname"
                        autoComplete="family-name"
                        placeholder="Dupont"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        maxLength={100}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-email">Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@exemple.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setAdminTouched((prev) => (prev.email ? prev : { ...prev, email: true }));
                      }}
                      required
                      disabled={isLoading}
                      aria-invalid={!!emailError}
                      aria-describedby={emailError ? 'admin-email-error' : undefined}
                    />
                    {emailError && (
                      <p id="admin-email-error" className="text-xs text-destructive" role="alert">{emailError}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {adminGateReason && (
                      <p
                        id="admin-gate-reason"
                        className="text-xs text-muted-foreground sm:text-right"
                        data-testid="admin-gate-reason"
                      >
                        {adminGateReason}
                      </p>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between max-sm:[&>button]:flex-1">
                      {onBack && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onBack}
                          disabled={isLoading}
                        >
                          Précédent
                        </Button>
                      )}
                      <Button
                        type="submit"
                        disabled={isLoading || adminGateReason !== null}
                        aria-describedby={adminGateReason ? 'admin-gate-reason' : undefined}
                      >
                        {isLoading ? 'Envoi en cours...' : 'Devenir administrateur'}
                      </Button>
                    </div>
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
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end max-sm:[&>button]:flex-1">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
