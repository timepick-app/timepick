import api, { type ApiResponse } from './api'

/**
 * Client-side mirror of `server/src/services/shell-resolver.service.ts`.
 * Duplicated (quelques lignes) rather than shared because TimePick has no
 * client/server shared package today; drift is detected by integration smoke
 * + tsc on the controller envelope shape. (Story 26-2 decision Q5.)
 *
 * Plan 1 du 2026-05-22 — `mjBody` ajouté pour exposer la cascade des attributs
 * du <mj-body> racine. Consommé par `wrapBodyForEditing` et par l'orchestrateur
 * de save (4ᵉ leg) — mêmes priorités cascade que header/footer.
 */
export type BlockOrigin = 'event' | 'template' | 'brand' | 'hardcoded'

interface ResolvedBlock {
  contentMjml: string
  origin: BlockOrigin
}

interface ResolvedMjBodyAttrs {
  backgroundColor: string
  paddingTop: string
  paddingBottom: string
}

interface ResolvedMjBody {
  attrs: ResolvedMjBodyAttrs
  origin: BlockOrigin
}

// Plan carte-éditable (2026-06-08) — le content-wrapper (« carte » du corps)
// résolu en cascade γ. Déjà expédié sur le fil par le contrôleur serveur
// (editor-context.controller) ; ce champ déclare enfin sa lecture côté client.
interface ResolvedContentWrapper {
  contentMjml: string
  origin: BlockOrigin
}

export interface ResolvedShell {
  header: ResolvedBlock
  body: ResolvedBlock
  footer: ResolvedBlock
  mjBody: ResolvedMjBody
  contentWrapper: ResolvedContentWrapper | null
}

export type EditorOwnerKind = 'brand' | 'template' | 'event'

export interface GetEditorContextParams {
  ownerKind: EditorOwnerKind
  ownerId: string
  templateKey: string
}

export const getEditorContext = async (
  params: GetEditorContextParams,
): Promise<ResolvedShell> => {
  const { data } = await api.get<ApiResponse<ResolvedShell>>('/admin/editor-context', {
    params,
  })
  return data.data
}
