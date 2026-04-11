// @mostajs/setup — Module registry
// Discovers installed @mostajs modules and their schemas/seeds
// Author: Dr Hamid MADANI drmdh@msn.com

export interface ModuleDescriptor {
  name: string
  label: string
  getSchemas: () => any[]
  seed: (options?: any) => Promise<any>
  createAdmin?: (options: { email: string; password: string; firstName: string; lastName: string }) => Promise<any>
}

/**
 * Discover installed @mostajs modules and return their descriptors.
 * Tries dynamic import of each module's module-info.
 */
export async function discoverModules(moduleNames?: string[]): Promise<ModuleDescriptor[]> {
  const modules: ModuleDescriptor[] = []
  const candidates = moduleNames || ['rbac', 'audit', 'settings']

  for (const name of candidates) {
    try {
      // Try importing module-info from each @mostajs module
      let info: any = null
      switch (name) {
        case 'rbac':
        case 'auth': // auth delegates to rbac
          info = await import('@mostajs/rbac/lib/module-info').catch(() => null)
          break
        case 'audit':
          info = await import('@mostajs/audit/lib/module-info').catch(() => null)
          break
        case 'settings':
          info = await import('@mostajs/settings/lib/module-info').catch(() => null)
          break
      }

      if (info?.moduleInfo) {
        modules.push({
          name: info.moduleInfo.name,
          label: info.moduleInfo.label,
          getSchemas: info.moduleInfo.schemas || info.getSchemas,
          seed: info.moduleInfo.seed,
          createAdmin: info.moduleInfo.createAdmin,
        })
      }
    } catch {
      // Module not installed — skip
    }
  }

  return modules
}

/**
 * Collect all schemas from discovered modules.
 */
export function collectSchemas(modules: ModuleDescriptor[]): any[] {
  const schemas: any[] = []
  const seen = new Set<string>()

  for (const mod of modules) {
    for (const schema of mod.getSchemas()) {
      if (!seen.has(schema.name)) {
        seen.add(schema.name)
        schemas.push(schema)
      }
    }
  }

  return schemas
}
