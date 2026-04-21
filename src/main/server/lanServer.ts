/**
 * LAN Server
 *
 * HTTP + WebSocket server embedded in the Electron main process.
 * Serves the Group HUD (and future Player HUDs) over the local network.
 *
 * ── WebSocket ─────────────────────────────────────────────────────────────────
 * Broadcasts WSMessage objects (TC_STATE and LEDGER_STATE) to all connected clients.
 * All clients receive identical broadcasts — there is no per-client state filtering.
 *
 * Message cache strategy (messageCache: Map<string, string>):
 *   The cache stores ONE message per message type (keyed by WSMessage.type).
 *   On new connection, all cached types are replayed immediately so the client
 *   receives the full current state rather than waiting for the next broadcast.
 *
 *   Why cache-one-per-type is sufficient (not a queue):
 *     Both TC_STATE and LEDGER_STATE are always complete state snapshots — never diffs.
 *     A client that misses N rapid broadcasts during a burst of TICKs is fully recovered
 *     by the N+1th broadcast, which contains the current complete state.
 *     Intermediate states do not need to be replayed; only the latest matters.
 *     The two-type cache (not one slot) ensures TC_STATE and LEDGER_STATE are never
 *     mutually overwritten — a client connecting mid-combat gets both.
 *
 *   Why readyState is checked before each send:
 *     The WebSocket spec allows a brief window between 'close' firing and the client
 *     being removed from the set. Checking readyState === OPEN prevents send() errors
 *     on already-closing sockets.
 *
 * ── HTTP ──────────────────────────────────────────────────────────────────────
 * In production: serves pre-built HUD static assets from the renderer output directory.
 * In dev: Vite dev server serves the HUD at its own URL; this HTTP layer is inactive.
 * /status endpoint: health check for LAN troubleshooting (returns { status, port }).
 */

import express from 'express'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export const LAN_PORT = 3001

export interface LanServer {
  broadcast: (data: unknown) => void
  close: () => void
}

export function createLanServer(): LanServer {
  const app = express()
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server })

  const clients = new Set<WebSocket>()
  // One cached message per message type so new connections receive the full
  // current state (TC_STATE + LEDGER_STATE) rather than only the last broadcast.
  const messageCache = new Map<string, string>()

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`[LAN] Client connected (${clients.size} total)`)

    // Replay all cached message types so the HUD never shows stale/idle data
    messageCache.forEach((message) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(message)
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[LAN] Client disconnected (${clients.size} remaining)`)
    })

    ws.on('error', (err) => {
      console.error('[LAN] WebSocket error:', err)
      clients.delete(ws)
    })
  })

  // Serve built HUD assets in production
  if (!is.dev) {
    app.use('/hud', express.static(join(__dirname, '../../renderer')))
  }

  app.get('/status', (_, res) => res.json({ status: 'ok', port: LAN_PORT }))

  server.listen(LAN_PORT, () => {
    console.log(`[LAN] Server running on port ${LAN_PORT}`)
  })

  return {
    broadcast(data: unknown): void {
      const message = JSON.stringify(data)
      // Cache by message type so each type has one current entry
      const type = (data as { type?: string }).type
      if (type) messageCache.set(type, message)
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message)
        }
      })
    },
    close(): void {
      server.close()
    },
  }
}
