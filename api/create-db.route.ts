// @mosta/setup — Create Database route (delegates to @mostajs/orm)
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/create-db/route.ts

import { composeDbUri } from '../lib/compose-uri.js'
import type { DialectType, DbConfig } from '../types/index.js'

/**
 * Creates a POST handler that creates a database.
 * Delegates entirely to @mostajs/orm createDatabase().
 */
export function createCreateDbHandler() {
  async function POST(req: Request) {
    try {
      const body = await req.json()
      const { dialect, host, port, name, user, password } = body as { dialect: DialectType } & DbConfig

      if (!dialect || !name) {
        return Response.json({ ok: false, error: 'dialect et name requis' }, { status: 400 })
      }

      const uri = composeDbUri(dialect, { host, port, name, user, password })
      const { createDatabase } = await import('@mostajs/orm')
      const result = await createDatabase(dialect, uri, name)

      return Response.json(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur création base'
      return Response.json({ ok: false, error: message })
    }
  }

  return { POST }
}
