import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EmailProvider, ProviderMeta } from '@/services/settings.service'

/** Seule valeur de provider connue du client — tout le reste vient du catalogue. */
const SMTP_PROVIDER = 'smtp'

export interface SmtpFieldsValues {
  emailProvider: EmailProvider
  /** Identifiants du fournisseur HTTP actif — un champ par `credentialField.key`. */
  credentials: Record<string, string>
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
  /** Catalogue des fournisseurs HTTP (contrat §1/§3.1) — EU-first, resend en dernier. */
  catalog: ProviderMeta[]
  catalogLoading?: boolean
  /** Provider/credentials actuellement stockés côté serveur — pilote la
   *  sentinelle scopée au provider (contrat §4.2, amendement revue delta 1). */
  storedProvider?: EmailProvider
  storedCredentials?: Record<string, string>
}

/**
 * Résout les credentials à appliquer au changement de fournisseur — sentinelle
 * SCOPÉE au provider (contrat §4.2/§7.7, amendement revue delta 1) : on ne
 * restaure les valeurs stockées (`'****'` compris) QUE si l'on revient au
 * fournisseur déjà en base. Tout autre changement repart de zéro : jamais de
 * fuite d'identifiants entre fournisseurs qui partagent un nom de champ (ex.
 * `apiKey`, utilisé par plusieurs fournisseurs du catalogue).
 */
function resolveCredentialsOnProviderChange(
  newProviderId: string,
  storedProvider: EmailProvider | undefined,
  storedCredentials: Record<string, string> | undefined,
): Record<string, string> {
  return newProviderId === storedProvider ? { ...(storedCredentials ?? {}) } : {}
}

/**
 * Validation client (miroir souple du serveur, contrat §5) pour le fournisseur
 * HTTP actif : chaque `credentialField.required` (défaut true) doit être non
 * vide, ou couvert par la sentinelle SCOPÉE au provider stocké ; `smtpFromEmail`
 * est requis pour tout fournisseur HTTP (délivrabilité, amendement delta 2).
 * Ne valide rien pour `smtp` (traité séparément par l'appelant) ni si le
 * catalogue n'est pas encore chargé (le serveur validera dans ce cas).
 */
export function validateProviderCredentials(
  values: SmtpFieldsValues,
  catalog: ProviderMeta[],
  storedProvider: EmailProvider | undefined,
  storedCredentials: Record<string, string> | undefined,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (values.emailProvider === SMTP_PROVIDER) return errors

  const meta = catalog.find(p => p.id === values.emailProvider)
  if (!meta) return errors

  const providerUnchanged = storedProvider === meta.id
  for (const field of meta.credentialFields) {
    if (field.required === false) continue
    const value = values.credentials[field.key] ?? ''
    const hasRealValue = !!value && value !== '****'
    const sentinelValid = field.secret && providerUnchanged && !!(storedCredentials?.[field.key])
    if (!hasRealValue && !sentinelValid) {
      errors[`credentials.${field.key}`] = `Le champ « ${field.label} » est requis`
    }
  }

  if (!values.smtpFromEmail) {
    errors.smtpFromEmail = "L'email de l'expéditeur est requis pour un envoi par API"
  }

  return errors
}

export function SmtpFields({
  values,
  onChange,
  errors,
  disabled,
  catalog: rawCatalog,
  catalogLoading = false,
  storedProvider,
  storedCredentials,
}: Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})

  // Défensif : un catalogue malformé (mock de test incomplet, réponse
  // inattendue) ne doit jamais faire planter tout le formulaire — repli sur
  // une liste vide plutôt que sur la valeur brute reçue.
  const catalog = Array.isArray(rawCatalog) ? rawCatalog : []

  const category: 'smtp' | 'http' = values.emailProvider === SMTP_PROVIDER ? 'smtp' : 'http'
  const selectedMeta = catalog.find(p => p.id === values.emailProvider)

  const selectProvider = (providerId: string) => {
    onChange('emailProvider', providerId)
    onChange('credentials', resolveCredentialsOnProviderChange(providerId, storedProvider, storedCredentials))
  }

  const selectCategory = (nextCategory: string) => {
    if (nextCategory === SMTP_PROVIDER) {
      selectProvider(SMTP_PROVIDER)
    } else if (values.emailProvider === SMTP_PROVIDER) {
      // Premier passage en HTTP : présélectionne le 1er fournisseur du catalogue (EU-first).
      selectProvider(catalog[0]?.id ?? '')
    }
  }

  const toggleVisibility = (key: string) => setVisibility(prev => ({ ...prev, [key]: !prev[key] }))

  const updateCredential = (key: string, next: string) => {
    onChange('credentials', { ...values.credentials, [key]: next })
  }

  return (
    <>
      {/* Niveau 1 : catégorie neutre — aucun nom de marque */}
      <div className="space-y-2">
        <Label htmlFor="email-category">Mode d&apos;envoi</Label>
        <Select value={category} onValueChange={selectCategory} disabled={disabled}>
          <SelectTrigger id="email-category" data-testid="email-category-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smtp">SMTP</SelectItem>
            <SelectItem value="http">Envoi par API (HTTP)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Niveau 2 : sous-menu fournisseur — depuis le catalogue serveur (EU-first) */}
      {category === 'http' && (
        <div className="space-y-2">
          <Label htmlFor="email-provider">Fournisseur</Label>
          <Select
            value={values.emailProvider}
            onValueChange={selectProvider}
            disabled={disabled || catalogLoading}
          >
            <SelectTrigger id="email-provider" data-testid="email-provider-select">
              <SelectValue placeholder={catalogLoading ? 'Chargement…' : undefined} />
            </SelectTrigger>
            <SelectContent>
              {catalog.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
              {/* Fournisseur stocké pas (encore) dans le catalogue chargé : on
                  affiche son id brut plutôt que de crasher ou vider le sélecteur. */}
              {!catalogLoading && values.emailProvider !== SMTP_PROVIDER && !catalog.some(p => p.id === values.emailProvider) && (
                <SelectItem value={values.emailProvider}>{values.emailProvider}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {selectedMeta && (
            <p className="text-xs text-muted-foreground">
              {selectedMeta.region === 'eu' ? '🇪🇺' : '🇺🇸'} {selectedMeta.freeTierNote}
            </p>
          )}
          {catalogLoading && (
            <p className="text-xs text-muted-foreground">Chargement des fournisseurs…</p>
          )}
        </div>
      )}

      {category === 'smtp' && (
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
        </>
      )}

      {/* Formulaire dynamique — un champ par credentialField du fournisseur choisi, aucun champ en dur */}
      {category === 'http' && selectedMeta && (
        <div className="space-y-4">
          {selectedMeta.credentialFields.map(field => {
            const fieldId = `credential-${field.key}`
            const value = values.credentials[field.key] ?? ''
            const errorMsg = errors[`credentials.${field.key}`]
            const errorId = `${fieldId}-error`
            const isVisible = visibility[field.key] ?? false

            if (field.options) {
              return (
                <div className="space-y-2" key={field.key}>
                  <Label htmlFor={fieldId}>{field.label}</Label>
                  <Select
                    value={value}
                    onValueChange={next => updateCredential(field.key, next)}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      id={fieldId}
                      data-testid={fieldId}
                      aria-invalid={!!errorMsg}
                      aria-describedby={errorMsg ? errorId : undefined}
                    >
                      <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
                  {errorMsg && <p id={errorId} className="text-xs text-destructive" role="alert">{errorMsg}</p>}
                </div>
              )
            }

            if (field.secret) {
              return (
                <div className="space-y-2" key={field.key}>
                  <Label htmlFor={fieldId}>{field.label}</Label>
                  <div className="relative">
                    <Input
                      id={fieldId}
                      type={isVisible ? 'text' : 'password'}
                      placeholder={field.placeholder}
                      value={value}
                      onChange={e => updateCredential(field.key, e.target.value)}
                      disabled={disabled}
                      className="pr-10"
                      data-testid={fieldId}
                      aria-invalid={!!errorMsg}
                      aria-describedby={errorMsg ? errorId : undefined}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => toggleVisibility(field.key)}
                      disabled={disabled}
                      aria-label={isVisible ? `Masquer ${field.label}` : `Afficher ${field.label}`}
                      data-testid={`${fieldId}-toggle`}
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
                  {errorMsg && <p id={errorId} className="text-xs text-destructive" role="alert">{errorMsg}</p>}
                  {value === '****' && (
                    <p className="text-xs text-muted-foreground">
                      Valeur configurée. Laissez «****» pour la conserver.
                    </p>
                  )}
                </div>
              )
            }

            return (
              <div className="space-y-2" key={field.key}>
                <Label htmlFor={fieldId}>{field.label}</Label>
                <Input
                  id={fieldId}
                  type="text"
                  placeholder={field.placeholder}
                  value={value}
                  onChange={e => updateCredential(field.key, e.target.value)}
                  disabled={disabled}
                  data-testid={fieldId}
                  aria-invalid={!!errorMsg}
                  aria-describedby={errorMsg ? errorId : undefined}
                />
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
                {errorMsg && <p id={errorId} className="text-xs text-destructive" role="alert">{errorMsg}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Sender name + email — side by side, communs à SMTP et aux fournisseurs HTTP */}
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
