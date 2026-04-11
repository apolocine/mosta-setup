// @mosta/setup — Install modules API route factory
// Author: Dr Hamid MADANI drmdh@msn.com
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { MODULES, resolveModuleDependencies } from '../data/module-definitions'

const execAsync = promisify(exec)

/**
 * Factory for POST /api/setup/install-modules
 * @param needsSetup - async function checking if app still needs setup
 */
export function createInstallModulesHandler(needsSetup: () => Promise<boolean>) {
  async function POST(req: Request) {
    const setupNeeded = await needsSetup()
    if (!setupNeeded) {
      return Response.json(
        { error: { code: 'FORBIDDEN', message: 'Installation deja effectuee' } },
        { status: 403 },
      )
    }

    let body: { modules?: string[] }
    try {
      body = await req.json()
    } catch {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'JSON invalide' } },
        { status: 400 },
      )
    }

    if (!body.modules || !Array.isArray(body.modules) || body.modules.length === 0) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'modules[] requis' } },
        { status: 400 },
      )
    }

    // Resolve dependencies
    const allModules = resolveModuleDependencies(body.modules)
    const moduleMap = new Map(MODULES.map((m) => [m.key, m]))
    const packagesDir = path.resolve(process.cwd(), 'packages')
    const results: { key: string; ok: boolean; error?: string }[] = []

    // Build install specifiers — hybrid: local file: if dir exists, npm registry otherwise
    // Skip packages already installed in node_modules/ to avoid triggering Next.js hot-reload
    const nodeModulesBase = path.resolve(process.cwd(), 'node_modules', '@mostajs')
    const toInstall: string[] = []
    for (const key of allModules) {
      const mod = moduleMap.get(key)
      const npmSubdir = (mod?.packageName || `@mostajs/${key}`).replace('@mostajs/', '')

      // Already in node_modules? Skip to avoid unnecessary npm install
      if (fs.existsSync(path.join(nodeModulesBase, npmSubdir))) {
        results.push({ key, ok: true })
        continue
      }

      if (mod?.localDir) {
        const localPath = path.join(packagesDir, mod.localDir)
        if (fs.existsSync(localPath)) {
          toInstall.push(`file:./packages/${mod.localDir}`)
          continue
        }
      }
      // Fallback to npm registry (published or discovered package)
      const packageName = mod?.packageName || `@mostajs/${key}`
      toInstall.push(packageName)
    }

    if (toInstall.length > 0) {
      try {
        const cmd = `npm install ${toInstall.join(' ')} --save`
        await execAsync(cmd, { cwd: process.cwd(), timeout: 120_000 })
        // Mark all remaining modules as ok
        for (const key of allModules) {
          if (!results.some((r) => r.key === key)) {
            results.push({ key, ok: true })
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'npm install failed'
        for (const key of allModules) {
          if (!results.some((r) => r.key === key)) {
            results.push({ key, ok: false, error: message })
          }
        }
        return Response.json(
          { error: { code: 'INSTALL_ERROR', message }, results },
          { status: 500 },
        )
      }
    } else {
      // All already installed — fill results for any missing
      for (const key of allModules) {
        if (!results.some((r) => r.key === key)) {
          results.push({ key, ok: true })
        }
      }
    }

    // Write MOSTAJS_MODULES to .env.local
    try {
      const envPath = path.resolve(process.cwd(), '.env.local')
      let content = ''
      try {
        content = fs.readFileSync(envPath, 'utf-8')
      } catch { /* file doesn't exist yet */ }

      const modulesValue = allModules.join(',')
      const regex = /^MOSTAJS_MODULES=.*$/m
      if (regex.test(content)) {
        content = content.replace(regex, `MOSTAJS_MODULES=${modulesValue}`)
      } else {
        content = content.trimEnd() + `\n\n# Modules actives\nMOSTAJS_MODULES=${modulesValue}\n`
      }
      fs.writeFileSync(envPath, content, 'utf-8')
    } catch {
      // Non-fatal: env write can fail at this stage if .env.local not yet created
    }

    return Response.json({
      data: { ok: true, modules: allModules, results },
    })
  }

  return { POST }
}
