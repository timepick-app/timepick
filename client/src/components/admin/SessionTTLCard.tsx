import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  useMagicLinkConfig,
} from '@/hooks/useMagicLinkConfig'
import { useUpdateMagicLinkConfig, MAX_SESSION_TTL } from '@/hooks/useUpdateMagicLinkConfig'
import { type DurationConfig, secondsToDisplay, convertToSeconds, type TimeUnit } from '@/lib/duration-utils'
import { DurationField } from './DurationField'

interface SessionTTLCardProps {
  className?: string
}

const SESSION_CONFIG: DurationConfig = {
  defaultValue: 2,
  defaultUnit: 'hours',
  minSeconds: 300,
  maxSeconds: 86400,
}

const SESSION_UNITS: TimeUnit[] = ['minutes', 'hours']

export const SessionTTLCard = ({ className = '' }: SessionTTLCardProps) => {
  const { data: magicLinkConfig, isLoading, error } = useMagicLinkConfig()
  const { mutate: updateConfig, isPending } = useUpdateMagicLinkConfig()

  const [sessionValue, setSessionValue] = useState<string>(SESSION_CONFIG.defaultValue.toString())
  const [sessionUnit, setSessionUnit] = useState<TimeUnit>(SESSION_CONFIG.defaultUnit)
  const [validationError, setValidationError] = useState<string>('')
  const [syncedConfig, setSyncedConfig] = useState<typeof magicLinkConfig>(undefined)

  // Resync hors-effet : on aligne le formulaire sur la config fetchée dès que
  // sa référence change (montage + après mutation), sans re-rendu en cascade.
  if (magicLinkConfig && magicLinkConfig !== syncedConfig) {
    setSyncedConfig(magicLinkConfig)
    const display = secondsToDisplay(magicLinkConfig.sessionTTL, SESSION_CONFIG, SESSION_UNITS)
    setSessionValue(display.value.toString())
    setSessionUnit(display.unit)
  }

  const validateValue = useCallback((val: string, unit: TimeUnit): string => {
    const num = parseInt(val, 10)
    if (val === '' || isNaN(num)) {
      return 'Veuillez entrer un nombre valide pour la durée de session'
    }
    const seconds = convertToSeconds(num, unit)
    if (seconds < 5 * 60) {
      return `La durée de session doit être d'au moins 5 minutes`
    }
    if (seconds > MAX_SESSION_TTL) {
      return `La durée de session ne peut pas dépasser 24 heures`
    }
    return ''
  }, [])

  const handleChange = (value: string, unit: TimeUnit) => {
    setSessionValue(value)
    setSessionUnit(unit)
    setValidationError(validateValue(value, unit))
  }

  const handleSave = () => {
    const err = validateValue(sessionValue, sessionUnit)
    if (err) {
      setValidationError(err)
      return
    }
    const sessionTTL = convertToSeconds(parseInt(sessionValue, 10), sessionUnit)
    updateConfig({
      sessionTTL,
      adminTTL: magicLinkConfig!.adminTTL,
      userTTL: magicLinkConfig!.userTTL,
    })
  }

  const handleReset = () => {
    if (magicLinkConfig) {
      const display = secondsToDisplay(magicLinkConfig.sessionTTL, SESSION_CONFIG, SESSION_UNITS)
      setSessionValue(display.value.toString())
      setSessionUnit(display.unit)
      setValidationError('')
    }
  }

  const parsed = parseInt(sessionValue, 10)
  const isDirty = magicLinkConfig != null
    && !isNaN(parsed)
    && convertToSeconds(parsed, sessionUnit) !== magicLinkConfig.sessionTTL

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center justify-between">
          <span>Sessions</span>
          {isLoading && (
            <span className="text-sm font-normal text-muted-foreground">
              Chargement...
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            Erreur de chargement de la configuration. Veuillez réessayer.
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Durée de connexion après authentification.
        </p>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="session-ttl">Durée de Session</Label>

            <DurationField
              id="session-ttl"
              value={sessionValue}
              unit={sessionUnit}
              units={SESSION_UNITS}
              onChange={handleChange}
              disabled={isLoading || isPending}
            />

            <p className="text-xs text-muted-foreground">
              5min — 24h
            </p>
          </div>

          {validationError && (
            <p className="text-xs text-destructive" role="alert">
              {validationError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isLoading || isPending || !isDirty}
              type="button"
            >
              Réinitialiser
            </Button>

            <Button
              onClick={handleSave}
              disabled={!!validationError || isLoading || isPending || !isDirty}
              className="min-w-[120px]"
              data-testid="save-session-ttl-button"
            >
              {isPending ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
