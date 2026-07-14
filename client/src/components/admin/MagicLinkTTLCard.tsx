import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  useMagicLinkConfig,
} from '@/hooks/useMagicLinkConfig'
import { useUpdateMagicLinkConfig, MAX_ADMIN_TTL, MAX_USER_TTL } from '@/hooks/useUpdateMagicLinkConfig'
import { type DurationConfig, secondsToDisplay, convertToSeconds, type TimeUnit } from '@/lib/duration-utils'
import { DurationField } from './DurationField'

interface MagicLinkTTLCardProps {
  className?: string
}

const ADMIN_CONFIG: DurationConfig = {
  defaultValue: 24,
  defaultUnit: 'hours',
  minSeconds: 60,
  maxSeconds: 604800,
}

const USER_CONFIG: DurationConfig = {
  defaultValue: 7,
  defaultUnit: 'days',
  minSeconds: 60,
  maxSeconds: 2592000,
}

export const MagicLinkTTLCard = ({ className = '' }: MagicLinkTTLCardProps) => {
  const { data: magicLinkConfig, isLoading, error } = useMagicLinkConfig()
  const { mutate: updateConfig, isPending } = useUpdateMagicLinkConfig()

  const [adminValue, setAdminValue] = useState<string>(ADMIN_CONFIG.defaultValue.toString())
  const [adminUnit, setAdminUnit] = useState<TimeUnit>(ADMIN_CONFIG.defaultUnit)
  const [userValue, setUserValue] = useState<string>(USER_CONFIG.defaultValue.toString())
  const [userUnit, setUserUnit] = useState<TimeUnit>(USER_CONFIG.defaultUnit)
  const [validationError, setValidationError] = useState<string>('')
  const [syncedConfig, setSyncedConfig] = useState<typeof magicLinkConfig>(undefined)

  // Resync hors-effet : on aligne le formulaire sur la config fetchée dès que
  // sa référence change (montage + après mutation), sans re-rendu en cascade.
  if (magicLinkConfig && magicLinkConfig !== syncedConfig) {
    setSyncedConfig(magicLinkConfig)
    const adminDisplay = secondsToDisplay(magicLinkConfig.adminTTL, ADMIN_CONFIG)
    setAdminValue(adminDisplay.value.toString())
    setAdminUnit(adminDisplay.unit)

    const userDisplay = secondsToDisplay(magicLinkConfig.userTTL, USER_CONFIG)
    setUserValue(userDisplay.value.toString())
    setUserUnit(userDisplay.unit)
  }

  const validateValues = useCallback((
    adminVal: string,
    adminUnt: TimeUnit,
    userVal: string,
    userUnt: TimeUnit
  ): string => {
    const adminNum = parseInt(adminVal, 10)
    const userNum = parseInt(userVal, 10)

    if (adminVal === '' || isNaN(adminNum)) {
      return 'Veuillez entrer un nombre valide pour la durée admin'
    }
    if (userVal === '' || isNaN(userNum)) {
      return 'Veuillez entrer un nombre valide pour la durée user'
    }

    const adminSeconds = convertToSeconds(adminNum, adminUnt)
    const userSeconds = convertToSeconds(userNum, userUnt)

    if (adminSeconds < 60) {
      return `La durée admin doit être d'au moins 1 minute`
    }
    if (adminSeconds > MAX_ADMIN_TTL) {
      return `La durée admin ne peut pas dépasser 7 jours`
    }
    if (userSeconds < 60) {
      return `La durée user doit être d'au moins 1 minute`
    }
    if (userSeconds > MAX_USER_TTL) {
      return `La durée user ne peut pas dépasser 30 jours`
    }

    return ''
  }, [])

  const handleAdminChange = (value: string, unit: TimeUnit) => {
    setAdminValue(value)
    setAdminUnit(unit)
    setValidationError(validateValues(value, unit, userValue, userUnit))
  }

  const handleUserChange = (value: string, unit: TimeUnit) => {
    setUserValue(value)
    setUserUnit(unit)
    setValidationError(validateValues(adminValue, adminUnit, value, unit))
  }

  const handleSave = () => {
    const err = validateValues(adminValue, adminUnit, userValue, userUnit)
    if (err) {
      setValidationError(err)
      return
    }

    const adminTTL = convertToSeconds(parseInt(adminValue, 10), adminUnit)
    const userTTL = convertToSeconds(parseInt(userValue, 10), userUnit)

    updateConfig({
      adminTTL,
      userTTL,
      sessionTTL: magicLinkConfig!.sessionTTL,
    })
  }

  const handleReset = () => {
    if (magicLinkConfig) {
      const adminDisplay = secondsToDisplay(magicLinkConfig.adminTTL, ADMIN_CONFIG)
      setAdminValue(adminDisplay.value.toString())
      setAdminUnit(adminDisplay.unit)

      const userDisplay = secondsToDisplay(magicLinkConfig.userTTL, USER_CONFIG)
      setUserValue(userDisplay.value.toString())
      setUserUnit(userDisplay.unit)
      setValidationError('')
    }
  }

  const parsedAdmin = parseInt(adminValue, 10)
  const parsedUser = parseInt(userValue, 10)
  const isDirty = magicLinkConfig != null
    && !isNaN(parsedAdmin)
    && !isNaN(parsedUser)
    && (convertToSeconds(parsedAdmin, adminUnit) !== magicLinkConfig.adminTTL
      || convertToSeconds(parsedUser, userUnit) !== magicLinkConfig.userTTL)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center justify-between">
          <span>Liens de connexion (Magic Links)</span>
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
          Durée de validité des liens de connexion envoyés par email.
        </p>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="admin-ttl">Connexion Administrateur</Label>

            <DurationField
              id="admin-ttl"
              value={adminValue}
              unit={adminUnit}
              units={['minutes', 'hours', 'days']}
              onChange={handleAdminChange}
              disabled={isLoading || isPending}
            />

            <p className="text-xs text-muted-foreground">
              1min — 7 jours
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-ttl">Connexion Membre</Label>

            <DurationField
              id="user-ttl"
              value={userValue}
              unit={userUnit}
              units={['minutes', 'hours', 'days']}
              onChange={handleUserChange}
              disabled={isLoading || isPending}
            />

            <p className="text-xs text-muted-foreground">
              1min — 30 jours
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
              data-testid="save-magic-link-ttl-button"
            >
              {isPending ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
