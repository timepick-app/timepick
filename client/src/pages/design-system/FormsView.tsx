import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Typography } from "@/components/ui/typography"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { inputMeta } from "@/components/ui/input.meta"
import { Textarea } from "@/components/ui/textarea"
import { textareaMeta } from "@/components/ui/textarea.meta"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { selectMeta } from "@/components/ui/select.meta"
import { Checkbox } from "@/components/ui/checkbox"
import { checkboxMeta } from "@/components/ui/checkbox.meta"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { radioGroupMeta } from "@/components/ui/radio-group.meta"
import { Switch } from "@/components/ui/switch"
import { switchMeta } from "@/components/ui/switch.meta"
import { sliderMeta } from "@/components/ui/slider.meta"
import { Search } from "lucide-react"
import { ComponentDoc } from "./_shared"
import { NativeSelectDemo, MembersMockDemo, DatePickerDemo, SliderDemo } from "./_demos"

export function FormsView() {
  const [inputEmailDemo, setInputEmailDemo] = useState("")
  const [inputSearchDemo, setInputSearchDemo] = useState("")
  const [textareaDescriptionDemo, setTextareaDescriptionDemo] = useState("")
  const [textareaTemplateDemo, setTextareaTemplateDemo] = useState(
    "Bonjour {{prenom}},\n\nVous êtes invité(e) à participer à l'événement {{nom_evenement}}.\n\nMerci de réserver votre créneau via le lien ci-dessous."
  )
  const [selectEventDemo, setSelectEventDemo] = useState("")
  const [checkboxInviteDemo, setCheckboxInviteDemo] = useState(true)
  const [checkboxTermsDemo, setCheckboxTermsDemo] = useState(false)
  const [checkboxNewsletterDemo, setCheckboxNewsletterDemo] = useState(false)
  const [radioRoleDemo, setRadioRoleDemo] = useState("user")
  const [switchNotifyDemo, setSwitchNotifyDemo] = useState(true)
  const [inputSmDemo, setInputSmDemo] = useState("")
  const [selectSmDemo, setSelectSmDemo] = useState("all")

  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Formulaires</Typography>
        <Typography variant="body" color="muted">
          Saisie, sélection et densité compacte des contrôles de formulaire.
        </Typography>
      </header>

      {/* Input — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Input — Exemple</CardTitle>
          <CardDescription>
            Champ de saisie texte avec Label associé. Pattern standard TimePick : <code className="bg-muted px-1 rounded text-xs">{'<Label htmlFor="x">…</Label><Input id="x" … />'}</code> dans un <code className="bg-muted px-1 rounded text-xs">div.space-y-2</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="ds-input-email">Adresse email</Label>
            <Input
              id="ds-input-email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              value={inputEmailDemo}
              onChange={(e) => setInputEmailDemo(e.target.value)}
            />
            <Typography variant="body-xs" color="muted">
              <code className="bg-muted px-1 rounded text-xs">type="email"</code> active le clavier email sur mobile
            </Typography>
          </div>
          <div className="space-y-2 max-w-md">
            <Label htmlFor="ds-input-search">Rechercher un membre</Label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="ds-input-search"
                type="search"
                placeholder="Nom, email…"
                value={inputSearchDemo}
                onChange={(e) => setInputSearchDemo(e.target.value)}
                className="pl-9"
              />
            </div>
            <Typography variant="body-xs" color="muted">
              Icône préfixée via positionnement absolu + <code className="bg-muted px-1 rounded text-xs">pl-9</code> sur l'Input
            </Typography>
          </div>
        </CardContent>
      </Card>

      {/* Input — Doc cards */}
      <ComponentDoc
        meta={inputMeta}
        guidelinesDescription="Règles d'utilisation pour les champs de saisie de formulaire"
        antiPatternsDescription="Pièges à éviter sur les champs de saisie (a11y, contrôle d'état)"
        examplesDescription="Patterns d'utilisation du composant Input"
      />

      {/* Textarea — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Textarea — Exemple</CardTitle>
          <CardDescription>
            Champ de saisie multi-lignes avec Label associé. À privilégier pour les descriptions, templates et messages libres — partout où <code className="bg-muted px-1 rounded text-xs">{'<Input>'}</code> (mono-ligne) est insuffisant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="ds-textarea-description">Description d'événement</Label>
            <Textarea
              id="ds-textarea-description"
              rows={4}
              placeholder="Ex: Tournoi annuel ouvert à tous les membres..."
              value={textareaDescriptionDemo}
              onChange={(e) => setTextareaDescriptionDemo(e.target.value)}
            />
            <Typography variant="body-xs" color="muted">
              <code className="bg-muted px-1 rounded text-xs">rows={'{4}'}</code> donne ~4 lignes visibles par défaut (toujours redimensionnable verticalement par l'utilisateur)
            </Typography>
          </div>
          <div className="space-y-2 max-w-md">
            <Label htmlFor="ds-textarea-template">Template d'invitation</Label>
            <Textarea
              id="ds-textarea-template"
              rows={8}
              maxLength={2000}
              value={textareaTemplateDemo}
              onChange={(e) => setTextareaTemplateDemo(e.target.value)}
            />
            <Typography variant="body-xs" color="muted" className="text-right block">
              {textareaTemplateDemo.length} / 2000 caractères
            </Typography>
            <Typography variant="body-xs" color="muted">
              Combinaison <code className="bg-muted px-1 rounded text-xs">maxLength</code> + compteur visible pour aligner l'UX avec la limite backend
            </Typography>
          </div>
        </CardContent>
      </Card>

      {/* Textarea — Doc cards */}
      <ComponentDoc
        meta={textareaMeta}
        guidelinesDescription="Règles d'utilisation pour les champs de saisie multi-lignes"
        antiPatternsDescription="Pièges à éviter sur les champs multi-lignes (sélection du composant, contrat backend)"
        examplesDescription="Patterns d'utilisation du composant Textarea"
      />

      {/* Select — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Select — Exemple</CardTitle>
          <CardDescription>
            Liste déroulante interactive (Radix UI). Sous-ensemble minimal : <code className="bg-muted px-1 rounded text-xs">{'<Select> + <SelectTrigger> + <SelectValue> + <SelectContent> + <SelectItem>'}</code>. Joue aussi le rôle de fallback compact dans le pattern responsive Niveau 2 (cf. Tabs).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="ds-select-event">Choisir un événement</Label>
            <Select value={selectEventDemo} onValueChange={setSelectEventDemo}>
              <SelectTrigger id="ds-select-event" className="w-full">
                <SelectValue placeholder="Sélectionner un événement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ag-2026">Réunion AG 2026</SelectItem>
                <SelectItem value="tournoi-tennis">Tournoi de Tennis 2026</SelectItem>
                <SelectItem value="gala-printemps">Gala de Printemps</SelectItem>
                <SelectItem value="tournoi-petanque" disabled>
                  Tournoi de Pétanque (archivé)
                </SelectItem>
              </SelectContent>
            </Select>
            <Typography variant="body-xs" color="muted">
              Le placeholder s'affiche tant qu'aucune valeur n'est choisie. L'option "archivé" reste visible mais désactivée.
            </Typography>
          </div>
          <div className="space-y-2 max-w-md">
            <Label htmlFor="ds-select-grouped">Catégoriser un événement</Label>
            <Select>
              <SelectTrigger id="ds-select-grouped" className="w-full">
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Sportif</SelectLabel>
                  <SelectItem value="tennis">Tennis</SelectItem>
                  <SelectItem value="petanque">Pétanque</SelectItem>
                  <SelectItem value="randonnee">Randonnée</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Associatif</SelectLabel>
                  <SelectItem value="ag">Assemblée générale</SelectItem>
                  <SelectItem value="gala">Gala / Soirée</SelectItem>
                  <SelectItem value="formation">Formation</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Typography variant="body-xs" color="muted">
              <code className="bg-muted px-1 rounded text-xs">{'<SelectGroup> + <SelectLabel>'}</code> dès que la liste dépasse 5 items
            </Typography>
          </div>
        </CardContent>
      </Card>

      {/* Select — Doc cards */}
      <ComponentDoc
        meta={selectMeta}
        guidelinesDescription="Règles d'utilisation pour les listes déroulantes (placeholder, groupes, items désactivés, fallback responsive)"
        antiPatternsDescription="Pièges à éviter sur les listes déroulantes (select natif, item sans value, placeholder manquant, masquage d'options)"
        examplesDescription="Patterns d'utilisation du composant Select"
      />

      {/* Select natif (pattern HTML <select>) — rapatrié de DensityLab */}
      <Card>
        <CardHeader>
          <CardTitle>Select natif (pattern HTML)</CardTitle>
          <CardDescription>
            Champ <code className="bg-muted px-1 rounded text-xs">{'<select>'}</code> natif stylé — pattern DISTINCT du Select Radix ci-dessus (les deux coexistent, cf. l'anti-pattern nuancé de <code className="bg-muted px-1 rounded text-xs">select.meta</code>). Bouton outline + <code className="bg-muted px-1 rounded text-xs">appearance-none</code> + chevron, pour les listes natives courtes (ex. police).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Police</Label>
            <NativeSelectDemo />
          </div>
        </CardContent>
      </Card>

      {/* DatePicker / TimePicker / DateTimePicker — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>DatePicker / TimePicker / DateTimePicker — Exemple</CardTitle>
          <CardDescription>
            Sélecteurs de date et d'heure DS (vraies primitives <code className="bg-muted px-1 rounded text-xs">ui/</code> basées sur <code className="bg-muted px-1 rounded text-xs">react-day-picker</code>). Remplacent les <code className="bg-muted px-1 rounded text-xs">{'<input type="date|time|datetime-local">'}</code> natifs. État local en valeurs natives (<code className="bg-muted px-1 rounded text-xs">Date | null</code>, <code className="bg-muted px-1 rounded text-xs">"HH:mm"</code>) ; conversion ISO à la frontière API via <code className="bg-muted px-1 rounded text-xs">@/lib/datetime</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DatePickerDemo />
        </CardContent>
      </Card>

      {/* Slider — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Slider — Exemple</CardTitle>
          <CardDescription>
            Contrôle de sélection d'une valeur sur une plage — track <code className="bg-muted px-1 rounded text-xs">bg-muted</code>, fill <code className="bg-muted px-1 rounded text-xs">bg-primary</code>, thumb rond bordé, <code className="bg-muted px-1 rounded text-xs">{'<input type="range">'}</code> natif transparent en overlay. Zéro dépendance externe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <SliderDemo />
          </div>
        </CardContent>
      </Card>

      {/* Slider — Doc cards */}
      <ComponentDoc
        meta={sliderMeta}
        guidelinesDescription="Règles d'utilisation pour le contrôle de plage numérique"
        antiPatternsDescription="Pièges à éviter sur le slider (input range nu, re-parsing de onValueChange)"
        examplesDescription="Patterns d'utilisation du composant Slider"
      />

      {/* Densité — Input & Select size="sm" */}
      <Card>
        <CardHeader>
          <CardTitle>Densité — taille compacte (size="sm")</CardTitle>
          <CardDescription>
            Tier compact <code className="bg-muted px-1 rounded text-xs">h-8</code> pour les barres d'outils et filtres de table ; les CTA d'en-tête de page restent en taille défaut <code className="bg-muted px-1 rounded text-xs">h-9</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="ds-input-default">Input — défaut (h-9)</Label>
              <Input
                id="ds-input-default"
                placeholder="Champ de formulaire"
                value={inputEmailDemo}
                onChange={(e) => setInputEmailDemo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-input-sm">Input — sm (h-8)</Label>
              <Input
                id="ds-input-sm"
                size="sm"
                type="search"
                placeholder="Filtrer les membres…"
                value={inputSmDemo}
                onChange={(e) => setInputSmDemo(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="ds-select-default">Select — défaut (h-9)</Label>
              <Select value={selectEventDemo} onValueChange={setSelectEventDemo}>
                <SelectTrigger id="ds-select-default" className="w-full">
                  <SelectValue placeholder="Sélectionner un événement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ag-2026">Réunion AG 2026</SelectItem>
                  <SelectItem value="gala-printemps">Gala de Printemps</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-select-sm">Select — sm (h-8)</Label>
              <Select value={selectSmDemo} onValueChange={setSelectSmDemo}>
                <SelectTrigger id="ds-select-sm" size="sm" className="w-full">
                  <SelectValue placeholder="Tous les rôles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rôles</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                  <SelectItem value="user">Membre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Règle : les tables denses et barres d'outils de filtre adoptent le tier compact <code className="bg-muted px-1 rounded text-xs">sm</code> (voir « Densité en contexte » ci-dessous).
          </p>
        </CardContent>
      </Card>

      {/* Densité en contexte — table dense + barre d'outils compacte (Lot C) */}
      <Card>
        <CardHeader>
          <CardTitle>Densité en contexte — table & barre d'outils</CardTitle>
          <CardDescription>
            Mise en situation du tier compact : barre d'outils <code className="bg-muted px-1 rounded text-xs">size="sm"</code> (Input + Select + boutons) au-dessus d'une table dense (<code className="bg-muted px-1 rounded text-xs">px-3 py-2</code>, en-têtes <code className="bg-muted px-1 rounded text-xs">text-xs</code>) — le pattern des pages d'administration (ex. « Membres »).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembersMockDemo />
        </CardContent>
      </Card>

      {/* Checkbox — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Checkbox — Exemple</CardTitle>
          <CardDescription>
            Case à cocher accessible (Radix) pour toute sélection binaire ou multiple : envoi d'invitation, sélection de lignes, filtres.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="ds-cb-invite"
              checked={checkboxInviteDemo}
              onCheckedChange={(v) => setCheckboxInviteDemo(v === true)}
            />
            <label htmlFor="ds-cb-invite" className="text-sm cursor-pointer">
              Envoyer une invitation par email
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ds-cb-terms"
              checked={checkboxTermsDemo}
              onCheckedChange={(v) => setCheckboxTermsDemo(v === true)}
            />
            <label htmlFor="ds-cb-terms" className="text-sm cursor-pointer">
              J'accepte les conditions d'utilisation
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ds-cb-news"
              checked={checkboxNewsletterDemo}
              onCheckedChange={(v) => setCheckboxNewsletterDemo(v === true)}
            />
            <label htmlFor="ds-cb-news" className="text-sm cursor-pointer">
              M'abonner à la newsletter
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Checkbox — Doc cards */}
      <ComponentDoc
        meta={checkboxMeta}
        guidelinesDescription="Règles d'utilisation pour les cases à cocher (label associé, valeur booléenne)"
        antiPatternsDescription="Pièges à éviter sur les cases à cocher (input natif, détournement en bascule)"
        examplesDescription="Patterns d'utilisation du composant Checkbox"
      />

      {/* RadioGroup — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>RadioGroup — Exemple</CardTitle>
          <CardDescription>
            Choix exclusif d'une option dans un petit ensemble (rôle, mode d'affichage) — basé sur Radix UI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={radioRoleDemo} onValueChange={setRadioRoleDemo}>
            <label htmlFor="ds-radio-user" className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="user" id="ds-radio-user" />
              <span className="text-sm">Membre</span>
            </label>
            <label htmlFor="ds-radio-admin" className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="admin" id="ds-radio-admin" />
              <span className="text-sm">Administrateur</span>
            </label>
            <label htmlFor="ds-radio-guest" className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="guest" id="ds-radio-guest" />
              <span className="text-sm">Invité ponctuel</span>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* RadioGroup — Doc cards */}
      <ComponentDoc
        meta={radioGroupMeta}
        guidelinesDescription="Règles d'utilisation pour les groupes de boutons radio (label, valeur contrôlée)"
        antiPatternsDescription="Pièges à éviter sur les boutons radio (input natif, choix non exclusif)"
        examplesDescription="Patterns d'utilisation du composant RadioGroup"
      />

      {/* Switch — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Switch — Exemple</CardTitle>
          <CardDescription>
            Bascule on/off d'un réglage à effet immédiat (notifications, visibilité) — basé sur Radix UI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Switch
              id="ds-switch-notify"
              checked={switchNotifyDemo}
              onCheckedChange={setSwitchNotifyDemo}
            />
            <label htmlFor="ds-switch-notify" className="text-sm cursor-pointer">
              Recevoir les notifications par email
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Switch — Doc cards */}
      <ComponentDoc
        meta={switchMeta}
        guidelinesDescription="Règles d'utilisation pour les bascules (réglage on/off à effet immédiat)"
        antiPatternsDescription="Pièges à éviter sur les bascules (confusion avec Checkbox, action différée)"
        examplesDescription="Patterns d'utilisation du composant Switch"
      />
    </>
  )
}
