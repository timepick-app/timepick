import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DataTable } from '@/components/ui/data-table'
import { getInvitesColumns } from '../invitesColumns'
import type { InvitationStatusUser } from '@/types/invitation'

function makeUser(over: Partial<InvitationStatusUser>): InvitationStatusUser {
  return {
    id: 'u1',
    email: 'u@x.io',
    firstName: 'Jean',
    lastName: 'Dupont',
    phone: null,
    role: 'user',
    selectedAt: '2026-06-10T09:00:00Z',
    invitationStatus: 'pending',
    sentAt: null,
    clickedAt: null,
    firstSentAt: null,
    sendCount: 0,
    ...over,
  }
}

function renderTable(rows: InvitationStatusUser[]) {
  return render(
    <TooltipProvider>
      <DataTable
        columns={getInvitesColumns({ onResend: vi.fn(), onRemove: vi.fn(), isMutating: false })}
        data={rows}
        getRowId={(u) => u.id}
      />
    </TooltipProvider>
  )
}

describe('invitesColumns', () => {
  it('rend le badge de statut au libellé féminin', () => {
    renderTable([
      makeUser({ id: 'a', invitationStatus: 'pending' }),
      makeUser({
        id: 'b',
        invitationStatus: 'clicked',
        sentAt: '2026-06-12T09:00:00Z',
        firstSentAt: '2026-06-12T09:00:00Z',
        clickedAt: '2026-06-13T09:00:00Z',
        sendCount: 1,
      }),
    ])
    expect(screen.getByText('En attente')).toBeInTheDocument()
    expect(screen.getByText('Cliquée')).toBeInTheDocument()
  })

  it('affiche « — » dans Dernier envoi pour un invité jamais envoyé (sendCount 0)', () => {
    renderTable([makeUser({ invitationStatus: 'pending', sendCount: 0, sentAt: null })])
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('affiche l’indicateur de renvoi ↻N uniquement si sendCount > 1', () => {
    renderTable([
      makeUser({
        id: 'once',
        invitationStatus: 'sent',
        sentAt: '2026-06-12T09:00:00Z',
        firstSentAt: '2026-06-12T09:00:00Z',
        sendCount: 1,
      }),
      makeUser({
        id: 'thrice',
        invitationStatus: 'sent',
        sentAt: '2026-06-12T09:00:00Z',
        firstSentAt: '2026-06-10T09:00:00Z',
        sendCount: 3,
      }),
    ])
    // L'invité renvoyé 3× affiche le compteur ; l'invité envoyé 1× ne l'affiche pas.
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
