Plan : Centraliser le setup dans @mostajs/setup

 Contexte

 Chaque projet utilisant @mostajs/setup doit créer ~10 fichiers (6 routes API +
  page + layout + config + middleware). 8 sur 10 sont du copier-coller pur.
 L'objectif est de réduire à 2 fichiers à créer dans un nouveau projet.

 Approche : catch-all route factory + page/layout exportés

 1. Créer createSetupRoutes() dans @mostajs/setup

 Fichier : mostajs/mosta-setup/api/routes.ts (nouveau)

 Factory qui prend la config minimale de l'app et retourne { GET, POST, DELETE,
  PATCH } pour un catch-all [...slug].

 export function createSetupRoutes(config: {
needsSetup: () => Promise<boolean>
getSetupConfig: () => Promise<MostaSetupConfig>
 }) {
// Lazy-init des handlers (créés au premier appel, pas à l'import)
// Dispatch par slug[0] : 'status', 'test-db', 'create-db', 'preflight',
 etc.

async function GET(req, { params }) { /* dispatch */ }
async function POST(req, { params }) { /* dispatch */ }
async function DELETE(req, { params }) { /* dispatch */ }
async function PATCH(req, { params }) { /* dispatch */ }

return { GET, POST, DELETE, PATCH }
 }

 Dispatch table (11 actions) :

 ┌─────────────────┬─────┬──────┬────────┬───────┐
 │ slug  │ GET │ POST │ DELETE │ PATCH │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ status │ ✓│ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ test-db││ ✓ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ create-db  ││ ✓ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ preflight  │ ✓│ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ detect-modules  │ ✓│ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ install-modules ││ ✓ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ setup-json │ ✓│ ✓ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ upload-jar │ ✓│ ✓ │ ✓ │ ✓│
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ wire-module│ ✓│ ✓ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ reconfig│ ✓│ ✓ ││  │
 ├─────────────────┼─────┼──────┼────────┼───────┤
 │ install││ ✓ ││  │
 └─────────────────┴─────┴──────┴────────┴───────┘

 2. Exporter page + layout depuis @mostajs/setup

 Fichiers : mostajs/mosta-setup/pages/SetupPage.tsx et SetupLayout.tsx
 (nouveaux)

 Composants réutilisables que l'app ré-exporte.

 3. Exporter depuis index.ts

 Ajouter dans le barrel :
 export { createSetupRoutes } from './api/routes.js'
 export { default as SetupPage } from './pages/SetupPage.js'
 export { default as SetupLayout } from './pages/SetupLayout.js'

 4. Côté app (SecuAccessPro) — réduire à 3 fichiers

 A. src/app/api/setup/[...slug]/route.ts (remplace 6 fichiers)
 import { createSetupRoutes } from '@mostajs/setup'
 import { appNeedsSetup, getSetupConfig } from '@/lib/setup-config'
 export const { GET, POST, DELETE, PATCH } = createSetupRoutes({
needsSetup: appNeedsSetup,
getSetupConfig,
 })

 B. src/app/setup/page.tsx (simplifié)
 import { SetupPage } from '@mostajs/setup'
 export default SetupPage

 Wait — Next.js App Router ne supporte pas le re-export direct de composants
 serveur depuis node_modules pour les pages. La page doit rester un wrapper
 minimal.

 B. src/app/setup/page.tsx (wrapper 1 ligne)
 'use client'
 export { default } from '@mostajs/setup/components/SetupPageWrapper'

 Ou la page reste un wrapper qui importe SetupWizard comme maintenant — c'est
 déjà quasi-générique.

 C. src/lib/setup-config.ts — inchangé (seul fichier vraiment spécifique)

 5. Fichiers modifiés

 ┌─────────────────────────────────────────────────────┬────────────────────┐
 │Fichier│  Action  │
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ mostajs/mosta-setup/api/routes.ts │ Créer — catch-all  │
 │  │ factory│
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │  │ Modifier —│
 │ mostajs/mosta-setup/index.ts│ exporter  │
 │  │ createSetupRoutes  │
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ SecuAccessPro/src/app/api/setup/[...slug]/route.ts  │ Créer — 5 lignes│
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ SecuAccessPro/src/app/api/setup/test-db/route.ts │ Supprimer │
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ SecuAccessPro/src/app/api/setup/create-db/route.ts  │ Supprimer │
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ SecuAccessPro/src/app/api/setup/install/route.ts │ Supprimer │
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ SecuAccessPro/src/app/api/setup/preflight/route.ts  │ Supprimer │
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ SecuAccessPro/src/app/api/setup/setup-json/route.ts │ Supprimer │
 ├─────────────────────────────────────────────────────┼────────────────────┤
 │ SecuAccessPro/src/app/api/setup/status/route.ts│ Supprimer │
 └─────────────────────────────────────────────────────┴────────────────────┘

 6. Note sur install/route.ts (logique custom)

 La logique custom de install/route.ts de SecuAccessPro (disconnectDialect,
 process.env update) est déjà dans runInstall() de @mostajs/setup. Le fichier
 SecuAccessPro ne fait que pré-disconnect + appeler runInstall. On peut
 intégrer le pre-disconnect dans le handler factory createInstallHandler.

 7. Vérification

 - Relancer npm run dev sur SecuAccessPro
 - Tester /setup wizard complet (sélection dialect, test DB, install)
 - Vérifier que toutes les routes API répondent via le catch-all
 - Tester avec Oracle (le cas le plus sensible)
 - Publish @mostajs/setup sur npm
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌

 Claude has written up a plan and is ready to execute. Would you like to
 proceed?

 ❯ 1. Yes, clear context (19% used) and auto-accept edits
2. Yes, auto-accept edits
3. Yes, manually approve edits
4. Type here to tell Claude what to change





Changes Made  
 
  @mostajs/setup (library)
 
  1. Created mostajs/mosta-setup/api/routes.ts — createSetupRoutes() factory
 - Takes { needsSetup, getSetupConfig } config
 - Lazy-inits all 11 handler factories on first request
 - Dispatches by slug[0] (status, test-db, create-db, preflight, detect-modules, install-modules, setup-json, upload-jar, wire-module, reconfig, 
  install) 
 - Returns { GET, POST, DELETE, PATCH } for a [...slug] catch-all
  2. Modified mostajs/mosta-setup/index.ts — added export for createSetupRoutes + SetupRoutesConfig type
  3. Modified mostajs/mosta-setup/package.json — added ./api/routes subpath export
 
  SecuAccessPro (host app)
 
  4. Created SecuAccessPro/src/app/api/setup/[...slug]/route.ts — 7 lines, replaces 6 files
  5. Deleted 6 individual route directories:
 - test-db/route.ts
 - create-db/route.ts
 - install/route.ts
 - preflight/route.ts
 - setup-json/route.ts 
 - status/route.ts

  Result: 6 route files → 1 catch-all (7 lines). Both tsc build and next build pass successfully.
  
  
  
  
  ● Tout est fait :

  - mosta-setup : commit + push + publish @mostajs/setup@2.1.0 sur npm
  - SecuAccessPro : commit + push — 6 routes supprimées, 1 catch-all [...slug] de 7 lignes



● Done. L'onglet Export du Setup Studio propose maintenant :

  1. setup.json — bouton bleu (inchangé) + copier JSON
  2. route.ts — nouveau bouton vert "Telecharger route.ts" avec preview du code
  3. Guide d'integration mis à jour avec :
    - Placement : src/app/api/setup/[...slug]/route.ts
    - Explication que ce fichier unique remplace les 6+ routes individuelles
    - Squelette de setup-config.ts à créer

