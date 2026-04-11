// @mostajs/setup — API Route factory for reconfiguration
// Author: Dr Hamid MADANI drmdh@msn.com

import { testDbConnection } from '../lib/db-test.js'
import { writeEnvLocal } from '../lib/env-writer.js'
import { composeDbUri } from '../lib/compose-uri.js'
import type { DialectType, DbConfig } from '../types/index.js'

export interface ReconfigHandlerConfig {
  /** Callback to get current env values */
  getCurrentConfig?: () => {
    dialect: string
    uri: string
    modules: string[]
  }
}

/**
 * Creates handlers for the reconfiguration API.
 *
 * GET  — returns current config (dialect, active modules)
 * POST — applies new config (db change, module toggle)
 */
export function createReconfigHandlers(config?: ReconfigHandlerConfig) {
  async function GET() {
    const dialect = process.env.DB_DIALECT || 'mongodb'
    const uri = process.env.SGBD_URI || ''
    const modulesStr = process.env.MOSTAJS_MODULES || ''
    const modules = modulesStr ? modulesStr.split(',').map((m) => m.trim()) : []

    return Response.json({
      dialect,
      uri,
      modules,
    })
  }

  async function POST(req: Request) {
    try {
      const body = await req.json()
      const { action } = body

      if (action === 'test-db') {
        const { dialect, host, port, name, user, password } = body
        const result = await testDbConnection({ dialect, host, port, name, user, password })
        return Response.json(result)
      }

      if (action === 'change-db') {
        const { dialect, host, port, name, user, password } = body as {
          dialect: DialectType
          action: string
        } & DbConfig
        // Test first
        const test = await testDbConnection({ dialect, host, port, name, user, password })
        if (!test.ok) {
          return Response.json({ ok: false, error: test.error || 'Connexion echouee' })
        }
        // Write .env.local
        const uri = composeDbUri(dialect, { host, port, name, user, password })
        const needsRestart = await writeEnvLocal({ dialect, uri })

        // Update process.env in-memory
        process.env.DB_DIALECT = dialect
        process.env.SGBD_URI = uri

        // Disconnect existing dialect
        try {
          const { disconnectDialect } = await import('@mostajs/orm')
          await disconnectDialect()
        } catch {}

        return Response.json({ ok: true, needsRestart })
      }

      if (action === 'update-modules') {
        const { modules } = body as { modules: string[]; action: string }
        const modulesStr = modules.join(',')

        // Read current .env.local and update MOSTAJS_MODULES
        const needsRestart = await writeEnvLocal({
          dialect: (process.env.DB_DIALECT || 'mongodb') as DialectType,
          uri: process.env.SGBD_URI || '',
          extraVars: { MOSTAJS_MODULES: modulesStr },
        })

        process.env.MOSTAJS_MODULES = modulesStr

        return Response.json({ ok: true, needsRestart, modules })
      }

      return Response.json({ ok: false, error: 'Action inconnue' }, { status: 400 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur serveur'
      return Response.json({ ok: false, error: message }, { status: 500 })
    }
  }

  return { GET, POST }
}
