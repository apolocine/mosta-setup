// @mosta/setup — API Route template for install
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/install/route.ts

import { runInstall } from '../lib/setup.js'
import type { InstallConfig, MostaSetupConfig } from '../types/index.js'

type NeedsSetupFn = () => Promise<boolean>

/**
 * Creates a POST handler for running the installation.
 */
export function createInstallHandler(
  needsSetup: NeedsSetupFn,
  setupConfig: MostaSetupConfig,
) {
  async function POST(req: Request) {
    const body: InstallConfig = await req.json()

    // In NET mode, skip needsSetup check — the admin may already exist from dashboard seed
    // or from a previous partial install. The wizard controls the flow.
    if (body.mode !== 'net' && !(body as any).skipCheck && !(await needsSetup())) {
      return Response.json({ ok: false, error: 'Installation deja effectuee' }, { status: 400 })
    }

    const result = await runInstall(body, setupConfig)
    return Response.json(result)
  }

  return { POST }
}
