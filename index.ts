// @mosta/setup — Barrel exports
// Author: Dr Hamid MADANI drmdh@msn.com

// Core
export { needsSetup, runInstall } from './lib/setup.js'
export { testDbConnection } from './lib/db-test.js'
export { composeDbUri } from './lib/compose-uri.js'
export { writeEnvLocal } from './lib/env-writer.js'

// Data
export { DIALECT_INFO, ALL_DIALECTS } from './data/dialects.js'
export { MODULES, resolveModuleDependencies } from './data/module-definitions.js'

// Lib
export { discoverNpmModules } from './lib/discover-modules.js'
export { loadSetupJson } from './lib/load-setup-json.js'
export type { SetupJson, SetupJsonRbac, SetupJsonSeed, SetupJsonCategory, SetupJsonPermission, SetupJsonRole } from './lib/load-setup-json.js'

// API route factories
export { createTestDbHandler } from './api/test-db.route.js'
export { createInstallHandler } from './api/install.route.js'
export { createStatusHandler } from './api/status.route.js'
export { createDetectModulesHandler } from './api/detect-modules.route.js'
export { createInstallModulesHandler } from './api/install-modules.route.js'
export { createReconfigHandlers } from './api/reconfig.route.js'
export { createUploadJarHandlers } from './api/upload-jar.route.js'
export { createWireModuleHandler } from './api/wire-module.route.js'
export { createSetupJsonHandler } from './api/upload-setup-json.route.js'
export { createPreflightHandler } from './api/preflight.route.js'
export type { PreflightCheck } from './api/preflight.route.js'
export { createCreateDbHandler } from './api/create-db.route.js'

// Components
export { default as ReconfigPanel } from './components/ReconfigPanel.js'
export { default as SetupWizard } from './components/SetupWizard.js'

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
} from './types/index.js'
