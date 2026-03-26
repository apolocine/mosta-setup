// @mostajs/setup — Catch-all route factory
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Replaces 6+ individual route files with a single [...slug] handler.
// Usage:
//   export const { GET, POST, DELETE, PATCH } = createSetupRoutes({
//     needsSetup: appNeedsSetup,
//     getSetupConfig,
//   })

import type { MostaSetupConfig } from '../types/index.js'

type NeedsSetupFn = () => Promise<boolean>
type GetSetupConfigFn = () => Promise<MostaSetupConfig>

export interface SetupRoutesConfig {
  needsSetup: NeedsSetupFn
  getSetupConfig: GetSetupConfigFn
}

type Handler = (req: Request) => Promise<Response>

interface HandlerMap {
  GET?: Handler
  POST?: Handler
  DELETE?: Handler
  PATCH?: Handler
}

// Slug → { GET?, POST?, DELETE?, PATCH? }
type DispatchTable = Record<string, HandlerMap>

/**
 * Creates GET, POST, DELETE, PATCH handlers for a catch-all [...slug] route.
 *
 * Dispatch table (11 slugs):
 *   status         GET
 *   test-db        POST
 *   create-db      POST
 *   preflight      GET
 *   detect-modules GET
 *   install-modules POST
 *   setup-json     GET POST
 *   upload-jar     GET POST DELETE PATCH
 *   wire-module    GET POST
 *   reconfig       GET POST
 *   install        POST
 */
export function createSetupRoutes(config: SetupRoutesConfig) {
  const { needsSetup, getSetupConfig } = config

  // Lazy-init: handlers are created on first request, not at import time
  let table: DispatchTable | null = null

  async function buildTable(): Promise<DispatchTable> {
    if (table) return table

    // Import all factories
    const [
      { createStatusHandler },
      { createTestDbHandler },
      { createCreateDbHandler },
      { createPreflightHandler },
      { createDetectModulesHandler },
      { createInstallModulesHandler },
      { createSetupJsonHandler },
      { createUploadJarHandlers },
      { createWireModuleHandler },
      { createReconfigHandlers },
      { createInstallHandler },
    ] = await Promise.all([
      import('./status.route.js'),
      import('./test-db.route.js'),
      import('./create-db.route.js'),
      import('./preflight.route.js'),
      import('./detect-modules.route.js'),
      import('./install-modules.route.js'),
      import('./upload-setup-json.route.js'),
      import('./upload-jar.route.js'),
      import('./wire-module.route.js'),
      import('./reconfig.route.js'),
      import('./install.route.js'),
    ])

    // Build handlers — pass needsSetup / config where required
    const status = createStatusHandler(needsSetup)
    const testDb = createTestDbHandler(needsSetup)
    const createDb = createCreateDbHandler()
    const preflight = createPreflightHandler()
    const detectModules = createDetectModulesHandler()
    const installModules = createInstallModulesHandler(needsSetup)
    const setupJson = createSetupJsonHandler(needsSetup)
    const uploadJar = createUploadJarHandlers()
    const wireModule = createWireModuleHandler()
    const reconfig = createReconfigHandlers()

    // install handler needs async setupConfig — wrap it
    const installHandlers: HandlerMap = {
      POST: async (req: Request) => {
        const setupConfig = await getSetupConfig()
        const { POST: installPOST } = createInstallHandler(needsSetup, setupConfig)
        return installPOST(req)
      },
    }

    table = {
      'status': { GET: status.GET },
      'test-db': { POST: testDb.POST },
      'create-db': { POST: createDb.POST },
      'preflight': { GET: preflight.GET },
      'detect-modules': { GET: detectModules.GET },
      'install-modules': { POST: installModules.POST },
      'setup-json': { GET: setupJson.GET, POST: setupJson.POST },
      'upload-jar': { GET: uploadJar.GET, POST: uploadJar.POST, DELETE: uploadJar.DELETE, PATCH: uploadJar.PATCH },
      'wire-module': { GET: wireModule.GET, POST: wireModule.POST },
      'reconfig': { GET: reconfig.GET, POST: reconfig.POST },
      'install': installHandlers,
      // NET mode endpoints
      'net-test': {
        POST: async (req: Request) => {
          const body = await req.json() as { url?: string }
          if (!body?.url) return Response.json({ ok: false, error: 'URL requise' }, { status: 400 })
          try {
            const { NetClient } = await import('../lib/net-client.js')
            const client = new NetClient({ url: body.url })
            const health = await client.health()
            return Response.json({ ok: true, ...health })
          } catch (e: unknown) {
            return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Connexion echouee' })
          }
        },
      },
      'net-schemas': {
        POST: async (req: Request) => {
          const body = await req.json() as { url?: string }
          if (!body?.url) return Response.json({ ok: false, error: 'URL requise' }, { status: 400 })
          try {
            const { NetClient } = await import('../lib/net-client.js')
            const client = new NetClient({ url: body.url })
            const config = await client.getSchemasConfig()
            return Response.json({ ok: true, ...config })
          } catch (e: unknown) {
            return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' })
          }
        },
      },
      'net-db-test': {
        POST: async (req: Request) => {
          const body = await req.json() as { url?: string }
          if (!body?.url) return Response.json({ ok: false, error: 'URL requise' }, { status: 400 })
          try {
            const { NetClient } = await import('../lib/net-client.js')
            const client = new NetClient({ url: body.url })
            const result = await client.testDbConnection()
            return Response.json(result)
          } catch (e: unknown) {
            return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' })
          }
        },
      },
    }

    return table
  }

  function notFound(slug: string, method: string): Response {
    return Response.json(
      { error: `Setup route not found: ${method} /api/setup/${slug}` },
      { status: 404 },
    )
  }

  async function GET(req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const key = slug?.[0] || ''
    const t = await buildTable()
    const handler = t[key]?.GET
    if (!handler) return notFound(key, 'GET')
    return handler(req)
  }

  async function POST(req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const key = slug?.[0] || ''
    const t = await buildTable()
    const handler = t[key]?.POST
    if (!handler) return notFound(key, 'POST')
    return handler(req)
  }

  async function DELETE(req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const key = slug?.[0] || ''
    const t = await buildTable()
    const handler = t[key]?.DELETE
    if (!handler) return notFound(key, 'DELETE')
    return handler(req)
  }

  async function PATCH(req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const key = slug?.[0] || ''
    const t = await buildTable()
    const handler = t[key]?.PATCH
    if (!handler) return notFound(key, 'PATCH')
    return handler(req)
  }

  return { GET, POST, DELETE, PATCH }
}
