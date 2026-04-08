// @mostajs/setup — Cloud tests (no DB needed)
// Author: Dr Hamid MADANI drmdh@msn.com

import {
  detectCloudMode,
  getCloudConfig,
  validateCloudConfig,
} from '../lib/cloud-mode.js'

import {
  CLOUD_MODULES,
  discoverCloudModules,
  getInstallCommand,
} from '../lib/cloud-modules-discovery.js'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log('  ✅', label) }
  else { failed++; console.error('  ❌', label) }
}

async function run() {

  // ── T1 — Cloud mode ──
  console.log('T1 — Cloud mode')
  delete process.env.MOSTA_CLOUD
  assert(detectCloudMode() === false, 'detectCloudMode() returns false by default')
  const defaultConfig = getCloudConfig()
  assert(defaultConfig.isCloud === false, 'getCloudConfig() returns {isCloud: false}')
  assert(defaultConfig.portalUri === undefined, 'no portalUri when not cloud')
  console.log('')

  // ── T2 — Validate cloud config ──
  console.log('T2 — Validate cloud config')
  const emptyUri = validateCloudConfig({ isCloud: true, portalUri: '', encryptionKey: 'a'.repeat(64) })
  assert(!emptyUri.valid, 'empty URI → not valid')
  assert(emptyUri.errors.some(e => e.includes('Portal database URI')), 'error mentions Portal URI')

  const badKey = validateCloudConfig({ isCloud: true, portalUri: 'postgres://localhost/db', encryptionKey: 'short' })
  assert(!badKey.valid, 'bad encryption key → not valid')
  assert(badKey.errors.some(e => e.includes('64 hex')), 'error mentions 64 hex characters')

  const validConfig = validateCloudConfig({
    isCloud: true,
    portalUri: 'postgres://localhost/db',
    encryptionKey: 'a'.repeat(64),
  })
  assert(validConfig.valid, 'valid config → valid')
  assert(validConfig.errors.length === 0, 'no errors for valid config')
  console.log('')

  // ── T3 — Cloud modules list ──
  console.log('T3 — Cloud modules list')
  assert(CLOUD_MODULES.length === 5, 'CLOUD_MODULES has 5 entries')
  const requiredCount = CLOUD_MODULES.filter(m => m.required).length
  const optionalCount = CLOUD_MODULES.filter(m => !m.required).length
  assert(requiredCount === 4, '4 required modules')
  assert(optionalCount === 1, '1 optional module')
  const modules = await discoverCloudModules()
  assert(Array.isArray(modules), 'discoverCloudModules returns array')
  assert(modules.length === 5, 'discoverCloudModules returns 5 items')
  console.log('')

  // ── T4 — Install command ──
  console.log('T4 — Install command')
  assert(getInstallCommand([]) === '', 'empty array → empty string')
  const cmd = getInstallCommand(['@mostajs/pm2'])
  assert(cmd.includes('npm install'), 'contains npm install')
  assert(cmd.includes('@mostajs/pm2'), 'contains @mostajs/pm2')
  assert(cmd.includes('--legacy-peer-deps'), 'contains --legacy-peer-deps')
  console.log('')

  // ── Summary ──
  console.log('════════════════════════════════════════')
  console.log(`  Resultats: ${passed} passed, ${failed} failed`)
  console.log('════════════════════════════════════════')
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
