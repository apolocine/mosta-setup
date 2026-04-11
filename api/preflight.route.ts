// @mosta/setup — Preflight checks: env, DB connection, DB exists, users
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Copy to: src/app/api/setup/preflight/route.ts

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface PreflightCheck {
  key: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

/**
 * Creates a GET handler for preflight environment checks.
 * Returns an array of checks: env file, dialect, URI, setup.json, DB connection, users count, Node.js version.
 */
export function createPreflightHandler() {
  async function GET() {
    const checks: PreflightCheck[] = []
    const cwd = process.cwd()

    // 1. .env.local
    const envExists = existsSync(join(cwd, '.env.local'))
    checks.push({
      key: 'envFile',
      label: '.env.local',
      status: envExists ? 'ok' : 'warn',
      detail: envExists ? 'Fichier trouvé' : 'Fichier absent — sera créé lors de l\'installation',
    })

    // 2. DB_DIALECT
    const dialect = process.env.DB_DIALECT
    checks.push({
      key: 'dialect',
      label: 'DB_DIALECT',
      status: dialect ? 'ok' : 'warn',
      detail: dialect ? `Dialect configuré : ${dialect}` : 'Non défini — à configurer',
    })

    // 3. SGBD_URI (masquer le mot de passe)
    const uri = process.env.SGBD_URI
    checks.push({
      key: 'uri',
      label: 'SGBD_URI',
      status: uri ? 'ok' : 'warn',
      detail: uri
        ? `URI : ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`
        : 'Non définie — à configurer',
    })

    // 4. setup.json
    const setupJsonExists = existsSync(join(cwd, 'setup.json'))
    checks.push({
      key: 'setupJson',
      label: 'setup.json',
      status: setupJsonExists ? 'ok' : 'warn',
      detail: setupJsonExists ? 'Fichier de configuration trouvé' : 'Fichier absent',
    })

    // 5. DB connection + users
    if (dialect && uri) {
      try {
        const { getDialect, BaseRepository, registerSchemas } = await import('@mostajs/orm')
        const d = await getDialect()

        if (d) {
          checks.push({
            key: 'dbConnection',
            label: 'Connexion DB',
            status: 'ok',
            detail: `Connecté (${d.constructor.name})`,
          })

          // Count users
          try {
            const UserSchema = {
              name: 'User', collection: 'users', timestamps: true,
              fields: { email: { type: 'string' as const } }, relations: {}, indexes: [],
            }
            registerSchemas([UserSchema])
            const repo = new BaseRepository(UserSchema, d)
            const count = await repo.count()
            checks.push({
              key: 'users',
              label: 'Utilisateurs',
              status: count > 0 ? 'ok' : 'warn',
              detail: count > 0
                ? `${count} utilisateur(s) trouvé(s)`
                : 'Aucun utilisateur — installation requise',
            })
          } catch {
            checks.push({
              key: 'users',
              label: 'Utilisateurs',
              status: 'warn',
              detail: 'Table users inexistante — installation requise',
            })
          }
        } else {
          checks.push({
            key: 'dbConnection',
            label: 'Connexion DB',
            status: 'fail',
            detail: 'Connexion échouée (dialect null)',
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue'
        const dbNotExist = msg.includes('does not exist') || msg.includes('Unknown database')
        checks.push({
          key: 'dbConnection',
          label: 'Connexion DB',
          status: 'fail',
          detail: dbNotExist
            ? 'Base de données introuvable — à créer'
            : `Erreur : ${msg}`,
        })
        if (dbNotExist) {
          checks.push({
            key: 'dbExists',
            label: 'Base de données',
            status: 'fail',
            detail: 'La base n\'existe pas — utilisez l\'étape Connexion pour la créer',
          })
        }
      }
    } else {
      checks.push({
        key: 'dbConnection',
        label: 'Connexion DB',
        status: 'warn',
        detail: 'Pas de configuration DB — à configurer',
      })
    }

    // 6. Node.js
    checks.push({
      key: 'node',
      label: 'Node.js',
      status: 'ok',
      detail: `Version ${process.version}`,
    })

    return Response.json({ checks })
  }

  return { GET }
}
