// @mostajs/setup — Declarative setup.json loader
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Reads a setup.json file and converts it into a MostaSetupConfig
// that can be passed to createInstallHandler() / runInstall().
//
// Usage:
//   import { loadSetupJson } from '@mostajs/setup'
//   const config = await loadSetupJson()                    // reads ./setup.json
//   const config = await loadSetupJson('./my-setup.json')   // custom path
//   const config = await loadSetupJson(jsonObject)          // already-parsed object

import fs from 'fs'
import path from 'path'
import type { MostaSetupConfig, SeedDefinition } from '../types/index'

// ── Types for the JSON structure ─────────────────────────

export interface SetupJsonCategory {
  name: string
  label: string
  description?: string
  icon?: string
  order?: number
  system?: boolean
}

export interface SetupJsonPermission {
  code: string
  name?: string
  description: string
  category: string
}

export interface SetupJsonRole {
  name: string
  description?: string
  system?: boolean
  permissions: string[]
}

export interface SetupJsonRbac {
  categories?: SetupJsonCategory[]
  permissions?: SetupJsonPermission[]
  roles?: SetupJsonRole[]
}

export interface SetupJsonSeed {
  key: string
  label: string
  description?: string
  icon?: string
  default?: boolean
  collection: string
  match?: string
  hashField?: string
  roleField?: string
  defaults?: Record<string, unknown>
  data: Record<string, unknown>[]
}

export interface SetupJson {
  $schema?: string
  app: {
    name: string
    port?: number
    dbNamePrefix?: string
  }
  env?: Record<string, string>
  rbac?: SetupJsonRbac
  seeds?: SetupJsonSeed[]
}

// ── Loader ───────────────────────────────────────────────

/**
 * Load a setup.json and return a MostaSetupConfig.
 *
 * @param source - File path (default: './setup.json'), or an already-parsed object.
 * @param repoFactory - Optional factory to get a repository by collection name.
 *   Signature: `(collection: string) => Promise<{ upsert, create, findOne, count }>`
 *   If omitted, uses `@mostajs/orm` getRepository() at runtime.
 */
export async function loadSetupJson(
  source?: string | SetupJson,
  repoFactory?: (collection: string) => Promise<GenericRepo>,
): Promise<MostaSetupConfig> {
  const json = typeof source === 'object' && source !== null
    ? source
    : readJsonFile(typeof source === 'string' ? source : './setup.json')

  validate(json)

  return buildConfig(json, repoFactory)
}

// ── Internal helpers ─────────────────────────────────────

type GenericRepo = {
  upsert?: (where: Record<string, unknown>, data: Record<string, unknown>) => Promise<{ id: string }>
  create?: (data: Record<string, unknown>) => Promise<{ id: string }>
  findOne?: (where: Record<string, unknown>) => Promise<{ id: string } | null>
  count?: () => Promise<number>
}

function readJsonFile(filePath: string): SetupJson {
  const resolved = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`setup.json not found at ${resolved}`)
  }
  const raw = fs.readFileSync(resolved, 'utf-8')
  return JSON.parse(raw) as SetupJson
}

function validate(json: SetupJson): void {
  if (!json.app?.name) {
    throw new Error('setup.json: "app.name" is required')
  }
  // Validate RBAC cross-references
  if (json.rbac) {
    const categoryNames = new Set((json.rbac.categories ?? []).map(c => c.name))
    const permCodes = new Set((json.rbac.permissions ?? []).map(p => p.code))

    for (const perm of json.rbac.permissions ?? []) {
      if (categoryNames.size > 0 && !categoryNames.has(perm.category)) {
        throw new Error(`setup.json: permission "${perm.code}" references unknown category "${perm.category}"`)
      }
    }
    for (const role of json.rbac.roles ?? []) {
      for (const code of role.permissions) {
        if (code !== '*' && permCodes.size > 0 && !permCodes.has(code)) {
          throw new Error(`setup.json: role "${role.name}" references unknown permission "${code}"`)
        }
      }
    }
  }
}

function buildConfig(json: SetupJson, repoFactory?: (collection: string) => Promise<GenericRepo>): MostaSetupConfig {
  const config: MostaSetupConfig = {
    appName: json.app.name,
    defaultPort: json.app.port,
    extraEnvVars: json.env ? { ...json.env } : undefined,
  }

  // ── seedRBAC ───────────────────────────────────────────
  if (json.rbac) {
    config.seedRBAC = async () => {
      const getRepo = repoFactory ?? defaultRepoFactory

      // 1. Upsert categories
      if (json.rbac!.categories?.length) {
        const catRepo = await getRepo('permissionCategory')
        for (const cat of json.rbac!.categories!) {
          await catRepo.upsert!(
            { name: cat.name },
            { name: cat.name, label: cat.label, description: cat.description ?? '', icon: cat.icon ?? '', order: cat.order ?? 0, system: cat.system ?? true },
          )
        }
      }

      // 2. Upsert permissions — build code→ID map
      const permissionMap: Record<string, string> = {}
      if (json.rbac!.permissions?.length) {
        const permRepo = await getRepo('permission')
        for (const pDef of json.rbac!.permissions!) {
          const displayName = pDef.name ?? pDef.code
          const perm = await permRepo.upsert!(
            { name: displayName },
            { name: displayName, description: pDef.description, category: pDef.category },
          )
          permissionMap[pDef.code] = perm.id
        }
      }

      // 3. Upsert roles with resolved permission IDs
      if (json.rbac!.roles?.length) {
        const roleRepo = await getRepo('role')
        const allPermIds = Object.values(permissionMap)

        for (const roleDef of json.rbac!.roles!) {
          const permissionIds = roleDef.permissions.includes('*')
            ? allPermIds
            : roleDef.permissions.map(code => permissionMap[code]).filter(Boolean)

          await roleRepo.upsert!(
            { name: roleDef.name },
            { name: roleDef.name, description: roleDef.description ?? '', permissions: permissionIds },
          )
        }
      }
    }
  }

  // ── optionalSeeds ──────────────────────────────────────
  if (json.seeds?.length) {
    config.optionalSeeds = json.seeds.map(seedDef => buildSeedDefinition(seedDef, repoFactory))
  }

  return config
}

function buildSeedDefinition(seedDef: SetupJsonSeed, repoFactory?: (collection: string) => Promise<GenericRepo>): SeedDefinition {
  return {
    key: seedDef.key,
    label: seedDef.label,
    description: seedDef.description ?? '',
    icon: seedDef.icon,
    default: seedDef.default,
    run: async () => {
      const getRepo = repoFactory ?? defaultRepoFactory
      const repo = await getRepo(seedDef.collection)

      for (const rawItem of seedDef.data) {
        const item = { ...(seedDef.defaults ?? {}), ...rawItem }

        // Hash field if configured (e.g. password)
        if (seedDef.hashField && item[seedDef.hashField]) {
          const bcryptModule = await import('bcryptjs')
          const bcrypt = bcryptModule.default || bcryptModule
          item[seedDef.hashField] = await bcrypt.hash(String(item[seedDef.hashField]), 12)
        }

        // Resolve role name → role ID if configured
        if (seedDef.roleField && item[seedDef.roleField]) {
          const roleRepo = await getRepo('role')
          const roleName = String(item[seedDef.roleField])
          const role = await roleRepo.findOne!({ name: roleName })
          if (role) {
            item.roles = [role.id]
          }
          delete item[seedDef.roleField]
        }

        // Upsert (idempotent) or create
        if (seedDef.match && repo.upsert) {
          const matchValue = item[seedDef.match]
          await repo.upsert({ [seedDef.match]: matchValue }, item)
        } else if (repo.create) {
          // Skip if already exists (check match field if available)
          if (seedDef.match && repo.findOne) {
            const existing = await repo.findOne({ [seedDef.match]: item[seedDef.match] })
            if (existing) continue
          }
          await repo.create(item)
        }
      }
    },
  }
}

async function defaultRepoFactory(collection: string): Promise<GenericRepo> {
  // Try to import a getRepository from @mostajs/orm if available
  try {
    const orm = await import('@mostajs/orm')
    if ('getRepository' in orm && typeof orm.getRepository === 'function') {
      return await (orm.getRepository as (name: string) => Promise<GenericRepo>)(collection)
    }
  } catch { /* fallback below */ }
  throw new Error(
    `No repository factory provided for collection "${collection}". ` +
    `Pass a repoFactory argument to loadSetupJson().`
  )
}
