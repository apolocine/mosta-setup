// @mosta/setup — API Route template for test-db
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/test-db/route.ts

import { NextResponse } from 'next/server'
import { testDbConnection } from '../lib/db-test'
import type { DialectType } from '../types'

type NeedsSetupFn = () => Promise<boolean>

/**
 * Creates a POST handler for testing DB connections.
 */
export function createTestDbHandler(needsSetup: NeedsSetupFn) {
  async function POST(req: Request) {
    if (!(await needsSetup())) {
      return NextResponse.json({ error: 'Already installed' }, { status: 400 })
    }

    const body = await req.json()
    const { dialect, host, port, name, user, password } = body

    if (!dialect || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await testDbConnection({
      dialect: dialect as DialectType,
      host: host || 'localhost',
      port: port || 27017,
      name,
      user: user || '',
      password: password || '',
    })

    return NextResponse.json(result)
  }

  return { POST }
}
