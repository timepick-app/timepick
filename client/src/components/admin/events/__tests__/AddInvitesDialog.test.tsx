import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddInvitesDialog } from '../AddInvitesDialog'

const mockSetEventUsers = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/useEvents', () => ({
  useSetEventUsers: () => ({ setEventUsers: mockSetEventUsers, isSetting: false }),
}))

// UserMultiSelect substitué : on n'a besoin que du contrat observable
// (sélection courante affichée + moyen de la modifier).
vi.mock('@/components/admin/UserMultiSelect', () => ({
  UserMultiSelect: ({
    selectedUserIds,
    onSelectionChange,
  }: {
    selectedUserIds: string[]
    onSelectionChange: (ids: string[]) => void
  }) => (
    <div>
      <span data-testid="selection">{selectedUserIds.join(',')}</span>
      <button onClick={() => onSelectionChange([...selectedUserIds, 'u-choisi'])}>
        cocher u-choisi
      </button>
    </div>
  ),
}))

describe('AddInvitesDialog — synchronisation de la sélection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("n'écrase pas la sélection en cours quand la liste serveur change en arrière-plan", () => {
    // `currentSelectedIds` vient de `users.map()` sur useInvitationStatus (polling 60 s,
    // + rafraîchissement au retour d'onglet) : une nouvelle référence arrive à chaque
    // évolution serveur, dialogue ouvert ou non.
    const { rerender } = render(
      <AddInvitesDialog eventId="e1" open onOpenChange={vi.fn()} currentSelectedIds={['u-a']} />
    )
    expect(screen.getByTestId('selection')).toHaveTextContent('u-a')

    fireEvent.click(screen.getByText('cocher u-choisi'))
    expect(screen.getByTestId('selection')).toHaveTextContent('u-a,u-choisi')

    // Rafraîchissement d'arrière-plan : la liste serveur a changé pendant la saisie.
    rerender(
      <AddInvitesDialog
        eventId="e1"
        open
        onOpenChange={vi.fn()}
        currentSelectedIds={['u-a', 'u-ajoute-ailleurs']}
      />
    )

    expect(screen.getByTestId('selection')).toHaveTextContent('u-a,u-choisi')
  })

  it('resynchronise la sélection à chaque réouverture', () => {
    const { rerender } = render(
      <AddInvitesDialog eventId="e1" open onOpenChange={vi.fn()} currentSelectedIds={['u-a']} />
    )
    fireEvent.click(screen.getByText('cocher u-choisi'))
    expect(screen.getByTestId('selection')).toHaveTextContent('u-a,u-choisi')

    rerender(
      <AddInvitesDialog
        eventId="e1"
        open={false}
        onOpenChange={vi.fn()}
        currentSelectedIds={['u-a', 'u-b']}
      />
    )
    rerender(
      <AddInvitesDialog
        eventId="e1"
        open
        onOpenChange={vi.fn()}
        currentSelectedIds={['u-a', 'u-b']}
      />
    )

    expect(screen.getByTestId('selection')).toHaveTextContent('u-a,u-b')
  })
})
