import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import type { MyProfile } from '@/hooks/useMyProfile'
import { ProfileContent } from '../ProfileContent'

// sonner est mocké globalement (src/test/setup.ts) — NE PAS ré-mocker ici.

// ── États pilotés par vi.hoisted (mutables entre tests) ──────────────────────
// Même technique que MemberAgendaPage.test.tsx / MemberProfilePage.test.tsx.

const profileState = vi.hoisted(() => ({
  data: undefined as MyProfile | undefined,
  isLoading: false,
}))

const updateMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}))

const authState = vi.hoisted(() => ({
  role: 'user' as 'user' | 'admin',
  updateAuthUser: vi.fn(),
  refreshSession: vi.fn(),
}))

vi.mock('@/hooks/useMyProfile', () => ({
  useMyProfile: () => ({ data: profileState.data, isLoading: profileState.isLoading }),
  useUpdateMyProfile: () => updateMutation,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { role: authState.role },
    updateAuthUser: authState.updateAuthUser,
    refreshSession: authState.refreshSession,
  }),
}))

vi.mock('@/hooks/useSessionTimeout', () => ({
  useSessionTimeout: () => ({
    timeRemaining: 3600,
    isExpiringSoon: false,
    isCritical: false,
  }),
}))

// Mock via le barrel admin pour correspondre à l'import du composant.
vi.mock('@/components/admin', () => ({
  SecurityPanel: () => <div data-testid="security-panel" />,
  EncryptionKeyPanel: () => <div data-testid="encryption-key-panel" />,
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PROFILE: MyProfile = {
  id: 'user-1',
  email: 'membre@example.com',
  firstName: 'Ancien',
  lastName: 'Nom',
  profession: 'Enseignant',
  informations: 'Dispo le mardi',
  phone: '+33 6 12 34 56 78',
  role: 'user',
  createdAt: '2026-01-15T10:00:00.000Z',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderContent() {
  return render(<ProfileContent />)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  profileState.data = PROFILE
  profileState.isLoading = false
  updateMutation.isPending = false
  updateMutation.mutateAsync.mockResolvedValue(PROFILE)
  authState.role = 'user'
  authState.refreshSession.mockResolvedValue(undefined)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileContent', () => {
  it('préremplis les 5 champs depuis le profil', () => {
    renderContent()
    expect(screen.getByLabelText('Prénom')).toHaveValue('Ancien')
    expect(screen.getByLabelText('Nom')).toHaveValue('Nom')
    expect(screen.getByLabelText('Téléphone')).toHaveValue('+33 6 12 34 56 78')
    expect(screen.getByLabelText('Profession')).toHaveValue('Enseignant')
    expect(screen.getByLabelText('Informations')).toHaveValue('Dispo le mardi')
  })

  it('email est en lecture seule', () => {
    renderContent()
    const emailInput = screen.getByLabelText('Email')
    expect(emailInput).toHaveAttribute('readonly')
    expect(emailInput).toBeDisabled()
  })

  it('save envoie les champs, appelle updateAuthUser puis toast.success', async () => {
    renderContent()
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Nouveau' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        first_name: 'Nouveau',
        last_name: 'Nom',
        phone: '+33 6 12 34 56 78',
        profession: 'Enseignant',
        informations: 'Dispo le mardi',
      })
    )
    expect(authState.updateAuthUser).toHaveBeenCalledWith({
      firstName: PROFILE.firstName ?? null,
      lastName: PROFILE.lastName ?? null,
      phone: PROFILE.phone ?? null,
    })
    expect(toast.success).toHaveBeenCalledWith('Profil mis à jour')
  })

  it('téléphone vidé envoie null', async () => {
    renderContent()
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ phone: null })
      )
    )
  })

  it('téléphone invalide : message annoncé et rattaché au champ', async () => {
    renderContent()
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '123' } })

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/format de téléphone invalide/i)
    )
  })

  describe('ROLE-GATING — admin', () => {
    beforeEach(() => {
      authState.role = 'admin'
    })

    it('affiche la carte Session, le bouton Prolonger, SecurityPanel et le badge Administrateur', () => {
      renderContent()
      expect(screen.getByText('Prolonger la session')).toBeInTheDocument()
      expect(screen.getByText(/Session active/)).toBeInTheDocument()
      expect(screen.getByTestId('security-panel')).toBeInTheDocument()
      expect(screen.getByText('Administrateur')).toBeInTheDocument()
    })

    it('prolongation session appelle refreshSession et affiche toast.success', async () => {
      renderContent()
      fireEvent.click(screen.getByRole('button', { name: 'Prolonger la session' }))
      await waitFor(() => expect(authState.refreshSession).toHaveBeenCalled())
      expect(toast.success).toHaveBeenCalledWith('Session prolongée')
    })
  })

  describe('ROLE-GATING — member (role user)', () => {
    it('masque la carte Session, SecurityPanel et le badge Administrateur', () => {
      renderContent()
      expect(screen.queryByText('Prolonger la session')).not.toBeInTheDocument()
      expect(screen.queryByTestId('security-panel')).not.toBeInTheDocument()
      expect(screen.queryByText('Administrateur')).not.toBeInTheDocument()
    })
  })
})
