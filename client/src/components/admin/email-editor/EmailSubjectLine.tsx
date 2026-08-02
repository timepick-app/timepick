import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  MAX_SUBJECT_LENGTH,
  SUBJECT_LENGTH_HINT,
  interpolateSubject,
  normalizeSubject,
  subjectBlockReason,
  type SubjectVariable,
} from '@/lib/email-subject'

/**
 * Ce que la ligne remonte à l'éditeur. Trois choses, et pas une de plus :
 * l'état de modification, le motif qui bloque l'enregistrement, et le fragment
 * de charge utile à fusionner dans le PATCH existant.
 *
 * PAS de `registerSaveHandler` comme `EmailIdentityMenu` : l'objet doit voyager
 * dans la MÊME écriture que le corps, donc il ne s'ouvre pas de branche à lui
 * dans le `Promise.allSettled` de l'enregistrement.
 */
export interface EmailSubjectState {
  /** Le brouillon diffère-t-il de ce qui est persisté ? */
  dirty: boolean
  /** Motif nommant la condition à satisfaire, ou `null` si l'objet est valide. */
  blockReason: string | null
  /** Fragment à fusionner dans le PATCH. Objet vide = rien à écrire. */
  payload: { subject?: string | null; subjectAdmin?: string | null }
}

export const EMPTY_SUBJECT_STATE: EmailSubjectState = {
  dirty: false,
  blockReason: null,
  payload: {},
}

export interface EmailSubjectLineProps {
  /** Personnalisation persistée, ou `null` = pas de personnalisation. */
  subject: string | null
  /**
   * La valeur EN VIGUEUR quand `subject` vaut `null` : l'objet d'usine au
   * niveau modèle, l'objet hérité du modèle au niveau événement. C'est aussi la
   * référence de la règle « un brouillon identique n'est pas une
   * personnalisation » — donc ce que « revenir en arrière » restaure.
   */
  fallbackSubject: string
  /**
   * Le niveau décide du VOCABULAIRE et du régime du popover, pas d'une nuance
   * de rendu : au niveau événement, tant que rien n'est personnalisé, il n'y a
   * PAS de champ — du texte et un bouton « Personnaliser ». La politique de
   * coque l'exige : une action non permise dans le contexte courant est
   * retirée, jamais affichée puis neutralisée.
   */
  level: 'template' | 'event'
  /**
   * `magic_link_login` SEUL. La PRÉSENCE de `fallbackSubjectAdmin` est le
   * prédicat qui fait apparaître le sélecteur de variante.
   */
  subjectAdmin?: string | null
  fallbackSubjectAdmin?: string
  /** Liste publiée par le serveur — jamais reconstruite ici. */
  variables: readonly SubjectVariable[]
  onStateChange: (state: EmailSubjectState) => void
}

type Variant = 'member' | 'admin'

/**
 * L'objet de l'e-mail, en une ligne de 29 px sous la barre d'outils, qui EST le
 * déclencheur de son popover d'édition.
 *
 * POURQUOI UNE LIGNE ET PAS UN BANDEAU-FORMULAIRE. Lire l'objet et l'écrire
 * n'ont ni le même coût ni la même fréquence : on le lit à chaque ouverture de
 * l'éditeur, on l'écrit une poignée de fois dans la vie du produit. Le champ,
 * le compteur, le repère de longueur et l'insertion de variable ne servent que
 * pendant la frappe — ils vivent donc dans le popover et coûtent 0 px au
 * canevas. Décision du PO, 2026-08-01 ; ne pas la rouvrir sans lui.
 *
 * HAUTEUR CONSTANTE PAR CONSTRUCTION, et ce n'est pas une coquetterie :
 * GrapesJS n'observe pas son conteneur, et le canevas est un frère en
 * `flex-1 min-h-0`. Une ligne qui grandit quand le badge apparaît
 * désynchroniserait les poignées et les barres flottantes du canevas — famille
 * de bugs déjà payée deux fois dans ce dossier. D'où une hauteur FIXE (`h-7`,
 * bordure comprise puisque la boîte est en `border-box`) plutôt qu'un padding :
 * le badge fait 20 px, le texte 16, et aucun des deux ne peut pousser la ligne.
 *
 * Mesuré dans l'application réelle à 1280 × 720 le 2026-08-01 : **28 px** de
 * ligne, conteneur de canevas 671 → **643 px** (−4,2 %). Le plan annonçait
 * 29 px et 642 — il comptait la bordure en plus de la hauteur, ce que
 * `border-box` ne fait pas.
 */
export function EmailSubjectLine({
  subject,
  fallbackSubject,
  level,
  subjectAdmin,
  fallbackSubjectAdmin,
  variables,
  onStateChange,
}: EmailSubjectLineProps) {
  const hasAdminVariant = fallbackSubjectAdmin !== undefined

  const [open, setOpen] = useState(false)
  const [variant, setVariant] = useState<Variant>('member')
  const [draft, setDraft] = useState(subject ?? fallbackSubject)
  const [draftAdmin, setDraftAdmin] = useState(subjectAdmin ?? fallbackSubjectAdmin ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  // Niveau ÉVÉNEMENT seulement : le champ n'apparaît qu'après un geste
  // explicite. Tant qu'il est faux, le popover MONTRE l'objet hérité, il ne le
  // propose pas à l'édition — un champ verrouillé serait précisément ce que la
  // politique de coque interdit. Rien à faire au niveau modèle : là, éditer est
  // toujours permis.
  const [customizing, setCustomizing] = useState(subject !== null)

  // Ancres : ce que la base porte AUJOURD'HUI. On ne réaligne le brouillon que
  // lorsque la valeur persistée CHANGE réellement (donc après un
  // enregistrement), jamais à chaque rafraîchissement de requête — sinon un
  // refetch d'arrière-plan effacerait la frappe en cours.
  const persistedRef = useRef({ subject, subjectAdmin })
  useEffect(() => {
    if (persistedRef.current.subject !== subject) {
      persistedRef.current.subject = subject
      setDraft(subject ?? fallbackSubject)
      setCustomizing(subject !== null)
    }
    if (persistedRef.current.subjectAdmin !== subjectAdmin) {
      persistedRef.current.subjectAdmin = subjectAdmin
      setDraftAdmin(subjectAdmin ?? fallbackSubjectAdmin ?? '')
    }
  }, [subject, subjectAdmin, fallbackSubject, fallbackSubjectAdmin])

  // Un brouillon ramené à l'identique de la valeur en vigueur N'EST PAS une
  // personnalisation : on le stocke `null`. Sans ça, un administrateur qui
  // ouvre le popover, regarde l'objet et le referme après une frappe annulée
  // fige une copie — le modèle (ou l'événement) cesse alors de suivre les
  // évolutions de son parent sans que rien ne le signale. Le serveur applique
  // la même règle à l'écriture ; les deux doivent s'accorder.
  const nextValue = useCallback(
    (raw: string, factory: string): string | null => {
      const normalized = normalizeSubject(raw)
      return normalized === normalizeSubject(factory) ? null : normalized
    },
    [],
  )

  const state = useMemo<EmailSubjectState>(() => {
    const nextSubject = nextValue(draft, fallbackSubject)
    const nextAdmin = hasAdminVariant ? nextValue(draftAdmin, fallbackSubjectAdmin!) : undefined

    const payload: EmailSubjectState['payload'] = {}
    if (nextSubject !== subject) payload.subject = nextSubject
    if (hasAdminVariant && nextAdmin !== subjectAdmin) payload.subjectAdmin = nextAdmin

    // Le motif de blocage porte sur les DEUX variantes : enregistrer un objet
    // administrateur invalide parce qu'on regardait l'onglet membre serait la
    // pire des surprises.
    const blockReason =
      subjectBlockReason(draft, variables) ??
      (hasAdminVariant ? subjectBlockReason(draftAdmin, variables) : null)

    return {
      dirty: payload.subject !== undefined || payload.subjectAdmin !== undefined,
      blockReason,
      payload,
    }
  }, [
    draft,
    draftAdmin,
    fallbackSubject,
    fallbackSubjectAdmin,
    hasAdminVariant,
    nextValue,
    subject,
    subjectAdmin,
    variables,
  ])

  useEffect(() => {
    onStateChange(state)
  }, [state, onStateChange])

  const editedDraft = variant === 'admin' ? draftAdmin : draft
  const setEditedDraft = variant === 'admin' ? setDraftAdmin : setDraft
  const editedFallback = variant === 'admin' ? fallbackSubjectAdmin! : fallbackSubject
  const editedPersisted = variant === 'admin' ? subjectAdmin : subject

  const normalizedDraft = normalizeSubject(editedDraft)
  const fieldReason = subjectBlockReason(editedDraft, variables)

  // Second aperçu, calculé sur un destinataire MONONYME : `users.last_name` est
  // nullable (migration 020), auquel cas `emailNameVariables` rend
  // `user_last_name` vide et `user_full_name` réduit au prénom. `null` quand
  // l'objet ne dépend d'aucun jeton de nom, ou quand les deux aperçus
  // coïncident — il n'y a alors rien à montrer de plus.
  const monoNamePreview = useMemo(() => {
    const monoVariables = variables.map((variable) => {
      if (variable.name === 'user_last_name') return { ...variable, previewValue: '' }
      if (variable.name === 'user_full_name') {
        const first = variables.find((v) => v.name === 'user_first_name')
        return { ...variable, previewValue: first?.previewValue ?? '' }
      }
      return variable
    })
    const mono = interpolateSubject(editedDraft, monoVariables)
    return mono === interpolateSubject(editedDraft, variables) ? null : mono
  }, [editedDraft, variables])

  // La ligne montre TOUJOURS la variante membre : c'est celle que reçoit la
  // quasi-totalité des destinataires, et la ligne n'a pas de place pour deux.
  // Le badge « 2 variantes » dit que l'autre existe.
  const lineSource = draft
  const lineText = state.blockReason ?? interpolateSubject(lineSource, variables)
  // Le badge qualifie CE QUI EST AFFICHÉ, donc le brouillon — pas ce que la
  // base porte encore. Sur l'état persisté, la ligne annoncerait
  // « Personnalisé » au-dessus du texte hérité pendant tout l'intervalle entre
  // « revenir au modèle » et l'enregistrement : deux messages contradictoires à
  // la même seconde, sur la même ligne.
  const pendingSubject =
    state.payload.subject !== undefined ? state.payload.subject : subject
  const pendingAdmin =
    state.payload.subjectAdmin !== undefined ? state.payload.subjectAdmin : subjectAdmin
  const isCustomized = pendingSubject !== null || (hasAdminVariant && pendingAdmin != null)
  // Au niveau événement, « pas personnalisé » n'est pas « par défaut » : c'est
  // HÉRITÉ, et le dire compte — l'administrateur doit savoir que modifier le
  // modèle général changera aussi cet e-mail-là.
  const showsInherited = level === 'event' && !isCustomized

  // Insertion à la position du curseur. Trois précautions, chacune payée :
  //  1. la sélection est relevée AVANT que le champ perde le focus (le
  //     `onPointerDown` de l'élément de liste court avant le blur) ;
  //  2. `document.execCommand('insertText')` est journalisé par le navigateur,
  //     donc Ctrl+Z continue de fonctionner — un `setState` ne l'est pas ;
  //  3. repli sur `setState` quand la commande est absente ou échoue : on perd
  //     l'annulation, jamais l'insertion.
  //
  // `execCommand` est DÉPRÉCIÉ : il n'existe pas partout (jsdom ne le porte
  // pas du tout, et un navigateur peut le retirer). L'appeler sans vérifier
  // son existence lève une `TypeError` et fait perdre l'insertion ENTIÈRE, pas
  // seulement l'annulation — c'est le repli qui devient inatteignable. D'où le
  // test d'existence avant l'appel.
  const insertVariable = useCallback(
    (name: string) => {
      const token = `{{${name}}}`
      const field = inputRef.current
      if (!field) {
        setEditedDraft((current) => current + token)
        return
      }
      field.focus()
      if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, token)) {
        return
      }
      const start = field.selectionStart ?? field.value.length
      const end = field.selectionEnd ?? field.value.length
      setEditedDraft(field.value.slice(0, start) + token + field.value.slice(end))
    },
    [setEditedDraft],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Le nom accessible vient du CONTENU : « Objet », l'objet interpolé,
            l'éventuel badge. Ni `aria-label` ni `title` — un `title` portant la
            même chaîne retomberait en description et la ferait annoncer deux
            fois, exactement le défaut corrigé sur les boutons de la barre
            d'outils le 2026-08-01.

            Pas d'`aria-live` non plus : ce texte est recalculé à chaque frappe
            dans le popover, une région live le ferait relire en entier après
            chaque caractère. */}
        <button
          type="button"
          aria-expanded={open}
          className="flex h-7 w-full shrink-0 items-center gap-2 border-b bg-white px-4 text-left text-xs hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          data-testid="email-subject-line"
        >
          <span className="shrink-0 font-medium">Objet</span>
          {/* `title` sur le TEXTE, pas sur le bouton : le nom accessible du
              bouton vient de son contenu, et un `title` porté par le bouton
              retomberait en description annoncée en double. Sur un descendant
              qui a déjà du contenu, il ne sert qu'à l'infobulle native — ce qui
              rend lisible un objet coupé par `truncate` sans ouvrir le
              popover. */}
          {/* Sans `flex-1` : le texte fait la largeur de son contenu, ce qui
              colle le crayon à SA FIN plutôt qu'au bord de l'écran. */}
          <span
            className="min-w-0 truncate text-muted-foreground"
            title={lineText}
            data-testid="email-subject-line-text"
          >
            {lineText}
          </span>
          {/* L'icône passe à l'alerte quand l'objet bloque l'enregistrement.
              La règle du système de design sur les couleurs de texte d'aide
              régit le TEXTE ; une icône n'en est pas une — et aucune teinte
              ambre ici, l'ambre est le vocabulaire du canevas. */}
          {state.blockReason ? (
            <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <Pencil className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          {showsInherited && (
            <Badge variant="default" size="sm" className="shrink-0">
              Hérité du modèle
            </Badge>
          )}
          {isCustomized && (
            <Badge variant="info" size="sm" className="shrink-0">
              Personnalisé
            </Badge>
          )}
          {hasAdminVariant && (
            <Badge variant="default" size="sm" className="shrink-0">
              2 variantes
            </Badge>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[420px]"
        data-testid="email-subject-popover"
        // Sans `preventDefault`, Échap remonte au Dialog parent
        // (MjmlEditorOverlay) et ferme l'ÉDITEUR ENTIER. Garde déjà payée deux
        // fois dans ce dossier — cf. EmailTestSendMenu.
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          setOpen(false)
        }}
        // Radix rend le focus au déclencheur à la fermeture. Ici le déclencheur
        // EST la ligne : le rendu de focus la ferait annoncer en entier après
        // chaque fermeture, et il écraserait tout `focus()` posé ailleurs.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Objet de l&apos;e-mail</h3>

          {level === 'event' && !customizing ? (
            /* ÉTAT HÉRITÉ — du TEXTE, jamais un champ verrouillé. La politique
               de personnalisation de la coque email est catégorique : une
               action non permise dans le contexte courant est RETIRÉE, pas
               affichée puis neutralisée. Il n'y a donc ni champ, ni bouton
               d'insertion de variable — rien à insérer dans ce qui ne s'édite
               pas. Même paire icône/verbe que « Personnaliser ce bloc » du
               panneau d'héritage. */
            <div className="space-y-3" data-testid="email-subject-inherited">
              <p className="text-sm">{interpolateSubject(fallbackSubject, variables)}</p>
              <p className="text-xs text-muted-foreground">
                Cet objet vient du modèle général. Le modifier ici ne concernera
                que cet événement.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCustomizing(true)}
                data-testid="email-subject-customize-btn"
              >
                <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                Personnaliser
              </Button>
            </div>
          ) : (
            <>
              {hasAdminVariant && (
                <div className="space-y-1.5">
                  {/* Deux objets, pas de condition dans le moteur de variables :
                      ce modèle est le seul dans ce cas, et le drapeau qui les
                      départage (rôle du destinataire) n'est pas une variable
                      interpolable. */}
                  <Label className="text-xs font-medium">Destinataire</Label>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={variant}
                    onValueChange={(next) => next && setVariant(next as Variant)}
                    className="justify-start"
                    data-testid="email-subject-variant-toggle"
                  >
                    <ToggleGroupItem value="member">Membre</ToggleGroupItem>
                    <ToggleGroupItem value="admin">Administrateur</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="email-subject-input" className="text-xs font-medium">
                    Objet (source)
                  </Label>
                  <VariableInsertMenu variables={variables} onInsert={insertVariable} />
                </div>
                <Input
                  id="email-subject-input"
                  ref={inputRef}
                  value={editedDraft}
                  onChange={(event) => setEditedDraft(event.target.value)}
                  aria-invalid={fieldReason !== null}
                  aria-describedby={
                    fieldReason ? 'email-subject-error' : 'email-subject-help'
                  }
                  data-testid="email-subject-input"
                  // Opt-out des gestionnaires de mots de passe — motif et
                  // motivation : champ d'arrondi d'`EmailIdentityMenu`.
                  autoComplete="off"
                  data-bwignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                />
                {fieldReason && (
                  <p
                    id="email-subject-error"
                    role="alert"
                    className="text-xs text-destructive"
                    data-testid="email-subject-error"
                  >
                    {fieldReason}
                  </p>
                )}
              </div>

              <div
                id="email-subject-help"
                className="space-y-1 text-xs text-muted-foreground"
                data-testid="email-subject-help"
              >
                <p>
                  <span className="font-medium">Aperçu&nbsp;: </span>
                  {interpolateSubject(editedDraft, variables)}
                </p>
                <p>
                  {normalizedDraft.length} caractère{normalizedDraft.length > 1 ? 's' : ''}
                  {normalizedDraft.length > SUBJECT_LENGTH_HINT &&
                    ` — au-delà de ${SUBJECT_LENGTH_HINT} caractères, la plupart des messageries tronquent.`}
                  {normalizedDraft.length > MAX_SUBJECT_LENGTH &&
                    ` Maximum ${MAX_SUBJECT_LENGTH}.`}
                </p>
                {/* LE CAS QUE L'APERÇU NE MONTRE JAMAIS. Les valeurs de
                    démonstration ont toujours un nom de famille (« Martin »),
                    alors que `users.last_name` est nullable — les mononymes
                    existent en base. Un objet réduit à des jetons de nom
                    s'interpole alors en VIDE et retombe silencieusement sur
                    l'objet d'usine, sans que rien dans l'éditeur ne l'ait
                    laissé voir. On montre donc le second aperçu, et seulement
                    quand il diffère. */}
                {monoNamePreview !== null && (
                  <p data-testid="email-subject-mononym-preview">
                    <span className="font-medium">Destinataire sans nom de famille&nbsp;: </span>
                    {monoNamePreview.length > 0
                      ? monoNamePreview
                      : "l'objet part vide et retombe sur l'objet par défaut."}
                  </p>
                )}
              </div>

              {/* Chemin de retour. Au niveau modèle il restaure l'objet
                  d'usine ; au niveau événement il rend l'événement à
                  l'héritage — même geste, deux vocabulaires, parce que ce ne
                  sont pas les mêmes conséquences. Rendu seulement quand il y a
                  quelque chose à défaire. */}
              {(editedPersisted != null || (level === 'event' && customizing)) && (
                <div className="border-t pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditedDraft(editedFallback)
                      if (level === 'event') setCustomizing(false)
                    }}
                    data-testid="email-subject-reset-btn"
                  >
                    {level === 'event'
                      ? "Revenir à l'objet du modèle"
                      : "Revenir à l'objet par défaut"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Menu d'insertion de variable — un popover DANS le popover d'édition, sous un
 * Dialog Radix. Trois comportements à tenir sur Échap, et ils ne s'obtiennent
 * pas tout seuls : fermer ce menu seul, puis le popover d'édition seul, et
 * jamais l'éditeur.
 */
function VariableInsertMenu({
  variables,
  onInsert,
}: {
  variables: readonly SubjectVariable[]
  onInsert: (name: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          data-testid="email-subject-variable-trigger"
          aria-expanded={open}
        >
          <Plus className="mr-1 size-3" aria-hidden="true" />
          Variable
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-64 p-1"
        data-testid="email-subject-variable-popover"
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          setOpen(false)
        }}
        // Sans ça, Radix rend le focus à CE bouton APRÈS le `focus()` posé sur
        // le champ par le gestionnaire de clic : l'insertion partirait au
        // bon endroit mais le curseur, non.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ul className="max-h-64 overflow-y-auto">
          {variables.map((variable) => (
            <li key={variable.name}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                // La sélection du champ est relevée AVANT qu'il perde le focus :
                // `onPointerDown` court avant le blur, `onClick` après.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  onInsert(variable.name)
                  setOpen(false)
                }}
                data-testid={`email-subject-variable-${variable.name}`}
              >
                <span className="font-mono text-xs">{`{{${variable.name}}}`}</span>
                <span className="text-xs text-muted-foreground">{variable.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
