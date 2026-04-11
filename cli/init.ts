#!/usr/bin/env node
// Author: Dr Hamid MADANI drmdh@msn.com
// CLI: npx @mostajs/setup init — interactive setup.json generator
//
// Usage:
//   npx mosta-setup              # interactive mode
//   npx mosta-setup --quick      # generate minimal setup.json with defaults
//   npx mosta-setup --name MyApp --port 4567 --db myappdb  # non-interactive

import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'

const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const NC = '\x1b[0m'

// ── Parse CLI args ───────────────────────────────────────

const args = process.argv.slice(2)
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const hasFlag = (flag: string) => args.includes(flag)

// ── Quick mode (non-interactive) ─────────────────────────

if (hasFlag('--quick') || hasFlag('-q')) {
  const name = getArg('--name') || 'MonApp'
  const port = parseInt(getArg('--port') || '3000')
  const dbPrefix = getArg('--db') || name.toLowerCase().replace(/[^a-z0-9]/g, '') + 'db'
  const modules = getArg('--modules')

  const setup: Record<string, unknown> = {
    $schema: 'https://mostajs.dev/schemas/setup.v1.json',
    app: { name, ...(port !== 3000 ? { port } : {}), ...(dbPrefix ? { dbNamePrefix: dbPrefix } : {}) },
  }
  if (modules) setup.env = { MOSTAJS_MODULES: modules }

  const json = JSON.stringify(setup, null, 2)
  const outPath = path.resolve(process.cwd(), 'setup.json')

  if (hasFlag('--stdout')) {
    process.stdout.write(json + '\n')
  } else {
    fs.writeFileSync(outPath, json + '\n', 'utf-8')
    console.log(`${GREEN}setup.json cree: ${outPath}${NC}`)
  }
  process.exit(0)
}

// ── Interactive mode ─────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY !== false })
const ask = (q: string, def?: string): Promise<string> =>
  new Promise(r => rl.question(`${q}${def ? ` (${def})` : ''}: `, a => r(a.trim() || def || '')))

async function main() {
  console.log(`\n${CYAN}  MostaSetup — Generateur de setup.json${NC}\n`)

  // ── App ────────────────────────────────────────────────
  const appName = await ask('  Nom de l\'application', 'MonApp')
  const portStr = await ask('  Port HTTP', '3000')
  const port = parseInt(portStr) || 3000
  const dbPrefix = await ask('  Prefix DB', appName.toLowerCase().replace(/[^a-z0-9]/g, '') + 'db')

  // ── Env ────────────────────────────────────────────────
  const addModules = (await ask('  Ajouter MOSTAJS_MODULES ? (o/n)', 'o')).toLowerCase() === 'o'
  const modules = addModules
    ? await ask('  Modules', 'orm,auth,audit,rbac,settings,setup')
    : ''

  // ── RBAC ───────────────────────────────────────────────
  const addRbac = (await ask('\n  Generer un RBAC de base ? (o/n)', 'o')).toLowerCase() === 'o'
  const categories: { name: string; label: string }[] = []
  const permissions: { code: string; description: string; category: string }[] = []
  const roles: { name: string; description: string; permissions: string[] }[] = []

  if (addRbac) {
    console.log(`\n  ${CYAN}Categories${NC} (entree vide pour terminer)`)
    while (true) {
      const name = await ask('    Nom categorie (ex: admin)')
      if (!name) break
      const label = await ask(`    Label pour "${name}"`, name.charAt(0).toUpperCase() + name.slice(1))
      categories.push({ name, label })
    }

    console.log(`\n  ${CYAN}Permissions${NC} (entree vide pour terminer)`)
    while (true) {
      const code = await ask('    Code permission (ex: client:view)')
      if (!code) break
      const desc = await ask(`    Description pour "${code}"`, code)
      const cat = categories.length > 0
        ? await ask(`    Categorie (${categories.map(c => c.name).join(', ')})`, categories[0].name)
        : ''
      permissions.push({ code, description: desc, category: cat })
    }

    console.log(`\n  ${CYAN}Roles${NC} (entree vide pour terminer)`)
    while (true) {
      const name = await ask('    Nom role (ex: admin)')
      if (!name) break
      const desc = await ask(`    Description`, name)
      const allPerms = (await ask('    Toutes les permissions ? (o/n)', name === 'admin' ? 'o' : 'n')).toLowerCase() === 'o'
      let rolePerms: string[] = []
      if (allPerms) {
        rolePerms = ['*']
      } else {
        const permsStr = await ask(`    Permissions (virgules: ${permissions.map(p => p.code).slice(0, 5).join(', ')}...)`)
        rolePerms = permsStr.split(',').map(s => s.trim()).filter(Boolean)
      }
      roles.push({ name, description: desc, permissions: rolePerms })
    }
  }

  // ── Build JSON ─────────────────────────────────────────
  const setup: Record<string, unknown> = {
    $schema: 'https://mostajs.dev/schemas/setup.v1.json',
    app: { name: appName, ...(port !== 3000 ? { port } : {}), ...(dbPrefix ? { dbNamePrefix: dbPrefix } : {}) },
  }
  if (modules) {
    setup.env = { MOSTAJS_MODULES: modules }
  }
  if (addRbac && (categories.length || permissions.length || roles.length)) {
    const rbac: Record<string, unknown> = {}
    if (categories.length) rbac.categories = categories
    if (permissions.length) rbac.permissions = permissions
    if (roles.length) rbac.roles = roles
    setup.rbac = rbac
  }

  const json = JSON.stringify(setup, null, 2)
  const outPath = path.resolve(process.cwd(), 'setup.json')

  console.log(`\n${CYAN}  Preview:${NC}`)
  console.log(json)

  const write = (await ask(`\n  Ecrire dans ${outPath} ? (o/n)`, 'o')).toLowerCase() === 'o'
  if (write) {
    fs.writeFileSync(outPath, json + '\n', 'utf-8')
    console.log(`\n  ${GREEN}setup.json cree avec succes${NC}\n`)
  } else {
    console.log(`\n  Annule.\n`)
  }

  rl.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
