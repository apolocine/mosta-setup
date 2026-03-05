# @mostajs/setup

> Reusable setup wizard module — multi-dialect DB configuration, .env.local writer, seed runner, module discovery.

[![npm version](https://img.shields.io/npm/v/@mostajs/setup.svg)](https://www.npmjs.com/package/@mostajs/setup)
[![license](https://img.shields.io/npm/l/@mostajs/setup.svg)](LICENSE)

Part of the [@mosta suite](https://mostajs.dev).

---

## Table des matieres

1. [Installation](#1-installation)
2. [Architecture du package](#2-architecture-du-package)
3. [Didacticiel : integrer @mostajs/setup dans une nouvelle app](#3-didacticiel--integrer-mostajssetup-dans-une-nouvelle-app)
   - [Etape 1 — Installation des dependances](#etape-1--installation-des-dependances)
   - [Etape 2 — Configurer le setup (lib/setup.ts)](#etape-2--configurer-le-setup-libsetupts)
   - [Etape 3 — Creer les routes API](#etape-3--creer-les-routes-api)
   - [Etape 4 — Creer la page Setup (frontend)](#etape-4--creer-la-page-setup-frontend)
   - [Etape 5 — Middleware : rediriger vers /setup](#etape-5--middleware--rediriger-vers-setup)
   - [Etape 6 — Tester le flux complet](#etape-6--tester-le-flux-complet)
4. [API Reference](#4-api-reference)
5. [Les 13 dialectes supportes](#5-les-13-dialectes-supportes)
6. [Systeme de modules](#6-systeme-de-modules)
7. [Exemples avances](#7-exemples-avances)
8. [FAQ / Troubleshooting](#8-faq--troubleshooting)

---

## 1. Installation

```bash
npm install @mostajs/setup @mostajs/orm
```

`@mostajs/orm` est un peer dependency requis (il fournit les dialectes DB).

---

## 2. Architecture du package

```
@mostajs/setup
├── data/
│   ├── dialects.ts              # Metadata des 13 SGBD (icone, port, driver)
│   └── module-definitions.ts    # Liste statique des modules @mostajs/*
├── lib/
│   ├── setup.ts                 # needsSetup() + runInstall()
│   ├── compose-uri.ts           # Compose URI de connexion (mongo, pg, mysql...)
│   ├── db-test.ts               # Test de connexion ephemere
│   ├── env-writer.ts            # Ecriture/maj de .env.local
│   └── discover-modules.ts      # Decouverte npm dynamique
├── api/
│   ├── status.route.ts          # Factory GET  /api/setup/status
│   ├── test-db.route.ts         # Factory POST /api/setup/test-db
│   ├── install.route.ts         # Factory POST /api/setup/install
│   ├── detect-modules.route.ts  # Factory GET  /api/setup/detect-modules
│   └── install-modules.route.ts # Factory POST /api/setup/install-modules
├── types/
│   └── index.ts                 # Tous les types TypeScript
└── index.ts                     # Barrel exports
```

**Principe** : le package fournit des **factory functions** qui retournent des handlers `{ GET }` ou `{ POST }`. Votre app Next.js les expose en une ligne par route.

---

## 3. Didacticiel : integrer @mostajs/setup dans une nouvelle app

### Prerequis

- Next.js 14+ (App Router)
- Node.js >= 18
- `@mostajs/orm` installe

### Etape 1 — Installation des dependances

```bash
npm install @mostajs/setup @mostajs/orm bcryptjs
npm install -D @types/bcryptjs
```

### Etape 2 — Configurer le setup (`lib/setup.ts`)

Ce fichier est le **pont** entre le package generique et votre application. Il definit :
- Comment compter les utilisateurs (pour `needsSetup`)
- Comment seeder les roles/permissions
- Comment creer l'admin
- Les seeds optionnels propres a votre app

```typescript
// src/lib/setup.ts
import {
  needsSetup as _needsSetup,
  runInstall as _runInstall,
} from '@mostajs/setup/lib/setup'
import type {
  DialectType,
  MostaSetupConfig,
  SeedDefinition,
  InstallConfig,
} from '@mostajs/setup'

export type { DialectType }

// ─── needsSetup : verifie si la DB a 0 users ──────────────
export async function needsSetup(): Promise<boolean> {
  return _needsSetup(async () => {
    // Adaptez cette ligne a votre couche d'acces aux donnees
    const { userRepo } = await import('@/dal/service')
    const repo = await userRepo()
    return repo.count()
  })
}

// ─── Seeds optionnels (propres a votre app) ────────────────
const optionalSeeds: SeedDefinition[] = [
  {
    key: 'demoData',
    label: 'Donnees de demonstration',
    description: 'Quelques enregistrements pour tester',
    run: async () => {
      // Votre logique de seed
      const { productRepo } = await import('@/dal/service')
      const repo = await productRepo()
      await repo.create({ name: 'Produit A', price: 1000 })
      await repo.create({ name: 'Produit B', price: 2000 })
    },
  },
]

// ─── Configuration du setup ────────────────────────────────
const SETUP_CONFIG: MostaSetupConfig = {
  appName: 'Mon Application',
  defaultPort: 3000,

  // Callback pour seeder les roles et permissions
  seedRBAC: async () => {
    const { roleRepo, permissionRepo } = await import('@/dal/service')
    const pRepo = await permissionRepo()
    const rRepo = await roleRepo()

    // Creer les permissions
    const readPerm = await pRepo.upsert(
      { name: 'read' },
      { name: 'read', description: 'Lecture' },
    )
    const writePerm = await pRepo.upsert(
      { name: 'write' },
      { name: 'write', description: 'Ecriture' },
    )

    // Creer les roles avec permissions
    await rRepo.upsert(
      { name: 'admin' },
      { name: 'admin', description: 'Administrateur', permissions: [readPerm.id, writePerm.id] },
    )
    await rRepo.upsert(
      { name: 'viewer' },
      { name: 'viewer', description: 'Lecteur', permissions: [readPerm.id] },
    )
  },

  // Callback pour creer le premier administrateur
  // Le mot de passe est DEJA hashe par le package (bcrypt, 12 rounds)
  createAdmin: async ({ email, hashedPassword, firstName, lastName }) => {
    const { userRepo, roleRepo } = await import('@/dal/service')
    const uRepo = await userRepo()
    const rRepo = await roleRepo()

    const adminRole = await rRepo.findOne({ name: 'admin' })
    await uRepo.upsert(
      { email: email.toLowerCase() },
      {
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        roles: adminRole ? [adminRole.id] : [],
        status: 'active',
      },
    )
  },

  optionalSeeds,
}

// ─── runInstall : expose au route handler ──────────────────
export async function runInstall(config: InstallConfig) {
  return _runInstall(config, SETUP_CONFIG)
}
```

**Points cles :**
- `needsSetup()` retourne `true` si 0 users en base → l'app doit s'installer
- `runInstall()` execute les 6 etapes : ecriture `.env.local`, connexion DB, seed RBAC, creation admin, seeds optionnels
- Le mot de passe admin est **automatiquement hashe** par le package (bcrypt, 12 rounds). Ne le hachez PAS vous-meme.
- `MOSTAJS_MODULES` est ecrit dans `.env.local` si `config.modules` est fourni

### Etape 3 — Creer les routes API

Creez 5 fichiers sous `src/app/api/setup/` :

#### 3.1 — Status (GET)

```typescript
// src/app/api/setup/status/route.ts
import { createStatusHandler } from '@mostajs/setup'
import { needsSetup } from '@/lib/setup'

export const { GET } = createStatusHandler(needsSetup)
```

Reponse : `{ "needsSetup": true }` ou `{ "needsSetup": false }`

#### 3.2 — Test connexion DB (POST)

```typescript
// src/app/api/setup/test-db/route.ts
import { createTestDbHandler } from '@mostajs/setup'
import { needsSetup } from '@/lib/setup'

export const { POST } = createTestDbHandler(needsSetup)
```

Body attendu :
```json
{
  "dialect": "postgres",
  "host": "localhost",
  "port": 5432,
  "name": "mydb",
  "user": "postgres",
  "password": "secret"
}
```

Reponse : `{ "ok": true }` ou `{ "ok": false, "error": "..." }`

#### 3.3 — Installation (POST)

```typescript
// src/app/api/setup/install/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { needsSetup, runInstall } from '@/lib/setup'
import { z } from 'zod'

const ALL_DIALECTS = [
  'mongodb', 'sqlite', 'postgres', 'mysql', 'mariadb',
  'oracle', 'mssql', 'cockroachdb', 'db2', 'hana',
  'hsqldb', 'spanner', 'sybase',
] as const

const installSchema = z.object({
  dialect: z.enum(ALL_DIALECTS),
  db: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().min(0).max(65535).default(0),
    name: z.string().min(1),
    user: z.string().default(''),
    password: z.string().default(''),
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
  }),
  seed: z.record(z.boolean()).optional(),
  modules: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  const setupNeeded = await needsSetup()
  if (!setupNeeded) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Installation deja effectuee' } },
      { status: 403 },
    )
  }

  const body = await req.json()
  const parsed = installSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } },
      { status: 400 },
    )
  }

  const result = await runInstall(parsed.data)
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: 'INSTALL_ERROR', message: result.error } },
      { status: 500 },
    )
  }

  return NextResponse.json({
    data: { ok: true, needsRestart: result.needsRestart, seeded: result.seeded },
  })
}
```

#### 3.4 — Detection des modules (GET)

```typescript
// src/app/api/setup/detect-modules/route.ts
import { createDetectModulesHandler } from '@mostajs/setup'

export const { GET } = createDetectModulesHandler()
```

Reponse :
```json
{
  "modules": [
    { "key": "orm", "packageName": "@mostajs/orm", "label": "ORM", "required": true, ... },
    { "key": "auth", "packageName": "@mostajs/auth", ... },
    { "key": "new-plugin", "discovered": true, "icon": "📦", ... }
  ],
  "installed": ["orm", "auth", "setup"]
}
```

#### 3.5 — Installation des modules (POST)

```typescript
// src/app/api/setup/install-modules/route.ts
import { createInstallModulesHandler } from '@mostajs/setup'
import { needsSetup } from '@/lib/setup'

export const { POST } = createInstallModulesHandler(needsSetup)
```

Body : `{ "modules": ["orm", "auth", "audit", "rbac"] }`

Ce handler :
1. Resout les dependances transitives (`rbac` → `auth` + `audit`)
2. Installe via `npm install` (local `file:./packages/...` si present, sinon npm registry)
3. Ecrit `MOSTAJS_MODULES=orm,auth,audit,rbac` dans `.env.local`

### Etape 4 — Creer la page Setup (frontend)

Voici un exemple **minimal** de page setup. Adaptez le style a votre design system.

```tsx
// src/app/setup/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { resolveModuleDependencies } from '@mostajs/setup/data/module-definitions'
import type { ModuleDefinition } from '@mostajs/setup'

type Dialect = 'mongodb' | 'sqlite' | 'postgres' | 'mysql' | 'mariadb'
  | 'oracle' | 'mssql' | 'cockroachdb' | 'db2' | 'hana'
  | 'hsqldb' | 'spanner' | 'sybase'

export default function SetupPage() {
  const router = useRouter()

  // --- Etat du wizard ---
  const [step, setStep] = useState(1)                     // 1=modules, 2=db, 3=admin, 4=install

  // Modules
  const [availableModules, setAvailableModules] = useState<ModuleDefinition[]>([])
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [installedModules, setInstalledModules] = useState<string[]>([])

  // DB
  const [dialect, setDialect] = useState<Dialect>('mongodb')
  const [dbConfig, setDbConfig] = useState({ host: 'localhost', port: 27017, name: 'mydb', user: '', password: '' })
  const [dbOk, setDbOk] = useState(false)

  // Admin
  const [admin, setAdmin] = useState({ email: '', password: '', firstName: '', lastName: '' })

  // Install
  const [installing, setInstalling] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)

  // --- Charger les modules depuis l'API au montage ---
  useEffect(() => {
    fetch('/api/setup/detect-modules')
      .then(r => r.json())
      .then((data: { modules: ModuleDefinition[]; installed: string[] }) => {
        setAvailableModules(data.modules || [])
        setInstalledModules(data.installed || [])
        // Pre-cocher les modules required + default + deja installes
        const preChecked = new Set([
          ...(data.modules || []).filter(m => m.required || m.default).map(m => m.key),
          ...(data.installed || []),
        ])
        setSelectedModules(Array.from(preChecked))
      })
      .catch(() => {})
  }, [])

  // --- Toggle un module (avec resolution des dependances) ---
  function toggleModule(key: string) {
    const mod = availableModules.find(m => m.key === key)
    if (!mod || mod.required) return

    setSelectedModules(prev => {
      if (prev.includes(key)) {
        // Decochage : retirer aussi les modules qui dependent de celui-ci
        const toRemove = new Set([key])
        let changed = true
        while (changed) {
          changed = false
          for (const m of availableModules) {
            if (toRemove.has(m.key) || m.required) continue
            if (m.dependsOn?.some(dep => toRemove.has(dep)) && prev.includes(m.key)) {
              toRemove.add(m.key)
              changed = true
            }
          }
        }
        return prev.filter(k => !toRemove.has(k))
      } else {
        // Cochage : ajouter les dependances transitives
        return resolveModuleDependencies([...prev, key], availableModules)
      }
    })
  }

  // --- Tester la connexion DB ---
  async function testDb() {
    const res = await fetch('/api/setup/test-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialect, ...dbConfig }),
    })
    const data = await res.json()
    setDbOk(data.ok === true)
  }

  // --- Lancer l'installation ---
  async function install() {
    setInstalling(true)
    setResult(null)

    // 1. Installer les modules npm
    const modRes = await fetch('/api/setup/install-modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: selectedModules }),
    })
    if (!modRes.ok) {
      setResult({ ok: false, error: 'Erreur installation modules' })
      setInstalling(false)
      return
    }

    // 2. Configurer la DB + seeder
    const res = await fetch('/api/setup/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialect, db: dbConfig, admin, modules: selectedModules }),
    })
    const data = await res.json()
    setResult(data.data || { ok: false, error: data.error?.message })
    setInstalling(false)
  }

  return (
    <div style={{ maxWidth: 600, margin: '50px auto', padding: 20 }}>
      <h1>Setup — Mon Application</h1>

      {/* ── Etape 1 : Modules ── */}
      {step === 1 && (
        <div>
          <h2>1. Modules</h2>
          {availableModules.map(mod => (
            <label key={mod.key} style={{ display: 'block', margin: '8px 0' }}>
              <input
                type="checkbox"
                checked={selectedModules.includes(mod.key)}
                disabled={mod.required}
                onChange={() => toggleModule(mod.key)}
              />
              {' '}{mod.icon} {mod.label}
              {mod.required && <em> (requis)</em>}
              {mod.discovered && <strong> NOUVEAU</strong>}
              {installedModules.includes(mod.key) && <span> ✓</span>}
            </label>
          ))}
          <button onClick={() => setStep(2)}>Suivant →</button>
        </div>
      )}

      {/* ── Etape 2 : Base de donnees ── */}
      {step === 2 && (
        <div>
          <h2>2. Base de donnees</h2>
          <select value={dialect} onChange={e => setDialect(e.target.value as Dialect)}>
            <option value="mongodb">MongoDB</option>
            <option value="sqlite">SQLite</option>
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            {/* ... autres dialectes ... */}
          </select>

          {dialect !== 'sqlite' && (
            <>
              <input placeholder="Host" value={dbConfig.host}
                onChange={e => setDbConfig({ ...dbConfig, host: e.target.value })} />
              <input placeholder="Port" type="number" value={dbConfig.port}
                onChange={e => setDbConfig({ ...dbConfig, port: +e.target.value })} />
              <input placeholder="User" value={dbConfig.user}
                onChange={e => setDbConfig({ ...dbConfig, user: e.target.value })} />
              <input placeholder="Password" type="password" value={dbConfig.password}
                onChange={e => setDbConfig({ ...dbConfig, password: e.target.value })} />
            </>
          )}
          <input placeholder="Nom de la base" value={dbConfig.name}
            onChange={e => setDbConfig({ ...dbConfig, name: e.target.value })} />

          <button onClick={testDb}>Tester la connexion</button>
          {dbOk && <span style={{ color: 'green' }}> ✓ Connexion OK</span>}

          <br />
          <button onClick={() => setStep(1)}>← Retour</button>
          <button onClick={() => setStep(3)} disabled={dialect !== 'sqlite' && !dbOk}>
            Suivant →
          </button>
        </div>
      )}

      {/* ── Etape 3 : Administrateur ── */}
      {step === 3 && (
        <div>
          <h2>3. Administrateur</h2>
          <input placeholder="Prenom" value={admin.firstName}
            onChange={e => setAdmin({ ...admin, firstName: e.target.value })} />
          <input placeholder="Nom" value={admin.lastName}
            onChange={e => setAdmin({ ...admin, lastName: e.target.value })} />
          <input placeholder="Email" type="email" value={admin.email}
            onChange={e => setAdmin({ ...admin, email: e.target.value })} />
          <input placeholder="Mot de passe (min 6)" type="password" value={admin.password}
            onChange={e => setAdmin({ ...admin, password: e.target.value })} />

          <br />
          <button onClick={() => setStep(2)}>← Retour</button>
          <button onClick={() => setStep(4)}>Suivant →</button>
        </div>
      )}

      {/* ── Etape 4 : Installation ── */}
      {step === 4 && (
        <div>
          <h2>4. Recapitulatif</h2>
          <p><strong>DB :</strong> {dialect} — {dbConfig.name}</p>
          <p><strong>Admin :</strong> {admin.email}</p>
          <p><strong>Modules :</strong> {selectedModules.join(', ')}</p>

          <button onClick={install} disabled={installing}>
            {installing ? 'Installation en cours...' : 'Installer'}
          </button>

          {result?.ok && (
            <div style={{ color: 'green', marginTop: 16 }}>
              ✓ Installation terminee !
              <br />
              <button onClick={() => router.push('/login')}>Aller au login →</button>
            </div>
          )}
          {result && !result.ok && (
            <div style={{ color: 'red', marginTop: 16 }}>
              ✗ Erreur : {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

### Etape 5 — Middleware : rediriger vers /setup

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Laisser passer les routes publiques
  if (
    pathname.startsWith('/setup') ||
    pathname.startsWith('/api/setup') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next()
  }

  // Verifier si l'app a besoin du setup
  try {
    const res = await fetch(new URL('/api/setup/status', req.url))
    const data = await res.json()
    if (data.needsSetup) {
      return NextResponse.redirect(new URL('/setup', req.url))
    }
  } catch {
    // Si la DB n'est pas accessible, rediriger vers setup
    return NextResponse.redirect(new URL('/setup', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|icons|manifest.json).*)'],
}
```

### Etape 6 — Tester le flux complet

```bash
# 1. Demarrer le serveur
npm run dev

# 2. Ouvrir http://localhost:3000
#    → Redirige automatiquement vers /setup

# 3. Suivre le wizard :
#    - Choisir les modules
#    - Selectionner le dialecte (ex: MongoDB, SQLite, Postgres...)
#    - Tester la connexion
#    - Renseigner l'admin
#    - Lancer l'installation

# 4. Verifier les resultats :
#    - .env.local contient DB_DIALECT, SGBD_URI, MOSTAJS_MODULES
#    - La DB contient les roles, permissions et l'admin
#    - /api/setup/status retourne { needsSetup: false }
```

---

## 4. API Reference

### Fonctions principales

| Export | Signature | Description |
|--------|-----------|-------------|
| `needsSetup` | `(countFn: () => Promise<number>) => Promise<boolean>` | Retourne `true` si 0 users en base |
| `runInstall` | `(config: InstallConfig, setup: MostaSetupConfig) => Promise<Result>` | Flux complet : env → DB → seed → admin |
| `testDbConnection` | `(config: DbTestConfig) => Promise<{ ok, error? }>` | Test ephemere (ne modifie pas la connexion globale) |
| `composeDbUri` | `(dialect: DialectType, db: DbConfig) => string` | Compose l'URI de connexion |
| `writeEnvLocal` | `(options: EnvWriterOptions) => Promise<boolean>` | Ecrit `.env.local`, retourne `true` si dialect change |

### Factories API routes

| Export | Route | Methode | Description |
|--------|-------|---------|-------------|
| `createStatusHandler(needsSetup)` | `/api/setup/status` | GET | Retourne `{ needsSetup: boolean }` |
| `createTestDbHandler(needsSetup)` | `/api/setup/test-db` | POST | Teste la connexion DB |
| `createInstallHandler(needsSetup, config)` | `/api/setup/install` | POST | Lance l'installation complete |
| `createDetectModulesHandler()` | `/api/setup/detect-modules` | GET | Liste modules (statiques + npm) + installes |
| `createInstallModulesHandler(needsSetup)` | `/api/setup/install-modules` | POST | Installe les modules npm selectionnes |

### Data exports

| Export | Description |
|--------|-------------|
| `DIALECT_INFO` | `Record<DialectType, DialectInfo>` — metadata de chaque SGBD |
| `ALL_DIALECTS` | `DialectType[]` — liste des 13 dialectes |
| `MODULES` | `ModuleDefinition[]` — liste statique des 7 modules connus |
| `resolveModuleDependencies(selected, modules?)` | Resout les dependances transitives |
| `discoverNpmModules()` | Decouvre les packages `@mostajs/*` sur npm |

### Types

```typescript
interface InstallConfig {
  dialect: DialectType
  db: DbConfig
  admin: { email: string; password: string; firstName: string; lastName: string }
  seed?: SeedOptions       // { activities: true, demoData: false, ... }
  modules?: string[]       // ['orm', 'auth', 'rbac'] → ecrit MOSTAJS_MODULES
}

interface MostaSetupConfig {
  appName: string
  defaultPort?: number
  seedRBAC?: () => Promise<void>
  createAdmin?: (admin: { email: string; hashedPassword: string; firstName: string; lastName: string }) => Promise<void>
  optionalSeeds?: SeedDefinition[]
  extraEnvVars?: Record<string, string>
}

interface SeedDefinition {
  key: string
  label: string
  description: string
  icon?: string
  default?: boolean
  run: (repos: any) => Promise<void>
}

interface ModuleDefinition {
  key: string
  packageName: string       // '@mostajs/auth'
  localDir?: string         // 'mosta-auth' (sous packages/)
  label: string
  description: string
  icon: string
  required?: boolean
  default?: boolean
  dependsOn?: string[]
  discovered?: boolean      // true si trouve via npm search
}
```

---

## 5. Les 13 dialectes supportes

| Dialecte | Icone | Port | Categorie | Driver |
|----------|-------|------|-----------|--------|
| MongoDB | 🍃 | 27017 | document | mongoose |
| SQLite | 📁 | — | file | better-sqlite3 |
| PostgreSQL | 🐘 | 5432 | sql | pg |
| MySQL | 🐬 | 3306 | sql | mysql2 |
| MariaDB | 🦭 | 3306 | sql | mariadb |
| Oracle | 🔴 | 1521 | enterprise | oracledb |
| SQL Server | 🟦 | 1433 | enterprise | tedious |
| CockroachDB | 🪳 | 26257 | distributed | pg |
| IBM DB2 | 🏢 | 50000 | enterprise | ibm_db |
| SAP HANA | 💎 | 39013 | enterprise | @sap/hana-client |
| HyperSQL | ⚡ | 9001 | legacy | — |
| Cloud Spanner | ☁️ | — | distributed | @google-cloud/spanner |
| Sybase ASE | 🔷 | 5000 | legacy | sybase |

Les URI sont composees automatiquement par `composeDbUri()` :

```
mongodb://user:pass@host:27017/mydb
postgresql://user:pass@host:5432/mydb
mysql://user:pass@host:3306/mydb
./data/mydb.db                           (SQLite)
spanner://projects/my-project            (Cloud Spanner)
```

---

## 6. Systeme de modules

### Liste statique vs decouverte dynamique

Le package maintient une **liste statique** de 7 modules connus avec metadata riches :

```
orm (requis) → auth (requis) → rbac → settings
                             → audit
face (optionnel, sans dependance)
setup (requis)
```

Au runtime, `GET /api/setup/detect-modules` interroge aussi **npm** (`npm search @mostajs --json`) pour trouver des packages publies apres le deploiement. Ces modules decouverts sont ajoutes avec `discovered: true` et l'icone 📦.

### Resolution des dependances

```typescript
import { resolveModuleDependencies } from '@mostajs/setup'

resolveModuleDependencies(['rbac'])
// → ['rbac', 'auth', 'audit', 'orm', 'setup']
// (rbac depend de auth + audit, auth depend de orm, setup est requis)
```

### Installation hybride (local + npm)

Le handler `install-modules` utilise une strategie hybride :

1. **Local** : si `packages/mosta-xxx/` existe → `npm install file:./packages/mosta-xxx`
2. **npm registry** : sinon → `npm install @mostajs/xxx`
3. **Skip** : si deja dans `node_modules/@mostajs/xxx` → pas de `npm install`

Cela evite les 404 npm pour les packages non encore publies et les hot-reloads Next.js inutiles.

---

## 7. Exemples avances

### Utiliser runInstall sans le wizard UI

```typescript
import { runInstall } from '@mostajs/setup'
import { setupConfig } from './my-setup-config'

const result = await runInstall(
  {
    dialect: 'postgres',
    db: { host: 'localhost', port: 5432, name: 'mydb', user: 'pg', password: 'secret' },
    admin: { email: 'admin@example.com', password: 'Admin@123', firstName: 'Admin', lastName: 'User' },
    seed: { demoData: true },
    modules: ['orm', 'auth', 'rbac'],
  },
  setupConfig,
)

console.log(result)
// { ok: true, needsRestart: false, seeded: ['categories', 'permissions', 'roles', 'admin', 'demoData'] }
```

### Ajouter des variables d'environnement personnalisees

```typescript
const config: MostaSetupConfig = {
  appName: 'MyApp',
  extraEnvVars: {
    SMTP_HOST: 'smtp.example.com',
    STRIPE_KEY: 'sk_test_...',
  },
}
// → .env.local contiendra aussi SMTP_HOST et STRIPE_KEY
```

### Tester la connexion DB programmatiquement

```typescript
import { testDbConnection } from '@mostajs/setup'

const result = await testDbConnection({
  dialect: 'mongodb',
  host: 'localhost',
  port: 27017,
  name: 'testdb',
  user: '',
  password: '',
})
// { ok: true } ou { ok: false, error: 'Connection refused' }
```

### Composer une URI manuellement

```typescript
import { composeDbUri } from '@mostajs/setup'

composeDbUri('postgres', { host: 'db.example.com', port: 5432, name: 'prod', user: 'app', password: 's3cret' })
// → 'postgresql://app:s3cret@db.example.com:5432/prod'

composeDbUri('sqlite', { host: '', port: 0, name: 'myapp', user: '', password: '' })
// → './data/myapp.db'
```

### Ecrire .env.local directement

```typescript
import { writeEnvLocal } from '@mostajs/setup'

const dialectChanged = await writeEnvLocal({
  dialect: 'mongodb',
  uri: 'mongodb://localhost:27017/mydb',
  port: 3000,
  extraVars: { MOSTAJS_MODULES: 'orm,auth,rbac' },
})
// dialectChanged = true si le dialecte a change (necessite un redemarrage)
```

---

## 8. FAQ / Troubleshooting

### L'installation tourne en boucle (GET /setup se repete)

**Cause** : `npm install` modifie `package.json` / `node_modules`, ce qui declenche un hot-reload Next.js et reinitialise le state React.

**Solution** : Le handler `install-modules` **skip les packages deja installes** dans `node_modules/`. Si le probleme persiste, ajoutez une persistence du state wizard dans `sessionStorage` (voir l'implementation de SecuAccess Pro).

### E11000 duplicate key error (MongoDB)

**Cause** : Un champ `unique: true` sans `required: true` dans le schema. MongoDB indexe les `null` et refuse le doublon.

**Solution** : Ajoutez `sparse: true` au champ dans votre `EntitySchema`. Cela fonctionne avec MongoDB (index sparse) et est ignore sans risque par les dialectes SQL.

```typescript
clientNumber: { type: 'string', unique: true, sparse: true }
```

### JSON.parse: unexpected character at line 1 column 1

**Cause** : La reponse de l'API est du HTML (page 404 Next.js) au lieu de JSON, typiquement pendant un hot-reload du serveur.

**Solution** : Utilisez un `safeJson()` helper dans le frontend :

```typescript
async function safeJson(res: Response) {
  try { return JSON.parse(await res.text()) }
  catch { return null }
}
```

### npm search timeout (pas d'internet)

Le handler `detect-modules` a un timeout de 10 secondes sur `npm search`. En cas d'echec (offline, timeout), il retourne la **liste statique** des 7 modules connus. Aucune action necessaire.

### Comment ajouter un nouveau module a la liste statique ?

Editez `packages/mosta-setup/data/module-definitions.ts` et ajoutez une entree a `MODULES` :

```typescript
{
  key: 'notifications',
  packageName: '@mostajs/notifications',
  localDir: 'mosta-notifications',     // si disponible localement
  label: 'Notifications',
  description: 'Push, email, SMS',
  icon: '🔔',
  default: false,
  dependsOn: ['orm'],
}
```

Puis recompilez : `cd packages/mosta-setup && npx tsc`

---

## Related Packages

- [@mostajs/orm](https://www.npmjs.com/package/@mostajs/orm) — Multi-dialect ORM (required)
- [@mostajs/auth](https://www.npmjs.com/package/@mostajs/auth) — Authentication
- [@mostajs/audit](https://www.npmjs.com/package/@mostajs/audit) — Audit logging
- [@mostajs/rbac](https://www.npmjs.com/package/@mostajs/rbac) — Roles & Permissions
- [@mostajs/settings](https://www.npmjs.com/package/@mostajs/settings) — Key-value settings
- [@mostajs/face](https://www.npmjs.com/package/@mostajs/face) — Facial recognition

## License

MIT — (c) 2025 Dr Hamid MADANI <drmdh@msn.com>
