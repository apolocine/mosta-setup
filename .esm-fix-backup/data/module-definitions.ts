// @mosta/setup — Module definitions registry
// Author: Dr Hamid MADANI drmdh@msn.com

export interface ModuleDefinition {
  key: string
  packageName: string      // ex: '@mostajs/auth'
  localDir?: string        // ex: 'mosta-auth' — sous-dossier packages/ (si disponible localement)
  label: string
  description: string
  icon: string
  required?: boolean
  default?: boolean
  dependsOn?: string[]
  discovered?: boolean     // true si decouvert dynamiquement (pas dans la liste statique)
}

export const MODULES: ModuleDefinition[] = [
  {
    key: 'orm',
    packageName: '@mostajs/orm',
    localDir: 'mosta-orm',
    label: 'ORM (Data Access Layer)',
    description: 'Couche d\'acces aux donnees multi-dialecte',
    icon: '🗄️',
    required: true,
    default: true,
  },
  {
    key: 'auth',
    packageName: '@mostajs/auth',
    localDir: 'mosta-auth',
    label: 'Authentification',
    description: 'NextAuth, sessions, gestion des mots de passe',
    icon: '🔐',
    required: true,
    default: true,
    dependsOn: ['orm'],
  },
  {
    key: 'audit',
    packageName: '@mostajs/audit',
    localDir: 'mosta-audit',
    label: 'Audit & Logs',
    description: 'Journalisation des actions, tracabilite',
    icon: '📋',
    default: true,
    dependsOn: ['orm'],
  },
  {
    key: 'rbac',
    packageName: '@mostajs/rbac',
    localDir: 'mosta-rbac',
    label: 'Roles & Permissions',
    description: 'Gestion RBAC : roles, permissions, matrice',
    icon: '🛡️',
    default: true,
    dependsOn: ['auth', 'audit'],
  },
  {
    key: 'settings',
    packageName: '@mostajs/settings',
    localDir: 'mosta-settings',
    label: 'Parametres',
    description: 'Parametres cle-valeur, formulaire auto, provider React',
    icon: '⚙️',
    default: true,
    dependsOn: ['orm'],
  },
  {
    key: 'face',
    packageName: '@mostajs/face',
    localDir: 'mosta-face',
    label: 'Reconnaissance faciale',
    description: 'Detection de visage, extraction descripteurs, matching 1:N',
    icon: '👤',
    default: false,
  },
  {
    key: 'setup',
    packageName: '@mostajs/setup',
    localDir: 'mosta-setup',
    label: 'Setup Wizard',
    description: 'Assistant d\'installation, test connexion, seed DB',
    icon: '🧙',
    required: true,
    default: true,
    dependsOn: ['orm'],
  },
]

/**
 * Given a set of selected module keys, returns the full set including
 * all transitive dependencies. Works with both static and discovered modules.
 */
export function resolveModuleDependencies(
  selected: string[],
  modules: ModuleDefinition[] = MODULES,
): string[] {
  const resolved = new Set(selected)
  const moduleMap = new Map(modules.map((m) => [m.key, m]))

  let changed = true
  while (changed) {
    changed = false
    for (const key of resolved) {
      const mod = moduleMap.get(key)
      if (mod?.dependsOn) {
        for (const dep of mod.dependsOn) {
          if (!resolved.has(dep)) {
            resolved.add(dep)
            changed = true
          }
        }
      }
    }
  }

  // Always include required modules
  for (const mod of modules) {
    if (mod.required && !resolved.has(mod.key)) {
      resolved.add(mod.key)
    }
  }

  return Array.from(resolved)
}
