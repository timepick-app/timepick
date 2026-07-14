import { query } from '../db'

/**
 * Type pour la configuration de polling
 */
export interface PollingConfig {
  interval: number
}

/**
 * Configuration par défaut du polling (30 secondes)
 */
const DEFAULT_POLLING_INTERVAL = 30000

/**
 * Type pour la configuration des magic links (exposé via l'API)
 */
export interface MagicLinkConfig {
  adminTTL: number    // secondes
  userTTL: number     // secondes
  sessionTTL: number  // secondes - durée de la session APRÈS connexion
}

/**
 * Valeurs par défaut pour les magic links
 */
const DEFAULT_ADMIN_TTL = 24 * 60 * 60            // 86400 secondes = 24 heures
const DEFAULT_USER_TTL = 7 * 24 * 60 * 60         // 604800 secondes = 7 jours
const DEFAULT_SESSION_TTL = 2 * 60 * 60           // 7200 secondes = 2 heures

/**
 * Service de gestion de la configuration application
 * Gère les configurations stockées dans la table app_config
 */
export const configService = {
  /**
   * Récupérer la fréquence de polling configurée
   * @returns La configuration de polling avec l'intervalle en millisecondes
   */
  async getPollingInterval(): Promise<PollingConfig> {
    const result = await query(
      `SELECT value FROM app_config WHERE key = 'polling_interval'`
    )

    // Si pas de config, utiliser la valeur par défaut
    if (result.rows.length === 0) {
      return { interval: DEFAULT_POLLING_INTERVAL }
    }

    // Convertir la valeur TEXT en number
    const interval = parseInt(result.rows[0].value, 10)

    // Si la valeur est invalide, retourner la valeur par défaut
    if (isNaN(interval)) {
      return { interval: DEFAULT_POLLING_INTERVAL }
    }

    return { interval }
  },

  /**
   * Mettre à jour la fréquence de polling
   * @param interval - Nouvel intervalle en millisecondes
   * @returns La configuration mise à jour
   * @note La validation des limites (10s-120s) est faite par le validator Zod dans le controller
   */
  async updatePollingInterval(interval: number): Promise<PollingConfig> {
    // Upsert : insérer ou mettre à jour la valeur
    await query(
      `INSERT INTO app_config (key, value) VALUES ('polling_interval', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [interval.toString()]
    )

    return { interval }
  },

  /**
   * Récupérer la configuration des magic links
   * @returns La configuration des TTL pour admin, user et session
   */
  async getMagicLinkConfig(): Promise<MagicLinkConfig> {
    const result = await query(
      `SELECT key, value FROM app_config WHERE key IN ('magic_link_admin_ttl', 'magic_link_user_ttl', 'session_ttl')`
    )

    const config: MagicLinkConfig = {
      adminTTL: DEFAULT_ADMIN_TTL,
      userTTL: DEFAULT_USER_TTL,
      sessionTTL: DEFAULT_SESSION_TTL,
    }

    for (const row of result.rows) {
      const value = parseInt(row.value, 10)
      if (!isNaN(value)) {
        switch (row.key) {
          case 'magic_link_admin_ttl':
            config.adminTTL = value
            break
          case 'magic_link_user_ttl':
            config.userTTL = value
            break
          case 'session_ttl':
            config.sessionTTL = value
            break
        }
      }
    }

    return config
  },

  /**
   * Récupérer uniquement le TTL de session
   * @returns Le TTL de session en secondes
   */
  async getSessionTTL(): Promise<number> {
    const result = await query(
      `SELECT value FROM app_config WHERE key = 'session_ttl'`
    )

    // Si pas de config, utiliser la valeur par défaut
    if (result.rows.length === 0) {
      return DEFAULT_SESSION_TTL
    }

    const ttl = parseInt(result.rows[0].value, 10)

    // Si la valeur est invalide, retourner la valeur par défaut
    if (isNaN(ttl)) {
      return DEFAULT_SESSION_TTL
    }

    return ttl
  },

  /**
   * Mettre à jour la configuration des magic links
   * @param adminTTL - TTL pour les admins en secondes
   * @param userTTL - TTL pour les utilisateurs en secondes
   * @param sessionTTL - TTL de session après connexion en secondes
   * @returns La configuration mise à jour
   * @note La validation des limites est faite par le validator Zod dans le controller
   */
  async updateMagicLinkConfig(adminTTL: number, userTTL: number, sessionTTL: number): Promise<MagicLinkConfig> {
    // Upsert pour chaque valeur
    await query(
      `INSERT INTO app_config (key, value) VALUES
        ('magic_link_admin_ttl', $1),
        ('magic_link_user_ttl', $2),
        ('session_ttl', $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [adminTTL.toString(), userTTL.toString(), sessionTTL.toString()]
    )

    return { adminTTL, userTTL, sessionTTL }
  }
}
