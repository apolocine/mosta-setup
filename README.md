# @mostajs/setup

> Reusable setup wizard module — multi-dialect DB configuration, .env.local writer, seed runner.

[![npm version](https://img.shields.io/npm/v/@mostajs/setup.svg)](https://www.npmjs.com/package/@mostajs/setup)
[![license](https://img.shields.io/npm/l/@mostajs/setup.svg)](LICENSE)

Part of the [@mosta suite](https://mostajs.dev).

---

## Installation

```bash
npm install @mostajs/setup @mostajs/orm
```

## Quick Start

### 1. Create setup config

```typescript
import type { MostaSetupConfig } from '@mostajs/setup'

export const setupConfig: MostaSetupConfig = {
  appName: 'MyApp',
  defaultPort: 3000,
  seedRBAC: async () => { /* seed roles & permissions */ },
  createAdmin: async ({ email, hashedPassword, firstName, lastName }) => { /* create admin user */ },
}
```

### 2. API routes

```typescript
// app/api/setup/status/route.ts
import { createStatusHandler, needsSetup } from '@mostajs/setup'
export const { GET } = createStatusHandler(() => needsSetup(countUsers))

// app/api/setup/test-db/route.ts
import { createTestDbHandler } from '@mostajs/setup'
export const { POST } = createTestDbHandler(() => needsSetup(countUsers))

// app/api/setup/install/route.ts
import { createInstallHandler } from '@mostajs/setup'
export const { POST } = createInstallHandler(() => needsSetup(countUsers), setupConfig)
```

## Features

- **13 database dialects** — all dialects supported by @mostajs/orm
- **Connection testing** — test DB connection before saving
- **URI composition** — auto-build connection URI from form fields
- **.env.local writer** — persist DB config to disk
- **Seed runner** — RBAC + admin user creation
- **Dialect metadata** — names, icons, default ports, categories

## API Reference

| Export | Description |
|--------|-------------|
| `needsSetup(countFn)` | Check if app needs initial setup |
| `runInstall(config)` | Full installation flow |
| `testDbConnection(config)` | Test DB connection |
| `composeDbUri(config)` | Build connection URI |
| `writeEnvLocal(vars)` | Write/update .env.local |
| `DIALECT_INFO` / `ALL_DIALECTS` | Dialect metadata |
| `createStatusHandler()` | GET /setup/status factory |
| `createTestDbHandler()` | POST /setup/test-db factory |
| `createInstallHandler()` | POST /setup/install factory |

## Related Packages

- [@mostajs/orm](https://www.npmjs.com/package/@mostajs/orm) — Multi-dialect ORM (required)
- [@mostajs/auth](https://www.npmjs.com/package/@mostajs/auth) — Authentication (for RBAC seeding)

## License

MIT — © 2025 Dr Hamid MADANI <drmdh@msn.com>
