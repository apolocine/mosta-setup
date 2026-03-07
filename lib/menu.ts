// @mostajs/setup — Menu contribution
// Author: Dr Hamid MADANI drmdh@msn.com

import { Wrench } from 'lucide-react'
import type { ModuleMenuContribution } from '@mostajs/menu'

export const setupMenuContribution: ModuleMenuContribution = {
  moduleKey: 'setup',
  mergeIntoGroup: 'Administration',
  order: 100,
  items: [
    {
      label: 'setup.title',
      href: '/setup',
      icon: Wrench,
      permission: 'admin:access',
    },
  ],
}
