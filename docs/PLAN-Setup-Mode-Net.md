# Plan — Évolution SetupWizard : Mode ORM direct + Mode NET

**Auteur** : Dr Hamid MADANI drmdh@msn.com
**Date** : 2026-03-25
**Package** : @mostajs/setup

---

## Contexte

Le SetupWizard ne supporte que le mode **accès direct ORM** (l'app se connecte à la DB).
Avec l'introduction de `@mostajs/net`, un nouveau mode est nécessaire :
l'app communique avec un serveur net distant via REST/GraphQL/WS/JSON-RPC.

### Deux architectures à supporter

```
Mode A (ORM direct)          Mode B (NET réseau)
─────────────────            ──────────────────
App → ORM → DB               App → NET → ORM → DB
  (même process)              (réseau, deux services)

.env.local :                 .env.local :
  DB_DIALECT=postgres          MOSTA_NET_URL=http://host:4488
  SGBD_URI=postgres://...      MOSTA_NET_TRANSPORT=rest
                               MOSTA_NET_API_KEY=msk_live_...
```

---

## Modifications par composant

### 1. SetupWizard.tsx — Nouvelle étape "Mode de connexion"

**Étape 0 (nouveau) — Choix du mode** :

| Élément | Description |
|---|---|
| Radio "ORM direct" | Sélectionne le mode actuel (dialect + URI) |
| Radio "Via @mostajs/net" | Active le mode réseau |
| Icônes | Database pour ORM, Network pour NET |

**Si Mode A (ORM)** → flux actuel inchangé : welcome → dialect → test-db → admin → seeds → install

**Si Mode B (NET)** → nouveau flux :

| Étape | Contenu |
|---|---|
| 0. Mode | Choix ORM / NET |
| 1. Serveur NET | URL (http://host:4488), transport (REST/GraphQL/JSON-RPC/WS), API key (optionnel) |
| 2. Test connexion | Appelle `GET {url}/health` → vérifie entities + transports disponibles |
| 3. Test DB | Appelle `POST {url}/api/test-connection` → vérifie que net est connecté à la DB |
| 4. Schemas | Affiche les entities disponibles depuis `/health` |
| 5. Admin | Création du premier utilisateur (via REST `POST {url}/api/v1/users`) |
| 6. Seeds | Exécution des seeds via REST (POST chaque entité) |
| 7. Résultat | Récapitulatif, écriture `.env.local` avec `MOSTA_NET_URL` |

### 2. Types — Nouveau mode dans la config

```typescript
// types/index.ts
export type SetupMode = 'orm' | 'net';

export interface NetConfig {
  url: string;              // http://host:4488
  transport: 'rest' | 'graphql' | 'jsonrpc' | 'ws';
  apiKey?: string;           // msk_live_...
}

export interface InstallConfig {
  mode: SetupMode;           // NOUVEAU
  // Mode ORM (existant)
  dialect?: DialectType;
  db?: DbConfig;
  // Mode NET (nouveau)
  net?: NetConfig;
  // Commun
  admin: { email: string; password: string; firstName: string; lastName: string };
  seed?: SeedOptions;
  modules?: string[];
}
```

### 3. lib/setup.ts — runInstall adapté au mode NET

```typescript
export async function runInstall(config: InstallConfig, setupConfig: MostaSetupConfig) {
  if (config.mode === 'net') {
    return runNetInstall(config, setupConfig);
  }
  // Mode ORM direct — code actuel inchangé
  return runOrmInstall(config, setupConfig);
}

async function runNetInstall(config: InstallConfig, setupConfig: MostaSetupConfig) {
  const { url, transport, apiKey } = config.net!;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // 1. Écrire .env.local avec MOSTA_NET_URL
  await writeEnvLocal({
    dialect: 'net',  // marqueur spécial
    uri: url,
    extraVars: {
      MOSTA_NET_URL: url,
      MOSTA_NET_TRANSPORT: transport,
      ...(apiKey ? { MOSTA_NET_API_KEY: apiKey } : {}),
      ...setupConfig.extraEnvVars,
    },
  });

  // 2. Seed RBAC via REST
  //    POST {url}/api/v1/permission_categories → chaque catégorie
  //    POST {url}/api/v1/permissions → chaque permission
  //    POST {url}/api/v1/roles → chaque rôle avec permissions

  // 3. Create admin via REST
  //    POST {url}/api/v1/users → { email, password (hashed), firstName, lastName, roles: [adminRoleId] }

  // 4. Optional seeds via REST
  //    POST {url}/api/v1/{collection} → chaque item

  return { ok: true, needsRestart: false, seeded: [...] };
}
```

### 4. api/routes.ts — Nouvel endpoint net-test

Ajout dans le catch-all `createSetupRoutes` :

| Slug | Méthode | Description |
|---|---|---|
| `net-test` | POST | Test connexion au serveur NET (body: { url }) → appelle `/health` |
| `net-schemas` | POST | Récupère les schemas depuis NET (body: { url }) → appelle `/api/schemas-config` |
| `net-db-test` | POST | Test la DB via NET (body: { url }) → appelle `/api/test-connection` |

### 5. .env.local — Nouvelles variables

```bash
# Mode NET
MOSTA_NET_URL=http://192.168.1.100:4488
MOSTA_NET_TRANSPORT=rest
MOSTA_NET_API_KEY=msk_live_abc123...
```

### 6. setup.json — Compatible deux modes

Le `setup.json` reste identique — il déclare les seeds et le RBAC. La différence est dans **comment** ils sont exécutés :

| | Mode ORM | Mode NET |
|---|---|---|
| RBAC seed | `repo.create()` direct | `fetch(url/api/v1/roles, POST)` |
| Admin user | `repo.create()` direct | `fetch(url/api/v1/users, POST)` |
| Seeds optionnels | `repo.create()` direct | `fetch(url/api/v1/{collection}, POST)` |
| lookupFields | `repo.findOne()` direct | `fetch(url/api/v1/{collection}?filter=...)` |

---

## Fichiers à modifier

| Fichier | Action | Effort |
|---|---|---|
| `components/SetupWizard.tsx` | Ajouter étape Mode + flux NET | 3h |
| `types/index.ts` | Ajouter `SetupMode`, `NetConfig` | 15min |
| `lib/setup.ts` | Ajouter `runNetInstall()` | 2h |
| `lib/net-client.ts` | **Nouveau** — client REST pour communiquer avec NET | 1h |
| `api/routes.ts` | Ajouter slugs `net-test`, `net-schemas`, `net-db-test` | 1h |
| `lib/env-writer.ts` | Supporter mode NET (pas de dialect/URI, juste MOSTA_NET_*) | 30min |

**Total estimé : ~8h**

---

## Ordre d'implémentation

```
Phase A : lib/net-client.ts (client REST vers NET)
  ↓
Phase B : types + lib/setup.ts (runNetInstall)
  ↓
Phase C : api/routes.ts (net-test, net-schemas, net-db-test)
  ↓
Phase D : SetupWizard.tsx (étape Mode + flux NET)
  ↓
Phase E : Tests (wizard mode NET avec Balloon Booking)
```

---

## Test de validation

```bash
# 1. Démarrer net standalone (Balloon Booking)
cd booking-baloon && ./start-net.sh 4488

# 2. Démarrer une app frontend avec setup wizard
cd frontend-app && npm run dev

# 3. Ouvrir http://localhost:3000/setup
#    → Choisir "Via @mostajs/net"
#    → URL: http://localhost:4488
#    → Transport: REST
#    → Test connexion → ✅
#    → Schemas: 7 entities
#    → Admin: créer un admin
#    → Seeds: expériences + passagers
#    → ✅ Installé

# 4. Vérifier
curl http://localhost:4488/api/v1/experiences  → 5 expériences seedées
curl http://localhost:4488/api/v1/passengers   → 5 passagers seedés
```
