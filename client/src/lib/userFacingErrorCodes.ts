import { ERROR_CODES, type ErrorCode } from '@timepick/shared'

/**
 * Liste blanche des codes d'erreur serveur dont le message peut être affiché
 * tel quel à l'utilisateur.
 *
 * Le principe est l'inverse d'un filtre : **un code absent de cette liste est
 * invisible**, et l'appelant affiche sa propre phrase. Un filtre qui masque les
 * formulations reconnues comme techniques laisse toujours passer ce qu'il n'a
 * pas prévu — et on ne l'apprend qu'en le voyant à l'écran.
 *
 * Les clés indexent `ERROR_CODES` (`@timepick/shared`) au lieu de recopier des
 * chaînes : un code renommé côté serveur casse ce fichier à la compilation. Le
 * `satisfies` rejette en plus toute clé qui n'existe pas dans le contrat.
 * Le contrat est volontairement plus large que cette liste — être émis par
 * l'API et être montrable sont deux choses distinctes.
 *
 * Pour ajouter un code : vérifier que **tous** ses messages, sur tous les
 * endpoints qui l'émettent, sont des phrases françaises destinées à un
 * utilisateur. Un seul message technique suffit à disqualifier le code — il
 * cesse alors d'être un discriminant fiable.
 *
 * ⚠️ `VALIDATION_ERROR` et `INTERNAL_ERROR` ne doivent JAMAIS y figurer ; la
 * raison est écrite à côté de leur déclaration dans le contrat partagé.
 *
 * La valeur de chaque entrée dit pourquoi le code est digne de confiance ;
 * elle n'est jamais affichée.
 */
export const USER_FACING_ERROR_CODES = {
  // Conflits métier — les meilleurs messages du produit, écrits pour le membre
  // qui réserve.
  [ERROR_CODES.SLOT_FULL]: 'Créneau complet — phrase de repli explicite, propose une action',
  [ERROR_CODES.SLOT_PAST]: "Créneau passé — explique pourquoi l'inscription est refusée",
  [ERROR_CODES.SLOT_CANCELLED]: 'Créneau annulé — explique pourquoi la modification est refusée',
  [ERROR_CODES.SLOT_ALREADY_CANCELLED]: 'Créneau déjà annulé — état, pas jargon',
  [ERROR_CODES.ALREADY_BOOKED]: 'Réservation déjà posée — état, pas jargon',

  // Conflits d'administration — la cause exacte du refus n'est connue que du
  // serveur, et c'est elle qui dit à l'admin quoi faire. Sans ces codes, quatre
  // refus distincts se confondraient dans une même phrase générique.
  [ERROR_CODES.EMAIL_ALREADY_EXISTS]: 'Adresse déjà utilisée — nomme la cause du refus',
  [ERROR_CODES.LAST_ADMIN]: 'Dernier administrateur — explique pourquoi le refus est structurel',
  [ERROR_CODES.SELF_DELETE_FORBIDDEN]: 'Suppression de son propre compte — refus explicite',
  [ERROR_CODES.EVENT_NAME_TAKEN]: "Nom d'événement déjà pris — propose l'action (en choisir un autre)",
  [ERROR_CODES.EVENT_NAME_REQUIRED]: "Publication refusée faute de nom — dit exactement quoi corriger",

  // Limitation de débit — message dynamique (« patienter N secondes »),
  // impossible à reproduire côté client sans perdre le décompte.
  [ERROR_CODES.RATE_LIMITED]: "Délai d'attente dynamique, non reproductible côté client",

  // Authentification par lien magique — l'état du lien n'est connu que du
  // serveur.
  [ERROR_CODES.TOKEN_EXPIRED]: 'Expiration du lien — état connu du serveur seul',
  [ERROR_CODES.TOKEN_NOT_ACTIVE]: 'Lien pas encore actif — état connu du serveur seul',
  [ERROR_CODES.INVALID_TOKEN]: 'Lien invalide — phrase courte et non technique',
  [ERROR_CODES.TOKEN_ALREADY_USED]: 'Lien déjà utilisé — état connu du serveur seul',
  [ERROR_CODES.UNAUTHORIZED]: 'Authentification requise — phrase non technique',
  [ERROR_CODES.ADMIN_ONLY]: 'Accès réservé aux administrateurs — nomme la condition manquante',
  [ERROR_CODES.EVENT_ACCESS_DENIED]: "Événement non partagé avec ce membre — nomme la cause du refus",

  // Configuration initiale.
  [ERROR_CODES.SETUP_IN_PROGRESS]: 'Configuration concurrente — invite à réessayer',
  [ERROR_CODES.SETUP_ALREADY_DONE]: 'Configuration déjà faite — indique où aller',

  // Envoi d'e-mail : la cause exacte (SMTP absent, hôte refusé, service
  // indisponible) n'est connue que du serveur et dicte l'action de l'admin.
  [ERROR_CODES.SMTP_NOT_CONFIGURED]: "Dit à l'admin où configurer l'envoi",
  [ERROR_CODES.SMTP_HOST_BLOCKED]: "Dit pourquoi l'hôte est refusé",
  [ERROR_CODES.EMAIL_SERVICE_UNAVAILABLE]: 'Panne temporaire — invite à réessayer plus tard',
  [ERROR_CODES.EMAIL_SEND_FAILED]: 'Dit quoi vérifier (configuration SMTP)',
  [ERROR_CODES.SEND_FAILED]: 'Dit quoi vérifier (configuration SMTP)',
  [ERROR_CODES.RESEND_NOT_AVAILABLE]: "Dit à qui s'adresser",

  // Clé de chiffrement gérée par l'environnement.
  [ERROR_CODES.KEY_ENV_MANAGED]: 'Explique pourquoi la clé ne peut pas être révélée',

  // Ressources absentes — messages de la forme « X non trouvé », qui nomment
  // l'objet manquant sans citer de champ technique.
  //
  // ⚠️ `NOT_FOUND` est **délibérément absent**. C'est le code par défaut d'une
  // `NotFoundError` dont le lanceur n'a pas nommé le code : le laisser entrer
  // rendrait affichable tout message « X non trouvé » écrit n'importe où, y
  // compris « Association utilisateur-événement non trouvée ». Ne pas le
  // réintroduire — nommer le code au lancer, c'est le geste correct.
  [ERROR_CODES.EVENT_NOT_FOUND]: "Événement absent — nomme l'objet, pas le champ",
  [ERROR_CODES.EVENT_NOT_PUBLISHED]: 'Événement non publié — état métier',
  [ERROR_CODES.SLOT_NOT_FOUND]: "Créneau absent — nomme l'objet, pas le champ",
  [ERROR_CODES.BOOKING_NOT_FOUND]: "Réservation absente — nomme l'objet, pas le champ",
  [ERROR_CODES.USER_NOT_FOUND]: "Utilisateur absent — nomme l'objet, pas le champ",
  [ERROR_CODES.USER_NOT_INVITED]: "Membre non sélectionné pour l'événement — nomme la cause",
  // `TEMPLATE_NOT_FOUND` et `INVITATION_TEMPLATE_NOT_FOUND` sont **délibérément
  // absents** : leurs messages disent « template » (le client dit « modèle »)
  // et citent `"invitation"`, la clé d'un enregistrement en base. Ce sont des
  // diagnostics d'exploitation — une base incomplète, que l'admin ne répare pas
  // depuis l'interface — et leur place est le journal, où ils sont déjà écrits.

  // Requêtes refusées à cause de leur contenu — chacune dit à l'utilisateur
  // quoi corriger dans le fichier ou le formulaire qu'il vient de soumettre.
  [ERROR_CODES.NO_FIELDS_TO_UPDATE]: 'Formulaire sans modification — dit pourquoi rien ne part',
  [ERROR_CODES.NO_FILE_RECEIVED]: 'Aucun fichier reçu — dit ce qui manque',
  [ERROR_CODES.EMPTY_FILE]: 'Fichier vide — dit ce qui cloche dans le fichier fourni',
  [ERROR_CODES.FILE_TOO_LARGE]: 'Fichier trop volumineux — porte la limite exacte',
  // `UPLOAD_INVALID_FILE` est **délibérément absent** : ses trois émetteurs
  // disent tous « Erreur upload — fichier invalide », un anglicisme qui
  // n'apprend rien. Les phrases des appelants sont meilleures sur les trois
  // surfaces (« Le téléversement du logo a échoué. Le logo actuel n'a pas été
  // modifié, réessayez. »).
  [ERROR_CODES.UNSUPPORTED_IMAGE]: "Format, taille ou intégrité de l'image — dit quoi corriger",
  [ERROR_CODES.CSV_FORMAT_ERROR]: "Structure ou encodage du CSV — dit quoi corriger dans l'export",
  // Corps d'e-mail refusé à l'écriture : le serveur seul sait QUELLE construction
  // (commentaire conditionnel, balise interdite, gestionnaire d'événement) est en
  // cause, et c'est elle qui dit à l'admin quoi retirer de son corps. Sans ce
  // code, le refus se confondrait avec toute autre erreur d'enregistrement.
  [ERROR_CODES.EMAIL_BODY_UNSAFE_CONTENT]: "Construction refusée dans le corps — nomme ce qu'il faut retirer",
} satisfies Partial<Record<ErrorCode, string>>
