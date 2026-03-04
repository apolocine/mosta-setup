// @mosta/setup — API Route template for install
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/install/route.ts

import { NextResponse } from 'next/server'
import { runInstall } from '../lib/setup'
import type { InstallConfig, MostaSetupConfig } from '../types'

type NeedsSetupFn = () => Promise<boolean>

/**
 * Creates a POST handler for running the installation.
 */
export function createInstallHandler(
  needsSetup: NeedsSetupFn,
  setupConfig: MostaSetupConfig,
) {
  async function POST(req: Request) {
    if (!(await needsSetup())) {
      return NextResponse.json({ error: 'Already installed' }, { status: 400 })
    }

    const body: InstallConfig = await req.json()
    const result = await runInstall(body, setupConfig)
    return NextResponse.json(result)
  }

  return { POST }
}
