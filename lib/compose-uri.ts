// @mosta/setup — Compose DB connection URI for all 13 dialects
// Author: Dr Hamid MADANI drmdh@msn.com
import type { DialectType, DbConfig } from '../types/index'

/**
 * Compose a database connection URI from individual fields.
 */
export function composeDbUri(dialect: DialectType, config: DbConfig): string {
  const { host, port, name, user, password } = config
  const eu = encodeURIComponent(user)
  const ep = encodeURIComponent(password)

  switch (dialect) {
    case 'mongodb':
      if (user && password) return `mongodb://${eu}:${ep}@${host}:${port}/${name}`
      return `mongodb://${host}:${port}/${name}`
    case 'sqlite':
      return `./data/${name}.db`
    case 'postgres':
    case 'cockroachdb':
      return `postgresql://${eu}:${ep}@${host}:${port}/${name}`
    case 'mysql':
      return `mysql://${eu}:${ep}@${host}:${port}/${name}`
    case 'mariadb':
      return `mariadb://${eu}:${ep}@${host}:${port}/${name}`
    case 'oracle':
      return `oracle://${eu}:${ep}@${host}:${port}/${name}`
    case 'mssql':
      return `mssql://${eu}:${ep}@${host}:${port}/${name}`
    case 'db2':
      return `db2://${eu}:${ep}@${host}:${port}/${name}`
    case 'hana':
      return `hana://${eu}:${ep}@${host}:${port}`
    case 'hsqldb':
      return `hsqldb:hsql://${host}:${port}/${name}`
    case 'spanner':
      return `spanner://projects/${name}`
    case 'sybase':
      return `sybase://${eu}:${ep}@${host}:${port}/${name}`
    default:
      return `mongodb://${host}:${port}/${name}`
  }
}
