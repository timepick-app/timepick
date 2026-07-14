jest.mock('../../db/email-brand-settings.db')

import {
  getEmailBrandSettingsCached,
  invalidateEmailBrandCache,
} from '../email-brand-cache'
import {
  getEmailBrandSettings,
  EmailBrandSettingsNotFoundError,
  type EmailBrandSettings,
} from '../../db/email-brand-settings.db'

const mockedGet = getEmailBrandSettings as jest.MockedFunction<typeof getEmailBrandSettings>

const dto = (): EmailBrandSettings => ({
  logoUrl: null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  buttonBorderRadius: 6,
  updatedAt: new Date('2026-05-28T00:00:00Z'),
})

describe('email-brand-cache', () => {
  beforeEach(() => {
    invalidateEmailBrandCache()
    mockedGet.mockReset()
  })

  it('cache miss puis hit : un seul SELECT sur deux lectures consécutives', async () => {
    mockedGet.mockResolvedValue(dto())

    const first = await getEmailBrandSettingsCached()
    const second = await getEmailBrandSettingsCached()

    expect(mockedGet).toHaveBeenCalledTimes(1)
    expect(first).toEqual(dto())
    expect(second).toBe(first)
  })

  it('invalidation force un nouveau SELECT à la prochaine lecture', async () => {
    mockedGet.mockResolvedValue(dto())

    await getEmailBrandSettingsCached()
    invalidateEmailBrandCache()
    await getEmailBrandSettingsCached()

    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it("une erreur de lecture n'est pas mise en cache : la prochaine lecture retape la DB", async () => {
    mockedGet.mockRejectedValueOnce(new EmailBrandSettingsNotFoundError())
    mockedGet.mockResolvedValueOnce(dto())

    await expect(getEmailBrandSettingsCached()).rejects.toBeInstanceOf(EmailBrandSettingsNotFoundError)
    const recovered = await getEmailBrandSettingsCached()

    expect(mockedGet).toHaveBeenCalledTimes(2)
    expect(recovered).toEqual(dto())
  })

  it('invalidation idempotente : appel répété sans lecture intercalaire ne déclenche aucun SELECT', async () => {
    mockedGet.mockResolvedValue(dto())

    await getEmailBrandSettingsCached()
    invalidateEmailBrandCache()
    invalidateEmailBrandCache()
    invalidateEmailBrandCache()

    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})
