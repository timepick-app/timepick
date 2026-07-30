import { useState, useEffect, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { SheetShell } from './SheetShell'
import { SelfDemotionConfirmDialog } from './SelfDemotionConfirmDialog'
import { useEmailValidation } from '../hooks/useEmailValidation'
import type { User, ApiCreateUserInput, ApiUpdateUserInput, UserRole } from '../types/user'
import type { AuthUser } from '../hooks/useAuth'

export interface UserModalProps {
  mode: 'create' | 'edit'
  user?: User
  currentUser: AuthUser | null  // Required for self-demotion detection
  onSave: (data: ApiCreateUserInput | ApiUpdateUserInput) => Promise<void>
  onClose: () => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\+?[0-9\s-]{10,20}$/

export const UserModal = ({ mode, user, currentUser, onSave, onClose }: UserModalProps) => {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [profession, setProfession] = useState('')
  const [informations, setInformations] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(
    mode === 'edit' && Boolean(user?.phone || user?.profession || user?.informations)
  )
  const [role, setRole] = useState<UserRole>('user')
  const [sendInvitation, setSendInvitation] = useState(true)
  const [sendRoleNotification, setSendRoleNotification] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ firstName?: string; email?: string; phone?: string; general?: string }>({})
  const [showSelfDemotionDialog, setShowSelfDemotionDialog] = useState(false)
  const [pendingRoleChange, setPendingRoleChange] = useState<UserRole | null>(null)
  const isCreateMode = mode === 'create'
  const emailValidation = useEmailValidation(isCreateMode)

  useEffect(() => {
    if (mode === 'edit' && user) {
      setEmail(user.email)
      setFirstName(user.firstName || '')
      setLastName(user.lastName || '')
      setPhone(user.phone || '')
      setProfession(user.profession || '')
      setInformations(user.informations || '')
      setRole(user.role)
    }
  }, [mode, user])

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return 'L\'email est requis'
    if (!EMAIL_REGEX.test(value)) return 'Format d\'email invalide'
    return undefined
  }

  const validatePhone = (value: string): string | undefined => {
    if (value.trim() && !PHONE_REGEX.test(value)) {
      return 'Format de téléphone invalide (ex: +33 6 12 34 56 78)'
    }
    return undefined
  }

  const validateName = (value: string): string | undefined => {
    if (!value.trim()) return 'Le prénom est requis'
    return undefined
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    emailValidation.reset()
    if (errors.email) {
      setErrors(prev => ({ ...prev, email: validateEmail(value) }))
    }
  }

  const handlePhoneChange = (value: string) => {
    setPhone(value)
    if (errors.phone) {
      setErrors(prev => ({ ...prev, phone: validatePhone(value) }))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})

    // Validate email only for create mode
    if (mode === 'create') {
      const emailError = validateEmail(email)
      if (emailError) {
        setErrors({ email: emailError })
        return
      }
    }

    // Prénom requis (décision verrouillée 1) — validation JS car le bouton de
    // soumission est hors du <form>, l'attribut HTML `required` ne se déclenche
    // jamais. S'applique aux deux modes (jamais effaçable).
    const nameError = validateName(firstName)
    if (nameError) {
      setErrors({ firstName: nameError })
      return
    }

    // Validate phone if provided
    const phoneError = validatePhone(phone)
    if (phoneError) {
      setErrors({ phone: phoneError })
      return
    }

    // Detect self-demotion: admin changing their own role to user
    const isSelfDemotion = mode === 'edit' &&
                         user &&
                         currentUser &&
                         user.id === currentUser.id &&
                         user.role === 'admin' &&
                         role === 'user'

    if (isSelfDemotion) {
      // Show confirmation dialog instead of submitting directly
      setPendingRoleChange(role)
      setShowSelfDemotionDialog(true)
      return
    }

    // Proceed with normal submission
    await performSubmission()
  }

  const performSubmission = async () => {
    setLoading(true)
    try {
      if (mode === 'create') {
        const data: ApiCreateUserInput = {
          email: email.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: phone.trim() || undefined,
          profession: profession.trim() || undefined,
          informations: informations.trim() || undefined,
          role,
          sendInvitation
        }
        await onSave(data)
      } else {
        const data: ApiUpdateUserInput = {
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || null,
          phone: phone.trim() || undefined,
          profession: profession.trim() || null,
          informations: informations.trim() || null,
          role: pendingRoleChange ?? role,
          sendRoleNotification,
        }
        await onSave(data)
      }
      onClose()
    } catch (err) {
      // Trace de diagnostic : sans ce log, une erreur de programmation (non-axios)
      // serait indiscernable d'une validation serveur dans le bandeau utilisateur.
      console.error('[UserModal] échec sauvegarde membre:', err)
      const e = err as { response?: { data?: { error?: string } } }
      setErrors({
        general:
          e.response?.data?.error ||
          (err instanceof Error ? err.message : undefined) ||
          'Une erreur est survenue',
      })
      // La sauvegarde a échoué : la base n'a pas changé. On rétablit le radio
      // sur le rôle réellement persisté pour éviter d'afficher un état non enregistré
      // (ex. rejet 409 « dernier administrateur »).
      if (mode === 'edit' && user) {
        setRole(user.role)
      }
    } finally {
      setLoading(false)
      setPendingRoleChange(null)
    }
  }

  const handleConfirmSelfDemotion = async () => {
    setShowSelfDemotionDialog(false)
    await performSubmission()
  }

  const handleCancelSelfDemotion = () => {
    setShowSelfDemotionDialog(false)
    setPendingRoleChange(null)
  }

  return (
    <>
      <SheetShell
        open
        onOpenChange={(o) => { if (!o) onClose() }}
        title={mode === 'create' ? 'Nouveau membre' : 'Modifier le membre'}
        onInteractOutside={(e) => {
          // Keep the sheet open while the stacked SelfDemotion confirmation is shown,
          // or while a save is in flight (prevents silent loss of the error banner)
          if (showSelfDemotionDialog || loading) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          // Same guard: Escape must not close the sheet behind the confirmation
          // or dismiss an in-flight save before the error banner can be shown
          if (showSelfDemotionDialog || loading) e.preventDefault()
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Fermer
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Enregistrement...' : mode === 'create' ? 'Créer' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        {/* Form — submit button lives in the footer prop (outside <form>) so JS validation fires via handleSubmit */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <Banner variant="destructive">
              <BannerDescription>{errors.general}</BannerDescription>
            </Banner>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={e => handleEmailChange(e.target.value)}
              onBlur={() => {
                if (!isCreateMode) return
                setErrors(prev => ({ ...prev, email: validateEmail(email) }))
                emailValidation.validate(email)
              }}
              disabled={mode === 'edit'}
              placeholder="membre@example.com"
              required={mode === 'create'}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'user-email-error' : undefined}
            />
            {errors.email && <p id="user-email-error" className="mt-1 text-xs text-destructive" role="alert">{errors.email}</p>}
            {/* R5 — avertissement non bloquant : ton neutre, pas de role="alert". */}
            {isCreateMode &&
              !errors.email &&
              emailValidation.status === 'warning' &&
              emailValidation.warningCode === 'NO_MX_RECORD' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ce domaine ne semble pas accepter les emails. Vérifiez la saisie.
                </p>
              )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={e => {
                  setFirstName(e.target.value)
                  if (errors.firstName) setErrors(prev => ({ ...prev, firstName: validateName(e.target.value) }))
                }}
                onBlur={() => setErrors(prev => ({ ...prev, firstName: validateName(firstName) }))}
                placeholder="Jean"
                maxLength={100}
                required
                aria-invalid={!!errors.firstName}
                aria-describedby={errors.firstName ? 'firstName-error' : undefined}
              />
              {errors.firstName && <p id="firstName-error" className="mt-1 text-xs text-destructive" role="alert">{errors.firstName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Dupont"
                maxLength={100}
              />
            </div>
          </div>

          <details
            open={detailsOpen}
            onToggle={e => setDetailsOpen(e.currentTarget.open)}
            className="rounded-md border border-gray-200"
          >
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
              Informations complémentaires
            </summary>
            <div className="space-y-4 px-3 pb-3">
              <div className="space-y-1.5">
                <Label htmlFor="user-phone">Téléphone</Label>
                <Input
                  id="user-phone"
                  type="tel"
                  value={phone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  onBlur={() => phone && setErrors(prev => ({ ...prev, phone: validatePhone(phone) }))}
                  placeholder="+33 6 12 34 56 78"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? 'user-phone-error' : undefined}
                />
                {errors.phone && <p id="user-phone-error" className="mt-1 text-xs text-destructive" role="alert">{errors.phone}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-profession">Profession</Label>
                <Input
                  id="user-profession"
                  type="text"
                  value={profession}
                  onChange={e => setProfession(e.target.value)}
                  placeholder="Enseignant"
                  maxLength={150}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-informations">Informations</Label>
                <Textarea
                  id="user-informations"
                  maxLength={5000}
                  value={informations}
                  onChange={e => setInformations(e.target.value)}
                  placeholder="Notes libres (disponibilités, compétences…)"
                  rows={3}
                  className="resize-y"
                />
              </div>
            </div>
          </details>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rôle</label>
            <RadioGroup
              value={role}
              onValueChange={(v) => setRole(v as 'user' | 'admin')}
              className="flex gap-4"
            >
              <label htmlFor="role-user" className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="user" id="role-user" />
                <span className="text-sm text-gray-700">Membre</span>
              </label>
              <label htmlFor="role-admin" className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="admin" id="role-admin" />
                <span className="text-sm text-gray-700">Administrateur</span>
              </label>
            </RadioGroup>
          </div>

          {mode === 'edit' && role !== user?.role && (
            <div className="pt-2">
              <label htmlFor="send-role-notification" className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  id="send-role-notification"
                  checked={sendRoleNotification}
                  onCheckedChange={(v) => setSendRoleNotification(v === true)}
                />
                <span className="text-sm text-gray-700">Notifier le membre du changement de rôle par email</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">
                Le membre recevra un email l'informant de son nouveau rôle
              </p>
            </div>
          )}

          {mode === 'create' && (
            <div className="pt-2">
              <label htmlFor="send-invitation" className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  id="send-invitation"
                  checked={sendInvitation}
                  onCheckedChange={(v) => setSendInvitation(v === true)}
                />
                <span className="text-sm text-gray-700">Envoyer un email d'invitation</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">
                Le membre recevra un email de bienvenue avec un lien de connexion
              </p>
            </div>
          )}
        </form>
      </SheetShell>

      {/* Self-demotion confirmation dialog — rendered as a Fragment sibling to avoid nested Radix portals */}
      {showSelfDemotionDialog && (
        <SelfDemotionConfirmDialog
          open={showSelfDemotionDialog}
          onConfirm={handleConfirmSelfDemotion}
          onCancel={handleCancelSelfDemotion}
        />
      )}
    </>
  )
}
