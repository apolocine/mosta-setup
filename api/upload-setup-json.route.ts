// @mostajs/setup — API Route for uploading setup.json
// Author: Dr Hamid MADANI drmdh@msn.com
//
// When a project uses loadSetupJson() but setup.json is missing,
// this route allows uploading it via the setup wizard UI.

import fs from 'fs'
import path from 'path'
import type { SetupJson } from '../lib/load-setup-json'

type NeedsSetupFn = () => Promise<boolean>

/**
 * Creates handlers for checking and uploading setup.json.
 *
 * GET  /api/setup/setup-json → { exists: boolean, config?: { appName, seeds, rbac } }
 * POST /api/setup/setup-json → receives JSON body, writes to ./setup.json
 */
export function createSetupJsonHandler(needsSetup: NeedsSetupFn) {
  const setupJsonPath = () => path.resolve(process.cwd(), 'setup.json')

  async function GET() {
    const filePath = setupJsonPath()
    if (!fs.existsSync(filePath)) {
      return Response.json({ exists: false })
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const json: SetupJson = JSON.parse(raw)
      return Response.json({
        exists: true,
        config: {
          appName: json.app?.name,
          hasRbac: !!(json.rbac?.roles?.length || json.rbac?.permissions?.length),
          seedCount: json.seeds?.length ?? 0,
        },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON'
      return Response.json({ exists: false, error: msg })
    }
  }

  async function POST(req: Request) {
    if (!(await needsSetup())) {
      return Response.json({ error: 'Already installed' }, { status: 400 })
    }

    let body: SetupJson
    try {
      body = await req.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.app?.name) {
      return Response.json({ error: 'setup.json must have app.name' }, { status: 400 })
    }

    const filePath = setupJsonPath()
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2) + '\n', 'utf-8')

    return Response.json({
      ok: true,
      config: {
        appName: body.app.name,
        hasRbac: !!(body.rbac?.roles?.length || body.rbac?.permissions?.length),
        seedCount: body.seeds?.length ?? 0,
      },
    })
  }

  return { GET, POST }
}
