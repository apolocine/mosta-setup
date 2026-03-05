// @mosta/setup — Core setup logic
// Author: Dr Hamid MADANI drmdh@msn.com
import { composeDbUri } from './compose-uri'
import { writeEnvLocal } from './env-writer'
import type { InstallConfig, MostaSetupConfig } from '../types/index'

/**
 * Check if the app needs initial setup (0 users in DB).
 * Provide a countUsers function from your app.
 */
export async function needsSetup(countUsers: () => Promise<number>): Promise<boolean> {
  try {
    const count = await countUsers()
    return count === 0
  } catch {
    return true
  }
}

/**
 * Run the complete installation flow.
 *
 * 1. Compose URI and write .env.local
 * 2. Set process.env in-memory
 * 3. Disconnect existing dialect singleton
 * 4. Seed RBAC (via config.seedRBAC callback)
 * 5. Create first admin user
 * 6. Run optional seeds
 */
export async function runInstall(
  installConfig: InstallConfig,
  setupConfig: MostaSetupConfig,
): Promise<{ ok: boolean; error?: string; needsRestart: boolean; seeded?: string[] }> {
  try {
    // 1. Compose URI and write .env.local
    const uri = composeDbUri(installConfig.dialect, installConfig.db)
    const extraVars = { ...setupConfig.extraEnvVars }
    if (installConfig.modules?.length) {
      extraVars['MOSTAJS_MODULES'] = installConfig.modules.join(',')
    }
    const needsRestart = await writeEnvLocal({
      dialect: installConfig.dialect,
      uri,
      extraVars,
      port: setupConfig.defaultPort,
    })

    // 2. Set process.env in-memory
    process.env.DB_DIALECT = installConfig.dialect
    process.env.SGBD_URI = uri
    if (installConfig.dialect !== 'mongodb') {
      process.env.DB_SCHEMA_STRATEGY = 'update'
    }

    // 3. Disconnect existing dialect singleton
    const { disconnectDialect } = await import('@mostajs/orm')
    await disconnectDialect()

    // 4. Seed RBAC
    const seeded: string[] = []
    if (setupConfig.seedRBAC) {
      await setupConfig.seedRBAC()
      seeded.push('categories', 'permissions', 'roles')
    }

    // 5. Create admin user
    if (setupConfig.createAdmin) {
      const bcrypt = await import('bcryptjs')
      const hashedPassword = await bcrypt.hash(installConfig.admin.password, 12)
      await setupConfig.createAdmin({
        email: installConfig.admin.email,
        hashedPassword,
        firstName: installConfig.admin.firstName,
        lastName: installConfig.admin.lastName,
      })
      seeded.push('admin')
    }

    // 6. Optional seeds
    if (setupConfig.optionalSeeds && installConfig.seed) {
      for (const seedDef of setupConfig.optionalSeeds) {
        if (installConfig.seed[seedDef.key]) {
          await seedDef.run({})
          seeded.push(seedDef.key)
        }
      }
    }

    return { ok: true, needsRestart, seeded }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur installation'
    return { ok: false, error: message, needsRestart: false }
  }
}
