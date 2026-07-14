import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Banner, BannerDescription } from '@/components/ui/banner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useSmtpSettings,
  useSaveSmtpSettings,
  useTestSmtpConnection,
  useClearSmtpSettings,
  useAdminHealth,
} from '@/hooks/useSmtpSettings'
import type { SmtpSettingsPayload } from '@/services/settings.service'
import { SmtpFields } from '@/components/smtp/SmtpFields'
import type { SmtpFieldsValues } from '@/components/smtp/SmtpFields'
import { EMAIL_RE } from '@/lib/email'

/** Sentinel value returned by the API when a password exists */
const DEFAULT_PORT = 587

type FormValues = SmtpFieldsValues

const initialFormValues: FormValues = {
  smtpHost: '',
  smtpPort: String(DEFAULT_PORT),
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: '',
  smtpFromEmail: '',
}

/**
 * Validate SMTP form values.
 * Returns an object with field names as keys and error messages as values.
 * Empty object means no errors.
 */
const validateSmtpForm = (values: FormValues): Record<string, string> => {
  const errors: Record<string, string> = {}

  // smtpHost is optional — blank = disable SMTP (triggers DELETE via handleSave)
  // Only validate port/fromEmail format when host is set
  const port = Number(values.smtpPort)
  if (values.smtpHost && (!values.smtpPort || isNaN(port) || port < 1 || port > 65535)) {
    errors.smtpPort = 'Le port doit être entre 1 et 65535'
  }

  if (values.smtpFromEmail && !EMAIL_RE.test(values.smtpFromEmail)) {
    errors.smtpFromEmail = "Format d'email invalide"
  }

  return errors
}

/**
 * SMTP status badge — 4 states:
 *   no host            → "Non configuré"
 *   host + loading     → "Vérification…"
 *   host + healthy     → "Opérationnel"
 *   host + unhealthy   → "Non joignable"
 *   host + UI timeout  → "Statut inconnu"
 */
interface SmtpStatusBadgeProps {
  smtpHost: string | undefined
  healthy: boolean | null | undefined
  healthLoading: boolean
  smtpTimeout: boolean
}

const SmtpStatusBadge = ({ smtpHost, healthy, healthLoading, smtpTimeout }: SmtpStatusBadgeProps) => {
  if (!smtpHost) return <Badge variant="default">Non configuré</Badge>
  if (smtpTimeout) return <Badge variant="default">Statut inconnu</Badge>
  if (healthLoading) return <Badge variant="default">Vérification…</Badge>
  if (healthy === true) return <Badge variant="success">Opérationnel</Badge>
  if (healthy === false) return <Badge variant="destructive">Non joignable</Badge>
  return <Badge variant="default">Chargement…</Badge>
}

interface SmtpConfigPanelProps {
  className?: string
}

/**
 * SmtpConfigPanel — Admin panel for configuring SMTP email settings.
 *
 * Follows the PollingConfigPanel pattern:
 * - Local state for form values synced from API via useEffect
 * - Local validation before save
 * - React Query hooks for server state
 * - Toast notifications via Sonner
 *
 * @example
 * <SmtpConfigPanel />
 */
export const SmtpConfigPanel = ({ className }: SmtpConfigPanelProps) => {
  const { data: settings, isLoading, error } = useSmtpSettings()
  const { mutate: saveSettings, isPending: isSaving } = useSaveSmtpSettings()
  const { mutate: testConnection, isPending: isTesting } = useTestSmtpConnection()
  const { mutate: clearSettings, isPending: isClearing, error: clearError } = useClearSmtpSettings()
  const { data: healthData, isLoading: isHealthLoading, refetch: refetchHealth } = useAdminHealth()

  const [formValues, setFormValues] = useState<FormValues>(initialFormValues)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [smtpTimeout, setSmtpTimeout] = useState(false)
  const [syncedSettings, setSyncedSettings] = useState<typeof settings>(undefined)

  const smtpHost = settings?.smtpHost
  const smtpHealthy = healthData?.services?.smtp?.healthy ?? null

  // Resync hors-effet : aligne le formulaire sur les réglages fetchés dès que
  // leur référence change (montage + après mutation), sans re-rendu en cascade.
  if (settings && settings !== syncedSettings) {
    setSyncedSettings(settings)
    setFormValues({
      smtpHost: settings.smtpHost || '',
      smtpPort: settings.smtpPort || String(DEFAULT_PORT),
      smtpSecure: settings.smtpSecure ?? false,
      smtpUser: settings.smtpUser || '',
      smtpPassword: settings.smtpPassword || '',
      smtpFromName: settings.smtpFromName || '',
      smtpFromEmail: settings.smtpFromEmail || '',
    })
  }

  // Drapeau « >15s » remis à zéro hors-effet dès que la vérification n'est plus
  // en cours, pour repartir proprement au prochain cycle de chargement.
  if (smtpTimeout && !(isHealthLoading && smtpHost)) {
    setSmtpTimeout(false)
  }

  // 15s UI timeout for "Vérification…" state — after that, show "Statut inconnu"
  useEffect(() => {
    if (isHealthLoading && smtpHost) {
      const timer = setTimeout(() => setSmtpTimeout(true), 15_000)
      return () => clearTimeout(timer)
    }
  }, [isHealthLoading, smtpHost])

  // Local validation
  const validate = useCallback(() => {
    const errors = validateSmtpForm(formValues)
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }, [formValues])

  // Build payload from form values (converts port string → number)
  const buildPayload = useCallback((): SmtpSettingsPayload => ({
    smtpHost: formValues.smtpHost.trim(),
    smtpPort: Number(formValues.smtpPort),
    smtpSecure: formValues.smtpSecure,
    smtpUser: formValues.smtpUser || undefined,
    smtpPassword: formValues.smtpPassword || undefined,
    smtpFromName: formValues.smtpFromName || undefined,
    smtpFromEmail: formValues.smtpFromEmail || undefined,
  }), [formValues])

  // Save handler — empty host triggers DELETE (clear config), else PUT
  const handleSave = () => {
    if (!validate()) return

    if (!formValues.smtpHost.trim()) {
      clearSettings(undefined, { onSuccess: () => { void refetchHealth() } })
      return
    }

    saveSettings(buildPayload(), { onSuccess: () => { void refetchHealth() } })
  }

  // Test connection handler
  const handleTestConnection = () => {
    if (!validate()) return

    testConnection(buildPayload())
  }

  // Reset handler
  const handleReset = () => {
    if (settings) {
      setFormValues({
        smtpHost: settings.smtpHost || '',
        smtpPort: settings.smtpPort || String(DEFAULT_PORT),
        smtpSecure: settings.smtpSecure ?? false,
        smtpUser: settings.smtpUser || '',
        smtpPassword: settings.smtpPassword || '',
        smtpFromName: settings.smtpFromName || '',
        smtpFromEmail: settings.smtpFromEmail || '',
      })
      setValidationErrors({})
    }
  }

  // Update a single field
  const updateField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setFormValues(prev => ({ ...prev, [field]: value }))
    // Clear validation error for this field on change
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const isBusy = isLoading || isSaving || isTesting || isClearing
  const isDirty = settings != null && (
       formValues.smtpHost      !== (settings.smtpHost      || '')
    || formValues.smtpPort      !== (settings.smtpPort      || String(DEFAULT_PORT))
    || formValues.smtpSecure    !== (settings.smtpSecure    ?? false)
    || formValues.smtpUser      !== (settings.smtpUser      || '')
    || formValues.smtpPassword  !== (settings.smtpPassword  || '')
    || formValues.smtpFromName  !== (settings.smtpFromName  || '')
    || formValues.smtpFromEmail !== (settings.smtpFromEmail || '')
  )

  return (
    <Card className={className} data-testid="smtp-config-panel">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-3">
          <span>Configuration SMTP</span>
          <SmtpStatusBadge
            smtpHost={smtpHost}
            healthy={smtpHealthy}
            healthLoading={isHealthLoading}
            smtpTimeout={smtpTimeout}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Loading error */}
        {error && (
          <Banner variant="destructive" role="alert">
            <BannerDescription>Erreur de chargement de la configuration. Veuillez réessayer.</BannerDescription>
          </Banner>
        )}

        {/* Health warning — SMTP is configured but the server cannot reach it */}
        {smtpHost && smtpHealthy === false && (
          <Banner variant="warning" role="alert" data-testid="smtp-health-warning">
            <AlertTriangle className="h-4 w-4" />
            <BannerDescription>Le serveur SMTP est configuré mais non joignable. Les emails ne seront pas envoyés.</BannerDescription>
          </Banner>
        )}

        {/* 15s timeout warning — we couldn't verify SMTP health in a reasonable time */}
        {smtpTimeout && (
          <Banner variant="default" role="status">
            <AlertTriangle className="h-4 w-4" />
            <BannerDescription>Impossible de vérifier l&apos;état du serveur SMTP.</BannerDescription>
          </Banner>
        )}

        {/* Clear-settings failure */}
        {!!clearError && (
          <Banner variant="destructive" role="alert">
            <BannerDescription>La désactivation a échoué. Votre configuration reste active.</BannerDescription>
          </Banner>
        )}

        <SmtpFields
          values={formValues}
          onChange={updateField}
          errors={validationErrors}
          disabled={isBusy}
        />

        {/* Action buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t max-sm:[&>button]:flex-1">
          {smtpHost && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={isBusy}
                  type="button"
                  data-testid="smtp-disable-btn"
                  className="sm:mr-auto"
                >
                  {isClearing ? 'Désactivation...' : 'Désactiver SMTP'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Désactiver la configuration SMTP ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La configuration SMTP sera supprimée. Les emails seront désactivés en production jusqu&apos;à ce qu&apos;une nouvelle configuration soit ajoutée. Cette action ne peut pas être annulée.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Fermer</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearSettings(undefined, { onSuccess: () => { void refetchHealth() } })}
                    data-testid="smtp-disable-confirm-btn"
                  >
                    Désactiver
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isBusy || !isDirty}
            type="button"
            data-testid="smtp-reset-btn"
          >
            Réinitialiser
          </Button>

          <Button
            onClick={handleTestConnection}
            disabled={isBusy}
            variant="outline"
            data-testid="smtp-test-btn"
          >
            {isTesting ? 'Test en cours...' : 'Tester la connexion'}
          </Button>

          <Button
            onClick={handleSave}
            disabled={isBusy || !isDirty}
            data-testid="smtp-save-btn"
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
