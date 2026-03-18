// @mostajs/setup — Runtime module registration
// Author: Dr Hamid MADANI drmdh@msn.com

import type { ModuleRegistration } from '@mostajs/socle'

/**
 * Setup provides the installation wizard and reconfiguration panel.
 * No schemas of its own — orchestrates other modules' seeds.
 * Menu contributions are declared by the host app, not by this module.
 */
export function register(registry: { register(r: ModuleRegistration): void }): void {
  registry.register({
    manifest: {
      name: 'setup',
      package: '@mostajs/setup',
      version: '2.0.0',
      type: 'core',
      priority: 10,
      dependencies: ['auth', 'settings'],
      displayName: 'Setup',
      description: 'Installation wizard — DB config, module selection, admin creation, seeding',
      icon: 'Wrench',
      register: './dist/register.js',
    },
  })
}
