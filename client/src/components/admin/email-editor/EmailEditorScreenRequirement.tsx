import { Typography } from '@/components/ui/typography'

/**
 * Ce qui remplace le bouton « Personnaliser avec l'éditeur » sur un appareil
 * qui ne pourra jamais afficher l'éditeur (cf. `canDeviceDisplayEmailEditor`).
 *
 * Le bouton est retiré, pas grisé : un bouton inactif ne promet rien, un bouton
 * actif qui mène à une impasse trahit. L'explication qui prend sa place n'est
 * pas une action neutralisée — c'est le contraire d'une promesse non tenue.
 *
 * Trois intentions dans la formulation, à préserver si le texte est retouché :
 * « quelle que soit son orientation » dit que pivoter ne servira à rien — c'est
 * ce qui distingue ce message d'un simple « écran trop étroit » ; la mention du
 * zoom est la porte de sortie du seul faux positif connu ; et rien n'est promis
 * qui n'existe pas — ne pas écrire « vous pouvez toujours envoyer un test »,
 * cette capacité n'existe pas hors de l'éditeur.
 *
 * Titre rendu en `<p>` et non en balise de titre : ce bloc est monté dans trois
 * fiches dont les hiérarchies diffèrent (carte titrée en h3, page titrée en
 * h2), un niveau en dur y serait faux quelque part.
 */
export const EmailEditorScreenRequirement = () => (
  <div className="space-y-1" data-testid="email-editor-screen-requirement">
    <Typography variant="h4" as="p" weight="semibold">
      Composer un e-mail demande un écran plus grand
    </Typography>
    <Typography variant="body-sm" color="muted">
      Cet appareil ne peut pas afficher l&apos;éditeur, quelle que soit son
      orientation. Utilisez un ordinateur ou une tablette. (Sur ordinateur,
      vérifiez aussi le zoom de votre navigateur.)
    </Typography>
  </div>
)
