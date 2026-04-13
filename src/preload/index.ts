import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { TCStatePayload } from '../shared/types'

const api = {
  // ── TC controls ──────────────────────────────────────────────────────────
  startCombat: (): void => ipcRenderer.send('tc:start-combat'),
  gmRelease:   (): void => ipcRenderer.send('tc:gm-release'),
  pass:        (): void => ipcRenderer.send('tc:pass'),
  pause:       (): void => ipcRenderer.send('tc:pause'),
  resume:      (): void => ipcRenderer.send('tc:resume'),
  nextRound:    (): void => ipcRenderer.send('tc:next-round'),
  launchHUD:    (): void => ipcRenderer.send('tc:launch-hud'),
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
