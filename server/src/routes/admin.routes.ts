import { Router, type Request, type Response, type NextFunction } from 'express'
import multer, { MulterError } from 'multer'
import { requireAdmin } from '../middleware/adminAuth'
import {
  getDashboardStats,
  createSlots,
  getUsers,
  getUserDetails,
  createUser,
  updateUser,
  deleteUser,
  exportUsers,
  bulkDeleteUsers,
  importUsers
} from '../controllers/admin.controller'
import { getAllEventsStats } from '../controllers/stats.controller'
import { getBookingTimestamps, getEngagement, getEventActivity } from '../controllers/analytics.controller'
import * as configController from '../controllers/config.controller'
import { validateUserEmail } from '../controllers/emailValidator.controller'
import { getEditorContextHandler } from '../controllers/editor-context.controller'
import * as exportController from '../controllers/export.controller'

const router = Router()

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

// Apply admin middleware to all routes
router.use(requireAdmin)

// Dashboard
router.get('/dashboard', getDashboardStats)

// Statistics
router.get('/stats', getAllEventsStats)

// Analytics (tableau de bord)
router.get('/analytics/bookings-raw', getBookingTimestamps)
router.get('/analytics/engagement', getEngagement)
router.get('/analytics/event-activity', getEventActivity)

// Slots management
router.post('/slots', createSlots)

// User management
router.get('/users', getUsers)
router.get('/users/export', exportUsers) // Must be before :id route
router.get('/users/validate-email', validateUserEmail) // Must be before :id route
router.get('/users/:id', getUserDetails)
router.post('/users', createUser)
router.put('/users/:id', updateUser)
router.delete('/users/:id', deleteUser)
router.post('/users/bulk-delete', bulkDeleteUsers)
router.post('/users/import', uploadCsv.single('file'), importUsers)

// Configuration management
router.get('/config/polling-interval', configController.getPollingInterval)
router.put('/config/polling-interval', configController.updatePollingInterval)
router.get('/config/magic-link', configController.getMagicLinkConfig)
router.put('/config/magic-link', configController.updateMagicLinkConfig)

// Editor context
router.get('/editor-context', getEditorContextHandler)

// Export
router.get('/events/:id/export/reservations', exportController.exportEventReservations)

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE'
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'Fichier trop volumineux (max 5 MB)' : 'Erreur upload — fichier invalide',
    })
    return
  }
  next(err)
})

export default router
