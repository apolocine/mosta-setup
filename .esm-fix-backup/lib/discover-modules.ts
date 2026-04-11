// @mosta/setup — Dynamic npm module discovery
// Author: Dr Hamid MADANI drmdh@msn.com
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { MODULES, type ModuleDefinition } from '../data/module-definitions'

const execAsync = promisify(exec)

interface NpmSearchResult {
  name: string
  description: string
  version: string
}

/**
 * Discover @mostajs packages from npm registry and merge with static list.
 *
 * - Known modules keep their rich metadata (required, dependsOn, icon)
 * - New packages found on npm are added with `discovered: true`
 * - Detects which packages are already installed in node_modules/
 * - Falls back to static list if npm search fails (offline, timeout)
 */
export async function discoverNpmModules(): Promise<{
  modules: ModuleDefinition[]
  installed: string[]
}> {
  const staticModules = [...MODULES]
  const modulesByPackage = new Map(staticModules.map((m) => [m.packageName, m]))

  // Try npm search with 10s timeout
  try {
    const { stdout } = await execAsync('npm search @mostajs --json', {
      timeout: 10_000,
    })

    const npmResults: NpmSearchResult[] = JSON.parse(stdout)

    for (const pkg of npmResults) {
      // Skip if not @mostajs scoped
      if (!pkg.name.startsWith('@mostajs/')) continue

      // Skip if already in static list
      if (modulesByPackage.has(pkg.name)) continue

      // Derive key from package name: @mostajs/foo-bar -> foo-bar
      const key = pkg.name.replace('@mostajs/', '')

      staticModules.push({
        key,
        packageName: pkg.name,
        label: pkg.name,
        description: pkg.description || '',
        icon: '📦',
        default: false,
        discovered: true,
      })
    }
  } catch {
    // npm search failed (offline, timeout) — use static list only
  }

  // Detect installed packages: check node_modules/ and local packages/
  const installed: string[] = []
  const nodeModulesBase = path.resolve(process.cwd(), 'node_modules', '@mostajs')
  const packagesDir = path.resolve(process.cwd(), 'packages')

  for (const mod of staticModules) {
    // Check node_modules/@mostajs/<name>
    const npmDir = mod.packageName.replace('@mostajs/', '')
    const nmPath = path.join(nodeModulesBase, npmDir)
    // Check local packages/<localDir>
    const localPath = mod.localDir ? path.join(packagesDir, mod.localDir) : null
    try {
      if (fs.existsSync(nmPath) || (localPath && fs.existsSync(localPath))) {
        installed.push(mod.key)
      }
    } catch {
      // ignore
    }
  }

  return { modules: staticModules, installed }
}
