// ── Preload — Electron IPC Bridge ─────────────────────────────────────────────
//
// This is the ONLY sanctioned entry point for the renderer process to communicate
// with the Electron main process. contextBridge.exposeInMainWorld('api', api) makes
// the api object available as window.api in the renderer (and only there — context
// isolation prevents direct Node/Electron access from renderer code).
//
// The contract is asymmetric by design:
//   Renderer → Main:  fire-and-forget via ipcRenderer.send('tc:...')
//                     No return value. State changes are reflected in the next broadcast.
//   Main → Renderer:  push via ipcRenderer.on('channel', callback)
//                     Renderer subscribes with on*/off* helpers and receives payloads.
//
// IPC channel names here must exactly match the ipcMain.on('tc:...') handlers in
// src/main/index.ts. There is no runtime validation of this mapping.
//
// Type safety: index.d.ts declares the TacticalMeleeAPI interface consumed by renderer
// TypeScript. Both files must be updated together when channels are added or removed.
//
// The Group HUD does NOT use this preload — it has no preload script by design and
// communicates exclusively via WebSocket (lanServer.ts port 3001).

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { TCStatePayload } from '../shared/types'
import type { BattleLedgerPayload } from '../shared/battleTypes'

const api = {
  // ── TC controls ──────────────────────────────────────────────────────────
  startCombat: (): void => ipcRenderer.send('tc:start-combat'),
  gmRelease:   (): void => ipcRenderer.send('tc:gm-release'),
  pass:        (): void => ipcRenderer.send('tc:pass'),
  pause:       (): void => ipcRenderer.send('tc:pause'),
  resume:      (): void => ipcRenderer.send('tc:resume'),
  nextRound:    (): void => ipcRenderer.send('tc:next-round'),
  launchHUD:    (): void => ipcRenderer.send('tc:launch-hud'),
  stageReset:   (): void => ipcRenderer.send('tc:stage-reset'),
  tierReset:    (): void => ipcRenderer.send('tc:tier-reset'),
  roundReset:   (): void => ipcRenderer.send('tc:round-reset'),
  endBattle:    (): void => ipcRenderer.send('tc:end-battle'),
  resetBattle:  (): void => ipcRenderer.send('tc:reset'),

  // ── Dev log bridge (main process → DevTools console) ─────────────────────
  onDevLog: (callback: (message: string) => void): void => {
    ipcRenderer.on('tm:dev-log', (_, message: string) => callback(message))
  },

  // ── GM Alert (critical errors that could block the game) ──────────────────
  onGmAlert: (callback: (message: string) => void): void => {
    ipcRenderer.on('tm:gm-alert', (_, message: string) => callback(message))
  },

  // ── State subscription ────────────────────────────────────────────────────
  onStateUpdate: (callback: (state: TCStatePayload) => void): void => {
    ipcRenderer.removeAllListeners('tc:state-update')
    ipcRenderer.on('tc:state-update', (_, payload: TCStatePayload) => callback(payload))
  },
  offStateUpdate: (): void => {
    ipcRenderer.removeAllListeners('tc:state-update')
  },

  // ── Battle Ledger subscription ────────────────────────────────────────────
  onLedgerUpdate: (callback: (ledger: BattleLedgerPayload) => void): void => {
    ipcRenderer.on('ledger:update', (_, payload: BattleLedgerPayload) => callback(payload))
  },
  offLedgerUpdate: (): void => {
    ipcRenderer.removeAllListeners('ledger:update')
  },

  // ── Battle end notification ───────────────────────────────────────────────
  // Fired once when the machine enters battleEnded. Used to auto-open the Battle Log.
  onBattleEnd: (callback: () => void): void => {
    ipcRenderer.on('tc:battle-ended', () => callback())
  },
  offBattleEnd: (): void => {
    ipcRenderer.removeAllListeners('tc:battle-ended')
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
