import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

export interface Credentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  tableName: string
}

const FILE_NAME = 'credentials.enc'

function filePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

export async function loadCredentials(): Promise<Credentials | null> {
  if (
    process.env.AWS_ACCESS_KEY_ID
    && process.env.AWS_SECRET_ACCESS_KEY
  ) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION ?? 'eu-central-1',
      tableName: process.env.DDB_TABLE_NAME ?? 'niebieskie-aparaty-prod',
    }
  }

  try {
    const buf = await fs.readFile(filePath())
    if (!safeStorage.isEncryptionAvailable()) return null
    const json = safeStorage.decryptString(buf)
    return JSON.parse(json) as Credentials
  }
  catch {
    return null
  }
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain is not available — cannot store credentials safely.')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(creds))
  await fs.writeFile(filePath(), encrypted, { mode: 0o600 })
}

export async function clearCredentials(): Promise<void> {
  try {
    await fs.unlink(filePath())
  }
  catch {
    /* ignore */
  }
}
