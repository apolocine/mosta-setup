// @mosta/setup — Database connection test (ephemeral, never touches global connection)
// Author: Dr Hamid MADANI drmdh@msn.com
import type { DialectType, DbConfig } from '../types'
import { composeDbUri } from './compose-uri'

/**
 * Test a database connection without affecting the global dialect singleton.
 */
export async function testDbConnection(params: {
  dialect: DialectType
} & DbConfig): Promise<{ ok: boolean; error?: string }> {
  const { dialect, ...dbConfig } = params

  try {
    switch (dialect) {
      case 'mongodb': {
        const uri = composeDbUri('mongodb', dbConfig)
        const mongoose = await import('mongoose')
        const conn = mongoose.default.createConnection(uri, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
        } as any)
        try {
          await conn.asPromise()
          return { ok: conn.readyState === 1 }
        } finally {
          await conn.close().catch(() => {})
        }
      }

      case 'sqlite':
        return { ok: true }

      default: {
        const uri = composeDbUri(dialect, dbConfig)
        const { testConnection } = await import('@mostajs/orm')
        const ok = await testConnection({ dialect, uri, schemaStrategy: 'none' })
        return { ok }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connexion echouee'
    return { ok: false, error: message }
  }
}
