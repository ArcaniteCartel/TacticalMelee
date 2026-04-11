/**
 * LAN Server
 *
 * HTTP + WebSocket server embedded in the Electron main process.
 * - WebSocket: broadcasts TC state to all connected clients (Group HUD, future Player HUDs)
 * - Caches the last broadcast so new connections receive current state immediately
 * - HTTP: serves static HUD assets in production (dev uses Vite dev server)
 *
 * All clients receive the same state — time is shared, no per-client state.
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
  let lastBroadcast: string | null = null  // cached for new connections

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`[LAN] Client connected (${clients.size} total)`)

    // Send current state immediately so the HUD never shows stale/idle data
    if (lastBroadcast) {
      ws.send(lastBroadcast)
    }

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
      lastBroadcast = message   // cache for late-connecting clients
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
