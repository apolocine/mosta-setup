// @mosta/setup — Barrel exports
// Author: Dr Hamid MADANI drmdh@msn.com

// Core
export { needsSetup, runInstall } from './lib/setup'
export { testDbConnection } from './lib/db-test'
export { composeDbUri } from './lib/compose-uri'
export { writeEnvLocal } from './lib/env-writer'

// Data
export { DIALECT_INFO, ALL_DIALECTS } from './data/dialects'

// API route factories
export { createTestDbHandler } from './api/test-db.route'
export { createInstallHandler } from './api/install.route'
export { createStatusHandler } from './api/status.route'

// Types
export type {
  DialectType,
  DialectInfo,
  DbConfig,
  InstallConfig,
  SeedOptions,
  SeedDefinition,
  MostaSetupConfig,
} from './types'
