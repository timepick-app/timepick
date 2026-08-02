/**
 * Source unique des codes d'erreur de l'API.
 *
 * Le serveur ne pose plus de littéral : il écrit `ERROR_CODES.SLOT_FULL`. Le
 * client n'en recopie plus : sa liste blanche indexe cet objet. Un code renommé
 * ici casse la compilation **des deux côtés** au lieu de disparaître en silence
 * de la liste blanche — ce qui était le mode de panne : le message serveur
 * cessait de s'afficher sans qu'aucun test ne bouge.
 *
 * Ce n'est pas une `enum` TypeScript : le dépôt n'en contient aucune, le client
 * compile sous `erasableSyntaxOnly` (qui les interdit), et une `enum` de chaînes
 * refuse `'SLOT_FULL'` là où le type est attendu — friction inutile dans les
 * ~2 000 assertions de test qui comparent des chaînes. Un objet figé plus une
 * union dérivée donnent exactement la même garantie de renommage.
 *
 * **Un code ne se crée pas sans son message.** Tout code ajouté ici arrive avec
 * la phrase qu'il porte côté serveur, et cette phrase dit à l'utilisateur ce qui
 * a échoué, ce qu'il en est de son travail, et quoi faire ensuite. Un code dont
 * le message n'apprend rien de plus que le repli de l'appelant n'a pas à exister.
 *
 * Un code présent ici n'est pas affichable pour autant : l'affichage se décide
 * dans la liste blanche du client, volontairement plus petite.
 */
export const ERROR_CODES = {
  // --- Conflits métier sur les créneaux ------------------------------------
  /** Capacité atteinte pendant que l'utilisateur hésitait. */
  SLOT_FULL: 'SLOT_FULL',
  /** Créneau déjà commencé : inscription et annulation refusées. */
  SLOT_PAST: 'SLOT_PAST',
  /** Créneau annulé par un admin : plus modifiable. */
  SLOT_CANCELLED: 'SLOT_CANCELLED',
  /** Annulation demandée sur un créneau déjà annulé. */
  SLOT_ALREADY_CANCELLED: 'SLOT_ALREADY_CANCELLED',
  /** L'utilisateur a déjà une réservation sur ce créneau. */
  ALREADY_BOOKED: 'ALREADY_BOOKED',
  /** Défaut de `ConflictError` quand l'appelant n'a pas nommé son conflit. */
  CONFLICT: 'CONFLICT',

  // --- Ressources absentes --------------------------------------------------
  /**
   * Code-seau : porte le `message` d'une `NotFoundError` relayée telle quelle.
   * Ses émetteurs n'appellent qu'`eventService`, dont le seul message est
   * « Événement non trouvé ». Sûreté d'accessibilité, pas de contrat — brancher
   * un service qui lève sa propre `NotFoundError` élargit silencieusement ce qui
   * s'affiche. Préférer un code nommé à chaque fois que c'est possible.
   */
  NOT_FOUND: 'NOT_FOUND',
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  /** Événement existant mais pas encore publié. */
  EVENT_NOT_PUBLISHED: 'EVENT_NOT_PUBLISHED',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  /** Utilisateur non rattaché à l'événement visé (`event_users`). */
  USER_NOT_INVITED: 'USER_NOT_INVITED',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  /** Le modèle global « invitation » manque en base. */
  INVITATION_TEMPLATE_NOT_FOUND: 'INVITATION_TEMPLATE_NOT_FOUND',

  // --- Refus d'accès --------------------------------------------------------
  /**
   * Refus d'accès sur une route métier, énoncé par le contrôleur pour un
   * utilisateur. À ne pas confondre avec `SESSION_INVALID` ci-dessous.
   */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /**
   * La session ne tient plus : en-tête absent, jeton expiré ou illisible,
   * utilisateur disparu. C'est le verdict du **middleware** d'authentification,
   * pas d'un contrôleur — ses messages (« Token expiré », « Token invalide »)
   * sont écrits pour un journal, jamais pour un écran.
   *
   * **Jamais en liste blanche, et c'est tout l'intérêt du code :** l'appelant
   * affiche sa propre phrase (« La modification du créneau a échoué. Vos
   * modifications sont toujours à l'écran, réessayez. »), qui dit à
   * l'utilisateur ce qu'il advient de son travail — ce qu'un « Token expiré »
   * ne dit pas. L'information « votre session a expiré », elle, est déjà portée
   * par la redirection vers `/login?reason=session_expired`.
   */
  SESSION_INVALID: 'SESSION_INVALID',
  /** Session valide, mais la route exige le rôle admin. */
  ADMIN_ONLY: 'ADMIN_ONLY',
  /** Membre authentifié qui n'est pas invité sur cet événement. */
  EVENT_ACCESS_DENIED: 'EVENT_ACCESS_DENIED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Lien magique émis pour plus tard (`nbf` non atteint). */
  TOKEN_NOT_ACTIVE: 'TOKEN_NOT_ACTIVE',
  INVALID_TOKEN: 'INVALID_TOKEN',
  /** Lien magique déjà consommé : un lien n'ouvre qu'une seule session. */
  TOKEN_ALREADY_USED: 'TOKEN_ALREADY_USED',
  /**
   * Connexion de secours refusée. Volontairement **indistinct** : mauvais code,
   * compte inconnu et compte verrouillé répondent le même 401 sans message,
   * pour ne pas offrir d'oracle d'énumération. Jamais en liste blanche — il n'y
   * a pas de message à montrer, et c'est le but.
   */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // --- Conflits d'administration -------------------------------------------
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  /** Rétrogradation ou suppression du dernier administrateur. */
  LAST_ADMIN: 'LAST_ADMIN',
  SELF_DELETE_FORBIDDEN: 'SELF_DELETE_FORBIDDEN',
  EVENT_NAME_TAKEN: 'EVENT_NAME_TAKEN',
  /** Événement sans nom : la publication est refusée tant qu'il n'en a pas. */
  EVENT_NAME_REQUIRED: 'EVENT_NAME_REQUIRED',

  // --- Requête refusée à cause de ce qu'elle contient -----------------------
  /** Corps de mise à jour sans aucun champ modifiable. */
  NO_FIELDS_TO_UPDATE: 'NO_FIELDS_TO_UPDATE',
  NO_FILE_RECEIVED: 'NO_FILE_RECEIVED',
  EMPTY_FILE: 'EMPTY_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  /** Téléversement rejeté par multer avant tout traitement. */
  UPLOAD_INVALID_FILE: 'UPLOAD_INVALID_FILE',
  /** Image au format non géré, trop grande, illisible ou corrompue. */
  UNSUPPORTED_IMAGE: 'UNSUPPORTED_IMAGE',
  /** CSV illisible, mal encodé, ou en-tête « email » manquant. */
  CSV_FORMAT_ERROR: 'CSV_FORMAT_ERROR',
  /**
   * Corps d'e-mail refusé à l'écriture : il porte une construction que le
   * sanitiseur de sortie ne peut pas neutraliser (commentaire HTML transportant
   * du balisage, dont les commentaires conditionnels Outlook) ou un vecteur
   * exécutable (balise interdite, attribut de gestionnaire, URI `javascript:`).
   * Message montrable : il nomme la construction à retirer, sans citer de champ
   * technique ni recopier la charge refusée.
   */
  EMAIL_BODY_UNSAFE_CONTENT: 'EMAIL_BODY_UNSAFE_CONTENT',
  /** Paramètre `email` absent de la requête de validation d'adresse. */
  MISSING_EMAIL: 'MISSING_EMAIL',

  // --- Débit ----------------------------------------------------------------
  /** Message dynamique (« patienter N secondes »), non reproductible côté client. */
  RATE_LIMITED: 'RATE_LIMITED',

  // --- Envoi d'e-mail -------------------------------------------------------
  SMTP_NOT_CONFIGURED: 'SMTP_NOT_CONFIGURED',
  /** Hôte SMTP refusé parce qu'il pointe une adresse interne. */
  SMTP_HOST_BLOCKED: 'SMTP_HOST_BLOCKED',
  EMAIL_SERVICE_UNAVAILABLE: 'EMAIL_SERVICE_UNAVAILABLE',
  /** Échec d'envoi du lien de connexion pendant la configuration initiale. */
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  /** Échec d'un envoi de test depuis l'éditeur de modèles. */
  SEND_FAILED: 'SEND_FAILED',
  /** Renvoi d'invitation impossible pour cette invitation-là. */
  RESEND_NOT_AVAILABLE: 'RESEND_NOT_AVAILABLE',

  // --- Configuration initiale ----------------------------------------------
  SETUP_IN_PROGRESS: 'SETUP_IN_PROGRESS',
  SETUP_ALREADY_DONE: 'SETUP_ALREADY_DONE',

  // --- Clé de chiffrement ---------------------------------------------------
  /** Clé fournie par l'environnement : ni révélable ni régénérable depuis l'app. */
  KEY_ENV_MANAGED: 'KEY_ENV_MANAGED',

  // --- Techniques : ces deux-là ne doivent JAMAIS entrer en liste blanche ----
  /**
   * Relaie le premier message Zod tel quel : phrases correctes et jargon de
   * schéma se mélangent sous le même code, qui cesse donc d'être un discriminant.
   */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Repli générique : n'apprend rien de plus que la phrase de l'appelant. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

/** Union de tous les codes d'erreur émis par l'API. */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
