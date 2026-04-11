// @mosta/setup — Types
// Author: Dr Hamid MADANI drmdh@msn.com

export type DialectType =
  | 'mongodb' | 'sqlite' | 'postgres' | 'mysql' | 'mariadb'
  | 'oracle' | 'mssql' | 'cockroachdb' | 'db2' | 'hana'
  | 'hsqldb' | 'spanner' | 'sybase'

export interface DialectInfo {
  name: string
  icon: string
  defaultPort: number
  defaultUser: string
  defaultHost: string
  driverHint: string | null
  requiresAuth: boolean
  category: 'document' | 'file' | 'sql' | 'enterprise' | 'distributed' | 'legacy'
}

export interface DbConfig {
  host: string
  port: number
  name: string
  user: string
  password: string
}

export interface InstallConfig {
  dialect: DialectType
  db: DbConfig
  admin: { email: string; password: string; firstName: string; lastName: string }
  seed?: SeedOptions
  modules?: string[]
}

export type { ModuleDefinition } from '../data/module-definitions'

export interface SeedOptions {
  [key: string]: boolean
}

export interface SeedDefinition {
  key: string
  label: string
  description: string
  icon?: string
  default?: boolean
  run: (repos: any) => Promise<void>
}

export interface MostaSetupConfig {
  /** Application name (shown in wizard) */
  appName: string
  /** Default port (default: 3000) */
  defaultPort?: number
  /** Callback to seed RBAC (permissions, roles, categories) */
  seedRBAC?: () => Promise<void>
  /** Create first admin user — called with hashed password */
  createAdmin?: (admin: { email: string; hashedPassword: string; firstName: string; lastName: string }) => Promise<void>
  /** Optional seeds shown in the wizard (legacy — prefer runModuleSeeds) */
  optionalSeeds?: SeedDefinition[]
  /** Run seeds from the module registry (Phase 4 runtime) */
  runModuleSeeds?: (modules?: string[]) => Promise<void>
  /** Extra env vars to write to .env.local */
  extraEnvVars?: Record<string, string>
}
