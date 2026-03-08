// @mostajs/setup — API Route factory for JAR file upload/list/delete
// Delegates to @mostajs/orm jar-upload module
// Author: Dr Hamid MADANI drmdh@msn.com

/**
 * Creates handlers for JAR file management API.
 *
 * GET  — list uploaded JARs and JDBC dialect status
 * POST — upload a new JAR file (multipart/form-data)
 * DELETE — remove a JAR file
 */
export function createUploadJarHandlers() {
  async function GET() {
    try {
      const { listJarFiles, getJdbcDialectStatus } = await import('@mostajs/orm')

      // Scan active bridges: BridgeManager bridges + PID files + port probing
      const bridges: { port: number; pid: number; status: string; jdbcUrl?: string }[] = []

      // 1. Check BridgeManager known bridges
      try {
        const { BridgeManager } = await import('@mostajs/orm')
        const manager = BridgeManager.getInstance()
        for (const b of manager.list()) {
          bridges.push({ port: b.port, pid: b.pid, status: 'active', jdbcUrl: b.jdbcUrl })
        }
      } catch { /* ignore */ }

      // 2. Scan PID files for orphan bridges
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
            // Skip if already known from BridgeManager
            if (bridges.some(b => b.port === port)) continue
            const pidStr = readFileSync(join(jarDir, file), 'utf-8').trim()
            const pid = parseInt(pidStr)
            if (isNaN(pid)) continue
            // Check if process is alive
            let alive = false
            try { process.kill(pid, 0); alive = true } catch { /* dead */ }
            if (alive) {
              // Probe health
              let jdbcUrl: string | undefined
              try {
                const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1000) })
                if (res.ok) {
                  const h = await res.json() as { jdbcUrl?: string }
                  jdbcUrl = h.jdbcUrl
                }
              } catch { /* not responding */ }
              bridges.push({ port, pid, status: jdbcUrl ? 'active' : 'orphan', jdbcUrl })
            }
          }
        }
      } catch { /* ignore */ }

      // 3. Probe common bridge ports for unknown bridges (no PID file)
      const basePort = parseInt(process.env.MOSTA_BRIDGE_PORT_BASE || '8765')
      for (let port = basePort; port < basePort + 5; port++) {
        if (bridges.some(b => b.port === port)) continue
        try {
          const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(500) })
          if (res.ok) {
            const h = await res.json() as { jdbcUrl?: string }
            bridges.push({ port, pid: 0, status: 'active', jdbcUrl: h.jdbcUrl })
          }
        } catch { /* not a bridge */ }
      }

      return Response.json({
        ok: true,
        jars: listJarFiles(),
        dialects: getJdbcDialectStatus(),
        bridges,
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
   * PATCH — Start or stop the JDBC bridge.
   * Start: { action: 'start', dialect: string, host: string, port: number, name: string, user?: string, password?: string }
   * Stop:  { action: 'stop', port: number }
   * Returns: { ok: true, port: number } or { ok: false, error: string }
   */
  async function PATCH(req: Request) {
    try {
      const body = await req.json()
      const { action } = body

      if (action === 'stop') {
        const bridgePort = body.port || 8765
        const bridgePid = body.pid || 0
        try {
          // 1. Try BridgeManager
          const { BridgeManager } = await import('@mostajs/orm')
          const manager = BridgeManager.getInstance()
          const bridges = manager.list()
          const bridge = bridges.find((b: { port: number }) => b.port === bridgePort)
          if (bridge) {
            await manager.stop(bridge.key)
          }

          // 2. Kill by PID if provided
          if (bridgePid > 0) {
            try { process.kill(bridgePid, 'SIGKILL') } catch { /* already dead */ }
          }

          // 3. Fallback: kill process on port
          const { execSync } = await import('child_process')
          try {
            execSync(`fuser -k ${bridgePort}/tcp 2>/dev/null`, { stdio: 'ignore' })
          } catch { /* port may already be free */ }

          // 4. Clean PID file
          try {
            const { existsSync, unlinkSync } = await import('fs')
            const { join } = await import('path')
            const pidFile = join(process.env.MOSTA_JAR_DIR || join(process.cwd(), 'jar_files'), `.bridge-${bridgePort}.pid`)
            if (existsSync(pidFile)) unlinkSync(pidFile)
          } catch { /* non-critical */ }

          return Response.json({ ok: true, message: `Bridge arrete (port ${bridgePort})` })
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erreur'
          return Response.json({ ok: false, error: msg })
        }
      }

      // Default: action === 'start'
      const { dialect, host, port, name, user, password } = body

      if (!dialect) {
        return Response.json({ ok: false, error: 'dialect requis' }, { status: 400 })
      }

      // Compose URI using setup's composeDbUri for consistency with test-db
      const { composeDbUri } = await import('../lib/compose-uri')
      const uri = composeDbUri(dialect, {
        host: host || 'localhost',
        port: port || 0,
        name: name || '',
        user: user || '',
        password: password || '',
      })

      // Start bridge via BridgeManager directly (no SELECT 1 — just start the Java process)
      const { BridgeManager } = await import('@mostajs/orm')
      const { JdbcNormalizer } = await import('@mostajs/orm')
      const manager = BridgeManager.getInstance()

      // Check if JAR is available
      if (!JdbcNormalizer.isAvailable(dialect)) {
        return Response.json({
          ok: false,
          error: `Aucun JAR JDBC trouve pour ${dialect}. Uploadez le JAR d'abord.`,
        })
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
