import { useState } from 'react'
import { isAxiosError } from 'axios'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/services/api'
import { toast } from '../../services/toast.service'

interface ExportButtonProps {
  // Export réservations (nécessite eventId)
  eventId?: string
  // Export utilisateurs ou réservations d'un événement
  exportType: 'reservations' | 'users'
  // Filtres pour l'export utilisateurs
  filters?: {
    search?: string
    role?: 'user' | 'admin'
  }
  disabled?: boolean
}

/**
 * ExportButton Component
 *
 * Permet d'exporter des données en CSV.
 * Le téléchargement se lance automatiquement lors du clic.
 *
 * Utilise l'instance axios partagée (baseURL = /api, token injecté via intercepteur).
 */
export function ExportButton({ eventId, exportType, filters, disabled }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (isExporting) return

    try {
      setIsExporting(true)

      let url: string
      const params: Record<string, string> = {}

      if (exportType === 'users') {
        url = '/admin/users/export'
        if (filters?.search) params.search = filters.search
        if (filters?.role) params.role = filters.role
      } else {
        if (!eventId) {
          toast.error("ID événement manquant pour l'export")
          return
        }
        url = `/admin/events/${eventId}/export/reservations`
      }

      const response = await api.get<Blob>(url, { params, responseType: 'blob' })

      const blob = response.data
      const objectUrl = window.URL.createObjectURL(blob)

      const contentDisposition = response.headers['content-disposition'] as string | undefined
      let filename = `${new Date().toISOString().slice(0, 10)}-${exportType === 'users' ? 'utilisateurs' : 'reservations'}.csv`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) {
          filename = match[1]
        }
      }

      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(objectUrl)

      toast.success(`Export réussi : ${filename}`)

    } catch (error) {
      let message = "Erreur lors de l'export"
      if (isAxiosError(error) && error.response?.data instanceof Blob) {
        try {
          const text = await (error.response.data as Blob).text()
          const parsed = JSON.parse(text) as { error?: string }
          if (parsed.error) message = parsed.error
        } catch {
          // keep generic message
        }
      }
      console.error("Erreur lors de l'export:", error)
      toast.error(message)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={disabled || isExporting}
    >
      {isExporting ? (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
          Génération...
        </>
      ) : (
        <>
          <Download />
          Export CSV
        </>
      )}
    </Button>
  )
}
