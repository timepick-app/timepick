import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

export interface SmtpFieldsValues {
  smtpHost: string
  smtpPort: string
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  smtpFromName: string
  smtpFromEmail: string
}

interface Props {
  values: SmtpFieldsValues
  onChange: <K extends keyof SmtpFieldsValues>(field: K, value: SmtpFieldsValues[K]) => void
  errors: Record<string, string>
  disabled: boolean
}

export function SmtpFields({ values, onChange, errors, disabled }: Props) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <>
      {/* Host */}
      <div className="space-y-2">
        <Label htmlFor="smtp-host">Hôte SMTP</Label>
        <Input
          id="smtp-host"
          type="text"
          placeholder="ex: smtp.votredomaine.com"
          value={values.smtpHost}
          onChange={e => onChange('smtpHost', e.target.value)}
          disabled={disabled}
          data-testid="smtp-host"
          aria-invalid={!!errors.smtpHost}
        />
        {errors.smtpHost && (
          <p className="text-xs text-destructive" role="alert">{errors.smtpHost}</p>
        )}
      </div>

      {/* Port + Secure toggle — side by side */}
      <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
        <div className="space-y-2">
          <Label htmlFor="smtp-port">Port</Label>
          <Input
            id="smtp-port"
            type="number"
            min={1}
            max={65535}
            value={values.smtpPort}
            onChange={e => onChange('smtpPort', e.target.value)}
            disabled={disabled}
            data-testid="smtp-port"
            aria-invalid={!!errors.smtpPort}
          />
          {errors.smtpPort && (
            <p className="text-xs text-destructive" role="alert">{errors.smtpPort}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="smtp-secure">Connexion SSL directe</Label>
          <div className="flex items-center h-9 gap-2">
            <Switch
              id="smtp-secure"
              checked={values.smtpSecure}
              onCheckedChange={checked => onChange('smtpSecure', checked)}
              disabled={disabled}
              data-testid="smtp-secure"
              aria-describedby="smtp-secure-help"
            />
            <span className="text-sm text-muted-foreground">
              {values.smtpSecure ? 'Activé' : 'Désactivé'}
            </span>
          </div>
          <p id="smtp-secure-help" className="text-xs text-muted-foreground">
            {values.smtpSecure
              ? 'SSL/TLS direct — utilisé avec le port 465.'
              : 'STARTTLS — chiffrement négocié automatiquement, utilisé avec le port 587.'}
          </p>
        </div>
      </div>

      {/* Username */}
      <div className="space-y-2">
        <Label htmlFor="smtp-user">Nom d&apos;utilisateur</Label>
        <Input
          id="smtp-user"
          type="text"
          placeholder="utilisateur@exemple.com"
          value={values.smtpUser}
          onChange={e => onChange('smtpUser', e.target.value)}
          disabled={disabled}
          data-testid="smtp-user"
        />
      </div>

      {/* Password */}
      <div className="space-y-2">
        <Label htmlFor="smtp-password">Mot de passe</Label>
        <div className="relative">
          <Input
            id="smtp-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={values.smtpPassword}
            onChange={e => onChange('smtpPassword', e.target.value)}
            disabled={disabled}
            className="pr-10"
            data-testid="smtp-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => setShowPassword(prev => !prev)}
            disabled={disabled}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            data-testid="smtp-password-toggle"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {values.smtpPassword && (
          <p className="text-xs text-muted-foreground">
            Mot de passe configuré. Laissez tel quel pour le conserver.
          </p>
        )}
      </div>

      {/* Sender name + email — side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="smtp-from-name">Nom de l&apos;expéditeur</Label>
          <Input
            id="smtp-from-name"
            type="text"
            placeholder="TimePick"
            value={values.smtpFromName}
            onChange={e => onChange('smtpFromName', e.target.value)}
            disabled={disabled}
            data-testid="smtp-from-name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="smtp-from-email">Email de l&apos;expéditeur</Label>
          <Input
            id="smtp-from-email"
            type="email"
            placeholder="noreply@exemple.com"
            value={values.smtpFromEmail}
            onChange={e => onChange('smtpFromEmail', e.target.value)}
            disabled={disabled}
            data-testid="smtp-from-email"
            aria-invalid={!!errors.smtpFromEmail}
          />
          {errors.smtpFromEmail && (
            <p className="text-xs text-destructive" role="alert">{errors.smtpFromEmail}</p>
          )}
        </div>
      </div>
    </>
  )
}
