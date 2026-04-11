// @mosta/setup — API Route template for test-db
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/test-db/route.ts

import { testDbConnection } from '../lib/db-test'
import type { DialectType } from '../types/index'

type NeedsSetupFn = () => Promise<boolean>

/**
 * Creates a POST handler for testing DB connections.
 */
export function createTestDbHandler(needsSetup: NeedsSetupFn) {
  async function POST(req: Request) {
    if (!(await needsSetup())) {
      return Response.json({ error: 'Already installed' }, { status: 400 })
    }

    const body = await req.json()
    const { dialect, host, port, name, user, password, createIfNotExists } = body

    if (!dialect || !name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await testDbConnection({
      dialect: dialect as DialectType,
      host: host || 'localhost',
      port: port || 27017,
      name,
      user: user || '',
      password: password || '',
      createIfNotExists: !!createIfNotExists,
    })

    return Response.json(result)
  }

  return { POST }
}
