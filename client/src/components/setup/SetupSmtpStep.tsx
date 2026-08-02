import type { AxiosError } from 'axios'
import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { toast } from 'sonner'
import { getSetupSmtp, saveSetupSmtp, testSetupSmtp, clearSetupSmtp } from '@/services/setup.service'
import type { EmailProvider, EmailSettingsPayload, SmtpSettingsPayload } from '@/services/settings.service'
import { useEmailProvidersCatalog } from '@/hooks/useSmtpSettings'
import { SmtpFields, validateProviderCredentials } from '@/components/smtp/SmtpFields'
import type { SmtpFieldsValues } from '@/components/smtp/SmtpFields'
import { EMAIL_RE } from '@/lib/email'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { visibleFieldErrors } from '@/lib/formErrors'

const DEFAULT_PORT = 587
const SMTP_PROVIDER = 'smtp' as const

type FormValues = SmtpFieldsValues

const EMPTY_VALUES: FormValues = {
  emailProvider: SMTP_PROVIDER,
  credentials: {},
  smtpHost: '',
  smtpPort: String(DEFAULT_PORT),
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: '',
  smtpFromEmail: '',
}

interface Props {
  onDone: () => void
  /** Étape précédente, quand il en existe une (calculé par SetupWizard depuis
   *  la liste des étapes). Absent sur la première étape du flux. */
  onBack?: () => void
  /** A1 : true quand le serveur a détecté qu'il peut déjà délivrer des emails
   *  (`emailDeliverable`) — autorise « Continuer » sans hôte/port renseignés.
   *  L'étape reste toujours affichée et reste configurable. */
  skippable?: boolean
  /** Rejoue la sonde de délivrabilité serveur après toute écriture de la
   *  configuration. Sans ça, `skippable` reste figé sur la valeur lue au
   *  montage du wizard et l'effacement ne rouvre jamais le saut d'étape. */
  onConfigChanged?: () => void | Promise<unknown>
}

export function SetupSmtpStep({ onDone, onBack, skippable = false, onConfigChanged }: Props) {
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_VALUES)
  const [recipient, setRecipient] = useState('')
  // Le destinataire du test suit l'expéditeur tant que l'utilisateur ne l'a pas édité lui-même.
  const [recipientEdited, setRecipientEdited] = useState(false)
  // Champs déjà touchés : pilote l'affichage des motifs par champ, pas le blocage (R12a).
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  // La preuve expire quand un champ bouge : elle est liée à la signature des valeurs testées.
  const [test, setTest] = useState<{ outcome: 'success' | 'failed' | 'throttled'; message: string; signature: string } | null>(null)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  // Préremplissage en échec : un formulaire vide sans le dire masque aussi la sortie de secours (R7).
  const [loadFailed, setLoadFailed] = useState(false)
  // Une configuration existe-t-elle en base ? Pilote la sortie de secours :
  // un hôte enregistré masque le repli local dans buildTransport(), donc
  // `skippable` tombe à false et vider le champ ne suffit pas à s'en sortir.
  const [hasStoredConfig, setHasStoredConfig] = useState(false)
  // Provider/credentials stockés côté serveur au chargement — pilote la
  // sentinelle scopée au provider (contrat §4.2, amendement revue delta 1).
  const [storedProvider, setStoredProvider] = useState<EmailProvider | undefined>(undefined)
  const [storedCredentials, setStoredCredentials] = useState<Record<string, string> | undefined>(undefined)

  const { data: catalog = [], isLoading: isCatalogLoading } = useEmailProvidersCatalog('setup')

  useEffect(() => {
    let cancelled = false
    getSetupSmtp()
      .then((settings) => {
        if (cancelled) return
        setFormValues({
          emailProvider: settings.emailProvider || SMTP_PROVIDER,
          credentials: settings.credentials ?? {},
          smtpHost: settings.smtpHost || '',
          smtpPort: settings.smtpPort || String(DEFAULT_PORT),
          smtpSecure: settings.smtpSecure ?? false,
          smtpUser: settings.smtpUser || '',
          smtpPassword: settings.smtpPassword || '',
          smtpFromName: settings.smtpFromName || '',
          smtpFromEmail: settings.smtpFromEmail || '',
        })
        setStoredProvider(settings.emailProvider || SMTP_PROVIDER)
        setStoredCredentials(settings.credentials ?? {})
        setHasStoredConfig(!!settings.smtpHost || (settings.emailProvider ?? SMTP_PROVIDER) !== SMTP_PROVIDER)
        setRecipient(settings.smtpFromEmail || settings.smtpUser || '')
      })
      .catch((err) => {
        console.warn('[SetupSmtp] préremplissage indisponible', err)
        if (!cancelled) setLoadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSettings(false)
      })
    return () => { cancelled = true }
  }, [])

  // A1 : SMTP sautable-mais-visible — tant qu'aucun hôte n'a été saisi, que le
  // provider est resté 'smtp' et que le serveur autorise le saut (`skippable`),
  // « Continuer » n'exige rien et n'enregistre rien. Dès qu'un hôte est
  // renseigné (ou qu'un fournisseur HTTP est choisi), la validation classique
  // reprend la main : l'utilisateur peut toujours choisir de configurer un
  // vrai fournisseur d'email à cette étape.
  const wantsToSkip = skippable && formValues.emailProvider === SMTP_PROVIDER && !formValues.smtpHost.trim()

  const buildSmtpPayload = (): SmtpSettingsPayload => ({
    smtpHost: formValues.smtpHost.trim(),
    smtpPort: Number(formValues.smtpPort),
    smtpSecure: formValues.smtpSecure,
    smtpUser: formValues.smtpUser || undefined,
    smtpPassword: formValues.smtpPassword || undefined,
    smtpFromName: formValues.smtpFromName || undefined,
    smtpFromEmail: formValues.smtpFromEmail || undefined,
  })

  const buildProviderPayload = (): EmailSettingsPayload => ({
    provider: formValues.emailProvider,
    credentials: formValues.credentials,
    smtpFromName: formValues.smtpFromName || undefined,
    smtpFromEmail: formValues.smtpFromEmail || undefined,
  })

  const buildPayload = (): EmailSettingsPayload =>
    formValues.emailProvider === SMTP_PROVIDER ? buildSmtpPayload() : buildProviderPayload()

  // Erreurs dérivées des valeurs courantes (plus de calcul au clic) : c'est ce
  // qui permet de désactiver « Continuer » au lieu de le laisser cliquer pour
  // rien, comme le fait le reste de l'application (SmtpConfigPanel, réglages,
  // profil…). Rien à valider quand l'étape est sautée : un formulaire vide et
  // sautable est un état valide, pas un formulaire incomplet.
  const errors = useMemo<Record<string, string>>(() => {
    if (wantsToSkip) return {}
    const next: Record<string, string> = {}
    if (formValues.emailProvider === SMTP_PROVIDER) {
      if (!formValues.smtpHost.trim()) {
        next.smtpHost = "L'hôte SMTP est requis"
      }
      const port = Number(formValues.smtpPort)
      if (!formValues.smtpPort || isNaN(port) || port < 1 || port > 65535) {
        next.smtpPort = 'Le port doit être entre 1 et 65535'
      }
      // smtpFromEmail requis UNIQUEMENT quand un hôte est renseigné — même
      // règle conditionnelle que SmtpConfigPanel/le serveur
      // (checkSmtpFromEmailRequired, settings.validator.ts) et que le chemin
      // HTTP juste en dessous (validateProviderCredentials).
      if (formValues.smtpHost.trim() && !formValues.smtpFromEmail) {
        next.smtpFromEmail = "L'email de l'expéditeur est requis lorsqu'un serveur SMTP est configuré"
      }
    } else {
      Object.assign(next, validateProviderCredentials(formValues, catalog, storedProvider, storedCredentials))
    }
    if (formValues.smtpFromEmail && !EMAIL_RE.test(formValues.smtpFromEmail)) {
      next.smtpFromEmail = "Format d'email invalide"
    }
    return next
  }, [wantsToSkip, formValues, catalog, storedProvider, storedCredentials])

  // 8 champs au plus : stringify à chaque rendu coûte moins qu'un useMemo dont les deps mentiraient.
  const signature = JSON.stringify(buildPayload())
  // Le test ne prouve que les valeurs qu'il a effectivement essayées.
  const isTestCurrent = test !== null && test.signature === signature
  const isReachabilityProven = isTestCurrent && test.outcome === 'success'

  const firstError = Object.values(errors)[0]

  const isRecipientValid = EMAIL_RE.test(recipient)

  /** Motif de blocage du test. `isBusy` exclu : indisponibilité opérationnelle (R10 bis). */
  const testGateReason: string | null =
    firstError ?? (isRecipientValid ? null : "Indiquez l'adresse qui doit recevoir l'email de test.")

  /** Motif de blocage de « Continuer », null quand l'étape peut être franchie (R11). */
  const gateReason: string | null = (() => {
    if (firstError) return firstError
    if (wantsToSkip || isReachabilityProven) return null
    if (!isTestCurrent) return 'Testez la connexion pour continuer.'
    if (test.outcome === 'throttled') return "Trop de tests d'envoi. Patientez une minute, puis retestez."
    return 'La connexion a échoué. Corrigez les paramètres puis retestez.'
  })()

  const handleSmtpChange = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setFormValues(prev => ({ ...prev, [field]: value }))
    setTouched(prev => (prev[field] ? prev : { ...prev, [field]: true }))
    if (field === 'smtpFromEmail' && typeof value === 'string' && !recipientEdited) {
      setRecipient(value)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTest(null)
    // Fige la signature AVANT l'appel : si l'utilisateur modifie un champ
    // pendant le test, la preuve ne doit pas se rattacher aux nouvelles valeurs.
    const testedSignature = signature
    try {
      const result = await testSetupSmtp({ ...buildPayload(), recipient })
      setTest({ outcome: result.success ? 'success' : 'failed', message: result.message, signature: testedSignature })
    } catch (err) {
      // Un 429 n'est pas un échec de connexion : le distinguer évite d'envoyer
      // l'utilisateur corriger une configuration qui n'a jamais été essayée.
      const status = (err as AxiosError).response?.status
      setTest({
        outcome: status === 429 ? 'throttled' : 'failed',
        message: userFacingErrorMessage(
          err,
          "Le test de connexion SMTP a échoué. Aucun email de test n'a été envoyé, corrigez les paramètres puis réessayez.",
        ),
        signature: testedSignature,
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleContinue = async () => {
    if (gateReason) return
    if (wantsToSkip) {
      onDone()
      return
    }
    setIsSaving(true)
    try {
      await saveSetupSmtp(buildPayload())
      // Sans await : l'étape suivante s'affiche tout de suite, la sonde se
      // rafraîchit en fond pour le cas d'un retour par « Précédent ».
      void onConfigChanged?.()
      onDone()
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "L'enregistrement de la configuration SMTP a échoué. Vos paramètres sont toujours dans le formulaire, réessayez.",
        ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  /** Sortie de secours : une config injoignable en base masque le repli local, et vider le champ ne suffit pas. */
  const handleClear = async () => {
    setIsClearing(true)
    try {
      await clearSetupSmtp()
      setFormValues(EMPTY_VALUES)
      setRecipient('')
      setRecipientEdited(false)
      setTouched({})
      setTest(null)
      setStoredProvider(SMTP_PROVIDER)
      setStoredCredentials({})
      setHasStoredConfig(false)
      // Avec await : « Passer cette étape » ne doit apparaître qu'une fois la
      // nouvelle sonde revenue, sinon le bouton change d'état deux fois.
      await onConfigChanged?.()
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "L'effacement de la configuration a échoué. Rien n'a été supprimé, réessayez.",
        ),
      )
    } finally {
      setIsClearing(false)
    }
  }

  const isBusy = isLoadingSettings || isSaving || isTesting || isClearing

  const visibleErrors = useMemo(() => visibleFieldErrors(errors, touched), [errors, touched])

  return (
    <div className="space-y-6">
      {loadFailed && (
        <Banner variant="destructive" data-testid="smtp-load-failed">
          <BannerDescription>
            La configuration enregistrée n&apos;a pas pu être chargée — rechargez la page.
          </BannerDescription>
        </Banner>
      )}
      <SmtpFields
        values={formValues}
        onChange={handleSmtpChange}
        errors={visibleErrors}
        disabled={isBusy}
        catalog={catalog}
        catalogLoading={isCatalogLoading}
        storedProvider={storedProvider}
        storedCredentials={storedCredentials}
      />

      {/* Test recipient */}
      <div className="space-y-2 pt-2 border-t">
        <Label htmlFor="smtp-recipient">Email de test</Label>
        {/* R11 : le motif précède le contrôle qu'il justifie, et lui est rattaché.
            Ce bouton est secondaire, la règle ne fait pas d'exception pour autant. */}
        {testGateReason && (
          <p id="smtp-test-reason" className="text-xs text-muted-foreground" data-testid="smtp-recipient-hint">
            {testGateReason}
          </p>
        )}
        <div className="flex gap-2">
          <Input
            id="smtp-recipient"
            type="email"
            placeholder="votre@email.com"
            value={recipient}
            onChange={e => { setRecipient(e.target.value); setRecipientEdited(true) }}
            disabled={isBusy}
            data-testid="smtp-recipient"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={isBusy || testGateReason !== null}
            aria-describedby={testGateReason ? 'smtp-test-reason' : undefined}
            data-testid="smtp-test-btn"
          >
            {isTesting ? 'Test en cours...' : 'Tester la connexion'}
          </Button>
        </div>
        {isTestCurrent && (
          <Banner
            variant={test.outcome === 'success' ? 'success' : 'destructive'}
            role={test.outcome === 'success' ? 'status' : 'alert'}
            data-testid="smtp-test-result"
          >
            <BannerDescription>{test.message}</BannerDescription>
          </Banner>
        )}
      </div>

      {/* Navigation */}
      <div className="space-y-2 pt-4 border-t">
        {gateReason && (
          <p
            id="smtp-continue-reason"
            className="text-xs text-muted-foreground sm:text-right"
            data-testid="smtp-continue-reason"
          >
            {gateReason}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between max-sm:[&>*]:flex-1">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center max-sm:[&>button]:flex-1">
            {onBack && (
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                disabled={isBusy}
                data-testid="smtp-back-btn"
              >
                Précédent
              </Button>
            )}
            {hasStoredConfig && (
              <Button
                type="button"
                variant="outline"
                onClick={handleClear}
                disabled={isBusy}
                data-testid="smtp-clear-btn"
              >
                {isClearing ? 'Effacement...' : 'Effacer la configuration enregistrée'}
              </Button>
            )}
          </div>
          <Button
            type="button"
            onClick={handleContinue}
            disabled={isBusy || gateReason !== null}
            aria-describedby={gateReason ? 'smtp-continue-reason' : undefined}
            data-testid="smtp-continue-btn"
          >
            {isSaving ? 'Sauvegarde...' : wantsToSkip ? 'Passer cette étape' : 'Continuer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
