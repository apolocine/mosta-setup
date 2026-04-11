// @mosta/setup — Database connection test (delegates to @mostajs/orm)
// Author: Dr Hamid MADANI drmdh@msn.com
import type { DialectType, DbConfig } from '../types/index.js'
import { composeDbUri } from './compose-uri.js'

/**
 * Test a database connection without affecting the global dialect singleton.
 * Delegates entirely to @mostajs/orm testConnection().
 */
export async function testDbConnection(params: {
  dialect: DialectType
  createIfNotExists?: boolean
} & DbConfig): Promise<{ ok: boolean; error?: string }> {
  const { dialect, createIfNotExists, ...dbConfig } = params

  try {
    // SQLite: always OK (file auto-created)
    if (dialect === 'sqlite') {
      return { ok: true }
    }

    const uri = composeDbUri(dialect, dbConfig)
    const { testConnection } = await import('@mostajs/orm')

    return await testConnection({
      dialect,
      uri,
      schemaStrategy: createIfNotExists ? 'update' : 'none',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connexion echouee'
    return { ok: false, error: message }
  }
}
