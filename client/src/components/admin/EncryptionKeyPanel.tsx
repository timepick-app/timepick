import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Copy, Check, KeyRound, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Banner, BannerDescription } from '@/components/ui/banner'
import {
  getAdminEncryptionKey,
  revealEncryptionKey,
  type AdminEncryptionKeyStatus,
} from '@/services/encryption-key.service'

const ENCRYPTION_KEY_QUERY_KEY = ['admin', 'encryption-key'] as const

/**
 * Copie une valeur dans le presse-papiers avec repli `document.execCommand`
 * pour les navigateurs/anciens contextes sans Clipboard API (voir
 * `EventDetailsTab.tsx` pour le pattern d'origine).
 */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const textArea = document.createElement('textarea')
    textArea.value = value
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(textArea)
    }
  }
}

export function EncryptionKeyPanel() {
  const { data: status, isLoading, isError } = useQuery<AdminEncryptionKeyStatus>({
    queryKey: ENCRYPTION_KEY_QUERY_KEY,
    queryFn: getAdminEncryptionKey,
    staleTime: 30_000,
  })

  const [revealed, setRevealed] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const keyInputRef = useRef<HTMLInputElement>(null)

  const revealMutation = useMutation({
    mutationFn: revealEncryptionKey,
    onSuccess: (result) => {
      setRevealedKey(result.key)
    },
  })

  useEffect(() => {
    if (revealedKey) {
      keyInputRef.current?.focus()
    }
  }, [revealedKey])

  const handleToggleReveal = () => {
    // Hide also drops the plaintext key from state + mutation cache so it does
    // not linger in the JS heap / React DevTools longer than the admin views it.
    if (revealed && !revealMutation.isError) {
      setRevealed(false)
      setRevealedKey(null)
      revealMutation.reset()
      return
    }
    setRevealed(true)
    if (!revealedKey) {
      revealMutation.mutate()
    }
  }

  const handleCopy = async () => {
    if (!revealedKey) return
    const ok = await copyToClipboard(revealedKey)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Impossible de copier — sélectionnez et copiez manuellement.')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">Clé de chiffrement</CardTitle>
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
          <CardTitle as="h2" className="text-xl">Clé de chiffrement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Impossible de charger l'état de la clé de chiffrement.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-xl">Clé de chiffrement</CardTitle>
        <CardDescription>
          Cette clé protège vos secrets (notamment le mot de passe SMTP) au repos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Empreinte</Label>
          <code className="block rounded bg-muted px-2 py-1 font-mono text-sm break-all" data-testid="encryption-key-fingerprint">
            {status.fingerprint}
          </code>
        </div>

        {status.source === 'env' && (
          <p className="text-sm text-muted-foreground">
            Cette clé est gérée via une variable d'environnement (ENCRYPTION_KEY).
          </p>
        )}

        {status.source === 'file' && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                aria-expanded={revealed}
                onClick={handleToggleReveal}
                disabled={revealMutation.isPending}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {revealed && !revealMutation.isError ? 'Masquer la clé' : 'Révéler la clé'}
              </Button>
            </div>

            {revealed && revealMutation.isPending && (
              <p className="text-sm text-muted-foreground">Chargement de la clé…</p>
            )}

            {revealed && revealMutation.isError && (
              <p className="text-sm text-destructive">Impossible de révéler la clé.</p>
            )}

            {revealed && revealedKey && (
              <div className="flex gap-2">
                <Input
                  ref={keyInputRef}
                  readOnly
                  value={revealedKey}
                  className="font-mono select-all break-all"
                  onFocus={(e) => e.target.select()}
                  data-testid="encryption-key-revealed"
                />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? 'Copié' : 'Copier'}
                </Button>
              </div>
            )}

            <Banner variant="warning" role="status">
              <AlertTriangle aria-hidden="true" />
              <BannerDescription>
                En cas de perte de cette clé, la configuration SMTP devra être ressaisie. Il est
                recommandé de promouvoir cette clé en variable d'environnement (ENCRYPTION_KEY)
                dans votre plateforme de déploiement — vous pouvez vérifier qu'il s'agit bien de
                la même clé via son empreinte.
              </BannerDescription>
            </Banner>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
