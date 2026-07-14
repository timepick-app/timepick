import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { ExportButton } from '../ExportButton'
import api from '@/services/api'
import { toast } from '../../../services/toast.service'

vi.mock('@/services/api', () => ({
  default: { get: vi.fn() }
}))

describe('ExportButton', () => {
  const mockEventId = 'test-event-123'

  const mockApiSuccess = () => {
    ;(api.get as unknown as Mock).mockResolvedValue({
      data: new Blob(['csv content'], { type: 'text/csv' }),
      headers: { 'content-disposition': 'attachment; filename="2026-01-21-utilisateurs.csv"' }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Export réservations (existant)', () => {
    it('affiche le bouton avec le texte visible', () => {
      render(<ExportButton eventId={mockEventId} exportType="reservations" />)

      expect(screen.getByText('Export CSV')).toBeVisible()
      expect(screen.getByRole('button')).toBeVisible()
    })

    it('est désactivé si la prop disabled est true', () => {
      render(<ExportButton eventId={mockEventId} exportType="reservations" disabled />)

      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('est un élément button', () => {
      render(<ExportButton eventId={mockEventId} exportType="reservations" />)

      expect(screen.getByRole('button').tagName).toBe('BUTTON')
    })

    it("appelle l'API réservations avec le bon chemin et responseType blob", async () => {
      mockApiSuccess()

      render(<ExportButton eventId={mockEventId} exportType="reservations" />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled()
      })

      const mockGet = api.get as unknown as Mock
      const [url, options] = mockGet.mock.calls[0] as [string, { params: Record<string, string>; responseType: string }]
      expect(url).toBe('/admin/events/test-event-123/export/reservations')
      expect(options.responseType).toBe('blob')
    })
  })

  describe('Export utilisateurs (nouveau)', () => {
    it("utilise les filtres actuels pour l'export utilisateurs", async () => {
      mockApiSuccess()

      render(<ExportButton exportType="users" filters={{ search: 'marie', role: 'user' }} />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled()
      })

      const mockGet = api.get as unknown as Mock
      const [url, options] = mockGet.mock.calls[0] as [string, { params: Record<string, string>; responseType: string }]
      expect(url).toBe('/admin/users/export')
      expect(options.params.search).toBe('marie')
      expect(options.params.role).toBe('user')
      expect(options.responseType).toBe('blob')
    })

    it("gère l'export utilisateurs sans filtres", async () => {
      mockApiSuccess()

      render(<ExportButton exportType="users" />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled()
      })

      const mockGet = api.get as unknown as Mock
      const [url, options] = mockGet.mock.calls[0] as [string, { params: Record<string, string>; responseType: string }]
      expect(url).toBe('/admin/users/export')
      expect(options.params.search).toBeUndefined()
      expect(options.params.role).toBeUndefined()
    })

    it('affiche un toast de succès après export utilisateurs', async () => {
      mockApiSuccess()

      render(<ExportButton exportType="users" />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Export réussi : 2026-01-21-utilisateurs.csv')
      })
    })

    it("affiche un toast d'erreur en cas d'échec de l'export", async () => {
      ;(api.get as unknown as Mock).mockRejectedValue(new Error('network error'))

      render(<ExportButton exportType="users" />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erreur lors de l'export")
      })
    })

    it("remonte le message d'erreur JSON renvoyé par le serveur", async () => {
      const payload = JSON.stringify({ error: 'Quota dépassé' })
      const blob = new Blob([payload], { type: 'application/json' })
      // happy-dom n'implémente pas Blob.text() de façon fiable : on le fournit
      // explicitement pour exercer le parsing JSON de la branche d'erreur axios.
      Object.defineProperty(blob, 'text', { value: () => Promise.resolve(payload), configurable: true })
      ;(api.get as unknown as Mock).mockRejectedValue({ isAxiosError: true, response: { data: blob } })

      render(<ExportButton exportType="users" />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Quota dépassé')
      })
    })

    it('utilise un nom de repli si content-disposition absent', async () => {
      ;(api.get as unknown as Mock).mockResolvedValue({
        data: new Blob(['x'], { type: 'text/csv' }),
        headers: {}
      })

      render(<ExportButton exportType="users" />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringMatching(/^Export réussi : \d{4}-\d{2}-\d{2}-utilisateurs\.csv$/)
        )
      })
    })

    it('est désactivé pendant le chargement', async () => {
      let resolveApi: (value: unknown) => void = () => {}
      ;(api.get as unknown as Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveApi = resolve
        })
      )

      render(<ExportButton exportType="users" />)

      const button = screen.getByRole('button')
      expect(button).not.toBeDisabled()

      fireEvent.click(button)

      expect(screen.getByRole('button')).toBeDisabled()

      resolveApi({
        data: new Blob(['csv'], { type: 'text/csv' }),
        headers: { 'content-disposition': 'attachment; filename="test.csv"' }
      })

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument()
      })
    })

    it('passe les valeurs brutes comme params axios (encodage géré par axios)', async () => {
      mockApiSuccess()

      render(<ExportButton exportType="users" filters={{ search: 'Jean Dupont', role: 'admin' }} />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled()
      })

      const mockGet = api.get as unknown as Mock
      const [url, options] = mockGet.mock.calls[0] as [string, { params: Record<string, string>; responseType: string }]
      expect(url).toBe('/admin/users/export')
      // axios gère l'encodage URL — on asserter les valeurs brutes
      expect(options.params.search).toBe('Jean Dupont')
      expect(options.params.role).toBe('admin')
    })
  })

  describe('Export réservations avec eventId manquant', () => {
    it('affiche une erreur si eventId manquant pour export réservations', async () => {
      render(<ExportButton exportType="reservations" />)
      fireEvent.click(screen.getByText(/Export CSV/))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("ID événement manquant pour l'export")
      })
    })
  })
})
