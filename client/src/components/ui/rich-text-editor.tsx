/**
 * Éditeur de texte riche minimaliste — Tiptap V3
 * Formats supportés : gras, italique, liens (http/https), sauts de ligne.
 * Sortie HTML. À rendre côté lecture via <RichTextContent>.
 */
import { useId, useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import HardBreak from '@tiptap/extension-hard-break'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { Extension } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { Bold as BoldIcon, Italic as ItalicIcon, Link as LinkIcon } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { normalizeStoredDescription, flattenToLineBreaks } from '@/lib/richText'
import { cn } from '@/lib/utils'

/** Compte les `<br>` consécutifs juste avant le curseur (plafonné à 2). */
function countTrailingHardBreaks(state: EditorState): number {
  const { $from } = state.selection
  let count = 0
  let pos = $from.pos
  let node = $from.nodeBefore
  while (node && node.type.name === 'hardBreak' && count < 2) {
    count += 1
    pos -= node.nodeSize
    node = state.doc.resolve(pos).nodeBefore
  }
  return count
}

/**
 * Entrée (et Maj+Entrée) insèrent un `<br>` au lieu de découper en paragraphes,
 * avec un plafond de 2 `<br>` consécutifs (la 3e Entrée est ignorée). Priorité
 * élevée pour passer avant le comportement « nouveau paragraphe » par défaut.
 */
const LineBreakOnly = Extension.create({
  name: 'lineBreakOnly',
  priority: 1000,
  addKeyboardShortcuts() {
    const insertBreak = () => {
      if (countTrailingHardBreaks(this.editor.state) >= 2) return true
      return this.editor.commands.setHardBreak()
    }
    return { Enter: insertBreak, 'Shift-Enter': insertBreak }
  },
})

export interface RichTextEditorProps {
  id?: string
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  /** Rend le composant redimensionnable verticalement par l'utilisateur. */
  resizable?: boolean
  className?: string
  'aria-labelledby'?: string
}

/**
 * Vérifie qu'une URL commence par http:// ou https://
 */
function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

/**
 * Éditeur de texte riche minimaliste.
 * Barre d'outils : Gras, Italique, Lien. Sortie HTML.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  maxLength,
  resizable = false,
  className,
  'aria-labelledby': ariaLabelledby,
}: RichTextEditorProps) {
  const counterId = useId()

  // Dernier HTML émis par l'éditeur : permet d'ignorer l'écho de notre propre
  // onChange dans l'effet de synchronisation (évite un setContent qui replacerait
  // le curseur à chaque frappe si la sanitisation réordonne des attributs).
  const lastEmittedHtml = useRef<string | null>(null)

  // État du popover de lien
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      HardBreak,
      LineBreakOnly,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      CharacterCount.configure({ limit: maxLength }),
    ],
    content: normalizeStoredDescription(value),
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML()
      lastEmittedHtml.current = html
      onChange(html)
    },
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
        class:
          'min-h-[80px] px-3 py-2 focus:outline-none [&_strong]:font-semibold [&_em]:italic [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
        ...(ariaLabelledby ? { 'aria-labelledby': ariaLabelledby } : {}),
        ...(maxLength !== undefined ? { 'aria-describedby': counterId } : {}),
      },
      // Au collage (multi-paragraphes / lignes vides), on aplatit vers le modèle
      // « retour = <br> » et on plafonne à 2 <br> consécutifs.
      transformPastedHTML: (html) => flattenToLineBreaks(html),
    },
  })

  // Synchronisation du contenu quand value change depuis l'extérieur (ex. reset formulaire, rechargement event)
  useEffect(() => {
    if (!editor) return
    // Ignorer l'écho de notre propre saisie (déjà à l'écran) : ne resynchroniser
    // que sur un changement réellement externe (reset formulaire, autre event).
    if (value === lastEmittedHtml.current) return
    const normalized = normalizeStoredDescription(value)
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized, { emitUpdate: false })
    }
  }, [editor, value])

  // Passage en mode lecture seule selon la prop disabled
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  // État réactif : marks actives + compteur
  // useEditorState abonne au bus de transactions sans re-rendre toute la page
  const editorState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      isBold: e ? e.isActive('bold') : false,
      isItalic: e ? e.isActive('italic') : false,
      isLink: e ? e.isActive('link') : false,
      chars: e?.storage?.characterCount?.characters?.() ?? 0,
    }),
  })

  const isBold = editorState?.isBold ?? false
  const isItalic = editorState?.isItalic ?? false
  const isLink = editorState?.isLink ?? false
  const chars = editorState?.chars ?? 0

  // Pré-remplissage de l'URL courante à l'ouverture du popover
  const handleLinkPopoverOpenChange = (open: boolean) => {
    if (open && editor) {
      setLinkUrl(editor.getAttributes('link').href ?? '')
    }
    setLinkPopoverOpen(open)
  }

  const handleApplyLink = () => {
    if (!editor || !isValidHttpUrl(linkUrl)) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run()
    setLinkPopoverOpen(false)
  }

  const handleRemoveLink = () => {
    if (!editor) return
    editor.chain().focus().unsetLink().run()
    setLinkPopoverOpen(false)
  }

  return (
    <div
      className={cn(
        // Chrome identique à <Textarea> (border-input, bg-background, ring-offset)
        'w-full rounded-md border border-input bg-background text-field ring-offset-background',
        // Focus ring sur le wrapper via focus-within (le contenteditable n'expose pas focus-visible)
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] focus-within:ring-offset-0',
        disabled && 'cursor-not-allowed opacity-50',
        resizable && 'resize-y overflow-hidden flex flex-col min-h-[120px]',
        className
      )}
    >
      {/* Barre d'outils */}
      <div className="flex items-center gap-0.5 border-b border-input px-1.5 py-1">
        <Toggle
          size="sm"
          pressed={isBold}
          onPressedChange={() => editor?.chain().focus().toggleBold().run()}
          aria-label="Gras"
          disabled={disabled}
        >
          <BoldIcon />
        </Toggle>

        <Toggle
          size="sm"
          pressed={isItalic}
          onPressedChange={() => editor?.chain().focus().toggleItalic().run()}
          aria-label="Italique"
          disabled={disabled}
        >
          <ItalicIcon />
        </Toggle>

        {/* Bouton Lien avec popover d'insertion/suppression */}
        <Popover open={linkPopoverOpen} onOpenChange={handleLinkPopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Lien"
              type="button"
              disabled={disabled}
              className={cn(isLink && 'bg-accent text-accent-foreground')}
            >
              <LinkIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Insérer un lien</p>
              <Input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://exemple.com"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleApplyLink()
                  }
                }}
              />
              {linkUrl.trim() && !isValidHttpUrl(linkUrl) && (
                <p className="text-xs text-destructive">
                  L&apos;URL doit commencer par http:// ou https://
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyLink}
                  disabled={!isValidHttpUrl(linkUrl)}
                >
                  Appliquer
                </Button>
                {isLink && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveLink}
                  >
                    Retirer
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Zone d'édition Tiptap */}
      {resizable ? (
        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* Compteur de caractères — affiché uniquement si maxLength est fourni */}
      {maxLength !== undefined && (
        <p id={counterId} className="px-3 py-1 text-xs text-muted-foreground">
          {chars}/{maxLength} caractères
        </p>
      )}
    </div>
  )
}
