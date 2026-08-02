# Éditeur d'e-mails MJML — surfaces à exercer avant de déclarer vérifié

Ce dossier monte **un seul** composant d'éditeur (`MjmlEditorOverlay`) sur **10 surfaces** dont le
comportement de coque diffère. Une vérification qui n'en exerce qu'une ne dit rien des neuf autres :
le chantier de la coque du 2026-07-30 n'en avait exercé **qu'une** avant d'être déclaré vérifié, et
c'est en ouvrant les éditeurs système après coup qu'un commentaire faux a été découvert.

Ce document n'est pas une spécification — la règle produit est la **politique de personnalisation de
la coque email** (documentation privée du dépôt, § « Affichage à l'utilisateur »). C'est une liste de
contrôle : *où cliquer*, et *quoi lire*.

## Ce qu'il faut lire sur chaque surface

Quatre observables, toujours les mêmes, dans cet ordre :

1. **Pastille de structure** — « En-tête » / « Corps » / « Pied », épingle, gris neutre. Exigée
   *toujours affichée* sur chaque bloc rendu. Portée par le pseudo-élément `::before` de
   `[data-locked-label]` : elle se lit sur le `content` **calculé**, jamais sur l'attribut — un
   sélecteur qui ne matche pas laisse les attributs intacts et n'affiche rien (c'est ainsi que cette
   étiquette est restée muette pendant des mois).
2. **Pastille d'héritage** — « Hérité du modèle » / « Hérité de la marque » / « Contenu d'origine »,
   flèche, ambre. Pseudo-élément `::after`, conditionné à `data-inherited="true"`.
3. **Estompage du contenu** — `opacity: 0.55` sur les enfants d'un bloc hérité, et **1** partout
   ailleurs. Un bloc estompé sans pastille ambre, ou l'inverse, est un défaut : les trois marques
   (liseré, pastille, estompage) partent ensemble.
4. **Badge de sélection** et **état du bouton « Enregistrer »** — `mjml-editor-structural-badge-overlay`
   et `mjml-editor-save-btn`. Le badge dit « modifiable, non supprimable » **ou** « hérité, non
   modifiable ici » ; il ne doit jamais annoncer « modifiable » quand le panneau d'héritage est
   monté à l'écran. **Deux formulations par état** : dès le palier « court » de la barre, le badge
   s'abrège en « Structurel — non supprimable » / « Hérité — pas encore personnalisé ». Les deux
   coexistent dans le DOM, une seule est rendue — donc lire le texte RENDU, pas le `textContent`,
   quand on vérifie ce point à la main.
5. **Paliers de la barre d'outils** — quatre tenues (`data-toolbar-tier` : `entier`, `court`,
   `resserre`, `icones`), choisies par **dégradation au débordement** : la barre mesure ce dont elle
   a besoin dans chaque tenue et retient **la plus lisible qui tient**. Il n'y a AUCUN seuil en
   pixels, et il ne doit pas y en avoir : le moment où une barre cède dépend de ce qu'elle porte,
   donc il diffère d'une barre à l'autre. `resserre` ne concède que la valeur du sélecteur de
   modèle ; il n'existe donc pas sur la barre d'un événement, qui n'en a pas.
   Trois défauts à guetter, tous gardés par `email-editor-toolbar-compaction.spec.ts` sur les six
   configurations : un palier affiché alors que le palier plus lisible TENAIT (du texte masqué pour
   rien — c'était le défaut d'avant le 2026-08-01), un titre tronqué alors qu'il reste du vide dans
   la barre (le même défaut, sur le dernier élément qui y échappait encore), et un retour à la ligne
   au-dessus de 440 px. Au palier `icones`, **aucun** bouton n'affiche de texte : une exception, si
   petite soit-elle, se lit comme un défaut d'affichage.
6. **Titre de la barre** — son plafond de largeur n'est PAS une constante. `useToolbarTier` publie
   `--tp-toolbar-title-max` = plafond de mesure (256 px, 160 au palier `icones`) **plus le mou
   restant**. Un plafond permanent coupait 144 px d'un nom d'événement pendant que 463 px restaient
   vides sur la même ligne. Le plafond de mesure, lui, reste indispensable : sans lui un nom long
   ouvre une ligne à lui seul et rompt la barre à TOUTE largeur.
7. **Ligne Objet** — `email-subject-line`, entre la barre d'outils et le canevas, sur **les 10
   surfaces**. Quatre choses à y lire, dans cet ordre :
   - elle affiche l'objet **INTERPOLÉ**, jamais la source à jetons. Un `{{event_name}}` visible à
     l'écran est un défaut, pas un aperçu ;
   - au niveau **événement**, son badge dit « Hérité du modèle » tant que rien n'est personnalisé,
     et son popover ne contient alors **ni champ ni bouton de variable** — du texte et
     « Personnaliser ». Un champ verrouillé y serait une violation de la politique de coque ;
   - le badge qualifie **le texte affiché**, donc le brouillon, pas ce que la base porte encore :
     entre « revenir au modèle » et l'enregistrement, il doit suivre. Deux messages contradictoires
     sur la même ligne, c'est exactement la classe de défaut que ce document existe pour attraper ;
   - sa **hauteur ne bouge pas** quand le badge apparaît (28 px, posés en dur). Si elle bouge, le
     canevas GrapesJS se décale et ses poignées se désynchronisent — famille de bugs déjà payée
     deux fois. Le `magic_link_login` est le pire cas : il porte DEUX badges.
8. **Objet invalide** — taper `{{event_description}}` dans le popover. À vérifier ensemble : le
   message sous le champ **nomme le jeton**, la ligne remplace son aperçu par ce même motif, son
   crayon devient une icône d'alerte, et « Enregistrer » devient `aria-disabled` **sans** devenir
   `disabled` (il reste focalisable, et porte le motif en infobulle). Le motif est aussi présent en
   `sr-only` dans la barre d'outils, avant le groupe d'actions : c'est la cible d'`aria-describedby`.
   Il y est hors flux **à dessein** — visible, il ferait changer la barre de palier à l'instant même
   où l'erreur s'affiche.

## Les 10 surfaces

### A. Éditeur d'événement — `/admin/events/{eventId}/edit#template`

Attendre `event-invitation-preview-iframe`, puis cliquer `event-invitation-open-editor-btn`.

| # | Surface | Attendu |
|---|---|---|
| 1 | **bloc hérité** (aucune ligne `shell_parts` pour cet événement) | en-tête et pied : pastille ambre + estompage ; clic sur le bloc → panneau d'héritage (`mjml-editor-locked-panel-overlay`) ; badge « hérité, pas encore personnalisé ici » ; « Enregistrer » désactivé |
| 2 | **bloc déjà surchargé** (`shell_parts` @ `owner_kind='event'`) | ce bloc : pastille de structure **seule**, pas d'estompage ; clic → **aucun** panneau ; badge « modifiable, non supprimable » ; l'autre bloc reste hérité |

C'est **la seule surface** où le panneau d'héritage existe. Ailleurs, son absence est le comportement
correct, pas un bug.

### B. Onglet Invitation — `/admin/settings?tab=email-template&subtab=template-invitation`

Cliquer `invitation-open-editor-btn`.

| # | Surface | Attendu |
|---|---|---|
| 3 | **template général** | la coque y est **éditable** : pastilles de structure seules, aucune pastille ambre, aucun estompage, aucun panneau — **même quand l'origine résolue remonte à la marque ou au filet d'usine**. Ce niveau est une *source* de la cascade, pas un niveau qui hérite. |

### C. Les 7 éditeurs système — `/admin/settings?tab=email-template&subtab=<sous-onglet>`

Cliquer `system-open-editor-btn-<templateKey>`.

| # | Sous-onglet (`subtab=`) | Onglet affiché | `templateKey` |
|---|---|---|---|
| 4 | `emails-systeme-magic-link-login` | Connexion | `magic_link_login` |
| 5 | `emails-systeme-confirmation` | Confirmation | `reservation_confirmation` |
| 6 | `emails-systeme-account-created` | Création de compte | `account_created` |
| 7 | `emails-systeme-annulation` | Annulation | `cancellation_confirmation` |
| 8 | `emails-systeme-desinscription` | Désinscription | `unregistration_confirmation` |
| 9 | `emails-systeme-role-promu` | Promotion admin | `role_promoted` |
| 10 | `emails-systeme-role-retrograde` | Retour membre | `role_demoted` |

Attendu : en-tête **et** pied sont hérités (la coque ne s'édite que depuis l'onglet Invitation), donc
tous deux portent liseré ambre, pastille de provenance et estompage. Le corps n'est **jamais**
estompé (opacité 1) ; sa lecture seule se lit à l'**absence** du liseré vert + crayon, que seules les
deux zones éditables (accroche, signature) portent. **Aucun panneau d'héritage** : il est exclusif au
niveau événement.

Portée de cet « attendu » : **observé** sur `magic_link_login` (éditeur réel le 2026-07-30, et
asséré depuis par `tests/e2e/email-shell-locked-structure.spec.ts`). Sur les six autres, il est
**déduit** du prédicat commun `isShellBlockInherited`, qui ne dépend pas de la clé de modèle. La
déduction est solide sur la coque et ne l'est pas sur le corps : celui-ci diffère d'un modèle à
l'autre, et c'est là que les surprises se logent.

## Couverture de tests — ce qui est gardé, ce qui ne l'est pas

Cette table parle de **l'éditeur ouvert** — pastilles, estompage, badge, panneau. C'est le seul
périmètre de ce document, et la distinction est essentielle : les modèles système sont largement
testés **par ailleurs** (contenu composé par clé dans `__tests__/systemCanvas.test.ts`, qui couvre
les 7 clés ; panneaux d'accueil dans `client/src/components/admin/__tests__/`), ce qui ne dit rien
des signaux de coque une fois l'éditeur ouvert.

| Surface | L'éditeur ouvert est-il gardé ? |
|---|---|
| 1 — événement, bloc hérité | Oui — `tests/e2e/email-shell-parts-26-2d.spec.ts` Smoke A (panneau, pastilles, recouvrement, bascule vers éditable dans le même écran) |
| 2 — événement, bloc surchargé | Oui — `tests/e2e/email-shell-parts-26-2d.spec.ts` Smoke A, 2ᵉ cas + `__tests__/MjmlEditorOverlay.test.tsx` |
| 3 — onglet Invitation | Oui — `tests/e2e/email-shell-parts-26-2d.spec.ts` Smoke D + `__tests__/MjmlEditorOverlay.test.tsx` (routage du panneau) |
| 4 — Connexion (`magic_link_login`) | Oui, et c'est **la seule surface système** dans ce cas : `tests/e2e/email-shell-locked-structure.spec.ts` (en-tête ET pied hérités → deep-lock sur la section et tous ses descendants) et `tests/e2e/email-system-cta-lock.spec.ts` (CTA figé, zones accroche/signature éditables). Plus `__tests__/MjmlEditorOverlay.test.tsx` en unitaire, seule clé montée en `mode: 'system'`. |
| 5 à 10 — les 6 autres éditeurs système | **Non.** Aucun test n'ouvre leur éditeur. Leur corps est testé par clé (`systemCanvas.test.ts`) et la Confirmation a même une capture Playwright — mais **de son panneau d'accueil**, pas de l'éditeur (`tests/e2e/email-editor-overlay.spec.ts`). Sur les signaux de coque, ces six surfaces reposent entièrement sur le fait qu'elles partagent le composant et le prédicat de la surface 4. |

Conséquence pratique : `magic_link_login` est le représentant testé de la famille système **pour
l'éditeur**. Une modification des signaux de coque doit être ouverte à la main sur **au moins un
autre** éditeur système — c'est en en ouvrant un après coup, le 2026-07-30, qu'on a découvert un
commentaire faux qu'aucun test ne pouvait contredire.

**La barre d'outils est gardée à part, parce qu'elle est transverse aux 10 surfaces.**
`tests/e2e/email-editor-toolbar-compaction.spec.ts` défend une règle unique — *à toute largeur, la
barre affiche le palier le plus lisible qui tient* — et la vérifie dans les **deux sens** sur les six
configurations (trois barres × deux états de badge) : le palier affiché tient, ET le palier
immédiatement plus lisible ne tiendrait pas. Le second sens est le seul qui attrape le défaut
d'avant le 2026-08-01 ; sans lui, « tout en icônes partout » passerait le test. S'y ajoutent le titre
plafonné et tronqué (200 caractères ne rompent pas la barre), les **noms accessibles** aux trois
paliers, la monotonie de la dégradation de 1 400 à 440 px et retour, et `flex-wrap` en plancher.

La spec mesure le besoin de chaque palier **sur le rendu**, jamais sur un nombre écrit dans le code :
elle tourne donc telle quelle sur l'ancienne implémentation, où elle échoue. C'est ce qui en fait une
preuve et pas une tautologie.

Ce que les 6 captures de `email-editor-overlay.spec.ts` ne voient **pas** de cette barre : elles la
photographient avec le titre « Invitation » (71,8 px), très en dessous du plafond de 256 px — retirer
le plafond ne changerait pas un pixel. Ne pas s'y fier pour la barre.

**La ligne Objet est gardée à part elle aussi, et sa couverture est asymétrique.**
`__tests__/EmailSubjectLine.test.tsx` couvre le composant sur les deux niveaux — affichage
interpolé, trois états de badge, popover d'héritage sans champ, survie du brouillon à la fermeture,
retour au repli remontant `null`, Échap non propagé, insertion à la position du curseur, variantes
de `magic_link_login`. `tests/e2e/email-subject.spec.ts` fait le trajet complet jusqu'à l'en-tête lu
dans Mailpit, **au niveau modèle uniquement**. Ce qui n'est gardé par AUCUN test automatique : la
ligne montée dans les six éditeurs système autres que `magic_link_login` — même angle mort que pour
les signaux de coque, et pour la même raison. L'ouvrir à la main sur au moins un autre modèle reste
la seule vérification qui les couvre.

La parité de l'interpolation entre le client et le serveur a sa propre garde,
`server/src/__tests__/unit/email-subject-parity.test.ts` : elle importe les DEUX implémentations et
les compare sur un jeu de cas figé. Elle existe parce que l'asymétrie a déjà eu lieu — les
détecteurs du client toléraient `{{ nom }}` avec espaces que le serveur laisse littéral, donc
l'interface annonçait « reconnu » et l'e-mail partait avec les accolades visibles.

## Pièges de vérification déjà payés

- **La navigation vers une URL qui ne diffère que par le fragment (`#template`) ne recharge pas la
  page** — donc ne recharge pas le code modifié. Passer par une autre URL d'abord. Une heure perdue
  le 2026-07-30 à croire que le serveur de développement servait du code périmé.
- **Les pastilles vivent dans l'iframe du canvas**, pas dans le document hôte : elles sont
  inatteignables par un sélecteur posé sur la page. Passer par le document de l'iframe et lire le
  `content` calculé du pseudo-élément.
- **L'étiquette de nom de composant de GrapesJS vit dans le document hôte**, au-dessus de l'iframe :
  aucun `z-index` posé depuis l'intérieur ne peut la dépasser. Elle se rabat en haut à gauche du bloc
  le plus haut du canvas — d'où le décalage vertical de la pastille de structure.
- **Un test visuel ne remplace pas cette liste.** Sur une capture pleine page 1280×720, une tolérance
  de 2 % laisse passer 18 432 pixels : la disparition complète d'un bouton de 189×27 px n'y échoue
  pas.

Ces contrôles complètent, sans les remplacer, les cinq règles de vérification d'un changement
d'interface documentées dans les conventions du projet — dont trois sont désormais des tests.
