// @mosta/setup — Write/update .env.local
// Author: Dr Hamid MADANI drmdh@msn.com
import fs from 'fs'
import path from 'path'
import type { DialectType } from '../types/index.js'

export interface EnvWriterOptions {
  dialect?: DialectType
  uri?: string
  /** Extra variables to write (e.g. STRIPE_KEY, SMTP_HOST) */
  extraVars?: Record<string, string>
  /** Default app port (default: 3000) */
  port?: number
  /** Skip writing DB_DIALECT/SGBD_URI (for NET mode) */
  skipDb?: boolean
}

/**
 * Write or update .env.local with DB_DIALECT + SGBD_URI.
 * Preserves commented lines. Returns true if dialect changed (needs restart).
 */
export async function writeEnvLocal(options: EnvWriterOptions): Promise<boolean> {
  const { dialect, uri, extraVars, port = 3000, skipDb = false } = options
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

  if (content) {
    if (skipDb) {
      // Mode NET : commenter DB_DIALECT, SGBD_URI, DB_SCHEMA_STRATEGY
      content = content.replace(/^DB_DIALECT=(.+)$/m, '#DB_DIALECT=$1')
      content = content.replace(/^SGBD_URI=(.+)$/m, '#SGBD_URI=$1')
      content = content.replace(/^DB_SCHEMA_STRATEGY=(.+)$/m, '#DB_SCHEMA_STRATEGY=$1')
    } else if (dialect && uri) {
      // Mode ORM : écrire DB_DIALECT + SGBD_URI
      content = upsertEnvLine(content, 'DB_DIALECT', dialect)
      content = upsertEnvLine(content, 'SGBD_URI', uri)

      const schemaValue = dialect !== 'mongodb' ? 'update' : undefined
      if (schemaValue) {
        content = upsertEnvLine(content, 'DB_SCHEMA_STRATEGY', schemaValue)
      } else if (/^DB_SCHEMA_STRATEGY=/m.test(content)) {
        content = content.replace(/^DB_SCHEMA_STRATEGY=.*$/m, '#DB_SCHEMA_STRATEGY=update')
      }

      // Mode ORM : commenter les lignes NET résiduelles
      content = content.replace(/^MOSTA_NET_URL=(.+)$/m, '#MOSTA_NET_URL=$1')
      content = content.replace(/^MOSTA_NET_TRANSPORT=(.+)$/m, '#MOSTA_NET_TRANSPORT=$1')
      content = content.replace(/^MOSTA_NET_API_KEY=(.+)$/m, '#MOSTA_NET_API_KEY=$1')
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
    const lines: string[] = []

    if (!skipDb && dialect && uri) {
      const schemaValue = dialect !== 'mongodb' ? 'update' : undefined
      lines.push(`DB_DIALECT=${dialect}`, `SGBD_URI=${uri}`)
      if (schemaValue) lines.push(`DB_SCHEMA_STRATEGY=${schemaValue}`)
      lines.push('')
    }

    lines.push(
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
    )

    if (extraVars) {
      lines.push('# App Configuration')
      for (const [k, v] of Object.entries(extraVars)) lines.push(`${k}=${v}`)
      lines.push('')
    }

    content = lines.join('\n') + '\n'
  }

  fs.writeFileSync(envPath, content, 'utf-8')
  return previousDialect !== null && previousDialect !== (dialect ?? previousDialect)
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm')
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`)
  }
  return content.trimEnd() + `\n${key}=${value}\n`
}
