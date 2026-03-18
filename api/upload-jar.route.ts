// @mostajs/setup — API Route factory for JAR file upload/list/delete
// Delegates to @mostajs/orm jar-upload module
// Author: Dr Hamid MADANI drmdh@msn.com

/**
 * Check if a TCP port is open (non-HTTP — raw socket connect).
 */
async function isPortOpen(port: number, host = 'localhost', timeoutMs = 800): Promise<boolean> {
  const net = await import('net')
  return new Promise(resolve => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => { socket.destroy(); resolve(false) })
    socket.connect(port, host)
  })
}

/**
 * Get PID of process listening on a port via fuser.
 */
async function getPidOnPort(port: number): Promise<number> {
  try {
    const { execSync } = await import('child_process')
    const out = execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: 'utf-8' }).trim()
    const pid = parseInt(out)
    return isNaN(pid) ? 0 : pid
  } catch {
    return 0
  }
}

/**
 * Creates handlers for JAR file management API.
 *
 * GET  — list uploaded JARs, JDBC dialect status, active bridges, HSQLDB server status
 * POST — upload a new JAR file (multipart/form-data)
 * DELETE — remove a JAR file
 * PATCH — start/stop HSQLDB server and JDBC bridge
 */
export function createUploadJarHandlers() {
  async function GET() {
    try {
      const { listJarFiles, getJdbcDialectStatus } = await import('@mostajs/orm')

      // Scan active bridges
      const bridges: { port: number; pid: number; status: string; jdbcUrl?: string }[] = []

      // 1. BridgeManager known bridges
      try {
        const { BridgeManager } = await import('@mostajs/orm')
        const manager = BridgeManager.getInstance()
        for (const b of manager.list()) {
          bridges.push({ port: b.port, pid: b.pid, status: 'active', jdbcUrl: b.jdbcUrl })
        }
      } catch { /* ignore */ }

      // 2. PID files for orphan bridges
      try {
        const { existsSync, readdirSync, readFileSync } = await import('fs')
        const { join } = await import('path')
        const jarDir = process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files')
        if (existsSync(jarDir)) {
          const pidFiles = readdirSync(jarDir).filter((f: string) => f.startsWith('.bridge-') && f.endsWith('.pid'))
          for (const file of pidFiles) {
            const portMatch = file.match(/\.bridge-(\d+)\.pid/)
            if (!portMatch) continue
            const port = parseInt(portMatch[1])
            if (bridges.some(b => b.port === port)) continue
            const pidStr = readFileSync(join(jarDir, file), 'utf-8').trim()
            const pid = parseInt(pidStr)
            if (isNaN(pid)) continue
            let alive = false
            try { process.kill(pid, 0); alive = true } catch { /* dead */ }
            if (alive) {
              let jdbcUrl: string | undefined
              try {
                const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1000) })
                if (res.ok) { jdbcUrl = ((await res.json()) as { jdbcUrl?: string }).jdbcUrl }
              } catch { /* not responding */ }
              bridges.push({ port, pid, status: jdbcUrl ? 'active' : 'orphan', jdbcUrl })
            } else {
              // Clean stale PID file
              try { (await import('fs')).unlinkSync(join(jarDir, file)) } catch { /* ignore */ }
            }
          }
        }
      } catch { /* ignore */ }

      // 3. Probe common bridge ports (HTTP — bridges speak HTTP)
      const basePort = parseInt(process.env.MOSTA_BRIDGE_PORT_BASE || '8765')
      for (let port = basePort; port < basePort + 5; port++) {
        if (bridges.some(b => b.port === port)) continue
        try {
          const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(500) })
          if (res.ok) {
            const h = (await res.json()) as { jdbcUrl?: string }
            const pid = await getPidOnPort(port)
            bridges.push({ port, pid, status: 'active', jdbcUrl: h.jdbcUrl })
          }
        } catch { /* not a bridge */ }
      }

      // Check HSQLDB server status (TCP probe, NOT HTTP)
      let hsqldbServer: { running: boolean; port: number; pid: number } | null = null
      try {
        const { existsSync, readdirSync, readFileSync } = await import('fs')
        const { join } = await import('path')
        const jarDir = process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files')

        // Check PID files first
        if (existsSync(jarDir)) {
          const serverPidFiles = readdirSync(jarDir).filter((f: string) => f.startsWith('.hsqldb-server-') && f.endsWith('.pid'))
          for (const file of serverPidFiles) {
            const portMatch = file.match(/\.hsqldb-server-(\d+)\.pid/)
            if (!portMatch) continue
            const port = parseInt(portMatch[1])
            const pidStr = readFileSync(join(jarDir, file), 'utf-8').trim()
            const pid = parseInt(pidStr)
            let alive = false
            if (pid > 0) { try { process.kill(pid, 0); alive = true } catch { /* dead */ } }
            if (alive) {
              hsqldbServer = { running: true, port, pid }
            } else {
              try { (await import('fs')).unlinkSync(join(jarDir, file)) } catch { /* ignore */ }
            }
          }
        }

        // Fallback: check port 9001 via TCP
        if (!hsqldbServer) {
          const open = await isPortOpen(9001)
          if (open) {
            const pid = await getPidOnPort(9001)
            hsqldbServer = { running: true, port: 9001, pid }
          }
        }
      } catch { /* ignore */ }

      return Response.json({
        ok: true,
        jars: listJarFiles(),
        dialects: getJdbcDialectStatus(),
        bridges,
        hsqldbServer,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur serveur'
      return Response.json({ ok: false, error: message }, { status: 500 })
    }
  }

  async function POST(req: Request) {
    try {
      const { saveJarFile } = await import('@mostajs/orm')

      const formData = await req.formData()
      const file = formData.get('jar') as File | null

      if (!file) {
        return Response.json(
          { ok: false, error: 'Aucun fichier JAR fourni. Utilisez le champ "jar".' },
          { status: 400 },
        )
      }

      if (!file.name.endsWith('.jar')) {
        return Response.json(
          { ok: false, error: 'Le fichier doit etre un .jar' },
          { status: 400 },
        )
      }

      // Max 50MB
      if (file.size > 50 * 1024 * 1024) {
        return Response.json(
          { ok: false, error: 'Le fichier JAR depasse la limite de 50 MB' },
          { status: 400 },
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const result = saveJarFile(file.name, buffer)

      if (!result.ok) {
        return Response.json(result, { status: 400 })
      }

      return Response.json(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur serveur'
      return Response.json({ ok: false, error: message }, { status: 500 })
    }
  }

  async function DELETE(req: Request) {
    try {
      const { deleteJarFile } = await import('@mostajs/orm')
      const { fileName } = await req.json()

      if (!fileName) {
        return Response.json(
          { ok: false, error: 'fileName requis' },
          { status: 400 },
        )
      }

      const result = deleteJarFile(fileName)
      if (!result.ok) {
        return Response.json(result, { status: 404 })
      }

      return Response.json(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur serveur'
      return Response.json({ ok: false, error: message }, { status: 500 })
    }
  }

  /**
   * PATCH — Manage JDBC bridge and HSQLDB server.
   * start-server: { action: 'start-server', dialect, name, host?, port? }
   * stop-server:  { action: 'stop-server', port? }
   * start:        { action: 'start', dialect, host, port, name, user?, password? }
   * stop:         { action: 'stop', port, pid? }
   */
  async function PATCH(req: Request) {
    try {
      const body = await req.json()
      const { action } = body

      // ── Start HSQLDB server ──
      if (action === 'start-server') {
        const { dialect, name, host, port: sgbdPort } = body
        if (dialect !== 'hsqldb') {
          return Response.json({ ok: false, error: 'start-server supporte uniquement hsqldb' }, { status: 400 })
        }
        const actualPort = sgbdPort || 9001

        // Check if already running (TCP probe, not HTTP)
        if (await isPortOpen(actualPort, host || 'localhost')) {
          const pid = await getPidOnPort(actualPort)
          return Response.json({ ok: true, message: `Serveur HSQLDB deja en marche sur le port ${actualPort}`, port: actualPort, pid, alreadyRunning: true })
        }

        // Find JAR
        const { JdbcNormalizer } = await import('@mostajs/orm')
        const jarPath = JdbcNormalizer.findJar('hsqldb')
        if (!jarPath) {
          return Response.json({ ok: false, error: 'JAR HSQLDB non trouve. Uploadez hsqldb*.jar d\'abord.' })
        }

        // Launch server
        const { spawn: spawnChild } = await import('child_process')
        const { join } = await import('path')
        const { writeFileSync, existsSync, mkdirSync } = await import('fs')
        const dataDir = join(process.cwd(), 'data')
        if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

        const dbAlias = name || 'mydb'
        const serverProc = spawnChild('java', [
          '-cp', jarPath,
          'org.hsqldb.server.Server',
          '--database.0', `file:${join(dataDir, dbAlias)}`,
          '--dbname.0', dbAlias,
          '--port', String(actualPort),
        ], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        })

        serverProc.unref()
        const serverPid = serverProc.pid || 0

        // Save PID file
        const jarDir = process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files')
        if (existsSync(jarDir)) {
          writeFileSync(join(jarDir, `.hsqldb-server-${actualPort}.pid`), String(serverPid))
        }

        // Log stderr
        serverProc.stderr?.on('data', (data: Buffer) => {
          const msg = data.toString().trim()
          if (msg) console.error(`[HSQLDB:server] ${msg}`)
        })

        // Wait for server to be ready (TCP probe)
        let serverReady = false
        for (let i = 0; i < 16; i++) {
          await new Promise(r => setTimeout(r, 500))
          if (await isPortOpen(actualPort, host || 'localhost')) {
            serverReady = true
            break
          }
          // Also check process is still alive
          try { process.kill(serverPid, 0) } catch { break /* process died */ }
        }

        if (!serverReady) {
          return Response.json({ ok: false, error: 'Le serveur HSQLDB n\'a pas demarre dans le delai imparti' })
        }

        return Response.json({ ok: true, port: actualPort, pid: serverPid, message: `Serveur HSQLDB lance (port ${actualPort}, PID ${serverPid}, alias: ${dbAlias})` })
      }

      // ── Stop HSQLDB server ──
      if (action === 'stop-server') {
        const sgbdPort = body.port || 9001
        try {
          const { execSync } = await import('child_process')
          const { existsSync, unlinkSync, readFileSync } = await import('fs')
          const { join } = await import('path')
          const jarDir = process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files')

          // Kill by PID file
          const pidFile = join(jarDir, `.hsqldb-server-${sgbdPort}.pid`)
          if (existsSync(pidFile)) {
            const pid = parseInt(readFileSync(pidFile, 'utf-8').trim())
            if (pid > 0) {
              try { process.kill(pid, 'SIGKILL') } catch { /* dead */ }
            }
            unlinkSync(pidFile)
          }

          // Also kill anything on the port
          try {
            execSync(`fuser -k ${sgbdPort}/tcp 2>/dev/null`, { stdio: 'ignore' })
          } catch { /* already free */ }

          return Response.json({ ok: true, message: `Serveur HSQLDB arrete (port ${sgbdPort})` })
        } catch (err: unknown) {
          return Response.json({ ok: false, error: err instanceof Error ? err.message : 'Erreur' })
        }
      }

      // ── Stop bridge ──
      if (action === 'stop') {
        const bridgePort = body.port || 8765
        const bridgePid = body.pid || 0
        try {
          // 1. Try BridgeManager
          try {
            const { BridgeManager } = await import('@mostajs/orm')
            const manager = BridgeManager.getInstance()
            const bridge = manager.list().find((b: { port: number }) => b.port === bridgePort)
            if (bridge) await manager.stop(bridge.key)
          } catch { /* ignore */ }

          // 2. Kill by PID
          if (bridgePid > 0) {
            try { process.kill(bridgePid, 'SIGKILL') } catch { /* dead */ }
          }

          // 3. Fallback: fuser
          try {
            const { execSync } = await import('child_process')
            execSync(`fuser -k ${bridgePort}/tcp 2>/dev/null`, { stdio: 'ignore' })
          } catch { /* already free */ }

          // 4. Clean PID file
          try {
            const { existsSync, unlinkSync } = await import('fs')
            const { join } = await import('path')
            const pidFile = join(process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files'), `.bridge-${bridgePort}.pid`)
            if (existsSync(pidFile)) unlinkSync(pidFile)
          } catch { /* non-critical */ }

          return Response.json({ ok: true, message: `Bridge arrete (port ${bridgePort})` })
        } catch (err: unknown) {
          return Response.json({ ok: false, error: err instanceof Error ? err.message : 'Erreur' })
        }
      }

      // ── Start bridge ──
      const { dialect, host, port, name, user, password } = body

      if (!dialect) {
        return Response.json({ ok: false, error: 'dialect requis' }, { status: 400 })
      }

      const { composeDbUri } = await import('../lib/compose-uri.js')
      const uri = composeDbUri(dialect, {
        host: host || 'localhost',
        port: port || 0,
        name: name || '',
        user: user || '',
        password: password || '',
      })

      const { BridgeManager } = await import('@mostajs/orm')
      const { JdbcNormalizer } = await import('@mostajs/orm')
      const manager = BridgeManager.getInstance()

      if (!JdbcNormalizer.isAvailable(dialect)) {
        return Response.json({
          ok: false,
          error: `Aucun JAR JDBC trouve pour ${dialect}. Uploadez le JAR d'abord.`,
        })
      }

      // For dialects that require a running server, check reachability first
      const SERVER_DIALECTS: Record<string, number> = {
        hsqldb: 9001, oracle: 1521, db2: 50000, mssql: 1433,
      }
      const defaultSgbdPort = SERVER_DIALECTS[dialect]
      if (defaultSgbdPort) {
        const sgbdPort = port || defaultSgbdPort
        const sgbdHost = host || 'localhost'
        const reachable = await isPortOpen(sgbdPort, sgbdHost, 2000)
        if (!reachable) {
          return Response.json({
            ok: false,
            error: `Serveur ${dialect.toUpperCase()} non accessible sur ${sgbdHost}:${sgbdPort}. Demarrez le serveur d'abord.`,
          })
        }
      }

      const bridge = await manager.getOrCreate(dialect, uri)
      return Response.json({ ok: true, port: bridge.port })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur serveur'
      return Response.json({ ok: false, error: message }, { status: 500 })
    }
  }

  return { GET, POST, DELETE, PATCH }
}
