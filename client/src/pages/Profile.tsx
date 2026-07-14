import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ProfileContent } from '@/components/profile/ProfileContent'
import { Typography } from '@/components/ui/typography'

/** Profile — page profil de l'admin (`/admin/profile`). Chrome admin + garde d'auth ;
 *  le contenu (role-aware) est rendu par <ProfileContent/>, partagé avec /me/profile. */
export default function Profile() {
  const { isAuthChecked } = useAdminAuth()
  useDocumentTitle({ title: 'Profil' })

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Typography color="muted">Chargement...</Typography>
      </div>
    )
  }

  return (
    <AdminLayout>
      <ProfileContent />
    </AdminLayout>
  )
}
