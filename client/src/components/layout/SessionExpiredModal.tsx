import { Lock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { clearSessionData } from '@/hooks/useSessionTimeout'

// Clés localStorage pour l'authentification
const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

interface SessionExpiredModalProps {
  open: boolean
}

/**
 * SessionExpiredModal - Modal affiché lorsque la session est expirée
 *
 * Informe l'utilisateur que sa session a expiré et propose de se reconnecter.
 * Nettoie le localStorage avant la redirection.
 */
export function SessionExpiredModal({ open }: SessionExpiredModalProps) {
  const handleReconnect = () => {
    // Nettoyer localStorage
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    clearSessionData()

    // Rediriger vers la page de connexion avec message de session expirée
    window.location.href = '/login?reason=session_expired'
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleReconnect() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/20">
              <Lock className="h-6 w-6 text-red-600 dark:text-red-500" />
            </div>
            <DialogTitle className="text-red-600 dark:text-red-500">
              Session expirée
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="text-base py-2">
              <p>
                Votre session a expiré. Vous allez être redirigé vers la page de connexion.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            onClick={handleReconnect}
            size="lg"
          >
            OK - Me connecter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
