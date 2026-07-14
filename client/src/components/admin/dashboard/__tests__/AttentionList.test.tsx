import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AttentionRow } from '../AttentionRow'
import { AttentionList } from '../AttentionList'
import type { AttentionItem } from '@/lib/dashboard'

// useResendUnanswered mocké : on capture `resend` pour asserter l'appel.
const { resend } = vi.hoisted(() => ({ resend: vi.fn() }))
vi.mock('@/hooks/useResendUnanswered', () => ({
  useResendUnanswered: () => ({ resend, isResending: false }),
}))

// Dialog mocké (cf. EventDeleteDialog.test) : Dialog ne rend son contenu que si `open`.
// Le déclencheur est rendu hors du Dialog (dialog contrôlé) et reste donc toujours visible.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    open ? <>{children}</> : null
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('AttentionRow', () => {
  it("rend le contenu et l'action", () => {
    render(<AttentionRow icon={<span>i</span>} action={<button>Agir</button>}>Message</AttentionRow>)
    expect(screen.getByText('Message')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agir' })).toBeInTheDocument()
  })

  it('applique un accent ambre en tone="warning"', () => {
    const { container } = render(
      <AttentionRow icon={null} action={null} tone="warning">Alerte</AttentionRow>,
    )
    expect((container.firstChild as HTMLElement).className).toMatch(/amber/)
  })

  it('reste neutre en tone par défaut', () => {
    const { container } = render(<AttentionRow icon={null} action={null}>Neutre</AttentionRow>)
    expect((container.firstChild as HTMLElement).className).not.toMatch(/amber/)
  })

  it('propage data-testid', () => {
    render(<AttentionRow icon={null} action={null} data-testid="row">x</AttentionRow>)
    expect(screen.getByTestId('row')).toBeInTheDocument()
  })
})

describe('AttentionList', () => {
  const items: AttentionItem[] = [
    { kind: 'draft', message: '2 événements en brouillon — à publier', count: 2, action: 'publish' },
    { kind: 'underfilled', message: '« Gala » : 4 créneaux vacants à venir', eventName: 'Gala', count: 4, eventId: 'e1', action: 'invite' },
  ]

  it("rend une ligne par item avec le bon libellé d'action", () => {
    render(<MemoryRouter><AttentionList items={items} /></MemoryRouter>)
    // Phrase complète conservée comme nom accessible (aria-label) de chaque ligne.
    expect(screen.getByRole('status', { name: '2 événements en brouillon — à publier' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '« Gala » : 4 créneaux vacants à venir' })).toBeInTheDocument()
    // Badge structuré du compte.
    expect(screen.getByText('2 événements en brouillon')).toBeInTheDocument()
    expect(screen.getByText('4 créneaux vacants')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Éditer' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inviter' })).toBeInTheDocument()
  })

  it("lie l'action à l'édition si eventId, sinon à la liste des événements", () => {
    render(<MemoryRouter><AttentionList items={items} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Éditer' })).toHaveAttribute('href', '/admin/events')
    expect(screen.getByRole('link', { name: 'Inviter' })).toHaveAttribute('href', '/admin/events/e1/edit')
  })
})

describe('AttentionList — brouillon unique (avec nom)', () => {
  it("affiche le nom en sujet, badge 'en brouillon', lien vers l'édition", () => {
    const single: AttentionItem[] = [
      { kind: 'draft', message: '« Gala » en brouillon — à publier', count: 1, eventName: 'Gala', eventId: 'e42', action: 'publish' },
    ]
    render(<MemoryRouter><AttentionList items={single} /></MemoryRouter>)
    expect(screen.getByRole('status', { name: '« Gala » en brouillon — à publier' })).toBeInTheDocument()
    expect(screen.getByText('Gala')).toBeInTheDocument()
    expect(screen.getByText('en brouillon')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Éditer' })).toHaveAttribute('href', '/admin/events/e42/edit')
  })

})

describe('AttentionList — unanswered (action directe de relance)', () => {
  beforeEach(() => { resend.mockClear() })

  const unanswered: AttentionItem = {
    kind: 'unanswered',
    eventId: 'e1',
    message: '« Gala » — 3 invitations sans réponse depuis plus de 3 jours',
    eventName: 'Gala',
    count: 3,
    action: 'resend',
  }

  it("rend un bouton « Relancer » et aucun lien", () => {
    render(<MemoryRouter><AttentionList items={[unanswered]} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Relancer' })).not.toBeInTheDocument()
    // Badge du compte + nom accessible de la ligne.
    expect(screen.getByText('3 invitations')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: unanswered.message })).toBeInTheDocument()
  })

  it('ouvre le dialog de confirmation au clic sur « Relancer »', () => {
    render(<MemoryRouter><AttentionList items={[unanswered]} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(screen.getByText('Relancer les invitations ?')).toBeInTheDocument()
    expect(screen.getByText(/renvoyé aux destinataires sans réponse/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })

  it("confirme : passe un onSuccess à resend et ne ferme le dialog qu'au succès", () => {
    render(<MemoryRouter><AttentionList items={[unanswered]} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    // 2 boutons « Relancer » désormais (déclencheur + confirmation) : le dernier est la confirmation.
    const relancerButtons = screen.getAllByRole('button', { name: 'Relancer' })
    fireEvent.click(relancerButtons[relancerButtons.length - 1])
    expect(resend).toHaveBeenCalledTimes(1)
    // La confirmation passe un callback onSuccess (fermeture différée au succès).
    const opts = resend.mock.calls[0][0] as { onSuccess?: () => void } | undefined
    expect(typeof opts?.onSuccess).toBe('function')
    // Pas de fermeture optimiste : le dialog reste ouvert tant que le succès n'est pas signalé.
    expect(screen.getByText('Relancer les invitations ?')).toBeInTheDocument()
    // On simule le succès de la mutation → le dialog se ferme.
    act(() => opts!.onSuccess!())
    expect(screen.queryByText('Relancer les invitations ?')).not.toBeInTheDocument()
  })
})
