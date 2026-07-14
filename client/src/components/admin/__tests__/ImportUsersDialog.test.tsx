import { toast } from 'sonner'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ImportUsersDialog } from '../ImportUsersDialog'
import api from '@/services/api'

vi.mock('@/services/api', () => ({ default: { post: vi.fn() } }))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)
const csvFile = () => new File(['email;first_name\nimport-x@x.fr;X'], 'u.csv', { type: 'text/csv' })

describe('ImportUsersDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it("affiche l'aperçu et désactive Confirmer si erreurs", async () => {
    ;(api.post as unknown as Mock).mockResolvedValue({
      data: { summary: { total: 1, created: 0, updated: 0, invited: 0, errors: 1 }, rows: [{ line: 2, email: 'x', action: 'error', error: 'Format de téléphone invalide' }] },
    })
    render(<ImportUsersDialog />, { wrapper })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [csvFile()] } })
    await waitFor(() => expect(screen.getByText(/erreur\(s\)/)).toBeInTheDocument())
    expect(screen.getByText(/Confirmer l'import/)).toBeDisabled()
  })

  it("confirme avec invitation cochée → import réel sendInvitation=true", async () => {
    ;(api.post as unknown as Mock)
      .mockResolvedValueOnce({ data: { summary: { total: 1, created: 1, updated: 0, invited: 0, errors: 0 }, rows: [{ line: 2, email: 'import-x@x.fr', action: 'create' }] } })
      .mockResolvedValueOnce({ data: { summary: { total: 1, created: 1, updated: 0, invited: 1, errors: 0 }, rows: [] } })
    render(<ImportUsersDialog />, { wrapper })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [csvFile()] } })
    await waitFor(() => expect(screen.getByText(/Confirmer l'import/)).toBeEnabled())
    fireEvent.click(screen.getByRole('checkbox')) // cocher l'invitation
    fireEvent.click(screen.getByText(/Confirmer l'import/))
    await waitFor(() => {
      const calls = (api.post as unknown as Mock).mock.calls
      expect(calls[0][2].params).toEqual({ dryRun: true, sendInvitation: false })
      expect(calls[1][2].params).toEqual({ dryRun: false, sendInvitation: true })
    })
  })

  it('422 (avec summary) → rapport réaffiché + toast erreur lignes', async () => {
    ;(api.post as unknown as Mock)
      .mockResolvedValueOnce({ data: { summary: { total: 1, created: 1, updated: 0, invited: 0, errors: 0 }, rows: [] } })
      .mockRejectedValueOnce({ response: { data: { summary: { total: 1, created: 0, updated: 0, invited: 0, errors: 1 }, rows: [{ line: 2, email: 'x', action: 'error', error: 'Téléphone invalide' }] } } })
    render(<ImportUsersDialog />, { wrapper })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [csvFile()] } })
    await waitFor(() => expect(screen.getByText(/Confirmer l'import/)).toBeEnabled())
    fireEvent.click(screen.getByText(/Confirmer l'import/))
    expect(await screen.findByText(/Ligne 2/)).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith("L'import a échoué : corrigez les lignes en erreur")
  })

  it('500 (sans summary) → message serveur, pas « lignes en erreur »', async () => {
    ;(api.post as unknown as Mock)
      .mockResolvedValueOnce({ data: { summary: { total: 1, created: 1, updated: 0, invited: 0, errors: 0 }, rows: [] } })
      .mockRejectedValueOnce({ response: { data: { error: "Erreur lors de l'import" } } })
    render(<ImportUsersDialog />, { wrapper })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [csvFile()] } })
    await waitFor(() => expect(screen.getByText(/Confirmer l'import/)).toBeEnabled())
    fireEvent.click(screen.getByText(/Confirmer l'import/))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erreur lors de l'import"))
    expect(toast.error).not.toHaveBeenCalledWith("L'import a échoué : corrigez les lignes en erreur")
  })

  it('avertissement invitations (Bug 6) → toast.warning si invited < created', async () => {
    ;(api.post as unknown as Mock)
      .mockResolvedValueOnce({ data: { summary: { total: 2, created: 2, updated: 0, invited: 0, errors: 0 }, rows: [] } })
      .mockResolvedValueOnce({ data: { summary: { total: 2, created: 2, updated: 0, invited: 0, errors: 0 }, rows: [] } })
    render(<ImportUsersDialog />, { wrapper })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [csvFile()] } })
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText(/Confirmer l'import/))
    await waitFor(() => expect(toast.warning).toHaveBeenCalled())
    expect((toast.warning as unknown as Mock).mock.calls[0][0]).toContain('2 invitation(s) non envoyée(s)')
  })

  it("erreur d'analyse fichier (M5) → toast erreur + pas d'aperçu", async () => {
    ;(api.post as unknown as Mock)
      .mockRejectedValueOnce({ response: { data: { error: 'En-tête « email » manquant' } } })
    render(<ImportUsersDialog />, { wrapper })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [csvFile()] } })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('En-tête « email » manquant'))
    expect(screen.queryByText(/Aperçu de l'import/)).toBeNull()
  })
})
