import type { Request, Response } from 'express'
import { analyticsService } from '../services/analytics.service'
import { UUID_RE } from '../lib/constants'

function parseEventId(req: Request): string | undefined {
  const { event_id } = req.query
  return typeof event_id === 'string' && event_id.trim() !== '' ? event_id.trim() : undefined
}

export const getBookingTimestamps = async (req: Request, res: Response): Promise<void> => {
  const eventId = parseEventId(req)
  if (!eventId || !UUID_RE.test(eventId)) {
    res.status(400).json({ error: 'event_id requis (UUID valide)' })
    return
  }
  try {
    res.json({ data: await analyticsService.getBookingTimestamps(eventId) })
  } catch (error) {
    console.error('Error fetching booking timestamps:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des horodatages de réservation' })
  }
}

export const getEventActivity = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ data: await analyticsService.getEventActivity() })
  } catch (error) {
    console.error('Error fetching event activity:', error)
    res.status(500).json({ error: "Erreur lors de la récupération de l'activité des événements" })
  }
}

export const getEngagement = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await analyticsService.getEngagement(parseEventId(req))
    res.json({ data })
  } catch (error) {
    console.error('Error fetching engagement stats:', error)
    res.status(500).json({ error: "Erreur lors de la récupération des données d'engagement" })
  }
}
