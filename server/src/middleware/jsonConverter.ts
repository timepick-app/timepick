import { Request, Response, NextFunction } from 'express'

/**
 * Middleware pour convertir les réponses API de snake_case à camelCase
 *
 * Ce middleware intercepte les appels à res.json() pour convertir
 * automatiquement les clés snake_case provenant de la base de données
 * en camelCase conforme aux conventions API TimePick.
 *
 * @example
 * { first_name: "Jean" } → { firstName: "Jean" }
 * { created_at: "2024-01-01" } → { createdAt: "2024-01-01" }
 */
export const snakeToCamelMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const originalJson = res.json.bind(res)

  res.json = function (data: unknown): Response {
    const converted = convertKeysToCamelCase(data)
    return originalJson(converted)
  }

  next()
}

/**
 * Convertit récursivement les clés snake_case en camelCase
 *
 * Gère les objets imbriqués, les tableaux et les valeurs primitives.
 * Préserve les valeurs null et undefined.
 *
 * @param obj - La donnée à convertir
 * @returns La donnée avec les clés converties en camelCase
 */
function convertKeysToCamelCase(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamelCase)
  }

  if (obj instanceof Date) {
    return obj
  }

  // Pour les objets standards
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = toCamelCase(key)
    result[camelKey] = convertKeysToCamelCase(value)
  }

  return result
}

/**
 * Convertit une chaîne snake_case en camelCase
 *
 * @param str - La chaîne à convertir
 * @returns La chaîne en camelCase
 *
 * @example
 * toCamelCase('first_name') → 'firstName'
 * toCamelCase('created_at') → 'createdAt'
 * toCamelCase('alreadyCamel') → 'alreadyCamel'
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}
