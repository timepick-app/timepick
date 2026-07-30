import type { RichTextEditorProps } from '@/components/ui/rich-text-editor'

/**
 * Substitut de `<RichTextEditor>` pour jsdom.
 *
 * ProseMirror réclame des API de layout absentes de jsdom : toute interaction
 * (clic sur la barre d'outils, frappe, sélection) y explose. Ce `<textarea>`
 * contrôlé reflète le contrat observable du vrai composant — `value` HTML,
 * `onChange`, `disabled`, `placeholder`, compteur `maxLength`, association
 * `aria-labelledby` — et expose `<id>-input` en `data-testid`.
 *
 * Usage (le factory doit rester paresseux : `vi.mock` est hoisté) :
 *
 *     vi.mock('@/components/ui/rich-text-editor', () => import('@/test/mockRichTextEditor'))
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  disabled,
  maxLength,
  placeholder,
  'aria-labelledby': ariaLabelledby,
}: RichTextEditorProps) {
  return (
    <div>
      <textarea
        id={id}
        data-testid={id ? `${id}-input` : undefined}
        aria-labelledby={ariaLabelledby}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {maxLength !== undefined && (
        <p>
          {value.length}/{maxLength} caractères
        </p>
      )}
    </div>
  )
}
