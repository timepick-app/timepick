import { getEmailBrandSettingsHandler, patchEmailBrandSettingsHandler } from '../../controllers/email-brand-settings.controller'
import { EmailBrandSettingsNotFoundError } from '../../db/email-brand-settings.db'

jest.mock('../../db/email-brand-settings.db')

import * as db from '../../db/email-brand-settings.db'

function mockRes() {
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as import('express').Response
  return res
}

describe('email-brand-settings.controller — error paths', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('GET returns 500 when singleton row is missing', async () => {
    ;(db.getEmailBrandSettings as jest.Mock).mockRejectedValue(new EmailBrandSettingsNotFoundError())
    const req = {} as import('express').Request
    const res = mockRes()

    await getEmailBrandSettingsHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la récupération des paramètres de marque' },
    })
  })

  it('PATCH returns 500 when updateEmailBrandSettings throws EmailBrandSettingsNotFoundError', async () => {
    ;(db.updateEmailBrandSettings as jest.Mock).mockRejectedValue(new EmailBrandSettingsNotFoundError())
    const req = { body: { primaryColor: '#ff0000' } } as import('express').Request
    const res = mockRes()

    await patchEmailBrandSettingsHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la mise à jour des paramètres de marque' },
    })
  })
})
