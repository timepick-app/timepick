import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/useMyProfile'
import { useAuth } from '@/hooks/useAuth'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatFullName } from '@/lib/formatFullName'
import { getInitials } from '@/lib/getInitials'
import { extractErrorMessage } from '@/lib/extractErrorMessage'
import { SecurityPanel, EncryptionKeyPanel } from '@/components/admin'

// Aligné sur patchMeProfileSchema / updateUserSchema (server/src/validators/user.validator.ts)
const PHONE_REGEX = /^\+?[0-9\s-]{10,20}$/

/**
 * Temps de session restant, humanisé (standard SaaS — pas de compte à rebours à
 * la seconde). Ex. « environ 1 h 35 min », « environ 35 min », « moins d'une minute ».
 */
function formatRemaining(seconds: number): string {
  if (seconds <= 60) return "moins d'une minute"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `environ ${h} h ${m} min` : `environ ${h} h`
  return `environ ${m} min`
}

/** Date d'inscription humanisée (ex. « 12 janvier 2026 »). */
function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * ProfileContent — contenu de profil role-aware partagé entre l'espace admin
 * (`/admin/profile`) et l'espace membre (`/me/profile`).
 *
 * - Source de données : `GET /me/profile` via `useMyProfile()` pour tous les rôles.
 * - Admin : affiche en plus la carte Session (timeout + prolongation), le badge
 *   « Administrateur » dans la carte Compte, et `SecurityPanel`.
 * - Membre : uniquement la carte Profil et la carte Compte (sans badge Rôle).
 *
 * Le spinner de chargement est géré ici ; le splash d'auth et les layouts restent
 * dans les wrappers de chaque espace.
 */
export function ProfileContent() {
  const { data: profile, isLoading } = useMyProfile()
  const { user, refreshSession, updateAuthUser } = useAuth()
  const updateMutation = useUpdateMyProfile()
  // Appelé inconditionnellement (règles React) même pour un membre ordinaire ;
  // les données ne sont rendues que si isAdmin.
  const { timeRemaining, isExpiringSoon, isCritical } = useSessionTimeout()

  const isAdmin = user?.role === 'admin'

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [profession, setProfession] = useState('')
  const [informations, setInformations] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const hydratedRef = useRef(false)

  // Remplissage UNE SEULE FOIS au premier objet non-null — un refetch d'arrière-
  // plan (refetchOnWindowFocus après staleTime) ne doit pas écraser les saisies
  // en cours. `useAuth().user` est insuffisant car il omet phone/profession/informations.
  useEffect(() => {
    if (profile && !hydratedRef.current) {
      setFirstName(profile.firstName ?? '')
      setLastName(profile.lastName ?? '')
      setPhone(profile.phone ?? '')
      setProfession(profile.profession ?? '')
      setInformations(profile.informations ?? '')
      hydratedRef.current = true
    }
  }, [profile])

  if (isLoading && !profile) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Chargement…
      </div>
    )
  }

  const isDirty =
    firstName.trim() !== (profile?.firstName ?? '').trim() ||
    lastName.trim() !== (profile?.lastName ?? '').trim() ||
    phone.trim() !== (profile?.phone ?? '').trim() ||
    profession.trim() !== (profile?.profession ?? '').trim() ||
    informations.trim() !== (profile?.informations ?? '').trim()
  const phoneInvalid = phone.trim() !== '' && !PHONE_REGEX.test(phone.trim())

  const displayFirstName = profile?.firstName ?? ''
  const displayLastName = profile?.lastName ?? null
  const displayName =
    formatFullName(displayFirstName, displayLastName) ||
    profile?.email?.split('@')[0] ||
    (isAdmin ? 'Admin' : 'Membre')
  const email = profile?.email ?? ''

  const sessionDotColor = isCritical
    ? 'bg-red-500'
    : isExpiringSoon
      ? 'bg-orange-500'
      : 'bg-green-500'

  const handleSave = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isDirty || phoneInvalid || updateMutation.isPending) return
    try {
      const updated = await updateMutation.mutateAsync({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() ? lastName.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
        profession: profession.trim() ? profession.trim() : null,
        informations: informations.trim() ? informations.trim() : null,
      })
      // MAJ immédiate du state Auth (NavUser sidebar) sans rechargement.
      updateAuthUser({
        firstName: updated.firstName ?? null,
        lastName: updated.lastName ?? null,
        phone: updated.phone ?? null,
      })
      toast.success('Profil mis à jour')
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Échec de la mise à jour du profil'))
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshSession()
      toast.success('Session prolongée')
    } catch {
      toast.error('Échec de la prolongation de la session')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      {isAdmin && (
        <Card className="xl:col-span-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${sessionDotColor}`}
                aria-hidden="true"
              />
              <span className="font-medium">Session active</span>
              <span className="text-muted-foreground">
                · expire dans {formatRemaining(timeRemaining)}
              </span>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4${refreshing ? ' animate-spin' : ''}`} />
              {refreshing ? 'Prolongation…' : 'Prolonger la session'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Carte Profil — formulaire éditable */}
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">Profil</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Vos informations personnelles d'administrateur."
              : 'Vos informations personnelles de membre.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSave}>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {getInitials(displayFirstName || displayName, displayLastName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{displayName}</p>
                {email && (
                  <p className="truncate text-sm text-muted-foreground">{email}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="profile-firstname">Prénom</Label>
                <Input
                  id="profile-firstname"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jean"
                  disabled={isLoading || updateMutation.isPending}
                  maxLength={100}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-lastname">Nom</Label>
                <Input
                  id="profile-lastname"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Dupont"
                  disabled={isLoading || updateMutation.isPending}
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Téléphone</Label>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                disabled={isLoading || updateMutation.isPending}
                aria-invalid={phoneInvalid}
                aria-describedby={phoneInvalid ? 'profile-phone-error' : undefined}
              />
              {phoneInvalid && (
                <p id="profile-phone-error" className="text-xs text-red-600">
                  Format de téléphone invalide (10 à 20 caractères).
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-profession">Profession</Label>
              <Input
                id="profile-profession"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="Enseignant"
                disabled={isLoading || updateMutation.isPending}
                maxLength={150}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-informations">Informations</Label>
              <Textarea
                id="profile-informations"
                value={informations}
                onChange={(e) => setInformations(e.target.value)}
                placeholder="Notes libres (disponibilités, compétences…)"
                disabled={isLoading || updateMutation.isPending}
                rows={3}
                maxLength={5000}
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              type="submit"
              disabled={!isDirty || phoneInvalid || updateMutation.isPending || isLoading}
            >
              {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Colonne droite — Compte, puis SecurityPanel (admin uniquement) */}
      <div className="space-y-6">
        {/* Carte Compte */}
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-xl">Compte</CardTitle>
            <CardDescription>
              {isAdmin ? 'Identité de connexion et rôle.' : 'Identité de connexion.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={email} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                Identifiant de connexion (magic-link), non modifiable.
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-x-10 gap-y-3">
              {isAdmin && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Rôle</p>
                  <Badge variant="info" size="md">Administrateur</Badge>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">Membre depuis</p>
                <p className="text-sm text-muted-foreground">{formatDate(profile?.createdAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isAdmin && <SecurityPanel />}
        {isAdmin && <EncryptionKeyPanel />}
      </div>
    </div>
  )
}
