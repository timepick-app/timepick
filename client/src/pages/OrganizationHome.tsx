import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { RichTextContent } from '@/components/ui/rich-text-content'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import type { OrganizationSettings } from '@/services/organization.service'

export interface OrganizationHomeProps {
  /** Identité déjà validée par `RootRedirect` (nom non vide, façade activée). */
  organization: OrganizationSettings
}

/**
 * OrganizationHome — façade publique de la racine `/` (chantier A1).
 *
 * Vitrine de **l'organisation** qui héberge l'instance, pas du produit : aucun
 * discours TimePick ici, le marketing produit vit sur `timepick.app` (dépôt
 * séparé). Cf. docs/2026-07-26-note-page-racine-identite-organisation.md §1.
 *
 * Parti pris visuel : même coquille que les vues d'authentification (fond
 * `bg-muted/40`, colonne centrée pleine hauteur) mais **sans Card** — la page
 * n'offre aucune surface de saisie, l'encadrer la ferait lire comme un
 * formulaire de connexion. L'identité pose seule sur le fond ; le CTA unique
 * suit la dérogation D2 du DS (action unique d'un état d'accueil →
 * `justify-center`).
 */
export function OrganizationHome({ organization }: OrganizationHomeProps) {
  const { name, logo, description } = organization
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)

  useDocumentTitle({ title: name })

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-xl space-y-8 text-center">
        {logo && logo !== brokenUrl && (
          // alt="" volontaire : le nom de l'organisation suit immédiatement en
          // <h1>. Un alt descriptif ferait doublon à l'oral (WCAG H67).
          // Une URL périmée (logo supprimé du stockage) retire l'image plutôt
          // que d'afficher l'icône « image cassée » du navigateur ; mémoriser
          // l'URL fautive (et non un booléen) ré-affiche automatiquement un
          // logo redevenu valide quand l'admin en téléverse un nouveau.
          <img
            src={logo}
            alt=""
            data-testid="organization-logo"
            onError={() => setBrokenUrl(logo)}
            className="mx-auto max-h-24 w-auto max-w-full object-contain"
          />
        )}

        <div className="space-y-3">
          <Typography variant="h1" className="text-balance">
            {name}
          </Typography>
          {/* Description : HTML riche re-sanitisé à chaque rendu par
              RichTextContent (qui retourne null si vide). La classe rétablit
              le corps `body-lg` de la façade — le composant rend en text-sm. */}
          <RichTextContent html={description} className="text-body-lg text-balance" />
        </div>

        <div className="flex justify-center">
          <Button asChild>
            <Link to="/login">Se connecter</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
