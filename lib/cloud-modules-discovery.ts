// @mostajs/setup — Cloud module discovery
// Author: Dr Hamid MADANI drmdh@msn.com

export interface CloudModule {
  name: string
  package: string
  required: boolean
  description: string
  installed: boolean
}

const CLOUD_MODULES: Omit<CloudModule, 'installed'>[] = [
  { name: 'subscriptions-plan', package: '@mostajs/subscriptions-plan', required: true, description: 'Subscription plans, billing, invoices, usage tracking' },
  { name: 'api-keys', package: '@mostajs/api-keys', required: true, description: 'API key generation, verification, permissions' },
  { name: 'project-life', package: '@mostajs/project-life', required: true, description: 'Project lifecycle management (create, pause, delete)' },
  { name: 'cloud-middleware', package: '@mostajs/cloud-middleware', required: true, description: 'Cloud middleware: API key → quota → project routing' },
  { name: 'pm2', package: '@mostajs/pm2', required: false, description: 'PM2 process management (optional)' },
]

export { CLOUD_MODULES }

/**
 * Detect which cloud modules are installed.
 */
export async function discoverCloudModules(): Promise<CloudModule[]> {
  const results: CloudModule[] = []

  for (const mod of CLOUD_MODULES) {
    let installed = false
    try {
      await import(mod.package)
      installed = true
    } catch {
      installed = false
    }
    results.push({ ...mod, installed })
  }

  return results
}

/**
 * Check if all required cloud modules are installed.
 */
export async function checkCloudReadiness(): Promise<{ ready: boolean; missing: string[]; modules: CloudModule[] }> {
  const modules = await discoverCloudModules()
  const missing = modules
    .filter(m => m.required && !m.installed)
    .map(m => m.package)

  return { ready: missing.length === 0, missing, modules }
}

/**
 * Get install command for missing modules.
 */
export function getInstallCommand(missing: string[]): string {
  if (missing.length === 0) return ''
  return `npm install ${missing.join(' ')} --legacy-peer-deps`
}
