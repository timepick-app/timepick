import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { Info } from 'lucide-react'

interface Props {
  fingerprint: string
  onDone: () => void
}

/**
 * Étape informative de l'assistant d'installation, affichée uniquement quand
 * la clé de chiffrement provient d'un fichier généré (`source === 'file'`).
 * N'affiche JAMAIS la clé brute — seulement son empreinte non réversible.
 */
export function SetupEncryptionKeyStep({ fingerprint, onDone }: Props) {
  const titleRef = useRef<HTMLElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  return (
    <div className="space-y-6">
      <Typography
        ref={titleRef}
        as="h2"
        variant="h3"
        tabIndex={-1}
        className="outline-none"
      >
        Clé de chiffrement générée
      </Typography>

      <Typography variant="body" color="muted">
        Une clé de chiffrement a été générée automatiquement pour protéger vos secrets
        (notamment le mot de passe SMTP). Elle est enregistrée sur le serveur, dans le fichier{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">server/data/encryption.key</code>.
      </Typography>

      <div className="space-y-1">
        <Typography variant="body-sm" className="font-medium">Empreinte</Typography>
        <code
          data-testid="encryption-key-fingerprint"
          className="block rounded bg-muted px-2 py-1 font-mono text-sm break-all"
        >
          {fingerprint}
        </code>
      </div>

      <Banner variant="info" role="status">
        <Info aria-hidden="true" />
        <BannerDescription>
          Un volume persistant est requis pour conserver cette clé entre les redémarrages du
          serveur. Une sauvegarde et une copie complète de la clé sont disponibles dans votre
          profil une fois connecté. En cas de perte de cette clé, la configuration SMTP devra
          être ressaisie.
        </BannerDescription>
      </Banner>

      <div className="flex flex-wrap justify-end gap-2 max-sm:[&>button]:flex-1">
        <Button type="button" onClick={onDone} data-testid="encryption-key-continue-btn">
          Continuer
        </Button>
      </div>
    </div>
  )
}
