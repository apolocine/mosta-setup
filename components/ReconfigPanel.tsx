// @mostajs/setup — Reconfiguration Panel
// Author: Dr Hamid MADANI drmdh@msn.com
'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────

interface ModuleInfo {
  key: string
  packageName: string
  label: string
  description: string
  icon: string
  required?: boolean
  default?: boolean
  dependsOn?: string[]
  discovered?: boolean
}

interface DbFormData {
  host: string
  port: number
  name: string
  user: string
  password: string
}

type DialectType =
  | 'mongodb' | 'sqlite' | 'postgres' | 'mysql' | 'mariadb'
  | 'oracle' | 'mssql' | 'cockroachdb' | 'db2' | 'hana'
  | 'hsqldb' | 'spanner' | 'sybase'

interface DialectOption {
  key: DialectType
  name: string
  icon: string
  defaultPort: number
  defaultUser: string
  defaultHost: string
  requiresAuth: boolean
  premium?: boolean
  /** Dialect needs a JDBC JAR (bridge mode) */
  jdbc?: boolean
}

/** Dialects that require a JDBC bridge JAR */
const JDBC_DIALECTS: DialectType[] = ['hsqldb', 'oracle', 'db2', 'sybase', 'hana']

const DIALECTS: DialectOption[] = [
  { key: 'mongodb',     name: 'MongoDB',        icon: '🍃', defaultPort: 27017, defaultUser: '',         defaultHost: 'localhost', requiresAuth: false },
  { key: 'sqlite',      name: 'SQLite',         icon: '📄', defaultPort: 0,     defaultUser: '',         defaultHost: '',          requiresAuth: false },
  { key: 'postgres',    name: 'PostgreSQL',     icon: '🐘', defaultPort: 5432,  defaultUser: 'postgres', defaultHost: 'localhost', requiresAuth: true },
  { key: 'mysql',       name: 'MySQL',          icon: '🐬', defaultPort: 3306,  defaultUser: 'root',     defaultHost: 'localhost', requiresAuth: true },
  { key: 'mariadb',     name: 'MariaDB',        icon: '🦭', defaultPort: 3306,  defaultUser: 'root',     defaultHost: 'localhost', requiresAuth: true },
  { key: 'mssql',       name: 'SQL Server',     icon: '🟦', defaultPort: 1433,  defaultUser: 'sa',       defaultHost: 'localhost', requiresAuth: true },
  { key: 'oracle',      name: 'Oracle',         icon: '🔴', defaultPort: 1521,  defaultUser: 'system',   defaultHost: 'localhost', requiresAuth: true,  premium: true, jdbc: true },
  { key: 'cockroachdb', name: 'CockroachDB',    icon: '🪳', defaultPort: 26257, defaultUser: 'root',     defaultHost: 'localhost', requiresAuth: true },
  { key: 'db2',         name: 'IBM DB2',        icon: '🏢', defaultPort: 50000, defaultUser: 'db2inst1', defaultHost: 'localhost', requiresAuth: true,  premium: true, jdbc: true },
  { key: 'hana',        name: 'SAP HANA',       icon: '💎', defaultPort: 39013, defaultUser: 'SYSTEM',   defaultHost: 'localhost', requiresAuth: true,  premium: true, jdbc: true },
  { key: 'hsqldb',      name: 'HyperSQL',       icon: '⚡', defaultPort: 9001,  defaultUser: 'SA',       defaultHost: 'localhost', requiresAuth: false, jdbc: true },
  { key: 'spanner',     name: 'Cloud Spanner',  icon: '☁️', defaultPort: 0,     defaultUser: '',         defaultHost: '',          requiresAuth: false, premium: true },
  { key: 'sybase',      name: 'Sybase ASE',     icon: '🔷', defaultPort: 5000,  defaultUser: 'sa',       defaultHost: 'localhost', requiresAuth: true,  premium: true, jdbc: true },
]

export interface ReconfigPanelProps {
  /** API endpoint for reconfiguration (default: '/api/setup/reconfig') */
  apiEndpoint?: string
  /** API endpoint for module detection (default: '/api/setup/detect-modules') */
  detectEndpoint?: string
  /** API endpoint for JAR upload (default: '/api/setup/upload-jar') */
  jarEndpoint?: string
  /** Translate function */
  t?: (key: string) => string
  /** Called after successful DB change */
  onDbChanged?: (needsRestart: boolean) => void
  /** Called after modules update */
  onModulesChanged?: (modules: string[]) => void
  /** Whether to show seed option on DB change (default: true) */
  showSeedOption?: boolean
  /** Callback to run seed after DB change */
  onSeedRequested?: () => Promise<void>
}

// ── Styles ────────────────────────────────────────────────────

const S = {
  panel: { fontFamily: 'system-ui, sans-serif', fontSize: 14 } as const,
  section: { marginBottom: 32, padding: 24, border: '1px solid #e5e7eb', borderRadius: 12, backgroundColor: '#fff' } as const,
  sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 } as const,
  sectionDesc: { fontSize: 13, color: '#6b7280', marginBottom: 16 } as const,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 } as const,
  moduleCard: (active: boolean, required: boolean) => ({
    padding: 16,
    border: `2px solid ${active ? '#0284c7' : '#e5e7eb'}`,
    borderRadius: 8,
    backgroundColor: active ? '#f0f9ff' : '#fafafa',
    cursor: required ? 'not-allowed' : 'pointer',
    opacity: required ? 0.8 : 1,
    transition: 'all 0.2s',
  }),
  moduleHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } as const,
  moduleIcon: { fontSize: 20 } as const,
  moduleName: { fontWeight: 600, fontSize: 14 } as const,
  moduleDesc: { fontSize: 12, color: '#6b7280' } as const,
  moduleBadge: (type: 'required' | 'active' | 'dep') => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    backgroundColor: type === 'required' ? '#fef3c7' : type === 'active' ? '#d1fae5' : '#e0e7ff',
    color: type === 'required' ? '#92400e' : type === 'active' ? '#065f46' : '#3730a3',
    marginLeft: 4,
  }),
  dialectGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 } as const,
  dialectCard: (selected: boolean) => ({
    padding: 12,
    border: `2px solid ${selected ? '#0284c7' : '#e5e7eb'}`,
    borderRadius: 8,
    backgroundColor: selected ? '#f0f9ff' : '#fff',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.2s',
  }),
  dialectIcon: { fontSize: 24, marginBottom: 4 } as const,
  dialectName: { fontSize: 12, fontWeight: 600 } as const,
  formGroup: { marginBottom: 12 } as const,
  label: { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 12, color: '#374151' } as const,
  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const } as const,
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const,
  btn: (variant: 'primary' | 'secondary' | 'danger' | 'success' = 'primary') => ({
    padding: '8px 16px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor:
      variant === 'primary' ? '#0284c7' :
      variant === 'success' ? '#059669' :
      variant === 'danger' ? '#dc2626' : '#e5e7eb',
    color: variant === 'secondary' ? '#374151' : '#fff',
  }),
  alert: (type: 'success' | 'error' | 'warning' | 'info') => ({
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
    backgroundColor:
      type === 'success' ? '#d1fae5' :
      type === 'error' ? '#fee2e2' :
      type === 'warning' ? '#fef3c7' : '#dbeafe',
    color:
      type === 'success' ? '#065f46' :
      type === 'error' ? '#991b1b' :
      type === 'warning' ? '#92400e' : '#1e40af',
    border: `1px solid ${
      type === 'success' ? '#a7f3d0' :
      type === 'error' ? '#fecaca' :
      type === 'warning' ? '#fde68a' : '#bfdbfe'}`,
  }),
  checkbox: { marginRight: 8, width: 16, height: 16, cursor: 'pointer' } as const,
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: 13, cursor: 'pointer', padding: '8px 0' } as const,
  currentBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: '#d1fae5',
    color: '#065f46',
    marginLeft: 8,
  } as const,
}

// ── Component ────────────────────────────────────────────────

export default function ReconfigPanel({
  apiEndpoint = '/api/setup/reconfig',
  detectEndpoint = '/api/setup/detect-modules',
  jarEndpoint = '/api/setup/upload-jar',
  t = (k) => k,
  onDbChanged,
  onModulesChanged,
  showSeedOption = true,
  onSeedRequested,
}: ReconfigPanelProps) {
  // --- State ---
  const [loading, setLoading] = useState(true)
  const [currentDialect, setCurrentDialect] = useState('')
  const [currentModules, setCurrentModules] = useState<string[]>([])
  const [allModules, setAllModules] = useState<ModuleInfo[]>([])
  const [installedModules, setInstalledModules] = useState<string[]>([])
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set())

  // DB form
  const [selectedDialect, setSelectedDialect] = useState<DialectType>('mongodb')
  const [dbForm, setDbForm] = useState<DbFormData>({ host: 'localhost', port: 27017, name: '', user: '', password: '' })
  const [dbTesting, setDbTesting] = useState(false)
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [dbSaving, setDbSaving] = useState(false)
  const [dbMessage, setDbMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [wantSeed, setWantSeed] = useState(true)
  const [seeding, setSeeding] = useState(false)

  // JAR upload
  const [jarUploading, setJarUploading] = useState(false)
  const [jarMessage, setJarMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [jarFiles, setJarFiles] = useState<{ fileName: string; dialect: string | null; label: string | null }[]>([])
  const [jdbcStatus, setJdbcStatus] = useState<{ dialect: string; label: string; hasJar: boolean; jarFile: string | null }[]>([])

  // Bridge & Server state
  const [bridges, setBridges] = useState<{ port: number; pid: number; status: string; jdbcUrl?: string }[]>([])
  const [serverInfo, setServerInfo] = useState<{ running: boolean; port: number; pid: number } | null>(null)
  const [bridgeLoading, setBridgeLoading] = useState<string | null>(null)
  const [bridgeMessage, setBridgeMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Module saving
  const [moduleSaving, setModuleSaving] = useState(false)
  const [moduleMessage, setModuleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // --- Load current config ---
  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, modulesRes] = await Promise.all([
        fetch(apiEndpoint),
        fetch(detectEndpoint),
      ])
      const config = await configRes.json()
      const detected = await modulesRes.json()

      setCurrentDialect(config.dialect)
      setCurrentModules(config.modules || [])
      setSelectedDialect(config.dialect)
      setAllModules(detected.modules || [])
      setInstalledModules(detected.installed || [])

      // Active = modules in env or all installed if env empty
      const active = config.modules?.length
        ? new Set(config.modules as string[])
        : new Set(detected.installed as string[])
      setActiveModules(active)

      // Set DB form defaults for current dialect
      const dialectInfo = DIALECTS.find((d) => d.key === config.dialect)
      if (dialectInfo) {
        setDbForm({
          host: dialectInfo.defaultHost,
          port: dialectInfo.defaultPort,
          name: '',
          user: dialectInfo.defaultUser,
          password: '',
        })
      }
      // Load JAR status + bridges + server
      try {
        const jarRes = await fetch(jarEndpoint)
        const jarData = await jarRes.json()
        if (jarData.ok) {
          setJarFiles(jarData.jars || [])
          setJdbcStatus(jarData.dialects || [])
          setBridges(jarData.bridges || [])
          if (jarData.hsqldbServer) setServerInfo(jarData.hsqldbServer)
          else setServerInfo(null)
        }
      } catch {
        // JAR endpoint may not exist — ignore
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint, detectEndpoint, jarEndpoint])

  useEffect(() => { loadConfig() }, [loadConfig])

  // --- JAR upload ---
  const handleJarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.jar')) {
      setJarMessage({ type: 'error', text: 'Le fichier doit etre un .jar' })
      return
    }

    setJarUploading(true)
    setJarMessage(null)
    try {
      const formData = new FormData()
      formData.append('jar', file)

      const res = await fetch(jarEndpoint, { method: 'POST', body: formData })
      const result = await res.json()

      if (result.ok) {
        const msg = result.replaced
          ? `${result.fileName} uploade (remplace ${result.replaced})`
          : `${result.fileName} uploade`
        setJarMessage({ type: 'success', text: result.dialect ? `${msg} — dialect: ${result.dialect}` : msg })
        // Refresh JAR list
        const jarRes = await fetch(jarEndpoint)
        const jarData = await jarRes.json()
        if (jarData.ok) {
          setJarFiles(jarData.jars || [])
          setJdbcStatus(jarData.dialects || [])
        }
      } else {
        setJarMessage({ type: 'error', text: result.error || 'Erreur upload' })
      }
    } catch {
      setJarMessage({ type: 'error', text: 'Erreur reseau' })
    } finally {
      setJarUploading(false)
      // Reset input
      e.target.value = ''
    }
  }

  const handleJarDelete = async (fileName: string) => {
    try {
      const res = await fetch(jarEndpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      })
      const result = await res.json()
      if (result.ok) {
        setJarMessage({ type: 'success', text: `${fileName} supprime` })
        const jarRes = await fetch(jarEndpoint)
        const jarData = await jarRes.json()
        if (jarData.ok) {
          setJarFiles(jarData.jars || [])
          setJdbcStatus(jarData.dialects || [])
        }
      }
    } catch {
      // ignore
    }
  }

  // --- Dialect change ---
  const handleDialectChange = (dialect: DialectType) => {
    setSelectedDialect(dialect)
    setDbTestResult(null)
    setDbMessage(null)
    const info = DIALECTS.find((d) => d.key === dialect)
    if (info) {
      setDbForm({
        host: info.defaultHost,
        port: info.defaultPort,
        name: '',
        user: info.defaultUser,
        password: '',
      })
    }
  }

  // --- Test DB ---
  const handleTestDb = async () => {
    setDbTesting(true)
    setDbTestResult(null)
    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-db',
          dialect: selectedDialect,
          ...dbForm,
        }),
      })
      const result = await res.json()
      setDbTestResult(result)
    } catch {
      setDbTestResult({ ok: false, error: 'Erreur reseau' })
    } finally {
      setDbTesting(false)
    }
  }

  // --- Apply DB change ---
  const handleApplyDb = async () => {
    setDbSaving(true)
    setDbMessage(null)
    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change-db',
          dialect: selectedDialect,
          ...dbForm,
        }),
      })
      const result = await res.json()
      if (result.ok) {
        setCurrentDialect(selectedDialect)

        // Seed if requested
        if (wantSeed && showSeedOption && onSeedRequested) {
          setSeeding(true)
          try {
            await onSeedRequested()
            setDbMessage({ type: 'success', text: 'Base de donnees changee et seed effectue. ' + (result.needsRestart ? 'Redemarrage necessaire.' : '') })
          } catch {
            setDbMessage({ type: 'warning', text: 'Base de donnees changee mais le seed a echoue. Vous pouvez relancer le seed manuellement.' })
          } finally {
            setSeeding(false)
          }
        } else {
          setDbMessage({
            type: result.needsRestart ? 'warning' : 'success',
            text: result.needsRestart
              ? 'Base de donnees changee. Redemarrez le serveur pour appliquer.'
              : 'Base de donnees changee avec succes.',
          })
        }

        onDbChanged?.(result.needsRestart)
      } else {
        setDbMessage({ type: 'error', text: result.error || 'Erreur' })
      }
    } catch {
      setDbMessage({ type: 'error', text: 'Erreur reseau' })
    } finally {
      setDbSaving(false)
    }
  }

  // --- Toggle module ---
  const toggleModule = (key: string) => {
    const mod = allModules.find((m) => m.key === key)
    if (mod?.required) return

    setActiveModules((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        // Auto-add dependencies
        if (mod?.dependsOn) {
          for (const dep of mod.dependsOn) next.add(dep)
        }
      }
      return next
    })
  }

  // --- Save modules ---
  const handleSaveModules = async () => {
    setModuleSaving(true)
    setModuleMessage(null)
    try {
      const modules = Array.from(activeModules)
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-modules', modules }),
      })
      const result = await res.json()
      if (result.ok) {
        setCurrentModules(modules)
        setModuleMessage({
          type: 'success',
          text: result.needsRestart
            ? 'Modules mis a jour. Redemarrez le serveur pour appliquer.'
            : 'Modules mis a jour avec succes.',
        })
        onModulesChanged?.(modules)
      } else {
        setModuleMessage({ type: 'error', text: result.error || 'Erreur' })
      }
    } catch {
      setModuleMessage({ type: 'error', text: 'Erreur reseau' })
    } finally {
      setModuleSaving(false)
    }
  }

  // --- Render ---
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement de la configuration...</div>
  }

  const dialectInfo = DIALECTS.find((d) => d.key === selectedDialect)
  const isSqlite = selectedDialect === 'sqlite'

  return (
    <div style={S.panel}>
      {/* ─── Section 1: Modules ─── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          <span>📦</span> Modules actifs
        </div>
        <div style={S.sectionDesc}>
          Activez ou desactivez les modules @mostajs. Les modules requis ne peuvent pas etre desactives.
          Seuls les modules installes (dans node_modules) peuvent etre actives.
        </div>

        {moduleMessage && (
          <div style={S.alert(moduleMessage.type)}>{moduleMessage.text}</div>
        )}

        <div style={S.grid}>
          {allModules.map((mod) => {
            const isInstalled = installedModules.includes(mod.key)
            const isActive = activeModules.has(mod.key)
            const isRequired = !!mod.required

            return (
              <div
                key={mod.key}
                style={{
                  ...S.moduleCard(isActive, isRequired || !isInstalled),
                  opacity: isInstalled ? 1 : 0.5,
                }}
                onClick={() => isInstalled && toggleModule(mod.key)}
              >
                <div style={S.moduleHeader}>
                  <span style={S.moduleIcon}>{mod.icon}</span>
                  <span style={S.moduleName}>{mod.label}</span>
                  {isRequired && <span style={S.moduleBadge('required')}>requis</span>}
                  {isActive && !isRequired && <span style={S.moduleBadge('active')}>actif</span>}
                  {!isInstalled && <span style={S.moduleBadge('dep')}>non installe</span>}
                </div>
                <div style={S.moduleDesc}>{mod.description}</div>
                {mod.dependsOn?.length ? (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    Depend de : {mod.dependsOn.join(', ')}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button
            style={S.btn('primary')}
            onClick={handleSaveModules}
            disabled={moduleSaving}
          >
            {moduleSaving ? 'Enregistrement...' : 'Enregistrer les modules'}
          </button>
        </div>
      </div>

      {/* ─── Section 2: Drivers JDBC (JAR) ─── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          <span>☕</span> Drivers JDBC
        </div>
        <div style={S.sectionDesc}>
          Uploadez les fichiers JAR des drivers JDBC pour les bases de donnees enterprise.
          Les dialects JDBC (HyperSQL, Oracle, DB2, SAP HANA, Sybase) utilisent un bridge Java pour se connecter.
        </div>

        {jarMessage && (
          <div style={S.alert(jarMessage.type)}>{jarMessage.text}</div>
        )}

        {/* JDBC dialect status table */}
        {jdbcStatus.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Dialect</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Statut</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Fichier JAR</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {jdbcStatus.map((s) => (
                  <tr key={s.dialect} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{s.label}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {s.hasJar ? (
                        <span style={{ color: '#059669', fontWeight: 600, fontSize: 12 }}>Pret</span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>Non installe</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                      {s.jarFile || '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {s.hasJar && s.jarFile && (
                        <button
                          style={{ ...S.btn('danger'), padding: '3px 8px', fontSize: 11 }}
                          onClick={() => handleJarDelete(s.jarFile!)}
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label
            style={{
              ...S.btn('primary'),
              cursor: jarUploading ? 'wait' : 'pointer',
              opacity: jarUploading ? 0.6 : 1,
            }}
          >
            {jarUploading ? 'Upload en cours...' : 'Uploader un fichier .jar'}
            <input
              type="file"
              accept=".jar"
              onChange={handleJarUpload}
              disabled={jarUploading}
              style={{ display: 'none' }}
            />
          </label>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            Formats acceptes : hsqldb*.jar, ojdbc*.jar, db2jcc*.jar, ngdbc*.jar, jconn*.jar
          </span>
        </div>
      </div>

      {/* ─── Section 3: Base de donnees ─── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          <span>🗄️</span> Base de donnees
          {currentDialect && (
            <span style={S.currentBadge}>
              Actuelle : {DIALECTS.find((d) => d.key === currentDialect)?.name || currentDialect}
            </span>
          )}
        </div>
        <div style={S.sectionDesc}>
          Changez le dialecte ou les parametres de connexion. La connexion sera testee avant application.
        </div>

        {dbMessage && (
          <div style={S.alert(dbMessage.type)}>{dbMessage.text}</div>
        )}

        {/* Dialect selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...S.label, marginBottom: 8, fontSize: 13 }}>Dialecte</div>
          <div style={S.dialectGrid}>
            {DIALECTS.map((d) => (
              <div
                key={d.key}
                style={{
                  ...S.dialectCard(selectedDialect === d.key && !d.premium),
                  ...(d.premium ? { opacity: 0.45, cursor: 'not-allowed', filter: 'grayscale(0.5)' } : {}),
                }}
                onClick={() => !d.premium && handleDialectChange(d.key)}
                title={d.premium ? `${d.name} — disponible en version Premium` : d.name}
              >
                <div style={S.dialectIcon}>{d.icon}</div>
                <div style={S.dialectName}>
                  {d.name}
                  {d.key === currentDialect && <span style={{ fontSize: 9, color: '#059669' }}> (actuel)</span>}
                  {d.premium && (
                    <div style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#b45309',
                      backgroundColor: '#fef3c7',
                      padding: '1px 5px',
                      borderRadius: 4,
                      marginTop: 3,
                      display: 'inline-block',
                    }}>Premium</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Connection form */}
        {!isSqlite && (
          <div style={{ maxWidth: 500 }}>
            <div style={S.formRow}>
              <div style={S.formGroup}>
                <label style={S.label}>Hote</label>
                <input
                  style={S.input}
                  value={dbForm.host}
                  onChange={(e) => setDbForm({ ...dbForm, host: e.target.value })}
                  placeholder="localhost"
                />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Port</label>
                <input
                  style={S.input}
                  type="number"
                  value={dbForm.port}
                  onChange={(e) => setDbForm({ ...dbForm, port: Number(e.target.value) })}
                />
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Nom de la base</label>
              <input
                style={S.input}
                value={dbForm.name}
                onChange={(e) => setDbForm({ ...dbForm, name: e.target.value })}
                placeholder="ma_base_de_donnees"
              />
            </div>
            {dialectInfo?.requiresAuth && (
              <div style={S.formRow}>
                <div style={S.formGroup}>
                  <label style={S.label}>Utilisateur</label>
                  <input
                    style={S.input}
                    value={dbForm.user}
                    onChange={(e) => setDbForm({ ...dbForm, user: e.target.value })}
                  />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>Mot de passe</label>
                  <input
                    style={S.input}
                    type="password"
                    value={dbForm.password}
                    onChange={(e) => setDbForm({ ...dbForm, password: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {isSqlite && (
          <div style={S.formGroup}>
            <label style={S.label}>Nom du fichier (sans extension)</label>
            <input
              style={{ ...S.input, maxWidth: 300 }}
              value={dbForm.name}
              onChange={(e) => setDbForm({ ...dbForm, name: e.target.value })}
              placeholder="ma_base"
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Le fichier sera cree dans ./data/{dbForm.name || 'ma_base'}.db
            </div>
          </div>
        )}

        {/* Test result */}
        {dbTestResult && (
          <div style={S.alert(dbTestResult.ok ? 'success' : 'error')}>
            {dbTestResult.ok ? 'Connexion reussie !' : `Echec : ${dbTestResult.error}`}
          </div>
        )}

        {/* Seed option */}
        {showSeedOption && onSeedRequested && (selectedDialect !== currentDialect || dbForm.name) && (
          <div style={{ marginBottom: 12, padding: 12, backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <label style={S.checkboxLabel}>
              <input
                type="checkbox"
                checked={wantSeed}
                onChange={(e) => setWantSeed(e.target.checked)}
                style={S.checkbox}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Initialiser la nouvelle base (seed)</div>
                <div style={{ fontSize: 12, color: '#92400e' }}>
                  Cree les tables/collections, permissions, roles et categories dans la nouvelle base.
                  Recommande si vous changez vers une base vide.
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            style={S.btn('secondary')}
            onClick={handleTestDb}
            disabled={dbTesting || (!isSqlite && !dbForm.name)}
          >
            {dbTesting ? 'Test en cours...' : 'Tester la connexion'}
          </button>
          <button
            style={S.btn('primary')}
            onClick={handleApplyDb}
            disabled={dbSaving || seeding || (!isSqlite && !dbForm.name) || (dbTestResult !== null && !dbTestResult.ok)}
          >
            {seeding ? 'Seed en cours...' : dbSaving ? 'Application...' : 'Appliquer'}
          </button>
        </div>
      </div>
    </div>
  )
}
