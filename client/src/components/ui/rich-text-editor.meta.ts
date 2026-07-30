import type { ComponentMeta } from './_meta/types'

export const richTextEditorMeta: ComponentMeta = {
  name: 'RichTextEditor',
  importPath: '@/components/ui/rich-text-editor',
  summary:
    "Éditeur de texte riche minimaliste basé sur Tiptap V3. Formats supportés : gras, italique, liens (http/https), sauts de ligne — rien de plus. Sortie HTML à rendre côté lecture via `<RichTextContent>` (jamais `{value}` brut). Remplace `<Textarea>` pour les champs description nécessitant de la mise en forme. Champ contrôlé (`value`/`onChange`) avec compteur optionnel piloté par `maxLength`, exprimé en caractères VISIBLES. Les `href` sont bornés à `MAX_LINK_URL_LENGTH` (2000) à tous les points d'entrée — saisie, collage, autolink — pour que ce compteur reste un majorant fiable du HTML émis. La sortie est TOUJOURS un `<p>` unique : le modèle ne connaît que le saut de ligne (`<br>`, deux au maximum d'affilée), à la frappe comme au collage.",
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: "Le contenteditable n'est pas labelable par `htmlFor`. Associer via `aria-labelledby` pointant vers l'`id` du `<Label>` correspondant (conserver `htmlFor` pour le click-to-focus navigateur)",
      correct:
        '<Label id="desc-label" htmlFor="event-description">Description</Label>\n<RichTextEditor id="event-description" aria-labelledby="desc-label" value={...} onChange={...} />',
      wrong:
        '<Label htmlFor="event-description">Description</Label>\n<RichTextEditor id="event-description" value={...} onChange={...} />\n// aria-labelledby absent : lecteurs d\'écran ne lient pas le label au contenteditable',
    },
    {
      rule: "Champ contrôlé : fournir `value` (HTML) et `onChange` (émet du HTML). Ne pas oublier `onChange` — sans lui l'éditeur est figé",
      correct:
        '<RichTextEditor value={formData.description} onChange={(html) => handleChange(\'description\', html)} />',
      wrong:
        '<RichTextEditor value={formData.description} />\n// onChange absent : éditeur en lecture seule de fait',
    },
    {
      rule: "`maxLength` pilote le compteur de caractères visible (texte visible, pas HTML brut). Fournir pour tout champ à taille contrainte côté backend",
      correct:
        '<RichTextEditor value={...} onChange={...} maxLength={5000} />\n// affiche « X/5000 caractères » sous l\'éditeur',
      wrong:
        '<RichTextEditor value={...} onChange={...} />\n// sans maxLength : pas de compteur, pas de limite visuelle',
    },
    {
      rule: "La valeur HTML doit toujours être rendue côté lecture via `<RichTextContent>` — jamais `{value}` brut ni `dangerouslySetInnerHTML` sans sanitisation",
      correct:
        '<RichTextContent html={event.description} />',
      wrong:
        '<div dangerouslySetInnerHTML={{ __html: event.description }} />\n// non sanitisé : risque XSS',
    },
  ],
  antiPatterns: [
    {
      title: 'Persister `<p></p>` en base',
      description:
        "Un éditeur vide émet `<p></p>`. Avant de sauvegarder, tester avec `isRichTextEmpty(html)` et substituer `null` (édition) ou `''` (création) — ne jamais stocker le HTML vide de Tiptap tel quel.",
    },
    {
      title: 'Rendre le HTML brut sans sanitisation',
      description:
        "Ne jamais injecter la sortie de l'éditeur directement via `dangerouslySetInnerHTML`. Toujours passer par `<RichTextContent>` qui appelle `sanitizeRichHtml` (DOMPurify, allowlist `p/br/strong/em/a`) en interne.",
    },
    {
      title: 'Supposer que le compteur borne la charge envoyée au serveur',
      description:
        "Le compteur compte le texte VISIBLE ; ce qui part au serveur est du HTML, `href` compris. Un `href` est le seul contributeur au HTML décorrélé du texte visible : c'est pourquoi le composant refuse toute URL de plus de `MAX_LINK_URL_LENGTH` (2000) caractères. Dans le popover, le refus est explicite (message + « Appliquer » désactivé). Au collage il est silencieux mais jamais destructeur : coller du HTML riche retire la mark lien et garde le texte, coller une URL brute sur une sélection insère l'URL en texte — donc visible, donc comptée. Ne pas rajouter de contrôle de longueur HTML dans l'appelant : la garde appartient au composant, l'appelant ne gère que les erreurs serveur.",
    },
    {
      title: 'Attendre des paragraphes dans la valeur émise',
      description:
        "Le modèle est « retour = `<br>` », plafonné à 2 : la valeur est un `<p>` unique, jamais une suite de `<p>` frères. Tout collage y est ramené — texte brut via `clipboardTextParser` + `pastedTextToLineBreakHtml`, HTML via `transformPastedHTML` + `pastedHtmlToLineBreakHtml` (les `<div>` d'un site web ou les `<h1>` d'une doc comptent comme frontières de bloc, donc comme lignes vides). Ne pas écrire de logique appelante qui parse des paragraphes ni de CSS qui espace `p + p` : c'est du code mort, et un contenu stocké avec des `<p>` frères (donnée legacy) est de toute façon réaplati au rendu par `normalizeStoredDescription`.",
    },
  ],
  examples: [
    {
      label: "Description d'événement avec compteur (admin)",
      code: `import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Label } from '@/components/ui/label'

<div className="space-y-2">
  <Label id="desc-label" htmlFor="event-description">Description</Label>
  <RichTextEditor
    id="event-description"
    aria-labelledby="desc-label"
    value={formData.description}
    onChange={(html) => handleChange('description', html)}
    placeholder="Décrivez votre événement..."
    maxLength={5000}
    disabled={isSubmitting}
  />
</div>`,
    },
    {
      label: 'Sauvegarde — exclure le HTML vide',
      code: `import { isRichTextEmpty } from '@/lib/richText'

// Côté édition : null si vide
const description = isRichTextEmpty(formData.description) ? null : formData.description

// Côté création : chaîne vide si vide
const description = isRichTextEmpty(formData.description) ? '' : formData.description`,
    },
  ],
}
