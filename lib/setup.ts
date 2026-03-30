// @mosta/setup — Core setup logic
// Author: Dr Hamid MADANI drmdh@msn.com
import { composeDbUri } from './compose-uri.js'
import { writeEnvLocal } from './env-writer.js'
import { NetClient } from './net-client.js'
import type { InstallConfig, MostaSetupConfig } from '../types/index.js'

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
): Promise<{ ok: boolean; error?: string; needsRestart: boolean; seeded?: string[]; jdbcInfo?: string }> {
  // Route to NET install if mode is 'net'
  if (installConfig.mode === 'net' && installConfig.net) {
    return runNetInstall(installConfig, setupConfig)
  }

  try {
    // 1. Compose URI and write .env.local
    const uri = composeDbUri(installConfig.dialect, installConfig.db)
    const extraVars: Record<string, string> = { ...setupConfig.extraEnvVars }
    // Mode ORM : forcer MOSTA_DATA=orm (écrase un éventuel =net résiduel)
    extraVars['MOSTA_DATA'] = 'orm'
    if (installConfig.modules?.length) {
      extraVars['MOSTAJS_MODULES'] = installConfig.modules.join(',')
    }
    const needsRestart = await writeEnvLocal({
      dialect: installConfig.dialect,
      uri,
      extraVars,
      port: setupConfig.defaultPort,
    })

    // 2. For JDBC dialects, persist bridge port so app always reconnects to the same bridge
    // Note: Oracle uses native oracledb driver, not JDBC bridge
    const JDBC_DIALECTS = ['hsqldb', 'db2', 'hana', 'sybase']
    if (JDBC_DIALECTS.includes(installConfig.dialect)) {
      const bridgePort = process.env.MOSTA_BRIDGE_PORT_BASE || '8765'
      extraVars['MOSTA_BRIDGE_PORT_BASE'] = bridgePort
      // Re-write env with bridge port
      await writeEnvLocal({
        dialect: installConfig.dialect,
        uri,
        extraVars,
        port: setupConfig.defaultPort,
      })
    }

    // 3. Set process.env in-memory (force ORM mode even if app started as NET)
    process.env.MOSTA_DATA = 'orm'
    process.env.DB_DIALECT = installConfig.dialect
    process.env.SGBD_URI = uri
    if (installConfig.dialect !== 'mongodb') {
      process.env.DB_SCHEMA_STRATEGY = 'update'
    }
    // Clear NET vars to avoid confusion
    delete process.env.MOSTA_NET_URL
    delete process.env.MOSTA_NET_TRANSPORT

    // 4. Disconnect existing dialect singleton
    const { disconnectDialect } = await import('@mostajs/orm')
    await disconnectDialect()

    const seeded: string[] = []

    // 4. Discover modules and seed RBAC
    const { discoverModules } = await import('./module-registry.js')
    const modules = await discoverModules(installConfig.modules)

    // 4a. Read setup.json for RBAC + seed data
    const fs = await import('fs')
    const path = await import('path')
    let setupJson: any = null
    const setupJsonPath = path.resolve(process.cwd(), 'setup.json')
    if (fs.existsSync(setupJsonPath)) {
      try { setupJson = JSON.parse(fs.readFileSync(setupJsonPath, 'utf-8')) } catch {}
    }

    // 4b. Seed each module (RBAC gets setup.json.rbac data from Studio)
    for (const mod of modules) {
      try {
        const seedData = setupJson?.[mod.name] || {}
        await mod.seed(seedData)
        seeded.push(mod.name)
      } catch (err) {
        console.error(`[Setup] Module "${mod.name}" seed failed:`, err)
      }
    }

    // 5. Create admin via rbac module (not setup — rbac handles hash + role)
    const rbacModule = modules.find(m => m.createAdmin)
    if (rbacModule && installConfig.admin?.email) {
      try {
        await rbacModule.createAdmin!({
          email: installConfig.admin.email,
          password: installConfig.admin.password,
          firstName: installConfig.admin.firstName,
          lastName: installConfig.admin.lastName,
        })
        seeded.push('admin')
      } catch (err) {
        console.error('[Setup] createAdmin failed:', err)
      }
    } else if (setupConfig.createAdmin) {
      // Legacy fallback — app provides its own createAdmin
      const bcryptModule = await import('bcryptjs')
      const bcrypt = bcryptModule.default || bcryptModule
      const hashedPassword = await bcrypt.hash(installConfig.admin.password, 12)
      await setupConfig.createAdmin({
        email: installConfig.admin.email,
        hashedPassword,
        firstName: installConfig.admin.firstName,
        lastName: installConfig.admin.lastName,
      })
      seeded.push('admin')
    }

    // 6. Optional seeds from setup.json (app-specific: activities, clients, plans)
    if (setupConfig.optionalSeeds && installConfig.seed) {
      for (const seedDef of setupConfig.optionalSeeds) {
        if (installConfig.seed[seedDef.key]) {
          try {
            await seedDef.run({})
            seeded.push(seedDef.key)
          } catch (err) {
            console.error(`[Setup] Seed "${seedDef.key}" failed:`, err)
          }
        }
      }
    }

    // For JDBC dialects, add info about bridge/server requirements
    const jdbcInfo = JDBC_DIALECTS.includes(installConfig.dialect)
      ? `Le serveur ${installConfig.dialect.toUpperCase()} et le bridge JDBC doivent rester actifs.`
      : undefined

    return { ok: true, needsRestart, seeded, jdbcInfo }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur installation'
    return { ok: false, error: message, needsRestart: false }
  }
}

/**
 * Run installation via @mostajs/net (remote server).
 * Seeds RBAC, creates admin, runs optional seeds — all via REST.
 */
async function runNetInstall(
  installConfig: InstallConfig,
  setupConfig: MostaSetupConfig,
): Promise<{ ok: boolean; error?: string; needsRestart: boolean; seeded?: string[] }> {
  try {
    // Force NET mode in-memory (even if app started as ORM)
    process.env.MOSTA_DATA = 'net'
    process.env.MOSTA_NET_URL = installConfig.net!.url

    const net = new NetClient({
      url: installConfig.net!.url,
      apiKey: installConfig.net!.apiKey,
    })

    // 1. Préparer les vars .env.local (écriture REPORTÉE à la fin pour éviter
    //    le hot-reload de Next.js qui interrompt le seed en cours)
    const extraVars: Record<string, string> = {
      MOSTA_DATA: 'net',
      MOSTA_NET_URL: installConfig.net!.url,
      MOSTA_NET_TRANSPORT: installConfig.net!.transport,
      ...(installConfig.net!.apiKey ? { MOSTA_NET_API_KEY: installConfig.net!.apiKey } : {}),
      ...setupConfig.extraEnvVars,
    }
    if (installConfig.modules?.length) {
      extraVars['MOSTAJS_MODULES'] = installConfig.modules.join(',')
    }

    const seeded: string[] = []

    // 2. Verify NET server is reachable (retry up to 10s if just restarted)
    let health: any = null
    for (let i = 0; i < 10; i++) {
      try {
        health = await net.health()
        if (health.entities?.length > 0) break
      } catch {}
      await new Promise(r => setTimeout(r, 1000))
    }
    if (!health) {
      return { ok: false, error: 'Serveur NET non joignable', needsRestart: false }
    }

    // 3. Read setup.json for RBAC definitions
    const fs = await import('fs')
    const path = await import('path')
    let setupJson: any = null
    const setupJsonPath = path.resolve(process.cwd(), 'setup.json')
    if (fs.existsSync(setupJsonPath)) {
      try { setupJson = JSON.parse(fs.readFileSync(setupJsonPath, 'utf-8')) } catch {}
    }

    // 4. If server has no entities (schemas not yet uploaded), try sending them
    if (!health?.entities?.length) {
      let schemasToSend: any[] = []
      // Try schemas.json local
      const schemasJsonPath = path.resolve(process.cwd(), 'schemas.json')
      if (fs.existsSync(schemasJsonPath)) {
        try { schemasToSend = JSON.parse(fs.readFileSync(schemasJsonPath, 'utf-8')) } catch {}
      }
      // Fallback: ORM registry
      if (schemasToSend.length === 0) {
        try {
          const { getAllSchemas } = await import('@mostajs/orm')
          schemasToSend = getAllSchemas()
        } catch {}
      }
      if (schemasToSend.length > 0) {
        // Send schemas to NET server — it will restart to register routes
        try {
          const res = await fetch(`${installConfig.net!.url}/api/upload-schemas-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schemas: schemasToSend }),
          })
          const result = await res.json()
          if (result.ok) {
            seeded.push(`schemas (${schemasToSend.length})`)
            // Si le serveur redémarre, attendre qu'il soit de retour
            if (result.needsRestart) {
              console.log('[Setup] Serveur NET redémarre pour charger les schemas...')
              await new Promise(r => setTimeout(r, 4000)) // Laisser le temps au process.exit + restart
              // Poll health jusqu'à ce que le serveur soit de retour (max 30s)
              for (let i = 0; i < 30; i++) {
                try {
                  const h = await net.health()
                  if (h.entities?.length > 0) {
                    console.log(`[Setup] Serveur NET de retour (${h.entities.length} entités)`)
                    break
                  }
                } catch {}
                await new Promise(r => setTimeout(r, 1000))
              }
              // Recharger la collection map
              await net.loadCollectionMap()
            }
          }
        } catch (e) {
          console.error('[Setup] Failed to upload schemas to NET server:', e)
        }
      }
      // Re-check
      const health2 = await net.health()
      if (!health2.entities?.length) {
        return { ok: false, error: 'Serveur NET accessible mais aucun schema charge. Placez un schemas.json dans le repertoire du serveur NET et redemarrez-le.', needsRestart: false }
      }
    }

    await net.loadCollectionMap()
    console.log(`[Setup NET] Serveur prêt — ${health?.entities?.length ?? 0} entités, collectionMap chargée`)

    if (setupJson?.rbac) {
      const rbac = setupJson.rbac

      // 3a. Upsert categories
      if (rbac.categories?.length) {
        for (const cat of rbac.categories) {
          await net.upsert('permission_categories', { name: cat.name }, {
            name: cat.name, label: cat.label, description: cat.description ?? '',
            icon: cat.icon ?? '', order: cat.order ?? 0, system: cat.system ?? true,
          })
        }
        seeded.push('categories')
      }

      // 3b. Upsert permissions — build code→ID map
      const permissionMap: Record<string, string> = {}
      if (rbac.permissions?.length) {
        for (const pDef of rbac.permissions) {
          const displayName = pDef.name ?? pDef.code
          const perm = await net.upsert('permissions', { name: displayName }, {
            name: displayName, description: pDef.description, category: pDef.category,
          })
          permissionMap[pDef.code] = perm.id as string
        }
        seeded.push('permissions')
      }

      // 3c. Upsert roles with permission IDs
      if (rbac.roles?.length) {
        const allPermIds = Object.values(permissionMap)
        for (const roleDef of rbac.roles) {
          const permissionIds = roleDef.permissions.includes('*')
            ? allPermIds
            : roleDef.permissions.map((code: string) => permissionMap[code]).filter(Boolean)
          await net.upsert('roles', { name: roleDef.name }, {
            name: roleDef.name, description: roleDef.description ?? '', permissions: permissionIds,
          })
        }
        seeded.push('roles')
      }
    }

    // 4. Create admin user via NET REST
    if (installConfig.admin.email) {
      const bcryptModule = await import('bcryptjs')
      const bcrypt = bcryptModule.default || bcryptModule
      const hashedPassword = await bcrypt.hash(installConfig.admin.password, 12)

      const adminRole = await net.findOne('roles', { name: 'admin' })

      await net.create('users', {
        email: installConfig.admin.email,
        password: hashedPassword,
        firstName: installConfig.admin.firstName,
        lastName: installConfig.admin.lastName,
        status: 'active',
        roles: adminRole ? [adminRole.id] : [],
      })
      seeded.push('admin')
    }

    // 5. Optional seeds via NET REST
    if (setupJson?.seeds && installConfig.seed) {
      for (const seedDef of setupJson.seeds) {
        if (!installConfig.seed[seedDef.key]) continue

        // Resolve lookupFields
        const resolved: Record<string, unknown> = {}
        if (seedDef.lookupFields) {
          for (const [field, lookup] of Object.entries(seedDef.lookupFields as Record<string, { collection: string; match: string; value: string }>)) {
            const found = await net.findOne(lookup.collection, { [lookup.match]: lookup.value })
            if (found) resolved[field] = found.id
          }
        }

        for (const rawItem of seedDef.data) {
          const item = { ...(seedDef.defaults ?? {}), ...resolved, ...rawItem }

          // Hash field if configured
          if (seedDef.hashField && item[seedDef.hashField]) {
            const bcryptModule = await import('bcryptjs')
            const bcrypt = bcryptModule.default || bcryptModule
            item[seedDef.hashField] = await bcrypt.hash(String(item[seedDef.hashField]), 12)
          }

          // Resolve role name → role ID
          if (seedDef.roleField && item[seedDef.roleField]) {
            const role = await net.findOne('roles', { name: String(item[seedDef.roleField]) })
            if (role) item.roles = [role.id]
            delete item[seedDef.roleField]
          }

          // Upsert or create
          if (seedDef.match) {
            await net.upsert(seedDef.collection, { [seedDef.match]: item[seedDef.match] }, item)
          } else {
            await net.create(seedDef.collection, item)
          }
        }
        seeded.push(seedDef.key)
      }
    }

    // 6. Run code-based optionalSeeds (e.g. demoAccess: resolve slugs, create accesses)
    if (setupConfig.optionalSeeds && installConfig.seed) {
      for (const seedDef of setupConfig.optionalSeeds) {
        if (installConfig.seed[seedDef.key]) {
          try {
            await seedDef.run({})
            seeded.push(seedDef.key)
          } catch (e) {
            console.error(`[Setup NET] optionalSeed "${seedDef.key}" failed:`, e)
          }
        }
      }
    }

    // Écrire .env.local en DERNIER (après tout le seed)
    // pour éviter le hot-reload Next.js pendant le seed
    await writeEnvLocal({
      skipDb: true,
      extraVars,
      port: setupConfig.defaultPort,
    })

    return { ok: true, needsRestart: true, seeded }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur installation NET'
    return { ok: false, error: message, needsRestart: false }
  }
}
