import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertTriangle, KeyRound, Shield, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getRecoveryCodesStatus,
  regenerateCodes,
  type RecoveryCodesStatus,
} from '@/services/recovery.service'
import { formatCountdown } from '@/lib/format'

const RECOVERY_CODES_QUERY_KEY = ['admin', 'recovery-codes', 'status'] as const
const REGEN_WINDOW_MS = 24 * 60 * 60 * 1000
const MODAL_LIFETIME_MS = 10 * 60 * 1000


function formatRetryAfter(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  if (hours > 0) return `${hours}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`
  return 'quelques instants'
}

function RemainingBadge({ remaining }: { remaining: number }) {
  if (remaining === 0) {
    return <Badge variant="error" size="md">Aucun code</Badge>
  }
  if (remaining <= 2) {
    return (
      <Badge variant="warning" size="md">
        {remaining} code{remaining > 1 ? 's' : ''} restant{remaining > 1 ? 's' : ''}
      </Badge>
    )
  }
  return (
    <Badge variant="success" size="md">
      {remaining} codes restants
    </Badge>
  )
}

interface CodesDisplayModalProps {
  codes: string[] | null
  onClose: () => void
}

function CodesDisplayModal({ codes, onClose }: CodesDisplayModalProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Timer starts on first interaction inside the modal — scroll, keydown, or
  // mouse activity. Prevents codes disappearing while admin is reading.
  useEffect(() => {
    if (!codes) return
    const node = modalRef.current
    if (!node) return
    const handler = () => {
      if (remainingMs === null) setRemainingMs(MODAL_LIFETIME_MS)
    }
    node.addEventListener('keydown', handler)
    node.addEventListener('scroll', handler, true)
    node.addEventListener('mousedown', handler)
    return () => {
      node.removeEventListener('keydown', handler)
      node.removeEventListener('scroll', handler, true)
      node.removeEventListener('mousedown', handler)
    }
  }, [codes, remainingMs])

  useEffect(() => {
    if (remainingMs === null || !codes) return
    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev === null) return prev
        const next = prev - 1000
        if (next <= 0) {
          onClose()
          return null
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [remainingMs, codes, onClose])

  const handleCopy = async () => {
    if (!codes) return
    if (remainingMs === null) setRemainingMs(MODAL_LIFETIME_MS)
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast.success('Codes copiés dans le presse-papiers')
    } catch {
      toast.error('Impossible de copier — sélectionnez et copiez manuellement.')
    }
  }

  return (
    <Dialog open={codes !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={modalRef}
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600" aria-hidden="true" />
            Vos codes de secours
          </DialogTitle>
          <DialogDescription>
            Conservez ces codes en lieu sûr. Ils ne seront plus affichés.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-4 space-y-1 font-mono text-sm">
          {codes?.map((c) => (
            <code key={c} className="block py-1 tracking-wider">{c}</code>
          ))}
        </div>

        <Banner variant="warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <BannerDescription>
            Évitez de photographier cet écran — préférez un gestionnaire de mots de passe ou une
            note papier sécurisée.
          </BannerDescription>
        </Banner>

        {remainingMs !== null && (
          <p className="text-xs text-gray-500 text-center">
            Ce panneau se fermera dans {formatCountdown(remainingMs)}.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCopy}>Copier</Button>
          <Button onClick={onClose}>J'ai noté mes codes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SecurityPanel() {
  const queryClient = useQueryClient()

  const { data: status, isLoading, isError } = useQuery<RecoveryCodesStatus>({
    queryKey: RECOVERY_CODES_QUERY_KEY,
    queryFn: getRecoveryCodesStatus,
    staleTime: 30_000,
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingCodes, setPendingCodes] = useState<string[] | null>(null)
  const [inlineRateLimitError, setInlineRateLimitError] = useState<string | null>(null)

  const regenerateMutation = useMutation({
    mutationFn: regenerateCodes,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: RECOVERY_CODES_QUERY_KEY })
      setPendingCodes(result.codes)
      setConfirmOpen(false)
      setInlineRateLimitError(null)
    },
    onError: (err) => {
      setConfirmOpen(false)
      const axErr = err as AxiosError<{ code?: string; retryAfterMs?: number }>
      if (axErr.response?.status === 429) {
        const retry = axErr.response.data?.retryAfterMs ?? REGEN_WINDOW_MS
        setInlineRateLimitError(
          `Vous avez déjà régénéré vos codes récemment. Réessayez dans ${formatRetryAfter(retry)}.`
        )
        return
      }
      toast.error('Erreur lors de la génération des codes.')
    },
  })


  const handleGenerate = () => {
    setInlineRateLimitError(null)
    regenerateMutation.mutate()
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">Codes de secours</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </CardContent>
      </Card>
    )
  }

  if (isError || !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">Codes de secours</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Impossible de charger l'état des codes.</p>
        </CardContent>
      </Card>
    )
  }

  const expiryLabel = status.expiresAt
    ? format(new Date(status.expiresAt), "d MMMM yyyy", { locale: fr })
    : null

  // Admin has never generated codes (pre-existing admin, bootstrap admin, or
  // codes backfill hasn't run). Show a first-time CTA instead of the alarming
  // "Aucun code" destructive badge.
  const isFirstTime = status.remaining === 0 && status.lastGeneratedAt === null

  if (isFirstTime) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-xl">Codes de secours</CardTitle>
            <CardDescription>
              Ces codes à usage unique vous permettent de vous reconnecter à TimePick si vous ne
              recevez plus les emails de connexion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="info" role="status" data-testid="recovery-first-time-notice">
              <Shield className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                Aucun code de secours n'a encore été généré pour votre compte. Générez-en maintenant
                pour sécuriser l'accès en cas d'indisponibilité du service email.
              </AlertDescription>
            </Alert>


            <div className="flex justify-end">
              <Button
                onClick={handleGenerate}
                disabled={regenerateMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="recovery-first-time-generate"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Générer mes codes de secours
              </Button>
            </div>
          </CardContent>
        </Card>

        <CodesDisplayModal
          codes={pendingCodes}
          onClose={() => setPendingCodes(null)}
        />
      </>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">Codes de secours</CardTitle>
          <CardDescription>
            Ces codes à usage unique vous permettent de vous reconnecter à TimePick si vous ne
            recevez plus les emails de connexion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <RemainingBadge remaining={status.remaining} />
            {expiryLabel && (
              <span className="text-sm text-muted-foreground">
                Expire le <span className="font-medium text-foreground">{expiryLabel}</span>
              </span>
            )}
          </div>


          {inlineRateLimitError && (
            <Alert variant="warning" role="alert">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{inlineRateLimitError}</AlertDescription>
            </Alert>
          )}

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-end">
              <Button
                variant="outline-destructive"
                onClick={() => { setInlineRateLimitError(null); setConfirmOpen(true) }}
                disabled={regenerateMutation.isPending}
                className="w-full sm:w-auto"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Régénérer les codes
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Invalide immédiatement tous les codes existants. Nécessite une confirmation.
            </p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Régénérer les codes de secours ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous vos codes actuels seront immédiatement invalidés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerateMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={regenerateMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                regenerateMutation.mutate()
              }}
            >
              {regenerateMutation.isPending ? 'Génération…' : 'Régénérer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CodesDisplayModal
        codes={pendingCodes}
        onClose={() => setPendingCodes(null)}
      />
    </>
  )
}
