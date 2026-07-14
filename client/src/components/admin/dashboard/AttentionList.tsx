import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileEdit, Clock, TrendingDown, Mail } from 'lucide-react'
import type { AttentionItem, AttentionKind } from '@/lib/dashboard'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { useResendUnanswered } from '@/hooks/useResendUnanswered'
import { AttentionRow } from './AttentionRow'

const KIND_META: Record<AttentionKind, { icon: ReactNode; actionLabel: string; badge: BadgeVariant }> = {
  draft: { icon: <FileEdit className="h-3 w-3" aria-hidden="true" />, actionLabel: 'Éditer', badge: 'draft' },
  openingSoon: { icon: <Clock className="h-3 w-3" aria-hidden="true" />, actionLabel: 'Gérer', badge: 'warning' },
  underfilled: { icon: <TrendingDown className="h-3 w-3" aria-hidden="true" />, actionLabel: 'Inviter', badge: 'warning' },
  unanswered: { icon: <Mail className="h-3 w-3" aria-hidden="true" />, actionLabel: 'Relancer', badge: 'warning' },
}

/**
 * Contenu structuré d'une ligne « À traiter » : sujet (medium, sans guillemets) ·
 * Badge iconné du compte (soft — l'icône de catégorie vit DANS le badge, pas de
 * slot icône en tête de ligne) · complément (muted). La phrase complète
 * (`item.message`) est portée par l'`aria-label` de l'`AttentionRow` : les fragments
 * visuels ne forment pas, seuls, un nom accessible exploitable par un lecteur d'écran.
 *
 * `openingSoon` intercale son complément (« ouvre les inscriptions ») entre le
 * sujet et le badge (qui porte alors le délai `detail`).
 */
function AttentionItemContent({ item }: { item: AttentionItem }) {
  const meta = KIND_META[item.kind]
  const sujet = item.eventName ? (
    <Typography variant="body-sm" weight="medium" as="span">{item.eventName}</Typography>
  ) : null

  const c = item.count ?? 0
  let badgeText: string | null = null
  let complement = ''
  switch (item.kind) {
    case 'draft':
      badgeText = item.eventName
        ? 'en brouillon'
        : `${c} événement${c > 1 ? 's' : ''} en brouillon`
      complement = 'à publier'
      break
    case 'openingSoon':
      badgeText = item.detail ?? null
      complement = 'ouvre les inscriptions'
      break
    case 'underfilled':
      badgeText = `${c} créneau${c > 1 ? 'x' : ''} vacant${c > 1 ? 's' : ''}`
      complement = 'à venir'
      break
    case 'unanswered':
      badgeText = `${c} invitation${c > 1 ? 's' : ''}`
      complement = 'sans réponse depuis +3 j'
      break
  }

  const badge = badgeText ? (
    <Badge variant={meta.badge} size="sm" appearance="soft" icon={meta.icon}>{badgeText}</Badge>
  ) : null
  const complementNode = (
    <Typography variant="body-sm" color="muted" as="span">{complement}</Typography>
  )
  const complementBeforeBadge = item.kind === 'openingSoon'

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {sujet}
      {complementBeforeBadge && complementNode}
      {badge}
      {!complementBeforeBadge && complementNode}
    </div>
  )
}

export interface AttentionListProps {
  items: AttentionItem[]
}

/** Ligne « invitations sans réponse » : bouton d'action direct + dialog de confirmation. */
function UnansweredAttentionRow({ eventId, item }: { eventId: string; item: AttentionItem }) {
  const [open, setOpen] = useState(false)
  const { resend, isResending } = useResendUnanswered(eventId)
  const meta = KIND_META['unanswered']
  return (
    <AttentionRow
      aria-label={item.message}
      icon={null}
      action={
        <>
          <Button variant="outline" size="sm" disabled={isResending} onClick={() => setOpen(true)}>
            {meta.actionLabel}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Relancer les invitations ?</DialogTitle>
                <DialogDescription>
                  Un email d'invitation sera renvoyé aux destinataires sans réponse depuis plus de 3 jours pour cet événement.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Annuler</Button>
                </DialogClose>
                <Button disabled={isResending} onClick={() => resend({ onSuccess: () => setOpen(false) })}>
                  {isResending ? 'Relance…' : 'Relancer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <AttentionItemContent item={item} />
    </AttentionRow>
  )
}

/** Alertes génériques calculées (zone « À traiter »), rendues via AttentionRow. */
export function AttentionList({ items }: AttentionListProps) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        // Le kind 'unanswered' porte une action directe (relance) au lieu d'un lien.
        if (item.kind === 'unanswered' && item.eventId) {
          return <UnansweredAttentionRow key={`${item.kind}-${item.eventId ?? i}`} eventId={item.eventId} item={item} />
        }
        const meta = KIND_META[item.kind]
        const to = item.eventId ? `/admin/events/${item.eventId}/edit` : '/admin/events'
        return (
          <AttentionRow
            key={`${item.kind}-${item.eventId ?? i}`}
            aria-label={item.message}
            icon={null}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={to}>{meta.actionLabel}</Link>
              </Button>
            }
          >
            <AttentionItemContent item={item} />
          </AttentionRow>
        )
      })}
    </div>
  )
}
