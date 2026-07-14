#!/usr/bin/env ts-node
/**
 * Script de seed pour créer 500 créneaux de test pour les tests de performance FullCalendar
 *
 * Usage:
 *   npm run seed:500-slots -- <event-id>
 *
 * Si event-id n'est pas fourni, un événement de test sera créé automatiquement.
 *
 * Story: 12-4-test-performance-fullcalendar
 */

import { query } from '../db'
import { randomUUID } from 'node:crypto'

interface SlotInput {
  event_id: string
  start_time: Date
  end_time: Date
  capacity: number
}

/**
 * Crée un événement de test si aucun event_id n'est fourni
 */
async function createTestEvent(): Promise<string> {
  const eventId = randomUUID()
  const eventName = 'Performance Test Event - 500 Slots'

  await query(
    `INSERT INTO events (id, name, description, is_published, end_date)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      eventId,
      eventName,
      'Événement créé automatiquement pour les tests de performance FullCalendar (Story 12-4)',
      true,
      new Date('2027-12-31') // End date dans un an
    ]
  )

  console.log(`✅ Événement de test créé: ${eventName}`)
  console.log(`   Event ID: ${eventId}`)

  return eventId
}

/**
 * Génère 500 créneaux répartis sur une année complète
 * ~5 créneaux par jour (9h, 10h, 11h, 12h, 13h)
 */
function generate500Slots(eventId: string): SlotInput[] {
  const slots: SlotInput[] = []
  const startDate = new Date('2026-01-01T09:00:00')

  for (let i = 0; i < 500; i++) {
    // Calculer la date du créneau (~5 créneaux par jour = 100 jours)
    const dayOffset = Math.floor(i / 5)
    const slotDate = new Date(startDate)
    slotDate.setDate(slotDate.getDate() + dayOffset)

    // Calculer l'heure (9h, 10h, 11h, 12h, 13h)
    const hourOffset = i % 5
    const startTime = new Date(slotDate)
    startTime.setHours(9 + hourOffset, 0, 0, 0)

    const endTime = new Date(startTime)
    endTime.setHours(startTime.getHours() + 1)

    // Vérifier que les dates/heures sont valides
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      console.error(`⚠️ Date invalide pour le slot ${i}, skipping`)
      continue
    }

    slots.push({
      event_id: eventId,
      start_time: startTime,
      end_time: endTime,
      capacity: 5 // Capacité fixe pour tous les créneaux
    })
  }

  return slots
}

/**
 * Insère les créneaux dans la base de données par lots de 50
 */
async function insertSlots(slots: SlotInput[]): Promise<void> {
  const batchSize = 50
  let insertedCount = 0

  for (let i = 0; i < slots.length; i += batchSize) {
    const batch = slots.slice(i, i + batchSize)

    for (const slot of batch) {
      await query(
        `INSERT INTO slots (id, event_id, start_time, end_time, capacity)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), slot.event_id, slot.start_time, slot.end_time, slot.capacity]
      )
      insertedCount++
    }

    console.log(`   Progress: ${insertedCount}/${slots.length} créneaux insérés`)
  }
}

/**
 * Vérifie le nombre de créneaux pour l'événement
 */
async function verifySlotCount(eventId: string, expectedCount: number): Promise<void> {
  const result = await query(
    `SELECT COUNT(*) as count FROM slots WHERE event_id = $1`,
    [eventId]
  )

  const actualCount = parseInt(result.rows[0].count, 10)

  if (actualCount === expectedCount) {
    console.log(`✅ Vérification réussie: ${actualCount} créneaux dans la base`)
  } else {
    console.warn(`⚠️ Attendu: ${expectedCount}, Actuel: ${actualCount}`)
  }
}

/**
 * Fonction principale
 */
async function main() {
  const args = process.argv.slice(2)
  let eventId = args[0]

  console.log('🌱 Seed 500 Slots - Script de création pour tests de performance')
  console.log('===============================================================\n')

  try {
    // Créer ou utiliser l'événement
    if (!eventId) {
      console.log('Aucun event_id fourni, création d\'un événement de test...')
      eventId = await createTestEvent()
    } else {
      console.log(`Utilisation de l'événement existant: ${eventId}`)
    }

    // Générer les 500 créneaux
    console.log('\nGénération de 500 créneaux...')
    const slots = generate500Slots(eventId)
    console.log(`✅ ${slots.length} créneaux générés en mémoire`)

    // Insérer les créneaux
    console.log('\nInsertion des créneaux dans la base de données...')
    await insertSlots(slots)

    // Vérifier
    console.log('\nVérification du nombre de créneaux...')
    await verifySlotCount(eventId, slots.length)

    console.log('\n✅ Terminé avec succès!')
    console.log(`\n📝 Pour tester la performance, utilisez l'Event ID: ${eventId}`)
    console.log('   Accédez à: http://localhost:5173/admin/events/<event-id>/edit?tab=slots')

  } catch (error) {
    console.error('\n❌ Erreur lors du seed:', error)
    process.exit(1)
  }
}

// Exécuter le script
main()
