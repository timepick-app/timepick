import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Mixed-state delete dispatch (angle mort A-3/A-4) is only reachable under
// STORAGE_DRIVER=s3, which the standard suites never set — this file pins it in
// CI. The AWS SDK is mocked so no network happens; the local driver writes to a
// tmpdir via UPLOADS_ROOT_OVERRIDE.
jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn<() => Promise<any>>().mockResolvedValue({})
  return {
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn((input) => ({ __cmd: 'Put', input })),
    DeleteObjectCommand: jest.fn((input) => ({ __cmd: 'Delete', input })),
  }
})

import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { deleteEmailImage } from '../../services/email-upload.service'
import { resetStorageForTests } from '../../services/storage'

const send = (new (S3Client as unknown as new () => { send: jest.Mock<() => Promise<any>> })()).send

const S3_ENV: Record<string, string> = {
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'timepick-emails',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
  S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
}

describe('deleteEmailImage — mixed-state dispatch under STORAGE_DRIVER=s3', () => {
  let root: string
  const keys = ['UPLOADS_ROOT_OVERRIDE', ...Object.keys(S3_ENV)]
  const saved: Record<string, string | undefined> = {}

  beforeAll(() => {
    for (const k of keys) saved[k] = process.env[k]
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dispatch-'))
    process.env.UPLOADS_ROOT_OVERRIDE = root
    Object.assign(process.env, S3_ENV)
    resetStorageForTests()
  })

  afterAll(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    resetStorageForTests()
    fs.rmSync(root, { recursive: true, force: true })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    send.mockResolvedValue({})
  })

  it('routes a legacy /uploads URL to the local driver (file unlinked, no S3 call)', async () => {
    const rel = 'uploads/emails/2020/01/legacy.webp'
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), 'legacy')

    await deleteEmailImage('https://app.example/uploads/emails/2020/01/legacy.webp')

    expect(fs.existsSync(path.join(root, rel))).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('routes a bucket URL to the S3 driver (DeleteObjectCommand, disk untouched)', async () => {
    await deleteEmailImage('https://cdn.example.com/emails/2026/07/abc.webp')

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'timepick-emails',
      Key: 'emails/2026/07/abc.webp',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })
})
