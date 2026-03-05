// @mosta/setup — Write/update .env.local
// Author: Dr Hamid MADANI drmdh@msn.com
import fs from 'fs'
import path from 'path'
import type { DialectType } from '../types/index'

export interface EnvWriterOptions {
  dialect: DialectType
  uri: string
  /** Extra variables to write (e.g. STRIPE_KEY, SMTP_HOST) */
  extraVars?: Record<string, string>
  /** Default app port (default: 3000) */
  port?: number
}

/**
 * Write or update .env.local with DB_DIALECT + SGBD_URI.
 * Preserves commented lines. Returns true if dialect changed (needs restart).
 */
export async function writeEnvLocal(options: EnvWriterOptions): Promise<boolean> {
  const { dialect, uri, extraVars, port = 3000 } = options
  const envPath = path.resolve(process.cwd(), '.env.local')
  let content = ''
  let previousDialect: string | null = null

  try {
    content = fs.readFileSync(envPath, 'utf-8')
    const match = content.match(/^DB_DIALECT=(.+)$/m)
    if (match) previousDialect = match[1].trim()
  } catch {
    // .env.local doesn't exist yet
  }

  const schemaValue = dialect !== 'mongodb' ? 'update' : undefined

  if (content) {
    // Replace only active (uncommented) lines
    content = upsertEnvLine(content, 'DB_DIALECT', dialect)
    content = upsertEnvLine(content, 'SGBD_URI', uri)

    if (schemaValue) {
      content = upsertEnvLine(content, 'DB_SCHEMA_STRATEGY', schemaValue)
    } else if (/^DB_SCHEMA_STRATEGY=/m.test(content)) {
      content = content.replace(/^DB_SCHEMA_STRATEGY=.*$/m, '#DB_SCHEMA_STRATEGY=update')
    }

    // Write extra vars
    if (extraVars) {
      for (const [key, val] of Object.entries(extraVars)) {
        content = upsertEnvLine(content, key, val)
      }
    }
  } else {
    // Fresh .env.local
    const { randomBytes } = await import('crypto')
    const secret = randomBytes(32).toString('base64')
    const lines = [
      `DB_DIALECT=${dialect}`,
      `SGBD_URI=${uri}`,
      ...(schemaValue ? [`DB_SCHEMA_STRATEGY=${schemaValue}`] : []),
      '',
      '# NextAuth Configuration',
      `NEXTAUTH_URL=http://localhost:${port}`,
      `NEXTAUTH_SECRET=${secret}`,
      `AUTH_SECRET=${secret}`,
      `NEXT_PUBLIC_APP_URL=http://localhost:${port}`,
      '',
      '# Environment',
      'NODE_ENV=development',
      `PORT=${port}`,
      '',
      ...(extraVars
        ? ['# App Configuration', ...Object.entries(extraVars).map(([k, v]) => `${k}=${v}`), '']
        : []),
    ]
    content = lines.join('\n') + '\n'
  }

  fs.writeFileSync(envPath, content, 'utf-8')
  return previousDialect !== null && previousDialect !== dialect
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm')
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`)
  }
  return content.trimEnd() + `\n${key}=${value}\n`
}
