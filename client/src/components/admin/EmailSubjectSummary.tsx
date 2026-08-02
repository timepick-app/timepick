import { Badge } from '@/components/ui/badge'
import { interpolateSubject, type SubjectVariable } from '@/lib/email-subject'

interface EmailSubjectSummaryProps {
  /** Personnalisation persistée, ou `null` = objet d'usine. */
  subject: string | null
  /** Objet d'usine, forme source. */
  defaultSubject: string
  variables: readonly SubjectVariable[]
  'data-testid'?: string
}

/**
 * L'objet courant, en LECTURE SEULE, sur la fiche d'un modèle.
 *
 * Lire l'objet est fréquent, l'écrire est rare : la fiche montre, l'éditeur
 * modifie. Ce n'est pas un doublon de la ligne de l'éditeur — c'est la SEULE
 * façon de lire l'objet sur un appareil que le prédicat de capacité d'écran
 * refuse à l'éditeur.
 *
 * Ne pas en faire un « inventaire » : huit sous-onglets ne se lisent pas d'un
 * coup d'œil, chaque fiche ne montre que le sien.
 */
export const EmailSubjectSummary = ({
  subject,
  defaultSubject,
  variables,
  'data-testid': testId,
}: EmailSubjectSummaryProps) => (
  <div className="space-y-1.5" data-testid={testId}>
    <div className="flex items-center gap-2">
      <h4 className="text-sm font-medium">Objet</h4>
      {/* Même dialecte « Défaut » / « Personnalisé » que la fiche événement —
          une deuxième convention à côté d'une existante est une dette, pas une
          nuance. */}
      <Badge variant={subject !== null ? 'info' : 'default'} size="sm">
        {subject !== null ? 'Personnalisé' : 'Défaut'}
      </Badge>
    </div>
    <p className="text-sm text-muted-foreground">
      {interpolateSubject(subject ?? defaultSubject, variables)}
    </p>
  </div>
)
