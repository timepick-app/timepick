import type { AxiosError } from 'axios'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { toast } from 'sonner'
import { getSetupSmtp, saveSetupSmtp, testSetupSmtp } from '@/services/setup.service'
import type { EmailProvider, EmailSettingsPayload, SmtpSettingsPayload } from '@/services/settings.service'
import { useEmailProvidersCatalog } from '@/hooks/useSmtpSettings'
import { SmtpFields, validateProviderCredentials } from '@/components/smtp/SmtpFields'
import type { SmtpFieldsValues } from '@/components/smtp/SmtpFields'
import { EMAIL_RE } from '@/lib/email'

const DEFAULT_PORT = 587
const SMTP_PROVIDER = 'smtp' as const

type FormValues = SmtpFieldsValues

interface Props {
  onDone: () => void
  /** A1 : true quand le serveur a détecté qu'il peut déjà délivrer des emails
   *  (`emailDeliverable`) — autorise « Continuer » sans hôte/port renseignés.
   *  L'étape reste toujours affichée et reste configurable. */
  skippable?: boolean
}

export function SetupSmtpStep({ onDone, skippable = false }: Props) {
  const [formValues, setFormValues] = useState<FormValues>({
    emailProvider: SMTP_PROVIDER,
    credentials: {},
    smtpHost: '',
    smtpPort: String(DEFAULT_PORT),
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    smtpFromName: '',
    smtpFromEmail: '',
  })
  const [recipient, setRecipient] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
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
        setRecipient(settings.smtpFromEmail || settings.smtpUser || '')
      })
      .catch((err) => {
        console.warn('[SetupSmtp] préremplissage indisponible', err)
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

  const updateField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setFormValues(prev => ({ ...prev, [field]: value }))
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleSmtpChange = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    updateField(field, value)
    if (field === 'smtpFromEmail' && typeof value === 'string') {
      if (!recipient || recipient === formValues.smtpUser) {
        setRecipient(value)
      }
    }
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (formValues.emailProvider === SMTP_PROVIDER) {
      if (!formValues.smtpHost.trim()) {
        errors.smtpHost = "L'hôte SMTP est requis"
      }
      const port = Number(formValues.smtpPort)
      if (!formValues.smtpPort || isNaN(port) || port < 1 || port > 65535) {
        errors.smtpPort = 'Le port doit être entre 1 et 65535'
      }
      // smtpFromEmail requis UNIQUEMENT quand un hôte est renseigné — même
      // règle conditionnelle que SmtpConfigPanel/le serveur
      // (checkSmtpFromEmailRequired, settings.validator.ts) et que le chemin
      // HTTP juste en dessous (validateProviderCredentials).
      if (formValues.smtpHost.trim() && !formValues.smtpFromEmail) {
        errors.smtpFromEmail = "L'email de l'expéditeur est requis lorsqu'un serveur SMTP est configuré"
      }
    } else {
      Object.assign(errors, validateProviderCredentials(formValues, catalog, storedProvider, storedCredentials))
    }
    if (formValues.smtpFromEmail && !EMAIL_RE.test(formValues.smtpFromEmail)) {
      errors.smtpFromEmail = "Format d'email invalide"
    }
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

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

  const handleTest = async () => {
    if (!validate()) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testSetupSmtp({ ...buildPayload(), recipient })
      setTestResult(result)
    } catch (err) {
      const data = (err as AxiosError<{ error?: { message?: string } | string }>).response?.data?.error
      setTestResult({ success: false, message: (typeof data === 'string' ? data : data?.message) ?? 'Erreur lors du test SMTP' })
    } finally {
      setIsTesting(false)
    }
  }

  const handleContinue = async () => {
    if (wantsToSkip) {
      setValidationErrors({})
      onDone()
      return
    }
    if (!validate()) return
    setIsSaving(true)
    try {
      await saveSetupSmtp(buildPayload())
      onDone()
    } catch (err) {
      const data = (err as AxiosError<{ error?: { message?: string } | string }>).response?.data?.error
      const message = typeof data === 'string' ? data : data?.message
      toast.error(message ?? "Erreur lors de l'enregistrement SMTP")
    } finally {
      setIsSaving(false)
    }
  }

  const isBusy = isLoadingSettings || isSaving || isTesting
  const isRecipientValid = EMAIL_RE.test(recipient)

  return (
    <div className="space-y-6">
      <SmtpFields
        values={formValues}
        onChange={handleSmtpChange}
        errors={validationErrors}
        disabled={isBusy}
        catalog={catalog}
        catalogLoading={isCatalogLoading}
        storedProvider={storedProvider}
        storedCredentials={storedCredentials}
      />

      {/* Test recipient */}
      <div className="space-y-2 pt-2 border-t">
        <Label htmlFor="smtp-recipient">Email de test</Label>
        <div className="flex gap-2">
          <Input
            id="smtp-recipient"
            type="email"
            placeholder="votre@email.com"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            disabled={isBusy}
            data-testid="smtp-recipient"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={isBusy || !isRecipientValid}
            data-testid="smtp-test-btn"
          >
            {isTesting ? 'Test en cours...' : 'Tester la connexion'}
          </Button>
        </div>
        {testResult && (
          <Banner
            variant={testResult.success ? 'success' : 'destructive'}
            role={testResult.success ? 'status' : 'alert'}
            data-testid="smtp-test-result"
          >
            <BannerDescription>{testResult.message}</BannerDescription>
          </Banner>
        )}
      </div>

      {/* Continue */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          type="button"
          onClick={handleContinue}
          disabled={isBusy}
          data-testid="smtp-continue-btn"
        >
          {isSaving ? 'Sauvegarde...' : wantsToSkip ? 'Passer cette étape' : 'Continuer'}
        </Button>
      </div>
    </div>
  )
}
