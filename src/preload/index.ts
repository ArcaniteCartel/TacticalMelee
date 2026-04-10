import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose a safe subset of Electron APIs to the renderer process.
// Extend this as IPC channels are added between main and renderer.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', {})
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = {}
}
