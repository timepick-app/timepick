import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { useImportUsers } from '@/hooks/useImportUsers'
import type { ImportResult } from '@/types/user'

interface ImportUsersDialogProps {
  disabled?: boolean
}

export function ImportUsersDialog({ disabled }: ImportUsersDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [sendInvitation, setSendInvitation] = useState(false)
  const { preview: previewMutation, commit } = useImportUsers()

  const reset = () => {
    setFile(null)
    setPreview(null)
    setSendInvitation(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    try {
      const result = await previewMutation.mutateAsync(selected)
      setPreview(result)
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "L'analyse du fichier a échoué. Aucune donnée n'a été importée, choisissez un autre fichier."
        )
      )
      reset()
    }
  }

  const handleConfirm = async () => {
    if (!file) return
    try {
      const result = await commit.mutateAsync({ file, sendInvitation })
      const invitedMsg = result.summary.invited > 0 ? ` (${result.summary.invited} invitation(s))` : ''
      toast.success(
        `Import réussi : ${result.summary.created} créé(s)${invitedMsg}, ${result.summary.updated} mis à jour`
      )
      if (sendInvitation && result.summary.invited < result.summary.created) {
        toast.warning(
          `${result.summary.created - result.summary.invited} invitation(s) non envoyée(s) — vérifiez la configuration SMTP.`
        )
      }
      reset()
    } catch (err) {
      const importError = err as { response?: { data?: ImportResult } }
      if (importError.response?.data?.summary) {
        // R8 — un seul canal : la liste inline (`hasErrors`, ligne ~119, `role="alert"`)
        // annonce déjà cet échec, ligne par ligne. Pas de toast en plus.
        setPreview(importError.response.data as ImportResult)
      } else {
        toast.error(
          userFacingErrorMessage(
            err,
            "L'import a échoué. Aucun membre n'a été importé, corrigez le fichier et réessayez."
          )
        )
      }
    }
  }

  const hasErrors = (preview?.summary.errors ?? 0) > 0
  const hasCreates = (preview?.summary.created ?? 0) > 0

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFile}
        data-testid="import-file-input"
      />
      <Button
        variant="outline"
        disabled={disabled || previewMutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload />
        Import CSV
      </Button>

      {preview && (
        <AlertDialog open onOpenChange={(o) => { if (!o) reset() }}>
          <AlertDialogContent className="sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Aperçu de l'import</AlertDialogTitle>
              <AlertDialogDescription>
                {preview.summary.created} à créer, {preview.summary.updated} à mettre à jour,{' '}
                {preview.summary.errors} erreur(s) sur {preview.summary.total} ligne(s).
              </AlertDialogDescription>
            </AlertDialogHeader>

            {hasErrors && (
              <ul className="max-h-48 overflow-auto text-sm text-destructive space-y-1" role="alert">
                {preview.rows.filter((r) => r.action === 'error').map((r) => (
                  <li key={r.line}>Ligne {r.line} ({r.email || '—'}) : {r.error}</li>
                ))}
              </ul>
            )}

            {!hasErrors && hasCreates && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="send-invitation"
                  checked={sendInvitation}
                  onCheckedChange={(v) => setSendInvitation(v === true)}
                />
                <label htmlFor="send-invitation" className="text-sm cursor-pointer">
                  Envoyer une invitation par e-mail aux nouveaux membres
                </label>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={commit.isPending}>Annuler</AlertDialogCancel>
              <Button onClick={handleConfirm} disabled={hasErrors || commit.isPending}>
                {commit.isPending ? 'Import...' : "Confirmer l'import"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
