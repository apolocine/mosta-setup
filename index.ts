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
export { loadSetupJson } from './lib/load-setup-json'
export type { SetupJson, SetupJsonRbac, SetupJsonSeed, SetupJsonCategory, SetupJsonPermission, SetupJsonRole } from './lib/load-setup-json'

// API route factories
export { createTestDbHandler } from './api/test-db.route'
export { createInstallHandler } from './api/install.route'
export { createStatusHandler } from './api/status.route'
export { createDetectModulesHandler } from './api/detect-modules.route'
export { createInstallModulesHandler } from './api/install-modules.route'
export { createReconfigHandlers } from './api/reconfig.route'
export { createUploadJarHandlers } from './api/upload-jar.route'
export { createWireModuleHandler } from './api/wire-module.route'

// Components
export { default as ReconfigPanel } from './components/ReconfigPanel'
export { default as SetupWizard } from './components/SetupWizard'

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
