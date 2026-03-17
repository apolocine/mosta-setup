// @mosta/setup — API Route template for install
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/install/route.ts

import { runInstall } from '../lib/setup'
import type { InstallConfig, MostaSetupConfig } from '../types/index'

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
      return Response.json({ error: 'Already installed' }, { status: 400 })
    }

    const body: InstallConfig = await req.json()
    const result = await runInstall(body, setupConfig)
    return Response.json(result)
  }

  return { POST }
}
