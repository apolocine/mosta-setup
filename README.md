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
8. [Reconfiguration (post-installation)](#8-reconfiguration-post-installation)
9. [Mode declaratif : setup.json](#9-mode-declaratif--setupjson)
10. [FAQ / Troubleshooting](#10-faq--troubleshooting)

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
│   ├── install-modules.route.ts # Factory POST /api/setup/install-modules
│   ├── reconfig.route.ts        # Factory GET+POST /api/setup/reconfig
│   └── upload-jar.route.ts     # Factory GET+POST+DELETE /api/setup/upload-jar
├── components/
│   ├── SetupWizard.tsx          # Wizard d'installation complet (6 etapes)
│   └── ReconfigPanel.tsx        # UI reconfiguration (modules + DB)
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

Le module fournit un composant **`SetupWizard`** pret a l'emploi avec inline styles (aucune dependance Tailwind/shadcn).
Votre page Next.js n'est qu'un **wrapper** d'une vingtaine de lignes :

```tsx
// src/app/setup/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import SetupWizard from '@mostajs/setup/components/SetupWizard'
import { t } from '@/i18n'  // ou toute fonction de traduction

export default function SetupPage() {
  const router = useRouter()

  return (
    <SetupWizard
      t={t}
      onComplete={() => router.push('/login')}
      dbNamePrefix="secuaccessdb"
      endpoints={{
        detectModules: '/api/setup/detect-modules',
        testDb: '/api/setup/test-db',
        installModules: '/api/setup/install-modules',
        install: '/api/setup/install',
        uploadJar: '/api/setup/upload-jar',
      }}
    />
  )
}
```

#### Props de SetupWizard

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `t` | `(key: string) => string` | `(k) => k` | Fonction de traduction (recoit des cles `setup.xxx`) |
| `onComplete` | `() => void` | — | Callback apres installation reussie (ex: `router.push('/login')`) |
| `dbNamePrefix` | `string` | `'mydb'` | Prefixe pour le nom de base par defaut |
| `persistState` | `boolean` | `true` | Persister l'etat du wizard dans `sessionStorage` |
| `endpoints` | `object` | voir ci-dessous | URLs des routes API |

**Endpoints par defaut :**
```json
{
  "detectModules": "/api/setup/detect-modules",
  "testDb": "/api/setup/test-db",
  "installModules": "/api/setup/install-modules",
  "install": "/api/setup/install",
  "uploadJar": "/api/setup/upload-jar"
}
```

**Cles i18n attendues :** `setup.steps.*`, `setup.welcome.*`, `setup.modules.*`, `setup.dialect.*`, `setup.database.*`, `setup.admin.*`, `setup.summary.*`, `setup.back`, `setup.next`.

#### Le wizard inclut :
- **6 etapes** : Accueil → Modules → Dialecte → Base de donnees → Admin → Recapitulatif
- **13 dialectes** avec distinction Premium (grises, non cliquables) et badges JDBC
- **Upload JAR** integre pour les dialectes JDBC (hsqldb, oracle, db2, hana, sybase)
- **Persistence sessionStorage** pour survivre aux hot-reloads Next.js
- **Resolution des dependances** entre modules
- **Retry automatique** apres npm install (le serveur peut redemarrer)

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

### setup.json (declaratif)

| Export | Signature | Description |
|--------|-----------|-------------|
| `loadSetupJson` | `(source?, repoFactory?) => Promise<MostaSetupConfig>` | Charge `setup.json` et retourne un config complet |
| `createSetupJsonHandler` | `(needsSetup) => { GET, POST }` | Route API pour verifier/uploader `setup.json` |

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

### Catalogue des 7 modules connus

| Module | Package | Requis | Depend de | Standalone | Description |
|--------|---------|--------|-----------|------------|-------------|
| **orm** | `@mostajs/orm` | oui | — | — | ORM multi-dialecte (13 SGBD), pattern Hibernate |
| **auth** | `@mostajs/auth` | oui | orm | non | NextAuth, sessions, hashage mots de passe |
| **audit** | `@mostajs/audit` | non | orm | non | Journalisation des actions, tracabilite |
| **rbac** | `@mostajs/rbac` | non | auth, audit | non | Roles, permissions, matrice RBAC |
| **settings** | `@mostajs/settings` | non | orm | non | Parametres cle-valeur, formulaire auto, provider React |
| **face** | `@mostajs/face` | non | **aucune** | **oui** | Detection de visage, descripteurs, matching 1:N |
| **setup** | `@mostajs/setup` | oui | orm | non | Wizard d'installation, test DB, seed runner |

### Module standalone : @mostajs/face

`@mostajs/face` est **100% independant** — il n'importe aucun package `@mostajs/*` et peut etre utilise dans n'importe quelle application React >= 18 sans `@mostajs/orm` ni base de donnees.

**Dependance unique** : `@vladmandic/face-api` (reconnaissance faciale TensorFlow.js)

```bash
npm install @mostajs/face
```

```tsx
import { useCamera, useFaceDetection, compareFaces } from '@mostajs/face'

// Hooks React pour camera et detection
const { videoRef, start, stop } = useCamera()
const { detect, result } = useFaceDetection()

// API bas niveau
import { loadModels, detectFace, extractDescriptor } from '@mostajs/face'
import { findMatch, descriptorToArray, arrayToDescriptor } from '@mostajs/face'
```

Exports : `loadModels`, `detectFace`, `detectAllFaces`, `extractDescriptor`, `compareFaces`, `findMatch`, `findAllMatches`, `descriptorToArray`, `arrayToDescriptor`, `isValidDescriptor`, `drawDetection`, `useCamera`, `useFaceDetection`.

### Graphe de dependances

```
                    ┌──────────┐
                    │ orm (R)  │  R = requis
                    └────┬─────┘
                ┌────────┼────────┬──────────┐
                v        v        v          v
          ┌──────────┐ ┌──────┐ ┌──────────┐ ┌───────┐
          │ auth (R) │ │audit │ │ settings │ │setup(R)│
          └────┬─────┘ └──┬───┘ └──────────┘ └───────┘
               │          │
               v          v
          ┌──────────────────┐
          │       rbac       │
          └──────────────────┘

  ┌──────────────────────────┐
  │   face (100% standalone) │  ← aucune dependance @mostajs
  └──────────────────────────┘
```

### Liste statique vs decouverte dynamique

Le package maintient une **liste statique** des 7 modules ci-dessus avec metadata riches (required, dependsOn, icon, description).

Au runtime, `GET /api/setup/detect-modules` interroge aussi **npm** (`npm search @mostajs --json`) pour trouver des packages publies apres le deploiement. Ces modules decouverts sont ajoutes avec `discovered: true` et l'icone 📦.

### Resolution des dependances

```typescript
import { resolveModuleDependencies } from '@mostajs/setup'

resolveModuleDependencies(['rbac'])
// → ['rbac', 'auth', 'audit', 'orm', 'setup']
// (rbac depend de auth + audit, auth depend de orm, setup est requis)

resolveModuleDependencies(['face'])
// → ['face', 'orm', 'auth', 'setup']
// (face n'a pas de dependance @mostajs, mais orm/auth/setup sont requis)
```

### Installation hybride (local + npm)

Le handler `install-modules` utilise une strategie hybride :

1. **Skip** : si deja dans `node_modules/@mostajs/xxx` → pas de `npm install` (evite hot-reload)
2. **Local** : si `packages/mosta-xxx/` existe → `npm install file:./packages/mosta-xxx`
3. **npm registry** : sinon → `npm install @mostajs/xxx`

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

## 8. Reconfiguration (post-installation)

Apres l'installation initiale, le module fournit un **panneau de reconfiguration** permettant de :
- Changer de base de donnees (dialecte, connexion, test)
- Activer / desactiver des modules @mostajs
- Optionnellement re-seeder la nouvelle base

### Integration dans le projet hote

Ce module exporte un **composant React** (`ReconfigPanel`) et une **factory API** (`createReconfigHandlers`),
mais ne cree pas de pages Next.js. Le projet hote doit creer la route API et la page.

#### 1. Route API

**`src/app/api/setup/reconfig/route.ts`**
```typescript
import { createReconfigHandlers } from '@mostajs/setup/api/reconfig'

const { GET, POST } = createReconfigHandlers()
export { GET, POST }
```

#### 2. Route API JAR Upload (drivers JDBC)

**`src/app/api/setup/upload-jar/route.ts`**
```typescript
// Author: Dr Hamid MADANI drmdh@msn.com
import { createUploadJarHandlers } from '@mostajs/setup/api/upload-jar'

const { GET, POST, DELETE } = createUploadJarHandlers()
export { GET, POST, DELETE }
```

> La logique d'upload est dans `@mostajs/orm` (`saveJarFile`, `deleteJarFile`, `listJarFiles`).
> La route factory dans `@mostajs/setup` ne fait que la deleguer.
>
> - **GET** — liste les JARs et le statut des dialects JDBC
> - **POST** — upload un fichier `.jar` (multipart/form-data, champ `jar`)
> - **DELETE** — supprime un JAR (`{ "fileName": "hsqldb-2.7.2.jar" }`)

#### 3. Page de reconfiguration

**`src/app/dashboard/settings/reconfig/page.tsx`**
```tsx
'use client'
import ReconfigPanel from '@mostajs/setup/components/ReconfigPanel'

export default function ReconfigPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reconfiguration</h1>
      <ReconfigPanel
        apiEndpoint="/api/setup/reconfig"
        detectEndpoint="/api/setup/detect-modules"
        jarEndpoint="/api/setup/upload-jar"
        showSeedOption
        onDbChanged={() => window.location.reload()}
        onSeedRequested={async () => {
          await fetch('/api/setup/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'seed-only' }),
          })
        }}
      />
    </div>
  )
}
```

#### 3. Menu dynamique

Le module exporte `setupMenuContribution` qui declare la route `/dashboard/settings/reconfig`
dans le groupe "Administration". Importez-le via le deep import :

```tsx
import { setupMenuContribution } from '@mostajs/setup/lib/menu'
```

#### 4. Props de ReconfigPanel

| Prop | Type | Description |
|------|------|-------------|
| `apiEndpoint` | `string` | URL de l'API reconfig (ex: `/api/setup/reconfig`) |
| `detectEndpoint` | `string` | URL de l'API detect-modules (ex: `/api/setup/detect-modules`) |
| `t` | `(key: string) => string` | Fonction de traduction (optionnel) |
| `showSeedOption` | `boolean` | Afficher la checkbox "Re-seeder" lors d'un changement de DB |
| `onDbChanged` | `() => void` | Callback apres changement de DB reussi |
| `onModulesChanged` | `(modules: string[]) => void` | Callback apres maj des modules |
| `onSeedRequested` | `() => Promise<void>` | Callback pour executer le seed |

#### 5. Pourquoi le projet hote doit creer les pages ?

Les modules `@mostajs/*` sont des **bibliotheques npm** (composants, hooks, utilitaires), pas des applications.
Next.js App Router exige que les fichiers `page.tsx` soient dans le dossier `src/app/` du projet.
Un package npm ne peut pas injecter de pages dans le routeur — c'est donc au projet hote de creer ces fichiers wrapper, meme s'ils ne font qu'importer et afficher un composant du module.

---

## 9. Mode declaratif : setup.json

> **Nouveau** — Depuis v1.5, le setup peut etre entierement configure via un fichier JSON declaratif.

### Principe

Au lieu d'ecrire du TypeScript pour definir les categories, permissions, roles et seeds,
vous declarez tout dans un fichier `setup.json` a la racine du projet. Le module le lit
et genere automatiquement les callbacks `seedRBAC`, `createAdmin` et `optionalSeeds`.

### Creer un setup.json

**3 methodes :**

| Methode | Commande | Pour qui |
|---------|----------|----------|
| **Studio visuel** | Ouvrir [MostaSetup Studio](https://github.com/apolocine/mosta-setup-studio) | Non-developpeurs, design RBAC |
| **CLI interactif** | `npx mosta-setup` | Developpeurs en terminal |
| **CLI rapide** | `npx mosta-setup --quick --name MonApp --port 3000` | CI/CD, scripts |

### Structure du fichier

```json
{
  "$schema": "https://mostajs.dev/schemas/setup.v1.json",
  "app": {
    "name": "MonApp",
    "port": 3000,
    "dbNamePrefix": "monappdb"
  },
  "env": {
    "MOSTAJS_MODULES": "orm,auth,audit,rbac,settings,setup"
  },
  "rbac": {
    "categories": [
      { "name": "admin", "label": "Administration", "icon": "Settings", "order": 0 }
    ],
    "permissions": [
      { "code": "admin:access", "description": "Acceder au panneau", "category": "admin" }
    ],
    "roles": [
      { "name": "admin", "description": "Administrateur", "permissions": ["*"] }
    ]
  },
  "seeds": [
    {
      "key": "products",
      "label": "Produits demo",
      "collection": "product",
      "match": "slug",
      "default": true,
      "data": [
        { "name": "Produit A", "slug": "produit-a", "price": 1000 }
      ]
    }
  ]
}
```

Le champ `$schema` active l'**autocompletion dans VS Code** (types, descriptions, exemples).

### Utiliser loadSetupJson()

```typescript
// src/lib/setup-config.ts
import { loadSetupJson } from '@mostajs/setup'
import type { MostaSetupConfig } from '@mostajs/setup'

// repoFactory : adapte a votre couche d'acces aux donnees
async function repoFactory(collection: string) {
  const service = await import('@/dal/service')
  const factories: Record<string, () => Promise<unknown>> = {
    permissionCategory: service.permissionCategoryRepo,
    permission: service.permissionRepo,
    role: service.roleRepo,
    user: service.userRepo,
    activity: service.activityRepo,
  }
  return factories[collection]() as Promise<any>
}

export async function getSetupConfig(): Promise<MostaSetupConfig> {
  return loadSetupJson('./setup.json', repoFactory)
}
```

```typescript
// src/app/api/setup/install/route.ts
import { runInstall } from '@mostajs/setup'
import type { InstallConfig } from '@mostajs/setup'
import { appNeedsSetup, getSetupConfig } from '@/lib/setup-config'

export async function POST(req: Request) {
  if (!(await appNeedsSetup())) {
    return Response.json({ error: 'Already installed' }, { status: 400 })
  }
  const body: InstallConfig = await req.json()
  const config = await getSetupConfig()
  return Response.json(await runInstall(body, config))
}
```

### Fonctionnalites des seeds JSON

| Champ | Type | Description |
|-------|------|-------------|
| `key` | `string` | Identifiant unique du seed |
| `label` | `string` | Label affiche dans le wizard (checkbox) |
| `collection` | `string` | Collection/table cible (doit matcher un schema enregistre) |
| `match` | `string` | Champ pour upsert idempotent (ex: `slug`, `email`) |
| `hashField` | `string` | Champ a hasher avec bcrypt avant insertion (ex: `password`) |
| `roleField` | `string` | Champ contenant un nom de role — resolu en ID a l'execution |
| `defaults` | `object` | Valeurs par defaut fusionnees dans chaque ligne |
| `default` | `boolean` | Si `true`, la checkbox est cochee par defaut dans le wizard |
| `data` | `array` | Tableau d'objets a seeder |

**Exemple : seed utilisateurs avec hash + resolution de role :**
```json
{
  "key": "demoUsers",
  "collection": "user",
  "match": "email",
  "hashField": "password",
  "roleField": "role",
  "defaults": { "status": "active" },
  "data": [
    { "email": "agent@app.dz", "password": "Agent@123", "firstName": "Karim", "role": "agent_accueil" }
  ]
}
```

A l'execution :
1. `password` est hashe avec bcrypt (12 rounds)
2. `role: "agent_accueil"` est resolu en `roles: ["<id-du-role>"]`
3. `defaults.status` est fusionne → `status: "active"`
4. Si `match: "email"` et l'email existe deja → upsert (pas de doublon)

### setup.json manquant : upload automatique

Si le projet accede a `/setup` et que `setup.json` n'existe pas, la page affiche
automatiquement un formulaire d'upload (drag & drop ou selection de fichier).

Pour activer cette fonctionnalite, ajoutez la route API :

```typescript
// src/app/api/setup/setup-json/route.ts
import { createSetupJsonHandler } from '@mostajs/setup'
import { appNeedsSetup } from '@/lib/setup-config'

export const { GET, POST } = createSetupJsonHandler(appNeedsSetup)
```

- **GET** `/api/setup/setup-json` → `{ exists: boolean, config?: {...} }`
- **POST** `/api/setup/setup-json` → recoit le JSON, ecrit `./setup.json`

### Mixer JSON + code TypeScript

Les seeds simples (insert de donnees) vont dans `setup.json`. Les seeds complexes
(relations, logique conditionnelle) restent en TypeScript :

```typescript
const config = await loadSetupJson('./setup.json', repoFactory)
// Ajouter un seed code-only
config.optionalSeeds = [
  ...(config.optionalSeeds ?? []),
  { key: 'demoData', label: 'Donnees complexes', run: async () => { /* ... */ } },
]
```

### Validation

`loadSetupJson()` valide automatiquement :
- `app.name` est requis
- Chaque permission reference une categorie existante
- Chaque role reference des permissions existantes (sauf `*`)
- Erreur descriptive en cas de reference croisee invalide

### CLI : npx mosta-setup

```bash
# Mode interactif (terminal)
npx mosta-setup

# Mode rapide (CI, scripts, Dockerfile)
npx mosta-setup --quick --name MonApp --port 4567 --db monappdb

# Avec modules
npx mosta-setup --quick --name MonApp --modules "orm,auth,audit,rbac,settings,setup"

# Sortie stdout (pour pipe)
npx mosta-setup --quick --name MonApp --stdout | jq .
```

---

## 10. FAQ / Troubleshooting

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

| Package | Depend de orm | Standalone | Description |
|---------|:---:|:---:|-------------|
| [@mostajs/orm](https://www.npmjs.com/package/@mostajs/orm) | — | — | Multi-dialect ORM, 13 SGBD (requis) |
| [@mostajs/auth](https://www.npmjs.com/package/@mostajs/auth) | oui | non | Authentication NextAuth, sessions |
| [@mostajs/audit](https://www.npmjs.com/package/@mostajs/audit) | oui | non | Audit logging, tracabilite |
| [@mostajs/rbac](https://www.npmjs.com/package/@mostajs/rbac) | oui | non | Roles & Permissions RBAC |
| [@mostajs/settings](https://www.npmjs.com/package/@mostajs/settings) | oui | non | Parametres cle-valeur |
| [@mostajs/face](https://www.npmjs.com/package/@mostajs/face) | **non** | **oui** | Reconnaissance faciale (independant) |

## Catch-all Route Factory (createSetupRoutes)

Replace 6+ individual route files with a single `[...slug]` handler :

```typescript
// src/app/api/setup/[...slug]/route.ts — 7 lines replaces 6 files
import { createSetupRoutes } from '@mostajs/setup'
import { appNeedsSetup, getSetupConfig } from '@/lib/setup-config'

export const { GET, POST, DELETE, PATCH } = createSetupRoutes({
  needsSetup: appNeedsSetup,
  getSetupConfig,
})
```

Handles all 11 setup endpoints : status, test-db, create-db, preflight, detect-modules, install-modules, setup-json, upload-jar, wire-module, reconfig, install.

## createAdmin (auto-generated)

`loadSetupJson()` automatically generates a `createAdmin` callback that :
1. Gets the `user` repo via `repoFactory`
2. Gets the `role` repo to resolve the `admin` role
3. Creates the admin user with bcrypt-hashed password and admin role

No need to define `createAdmin` manually — it comes from `loadSetupJson()`.

## lookupFields (cross-entity references in seeds)

Resolve a field value from another collection before inserting seed data :

```json
{
  "key": "demoClients",
  "collection": "client",
  "lookupFields": {
    "createdBy": { "collection": "user", "match": "status", "value": "active" }
  },
  "data": [
    { "firstName": "Samir", "lastName": "Boudjema", "phone": "0550100001" }
  ]
}
```

`lookupFields.createdBy` : find the first `user` where `status = "active"`, inject its `id` as `createdBy` in every data item.

Useful for seeds that reference entities created by earlier seeds (RBAC roles, admin user, etc.).

## Dynamic Seeds in SetupWizard

The wizard automatically loads available seeds from the `/api/setup/setup-json` endpoint and displays them as checkboxes. Seeds with `"default": true` in setup.json are pre-checked.

No need to hardcode seed checkboxes — add a seed to `setup.json` and it appears in the wizard automatically.

## License

MIT — (c) 2025-2026 Dr Hamid MADANI <drmdh@msn.com>
