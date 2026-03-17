// @mosta/setup — Database connection test (ephemeral, never touches global connection)
// Author: Dr Hamid MADANI drmdh@msn.com
import type { DialectType, DbConfig } from '../types/index'
import { composeDbUri } from './compose-uri'

/**
 * Test a database connection without affecting the global dialect singleton.
 */
export async function testDbConnection(params: {
  dialect: DialectType
  createIfNotExists?: boolean
} & DbConfig): Promise<{ ok: boolean; error?: string }> {
  const { dialect, createIfNotExists, ...dbConfig } = params

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

        // For JDBC bridge dialects, try testing via the bridge HTTP endpoint directly.
        // This avoids module singleton issues in Next.js where BridgeManager instances
        // may differ between API routes.
        const JDBC_DIALECTS = ['hsqldb', 'oracle', 'db2', 'hana', 'sybase']
        if (JDBC_DIALECTS.includes(dialect)) {
          const bridgePort = parseInt(process.env.MOSTA_BRIDGE_PORT_BASE || '8765')
          // Scan ports 8765..8774 for an active bridge
          for (let port = bridgePort; port < bridgePort + 10; port++) {
            try {
              const healthRes = await fetch(`http://localhost:${port}/health`, {
                signal: AbortSignal.timeout(1000),
              })
              if (!healthRes.ok) continue
              // Bridge found — test a query
              // Use dialect-appropriate ping query
              const pingQuery = dialect === 'hsqldb'
                ? 'SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS'
                : dialect === 'oracle'
                  ? 'SELECT 1 FROM DUAL'
                  : 'SELECT 1'
              const queryRes = await fetch(`http://localhost:${port}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: pingQuery, params: [] }),
                signal: AbortSignal.timeout(5000),
              })
              if (queryRes.ok) {
                return { ok: true }
              }
              const text = await queryRes.text()
              return { ok: false, error: `Bridge query failed: ${text}` }
            } catch {
              continue
            }
          }
          return { ok: false, error: `Aucun bridge JDBC actif. Lancez le bridge d'abord.` }
        }

        const { testConnection } = await import('@mostajs/orm')
        const result = await testConnection({
          dialect,
          uri,
          schemaStrategy: createIfNotExists ? 'update' : 'none',
        })
        return result
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connexion echouee'
    return { ok: false, error: message }
  }
}
