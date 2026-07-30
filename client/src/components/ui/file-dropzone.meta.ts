import type { ComponentMeta } from './_meta/types'

export const fileDropzoneMeta: ComponentMeta = {
  name: 'FileDropzone',
  importPath: '@/components/ui/file-dropzone',
  summary:
    "Zone de dépôt de fichier (glisser-déposer + clic), zéro dépendance externe. Remplace le pattern « `<input type=\"file\">` caché + bouton Téléverser » réimplémenté à l'identique dans chaque écran. Un `<label>` porte le cadre pointillé et les gestionnaires de drag, l'input vit dedans en `sr-only` : clic, focus clavier et association label↔input sont natifs. Valide la taille (`maxSizeBytes`) et le type MIME (`accept`) AVANT d'appeler `onFileSelected`, et affiche l'erreur en ligne. La ligne d'action se déduit de l'état : « parcourir » à vide, « remplacer » dès que `preview` est fourni, « Téléversement… » sous `isUploading`.",
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: "Les actions liées au fichier (Supprimer, Remplacer…) passent par `children` — jamais dans `preview`, qui est rendu DANS le label et ouvrirait le sélecteur de fichier au clic",
      correct:
        '<FileDropzone onFileSelected={upload} preview={<img src={logo} className="h-12 w-auto" />}>\n  <Button variant="outline-destructive" size="sm" onClick={remove}>Supprimer</Button>\n</FileDropzone>',
      wrong:
        '<FileDropzone\n  onFileSelected={upload}\n  preview={<><img src={logo} /><Button onClick={remove}>Supprimer</Button></>}\n/>\n// le bouton est dans le <label> : cliquer « Supprimer » ouvre le sélecteur de fichier',
    },
    {
      rule: "Aligner `accept` sur ce que le serveur accepte réellement, pas sur un joker large — sinon le fichier passe le sélecteur puis se fait rejeter en 415",
      correct:
        '<FileDropzone accept={IMAGE_UPLOAD_ACCEPT} hint={IMAGE_UPLOAD_HINT} onFileSelected={upload} />\n// @/lib/imageUpload : miroir de l\'allowlist MIME du serveur',
      wrong:
        '<FileDropzone accept="image/*" onFileSelected={upload} />\n// un GIF ou un SVG est sélectionnable côté client, puis refusé par le serveur',
    },
    {
      rule: "Fournir `maxSizeBytes` pour que le refus soit immédiat et local ; ne pas re-tester la taille dans l'appelant (double message d'erreur)",
      correct:
        '<FileDropzone maxSizeBytes={IMAGE_UPLOAD_MAX_BYTES} onFileSelected={upload} />',
      wrong:
        "<FileDropzone onFileSelected={(f) => {\n  if (f.size > MAX) { toast.error('Fichier trop volumineux'); return }\n  upload(f)\n}} />\n// la garde appartient au composant : l'appelant ne gère que les erreurs serveur",
    },
    {
      rule: "`isUploading` bascule le libellé, `disabled` neutralise la zone : pendant un téléversement, passer les deux",
      correct:
        '<FileDropzone isUploading={isUploadingLogo} disabled={isBusy} onFileSelected={upload} />',
      wrong:
        '<FileDropzone isUploading={isUploadingLogo} onFileSelected={upload} />\n// zone toujours active pendant la requête : un 2e dépôt part en parallèle',
    },
    {
      rule: "`testId` est une RACINE : le composant en dérive `<testId>-dropzone` (la zone) et `<testId>-input` (l'input file)",
      correct:
        "<FileDropzone testId=\"org-logo\" onFileSelected={upload} />\n// screen.getByTestId('org-logo-input') puis user.upload(...)",
      wrong:
        '<FileDropzone testId="org-logo-input" onFileSelected={upload} />\n// produit org-logo-input-input : la racine ne doit pas contenir le suffixe',
    },
    {
      rule: "Passer `aria-labelledby` avec l'id du `<Label>` visible : le libellé interne (« Glissez un fichier… ») décrit l'ACTION, pas l'objet attendu. Sans lui, un lecteur d'écran n'annonce jamais « Logo »",
      correct:
        '<Label id="org-logo-label">Logo</Label>\n<FileDropzone aria-labelledby="org-logo-label" onFileSelected={upload} />',
      wrong:
        '<Label>Logo</Label>\n<FileDropzone onFileSelected={upload} />\n// le Label est orphelin : le champ s\'annonce « Glissez un fichier ici ou cliquez pour parcourir » et rien de plus',
    },
  ],
  antiPatterns: [
    {
      title: 'Réimplémenter un input file caché + bouton',
      description:
        "Le pattern « `<input type=\"file\" className=\"hidden\">` + `<Button onClick={() => ref.current?.click()}>` » a été dupliqué dans quatre écrans avant l'arrivée de cette primitive. Il n'offre pas le glisser-déposer, oublie systématiquement la réinitialisation de `input.value` (re-sélectionner le même fichier après une erreur ne déclenche rien) et duplique la garde de taille. Utiliser `FileDropzone`.",
    },
    {
      title: 'Masquer l\'input avec `hidden` plutôt que `sr-only`',
      description:
        "`className=\"hidden\"` retire l'input du flux ET du parcours clavier : la zone devient inatteignable au clavier et l'anneau de focus n'apparaît jamais. `sr-only` le garde focusable, ce qui permet à `has-[:focus-visible]` de porter l'anneau sur le cadre.",
    },
    {
      title: 'Oublier `preventDefault` sur `dragover`',
      description:
        "Sans `preventDefault` sur `dragover` (et pas seulement sur `drop`), le navigateur refuse le dépôt et ouvre le fichier dans l'onglet — la page en cours d'édition est perdue. Géré par le composant : ne pas re-câbler les événements de drag depuis l'appelant.",
    },
    {
      title: 'Piloter l\'état de survol sans compteur d\'entrées/sorties',
      description:
        "`dragleave` remonte aussi quand le curseur quitte un ENFANT de la zone (icône, texte). Un simple `onDragEnter → true / onDragLeave → false` fait clignoter le cadre pendant tout le survol. Le composant maintient un compteur de profondeur ; ne pas le contourner.",
    },
  ],
  examples: [
    {
      label: "Logo d'organisation (aperçu + suppression)",
      code: `import { FileDropzone } from '@/components/ui/file-dropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_HINT, IMAGE_UPLOAD_MAX_BYTES } from '@/lib/imageUpload'

<div className="space-y-2">
  <Label id="org-logo-label">Logo</Label>
  <FileDropzone
    testId="org-logo"
    aria-labelledby="org-logo-label"
    accept={IMAGE_UPLOAD_ACCEPT}
    maxSizeBytes={IMAGE_UPLOAD_MAX_BYTES}
    hint={IMAGE_UPLOAD_HINT}
    isUploading={isUploadingLogo}
    disabled={isBusy}
    preview={logo ? <img src={logo} alt="" className="h-12 w-auto rounded border object-contain" /> : undefined}
    onFileSelected={handleUpload}
  >
    {logo && (
      <Button type="button" variant="outline-destructive" size="sm" onClick={handleRemove}>
        Supprimer
      </Button>
    )}
  </FileDropzone>
</div>`,
    },
  ],
}
