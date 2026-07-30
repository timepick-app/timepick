import api, { type ApiResponse } from './api'

/**
 * Identité publique de l'organisation hébergée par l'instance.
 *
 * Miroir camelCase des clés `app_config` `organization_*` (+ `homepage_mode`).
 * Convention de non-configuration : **chaîne vide**, jamais `null` — le serveur
 * normalise l'absence de clé en `''` pour que le client n'ait qu'un seul cas à
 * traiter (`name.trim() === ''` ⇒ identité non configurée).
 *
 * `homepageFacade` reflète `homepage_mode !== 'login'` : `false` = l'organisation
 * veut un mur de login sec (cf. Q3 de la note d'étude).
 */
export interface OrganizationSettings {
  /** Nom affiché (façade `/`, en-tête public). `''` si non configuré. */
  name: string
  /** URL absolue du logo servie par le driver de stockage. `''` si absent. */
  logo: string
  /** Sous-titre de la façade. `''` si absent. */
  description: string
  /** `false` ⇒ la racine `/` reste un simple renvoi vers `/login`. */
  homepageFacade: boolean
}

/**
 * Plafond de caractères VISIBLES de la description (compteur `RichTextEditor`).
 * Le serveur borne la chaîne HTML à 5000 caractères
 * (`organization.validator.ts`) : la marge absorbe le balisage `<strong>` /
 * `<a href>` produit par l'éditeur.
 */
export const ORGANIZATION_DESCRIPTION_MAX_LENGTH = 1000

/**
 * Plafond du nom, aligné sur `MAX_NAME_LENGTH` du validateur serveur
 * (`organization.validator.ts`). Porté par `maxLength` sur le champ : la borne
 * devient inatteignable côté client, donc jamais une condition de validité à
 * gérer au clic (R10 bis du design system).
 */
export const ORGANIZATION_NAME_MAX_LENGTH = 200

/**
 * `GET /api/public/organization` — endpoint anonyme, contrat de non-fuite :
 * il n'expose que l'identité destinée à la façade, aucun réglage d'instance.
 */
export const getPublicOrganization = async (): Promise<OrganizationSettings> => {
  const { data } = await api.get<ApiResponse<OrganizationSettings>>('/public/organization')
  return data.data
}
