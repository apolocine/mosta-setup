● Tu as raison. Le SetupWizard doit évoluer pour supporter les deux modes
   d'architecture :

  Mode A (actuel) : App → ORM → DB directe
  Mode B (nouveau) : App → NET → ORM → DB distante

  Ce que ça implique dans le SetupWizard

  Page 1 — Choix du mode :

  ┌─────────────────────────────────────────────────┐
  │  Comment accéder aux données ?                  │
  │                                                 │
  │  ○ Accès direct (ORM)                           │
  │    L'application se connecte directement à la   │
  │    base de données                              │
  │    → Choix du dialect (13 SGBD)                 │
  │    → Configuration URI                          │
  │                                                 │
  │  ○ Via @mostajs/net (réseau)                    │
  │    L'application communique avec un serveur     │
  │    @mostajs/net distant                         │
  │    → URL du serveur (http://host:4488)          │
  │    → Transport (REST, GraphQL, JSON-RPC, WS)    │
  │    → Test de connexion                          │
  │    → Vérification des schemas disponibles       │
  │                                                 │
  │  [Continuer]                                    │
  └─────────────────────────────────────────────────┘

  En mode NET :
  - Pas besoin de configurer dialect/URI (c'est côté serveur net)
  - Le wizard teste la connexion au serveur net
  - Il récupère les schemas disponibles via /health
  - Il vérifie que la DB est connectée via /api/test-connection
  - Le seeding passe par les API REST de net
  - Le .env.local écrit MOSTA_NET_URL=http://host:4488 au lieu de
  DB_DIALECT

  C'est un changement significatif dans @mostajs/setup — le SetupWizard,
  les routes, et le runInstall. Mais c'est nécessaire pour que Balloon
  Booking puisse utiliser le wizard.

  Mon avis : oui, c'est le bon moment pour le faire avant la Phase 2
  (frontend). Sinon le frontend Balloon Booking n'aura pas de wizard.

  Tu veux qu'on fasse un plan détaillé des modifications dans le
  SetupWizard, ou qu'on commence directement ?


