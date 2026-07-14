import { useState, useCallback } from 'react'
import { Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePollingConfig, useUpdatePollingConfig, msToSeconds } from '@/hooks/usePollingConfig'

interface PollingConfigPanelProps {
  className?: string
}

/**
 * Limites de l'intervalle de polling en secondes
 */
const MIN_SECONDS = 10
const MAX_SECONDS = 120
const DEFAULT_SECONDS = 30

/**
 * PollingConfigPanel Component
 * Panel de configuration pour la fréquence de mise à jour automatique du calendrier
 *
 * Permet à l'administrateur de:
 * - Voir la fréquence actuelle de polling (en secondes)
 * - Modifier la fréquence entre 10s et 120s
 * - Sauvegarder les modifications avec validation
 *
 * UX:
 * - Affichage en secondes (plus lisible que millisecondes)
 * - Validation locale avant envoi
 * - Explication de l'impact de la configuration
 *
 * @example
 * <PollingConfigPanel />
 */
export const PollingConfigPanel = ({ className = '' }: PollingConfigPanelProps) => {
  const { data: pollingConfig, isLoading, error } = usePollingConfig()
  const { mutate: updateInterval, isPending } = useUpdatePollingConfig()

  // Valeur locale du formulaire (en secondes)
  const [localSeconds, setLocalSeconds] = useState<number>(DEFAULT_SECONDS)
  const [validationError, setValidationError] = useState<string>('')
  const [syncedConfig, setSyncedConfig] = useState<typeof pollingConfig>(undefined)

  // Resync hors-effet : on aligne le champ sur la config fetchée dès que sa
  // référence change (montage + après mutation), sans re-rendu en cascade.
  if (pollingConfig?.interval && pollingConfig !== syncedConfig) {
    setSyncedConfig(pollingConfig)
    setLocalSeconds(msToSeconds(pollingConfig.interval))
  }

  // Validation locale de la valeur saisie
  const validateValue = useCallback((value: number): string => {
    if (isNaN(value)) return 'Veuillez entrer un nombre valide'
    if (value < MIN_SECONDS) return `Minimum ${MIN_SECONDS} secondes`
    if (value > MAX_SECONDS) return `Maximum ${MAX_SECONDS} secondes`
    return ''
  }, [])

  // Gestionnaire de changement via slider
  const handleSliderChange = (seconds: number) => {
    setLocalSeconds(seconds)
    setValidationError(validateValue(seconds))
  }

  // Gestionnaire de sauvegarde
  const handleSave = () => {
    const error = validateValue(localSeconds)
    if (error) {
      setValidationError(error)
      return
    }

    updateInterval(localSeconds)
  }

  const isDirty = pollingConfig?.interval != null && localSeconds !== msToSeconds(pollingConfig.interval)

  // Gestionnaire de réinitialisation
  const handleReset = () => {
    if (pollingConfig?.interval) {
      setLocalSeconds(msToSeconds(pollingConfig.interval))
      setValidationError('')
    }
  }


  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center justify-between">
          <span>Rafraîchissement calendrier</span>
          {isLoading && (
            <span className="text-sm font-normal text-muted-foreground">
              Chargement...
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Erreur de chargement */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            Erreur de chargement de la configuration. Veuillez réessayer.
          </div>
        )}

        {/* Description de la configuration */}
        <p className="text-sm text-muted-foreground">
          Fréquence de mise à jour automatique du calendrier public (entre {MIN_SECONDS}s et {MAX_SECONDS}s).
        </p>

        {/* Formulaire de configuration */}
        <div className="space-y-4">
          <div className="space-y-3 max-w-sm">
            {/* Label + valeur courante */}
            <div className="flex items-center justify-between">
              <Label htmlFor="polling-interval" className="flex items-center gap-1.5">
                Fréquence de mise à jour
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label="Plus d'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Les modifications prennent effet immédiatement pour tous les membres connectés au calendrier public.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <span className="text-sm tabular-nums font-medium">{localSeconds}s</span>
            </div>

            {/* Slider DS */}
            <Slider
              id="polling-interval"
              min={MIN_SECONDS}
              max={MAX_SECONDS}
              step={10}
              value={localSeconds}
              onValueChange={handleSliderChange}
              disabled={isLoading || isPending}
              aria-describedby="polling-description"
              data-testid="polling-input"
            />

            {/* Bornes + valeur sauvegardée */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{MIN_SECONDS}s</span>
              {!isLoading && pollingConfig && (
                <span>(actuel: {msToSeconds(pollingConfig.interval)}s)</span>
              )}
              <span>{MAX_SECONDS}s</span>
            </div>

            {/* Description a11y */}
            <p id="polling-description" className="text-xs text-muted-foreground sr-only">
              La fréquence de mise à jour du calendrier, entre {MIN_SECONDS} et {MAX_SECONDS} secondes
            </p>
          </div>

          {/* Message de validation */}
          {validationError && (
            <p className="text-sm text-red-600" role="alert">
              {validationError}
            </p>
          )}

          {/* Boutons d'action */}
          <div className="flex justify-end gap-3">
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
              data-testid="save-polling-button"
            >
              {isPending ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
