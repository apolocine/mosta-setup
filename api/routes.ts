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
      'seed-file': {
        GET: async () => {
          // Read seed file referenced in setup.json, or seeds.json by default
          const fs = await import('fs')
          const path = await import('path')
          const setupPath = path.resolve(process.cwd(), 'setup.json')
          let seedFileName = 'seeds.json'
          if (fs.existsSync(setupPath)) {
            try {
              const setup = JSON.parse(fs.readFileSync(setupPath, 'utf-8'))
              if (setup.seedFile) seedFileName = setup.seedFile
            } catch {}
          }
          const seedPath = path.resolve(process.cwd(), seedFileName)
          if (!fs.existsSync(seedPath)) return Response.json({ exists: false, seedFile: seedFileName })
          try {
            const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'))
            const seedCount = (data.seeds || []).length
            const rbacCount = (data.rbac?.permissions || []).length
            return Response.json({
              exists: true,
              seedFile: seedFileName,
              summary: { seeds: seedCount, rbacPermissions: rbacCount, rbacRoles: (data.rbac?.roles || []).length },
              data,
            })
          } catch (e: unknown) {
            return Response.json({ exists: false, error: e instanceof Error ? e.message : 'Parse error' })
          }
        },
        POST: async (req: Request) => {
          // Upload a seed file
          const body = await req.json() as { seedFile?: string; data?: any }
          if (!body?.data) return Response.json({ ok: false, error: 'data requise' }, { status: 400 })
          const fs = await import('fs')
          const path = await import('path')
          const seedFileName = body.seedFile || 'seeds.json'
          const seedPath = path.resolve(process.cwd(), seedFileName)
          fs.writeFileSync(seedPath, JSON.stringify(body.data, null, 2))
          // Update setup.json to reference the seed file
          const setupPath = path.resolve(process.cwd(), 'setup.json')
          if (fs.existsSync(setupPath)) {
            try {
              const setup = JSON.parse(fs.readFileSync(setupPath, 'utf-8'))
              setup.seedFile = seedFileName
              fs.writeFileSync(setupPath, JSON.stringify(setup, null, 2))
            } catch {}
          }
          return Response.json({ ok: true, seedFile: seedFileName, seeds: (body.data.seeds || []).length })
        },
      },
      'upload-jar': { GET: uploadJar.GET, POST: uploadJar.POST, DELETE: uploadJar.DELETE, PATCH: uploadJar.PATCH },
      'wire-module': { GET: wireModule.GET, POST: wireModule.POST },
      'reconfig': { GET: reconfig.GET, POST: reconfig.POST },
      'install': installHandlers,
      // NET mode endpoints
      'net-test': {
        POST: async (req: Request) => {
          const body = await req.json() as { url?: string; transport?: string }
          if (!body?.url) return Response.json({ ok: false, error: 'URL requise' }, { status: 400 })
          try {
            const { NetClient } = await import('../lib/net-client.js')
            const client = new NetClient({ url: body.url })
            const health = await client.health()
            // Auto-save MOSTA_DATA, MOSTA_NET_URL, MOSTA_NET_TRANSPORT in .env.local
            try {
              const { readFileSync, writeFileSync, existsSync } = await import('fs')
              const { resolve } = await import('path')
              const envPath = resolve(process.cwd(), '.env.local')
              let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
              const updates: Record<string, string> = {
                'MOSTA_DATA': 'net',
                'MOSTA_NET_URL': body.url,
                'MOSTA_NET_TRANSPORT': body.transport || 'rest',
              }
              for (const [key, val] of Object.entries(updates)) {
                const regex = new RegExp(`^${key}=.*$`, 'm')
                if (regex.test(content)) {
                  content = content.replace(regex, `${key}=${val}`)
                } else {
                  content += `\n${key}=${val}`
                }
                process.env[key] = val
              }
              writeFileSync(envPath, content)
            } catch {}
            return Response.json({ ok: true, ...health, saved: true })
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
      // Create admin user — delegates to @mostajs/rbac via module discovery
      'create-admin': {
        POST: async (req: Request) => {
          const body = await req.json() as { email?: string; password?: string; firstName?: string; lastName?: string; url?: string }
          if (!body?.email || !body?.password || !body?.firstName) {
            return Response.json({ ok: false, error: 'email, password, firstName requis' }, { status: 400 })
          }
          try {
            // Try rbac module createAdmin (works in both ORM and NET mode)
            const { createAdmin } = await import('@mostajs/rbac/lib/create-admin')
            const result = await createAdmin({
              email: body.email,
              password: body.password,
              firstName: body.firstName,
              lastName: body.lastName || '',
            })
            return Response.json(result)
          } catch (e: unknown) {
            return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur creation admin' })
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
