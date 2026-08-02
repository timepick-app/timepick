import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import type { ImportResult } from '../types/user'

async function postImport(file: File, dryRun: boolean, sendInvitation = false): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  // Laisser axios poser le boundary multipart (ne PAS forcer Content-Type).
  // `sendInvitation` déclenche un envoi SÉQUENTIEL (for-loop, PAS de
  // Promise.allSettled — cf. user-import.service.ts) : une invitation après
  // l'autre, chacune via le transport SMTP mutualisé. Contrairement à l'envoi
  // en masse (parallèle), le temps total croît linéairement avec le nombre de
  // lignes créées ; un import de quelques dizaines d'utilisateurs avec
  // invitation peut donc légitimement dépasser les 60 s par défaut.
  const res = await api.post('/admin/users/import', formData, {
    params: { dryRun, sendInvitation },
    timeout: 300_000,
  })
  return res.data as ImportResult
}

/**
 * preview : aperçu (dryRun=true, aucune écriture).
 * commit  : import réel (+ invitation optionnelle) ; invalide la liste des membres au succès.
 * NB : sur 422 (erreurs de validation), axios rejette ; le rapport est dans
 * `error.response.data` (ImportResult) — exploité par le composant appelant.
 */
export const useImportUsers = () => {
  const queryClient = useQueryClient()
  const preview = useMutation({ mutationFn: (file: File) => postImport(file, true) })
  const commit = useMutation({
    mutationFn: (vars: { file: File; sendInvitation: boolean }) =>
      postImport(vars.file, false, vars.sendInvitation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
  return { preview, commit }
}
