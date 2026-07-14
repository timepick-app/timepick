import type { ComponentMeta } from './_meta/types'

export const dialogMeta: ComponentMeta = {
  name: 'Dialog',
  importPath: '@/components/ui/dialog',
  summary:
    'Modale accessible basée sur Radix UI (`@radix-ui/react-dialog`) avec gestion automatique du focus trap, de la fermeture par `Escape`, du scroll lock et du portal. Composition obligatoire : `Dialog` (Root contrôlé via `open`/`onOpenChange`) + `DialogTrigger` (ou ouverture programmatique) + `DialogContent` + au moins un `DialogTitle` (a11y). Sous-composants exportés : `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`. À utiliser pour toute interaction modale TimePick : confirmation de suppression (événement, créneau, utilisateur), édition d\'un créneau, envoi d\'invitations, alertes de session expirée, régénération de codes de secours.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Toujours inclure un `<DialogTitle>` dans `<DialogHeader>` (Radix lève un warning a11y sinon ; les lecteurs d\'écran annoncent la modale via ce titre)',
      correct:
        '<DialogContent>\n  <DialogHeader>\n    <DialogTitle>Supprimer l\'événement</DialogTitle>\n  </DialogHeader>\n  ...\n</DialogContent>',
      wrong:
        '<DialogContent>\n  <h2 className="text-lg font-semibold">Supprimer l\'événement</h2>\n  ...\n</DialogContent>',
    },
    {
      rule: 'Utiliser `<DialogDescription>` pour le texte explicatif sous le titre (rendu en `<p text-muted-foreground>`, lié au content via `aria-describedby` automatique)',
      correct:
        '<DialogHeader>\n  <DialogTitle>Régénérer les codes de secours ?</DialogTitle>\n  <DialogDescription>Tous vos codes actuels seront invalidés.</DialogDescription>\n</DialogHeader>',
      wrong:
        '<DialogHeader>\n  <DialogTitle>Régénérer les codes de secours ?</DialogTitle>\n  <p className="text-sm text-muted-foreground">Tous vos codes actuels seront invalidés.</p>\n</DialogHeader>',
    },
    {
      rule: 'Regrouper les boutons d\'action dans `<DialogFooter>` (layout responsive : `flex-col-reverse` mobile, `flex-row` desktop, action principale à droite)',
      correct:
        '<DialogFooter>\n  <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>\n  <Button variant="outline-destructive" onClick={handleConfirm}>Supprimer</Button>\n</DialogFooter>',
      wrong:
        '<div className="flex justify-end gap-2 mt-6">\n  <Button variant="outline">Annuler</Button>\n  <Button variant="destructive">Supprimer</Button>\n</div>',
    },
    {
      rule: 'Les champs d\'un Dialog/Sheet restent en taille `default` (h-9) — comme un formulaire de page. La densité d\'une modale vient de la MISE EN PAGE (rythme vertical resserré `space-y-4`, labels en grille), pas du rétrécissement des champs. Ne PAS passer les champs en `size="sm"`',
      correct:
        '<DialogContent className="space-y-4">\n  <Input id="email" type="email" /> {/* h-9, comme en page */}\n  <DialogFooter><Button type="submit">Enregistrer</Button></DialogFooter> {/* h-9 */}\n</DialogContent>',
      wrong:
        '<Input id="email" size="sm" /> {/* h-8 dans le corps d\'un dialog : compacité injustifiée */}',
    },
    {
      rule: 'Contrôler la modale via `open` + `onOpenChange` plutôt que `DialogTrigger` quand l\'ouverture dépend d\'un état parent (ligne d\'un tableau, item d\'un menu, etc.)',
      correct:
        '<Dialog open={isOpen} onOpenChange={setIsOpen}>\n  <DialogContent>...</DialogContent>\n</Dialog>',
      wrong:
        '// Trigger imbriqué dans une cellule de tableau, état non synchronisé\n<DialogTrigger asChild><Button>Supprimer</Button></DialogTrigger>',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser `window.confirm()` ou `window.alert()` au lieu de `<Dialog>`',
      description:
        'Les dialogues natifs du navigateur sont bloquants, non stylables, sortent du design system (typographie, couleurs, focus ring TimePick), et bloquent le thread JS. Pour toute confirmation destructive (supprimer un événement, vider une corbeille, régénérer des codes), utiliser un `<Dialog>` contrôlé avec `<DialogTitle>`, `<DialogDescription>` et un `<Button variant="outline-destructive">` dans le footer. Cf. `EventDeleteDialog`, `SecurityPanel` (régénération codes de secours) pour le pattern de référence.',
    },
    {
      title: 'Omettre `<DialogTitle>` (ou le remplacer par un `<h2>` brut)',
      description:
        'Radix UI s\'attend à un `<DialogTitle>` pour câbler `aria-labelledby` sur le content : sans lui, les lecteurs d\'écran annoncent une modale anonyme et Radix logge un warning en dev. Si le design n\'autorise pas de titre visible (éditeur plein écran, par ex. `MjmlEditorOverlay`), utiliser `<DialogTitle className="sr-only">…</DialogTitle>` — le titre reste exposé à l\'API d\'accessibilité tout en étant masqué visuellement.',
    },
    {
      title: 'Imbriquer un `<Dialog>` à l\'intérieur d\'un autre `<Dialog>`',
      description:
        'Radix gère techniquement l\'empilement (chaque modale a son propre overlay et focus trap), mais l\'UX est confuse : l\'utilisateur ne sait plus quelle action ferme quoi, le `Escape` ne ferme que la modale du dessus, et les overlays opaques empilés masquent le contexte. Préférer une machine à état dans le parent (un seul `Dialog` dont le contenu change selon `step`) ou enchaîner les modales (fermer la première avant d\'ouvrir la seconde).',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import {\n  Dialog,\n  DialogTrigger,\n  DialogContent,\n  DialogHeader,\n  DialogTitle,\n  DialogDescription,\n  DialogFooter,\n} from "@/components/ui/dialog"\nimport { Button } from "@/components/ui/button"',
    },
    {
      label: 'Confirmation de suppression (événement, créneau, utilisateur)',
      code: `<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        Supprimer l'événement
      </DialogTitle>
      <DialogDescription>
        Êtes-vous sûr de vouloir supprimer l'événement <strong>{event.name}</strong> ?
        Cette action est irréversible et supprimera également les créneaux et réservations associés.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter className="flex-col-reverse sm:flex-row gap-3">
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
        Annuler
      </Button>
      <Button variant="outline-destructive" onClick={handleConfirm} disabled={isDeleting}>
        {isDeleting ? 'Suppression…' : 'Supprimer'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`,
    },
    {
      label: 'Dialog avec formulaire contrôlé (confirmation par saisie email)',
      code: `<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Régénérer les codes de secours ?</DialogTitle>
      <DialogDescription>
        Tous vos codes actuels seront invalidés. Pour confirmer, saisissez votre adresse email.
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-2">
      <Label htmlFor="confirm-email">Votre email</Label>
      <Input
        id="confirm-email"
        type="email"
        autoComplete="off"
        value={typedEmail}
        onChange={(e) => setTypedEmail(e.target.value)}
        placeholder={expectedEmail}
      />
    </div>

    <DialogFooter className="gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
        Annuler
      </Button>
      <Button variant="destructive" onClick={onConfirm} disabled={!matches || isSubmitting}>
        {isSubmitting ? 'Génération…' : 'Confirmer et régénérer'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`,
    },
    {
      label: 'Dialog plein écran avec titre masqué (éditeur, prévisualisation)',
      code: `<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-[95vw] h-[95vh] p-0">
    <DialogHeader className="sr-only">
      <DialogTitle>Éditeur d'email</DialogTitle>
      <DialogDescription>
        Éditeur visuel MJML pour le template d'invitation
      </DialogDescription>
    </DialogHeader>
    {/* Contenu plein écran sans header visible */}
    <MjmlEditor template={template} onSave={handleSave} />
  </DialogContent>
</Dialog>`,
    },
  ],
}
