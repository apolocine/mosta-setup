// @mosta/setup — Barrel exports
// Author: Dr Hamid MADANI drmdh@msn.com

// Core
export { needsSetup, runInstall } from './lib/setup'
export { testDbConnection } from './lib/db-test'
export { composeDbUri } from './lib/compose-uri'
export { writeEnvLocal } from './lib/env-writer'

// Data
export { DIALECT_INFO, ALL_DIALECTS } from './data/dialects'
export { MODULES, resolveModuleDependencies } from './data/module-definitions'

// Lib
export { discoverNpmModules } from './lib/discover-modules'

// API route factories
export { createTestDbHandler } from './api/test-db.route'
export { createInstallHandler } from './api/install.route'
export { createStatusHandler } from './api/status.route'
export { createDetectModulesHandler } from './api/detect-modules.route'
export { createInstallModulesHandler } from './api/install-modules.route'

// Menu contribution
export { setupMenuContribution } from './lib/menu'

// Types
export type {
  DialectType,
  DialectInfo,
  DbConfig,
  InstallConfig,
  SeedOptions,
  SeedDefinition,
  MostaSetupConfig,
  ModuleDefinition,
} from './types/index'
