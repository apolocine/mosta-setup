// @mostajs/setup — Setup Wizard (reusable, inline-styles, no Tailwind/shadcn dependency)
// Author: Dr Hamid MADANI drmdh@msn.com
'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────

type Dialect =
  | 'mongodb' | 'sqlite' | 'postgres' | 'mysql' | 'mariadb'
  | 'oracle' | 'mssql' | 'cockroachdb'
  | 'db2' | 'hana' | 'hsqldb' | 'spanner' | 'sybase'

interface ModuleDefinition {
  key: string
  label: string
  description: string
  icon: string
  required?: boolean
  default?: boolean
  dependsOn?: string[]
  discovered?: boolean
}

interface DbConfig {
  host: string
  port: number
  name: string
  user: string
  password: string
}

interface AdminConfig {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
}

interface SeedOptions {
  activities: boolean
  demoUsers: boolean
  demoData: boolean
}

export interface SetupWizardProps {
  /** Translation function — receives i18n key, returns translated string */
  t?: (key: string) => string
  /** Called when setup is complete and user clicks "Go to Login" */
  onComplete?: () => void
  /** API endpoints */
  endpoints?: {
    detectModules?: string
    testDb?: string
    installModules?: string
    install?: string
    uploadJar?: string
    wireModule?: string
    /** Seed endpoint — runs module seeds from the runtime registry */
    seed?: string
  }
  /** Default database name prefix (e.g. 'secuaccessdb') */
  dbNamePrefix?: string
  /** Whether to persist wizard state in sessionStorage (default: true) */
  persistState?: boolean
}

// ── Constants ────────────────────────────────────────────────

const ALL_STEPS = ['welcome', 'modules', 'dialect', 'database', 'admin', 'summary'] as const
type Step = typeof ALL_STEPS[number]

const DIALECT_DEFAULTS: Record<Dialect, DbConfig> = {
  mongodb:     { host: 'localhost', port: 27017, name: 'mydb_prod',   user: '',         password: '' },
  sqlite:      { host: '',          port: 0,     name: 'mydb',        user: '',         password: '' },
  postgres:    { host: 'localhost', port: 5432,  name: 'mydb',        user: 'postgres', password: '' },
  mysql:       { host: 'localhost', port: 3306,  name: 'mydb',        user: 'root',     password: '' },
  mariadb:     { host: 'localhost', port: 3306,  name: 'mydb',        user: 'root',     password: '' },
  oracle:      { host: 'localhost', port: 1521,  name: 'mydb',        user: 'system',   password: '' },
  mssql:       { host: 'localhost', port: 1433,  name: 'mydb',        user: 'sa',       password: '' },
  cockroachdb: { host: 'localhost', port: 26257, name: 'mydb',        user: 'root',     password: '' },
  db2:         { host: 'localhost', port: 50000, name: 'mydb',        user: 'db2inst1', password: '' },
  hana:        { host: 'localhost', port: 30015, name: 'mydb',        user: 'SYSTEM',   password: '' },
  hsqldb:      { host: 'localhost', port: 9001,  name: 'mydb',        user: 'SA',       password: '' },
  spanner:     { host: '',          port: 0,     name: 'my-project/my-instance/mydb', user: '', password: '' },
  sybase:      { host: 'localhost', port: 5000,  name: 'mydb',        user: 'sa',       password: '' },
}

const DIALECT_INFO: { key: Dialect; name: string; icon: string; premium?: boolean; jdbc?: boolean }[] = [
  { key: 'mongodb',     name: 'MongoDB',       icon: '🍃' },
  { key: 'sqlite',      name: 'SQLite',        icon: '📁' },
  { key: 'postgres',    name: 'PostgreSQL',     icon: '🐘' },
  { key: 'mysql',       name: 'MySQL',          icon: '🐬' },
  { key: 'mariadb',     name: 'MariaDB',        icon: '🦭' },
  { key: 'mssql',       name: 'SQL Server',     icon: '🟦' },
  { key: 'oracle',      name: 'Oracle',         icon: '🔴', premium: true, jdbc: true },
  { key: 'cockroachdb', name: 'CockroachDB',    icon: '🪳' },
  { key: 'db2',         name: 'IBM DB2',        icon: '🏢', premium: true, jdbc: true },
  { key: 'hana',        name: 'SAP HANA',       icon: '💎', premium: true, jdbc: true },
  { key: 'hsqldb',      name: 'HyperSQL',       icon: '⚡', jdbc: true },
  { key: 'spanner',     name: 'Cloud Spanner',  icon: '☁️', premium: true },
  { key: 'sybase',      name: 'Sybase ASE',     icon: '🔷', premium: true, jdbc: true },
]

const JDBC_DIALECTS: Dialect[] = ['hsqldb', 'oracle', 'db2', 'hana', 'sybase']

const DRIVER_HINTS: Record<Dialect, string> = {
  mongodb:     'npm install mongoose',
  sqlite:      'npm install better-sqlite3',
  postgres:    'npm install pg',
  mysql:       'npm install mysql2',
  mariadb:     'npm install mariadb',
  oracle:      'npm install oracledb',
  mssql:       'npm install mssql',
  cockroachdb: 'npm install pg',
  db2:         'npm install ibm_db',
  hana:        'npm install @sap/hana-client',
  hsqldb:      'Uploader hsqldb*.jar dans jar_files/',
  spanner:     'npm install @google-cloud/spanner',
  sybase:      'npm install sybase',
}

const STORAGE_KEY = 'setup-wizard-state'

// ── Inline Styles ────────────────────────────────────────────

const S = {
  wrapper: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16, fontFamily: 'system-ui, sans-serif' } as const,
  container: { width: '100%', maxWidth: 672 } as const,
  // Stepper
  stepperRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32, gap: 8, flexWrap: 'wrap' as const } as const,
  stepCircle: (state: 'done' | 'current' | 'future') => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: '50%', fontSize: 13, fontWeight: 500 as const,
    backgroundColor: state === 'future' ? '#e5e7eb' : '#0284c7',
    color: state === 'future' ? '#6b7280' : '#fff',
    ...(state === 'current' ? { boxShadow: '0 0 0 4px #bae6fd' } : {}),
  }),
  stepLabel: (active: boolean) => ({
    fontSize: 13,
    fontWeight: active ? 600 : 400 as const,
    color: active ? '#0369a1' : '#6b7280',
  }),
  stepLine: (done: boolean) => ({
    width: 32, height: 2,
    backgroundColor: done ? '#0284c7' : '#e5e7eb',
  }),
  // Card
  card: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: 32 } as const,
  // Section header
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } as const,
  sectionIcon: { fontSize: 24, color: '#0284c7', lineHeight: 1 } as const,
  sectionTitle: { fontSize: 20, fontWeight: 700, color: '#111827' } as const,
  sectionDesc: { fontSize: 13, color: '#6b7280', marginTop: 4 } as const,
  // Buttons
  btn: (variant: 'primary' | 'outline' | 'lg' = 'primary', disabled = false) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: variant === 'lg' ? '12px 24px' : '8px 16px',
    border: variant === 'outline' ? '1px solid #d1d5db' : 'none',
    borderRadius: 8,
    fontSize: variant === 'lg' ? 15 : 13,
    fontWeight: 600 as const,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    backgroundColor: variant === 'outline' ? '#fff' : '#0284c7',
    color: variant === 'outline' ? '#374151' : '#fff',
    transition: 'all 0.15s',
  }),
  // Form
  formGroup: { marginBottom: 12 } as const,
  label: { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13, color: '#374151' } as const,
  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' } as const,
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as const,
  // Grid
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 } as const,
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 } as const,
  // Module card
  moduleCard: (selected: boolean, disabled: boolean) => ({
    padding: 16, borderRadius: 8, textAlign: 'left' as const,
    border: `2px solid ${selected ? '#0284c7' : '#e5e7eb'}`,
    backgroundColor: selected ? '#f0f9ff' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.2s',
  }),
  moduleHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 } as const,
  moduleLeft: { display: 'flex', alignItems: 'center', gap: 8 } as const,
  moduleName: { fontWeight: 600, fontSize: 14, color: '#111827' } as const,
  moduleDesc: { fontSize: 12, color: '#6b7280' } as const,
  badge: (type: 'required' | 'installed' | 'new' | 'premium') => ({
    display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 as const, marginLeft: 4,
    backgroundColor:
      type === 'required' ? '#dbeafe' : type === 'installed' ? '#d1fae5' :
      type === 'new' ? '#f3e8ff' : '#fef3c7',
    color:
      type === 'required' ? '#1e40af' : type === 'installed' ? '#065f46' :
      type === 'new' ? '#6b21a8' : '#92400e',
  }),
  // Dialect card
  dialectCard: (selected: boolean, premium: boolean) => ({
    padding: 16, borderRadius: 8, textAlign: 'center' as const,
    border: `2px solid ${!premium && selected ? '#0284c7' : '#e5e7eb'}`,
    backgroundColor: !premium && selected ? '#f0f9ff' : '#fff',
    cursor: premium ? 'not-allowed' : 'pointer',
    opacity: premium ? 0.4 : 1,
    filter: premium ? 'grayscale(0.5)' : 'none',
    transition: 'all 0.2s',
  }),
  dialectIcon: { fontSize: 24, marginBottom: 4 } as const,
  dialectName: { fontSize: 12, fontWeight: 600, color: '#111827' } as const,
  // Alert
  alert: (type: 'success' | 'error' | 'warning' | 'info') => ({
    padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13,
    backgroundColor:
      type === 'success' ? '#d1fae5' : type === 'error' ? '#fee2e2' :
      type === 'warning' ? '#fef3c7' : '#dbeafe',
    color:
      type === 'success' ? '#065f46' : type === 'error' ? '#991b1b' :
      type === 'warning' ? '#92400e' : '#1e40af',
    border: `1px solid ${
      type === 'success' ? '#a7f3d0' : type === 'error' ? '#fecaca' :
      type === 'warning' ? '#fde68a' : '#bfdbfe'}`,
  }),
  // Summary card
  summaryCard: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 } as const,
  summaryTitle: { fontWeight: 600, fontSize: 14, color: '#374151', marginBottom: 8 } as const,
  summaryText: { fontSize: 13, color: '#6b7280' } as const,
  // Checkbox row
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0' } as const,
  checkbox: { width: 16, height: 16, marginTop: 2, cursor: 'pointer', accentColor: '#0284c7' } as const,
  // Nav row
  navRow: { display: 'flex', justifyContent: 'space-between', paddingTop: 16 } as const,
  // JAR section
  jarBox: { padding: 16, borderRadius: 8, backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', marginTop: 12 } as const,
  jarTitle: { fontSize: 13, fontWeight: 600, color: '#0369a1', marginBottom: 8 } as const,
  // Module badges
  moduleBadges: { display: 'flex', alignItems: 'center', gap: 4 } as const,
  // Center
  center: { textAlign: 'center' as const } as const,
  // Spacer
  spacer: (px: number) => ({ height: px }) as const,
  // Flex
  flex: (gap = 8) => ({ display: 'flex', alignItems: 'center', gap }) as const,
  flexBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as const,
  flexWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 } as const,
  // Wire module styles
  wireGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 16 } as const,
  wireCard: (installed: boolean) => ({
    padding: 16,
    border: `2px solid ${installed ? '#059669' : '#e5e7eb'}`,
    borderRadius: 10,
    backgroundColor: installed ? '#f0fdf4' : '#fafafa',
    transition: 'all 0.2s',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
  }),
  wireStatus: (installed: boolean) => ({
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: installed ? '#22c55e' : '#ef4444',
    marginRight: 6,
    flexShrink: 0,
  }),
  toggleBtn: (installed: boolean, busy: boolean) => ({
    padding: '6px 16px',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700 as const,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
    backgroundColor: installed ? '#dc2626' : '#059669',
    color: '#fff',
    transition: 'all 0.2s',
    minWidth: 90,
  }),
}

// ── Helpers ──────────────────────────────────────────────────

function resolveModuleDeps(selected: string[], all: ModuleDefinition[]): string[] {
  const set = new Set(selected)
  let changed = true
  while (changed) {
    changed = false
    for (const m of all) {
      if (set.has(m.key) && m.dependsOn) {
        for (const dep of m.dependsOn) {
          if (!set.has(dep)) { set.add(dep); changed = true }
        }
      }
    }
  }
  return Array.from(set)
}

async function safeJson(res: Response) {
  try { return JSON.parse(await res.text()) } catch { return null }
}

async function fetchRetry(url: string, init: RequestInit, retries = 3, delay = 2000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, init)
      if (res.status === 404 && i < retries - 1) { await new Promise(r => setTimeout(r, delay)); continue }
      return res
    } catch (err) {
      if (i < retries - 1) { await new Promise(r => setTimeout(r, delay)); continue }
      throw err
    }
  }
  return fetch(url, init)
}

// ── JAR Upload Sub-component ─────────────────────────────────

interface BridgeInfo { port: number; pid: number; status: string; jdbcUrl?: string }
interface ServerInfo { running: boolean; port: number; pid: number }

function JarUploadInline({ dialect, jarEndpoint, dbConfig }: {
  dialect: Dialect; jarEndpoint: string; dbConfig: DbConfig
}) {
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState<string | null>(null) // tracks which action is loading
  const [bridgePort, setBridgePort] = useState<number | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [jarStatus, setJarStatus] = useState<{ hasJar: boolean; jarFile: string | null } | null>(null)
  const [bridges, setBridges] = useState<BridgeInfo[]>([])
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)

  const loadStatus = useCallback(() => {
    fetch(jarEndpoint)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          const s = data.dialects?.find((d: { dialect: string }) => d.dialect === dialect)
          setJarStatus(s || { hasJar: false, jarFile: null })
          setBridges(data.bridges || [])
          if (data.hsqldbServer) setServerInfo(data.hsqldbServer)
          else setServerInfo(null)
          const active = (data.bridges || []).find((b: BridgeInfo) => b.status === 'active')
          if (active) setBridgePort(active.port)
          else setBridgePort(null)
        }
      })
      .catch(() => {})
  }, [dialect, jarEndpoint])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.name.endsWith('.jar')) return
    setUploading(true)
    setMessage(null)
    try {
      const fd = new FormData()
      fd.append('jar', file)
      const res = await fetch(jarEndpoint, { method: 'POST', body: fd })
      const result = await res.json()
      if (result.ok) {
        setMessage({ ok: true, text: `${result.fileName} uploade` })
        setJarStatus({ hasJar: true, jarFile: result.fileName })
      } else {
        setMessage({ ok: false, text: result.error || 'Erreur' })
      }
    } catch {
      setMessage({ ok: false, text: 'Erreur reseau' })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const patchAction = async (payload: Record<string, unknown>, actionLabel: string) => {
    setLoading(actionLabel)
    setMessage(null)
    try {
      const res = await fetch(jarEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (result.ok) {
        setMessage({ ok: true, text: result.message || actionLabel + ' OK' })
        if (result.port && payload.action === 'start') setBridgePort(result.port)
        if (payload.action === 'stop') setBridgePort(null)
      } else {
        setMessage({ ok: false, text: result.error || 'Echec ' + actionLabel })
      }
      loadStatus()
    } catch {
      setMessage({ ok: false, text: 'Erreur reseau' })
    } finally {
      setLoading(null)
    }
  }

  const isHsqldb = dialect === 'hsqldb'
  const btnSmall = (color: string, disabled?: boolean): React.CSSProperties => ({
    ...S.btn('primary', disabled), fontSize: 12, padding: '6px 14px',
    backgroundColor: disabled ? '#9ca3af' : color, cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 6, border: 'none', color: '#fff', fontWeight: 600,
  })

  return (
    <div style={S.jarBox}>
      {/* ── Row 1: JAR status ── */}
      <div style={S.flex(8)}>
        <span style={S.jarTitle}>Driver JDBC</span>
        {jarStatus?.hasJar ? (
          <span style={{ ...S.badge('installed'), marginLeft: 0 }}>{jarStatus.jarFile}</span>
        ) : (
          <span style={{ fontSize: 12, color: '#6b7280' }}>Aucun JAR installe</span>
        )}
      </div>

      {/* ── Row 2: Upload button ── */}
      <div style={{ marginTop: 8 }}>
        <label style={{ ...S.btn('primary', uploading), cursor: uploading ? 'wait' : 'pointer', fontSize: 12, padding: '6px 12px' }}>
          {uploading ? 'Upload...' : 'Uploader un .jar'}
          <input type="file" accept=".jar" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>Ex: hsqldb*.jar, ojdbc*.jar</span>
      </div>

      {/* ── Row 3: HSQLDB Server control ── */}
      {isHsqldb && jarStatus?.hasJar && (
        <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#fef9c3', borderRadius: 6, border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
            Serveur HSQLDB
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>
              (port SGBD : {dbConfig.port || 9001})
            </span>
            {serverInfo?.running && (
              <span style={{ fontWeight: 400, color: '#059669', marginLeft: 8 }}>
                En marche sur port {serverInfo.port}{serverInfo.pid > 0 ? ` — PID ${serverInfo.pid}` : ''}
              </span>
            )}
            {!serverInfo?.running && (
              <span style={{ fontWeight: 400, color: '#dc2626', marginLeft: 8 }}>Arrete</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={btnSmall('#059669', loading === 'start-server' || serverInfo?.running)}
              onClick={() => patchAction({ action: 'start-server', dialect, name: dbConfig.name, host: dbConfig.host, port: dbConfig.port || 9001 }, 'start-server')}
              disabled={loading === 'start-server' || !!serverInfo?.running}
            >
              {loading === 'start-server' ? 'Demarrage...' : `Demarrer le serveur (port ${dbConfig.port || 9001})`}
            </button>
            <button
              style={btnSmall('#dc2626', loading === 'stop-server' || !serverInfo?.running)}
              onClick={() => patchAction({ action: 'stop-server', port: serverInfo?.port || dbConfig.port || 9001 }, 'stop-server')}
              disabled={loading === 'stop-server' || !serverInfo?.running}
            >
              {loading === 'stop-server' ? 'Arret...' : 'Arreter le serveur'}
            </button>
          </div>
        </div>
      )}

      {/* ── Row 4: Bridge JDBC control ── */}
      {jarStatus?.hasJar && (
        <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>
            Bridge JDBC
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>
              (port bridge : {bridgePort || 8765})
            </span>
            {bridgePort && (
              <span style={{ fontWeight: 400, color: '#059669', marginLeft: 8 }}>
                Actif sur port {bridgePort}
              </span>
            )}
            {!bridgePort && bridges.length === 0 && (
              <span style={{ fontWeight: 400, color: '#dc2626', marginLeft: 8 }}>Inactif</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: bridges.length > 0 ? 8 : 0 }}>
            <button
              style={btnSmall('#059669', loading === 'start-bridge' || bridges.length > 0)}
              onClick={() => patchAction({ action: 'start', dialect, ...dbConfig }, 'start-bridge')}
              disabled={loading === 'start-bridge' || bridges.length > 0}
            >
              {loading === 'start-bridge' ? 'Lancement...' : `Lancer le bridge (SGBD ${dbConfig.host || 'localhost'}:${dbConfig.port || 9001})`}
            </button>
          </div>
          {/* Bridge list */}
          {bridges.map(b => (
            <div key={b.port} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: b.status === 'active' ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
              <span style={{ color: '#374151', fontFamily: 'monospace', fontSize: 11 }}>
                Bridge port :{b.port} {b.pid > 0 ? `(PID ${b.pid})` : ''} {b.jdbcUrl ? `— ${b.jdbcUrl}` : ''}
              </span>
              <button
                style={{ ...btnSmall('#dc2626', loading === `kill-${b.port}`), fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
                onClick={() => patchAction({ action: 'stop', port: b.port, pid: b.pid }, `kill-${b.port}`)}
                disabled={loading === `kill-${b.port}`}
              >
                {loading === `kill-${b.port}` ? '...' : 'Kill'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Message ── */}
      {message && (
        <p style={{ fontSize: 12, color: message.ok ? '#059669' : '#dc2626', marginTop: 8 }}>{message.text}</p>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export default function SetupWizard({
  t: tProp,
  onComplete,
  endpoints = {},
  dbNamePrefix = 'mydb',
  persistState = true,
}: SetupWizardProps) {
  const t = tProp || ((k: string) => k)

  // Modules step is only shown if detectModules endpoint is explicitly provided
  const hasModulesStep = !!endpoints.detectModules
  const STEPS = hasModulesStep
    ? ALL_STEPS
    : ALL_STEPS.filter(s => s !== 'modules')

  const ep = {
    detectModules: endpoints.detectModules || '',
    testDb: endpoints.testDb || '/api/setup/test-db',
    installModules: endpoints.installModules || '',
    install: endpoints.install || '/api/setup/install',
    uploadJar: endpoints.uploadJar || '/api/setup/upload-jar',
    wireModule: endpoints.wireModule || '',
    seed: endpoints.seed || '',
  }

  // --- State ---
  const [currentStep, setCurrentStep] = useState(0)
  const [dialect, setDialect] = useState<Dialect>('mongodb')
  const [dbConfig, setDbConfig] = useState<DbConfig>({ ...DIALECT_DEFAULTS.mongodb, name: `${dbNamePrefix}_prod` })
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; error?: string; dbVersion?: string } | null>(null)
  const [dbTesting, setDbTesting] = useState(false)
  const [adminConfig, setAdminConfig] = useState<AdminConfig>({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' })
  const [seedOptions, setSeedOptions] = useState<SeedOptions>({ activities: true, demoUsers: false, demoData: false })
  const [availableModules, setAvailableModules] = useState<ModuleDefinition[]>([])
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [detectedModules, setDetectedModules] = useState<string[]>([])
  const [modulesDetected, setModulesDetected] = useState(false)
  const [createIfNotExists, setCreateIfNotExists] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installResult, setInstallResult] = useState<{ ok: boolean; needsRestart?: boolean; error?: string } | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Wire modules
  interface WireModule { name: string; source: string; package: string; version: string; type: string; installed: boolean }
  const [wireModules, setWireModules] = useState<WireModule[]>([])
  const [wireLoading, setWireLoading] = useState(false)
  const [wireBusy, setWireBusy] = useState<string | null>(null)
  const [wireMessage, setWireMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const step: Step = STEPS[currentStep]

  // --- Persist / Restore ---
  useEffect(() => {
    if (!persistState) { setHydrated(true); return }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.currentStep != null) setCurrentStep(saved.currentStep)
        if (saved.dialect) setDialect(saved.dialect)
        if (saved.dbConfig) setDbConfig(saved.dbConfig)
        if (saved.adminConfig) setAdminConfig(saved.adminConfig)
        if (saved.seedOptions) setSeedOptions(saved.seedOptions)
        if (saved.selectedModules?.length) setSelectedModules(saved.selectedModules)
      }
    } catch {}
    setHydrated(true)
  }, [persistState])

  useEffect(() => {
    if (!hydrated || !persistState) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ currentStep, dialect, dbConfig, adminConfig, seedOptions, selectedModules }))
    } catch {}
  }, [hydrated, persistState, currentStep, dialect, dbConfig, adminConfig, seedOptions, selectedModules])

  // --- Detect modules (only if endpoint is provided) ---
  useEffect(() => {
    if (!ep.detectModules) {
      setModulesDetected(true)
      return
    }
    fetch(ep.detectModules)
      .then(r => r.json())
      .then((data: { modules: ModuleDefinition[]; installed: string[] }) => {
        if (data.modules) setAvailableModules(data.modules)
        if (data.installed) setDetectedModules(data.installed)
        if (selectedModules.length === 0) {
          const mods = data.modules || []
          const pre = new Set([
            ...mods.filter(m => m.required || m.default).map(m => m.key),
            ...(data.installed || []),
          ])
          setSelectedModules(Array.from(pre))
        }
        setModulesDetected(true)
      })
      .catch(() => setModulesDetected(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Module toggle ---
  const toggleModule = useCallback((key: string) => {
    const mod = availableModules.find(m => m.key === key)
    if (!mod || mod.required) return
    setSelectedModules(prev => {
      if (prev.includes(key)) {
        const toRemove = new Set([key])
        let changed = true
        while (changed) {
          changed = false
          for (const m of availableModules) {
            if (toRemove.has(m.key) || m.required) continue
            if (m.dependsOn?.some(dep => toRemove.has(dep)) && prev.includes(m.key)) {
              toRemove.add(m.key); changed = true
            }
          }
        }
        return prev.filter(k => !toRemove.has(k))
      } else {
        return resolveModuleDeps([...prev, key], availableModules)
      }
    })
  }, [availableModules])

  // --- Wire modules (load after installation success, only if endpoint provided) ---
  const loadWireModules = useCallback(async () => {
    if (!ep.wireModule) return
    setWireLoading(true)
    try {
      const res = await fetch(ep.wireModule)
      const data = await res.json()
      if (data.data) setWireModules(data.data)
    } catch {
      // wire endpoint may not exist
    } finally {
      setWireLoading(false)
    }
  }, [ep.wireModule])

  // Auto-load wire modules on modules step and after install
  useEffect(() => {
    if (step === 'modules' || installResult?.ok) loadWireModules()
  }, [step, installResult?.ok, loadWireModules])

  const handleWireToggle = async (mod: WireModule) => {
    const action = mod.installed ? 'uninstall' : 'install'
    setWireBusy(mod.name)
    setWireMessage(null)
    try {
      const res = await fetch(ep.wireModule, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, module: mod.name }),
      })
      const data = await res.json()
      if (data.data?.ok) {
        setWireMessage({
          type: 'success',
          text: action === 'install'
            ? `${mod.package} cable avec succes`
            : `${mod.package} decable avec succes`,
        })
        await loadWireModules()
      } else {
        const errMsg = data.error?.message || 'Erreur'
        setWireMessage({ type: 'error', text: `${action} ${mod.package}: ${errMsg}` })
      }
    } catch {
      setWireMessage({ type: 'error', text: 'Erreur reseau' })
    } finally {
      setWireBusy(null)
    }
  }

  // --- Dialect select ---
  function selectDialect(d: Dialect) {
    setDialect(d)
    const defaults = DIALECT_DEFAULTS[d]
    setDbConfig({ ...defaults, name: defaults.name === 'mydb' ? dbNamePrefix : defaults.name === 'mydb_prod' ? `${dbNamePrefix}_prod` : defaults.name.replace('mydb', dbNamePrefix) })
    setDbTestResult(null)
  }

  // --- Test DB ---
  async function testDb() {
    setDbTesting(true)
    setDbTestResult(null)
    try {
      const res = await fetch(ep.testDb, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dialect, ...dbConfig, createIfNotExists }),
      })
      const data = await res.json()
      if (data.ok) {
        setDbTestResult(data)
      } else {
        const err = typeof data.error === 'string' ? data.error : data.error?.message || 'Connexion echouee'
        setDbTestResult({ ok: false, error: err })
      }
    } catch (err: unknown) {
      setDbTestResult({ ok: false, error: err instanceof Error ? err.message : 'Erreur' })
    }
    setDbTesting(false)
  }

  // --- Install ---
  async function runInstallation() {
    setInstalling(true)
    setInstallResult(null)
    try {
      const modRes = await fetch(ep.installModules, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: selectedModules }),
      })
      if (!modRes.ok) {
        const d = await safeJson(modRes)
        setInstallResult({ ok: false, error: d?.error?.message || 'Erreur installation modules' })
        setInstalling(false)
        return
      }
      const res = await fetchRetry(ep.install, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dialect,
          db: dbConfig,
          admin: { email: adminConfig.email, password: adminConfig.password, firstName: adminConfig.firstName, lastName: adminConfig.lastName },
          seed: seedOptions,
          modules: selectedModules,
        }),
      })
      const data = await safeJson(res)
      if (res.ok && data) {
        setInstallResult({ ok: true, needsRestart: data.data?.needsRestart })
      } else {
        setInstallResult({ ok: false, error: data?.error?.message || `Erreur installation (HTTP ${res.status})` })
      }
    } catch (err: unknown) {
      setInstallResult({ ok: false, error: err instanceof Error ? err.message : 'Erreur' })
    }
    setInstalling(false)
  }

  // --- Navigation ---
  function canGoNext(): boolean {
    switch (step) {
      case 'welcome': return true
      case 'modules': return selectedModules.length > 0
      case 'dialect': return true
      case 'database':
        if (dialect === 'sqlite' || dialect === 'spanner') return dbConfig.name.trim() !== ''
        return dbTestResult?.ok === true
      case 'admin':
        return adminConfig.firstName.trim() !== '' && adminConfig.lastName.trim() !== '' &&
          adminConfig.email.trim() !== '' && adminConfig.password.length >= 6 &&
          adminConfig.password === adminConfig.confirmPassword
      case 'summary': return false
    }
  }

  function goNext() { if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1) }
  function goBack() { if (currentStep > 0) setCurrentStep(currentStep - 1) }

  function dbSummaryLabel(): string {
    if (dialect === 'sqlite') return `SQLite — ./data/${dbConfig.name}.db`
    if (dialect === 'spanner') return `Cloud Spanner — ${dbConfig.name}`
    const info = DIALECT_INFO.find(d => d.key === dialect)
    return `${info?.name || dialect} — ${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`
  }

  function handleComplete() {
    if (persistState) {
      try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
    }
    onComplete?.()
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={S.wrapper}>
      <div style={S.container}>

        {/* ─── Stepper ─── */}
        <div style={S.stepperRow}>
          {STEPS.map((s, i) => (
            <div key={s} style={S.flex(8)}>
              <div style={S.stepCircle(i < currentStep ? 'done' : i === currentStep ? 'current' : 'future')}>
                {i < currentStep ? '✓' : i + 1}
              </div>
              <span style={S.stepLabel(i === currentStep)}>{t(`setup.steps.${s}`)}</span>
              {i < STEPS.length - 1 && <div style={S.stepLine(i < currentStep)} />}
            </div>
          ))}
        </div>

        <div style={S.card}>

          {/* ─── Step 1: Welcome ─── */}
          {step === 'welcome' && (
            <div style={S.center}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 40 }}>
                🛡️
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{t('setup.welcome.title')}</h2>
              <p style={{ color: '#6b7280', marginBottom: 24 }}>{t('setup.welcome.description')}</p>
              <button style={S.btn('lg')} onClick={goNext}>
                {t('setup.welcome.start')} →
              </button>
            </div>
          )}

          {/* ─── Step 2: Modules ─── */}
          {step === 'modules' && (
            <div>
              <div style={S.sectionHeader}>
                <span style={S.sectionIcon}>📦</span>
                <div>
                  <div style={S.sectionTitle}>{t('setup.modules.title')}</div>
                  <div style={S.sectionDesc}>{t('setup.modules.description')}</div>
                </div>
              </div>

              <div style={S.grid2}>
                {availableModules.map(mod => {
                  const isSelected = selectedModules.includes(mod.key)
                  const isDetected = detectedModules.includes(mod.key)
                  return (
                    <div
                      key={mod.key}
                      style={S.moduleCard(isSelected, !!mod.required)}
                      onClick={() => toggleModule(mod.key)}
                    >
                      <div style={S.moduleHeader}>
                        <div style={S.moduleLeft}>
                          <span style={{ fontSize: 20 }}>{mod.icon}</span>
                          <span style={S.moduleName}>{mod.label}</span>
                        </div>
                        <div style={S.moduleBadges}>
                          {mod.discovered && <span style={S.badge('new')}>Nouveau</span>}
                          {isDetected && <span style={S.badge('installed')}>{t('setup.modules.installed')}</span>}
                          {mod.required && <span style={S.badge('required')}>{t('setup.modules.required')}</span>}
                          <input type="checkbox" checked={isSelected} disabled={mod.required} readOnly style={S.checkbox} />
                        </div>
                      </div>
                      <div style={S.moduleDesc}>{mod.description}</div>
                      {mod.dependsOn?.length ? (
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Depend de : {mod.dependsOn.join(', ')}</div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/* ─── Wire Module Grid (ON/OFF) ─── */}
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🔌</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Cablage des modules</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      Cablez les modules pour injecter schemas, routes API, pages et permissions.
                    </div>
                  </div>
                </div>

                {wireMessage && (
                  <div style={S.alert(wireMessage.type)}>{wireMessage.text}</div>
                )}

                {wireLoading ? (
                  <div style={{ textAlign: 'center', padding: 12, color: '#6b7280' }}>Chargement des manifestes...</div>
                ) : wireModules.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 12, color: '#9ca3af', fontSize: 13 }}>
                    Aucun manifeste de cablage trouve. Les manifestes seront disponibles apres l'installation.
                  </div>
                ) : (
                  <div style={S.wireGrid}>
                    {wireModules.map((mod) => (
                      <div key={mod.name} style={S.wireCard(mod.installed)}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={S.wireStatus(mod.installed)} />
                            <span style={{ fontWeight: 700, fontSize: 14 }}>@mostajs/{mod.name}</span>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                            backgroundColor: mod.type === 'business' ? '#dbeafe' : '#f3e8ff',
                            color: mod.type === 'business' ? '#1e40af' : '#6b21a8',
                          }}>
                            {mod.type}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                          v{mod.version}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: mod.installed ? '#059669' : '#6b7280' }}>
                            {mod.installed ? 'ON' : 'OFF'}
                          </span>
                          <button
                            style={S.toggleBtn(mod.installed, wireBusy === mod.name)}
                            onClick={(e) => { e.stopPropagation(); handleWireToggle(mod) }}
                            disabled={wireBusy !== null}
                          >
                            {wireBusy === mod.name
                              ? (mod.installed ? 'Decablage...' : 'Cablage...')
                              : (mod.installed ? 'Desinstaller' : 'Installer')
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={S.navRow}>
                <button style={S.btn('outline')} onClick={goBack}>← {t('setup.back')}</button>
                <button style={S.btn('primary', !canGoNext())} onClick={goNext} disabled={!canGoNext()}>{t('setup.next')} →</button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Dialect ─── */}
          {step === 'dialect' && (
            <div>
              <div style={S.sectionHeader}>
                <span style={S.sectionIcon}>💾</span>
                <div>
                  <div style={S.sectionTitle}>{t('setup.dialect.title')}</div>
                  <div style={S.sectionDesc}>{t('setup.dialect.description')}</div>
                </div>
              </div>

              <div style={S.grid3}>
                {DIALECT_INFO.map(d => (
                  <div
                    key={d.key}
                    style={S.dialectCard(dialect === d.key, !!d.premium)}
                    onClick={() => !d.premium && selectDialect(d.key)}
                    title={d.premium ? `${d.name} — disponible en version Premium` : d.name}
                  >
                    <div style={S.dialectIcon}>{d.icon}</div>
                    <div style={S.dialectName}>
                      {d.name}
                    </div>
                    {d.premium && (
                      <span style={{ ...S.badge('premium'), marginLeft: 0, marginTop: 4 }}>Premium</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={S.navRow}>
                <button style={S.btn('outline')} onClick={goBack}>← {t('setup.back')}</button>
                <button style={S.btn('primary')} onClick={goNext}>{t('setup.next')} →</button>
              </div>
            </div>
          )}

          {/* ─── Step 4: Database ─── */}
          {step === 'database' && (
            <div>
              <div style={S.sectionHeader}>
                <span style={S.sectionIcon}>🗄️</span>
                <div>
                  <div style={S.sectionTitle}>{t('setup.database.title')}</div>
                  <div style={S.sectionDesc}>{t('setup.database.description')}</div>
                </div>
              </div>

              {dialect === 'sqlite' ? (
                <div style={S.formGroup}>
                  <label style={S.label}>{t('setup.database.name')}</label>
                  <input style={S.input} value={dbConfig.name}
                    onChange={e => { setDbConfig({ ...dbConfig, name: e.target.value }); setDbTestResult(null) }}
                    placeholder={dbNamePrefix}
                  />
                  <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    {t('setup.database.sqliteInfo')} <code style={{ fontFamily: 'monospace', backgroundColor: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>./data/{dbConfig.name}.db</code>
                  </p>
                </div>
              ) : dialect === 'spanner' ? (
                <div style={S.formGroup}>
                  <label style={S.label}>{t('setup.database.spannerPath')}</label>
                  <input style={S.input} value={dbConfig.name}
                    onChange={e => { setDbConfig({ ...dbConfig, name: e.target.value }); setDbTestResult(null) }}
                    placeholder="my-project/my-instance/mydb"
                  />
                  <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{t('setup.database.spannerInfo')}</p>
                </div>
              ) : (
                <>
                  <div style={S.formRow}>
                    <div style={S.formGroup}>
                      <label style={S.label}>{t('setup.database.host')}</label>
                      <input style={S.input} value={dbConfig.host}
                        onChange={e => { setDbConfig({ ...dbConfig, host: e.target.value }); setDbTestResult(null) }}
                      />
                    </div>
                    <div style={S.formGroup}>
                      <label style={S.label}>{t('setup.database.port')}</label>
                      <input style={S.input} type="number" value={dbConfig.port}
                        onChange={e => { setDbConfig({ ...dbConfig, port: parseInt(e.target.value) || 0 }); setDbTestResult(null) }}
                      />
                    </div>
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>{t('setup.database.name')}</label>
                    <input style={S.input} value={dbConfig.name}
                      onChange={e => { setDbConfig({ ...dbConfig, name: e.target.value }); setDbTestResult(null) }}
                    />
                  </div>
                  <div style={S.formRow}>
                    <div style={S.formGroup}>
                      <label style={S.label}>{t('setup.database.user')}</label>
                      <input style={S.input} value={dbConfig.user}
                        onChange={e => { setDbConfig({ ...dbConfig, user: e.target.value }); setDbTestResult(null) }}
                        placeholder={dialect === 'hsqldb' ? 'SA' : ''}
                      />
                    </div>
                    <div style={S.formGroup}>
                      <label style={S.label}>{t('setup.database.password')}</label>
                      <input style={S.input} type="password" value={dbConfig.password}
                        onChange={e => { setDbConfig({ ...dbConfig, password: e.target.value }); setDbTestResult(null) }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* HSQLDB server hint */}
              {dialect === 'hsqldb' && (
                <div style={{ ...S.alert('warning'), marginTop: 12, fontSize: 12 }}>
                  <strong>Prerequis :</strong> Le serveur HSQLDB doit etre lance avant le bridge.<br/>
                  <code style={{ fontFamily: 'monospace', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginTop: 4, fontSize: 11 }}>
                    java -cp hsqldb*.jar org.hsqldb.server.Server --database.0 file:./data/{dbConfig.name} --dbname.0 {dbConfig.name}
                  </code>
                </div>
              )}

              {/* Driver hint */}
              {dialect !== 'mongodb' && dialect !== 'sqlite' && (
                <div style={{ ...S.alert('warning'), marginTop: 12 }}>
                  {t('setup.database.driverHint')}{' '}
                  <code style={{ fontFamily: 'monospace', backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: 3 }}>{DRIVER_HINTS[dialect]}</code>
                </div>
              )}

              {/* JAR upload for JDBC dialects */}
              {JDBC_DIALECTS.includes(dialect) && (
                <JarUploadInline dialect={dialect} jarEndpoint={ep.uploadJar} dbConfig={dbConfig} />
              )}

              {/* Create DB if not exists */}
              {dialect !== 'sqlite' && dialect !== 'spanner' && (
                <div style={{ ...S.checkRow, marginTop: 12, padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                  <input type="checkbox" style={S.checkbox}
                    checked={createIfNotExists}
                    onChange={e => setCreateIfNotExists(e.target.checked)} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t('setup.database.createIfNotExists')}</div>
                    <div style={{ fontSize: 12, color: '#92400e' }}>{t('setup.database.createIfNotExistsDesc')}</div>
                  </div>
                </div>
              )}

              {/* Test button */}
              {dialect !== 'sqlite' && dialect !== 'spanner' && (
                <div style={{ ...S.flex(16), marginTop: 16 }}>
                  <button style={S.btn('outline', dbTesting)} onClick={testDb} disabled={dbTesting}>
                    {dbTesting ? '⏳ ' : '🗄️ '}
                    {dbTesting ? t('setup.database.testing') : t('setup.database.test')}
                  </button>
                  {dbTestResult && (
                    <span style={{ fontSize: 13, color: dbTestResult.ok ? '#059669' : '#dc2626' }}>
                      {dbTestResult.ok
                        ? `✅ ${t('setup.database.success')}${dbTestResult.dbVersion ? ` (v${dbTestResult.dbVersion})` : ''}`
                        : `❌ ${t('setup.database.error')}: ${dbTestResult.error}`
                      }
                    </span>
                  )}
                </div>
              )}

              <div style={S.navRow}>
                <button style={S.btn('outline')} onClick={goBack}>← {t('setup.back')}</button>
                <button style={S.btn('primary', !canGoNext())} onClick={goNext} disabled={!canGoNext()}>{t('setup.next')} →</button>
              </div>
            </div>
          )}

          {/* ─── Step 5: Admin ─── */}
          {step === 'admin' && (
            <div>
              <div style={S.sectionHeader}>
                <span style={S.sectionIcon}>👤</span>
                <div>
                  <div style={S.sectionTitle}>{t('setup.admin.title')}</div>
                  <div style={S.sectionDesc}>{t('setup.admin.description')}</div>
                </div>
              </div>

              <div style={S.formRow}>
                <div style={S.formGroup}>
                  <label style={S.label}>{t('setup.admin.firstName')}</label>
                  <input style={S.input} value={adminConfig.firstName}
                    onChange={e => setAdminConfig({ ...adminConfig, firstName: e.target.value })} />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>{t('setup.admin.lastName')}</label>
                  <input style={S.input} value={adminConfig.lastName}
                    onChange={e => setAdminConfig({ ...adminConfig, lastName: e.target.value })} />
                </div>
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>{t('setup.admin.email')}</label>
                <input style={S.input} type="email" value={adminConfig.email}
                  onChange={e => setAdminConfig({ ...adminConfig, email: e.target.value })}
                  placeholder="admin@example.com" />
              </div>
              <div style={S.formRow}>
                <div style={S.formGroup}>
                  <label style={S.label}>{t('setup.admin.password')}</label>
                  <input style={S.input} type="password" value={adminConfig.password}
                    onChange={e => setAdminConfig({ ...adminConfig, password: e.target.value })} />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>{t('setup.admin.confirmPassword')}</label>
                  <input style={S.input} type="password" value={adminConfig.confirmPassword}
                    onChange={e => setAdminConfig({ ...adminConfig, confirmPassword: e.target.value })} />
                </div>
              </div>
              {adminConfig.password && adminConfig.confirmPassword && adminConfig.password !== adminConfig.confirmPassword && (
                <p style={{ fontSize: 13, color: '#dc2626' }}>{t('setup.admin.passwordMismatch')}</p>
              )}

              <div style={S.navRow}>
                <button style={S.btn('outline')} onClick={goBack}>← {t('setup.back')}</button>
                <button style={S.btn('primary', !canGoNext())} onClick={goNext} disabled={!canGoNext()}>{t('setup.next')} →</button>
              </div>
            </div>
          )}

          {/* ─── Step 6: Summary ─── */}
          {step === 'summary' && (
            <div>
              <div style={S.sectionHeader}>
                <span style={S.sectionIcon}>⚙️</span>
                <div>
                  <div style={S.sectionTitle}>{t('setup.summary.title')}</div>
                  <div style={S.sectionDesc}>{t('setup.summary.description')}</div>
                </div>
              </div>

              {/* DB summary */}
              <div style={S.summaryCard}>
                <div style={S.summaryTitle}>{t('setup.summary.dbConfig')}</div>
                <div style={S.summaryText}>
                  <span style={{ fontFamily: 'monospace' }}>{dbSummaryLabel()}</span>
                  {dialect !== 'sqlite' && dbConfig.user && <span style={{ display: 'block', marginTop: 4 }}>Utilisateur: {dbConfig.user}</span>}
                </div>
              </div>

              {/* Admin summary */}
              <div style={S.summaryCard}>
                <div style={S.summaryTitle}>{t('setup.summary.adminConfig')}</div>
                <div style={S.summaryText}>
                  <div>{adminConfig.firstName} {adminConfig.lastName}</div>
                  <div>{adminConfig.email}</div>
                </div>
              </div>

              {/* Modules summary */}
              <div style={S.summaryCard}>
                <div style={S.summaryTitle}>{t('setup.modules.title')}</div>
                <div style={S.flexWrap}>
                  {selectedModules.map(key => {
                    const mod = availableModules.find(m => m.key === key)
                    return mod ? (
                      <span key={key} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 12, backgroundColor: '#f0f9ff', color: '#0369a1',
                        border: '1px solid #bae6fd', borderRadius: 16, padding: '4px 10px',
                      }}>
                        {mod.icon} {mod.label}
                      </span>
                    ) : null
                  })}
                </div>
              </div>

              {/* Seed options */}
              <div style={S.summaryCard}>
                <div style={S.summaryTitle}>{t('setup.summary.seedTitle')}</div>
                <p style={{ ...S.summaryText, marginBottom: 12 }}>{t('setup.summary.seedInfo')}</p>
                <div style={S.checkRow}>
                  <input type="checkbox" style={S.checkbox}
                    checked={seedOptions.activities}
                    onChange={e => setSeedOptions({ ...seedOptions, activities: e.target.checked, demoData: e.target.checked ? seedOptions.demoData : false })}
                    disabled={installing || !!installResult?.ok} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t('setup.summary.seedActivities')}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{t('setup.summary.seedActivitiesDesc')}</div>
                  </div>
                </div>
                <div style={S.checkRow}>
                  <input type="checkbox" style={S.checkbox}
                    checked={seedOptions.demoUsers}
                    onChange={e => setSeedOptions({ ...seedOptions, demoUsers: e.target.checked })}
                    disabled={installing || !!installResult?.ok} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t('setup.summary.seedDemoUsers')}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{t('setup.summary.seedDemoUsersDesc')}</div>
                  </div>
                </div>
                <div style={S.checkRow}>
                  <input type="checkbox" style={S.checkbox}
                    checked={seedOptions.demoData}
                    onChange={e => setSeedOptions({ ...seedOptions, demoData: e.target.checked, activities: e.target.checked ? true : seedOptions.activities })}
                    disabled={installing || !!installResult?.ok} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t('setup.summary.seedDemoData')}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{t('setup.summary.seedDemoDataDesc')}</div>
                  </div>
                </div>
              </div>

              {/* Install result */}
              {installResult && (
                <div style={S.alert(installResult.ok ? 'success' : 'error')}>
                  {installResult.ok ? (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>✅ {t('setup.summary.success')}</div>
                      <div>{t('setup.summary.successDesc')}</div>
                      {installResult.needsRestart && (
                        <div style={{ color: '#92400e', fontWeight: 500, marginTop: 8 }}>{t('setup.summary.needsRestart')}</div>
                      )}
                    </>
                  ) : (
                    <div>❌ {installResult.error}</div>
                  )}
                </div>
              )}

              {/* Wire Modules — shown after successful installation */}
              {installResult?.ok && (
                <div style={{ ...S.summaryCard, marginTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>🔌</span>
                    <div style={S.summaryTitle}>Cablage des modules</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                    Cablez les modules pour injecter schemas, routes API, pages et permissions dans l'application.
                  </div>

                  {wireMessage && (
                    <div style={S.alert(wireMessage.type)}>{wireMessage.text}</div>
                  )}

                  {wireLoading ? (
                    <div style={{ textAlign: 'center', padding: 12, color: '#6b7280' }}>Chargement...</div>
                  ) : wireModules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 12, color: '#9ca3af' }}>Aucun manifeste de cablage trouve</div>
                  ) : (
                    <div style={S.wireGrid}>
                      {wireModules.map((mod) => (
                        <div key={mod.name} style={S.wireCard(mod.installed)}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={S.wireStatus(mod.installed)} />
                              <span style={{ fontWeight: 700, fontSize: 14 }}>@mostajs/{mod.name}</span>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                              backgroundColor: mod.type === 'business' ? '#dbeafe' : '#f3e8ff',
                              color: mod.type === 'business' ? '#1e40af' : '#6b21a8',
                            }}>
                              {mod.type}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                            v{mod.version} — {mod.source}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: mod.installed ? '#059669' : '#6b7280' }}>
                              {mod.installed ? 'Cable' : 'Non cable'}
                            </span>
                            <button
                              style={S.toggleBtn(mod.installed, wireBusy === mod.name)}
                              onClick={() => handleWireToggle(mod)}
                              disabled={wireBusy !== null}
                            >
                              {wireBusy === mod.name
                                ? (mod.installed ? 'Decablage...' : 'Cablage...')
                                : (mod.installed ? 'Desinstaller' : 'Installer')
                              }
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={S.navRow}>
                {!installResult?.ok ? (
                  <>
                    <button style={S.btn('outline', installing)} onClick={goBack} disabled={installing}>← {t('setup.back')}</button>
                    <button style={S.btn('primary', installing)} onClick={runInstallation} disabled={installing}>
                      {installing ? '⏳ ' : '⚙️ '}
                      {installing ? t('setup.summary.installing') : t('setup.summary.install')}
                    </button>
                  </>
                ) : (
                  <div style={{ width: '100%', textAlign: 'center' }}>
                    <button style={S.btn('lg')} onClick={handleComplete}>
                      {t('setup.summary.goToLogin')} →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
