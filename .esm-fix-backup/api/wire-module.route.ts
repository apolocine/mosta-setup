// @mostajs/setup — Wire module API route factory
// Author: Dr Hamid MADANI drmdh@msn.com

/**
 * Factory for POST /api/setup/wire-module
 * Calls @mostajs/socle installModule() or uninstallModule()
 *
 * Body: { action: 'install' | 'uninstall', module: string }
 * Response: { data: { ok: boolean, module: string, steps: [...] } }
 */
export function createWireModuleHandler() {
  async function POST(req: Request) {
    let body: { action?: string; module?: string }
    try {
      body = await req.json()
    } catch {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'JSON invalide' } },
        { status: 400 },
      )
    }

    const { action, module: moduleName } = body
    if (!action || !moduleName) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'action et module requis' } },
        { status: 400 },
      )
    }

    if (!['install', 'uninstall'].includes(action)) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: "action doit etre 'install' ou 'uninstall'" } },
        { status: 400 },
      )
    }

    try {
      // Dynamic import from specific paths to avoid barrel missing exports
      const installPkg = '@mostajs' + '/socle/lib/install-module'
      const uninstallPkg = '@mostajs' + '/socle/lib/uninstall-module'
      const logs: string[] = []
      const opts = {
        projectRoot: process.cwd(),
        log: (msg: string) => logs.push(msg),
      }

      let result: any
      if (action === 'install') {
        const mod = await import(/* webpackIgnore: true */ installPkg)
        result = mod.installModule(moduleName, opts)
      } else {
        const mod = await import(/* webpackIgnore: true */ uninstallPkg)
        result = mod.uninstallModule(moduleName, opts)
      }

      return Response.json({
        data: {
          ok: result.success,
          action,
          module: moduleName,
          steps: result.steps,
          logs,
        },
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json(
        { error: { code: 'WIRE_ERROR', message } },
        { status: 500 },
      )
    }
  }

  // GET — list available wire manifests
  async function GET() {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const root = process.cwd()
      const found: { name: string; source: string; package: string; version: string; type: string; installed: boolean }[] = []

      // Check modules/ directory (host overrides)
      const modulesDir = path.join(root, 'modules')
      if (fs.existsSync(modulesDir)) {
        for (const f of fs.readdirSync(modulesDir).filter((f: string) => f.endsWith('.wire.json'))) {
          const manifest = JSON.parse(fs.readFileSync(path.join(modulesDir, f), 'utf8'))
          const name = f.replace('.wire.json', '')
          // Check if already wired (has the package in package.json deps or schemas wired)
          const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
          const installed = !!pkg.dependencies?.[manifest.package]
          found.push({
            name,
            source: 'modules/',
            package: manifest.package,
            version: manifest.version,
            type: manifest.type || 'functional',
            installed,
          })
        }
      }

      // Check node_modules/@mostajs/*/<name>.wire.json
      const mostaDir = path.join(root, 'node_modules', '@mostajs')
      if (fs.existsSync(mostaDir)) {
        for (const dir of fs.readdirSync(mostaDir)) {
          if (found.some(f => f.name === dir)) continue
          const wireFile = path.join(mostaDir, dir, `${dir}.wire.json`)
          if (fs.existsSync(wireFile)) {
            const manifest = JSON.parse(fs.readFileSync(wireFile, 'utf8'))
            // Check if already wired — primary: package in dependencies
            const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
            let installed = !!pkg.dependencies?.[manifest.package]

            // Fallback: check host source files for legacy codegen markers
            if (!installed) {
              const permFile = path.join(root, 'src/lib/permissions.ts')
              if (manifest.permissions?.permissionsConst && fs.existsSync(permFile)) {
                installed = fs.readFileSync(permFile, 'utf8').includes(manifest.permissions.permissionsConst)
              } else if (manifest.schemas?.exports?.[0]) {
                const regFile = path.join(root, 'src/dal/registry.ts')
                if (fs.existsSync(regFile)) {
                  installed = fs.readFileSync(regFile, 'utf8').includes(manifest.schemas.exports[0])
                }
              } else if (manifest.menu?.name) {
                const sidebarFile = path.join(root, 'src/components/layout/Sidebar.tsx')
                if (fs.existsSync(sidebarFile)) {
                  installed = fs.readFileSync(sidebarFile, 'utf8').includes(manifest.menu.name)
                }
              }
            }
            found.push({
              name: dir,
              source: `@mostajs/${dir}/`,
              package: manifest.package,
              version: manifest.version,
              type: manifest.type || 'functional',
              installed,
            })
          }
        }
      }

      return Response.json({ data: found })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json(
        { error: { code: 'LIST_ERROR', message } },
        { status: 500 },
      )
    }
  }

  return { GET, POST }
}
