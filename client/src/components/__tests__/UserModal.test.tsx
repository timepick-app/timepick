import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserModal } from '../UserModal'
import api from '../../services/api'
import type { User } from '../../types/user'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockedGet = vi.mocked(api.get)

const mockUser: User = {
  id: '123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  phone: '+33612345678',
  role: 'user',
  createdAt: '2026-01-01T00:00:00Z',
  hasMemberAccess: false,
  bookingCount: 2
}

describe('UserModal', () => {
  const mockOnSave = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockedGet.mockResolvedValue({ data: { valid: true, warning: null } })
  })

  describe('Create Mode', () => {
    it('renders create mode title', () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      expect(screen.getByText('Nouveau membre')).toBeInTheDocument()
    })

    it('shows empty form fields in create mode', () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      const emailInput = screen.getByPlaceholderText('membre@example.com')
      expect(emailInput).toHaveValue('')
      expect(emailInput).not.toBeDisabled()
    })

    it('validates email on blur', async () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      const emailInput = screen.getByPlaceholderText('membre@example.com')
      fireEvent.change(emailInput, { target: { value: 'invalid' } })
      fireEvent.blur(emailInput)

      // Description accessible ⇒ le motif est rendu ET rattaché au champ.
      await waitFor(() => {
        expect(emailInput).toHaveAccessibleDescription("Format d'email invalide")
      })
    })

    it('shows error for empty email on submit', async () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      const createButton = screen.getByText('Créer')
      fireEvent.click(createButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('membre@example.com')).toHaveAccessibleDescription(
          "L'email est requis",
        )
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('shows error for empty firstName on submit', async () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      fireEvent.change(screen.getByPlaceholderText('membre@example.com'), { target: { value: 'new@test.com' } })
      fireEvent.click(screen.getByText('Créer'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Jean')).toHaveAccessibleDescription('Le prénom est requis')
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('calls onSave with correct data on valid submit', async () => {
      mockOnSave.mockResolvedValue(undefined)
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )

      fireEvent.change(screen.getByPlaceholderText('membre@example.com'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Jean'), { target: { value: 'New' } })
      fireEvent.change(screen.getByPlaceholderText('Dupont'), { target: { value: 'User' } })
      fireEvent.click(screen.getByText('Créer'))

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          email: 'new@test.com',
          first_name: 'New',
          last_name: 'User',
          phone: undefined,
          role: 'user',
          sendInvitation: true
        })
      })
    })

    it('échec serveur : le message est affiché dans une bannière annoncée', async () => {
      // Forme réelle de POST /admin/users en 409 : message plat + code frère.
      // Seul un code de la liste blanche laisse remonter le message serveur ;
      // c'est ce mécanisme que ce test verrouille.
      mockOnSave.mockRejectedValue({
        response: {
          data: {
            error: 'Un utilisateur avec cet email existe déjà',
            code: 'EMAIL_ALREADY_EXISTS'
          }
        }
      })
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )

      fireEvent.change(screen.getByPlaceholderText('membre@example.com'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Jean'), { target: { value: 'New' } })
      fireEvent.click(screen.getByText('Créer'))

      // role="alert" vient de <Banner> : sans lui, l'échec serveur resterait muet
      // pour un lecteur d'écran (l'ancien <div> n'en portait aucun).
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Un utilisateur avec cet email existe déjà'
        )
      )
    })

    it('selects admin role when clicked', async () => {
      const user = userEvent.setup()
      mockOnSave.mockResolvedValue(undefined)
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )

      fireEvent.change(screen.getByPlaceholderText('membre@example.com'), { target: { value: 'admin@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Jean'), { target: { value: 'Admin' } })
      await user.click(screen.getByLabelText('Administrateur'))
      fireEvent.click(screen.getByText('Créer'))

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }))
      })
    })
  })

  describe('Edit Mode', () => {
    it('renders edit mode title', () => {
      render(
        <UserModal mode="edit" user={mockUser} onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      expect(screen.getByText("Modifier le membre")).toBeInTheDocument()
    })

    it('pre-fills form with user data', () => {
      render(
        <UserModal mode="edit" user={mockUser} onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      expect(screen.getByPlaceholderText('membre@example.com')).toHaveValue('test@example.com')
      expect(screen.getByPlaceholderText('Jean')).toHaveValue('Test')
      expect(screen.getByPlaceholderText('Dupont')).toHaveValue('User')
      expect(screen.getByPlaceholderText('+33 6 12 34 56 78')).toHaveValue('+33612345678')
    })

    it('disables email field in edit mode', () => {
      render(
        <UserModal mode="edit" user={mockUser} onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      expect(screen.getByPlaceholderText('membre@example.com')).toBeDisabled()
    })

    it('shows Enregistrer button in edit mode', () => {
      render(
        <UserModal mode="edit" user={mockUser} onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      expect(screen.getByText('Enregistrer')).toBeInTheDocument()
    })

    it('shows self-demotion dialog when admin demotes themselves to user', async () => {
      const user = userEvent.setup()
      const adminUser: User = { ...mockUser, role: 'admin' }
      const currentUser = { id: adminUser.id, email: adminUser.email, role: 'admin' as const, hasMemberAccess: false }

      render(
        <UserModal
          mode="edit"
          user={adminUser}
          onSave={mockOnSave}
          onClose={mockOnClose}
          currentUser={currentUser}
        />
      )

      // Switch role from admin to user
      await user.click(screen.getByLabelText('Membre'))
      fireEvent.click(screen.getByText('Enregistrer'))

      // Self-demotion dialog should appear, save should NOT be called yet
      await waitFor(() => {
        expect(screen.getByText('Confirmation requise')).toBeInTheDocument()
      })
      expect(mockOnSave).not.toHaveBeenCalled()
    })

    it('rétablit le radio sur le rôle persisté quand la sauvegarde échoue', async () => {
      const user = userEvent.setup()
      const adminUser: User = { ...mockUser, role: 'admin' }
      const currentUser = { id: adminUser.id, email: adminUser.email, role: 'admin' as const, hasMemberAccess: false }
      // Forme réelle de PUT /admin/users/:id en 409 : message plat + code frère
      // `LAST_ADMIN`, qui EST sur la liste blanche — c'est précisément pour rendre
      // ce refus lisible que le code a été ajouté côté serveur.
      mockOnSave.mockRejectedValueOnce({
        response: {
          data: { error: 'Impossible de rétrograder le dernier administrateur', code: 'LAST_ADMIN' }
        }
      })

      render(
        <UserModal
          mode="edit"
          user={adminUser}
          onSave={mockOnSave}
          onClose={mockOnClose}
          currentUser={currentUser}
        />
      )

      // Bascule admin -> membre, puis confirme l'auto-rétrogradation
      await user.click(screen.getByLabelText('Membre'))
      fireEvent.click(screen.getByText('Enregistrer'))
      await user.click(await screen.findByText('Confirmer'))

      // Le refus du serveur est montrable : c'est lui qui dit POURQUOI, là où le
      // repli générique de l'appelant ne le dirait pas.
      await waitFor(() => {
        expect(
          screen.getByText('Impossible de rétrograder le dernier administrateur')
        ).toBeInTheDocument()
      })
      // Et le radio revient sur Administrateur (état réellement persisté)
      expect(screen.getByLabelText('Administrateur')).toBeChecked()
      expect(screen.getByLabelText('Membre')).not.toBeChecked()
      // La sheet reste ouverte (onClose non appelé)
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('rétablit le radio (chemin direct, autre membre) quand la sauvegarde échoue', async () => {
      // Cas dominant en production : un admin modifie le rôle d'un AUTRE membre.
      // Pas d'auto-rétrogradation (currentUser sans rapport) => aucun dialogue,
      // soumission directe via handleSubmit -> performSubmission.
      const user = userEvent.setup()
      const otherUser: User = { ...mockUser, role: 'user' }
      // Rejet réseau sans code de transport identifiable : repli de l'appelant,
      // jamais le texte technique d'axios (« Network Error »).
      mockOnSave.mockRejectedValueOnce(new Error('Network Error'))

      render(
        <UserModal
          mode="edit"
          user={otherUser}
          onSave={mockOnSave}
          onClose={mockOnClose}
          currentUser={null}
        />
      )

      // Promotion user -> admin, soumission directe (aucun dialogue ne doit apparaître)
      await user.click(screen.getByLabelText('Administrateur'))
      fireEvent.click(screen.getByText('Enregistrer'))

      // Le bandeau d'erreur (repli de l'appelant) s'affiche
      await waitFor(() => {
        expect(
          screen.getByText("L'enregistrement a échoué. Vos modifications sont toujours à l'écran, réessayez.")
        ).toBeInTheDocument()
      })
      expect(screen.queryByText('Network Error')).not.toBeInTheDocument()
      // Aucun dialogue d'auto-rétrogradation sur ce chemin
      expect(screen.queryByText('Confirmation requise')).not.toBeInTheDocument()
      // Le radio revient sur Membre (rôle réellement persisté)
      expect(screen.getByLabelText('Membre')).toBeChecked()
      expect(screen.getByLabelText('Administrateur')).not.toBeChecked()
      // La sheet reste ouverte
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Loading State', () => {
    it('shows loading state on submit', async () => {
      mockOnSave.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )

      fireEvent.change(screen.getByPlaceholderText('membre@example.com'), { target: { value: 'test@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Jean'), { target: { value: 'Test' } })
      fireEvent.click(screen.getByText('Créer'))

      expect(await screen.findByText('Enregistrement...')).toBeInTheDocument()
    })
  })

  describe('Close Modal', () => {
    it('calls onClose when cancel button clicked', () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      fireEvent.click(screen.getByText('Fermer'))
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Email MX validation (create mode)', () => {
    const NO_MX_TEXT = 'Ce domaine ne semble pas accepter les emails. Vérifiez la saisie.'

    it('shows the amber warning when the server flags NO_MX_RECORD', async () => {
      mockedGet.mockResolvedValueOnce({
        data: { valid: true, warning: 'NO_MX_RECORD', domain: 'gmail.con' },
      })
      render(<UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />)

      const emailInput = screen.getByPlaceholderText('membre@example.com')
      fireEvent.change(emailInput, { target: { value: 'alice@gmail.con' } })
      fireEvent.blur(emailInput)

      await waitFor(() => expect(screen.getByText(NO_MX_TEXT)).toBeInTheDocument())
      expect(mockedGet).toHaveBeenCalledWith(
        '/admin/users/validate-email',
        expect.objectContaining({ params: { email: 'alice@gmail.con' } })
      )
    })

    it('keeps the submit button enabled when the warning is shown', async () => {
      mockedGet.mockResolvedValueOnce({
        data: { valid: true, warning: 'NO_MX_RECORD', domain: 'gmail.con' },
      })
      render(<UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />)

      const emailInput = screen.getByPlaceholderText('membre@example.com')
      fireEvent.change(emailInput, { target: { value: 'alice@gmail.con' } })
      fireEvent.blur(emailInput)

      await waitFor(() => expect(screen.getByText(NO_MX_TEXT)).toBeInTheDocument())
      const submitButton = screen.getByRole('button', { name: 'Créer' })
      expect(submitButton).not.toBeDisabled()
    })

    it('does not render anything when the server returns DNS_UNAVAILABLE', async () => {
      mockedGet.mockResolvedValueOnce({
        data: { valid: true, warning: 'DNS_UNAVAILABLE' },
      })
      render(<UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />)

      const emailInput = screen.getByPlaceholderText('membre@example.com')
      fireEvent.change(emailInput, { target: { value: 'alice@gmail.com' } })
      fireEvent.blur(emailInput)

      await waitFor(() => expect(mockedGet).toHaveBeenCalled())
      expect(screen.queryByText(NO_MX_TEXT)).not.toBeInTheDocument()
    })

    it('clears a previous warning when the admin retypes', async () => {
      mockedGet.mockResolvedValueOnce({
        data: { valid: true, warning: 'NO_MX_RECORD', domain: 'gmail.con' },
      })
      render(<UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />)

      const emailInput = screen.getByPlaceholderText('membre@example.com')
      fireEvent.change(emailInput, { target: { value: 'alice@gmail.con' } })
      fireEvent.blur(emailInput)
      await waitFor(() => expect(screen.getByText(NO_MX_TEXT)).toBeInTheDocument())

      fireEvent.change(emailInput, { target: { value: 'alice@gmail.com' } })
      expect(screen.queryByText(NO_MX_TEXT)).not.toBeInTheDocument()
    })

    it('does not call validate-email when the format check fails', () => {
      render(<UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />)

      const emailInput = screen.getByPlaceholderText('membre@example.com')
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } })
      fireEvent.blur(emailInput)

      expect(mockedGet).not.toHaveBeenCalled()
    })

    it('does not call validate-email in edit mode regardless of focus', () => {
      render(
        <UserModal mode="edit" user={mockUser} onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      const emailInput = screen.getByPlaceholderText('membre@example.com')
      fireEvent.blur(emailInput)
      expect(mockedGet).not.toHaveBeenCalled()
    })
  })

  describe('Informations complémentaires (S1)', () => {
    const PROFESSION_PLACEHOLDER = 'Enseignant'
    const INFORMATIONS_PLACEHOLDER = 'Notes libres (disponibilités, compétences…)'

    it('renders profession + informations fields in create mode', () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      expect(screen.getByPlaceholderText(PROFESSION_PLACEHOLDER)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(INFORMATIONS_PLACEHOLDER)).toBeInTheDocument()
    })

    it('keeps the section collapsed by default in create mode', () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      const details = screen.getByText('Informations complémentaires').closest('details')
      expect(details).not.toBeNull()
      expect(details).not.toHaveAttribute('open')
    })

    it('opens the section by default in edit mode when profession is set', () => {
      const userWithProfession: User = { ...mockUser, profession: 'Médecin', phone: null }
      render(
        <UserModal
          mode="edit"
          user={userWithProfession}
          onSave={mockOnSave}
          onClose={mockOnClose}
          currentUser={null}
        />
      )
      const details = screen.getByText('Informations complémentaires').closest('details')
      expect(details).not.toBeNull()
      expect(details).toHaveAttribute('open')
    })

    it('submits profession + informations in the create payload', async () => {
      mockOnSave.mockResolvedValue(undefined)
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )

      fireEvent.change(screen.getByPlaceholderText('membre@example.com'), {
        target: { value: 'prof@test.com' },
      })
      fireEvent.change(screen.getByPlaceholderText('Jean'), {
        target: { value: 'Prof' },
      })
      fireEvent.change(screen.getByPlaceholderText(PROFESSION_PLACEHOLDER), {
        target: { value: 'Enseignant' },
      })
      fireEvent.change(screen.getByPlaceholderText(INFORMATIONS_PLACEHOLDER), {
        target: { value: 'Disponible le mercredi' },
      })
      fireEvent.click(screen.getByText('Créer'))

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'prof@test.com',
            profession: 'Enseignant',
            informations: 'Disponible le mercredi',
          })
        )
      })
    })

    it('wires labels to their fields for a11y (Profession input + Informations textarea)', () => {
      render(
        <UserModal mode="create" onSave={mockOnSave} onClose={mockOnClose} currentUser={null} />
      )
      expect(screen.getByLabelText('Profession').tagName).toBe('INPUT')
      expect(screen.getByLabelText('Informations').tagName).toBe('TEXTAREA')
    })
  })
})

