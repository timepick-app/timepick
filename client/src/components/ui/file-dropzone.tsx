import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import { UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Zone de dépôt de fichier (glisser-déposer + clic) — zéro dépendance.
 *
 * Structure : un `<label>` porte le visuel ET les gestionnaires de drag ;
 * l'`<input type="file">` vit à l'intérieur en `sr-only`. Le clic et la
 * navigation clavier sont donc natifs (pas de `role="button"` + `tabIndex` +
 * `onKeyDown` à réinventer), et l'anneau de focus se pose sur le cadre via
 * `has-[:focus-visible]`.
 *
 * Conséquence à connaître : tout élément interactif placé DANS le label
 * ouvrirait le sélecteur de fichier. Les actions (Supprimer…) passent donc par
 * `children`, rendu SOUS la zone. `preview` (rendu dans la zone, à la place de
 * l'icône) reste non interactif : y cliquer remplace le fichier.
 */
export interface FileDropzoneProps {
  /** Appelé avec le fichier retenu, une fois la taille et le type validés. */
  onFileSelected: (file: File) => void
  /** Liste `accept` HTML — types MIME exacts séparés par des virgules. */
  accept?: string
  /** Taille maximale acceptée côté client, en octets. */
  maxSizeBytes?: number
  /** Neutralise la zone (chargement, sauvegarde, téléversement en cours…). */
  disabled?: boolean
  /** Bascule la ligne d'action sur « Téléversement… ». */
  isUploading?: boolean
  /** Ligne d'aide (formats acceptés, poids max). Devient la description ARIA. */
  hint?: string
  /** Aperçu du fichier déjà présent, rendu à la place de l'icône. */
  preview?: ReactNode
  /** Actions liées au fichier (ex. Supprimer), rendues sous la zone. */
  children?: ReactNode
  /** Racine du `data-testid` : `<testId>-dropzone` et `<testId>-input`. */
  testId?: string
  className?: string
  /**
   * Id du `<Label>` visible au-dessus de la zone. Sans lui, le champ n'annonce
   * que sa ligne d'action (« Glissez un fichier… ») et l'utilisateur de lecteur
   * d'écran n'apprend jamais CE QUE le champ attend (« Logo »).
   */
  'aria-labelledby'?: string
}

const BROWSE_LABEL = 'Glissez un fichier ici ou cliquez pour parcourir'
const REPLACE_LABEL = 'Glissez un nouveau fichier ou cliquez pour le remplacer'
const UPLOADING_LABEL = 'Téléversement…'

export function FileDropzone({
  onFileSelected,
  accept,
  maxSizeBytes,
  disabled = false,
  isUploading = false,
  hint,
  preview,
  children,
  testId,
  className,
  'aria-labelledby': ariaLabelledby,
}: FileDropzoneProps) {
  const inputId = useId()
  const actionId = `${inputId}-action`
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const [isDragging, setIsDragging] = useState(false)
  // `seq` force le remontage du `role="alert"` : deux erreurs IDENTIQUES
  // consécutives ne muteraient pas le nœud, donc ne seraient pas ré-annoncées.
  const [error, setError] = useState<{ message: string; seq: number } | null>(null)
  const errorSeq = useRef(0)
  // `dragleave` se déclenche aussi en quittant un ENFANT de la zone : sans
  // compteur d'entrées/sorties, l'état de survol clignote dès que le curseur
  // passe au-dessus de l'icône ou du texte.
  const dragDepth = useRef(0)

  const hasPreview = preview != null
  const [previewAtError, setPreviewAtError] = useState(hasPreview)

  // Un fichier apparaît ou disparaît (téléversement réussi, suppression) : le
  // message d'erreur précédent ne décrit plus l'état affiché. Ajustement à la
  // volée plutôt qu'un effet (même patron que la resync d'OrganizationConfigPanel).
  if (previewAtError !== hasPreview) {
    setPreviewAtError(hasPreview)
    setError(null)
  }

  // Un dépôt qui RATE la zone fait naviguer le navigateur vers le fichier et
  // détruit la saisie en cours du formulaire. Tant qu'une zone est montée, on
  // neutralise le comportement par défaut sur toute la page.
  useEffect(() => {
    const swallow = (event: Event) => event.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  const fail = (message: string) => {
    errorSeq.current += 1
    setError({ message, seq: errorSeq.current })
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (accept && !accept.split(',').some((mime) => mime.trim() === file.type)) {
      fail('Format de fichier non supporté')
      return
    }
    if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
      fail(`Fichier trop volumineux (max ${maxSizeBytes / 1024 / 1024} Mo)`)
      return
    }
    setError(null)
    onFileSelected(file)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0])
    // Réinitialise la valeur pour que re-sélectionner le MÊME fichier après une
    // erreur serveur redéclenche bien un `change`.
    event.target.value = ''
  }

  const handleDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (disabled) return
    dragDepth.current += 1
    setIsDragging(true)
  }

  // `preventDefault` AVANT la garde `disabled` : si la zone se neutralise en
  // plein survol (un téléversement démarre), sortir sans l'appeler rendrait la
  // main au navigateur, qui ouvrirait le fichier déposé et viderait la page.
  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (disabled) return
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = () => {
    if (disabled) return
    // Clamp : un `dragleave` orphelin passerait la profondeur en négatif et le
    // surlignage ne se retirerait plus jamais.
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (disabled) return
    dragDepth.current = 0
    setIsDragging(false)
    // Endpoint mono-fichier : un dépôt multiple ne retient que le premier.
    handleFile(event.dataTransfer.files?.[0])
  }

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={cn('space-y-2', className)}>
      <label
        htmlFor={inputId}
        data-testid={testId ? `${testId}-dropzone` : undefined}
        data-dragging={isDragging || undefined}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-4 py-6 text-center ring-offset-background transition-colors',
          'hover:border-ring hover:bg-muted/60',
          'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-offset-0',
          // Survol de dépôt : le pointillé passe en trait plein primaire — le
          // seul changement de teinte (accent ≈ muted) serait imperceptible.
          'data-[dragging]:border-solid data-[dragging]:border-primary data-[dragging]:bg-accent',
          error && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={handleInputChange}
          className="sr-only"
          data-testid={testId ? `${testId}-input` : undefined}
          // Nom accessible explicite : sans lui, le `<label>` englobant agrège
          // TOUT son contenu (ligne d'aide et `alt` de l'aperçu compris) dans
          // le nom du champ au lieu de sa description.
          aria-labelledby={[ariaLabelledby, actionId].filter(Boolean).join(' ')}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
        />
        {preview ?? <UploadCloud className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
        <span id={actionId} className="text-sm font-medium">
          {isUploading ? UPLOADING_LABEL : hasPreview ? REPLACE_LABEL : BROWSE_LABEL}
        </span>
        {hint && (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </label>

      {error && (
        <p key={error.seq} id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      )}

      {children}
    </div>
  )
}
