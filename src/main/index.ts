import { app, shell, BrowserWindow, session, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createActor } from 'xstate'
import { tcMachine } from './tc/tcMachine'
import { ActivePlugin } from './plugins/ActivePlugin'
import { createLanServer, LAN_PORT } from './server/lanServer'
import { StageRegistry } from './stages/registry'
import { logger } from './logger'
import type { TCStatePayload } from '../shared/types'

// ── Singletons ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let hudWindow:  BrowserWindow | null = null

const activePlugin = new ActivePlugin()
const tcActor     = createActor(tcMachine)
const lanServer   = createLanServer()

let tickInterval: ReturnType<typeof setInterval> | null = null

// Tracks previous subscription state to detect enter/exit/tick transitions
let prevMachineState: string | null = null
let prevStageIndex: number = -1

// ── Dev log bridge ───────────────────────────────────────────────────────────
// Forwards main-process log lines to the renderer DevTools console (dev only).
function devLog(message: string): void {
  if (is.dev) {
    mainWindow?.webContents.send('tm:dev-log', message)
  }
}

// ── Timer management ────────────────────────────────────────────────────────

function startTicker(): void {
  if (tickInterval) return
  tickInterval = setInterval(() => tcActor.send({ type: 'TICK' }), 1000)
}

function stopTicker(): void {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

// ── XState subscription ─────────────────────────────────────────────────────

tcActor.subscribe((snapshot) => {
  const state = String(snapshot.value)

  // Skip the transient checkAdvance state — it resolves immediately
  if (state === 'checkAdvance') return

  const { stages, currentStageIndex } = snapshot.context
  const currentStage = stages[currentStageIndex]

  // ── Stage Registry hook dispatch ─────────────────────────────────────────
  //
  // Detect lifecycle transitions by comparing against previous snapshot state.
  //
  // entering: just became stageActive, OR advanced to a new stage index
  // exiting:  was stageActive and is now leaving (state change or stage advance)
  // ticking:  staying in the same stageActive stage (a TICK just fired)

  const entering = state === 'stageActive' &&
    (prevMachineState !== 'stageActive' || prevStageIndex !== currentStageIndex)

  const exiting = prevMachineState === 'stageActive' &&
    (state !== 'stageActive' || prevStageIndex !== currentStageIndex)

  const ticking = state === 'stageActive' &&
    prevMachineState === 'stageActive' &&
    prevStageIndex === currentStageIndex

  if (exiting && prevStageIndex >= 0) {
    const prevStage = stages[prevStageIndex]
    if (prevStage) {
      const handler = StageRegistry[prevStage.type]
      if (handler) {
        devLog(`[Stage:${prevStage.type}] onExit — "${prevStage.name}" (round ${snapshot.context.round})`)
        handler.onExit(prevStage, snapshot.context)
      }
    }
  }

  if (entering && currentStage) {
    const handler = StageRegistry[currentStage.type]
    if (handler) {
      devLog(`[Stage:${currentStage.type}] onEnter — "${currentStage.name}" (round ${snapshot.context.round})`)
      handler.onEnter(currentStage, snapshot.context)
    }
  }

  if (ticking && currentStage) {
    const handler = StageRegistry[currentStage.type]
    if (handler) {
      devLog(`[Stage:${currentStage.type}] onTick — "${currentStage.name}" (round ${snapshot.context.round}, ${snapshot.context.timerSecondsRemaining}s remaining)`)
      handler.onTick(currentStage, snapshot.context)
    }
  }

  prevMachineState = state
  prevStageIndex   = currentStageIndex

  // ── Timer management ─────────────────────────────────────────────────────
  if (state === 'stageActive' && currentStage?.type === 'timed') {
    startTicker()
  } else {
    stopTicker()
  }

  // ── Broadcast ────────────────────────────────────────────────────────────
  const payload: TCStatePayload = {
    machineState:          state,
    round:                 snapshot.context.round,
    stages:                snapshot.context.stages,
    currentStageIndex:     snapshot.context.currentStageIndex,
    timerSecondsRemaining: snapshot.context.timerSecondsRemaining,
    beatsRemaining:        snapshot.context.beatsRemaining,
    totalBeats:            snapshot.context.totalBeats,
  }

  mainWindow?.webContents.send('tc:state-update', payload)
  lanServer.broadcast({ type: 'TC_STATE', payload })

  logger.debug(
    { machineState: state, round: snapshot.context.round, stageIndex: currentStageIndex },
    'TC state broadcast'
  )
})

tcActor.start()

// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.on('tc:start-combat', () => {
  const stages     = activePlugin.getStages()
  const beatsPerTC = activePlugin.getBeatsPerTC()
  tcActor.send({ type: 'START_COMBAT', stages, beatsPerTC })
})

ipcMain.on('tc:gm-release', () => tcActor.send({ type: 'GM_RELEASE' }))
ipcMain.on('tc:pass',       () => tcActor.send({ type: 'PASS' }))
ipcMain.on('tc:pause',      () => tcActor.send({ type: 'PAUSE' }))
ipcMain.on('tc:resume',     () => tcActor.send({ type: 'RESUME' }))
ipcMain.on('tc:next-round', () => tcActor.send({ type: 'NEXT_ROUND' }))
ipcMain.on('tc:end-battle', () => tcActor.send({ type: 'END_BATTLE' }))
ipcMain.on('tc:reset',      () => tcActor.send({ type: 'RESET' }))

ipcMain.on('tc:launch-hud', () => {
  if (hudWindow) {
    hudWindow.focus()
    return
  }

  hudWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: 'TacticalMelee — Group HUD',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/hud.html`)
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/hud.html'))
  }

  hudWindow.on('closed', () => {
    hudWindow = null
  })
})

// ── Window creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'TacticalMelee — GM Dashboard',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tacticalmelee.app')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = is.dev
      ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; font-src 'self' data:`
      : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopTicker()
  lanServer.close()
  if (process.platform !== 'darwin') app.quit()
})
